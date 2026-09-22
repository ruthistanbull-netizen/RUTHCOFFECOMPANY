const DEFAULT_GRAPH_API_VERSION = "v25.0";
const DEFAULT_GRAPH_API_ORIGIN = "https://graph.facebook.com";
const REQUEST_TIMEOUT_MS = 15_000;

type PermissionState = "granted" | "missing" | "unknown";
type ProbeState = "connected" | "failed" | "not_configured";

export type MetaConnectionConfig = {
  accessToken: string;
  appId?: string;
  appSecretConfigured: boolean;
  adAccountId: string;
  businessId: string;
  pageId: string;
  pixelId: string;
  catalogId?: string;
  instagramActorId?: string;
  graphVersion: string;
  graphOrigin: string;
};

export type MetaProbe<T = Record<string, unknown>> = {
  state: ProbeState;
  data?: T;
  error?: {
    code: string;
    message: string;
    status: number;
    retryable: boolean;
    providerCode?: number;
    providerSubcode?: number;
    traceId?: string;
  };
};

export type MetaConnectionReport = {
  ok: boolean;
  checkedAt: string;
  graphVersion: string;
  configuration: {
    configured: boolean;
    missing: string[];
    appIdConfigured: boolean;
    appSecretConfigured: boolean;
    catalogConfigured: boolean;
    instagramConfigured: boolean;
  };
  permissions: {
    adsRead: PermissionState;
    adsManagement: PermissionState;
    businessManagement: PermissionState;
    catalogManagement: PermissionState;
    granted: string[];
  };
  resources: {
    systemUser: MetaProbe;
    adAccount: MetaProbe;
    campaignsRead: MetaProbe<{ sampleCount: number }>;
    business: MetaProbe;
    page: MetaProbe;
    instagram: MetaProbe;
    pixel: MetaProbe;
    catalog: MetaProbe;
  };
  readiness: {
    reporting: boolean;
    management: boolean;
    catalogAds: boolean;
  };
  warnings: string[];
};

type GraphErrorPayload = {
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
    error_subcode?: unknown;
    is_transient?: unknown;
    fbtrace_id?: unknown;
  };
};

export class MetaMarketingError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly providerCode?: number;
  readonly providerSubcode?: number;
  readonly traceId?: string;

  constructor(options: {
    code: string;
    message: string;
    status?: number;
    retryable?: boolean;
    providerCode?: number;
    providerSubcode?: number;
    traceId?: string;
  }) {
    super(options.message);
    this.name = "MetaMarketingError";
    this.code = options.code;
    this.status = options.status ?? 500;
    this.retryable = options.retryable ?? false;
    this.providerCode = options.providerCode;
    this.providerSubcode = options.providerSubcode;
    this.traceId = options.traceId;
  }
}

export function getMetaConnectionConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const required = {
    META_SYSTEM_USER_ACCESS_TOKEN: clean(env.META_SYSTEM_USER_ACCESS_TOKEN),
    META_AD_ACCOUNT_ID: clean(env.META_AD_ACCOUNT_ID),
    META_BUSINESS_ID: clean(env.META_BUSINESS_ID),
    META_PAGE_ID: clean(env.META_PAGE_ID),
    META_PIXEL_ID: clean(env.META_PIXEL_ID),
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    configured: missing.length === 0,
    missing,
    appIdConfigured: Boolean(clean(env.META_APP_ID)),
    appSecretConfigured: Boolean(clean(env.META_APP_SECRET)),
    catalogConfigured: Boolean(clean(env.META_CATALOG_ID)),
    instagramConfigured: Boolean(clean(env.META_INSTAGRAM_ACTOR_ID)),
    graphVersion: normalizeGraphVersion(clean(env.META_GRAPH_API_VERSION) || DEFAULT_GRAPH_API_VERSION),
  };
}

export function requireMetaConnectionConfig(env: NodeJS.ProcessEnv = process.env): MetaConnectionConfig {
  const configuration = getMetaConnectionConfiguration(env);
  if (!configuration.configured) {
    throw new MetaMarketingError({
      code: "META_NOT_CONFIGURED",
      message: `Meta yapılandırması eksik: ${configuration.missing.join(", ")}`,
      status: 503,
    });
  }

  return {
    accessToken: clean(env.META_SYSTEM_USER_ACCESS_TOKEN)!,
    appId: clean(env.META_APP_ID),
    appSecretConfigured: Boolean(clean(env.META_APP_SECRET)),
    adAccountId: normalizeAdAccountId(clean(env.META_AD_ACCOUNT_ID)!),
    businessId: normalizeNumericId(clean(env.META_BUSINESS_ID)!, "META_BUSINESS_ID"),
    pageId: normalizeNumericId(clean(env.META_PAGE_ID)!, "META_PAGE_ID"),
    pixelId: normalizeNumericId(clean(env.META_PIXEL_ID)!, "META_PIXEL_ID"),
    catalogId: optionalNumericId(clean(env.META_CATALOG_ID), "META_CATALOG_ID"),
    instagramActorId: optionalNumericId(clean(env.META_INSTAGRAM_ACTOR_ID), "META_INSTAGRAM_ACTOR_ID"),
    graphVersion: configuration.graphVersion,
    graphOrigin: (clean(env.META_GRAPH_API_ORIGIN) || DEFAULT_GRAPH_API_ORIGIN).replace(/\/+$/, ""),
  };
}

export async function inspectMetaMarketingConnection(options: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
} = {}): Promise<MetaConnectionReport> {
  const env = options.env ?? process.env;
  const configuration = getMetaConnectionConfiguration(env);
  const config = requireMetaConnectionConfig(env);
  const fetchImpl = options.fetchImpl ?? fetch;

  const [systemUser, permissionProbe, adAccount, campaignsRead, business, page, pixel, catalog, explicitInstagram] = await Promise.all([
    probe(() => graphGet<Record<string, unknown>>(config, "/me", { fields: "id,name" }, fetchImpl)),
    probe(() => graphGet<{ data?: Array<{ permission?: string; status?: string }> }>(config, "/me/permissions", {}, fetchImpl)),
    probe(() => graphGet<Record<string, unknown>>(
      config,
      `/${config.adAccountId}`,
      { fields: "id,name,account_status,currency,timezone_name,timezone_offset_hours_utc" },
      fetchImpl,
    )),
    probe(async () => {
      const result = await graphGet<{ data?: unknown[] }>(
        config,
        `/${config.adAccountId}/campaigns`,
        { fields: "id,name,status,effective_status", limit: "1" },
        fetchImpl,
      );
      return { sampleCount: Array.isArray(result.data) ? result.data.length : 0 };
    }),
    probe(() => graphGet<Record<string, unknown>>(config, `/${config.businessId}`, { fields: "id,name" }, fetchImpl)),
    probe(() => graphGet<Record<string, unknown>>(
      config,
      `/${config.pageId}`,
      { fields: "id,name,instagram_business_account{id,username,name}" },
      fetchImpl,
    )),
    probe(() => graphGet<Record<string, unknown>>(config, `/${config.pixelId}`, { fields: "id,name" }, fetchImpl)),
    config.catalogId
      ? probe(() => graphGet<Record<string, unknown>>(config, `/${config.catalogId}`, { fields: "id,name" }, fetchImpl))
      : Promise.resolve<MetaProbe>({ state: "not_configured" }),
    config.instagramActorId
      ? probe(() => graphGet<Record<string, unknown>>(
        config,
        `/${config.instagramActorId}`,
        { fields: "id,username,name" },
        fetchImpl,
      ))
      : Promise.resolve<MetaProbe>({ state: "not_configured" }),
  ]);

  const granted = extractGrantedPermissions(permissionProbe);
  const permissions = {
    adsRead: permissionState(granted, "ads_read", campaignsRead.state === "connected"),
    adsManagement: permissionState(granted, "ads_management"),
    businessManagement: permissionState(granted, "business_management"),
    catalogManagement: permissionState(granted, "catalog_management"),
    granted,
  } satisfies MetaConnectionReport["permissions"];

  const pageInstagram = page.state === "connected"
    ? asRecord(page.data?.instagram_business_account)
    : undefined;
  const instagram = explicitInstagram.state === "connected"
    ? explicitInstagram
    : pageInstagram
      ? { state: "connected", data: pageInstagram } satisfies MetaProbe
      : explicitInstagram.state === "failed"
        ? explicitInstagram
        : { state: "not_configured" } satisfies MetaProbe;

  const warnings: string[] = [];
  if (permissionProbe.state === "failed") warnings.push("Meta izin listesi okunamadı; yönetim yetkisi kesinleştirilemedi.");
  if (permissions.adsManagement !== "granted") warnings.push("ads_management izni doğrulanmadı; yazma işlemleri kapalı kalmalı.");
  if (instagram.state !== "connected") warnings.push("Facebook Sayfasına bağlı Instagram profesyonel hesabı doğrulanamadı.");
  if (catalog.state === "not_configured") warnings.push("Katalog kimliği tanımlı değil; dinamik katalog reklamları hazır değil.");
  if (catalog.state === "failed") warnings.push("Katalog erişimi doğrulanamadı.");

  const reporting = adAccount.state === "connected" && campaignsRead.state === "connected";
  const management = reporting
    && permissions.adsManagement === "granted"
    && business.state === "connected"
    && page.state === "connected";
  const catalogAds = management
    && catalog.state === "connected"
    && permissions.catalogManagement === "granted";

  return {
    ok: reporting && business.state === "connected" && page.state === "connected" && pixel.state === "connected",
    checkedAt: new Date().toISOString(),
    graphVersion: config.graphVersion,
    configuration: {
      configured: configuration.configured,
      missing: configuration.missing,
      appIdConfigured: configuration.appIdConfigured,
      appSecretConfigured: configuration.appSecretConfigured,
      catalogConfigured: configuration.catalogConfigured,
      instagramConfigured: configuration.instagramConfigured,
    },
    permissions,
    resources: {
      systemUser,
      adAccount,
      campaignsRead,
      business,
      page,
      instagram,
      pixel,
      catalog,
    },
    readiness: { reporting, management, catalogAds },
    warnings,
  };
}

async function graphGet<T>(
  config: MetaConnectionConfig,
  path: string,
  query: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<T> {
  const url = new URL(`${config.graphOrigin}/${config.graphVersion}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.accessToken}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw await providerError(response);
    }

    try {
      return await response.json() as T;
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
        message: "Meta bağlantı testi zaman aşımına uğradı.",
        status: 504,
        retryable: true,
      });
    }
    throw new MetaMarketingError({
      code: "META_NETWORK_ERROR",
      message: "Meta Marketing API bağlantısı kurulamadı.",
      status: 502,
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function providerError(response: Response): Promise<MetaMarketingError> {
  let payload: GraphErrorPayload = {};
  try {
    payload = await response.clone().json() as GraphErrorPayload;
  } catch {
    // Provider body is intentionally not surfaced because it may contain request context.
  }
  const provider = payload.error;
  const providerCode = numberValue(provider?.code);
  const providerSubcode = numberValue(provider?.error_subcode);
  const transient = provider?.is_transient === true || response.status === 429 || response.status >= 500;
  const message = typeof provider?.message === "string" && provider.message.trim()
    ? provider.message.trim().slice(0, 500)
    : `Meta isteği ${response.status} durumuyla başarısız oldu.`;

  return new MetaMarketingError({
    code: "META_PROVIDER_ERROR",
    message,
    status: response.status === 401 || response.status === 403 ? 502 : response.status >= 500 ? 502 : 400,
    retryable: transient,
    providerCode,
    providerSubcode,
    traceId: typeof provider?.fbtrace_id === "string" ? provider.fbtrace_id : undefined,
  });
}

async function probe<T>(operation: () => Promise<T>): Promise<MetaProbe<T>> {
  try {
    return { state: "connected", data: await operation() };
  } catch (error) {
    const normalized = error instanceof MetaMarketingError
      ? error
      : new MetaMarketingError({ code: "META_UNKNOWN_ERROR", message: "Meta bağlantı testi başarısız oldu.", status: 500 });
    return {
      state: "failed",
      error: {
        code: normalized.code,
        message: normalized.message,
        status: normalized.status,
        retryable: normalized.retryable,
        providerCode: normalized.providerCode,
        providerSubcode: normalized.providerSubcode,
        traceId: normalized.traceId,
      },
    };
  }
}

function extractGrantedPermissions(probeResult: MetaProbe<{ data?: Array<{ permission?: string; status?: string }> }>): string[] {
  if (probeResult.state !== "connected" || !Array.isArray(probeResult.data?.data)) return [];
  return probeResult.data.data
    .filter((item) => item?.status === "granted" && typeof item.permission === "string")
    .map((item) => item.permission as string)
    .sort();
}

function permissionState(granted: string[], permission: string, inferred = false): PermissionState {
  if (granted.includes(permission) || inferred) return "granted";
  return granted.length > 0 ? "missing" : "unknown";
}

function normalizeGraphVersion(value: string): string {
  if (!/^v\d+\.\d+$/.test(value)) {
    throw new MetaMarketingError({
      code: "META_INVALID_GRAPH_VERSION",
      message: "META_GRAPH_API_VERSION v25.0 biçiminde olmalı.",
      status: 503,
    });
  }
  return value;
}

function normalizeAdAccountId(value: string): string {
  if (!/^act_\d+$/.test(value)) {
    throw new MetaMarketingError({
      code: "META_INVALID_AD_ACCOUNT_ID",
      message: "META_AD_ACCOUNT_ID act_ ile başlayan reklam hesabı kimliği olmalı.",
      status: 503,
    });
  }
  return value;
}

function normalizeNumericId(value: string, key: string): string {
  if (!/^\d+$/.test(value)) {
    throw new MetaMarketingError({
      code: "META_INVALID_ASSET_ID",
      message: `${key} yalnız rakamlardan oluşmalı.`,
      status: 503,
    });
  }
  return value;
}

function optionalNumericId(value: string | undefined, key: string): string | undefined {
  return value ? normalizeNumericId(value, key) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
