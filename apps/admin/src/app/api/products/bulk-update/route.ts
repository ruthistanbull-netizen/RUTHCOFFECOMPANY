import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  applyProductBulkPricing,
  applyProductBulkRelation,
  applyProductBulkStock,
  stockStatusForCount,
  type ProductBulkPriceMode,
  type ProductBulkStockMode,
  type ProductBulkStockScope,
  type ProductStockStatus,
} from "@ruth-commerce/commerce-core";
import { requireAdmin } from "@/lib/auth";
import { resolveCatalogId } from "@/lib/catalogGroups";
import {
  captureProductRevision,
  productRevisionToPatch,
  syncProductRelationReadModel,
  type ProductRevisionSnapshot,
} from "@/lib/productRevision";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";
import { updateProductWithAuth } from "../route";

export const runtime = "nodejs";

const MAX_PRODUCTS = 260;
const MAX_SYNCHRONOUS_COMPLEX_PRODUCTS = 80;
const PRODUCT_BULK_JOB_TYPE = "products.bulk";
const IDEMPOTENCY_SCOPE = "admin.products.bulk";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const IDEMPOTENCY_STALE_MS = 10 * 60 * 1000;

const ALLOWED_FIELDS = new Set([
  "material",
  "finish_color",
  "size_usage",
  "care_advice",
  "stock_status",
  "status",
  "is_featured",
  "is_new",
]);
const PRICE_MODES = new Set<ProductBulkPriceMode>([
  "",
  "set",
  "increase_percent",
  "decrease_percent",
  "increase_amount",
  "decrease_amount",
]);
const STOCK_MODES = new Set<ProductBulkStockMode>(["", "set", "increase", "decrease"]);
const STOCK_SCOPES = new Set<ProductBulkStockScope>(["total", "each_variant"]);
const STOCK_STATUSES = new Set<ProductStockStatus>(["in_stock", "out_of_stock", "preorder"]);

type AuditCheckpoint = { id: string; entity_id: string };
type BulkProgress = {
  total: number;
  processed: number;
  percent: number;
  state: "queued" | "running" | "succeeded" | "failed";
};
type IdempotencyRow = {
  id: string;
  idempotency_key: string;
  request_hash: string;
  status: "processing" | "succeeded" | "failed";
  response_status: number | null;
  response_body: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  locked_at: string | null;
  updated_at: string | null;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function apiError(message: string, status = 400, details?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error: message, ...(details || {}) },
    { status, headers: noStoreHeaders() },
  );
}

function requestIdempotencyKey(request: Request, body: Record<string, unknown>) {
  return clean(
    request.headers.get("x-idempotency-key")
      || request.headers.get("idempotency-key")
      || request.headers.get("x-correlation-id")
      || body.idempotency_key,
  );
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["_job_id", "_actor_id", "_actor_name"].includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  );
}

function requestHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalValue(value))).digest("hex");
}

function normalizeChanges(value: unknown, legacyBody?: Record<string, unknown>) {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const result: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    const hasNested = Object.prototype.hasOwnProperty.call(input, field);
    const hasLegacy = legacyBody && Object.prototype.hasOwnProperty.call(legacyBody, field);
    if (!hasNested && !hasLegacy) continue;
    const rawValue = hasNested ? input[field] : legacyBody?.[field];
    if (field === "is_featured" || field === "is_new") {
      result[field] = rawValue === true || rawValue === "true";
      continue;
    }
    result[field] = rawValue === "" || rawValue === null ? null : clean(rawValue);
  }
  return result;
}

function internalProductRequest(request: Request, body: unknown) {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.set("x-ruth-skip-storefront-revalidate", "1");
  const url = new URL(request.url);
  url.pathname = "/api/products";
  return new Request(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

async function responseError(response: Response) {
  const data = await response.clone().json().catch(() => ({}));
  return clean((data as any)?.error) || `Ürün güncellenemedi (${response.status}).`;
}

async function resolveIds(supabase: any, table: "categories" | "collections", rawIds: unknown) {
  const ids = Array.isArray(rawIds) ? [...new Set(rawIds.map(clean).filter(Boolean))] : [];
  return (await Promise.all(ids.map((id) => resolveCatalogId(supabase, table, id))))
    .filter(Boolean) as string[];
}

function snapshotMaps(
  productRows: any[],
  imageRows: any[],
  variantRows: any[],
  categoryRows: any[],
  collectionRows: any[],
  capturedAt: string,
) {
  const images = new Map<string, any[]>();
  const variants = new Map<string, any[]>();
  const categories = new Map<string, string[]>();
  const collections = new Map<string, string[]>();
  for (const row of imageRows) {
    const id = clean(row.product_id);
    if (!images.has(id)) images.set(id, []);
    images.get(id)!.push(row);
  }
  for (const row of variantRows) {
    const id = clean(row.product_id);
    if (!variants.has(id)) variants.set(id, []);
    variants.get(id)!.push(row);
  }
  for (const row of categoryRows) {
    const id = clean(row.product_id);
    if (!categories.has(id)) categories.set(id, []);
    if (row.category_id) categories.get(id)!.push(clean(row.category_id));
  }
  for (const row of collectionRows) {
    const id = clean(row.product_id);
    if (!collections.has(id)) collections.set(id, []);
    if (row.collection_id) collections.get(id)!.push(clean(row.collection_id));
  }
  return new Map<string, ProductRevisionSnapshot>(
    productRows.map((product) => {
      const id = clean(product.id);
      return [id, {
        version: 1,
        captured_at: capturedAt,
        product,
        images: images.get(id) || [],
        variants: variants.get(id) || [],
        category_ids: categories.get(id) || [],
        collection_ids: collections.get(id) || [],
      }];
    }),
  );
}

function mutationMetadata(body: Record<string, any>, changes: Record<string, unknown>) {
  return {
    bulk_fields: Object.keys(changes),
    discount_action: clean(body.discount_action) || null,
    discount_percent: finite(body.discount_percent, 0) || null,
    price_mode: clean(body.price_mode) || null,
    stock_mode: clean(body.stock_mode) || null,
    category_action: clean(body.category_action) || null,
    collection_action: clean(body.collection_action) || null,
  };
}

function jobProgress(payload: any, status: string): BulkProgress {
  const total = Math.max(0, Math.trunc(finite(payload?.progress?.total ?? payload?.total, 0)));
  const processed = Math.max(0, Math.min(total, Math.trunc(finite(payload?.progress?.processed ?? payload?.cursor, 0))));
  const state = status === "succeeded"
    ? "succeeded"
    : status === "failed" || status === "dead_letter"
      ? "failed"
      : status === "running"
        ? "running"
        : "queued";
  return {
    total,
    processed,
    percent: total > 0 ? Math.round((processed / total) * 100) : state === "succeeded" ? 100 : 0,
    state,
  };
}

async function loadIdempotency(supabase: any, key: string): Promise<IdempotencyRow | null> {
  const { data, error } = await supabase
    .from("commerce_idempotency_keys")
    .select("id, idempotency_key, request_hash, status, response_status, response_body, error_code, error_message, locked_at, updated_at")
    .eq("scope", IDEMPOTENCY_SCOPE)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as IdempotencyRow | null;
}

function cachedIdempotencyResponse(row: IdempotencyRow) {
  const body = row.response_body && typeof row.response_body === "object"
    ? { ...row.response_body, idempotent: true }
    : { ok: true, idempotent: true, correlationId: row.idempotency_key };
  return NextResponse.json(body, {
    status: row.response_status || 200,
    headers: noStoreHeaders(),
  });
}

async function acquireIdempotency(
  supabase: any,
  key: string,
  hash: string,
): Promise<{ acquired: true } | { acquired: false; response: Response }> {
  const resolveExisting = async (row: IdempotencyRow) => {
    if (row.request_hash !== hash) {
      return {
        acquired: false as const,
        response: apiError("Aynı idempotency anahtarı farklı bir toplu işlem için kullanılamaz.", 409, {
          code: "IDEMPOTENCY_KEY_REUSED",
          correlationId: key,
        }),
      };
    }
    if (row.status === "succeeded") {
      return { acquired: false as const, response: cachedIdempotencyResponse(row) };
    }
    if (row.status === "processing") {
      const lockedAt = row.locked_at ? new Date(row.locked_at).getTime() : Date.now();
      const stale = !Number.isFinite(lockedAt) || Date.now() - lockedAt > IDEMPOTENCY_STALE_MS;
      if (stale) {
        await supabase
          .from("commerce_idempotency_keys")
          .update({
            status: "failed",
            error_code: "RECONCILIATION_REQUIRED",
            error_message: "Önceki toplu işlemin sonucu belirsiz kaldı. Aynı işlem otomatik tekrar uygulanmadı; uzlaştırma gerekli.",
            locked_at: null,
            expires_at: new Date(Date.now() + 30 * IDEMPOTENCY_TTL_MS).toISOString(),
          })
          .eq("id", row.id)
          .eq("status", "processing");
      }
      return {
        acquired: false as const,
        response: apiError(
          stale
            ? "Önceki toplu işlemin sonucu belirsiz kaldı. Aynı işlem otomatik tekrar uygulanmadı; uzlaştırma gerekli."
            : "Bu toplu işlem zaten çalışıyor. İkinci kez uygulanmadı.",
          409,
          {
            code: stale ? "IDEMPOTENCY_RECONCILIATION_REQUIRED" : "IDEMPOTENCY_IN_PROGRESS",
            correlationId: key,
            reconciliationRequired: stale,
          },
        ),
      };
    }
    if (row.error_code === "RECONCILIATION_REQUIRED") {
      return {
        acquired: false as const,
        response: apiError(
          row.error_message || "Önceki toplu işlem manuel uzlaştırma gerektiriyor.",
          409,
          { code: "RECONCILIATION_REQUIRED", correlationId: key, reconciliationRequired: true },
        ),
      };
    }
    const { error } = await supabase
      .from("commerce_idempotency_keys")
      .update({
        status: "processing",
        response_status: null,
        response_body: null,
        error_code: null,
        error_message: null,
        locked_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "failed");
    if (error) throw new Error(error.message);
    return { acquired: true as const };
  };

  const existing = await loadIdempotency(supabase, key);
  if (existing) return resolveExisting(existing);

  const { error } = await supabase.from("commerce_idempotency_keys").insert({
    scope: IDEMPOTENCY_SCOPE,
    idempotency_key: key,
    request_hash: hash,
    status: "processing",
    locked_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString(),
  });
  if (!error) return { acquired: true };
  if (String(error.code || "") !== "23505") throw new Error(error.message);
  const raced = await loadIdempotency(supabase, key);
  if (!raced) throw new Error("Idempotency kaydı yarış sonrası bulunamadı.");
  return resolveExisting(raced);
}

async function completeIdempotency(
  supabase: any,
  key: string,
  status: number,
  body: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("commerce_idempotency_keys")
    .update({
      status: "succeeded",
      response_status: status,
      response_body: body,
      error_code: null,
      error_message: null,
      locked_at: null,
    })
    .eq("scope", IDEMPOTENCY_SCOPE)
    .eq("idempotency_key", key);
  if (error) throw new Error(error.message);
}

async function failIdempotency(
  supabase: any,
  key: string,
  message: string,
  reconciliationRequired = false,
) {
  await supabase
    .from("commerce_idempotency_keys")
    .update({
      status: "failed",
      response_status: reconciliationRequired ? 500 : 409,
      response_body: null,
      error_code: reconciliationRequired ? "RECONCILIATION_REQUIRED" : "COMPENSATED_FAILURE",
      error_message: message,
      locked_at: null,
    })
    .eq("scope", IDEMPOTENCY_SCOPE)
    .eq("idempotency_key", key);
}

async function compensateProducts(
  request: Request,
  auth: any,
  snapshots: Map<string, ProductRevisionSnapshot>,
  productIds: string[],
) {
  const failures: Array<{ productId: string; error: string }> = [];
  for (const id of [...new Set(productIds)].reverse()) {
    const snapshot = snapshots.get(id);
    if (!snapshot) continue;
    const response = await updateProductWithAuth(
      internalProductRequest(request, productRevisionToPatch(snapshot)),
      auth,
    );
    if (!response?.ok) {
      failures.push({ productId: id, error: response ? await responseError(response) : "Geri alma yanıtı alınamadı." });
    } else {
      await syncProductRelationReadModel(auth.supabase, id).catch(() => undefined);
    }
  }
  return failures;
}

async function markAuditsCompensated(
  supabase: any,
  auditByProduct: Map<string, string>,
  productIds: string[],
  metadata: Record<string, unknown>,
  idempotencyKey: string,
  failedProductId?: string,
  compensationFailures: Array<{ productId: string; error: string }> = [],
) {
  for (const id of [...new Set(productIds)]) {
    const auditId = auditByProduct.get(id);
    if (!auditId) continue;
    await supabase.from("commerce_audit_logs").update({
      metadata: {
        snapshot_version: 1,
        source: "admin-products-bulk-update",
        state: compensationFailures.some((failure) => failure.productId === id) ? "compensation_failed" : "compensated",
        admin_action: true,
        idempotency_key: idempotencyKey,
        failed_product_id: failedProductId || null,
        ...metadata,
      },
    }).eq("id", auditId);
  }
}

async function finalizeAudit(
  supabase: any,
  auditId: string,
  productId: string,
  metadata: Record<string, unknown>,
  idempotencyKey: string,
  jobId: string | null,
) {
  await syncProductRelationReadModel(supabase, productId);
  const after = await captureProductRevision(supabase, productId);
  const { error } = await supabase.from("commerce_audit_logs").update({
    action: "catalog.product_updated",
    after_data: after,
    metadata: {
      snapshot_version: 1,
      source: "admin-products-bulk-update",
      state: "completed",
      admin_action: true,
      idempotency_key: idempotencyKey,
      background_job_id: jobId,
      ...metadata,
    },
  }).eq("id", auditId);
  if (error) throw new Error(error.message);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const jobId = clean(new URL(request.url).searchParams.get("jobId"));
  if (!jobId) return apiError("Toplu işlem job id yok.");
  const { data, error } = await auth.supabase
    .from("commerce_jobs")
    .select("id, job_type, status, attempts, max_attempts, payload, correlation_id, run_at, completed_at, last_error, created_at, updated_at")
    .eq("id", jobId)
    .eq("job_type", PRODUCT_BULK_JOB_TYPE)
    .maybeSingle();
  if (error) return apiError(`Toplu işlem durumu alınamadı: ${error.message}`, 400);
  if (!data) return apiError("Toplu işlem bulunamadı.", 404);
  return NextResponse.json({
    ok: true,
    jobId: data.id,
    status: data.status,
    progress: jobProgress(data.payload, data.status),
    attempts: data.attempts,
    maxAttempts: data.max_attempts,
    correlationId: data.correlation_id,
    lastError: data.last_error || null,
    runAt: data.run_at,
    completedAt: data.completed_at || null,
  }, { headers: noStoreHeaders() });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({})) as Record<string, any>;
  const rawIds: unknown[] = Array.isArray(body.ids) ? body.ids : [];
  const ids = [...new Set(rawIds.map(clean).filter(Boolean))].slice(0, MAX_PRODUCTS);
  if (!ids.length) return apiError("Toplu işlem için ürün seçilmedi.");

  const changes = normalizeChanges(body.changes, body);
  if ("status" in changes && !["active", "draft"].includes(String(changes.status || ""))) {
    return apiError("Toplu yayın durumu yalnızca Aktif veya Taslak olabilir.");
  }
  const requestedStockStatus = clean(changes.stock_status || body.stock_status) as ProductStockStatus | "";
  if (requestedStockStatus && !STOCK_STATUSES.has(requestedStockStatus)) return apiError("Geçersiz stok durumu.");

  const rawDiscountAction = clean(body.discount_action);
  const discountAction = rawDiscountAction === "remove" ? "remove" : "apply";
  const discountPercent = Math.max(0, Math.min(100, finite(body.discount_percent, 0)));
  const priceMode = clean(body.price_mode) as ProductBulkPriceMode;
  if (!PRICE_MODES.has(priceMode)) return apiError("Geçersiz toplu fiyat işlemi.");
  const priceValue = finite(body.price_value, 0);

  const stockMode = clean(body.stock_mode) as ProductBulkStockMode;
  if (!STOCK_MODES.has(stockMode)) return apiError("Geçersiz toplu stok işlemi.");
  const stockScope = (clean(body.stock_scope) || "total") as ProductBulkStockScope;
  if (!STOCK_SCOPES.has(stockScope)) return apiError("Geçersiz toplu stok kapsamı.");
  const stockValue = Math.max(0, Math.trunc(finite(body.stock_value, 0)));

  const categoryAction = clean(body.category_action) === "remove" ? "remove" : "add";
  const collectionAction = clean(body.collection_action) === "remove" ? "remove" : "add";
  const hasPricingMutation = rawDiscountAction === "remove" || discountPercent > 0 || Boolean(priceMode);
  const hasStockQuantityMutation = Boolean(stockMode);
  const hasStockStatusMutation = Boolean(requestedStockStatus);
  const hasCategoryMutation = Array.isArray(body.category_ids) && body.category_ids.length > 0;
  const hasCollectionMutation = Array.isArray(body.collection_ids) && body.collection_ids.length > 0;
  const hasMutation = Object.keys(changes).length > 0 || hasPricingMutation || hasStockQuantityMutation || hasCategoryMutation || hasCollectionMutation;
  if (!hasMutation) return apiError("Uygulanacak toplu işlem seçilmedi.");

  const requiresComplexMutation = hasPricingMutation || hasStockQuantityMutation || hasCategoryMutation || hasCollectionMutation;
  const { supabase } = auth;
  const suppliedIdempotencyKey = requestIdempotencyKey(request, body);
  const idempotencyKey = suppliedIdempotencyKey || crypto.randomUUID();
  const hash = requestHash({
    ids,
    changes,
    discount_action: rawDiscountAction || null,
    discount_percent: discountPercent,
    price_mode: priceMode || null,
    price_value: priceValue,
    stock_mode: stockMode || null,
    stock_scope: stockScope,
    stock_value: stockValue,
    category_action: categoryAction,
    category_ids: body.category_ids || [],
    collection_action: collectionAction,
    collection_ids: body.collection_ids || [],
  });

  let idempotency: Awaited<ReturnType<typeof acquireIdempotency>>;
  try {
    idempotency = await acquireIdempotency(supabase, idempotencyKey, hash);
  } catch (error) {
    return apiError(`Toplu işlem tekrar koruması hazırlanamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}`, 409);
  }
  if (!idempotency.acquired) return idempotency.response;

  if (requiresComplexMutation && ids.length > MAX_SYNCHRONOUS_COMPLEX_PRODUCTS && !auth.internal) {
    const { _job_id: _ignoredJobId, ...commandBody } = body;
    const command = { ...commandBody, ids, idempotency_key: idempotencyKey };
    const payload = {
      command,
      cursor: 0,
      total: ids.length,
      progress: { total: ids.length, processed: 0, percent: 0, state: "queued" },
      actor: {
        id: clean(auth.profile?.id || auth.user?.id) || null,
        name: auth.profile?.full_name || auth.profile?.email || auth.user?.email || "Ruth admin",
        email: auth.profile?.email || auth.user?.email || null,
      },
    };
    const { data: queuedJob, error: queueError } = await supabase
      .from("commerce_jobs")
      .insert({
        queue: "commerce",
        job_type: PRODUCT_BULK_JOB_TYPE,
        payload,
        status: "queued",
        priority: 70,
        attempts: 0,
        max_attempts: 20,
        run_at: new Date().toISOString(),
        correlation_id: idempotencyKey,
      })
      .select("id, status, correlation_id")
      .single();
    if (queueError || !queuedJob?.id) {
      const message = `Toplu işlem kuyruğa alınamadı: ${queueError?.message || "job oluşturulamadı"}`;
      await failIdempotency(supabase, idempotencyKey, message);
      return apiError(message, 500, { correlationId: idempotencyKey });
    }
    const queuedResponse = {
      ok: true,
      queued: true,
      jobId: queuedJob.id,
      status: queuedJob.status,
      progress: payload.progress,
      correlationId: queuedJob.correlation_id || idempotencyKey,
    };
    try {
      await completeIdempotency(supabase, idempotencyKey, 202, queuedResponse);
    } catch (error) {
      const { error: cancelError } = await supabase
        .from("commerce_jobs")
        .update({
          status: "cancelled",
          last_error: "Idempotency completion failed before queue response was committed.",
          locked_at: null,
          locked_by: null,
        })
        .eq("id", queuedJob.id)
        .eq("status", "queued");
      const reconciliationRequired = Boolean(cancelError);
      const message = `Job oluşturuldu fakat tekrar koruması tamamlanamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}`;
      await failIdempotency(supabase, idempotencyKey, message, reconciliationRequired);
      return apiError(message, 500, {
        correlationId: idempotencyKey,
        jobId: queuedJob.id,
        reconciliationRequired,
        jobCancelled: !cancelError,
      });
    }
    return NextResponse.json(queuedResponse, { status: 202, headers: noStoreHeaders() });
  }

  let categoryIds: string[] = [];
  let collectionIds: string[] = [];
  try {
    [categoryIds, collectionIds] = await Promise.all([
      resolveIds(supabase, "categories", body.category_ids),
      resolveIds(supabase, "collections", body.collection_ids),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kategori/koleksiyon çözülemedi.";
    await failIdempotency(supabase, idempotencyKey, message);
    return apiError(message);
  }

  const [productResult, imageResult, variantResult, categoryResult, collectionResult] = await Promise.all([
    supabase.from("products").select("*").in("id", ids),
    supabase.from("product_images").select("*").in("product_id", ids).order("sort_order", { ascending: true }),
    supabase.from("product_variants").select("*").in("product_id", ids).order("sort_order", { ascending: true }),
    supabase.from("product_categories").select("product_id, category_id").in("product_id", ids),
    supabase.from("product_collections").select("product_id, collection_id").in("product_id", ids),
  ]);
  const readError = [productResult.error, imageResult.error, variantResult.error, categoryResult.error, collectionResult.error].find(Boolean);
  if (readError) {
    const message = `Toplu işlem güvenlik kaydı hazırlanamadı: ${readError.message}`;
    await failIdempotency(supabase, idempotencyKey, message);
    return apiError(message, 409);
  }

  const capturedAt = new Date().toISOString();
  const snapshots = snapshotMaps(productResult.data || [], imageResult.data || [], variantResult.data || [], categoryResult.data || [], collectionResult.data || [], capturedAt);
  const validIds = ids.filter((id) => snapshots.has(id));
  if (!validIds.length || validIds.length !== ids.length) {
    const message = !validIds.length ? "Seçilen ürünler bulunamadı." : "Seçilen ürünlerden bazıları artık mevcut değil. Listeyi yenileyip tekrar deneyin.";
    await failIdempotency(supabase, idempotencyKey, message);
    return apiError(message, !validIds.length ? 404 : 409);
  }

  const actorName = auth.internal
    ? clean(body._actor_name) || "Ruth Platform Worker"
    : auth.profile?.full_name || auth.profile?.email || auth.user?.email || "Ruth admin";
  const actorId = auth.internal
    ? clean(body._actor_id) || null
    : clean(auth.profile?.id || auth.user?.id) || null;
  const metadata = mutationMetadata(body, changes);
  const jobId = clean(body._job_id) || null;
  const auditRows = validIds.map((id) => ({
    action: "catalog.product_snapshot",
    entity_type: "product",
    entity_id: id,
    actor_type: "user",
    actor_id: actorId,
    actor_name: actorName,
    correlation_id: idempotencyKey,
    reason: "Panel toplu ürün düzenlemesi öncesi otomatik geri alma kaydı",
    before_data: snapshots.get(id),
    after_data: null,
    occurred_at: capturedAt,
    metadata: {
      snapshot_version: 1,
      source: "admin-products-bulk-update",
      state: "checkpoint",
      admin_action: true,
      idempotency_key: idempotencyKey,
      background_job_id: jobId,
      ...metadata,
    },
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null,
    user_agent: request.headers.get("user-agent"),
  }));
  const { data: insertedAudit, error: auditError } = await supabase
    .from("commerce_audit_logs")
    .insert(auditRows)
    .select("id, entity_id");
  if (auditError) {
    const message = `Toplu işlem geri alma kaydı yazılamadı: ${auditError.message}`;
    await failIdempotency(supabase, idempotencyKey, message);
    return apiError(message, 409);
  }
  const auditByProduct = new Map<string, string>(((insertedAudit || []) as AuditCheckpoint[]).map((row) => [clean(row.entity_id), clean(row.id)]));

  if (!requiresComplexMutation) {
    const baseChanges = { ...changes };
    delete baseChanges.stock_status;
    let updatedIds: string[] = [];
    let fastMutationError = "";

    if (!hasStockStatusMutation) {
      const { data: updated, error: updateError } = await supabase
        .from("products")
        .update({ ...baseChanges, updated_at: new Date().toISOString() })
        .in("id", validIds)
        .select("id");
      if (updateError) fastMutationError = updateError.message;
      else updatedIds = (updated || []).map((row: any) => clean(row.id));
    } else {
      const positiveProductIds: string[] = [];
      const zeroProductIds: string[] = [];
      const positiveVariantIds: string[] = [];
      const zeroVariantIds: string[] = [];
      for (const id of validIds) {
        const variants = snapshots.get(id)?.variants || [];
        const totalStock = variants.reduce((sum, variant) => sum + Math.max(0, Math.trunc(finite(variant.stock, 0))), 0);
        (totalStock > 0 ? positiveProductIds : zeroProductIds).push(id);
        for (const variant of variants) {
          (Math.max(0, Math.trunc(finite(variant.stock, 0))) > 0 ? positiveVariantIds : zeroVariantIds).push(clean(variant.id));
        }
      }
      const productWrites = [
        { ids: positiveProductIds, payload: { ...baseChanges, stock_status: requestedStockStatus, updated_at: new Date().toISOString() } },
        { ids: zeroProductIds, payload: { ...baseChanges, stock_status: "out_of_stock", updated_at: new Date().toISOString() } },
      ];
      for (const write of productWrites) {
        if (!write.ids.length || fastMutationError) continue;
        const { error } = await supabase.from("products").update(write.payload).in("id", write.ids);
        if (error) fastMutationError = error.message;
      }
      const variantWrites = [
        { ids: positiveVariantIds, status: requestedStockStatus },
        { ids: zeroVariantIds, status: "out_of_stock" },
      ];
      for (const write of variantWrites) {
        if (!write.ids.length || fastMutationError) continue;
        const { error } = await supabase.from("product_variants").update({ stock_status: write.status }).in("id", write.ids);
        if (error) fastMutationError = error.message;
      }
      if (!fastMutationError) updatedIds = validIds;
    }

    if (!fastMutationError) {
      try {
        for (const id of updatedIds) {
          const auditId = auditByProduct.get(id);
          if (!auditId) throw new Error(`Audit checkpoint bulunamadı: ${id}`);
          await finalizeAudit(supabase, auditId, id, metadata, idempotencyKey, jobId);
        }
      } catch (error) {
        fastMutationError = error instanceof Error ? error.message : "Toplu işlem audit finalizasyonu başarısız oldu.";
      }
    }

    if (fastMutationError) {
      const compensationFailures = await compensateProducts(request, auth, snapshots, validIds);
      await markAuditsCompensated(supabase, auditByProduct, validIds, metadata, idempotencyKey, undefined, compensationFailures);
      const reconciliationRequired = compensationFailures.length > 0;
      const message = reconciliationRequired
        ? `Toplu işlem tamamlanamadı ve bazı geri alma adımları başarısız oldu: ${fastMutationError}`
        : `${fastMutationError} Yapılan değişiklikler otomatik olarak geri alındı.`;
      await failIdempotency(supabase, idempotencyKey, message, reconciliationRequired);
      return apiError(message, reconciliationRequired ? 500 : 409, {
        correlationId: idempotencyKey,
        reconciliationRequired,
        compensated: !reconciliationRequired,
        ...(reconciliationRequired ? { compensationFailures } : {}),
      });
    }

    const successBody: Record<string, unknown> = {
      ok: true,
      updated: updatedIds.length,
      productIds: updatedIds,
      rollbackAvailable: true,
      correlationId: idempotencyKey,
      warning: null,
    };
    try {
      await completeIdempotency(supabase, idempotencyKey, 200, successBody);
    } catch (error) {
      const compensationFailures = await compensateProducts(request, auth, snapshots, updatedIds);
      const reconciliationRequired = compensationFailures.length > 0;
      const message = `Toplu işlem tekrar koruması tamamlanamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}`;
      await markAuditsCompensated(supabase, auditByProduct, updatedIds, metadata, idempotencyKey, undefined, compensationFailures);
      await failIdempotency(supabase, idempotencyKey, message, reconciliationRequired);
      return apiError(message, 500, { correlationId: idempotencyKey, reconciliationRequired, compensationFailures });
    }

    const revalidate = await revalidateWebsite({ source: "admin-products-bulk-update", productIds: updatedIds });
    if (!revalidate.ok) {
      successBody.warning = revalidate.message || "Site önbelleği yenilenemedi.";
      await completeIdempotency(supabase, idempotencyKey, 200, successBody).catch(() => undefined);
    }
    return NextResponse.json(successBody, { headers: noStoreHeaders() });
  }

  const mutatedIds: string[] = [];
  let failedId = "";
  let failedMessage = "";

  for (const id of validIds) {
    const snapshot = snapshots.get(id)!;
    const patch = productRevisionToPatch(snapshot) as Record<string, any>;
    for (const [field, value] of Object.entries(changes)) patch[field] = value;

    if (hasPricingMutation) {
      const productPricing = applyProductBulkPricing(snapshot.product.price, snapshot.product.compare_at_price, { discountAction, discountPercent, priceMode, priceValue });
      patch.price = productPricing.price;
      patch.compare_at_price = productPricing.compareAtPrice;
      patch.variants = snapshot.variants.map((variant) => {
        const pricing = applyProductBulkPricing(variant.price, variant.compare_at_price, { discountAction, discountPercent, priceMode, priceValue });
        return { ...variant, price: pricing.price, compare_at_price: pricing.compareAtPrice };
      });
    }

    if (stockMode) {
      let nextStocks: number[];
      try {
        nextStocks = applyProductBulkStock(snapshot.variants.map((variant) => variant.stock), { mode: stockMode, scope: stockScope, value: stockValue });
      } catch (error) {
        failedId = id;
        failedMessage = error instanceof Error ? error.message : "Stok işlemi planlanamadı.";
        break;
      }
      patch.variants = (patch.variants || snapshot.variants).map((variant: any, index: number) => ({
        ...variant,
        stock: nextStocks[index],
        stock_status: stockStatusForCount(nextStocks[index], requestedStockStatus || undefined),
      }));
      patch.stock_status = stockStatusForCount(nextStocks.reduce((sum, stock) => sum + stock, 0), requestedStockStatus || undefined);
    } else if (requestedStockStatus) {
      const variants = patch.variants || snapshot.variants;
      patch.variants = variants.map((variant: any) => ({ ...variant, stock_status: stockStatusForCount(variant.stock, requestedStockStatus) }));
      const totalStock = snapshot.variants.reduce((sum, variant) => sum + Math.max(0, Math.trunc(finite(variant.stock, 0))), 0);
      patch.stock_status = stockStatusForCount(totalStock, requestedStockStatus);
    }

    if (hasCategoryMutation) patch.category_ids = applyProductBulkRelation(snapshot.category_ids, categoryIds, categoryAction);
    if (hasCollectionMutation) patch.collection_ids = applyProductBulkRelation(snapshot.collection_ids, collectionIds, collectionAction);

    const response = await updateProductWithAuth(internalProductRequest(request, patch), auth);
    if (!response?.ok) {
      failedId = id;
      failedMessage = response ? await responseError(response) : "Ürün güncelleme yanıtı alınamadı.";
      break;
    }
    mutatedIds.push(id);
    try {
      const auditId = auditByProduct.get(id);
      if (!auditId) throw new Error(`Audit checkpoint bulunamadı: ${id}`);
      await finalizeAudit(supabase, auditId, id, metadata, idempotencyKey, jobId);
    } catch (error) {
      failedId = id;
      failedMessage = error instanceof Error ? error.message : "Ürün audit finalizasyonu başarısız oldu.";
      break;
    }
  }

  if (failedId) {
    const rollbackIds = [...new Set([...mutatedIds, failedId].filter(Boolean))];
    const compensationFailures = await compensateProducts(request, auth, snapshots, rollbackIds);
    await markAuditsCompensated(supabase, auditByProduct, rollbackIds, metadata, idempotencyKey, failedId, compensationFailures);
    const reconciliationRequired = compensationFailures.length > 0;
    const message = reconciliationRequired
      ? `Toplu işlem ${failedId} ürününde durdu ve bazı geri alma adımları tamamlanamadı. Manuel uzlaştırma gerekli.`
      : `${failedMessage} Yapılan önceki değişiklikler otomatik olarak geri alındı.`;
    await failIdempotency(supabase, idempotencyKey, message, reconciliationRequired);
    return apiError(message, reconciliationRequired ? 500 : 409, {
      correlationId: idempotencyKey,
      reconciliationRequired,
      compensated: !reconciliationRequired,
      failedProductId: failedId,
      ...(reconciliationRequired ? { compensationFailures } : {}),
    });
  }

  const successBody: Record<string, unknown> = {
    ok: true,
    updated: mutatedIds.length,
    productIds: mutatedIds,
    rollbackAvailable: true,
    correlationId: idempotencyKey,
    warning: null,
  };
  try {
    await completeIdempotency(supabase, idempotencyKey, 200, successBody);
  } catch (error) {
    const compensationFailures = await compensateProducts(request, auth, snapshots, mutatedIds);
    const reconciliationRequired = compensationFailures.length > 0;
    const message = `Toplu işlem tekrar koruması tamamlanamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}`;
    await markAuditsCompensated(supabase, auditByProduct, mutatedIds, metadata, idempotencyKey, undefined, compensationFailures);
    await failIdempotency(supabase, idempotencyKey, message, reconciliationRequired);
    return apiError(message, 500, { correlationId: idempotencyKey, reconciliationRequired, compensationFailures });
  }

  const revalidate = await revalidateWebsite({ source: "admin-products-bulk-update", productIds: mutatedIds });
  if (!revalidate.ok) {
    successBody.warning = revalidate.message || "Site önbelleği yenilenemedi.";
    await completeIdempotency(supabase, idempotencyKey, 200, successBody).catch(() => undefined);
  }
  return NextResponse.json(successBody, { headers: noStoreHeaders() });
}