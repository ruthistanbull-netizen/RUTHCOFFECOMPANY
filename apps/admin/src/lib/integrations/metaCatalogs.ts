import {
  MetaMarketingError,
  type MetaConnectionConfig,
} from "@/lib/integrations/metaMarketing";

const REQUEST_TIMEOUT_MS = 18_000;
const MAX_PAGES = 5;

export type MetaCatalogSource = "owned" | "shared" | "configured";

export type MetaCatalogSummary = {
  id: string;
  name: string;
  vertical: string | null;
  productCount: number | null;
  source: MetaCatalogSource;
  editable: boolean;
  configured: boolean;
};

export type MetaCatalogPermissionState = "granted" | "missing" | "unknown";

export type MetaCatalogListResult = {
  catalogs: MetaCatalogSummary[];
  permissions: {
    catalogManagement: MetaCatalogPermissionState;
    businessManagement: MetaCatalogPermissionState;
  };
  warnings: string[];
};

export type MetaCatalogDetail = MetaCatalogSummary & {
  feeds: Array<{ id: string; name: string }>;
  productSets: Array<{ id: string; name: string }>;
  sampleProducts: Array<{
    id: string;
    name: string;
    retailerId: string | null;
    availability: string | null;
    price: string | null;
    currency: string | null;
    imageUrl: string | null;
    url: string | null;
  }>;
  warnings: string[];
};

type GraphPage<T> = {
  data?: T[];
  paging?: { cursors?: { after?: string } };
};

type RawCatalog = {
  id?: unknown;
  name?: unknown;
  vertical?: unknown;
  product_count?: unknown;
};

type RawPermission = { permission?: unknown; status?: unknown };
type RawNamedAsset = { id?: unknown; name?: unknown };
type RawProduct = {
  id?: unknown;
  name?: unknown;
  retailer_id?: unknown;
  availability?: unknown;
  price?: unknown;
  currency?: unknown;
  image_url?: unknown;
  url?: unknown;
};

const ALLOWED_VERTICALS = new Set([
  "commerce",
  "hotels",
  "flights",
  "destinations",
  "home_listings",
  "vehicles",
]);

export async function listMetaCatalogs(config: MetaConnectionConfig): Promise<MetaCatalogListResult> {
  const warnings: string[] = [];

  const [owned, shared, permissions] = await Promise.all([
    listCatalogEdge(config, `/${config.businessId}/owned_product_catalogs`, "owned"),
    listCatalogEdge(config, `/${config.businessId}/client_product_catalogs`, "shared").catch((error) => {
      warnings.push(error instanceof MetaMarketingError
        ? `Paylaşılan kataloglar alınamadı: ${error.message}`
        : "Paylaşılan kataloglar alınamadı.");
      return [] as MetaCatalogSummary[];
    }),
    readPermissionStates(config).catch(() => ({
      catalogManagement: "unknown" as const,
      businessManagement: "unknown" as const,
    })),
  ]);

  const byId = new Map<string, MetaCatalogSummary>();
  for (const catalog of [...owned, ...shared]) byId.set(catalog.id, catalog);

  if (config.catalogId && !byId.has(config.catalogId)) {
    try {
      const configured = await getCatalogRecord(config, config.catalogId);
      byId.set(configured.id, {
        ...configured,
        source: "configured",
        editable: false,
        configured: true,
      });
    } catch (error) {
      warnings.push(error instanceof MetaMarketingError
        ? `ENV ile tanımlı katalog alınamadı: ${error.message}`
        : "ENV ile tanımlı katalog alınamadı.");
    }
  }

  const catalogs = [...byId.values()]
    .map((catalog) => ({ ...catalog, configured: catalog.id === config.catalogId || catalog.configured }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));

  if (permissions.catalogManagement === "missing") {
    warnings.push("catalog_management izni eksik; katalog oluşturma ve düzenleme işlemleri Meta tarafından reddedilir.");
  }
  if (permissions.businessManagement === "missing") {
    warnings.push("business_management izni eksik; işletme kataloglarına erişim sınırlı olabilir.");
  }

  return { catalogs, permissions, warnings };
}

export async function getMetaCatalogDetail(config: MetaConnectionConfig, catalogId: string): Promise<MetaCatalogDetail> {
  const id = numericId(catalogId);
  const [catalogs, base] = await Promise.all([
    listMetaCatalogs(config),
    getCatalogRecord(config, id),
  ]);
  const summary = catalogs.catalogs.find((item) => item.id === id) || {
    ...base,
    source: "configured" as const,
    editable: false,
    configured: id === config.catalogId,
  };

  const warnings = [...catalogs.warnings];
  const [feeds, productSets, sampleProducts] = await Promise.all([
    safeNamedAssets(config, `/${id}/product_feeds`, warnings, "Ürün akışları"),
    safeNamedAssets(config, `/${id}/product_sets`, warnings, "Ürün setleri"),
    safeProducts(config, id, warnings),
  ]);

  return { ...summary, feeds, productSets, sampleProducts, warnings };
}

export async function createMetaCatalog(
  config: MetaConnectionConfig,
  input: { name: string; vertical?: string },
): Promise<MetaCatalogSummary> {
  await assertCatalogManagement(config);
  const name = catalogName(input.name);
  const vertical = normalizeVertical(input.vertical || "commerce");
  const created = await graphRequest<{ id?: unknown }>(config, `/${config.businessId}/owned_product_catalogs`, {
    method: "POST",
    body: { name, vertical },
  });
  const id = stringValue(created.id);
  if (!id || !/^\d+$/.test(id)) {
    throw new MetaMarketingError({
      code: "META_CATALOG_CREATE_INVALID_RESPONSE",
      message: "Meta katalog oluşturdu ancak geçerli katalog kimliği döndürmedi.",
      status: 502,
      retryable: true,
    });
  }
  const record = await getCatalogRecord(config, id).catch(() => ({ id, name, vertical, productCount: 0 }));
  return { ...record, source: "owned", editable: true, configured: id === config.catalogId };
}

export async function updateMetaCatalog(
  config: MetaConnectionConfig,
  catalogId: string,
  input: { name: string },
): Promise<MetaCatalogSummary> {
  await assertCatalogManagement(config);
  const id = numericId(catalogId);
  const owned = await listCatalogEdge(config, `/${config.businessId}/owned_product_catalogs`, "owned");
  if (!owned.some((catalog) => catalog.id === id)) {
    throw new MetaMarketingError({
      code: "META_CATALOG_NOT_OWNED",
      message: "Bu katalog işletmeye ait değil; panelden düzenlenemez.",
      status: 403,
    });
  }

  const name = catalogName(input.name);
  await graphRequest<Record<string, unknown>>(config, `/${id}`, {
    method: "POST",
    body: { name },
  });

  const record = await getCatalogRecord(config, id).catch(() => {
    const existing = owned.find((catalog) => catalog.id === id)!;
    return { id, name, vertical: existing.vertical, productCount: existing.productCount };
  });
  return { ...record, source: "owned", editable: true, configured: id === config.catalogId };
}

async function listCatalogEdge(
  config: MetaConnectionConfig,
  path: string,
  source: "owned" | "shared",
): Promise<MetaCatalogSummary[]> {
  let rows: RawCatalog[];
  try {
    rows = await graphGetAll<RawCatalog>(config, path, {
      fields: "id,name,vertical,product_count",
      limit: "100",
    });
  } catch (error) {
    if (!(error instanceof MetaMarketingError)) throw error;
    rows = await graphGetAll<RawCatalog>(config, path, {
      fields: "id,name,vertical",
      limit: "100",
    });
  }

  return rows.map((row) => normalizeCatalog(row, source, config.catalogId)).filter(Boolean) as MetaCatalogSummary[];
}

async function getCatalogRecord(config: MetaConnectionConfig, catalogId: string) {
  const id = numericId(catalogId);
  let row: RawCatalog;
  try {
    row = await graphRequest<RawCatalog>(config, `/${id}`, {
      query: { fields: "id,name,vertical,product_count" },
    });
  } catch (error) {
    if (!(error instanceof MetaMarketingError)) throw error;
    row = await graphRequest<RawCatalog>(config, `/${id}`, {
      query: { fields: "id,name,vertical" },
    });
  }
  const normalized = normalizeCatalog(row, "configured", config.catalogId);
  if (!normalized) {
    throw new MetaMarketingError({
      code: "META_CATALOG_INVALID_RESPONSE",
      message: "Meta geçerli katalog bilgisi döndürmedi.",
      status: 502,
      retryable: true,
    });
  }
  return {
    id: normalized.id,
    name: normalized.name,
    vertical: normalized.vertical,
    productCount: normalized.productCount,
  };
}

async function readPermissionStates(config: MetaConnectionConfig) {
  const result = await graphRequest<GraphPage<RawPermission>>(config, "/me/permissions");
  const data = Array.isArray(result.data) ? result.data : [];
  const granted = data
    .filter((item) => stringValue(item.status) === "granted")
    .map((item) => stringValue(item.permission))
    .filter((item): item is string => Boolean(item));
  const state = (permission: string): MetaCatalogPermissionState => {
    if (granted.includes(permission)) return "granted";
    return data.length ? "missing" : "unknown";
  };
  return {
    catalogManagement: state("catalog_management"),
    businessManagement: state("business_management"),
  };
}

async function assertCatalogManagement(config: MetaConnectionConfig) {
  try {
    const permissions = await readPermissionStates(config);
    if (permissions.catalogManagement === "missing") {
      throw new MetaMarketingError({
        code: "META_CATALOG_PERMISSION_MISSING",
        message: "Meta system user tokenında catalog_management izni bulunmuyor.",
        status: 403,
      });
    }
    if (permissions.businessManagement === "missing") {
      throw new MetaMarketingError({
        code: "META_BUSINESS_PERMISSION_MISSING",
        message: "Meta system user tokenında business_management izni bulunmuyor.",
        status: 403,
      });
    }
  } catch (error) {
    if (error instanceof MetaMarketingError && error.code.endsWith("_MISSING")) throw error;
    // Permission endpoint can occasionally be unavailable while the actual asset
    // call still succeeds. In that case Meta remains the source of truth.
  }
}

async function safeNamedAssets(
  config: MetaConnectionConfig,
  path: string,
  warnings: string[],
  label: string,
) {
  try {
    const rows = await graphGetAll<RawNamedAsset>(config, path, { fields: "id,name", limit: "100" }, 2);
    return rows.map((row) => ({ id: stringValue(row.id) || "", name: stringValue(row.name) || "Adsız" })).filter((row) => row.id);
  } catch (error) {
    warnings.push(error instanceof MetaMarketingError ? `${label} alınamadı: ${error.message}` : `${label} alınamadı.`);
    return [];
  }
}

async function safeProducts(config: MetaConnectionConfig, catalogId: string, warnings: string[]) {
  let rows: RawProduct[] = [];
  try {
    rows = await graphGetAll<RawProduct>(config, `/${catalogId}/products`, {
      fields: "id,name,retailer_id,availability,price,currency,image_url,url",
      limit: "12",
    }, 1);
  } catch {
    try {
      rows = await graphGetAll<RawProduct>(config, `/${catalogId}/products`, {
        fields: "id,name,retailer_id",
        limit: "12",
      }, 1);
    } catch (error) {
      warnings.push(error instanceof MetaMarketingError ? `Örnek ürünler alınamadı: ${error.message}` : "Örnek ürünler alınamadı.");
      return [];
    }
  }

  return rows.map((row) => ({
    id: stringValue(row.id) || "",
    name: stringValue(row.name) || "Adsız ürün",
    retailerId: stringValue(row.retailer_id),
    availability: stringValue(row.availability),
    price: stringValue(row.price),
    currency: stringValue(row.currency),
    imageUrl: stringValue(row.image_url),
    url: stringValue(row.url),
  })).filter((row) => row.id);
}

async function graphGetAll<T>(
  config: MetaConnectionConfig,
  path: string,
  query: Record<string, string> = {},
  maxPages = MAX_PAGES,
): Promise<T[]> {
  const rows: T[] = [];
  let after = "";
  for (let page = 0; page < maxPages; page += 1) {
    const payload = await graphRequest<GraphPage<T>>(config, path, {
      query: { ...query, ...(after ? { after } : {}) },
    });
    if (Array.isArray(payload.data)) rows.push(...payload.data);
    const next = stringValue(payload.paging?.cursors?.after);
    if (!next || next === after || !payload.data?.length) break;
    after = next;
  }
  return rows;
}

async function graphRequest<T>(
  config: MetaConnectionConfig,
  path: string,
  options: {
    method?: "GET" | "POST";
    query?: Record<string, string>;
    body?: Record<string, string>;
  } = {},
): Promise<T> {
  const method = options.method || "GET";
  const url = new URL(`${config.graphOrigin}/${config.graphVersion}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(options.query || {})) if (value) url.searchParams.set(key, value);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const body = options.body ? new URLSearchParams(options.body) : undefined;
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.accessToken}`,
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" } : {}),
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw await providerError(response);
    const text = await response.text();
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new MetaMarketingError({
        code: "META_INVALID_JSON",
        message: "Meta geçerli JSON yanıtı döndürmedi.",
        status: 502,
        retryable: true,
      });
    }
  } catch (error) {
    if (error instanceof MetaMarketingError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MetaMarketingError({
        code: "META_TIMEOUT",
        message: "Meta katalog isteği zaman aşımına uğradı.",
        status: 504,
        retryable: true,
      });
    }
    throw new MetaMarketingError({
      code: "META_NETWORK_ERROR",
      message: "Meta katalog servisine bağlanılamadı.",
      status: 502,
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function providerError(response: Response) {
  let payload: { error?: { message?: unknown; code?: unknown; error_subcode?: unknown; is_transient?: unknown; fbtrace_id?: unknown } } = {};
  try {
    payload = await response.clone().json() as typeof payload;
  } catch {}
  const provider = payload.error;
  const providerCode = numberValue(provider?.code);
  const providerSubcode = numberValue(provider?.error_subcode);
  const transient = provider?.is_transient === true || response.status === 429 || response.status >= 500;
  const message = stringValue(provider?.message)?.slice(0, 500) || `Meta isteği ${response.status} durumuyla başarısız oldu.`;
  return new MetaMarketingError({
    code: "META_PROVIDER_ERROR",
    message,
    status: response.status === 401 || response.status === 403 ? 502 : response.status >= 500 ? 502 : 400,
    retryable: transient,
    providerCode,
    providerSubcode,
    traceId: stringValue(provider?.fbtrace_id) || undefined,
  });
}

function normalizeCatalog(row: RawCatalog, source: MetaCatalogSource, configuredId?: string): MetaCatalogSummary | null {
  const id = stringValue(row.id);
  if (!id || !/^\d+$/.test(id)) return null;
  return {
    id,
    name: stringValue(row.name) || `Katalog ${id}`,
    vertical: stringValue(row.vertical),
    productCount: nullableNumber(row.product_count),
    source,
    editable: source === "owned",
    configured: id === configuredId,
  };
}

function catalogName(value: unknown) {
  const name = stringValue(value)?.trim() || "";
  if (name.length < 2 || name.length > 100) {
    throw new MetaMarketingError({
      code: "META_CATALOG_INVALID_NAME",
      message: "Katalog adı 2 ile 100 karakter arasında olmalı.",
      status: 400,
    });
  }
  return name;
}

function normalizeVertical(value: unknown) {
  const vertical = (stringValue(value) || "commerce").toLowerCase();
  if (!ALLOWED_VERTICALS.has(vertical)) {
    throw new MetaMarketingError({
      code: "META_CATALOG_INVALID_VERTICAL",
      message: "Geçersiz Meta katalog türü.",
      status: 400,
    });
  }
  return vertical;
}

function numericId(value: unknown) {
  const id = stringValue(value) || "";
  if (!/^\d+$/.test(id)) {
    throw new MetaMarketingError({
      code: "META_CATALOG_INVALID_ID",
      message: "Katalog kimliği yalnız rakamlardan oluşmalı.",
      status: 400,
    });
  }
  return id;
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function numberValue(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
