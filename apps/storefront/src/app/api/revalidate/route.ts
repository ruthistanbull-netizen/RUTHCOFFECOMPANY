import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getStorefrontRevalidationSecret } from "@/lib/storefrontRevalidationSecret";
import { matchesStorefrontRevalidationSecret } from "@ruth-commerce/commerce-core/storefront-revalidation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMMEDIATE_EXPIRY = { expire: 0 } as const;
const SCOPES = new Set(["all", "catalog", "theme", "discounts"]);

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      // Public protocol version permits deployment verification without a secret.
      "X-ROSTA-Revalidation-Version": "2",
    },
  });
}

function incomingSecret(request: Request) {
  return request.headers.get("x-revalidate-secret")
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || "";
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 250)
    : [];
}

export async function POST(request: Request) {
  const supplied = incomingSecret(request);
  if (!supplied) return json({ ok: false, error: "Revalidate secret hatalı." }, 401);
  const expected = await getStorefrontRevalidationSecret();
  if (!expected) return json({ ok: false, error: "Canlı mağaza yenileme bağlantısı hazırlanamadı." }, 503);
  if (!matchesStorefrontRevalidationSecret(expected, supplied)) {
    return json({ ok: false, error: "Revalidate secret hatalı." }, 401);
  }

  const body = request.method === "GET" ? {} : await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "Yenileme isteği geçerli bir JSON nesnesi olmalı." }, 400);
  }
  const scope = body.scope || new URL(request.url).searchParams.get("scope") || "all";
  if (!SCOPES.has(scope)) return json({ ok: false, error: "Geçersiz yenileme kapsamı." }, 400);
  const productIds = stringList(body.productIds);
  const productSlugs = stringList(body.productSlugs);
  const targetedCatalogChange = scope === "catalog" && (productIds.length > 0 || productSlugs.length > 0);
  const invalidatedTags = new Set<string>();

  if (scope === "all" || scope === "theme") {
    invalidatedTags.add("rosta-theme");
    invalidatedTags.add("rosta-social-media");
  }
  if (scope === "all" || scope === "catalog" || scope === "discounts") {
    // Catalog prices already include discounts, and a cached product window also
    // contains its neighbours. IDs cannot identify all affected slugs without a
    // full DB scan. Invalidate the shared tag instead: no DB work on delivery,
    // including renamed, reordered, newly created or archived products.
    invalidatedTags.add("rosta-products");
    invalidatedTags.add("rosta-product-windows");
    invalidatedTags.add("rosta-discounts");
  }
  if (scope === "all" || scope === "catalog") {
    invalidatedTags.add("rosta-collections");
    invalidatedTags.add("rosta-categories");
  }
  if (scope === "all") invalidatedTags.add("rosta-orders");

  // expire: 0 blocks the next read for fresh data; "max" would return stale data
  // first. Only known, brand-specific cache owners are accepted by this endpoint.
  for (const tag of invalidatedTags) revalidateTag(tag, IMMEDIATE_EXPIRY);
  if (scope === "all" || scope === "theme") revalidatePath("/", "layout");
  if (scope === "all" || scope === "catalog" || scope === "discounts") {
    revalidatePath("/");
    revalidatePath("/products");
    revalidatePath("/category/[slug]", "page");
    revalidatePath("/collections/[slug]", "page");
    revalidatePath("/products/[slug]", "page");
  }

  return json({
    ok: true,
    revalidated: true,
    mode: "immediate-expiry",
    scope,
    targetedCatalogChange,
    invalidatedProductSlugs: productSlugs,
    invalidatedTags: [...invalidatedTags],
    at: new Date().toISOString(),
  });
}

export async function GET(request: Request) {
  return POST(request);
}
