import { after, NextResponse } from "next/server";
import {
  archiveProductWithAuth,
  updateProductWithAuth,
} from "../route";
import { requireAdmin } from "@/lib/auth";
import {
  captureProductRevision,
  createProductRevisionCheckpoint,
  finalizeProductRevision,
  latestRestorableProductRevision,
  productRevisionToPatch,
  syncProductRelationReadModel,
  type ProductRevisionSnapshot,
} from "@/lib/productRevision";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value || "").trim();
}

function apiError(message: string, status = 400, details?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, error: message, ...(details || {}) },
    { status, headers: noStoreHeaders() },
  );
}

function internalRequest(request: Request, method: "PATCH" | "DELETE", body: unknown) {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.set("x-ruth-skip-storefront-revalidate", "1");
  const url = new URL(request.url);
  url.pathname = "/api/products";
  return new Request(url, {
    method,
    headers,
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response) {
  return response.clone().json().catch(() => ({}));
}

function warningText(...values: Array<unknown>) {
  return values.map((value) => clean(value)).filter(Boolean).join(" ") || null;
}

type PriceSyncResult = {
  applied: boolean;
  previousPrice: number;
  nextPrice: number;
  delta: number;
  syncedVariants: number;
  preservedManualVariants: number;
};

type ProductPersistenceVerification = {
  snapshot: ProductRevisionSnapshot;
  mismatches: string[];
};

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundPrice(value: number) {
  return Math.max(0, Math.round(value * 100) / 100);
}

function roundSignedPrice(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizedNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function sameNumber(left: unknown, right: unknown) {
  const a = normalizedNumber(left);
  const b = normalizedNumber(right);
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < 0.005;
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function sameOrderedStrings(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameIdSet(left: unknown[], right: unknown[]) {
  const a = uniqueStrings(left).sort();
  const b = uniqueStrings(right).sort();
  return sameOrderedStrings(a, b);
}

function normalizedBundleItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => ({
      product_id: clean(item?.product_id),
      quantity: Math.max(1, Math.trunc(Number(item?.quantity || 1))),
    }))
    .filter((item) => item.product_id);
}

function expectedVariantImages(variant: any) {
  return uniqueStrings([
    ...(Array.isArray(variant?.image_urls) ? variant.image_urls : []),
    variant?.image_url,
  ]);
}

function productPersistenceMismatches(
  snapshot: ProductRevisionSnapshot,
  body: Record<string, any>,
) {
  const mismatches: string[] = [];
  const product = snapshot.product || {};
  const textFields = [
    "name",
    "slug",
    "material",
    "finish_color",
    "stock_status",
    "status",
    "short_description",
    "description",
    "size_usage",
    "care_advice",
  ];

  for (const field of textFields) {
    if (field in body && clean(product[field]) !== clean(body[field])) mismatches.push(field);
  }

  if ("price" in body && !sameNumber(product.price, body.price)) mismatches.push("price");
  if ("compare_at_price" in body && !sameNumber(product.compare_at_price, body.compare_at_price)) {
    mismatches.push("compare_at_price");
  }

  if (Array.isArray(body.photos)) {
    const expectedPhotos = body.photos.map(clean).filter(Boolean);
    const actualPhotos = [...(snapshot.images || [])]
      .filter((image: any) => !image.variant_id && clean(image.image_url))
      .sort((left: any, right: any) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
      .map((image: any) => clean(image.image_url));
    if (!sameOrderedStrings(actualPhotos, expectedPhotos)) mismatches.push("photos");

    const expectedMainImage = clean(body.main_image_url) || expectedPhotos[0] || "";
    if (clean(product.main_image_url) !== expectedMainImage) mismatches.push("main_image_url");
  } else if ("main_image_url" in body && clean(product.main_image_url) !== clean(body.main_image_url)) {
    mismatches.push("main_image_url");
  }

  if (Array.isArray(body.category_ids) && !sameIdSet(snapshot.category_ids || [], body.category_ids)) {
    mismatches.push("category_ids");
  }
  if (Array.isArray(body.collection_ids) && !sameIdSet(snapshot.collection_ids || [], body.collection_ids)) {
    mismatches.push("collection_ids");
  }

  if (Array.isArray(body.bundleItems)) {
    const expectedBundleItems = normalizedBundleItems(body.bundleItems);
    const actualBundleItems = normalizedBundleItems(product.bundle_items);
    if (JSON.stringify(actualBundleItems) !== JSON.stringify(expectedBundleItems)) mismatches.push("bundle_items");

    const expectedBundle = expectedBundleItems.length > 0 || body.productType === "bundle" || body.is_bundle === true;
    if (Boolean(product.is_bundle) !== expectedBundle) mismatches.push("is_bundle");
    const expectedProductType = expectedBundle ? "bundle" : clean(body.product_type) || "single";
    if (clean(product.product_type) !== expectedProductType) mismatches.push("product_type");
  }

  if (Array.isArray(body.variants)) {
    const expectedVariants = body.variants;
    const actualVariants = [...(snapshot.variants || [])]
      .sort((left: any, right: any) => Number(left.sort_order || 0) - Number(right.sort_order || 0));

    if (actualVariants.length !== expectedVariants.length) {
      mismatches.push("variants.length");
    } else {
      for (let index = 0; index < expectedVariants.length; index += 1) {
        const expected = expectedVariants[index] || {};
        const actual = actualVariants[index] || {};
        const label = clean(expected.option_summary) || clean(expected.name) || `Varyant ${index + 1}`;
        const expectedPrice = normalizedNumber(expected.price) ?? normalizedNumber(body.price) ?? 0;
        const stockNumber = Number(expected.stock);
        const expectedStock = Number.isFinite(stockNumber) ? Math.max(0, Math.trunc(stockNumber)) : 100;
        const expectedStockStatus = clean(expected.stock_status) || "in_stock";
        const expectedActive = expected.is_active !== false;
        const options = expected.options && typeof expected.options === "object" ? expected.options : {};
        const expectedDisplayType = clean(expected.variant_display_type || expected.displayType || options.__displayType) || "list";
        const expectedColor = clean(expected.color_value || options.__colorValue);
        const actualOptions = actual.options && typeof actual.options === "object" ? actual.options : {};

        if (
          clean(actual.option_summary) !== label ||
          !sameNumber(actual.price, expectedPrice) ||
          Number(actual.stock || 0) !== expectedStock ||
          clean(actual.stock_status) !== expectedStockStatus ||
          Boolean(actual.is_active) !== expectedActive ||
          clean(actualOptions.__displayType) !== expectedDisplayType ||
          clean(actualOptions.__colorValue) !== expectedColor
        ) {
          mismatches.push(`variant:${index}`);
        }

        const expectedImages = expectedVariantImages(expected);
        const actualImages = [...(snapshot.images || [])]
          .filter((image: any) => clean(image.variant_id) === clean(actual.id) && clean(image.image_url))
          .sort((left: any, right: any) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
          .map((image: any) => clean(image.image_url));
        if (!sameOrderedStrings(actualImages, expectedImages)) mismatches.push(`variant-media:${index}`);
      }
    }
  }

  return uniqueStrings(mismatches);
}

async function verifyPersistedProduct(
  supabase: any,
  productId: string,
  body: Record<string, any>,
): Promise<ProductPersistenceVerification> {
  let lastSnapshot: ProductRevisionSnapshot | null = null;
  let lastMismatches: string[] = [];
  let lastError: unknown = null;

  for (const delay of [0, 80, 220]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const snapshot = await captureProductRevision(supabase, productId);
      const mismatches = productPersistenceMismatches(snapshot, body);
      lastSnapshot = snapshot;
      lastMismatches = mismatches;
      if (!mismatches.length) return { snapshot, mismatches: [] };
    } catch (error) {
      lastError = error;
    }
  }

  if (!lastSnapshot) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Ürün kaydı sunucudan tekrar okunamadı.");
  }
  return { snapshot: lastSnapshot, mismatches: lastMismatches };
}

function preserveReferencedVariantsFromSnapshot(
  snapshot: ProductRevisionSnapshot,
  incomingVariants: unknown,
) {
  if (!Array.isArray(incomingVariants)) return incomingVariants;
  const incomingIds = new Set(
    incomingVariants.map((variant: any) => clean(variant?.id)).filter(Boolean),
  );
  const archived = (snapshot.variants || [])
    .filter((variant: any) => !incomingIds.has(clean(variant.id)))
    .map((variant: any) => ({
      ...variant,
      is_active: false,
      stock: 0,
      stock_status: "out_of_stock",
    }));
  return [...incomingVariants, ...archived];
}

function synchronizeVariantPrices(
  snapshot: ProductRevisionSnapshot,
  body: Record<string, any>,
): PriceSyncResult | null {
  if (!("price" in body) || body.sync_variant_prices === false) return null;

  const nextPrice = finiteNumber(body.price);
  if (nextPrice == null) return null;

  const previousPrice = finiteNumber(snapshot.product?.price) ?? nextPrice;
  const normalizedNextPrice = roundPrice(nextPrice);
  const existingVariants = Array.isArray(snapshot.variants) ? snapshot.variants : [];

  if (Math.abs(normalizedNextPrice - previousPrice) < 0.005 || existingVariants.length === 0) {
    return {
      applied: false,
      previousPrice: roundPrice(previousPrice),
      nextPrice: normalizedNextPrice,
      delta: 0,
      syncedVariants: 0,
      preservedManualVariants: 0,
    };
  }

  const byId = new Map<string, any>(
    existingVariants.map((variant: any) => [String(variant.id), variant] as [string, any]),
  );
  const incomingVariants = Array.isArray(body.variants) && body.variants.length
    ? body.variants
    : existingVariants;
  let syncedVariants = 0;
  let preservedManualVariants = 0;

  body.variants = incomingVariants.map((variant: any) => {
    const id = clean(variant.id);
    const stored = id ? byId.get(id) : null;
    const storedPrice = finiteNumber(stored?.price) ?? previousPrice;
    const incomingPrice = finiteNumber(variant.price);
    const wasManuallyChanged = Boolean(
      stored &&
      incomingPrice != null &&
      Math.abs(incomingPrice - storedPrice) >= 0.005
    );

    if (wasManuallyChanged) {
      preservedManualVariants += 1;
      return { ...variant, price: roundPrice(incomingPrice as number) };
    }

    syncedVariants += 1;
    return {
      ...stored,
      ...variant,
      price: roundPrice(storedPrice + (normalizedNextPrice - previousPrice)),
    };
  });

  body.sync_variant_prices = false;
  return {
    applied: syncedVariants > 0,
    previousPrice: roundPrice(previousPrice),
    nextPrice: normalizedNextPrice,
    delta: roundSignedPrice(normalizedNextPrice - previousPrice),
    syncedVariants,
    preservedManualVariants,
  };
}

async function finishRevision({
  supabase,
  productId,
  auditId,
  action,
  metadata,
}: {
  supabase: any;
  productId: string;
  auditId: string;
  action: "catalog.product_updated" | "catalog.product_archived" | "catalog.product_restored";
  metadata?: Record<string, unknown>;
}) {
  await syncProductRelationReadModel(supabase, productId);
  const afterSnapshot = await captureProductRevision(supabase, productId);
  await finalizeProductRevision({
    supabase,
    auditId,
    action,
    after: afterSnapshot,
    metadata,
  });
}

function scheduleRevisionFinish(input: Parameters<typeof finishRevision>[0]) {
  after(async () => {
    try {
      await finishRevision(input);
    } catch (error) {
      console.warn("[product-revision] post-commit finalize failed", {
        productId: input.productId,
        auditId: input.auditId,
        action: input.action,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  });
}

function scheduleReadModelSync(supabase: any, productId: string) {
  after(async () => {
    try {
      await syncProductRelationReadModel(supabase, productId);
    } catch (error) {
      console.warn("[product-save] post-commit read-model sync failed", {
        productId,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  });
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const id = clean(new URL(request.url).searchParams.get("id"));
  if (!id) return apiError("Ürün id yok.");

  try {
    const revision = await latestRestorableProductRevision(auth.supabase, id);
    return NextResponse.json(
      {
        ok: true,
        canRestore: Boolean(revision?.before_data),
        revision: revision
          ? {
              id: revision.id,
              action: revision.action,
              reason: revision.reason,
              occurred_at: revision.occurred_at,
              actor_name: revision.actor_name,
            }
          : null,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Ürün geçmişi alınamadı.",
      400,
    );
  }
}

export async function PATCH(request: Request) {
  const startedAt = performance.now();
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = clean(body.id);
  if (!id) return apiError("Ürün id yok.");

  let checkpoint: { id: string; correlationId: string } | null = null;
  let priceSync: PriceSyncResult | null = null;
  let safetyWarning: string | null = null;

  try {
    const before = await captureProductRevision(auth.supabase, id);
    body.variants = preserveReferencedVariantsFromSnapshot(before, body.variants);
    priceSync = synchronizeVariantPrices(before, body);

    try {
      checkpoint = await createProductRevisionCheckpoint({
        supabase: auth.supabase,
        request,
        identity: auth,
        productId: id,
        snapshot: before,
        reason: "Panel ürün düzenlemesi öncesi otomatik geri alma kaydı",
      });
    } catch (error) {
      safetyWarning = "Geri alma kaydı oluşturulamadı; ürün kaydı yine de sunucuda doğrulandı.";
      console.warn("[product-save] rollback checkpoint unavailable", {
        productId: id,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  } catch (error) {
    safetyWarning = "Ön kontrol tamamlanamadı; ürün kaydı doğrudan yapılıp sunucuda doğrulandı.";
    console.warn("[product-save] pre-save snapshot unavailable", {
      productId: id,
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  let response = await updateProductWithAuth(
    internalRequest(request, "PATCH", body),
    auth,
  );
  if (!response) {
    return apiError("Ürün güncelleme yanıtı oluşturulamadı.", 500, { saved: false });
  }
  if (!response.ok) return response;

  let result = await readJson(response);
  let verificationRetried = false;
  let verification: ProductPersistenceVerification;
  try {
    verification = await verifyPersistedProduct(auth.supabase, id, body);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Ürün kaydı sunucuda doğrulanamadı.",
      503,
      { saved: false, persistedVerified: false },
    );
  }

  if (verification.mismatches.length) {
    verificationRetried = true;
    console.warn("[product-save] persistence mismatch; retrying durable write", {
      productId: id,
      mismatches: verification.mismatches,
    });

    response = await updateProductWithAuth(
      internalRequest(request, "PATCH", body),
      auth,
    );
    if (!response) {
      return apiError("Ürün kaydı doğrulama tekrarında yanıt oluşturulamadı.", 500, { saved: false });
    }
    if (!response.ok) return response;
    result = await readJson(response);

    try {
      verification = await verifyPersistedProduct(auth.supabase, id, body);
    } catch (error) {
      return apiError(
        error instanceof Error ? error.message : "Ürün kaydı tekrar sonrası doğrulanamadı.",
        503,
        { saved: false, persistedVerified: false },
      );
    }
  }

  if (verification.mismatches.length) {
    console.error("[product-save] durable verification failed", {
      productId: id,
      mismatches: verification.mismatches,
    });
    return apiError(
      "Ürün değişikliklerinin tamamı veritabanında doğrulanamadı. Değişiklikler ekranda tutuldu; tekrar kaydet.",
      409,
      {
        saved: false,
        persistedVerified: false,
        persistenceMismatches: verification.mismatches,
      },
    );
  }

  const revalidate = await revalidateWebsite({
    source: "admin-catalog.product_updated",
    productIds: [id],
  });

  if (checkpoint) {
    scheduleRevisionFinish({
      supabase: auth.supabase,
      productId: id,
      auditId: checkpoint.id,
      action: "catalog.product_updated",
      metadata: {
        ...(priceSync ? { variant_price_sync: priceSync } : {}),
        persisted_verified: true,
        verification_retried: verificationRetried,
      },
    });
  } else {
    scheduleReadModelSync(auth.supabase, id);
  }

  const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
  return NextResponse.json(
    {
      ...result,
      ok: true,
      saved: true,
      persistedVerified: true,
      verificationRetried,
      priceSync,
      rollbackAvailable: Boolean(checkpoint),
      correlationId: checkpoint?.correlationId || null,
      durationMs,
      warning: warningText(
        safetyWarning,
        result.warning,
        revalidate.ok ? null : revalidate.message || "Site önbelleği yenilenemedi.",
      ),
    },
    {
      headers: {
        ...noStoreHeaders(),
        "Server-Timing": `admin-save;dur=${durationMs}`,
        "X-Rosta-Save-Duration-Ms": String(durationMs),
        "X-Ruth-Persisted-Verified": "1",
      },
    },
  );
}

export async function DELETE(request: Request) {
  const startedAt = performance.now();
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = clean(body.id);
  if (!id) return apiError("Ürün id yok.");

  let checkpoint: { id: string; correlationId: string };
  try {
    const before = await captureProductRevision(auth.supabase, id);
    checkpoint = await createProductRevisionCheckpoint({
      supabase: auth.supabase,
      request,
      identity: auth,
      productId: id,
      snapshot: before,
      reason: "Panel ürün arşivleme işlemi öncesi otomatik geri alma kaydı",
    });
  } catch (error) {
    return apiError(
      error instanceof Error
        ? error.message
        : "Geri alma kaydı oluşturulamadığı için ürün arşivlenmedi.",
      409,
      { archived: false },
    );
  }

  const response = await archiveProductWithAuth(
    internalRequest(request, "DELETE", body),
    auth,
  );
  if (!response) {
    return apiError("Ürün arşivleme yanıtı oluşturulamadı.", 500, { archived: false });
  }
  if (!response.ok) return response;

  const result = await readJson(response);
  const revalidate = await revalidateWebsite({
    source: "admin-catalog.product_archived",
    productIds: [id],
  });
  scheduleRevisionFinish({
    supabase: auth.supabase,
    productId: id,
    auditId: checkpoint.id,
    action: "catalog.product_archived",
  });

  const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
  return NextResponse.json(
    {
      ...result,
      ok: true,
      rollbackAvailable: true,
      correlationId: checkpoint.correlationId,
      durationMs,
      warning: warningText(
        result.warning,
        revalidate.ok ? null : revalidate.message || "Site önbelleği yenilenemedi.",
      ),
    },
    {
      headers: {
        ...noStoreHeaders(),
        "Server-Timing": `admin-archive;dur=${durationMs}`,
        "X-Rosta-Save-Duration-Ms": String(durationMs),
      },
    },
  );
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const id = clean(body.id);
  if (body.action !== "restore" || !id) {
    return apiError("Geçersiz ürün geri alma isteği.");
  }

  let target: any;
  let current: ProductRevisionSnapshot;
  let checkpoint: { id: string; correlationId: string };
  try {
    const [targetRevision, currentRevision] = await Promise.all([
      latestRestorableProductRevision(auth.supabase, id),
      captureProductRevision(auth.supabase, id),
    ]);
    target = targetRevision;
    current = currentRevision;
    if (!target?.before_data) {
      return apiError("Bu ürün için geri alınabilir bir değişiklik bulunamadı.", 404);
    }

    checkpoint = await createProductRevisionCheckpoint({
      supabase: auth.supabase,
      request,
      identity: auth,
      productId: id,
      snapshot: current,
      reason: "Panel ürün geri alma işlemi öncesi güvenlik kaydı",
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Ürün geri alma kaydı hazırlanamadı.",
      409,
    );
  }

  const restoreBody = productRevisionToPatch(
    target.before_data as ProductRevisionSnapshot,
  );
  restoreBody.variants = preserveReferencedVariantsFromSnapshot(
    current,
    restoreBody.variants,
  ) as any[];

  const response = await updateProductWithAuth(
    internalRequest(request, "PATCH", restoreBody),
    auth,
  );
  if (!response) {
    return apiError("Ürün geri alma yanıtı oluşturulamadı.", 500, { restored: false });
  }
  if (!response.ok) return response;

  const result = await readJson(response);
  const revalidate = await revalidateWebsite({
    source: "admin-catalog.product_restored",
    productIds: [id],
  });
  scheduleRevisionFinish({
    supabase: auth.supabase,
    productId: id,
    auditId: checkpoint.id,
    action: "catalog.product_restored",
    metadata: { restored_from_audit_id: target.id },
  });

  const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
  return NextResponse.json(
    {
      ...result,
      ok: true,
      restored: true,
      rollbackAvailable: true,
      correlationId: checkpoint.correlationId,
      durationMs,
      warning: warningText(
        result.warning,
        revalidate.ok ? null : revalidate.message || "Site önbelleği yenilenemedi.",
      ),
    },
    {
      headers: {
        ...noStoreHeaders(),
        "Server-Timing": `admin-restore;dur=${durationMs}`,
        "X-Rosta-Save-Duration-Ms": String(durationMs),
      },
    },
  );
}