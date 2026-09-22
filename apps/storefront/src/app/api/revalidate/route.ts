import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMMEDIATE_EXPIRY = { expire: 0 } as const;

function authorized(request: Request) {
  const expected = process.env.REVALIDATE_SECRET || process.env.WEBSITE_REVALIDATE_SECRET || "";
  const incoming = request.headers.get("x-revalidate-secret")
    || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || "";
  return Boolean(expected) && incoming === expected;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))]
    : [];
}

type ProductIndexRow = {
  product_id: string;
  slug: string;
  status: string;
  sort_order: number | null;
  name: string;
};

function sortProductIndex(rows: ProductIndexRow[]) {
  return [...rows]
    .filter((row) => row.status === "active" && row.slug)
    .sort((left, right) => {
      const order = Number(left.sort_order ?? Number.MAX_SAFE_INTEGER) - Number(right.sort_order ?? Number.MAX_SAFE_INTEGER);
      return order
        || String(left.name || "").localeCompare(String(right.name || ""), "tr")
        || String(left.product_id).localeCompare(String(right.product_id));
    });
}

async function productWindowInvalidationTargets(productIds: string[], suppliedSlugs: string[]) {
  const slugs = new Set(suppliedSlugs);
  if (!productIds.length) return { slugs: [...slugs], broad: false };

  try {
    const supabase = getSupabaseAdmin();
    let rows: ProductIndexRow[] = [];
    const readModel = await supabase
      .from("storefront_product_read_models")
      .select("product_id, slug, status, sort_order, name");

    if (!readModel.error) {
      rows = (readModel.data || []).map((row: any) => ({
        product_id: String(row.product_id || ""),
        slug: String(row.slug || ""),
        status: String(row.status || ""),
        sort_order: row.sort_order === null ? null : Number(row.sort_order),
        name: String(row.name || ""),
      }));
    } else {
      const fallback = await supabase
        .from("products")
        .select("id, slug, status, sort_order, name");
      if (fallback.error) throw fallback.error;
      rows = (fallback.data || []).map((row: any) => ({
        product_id: String(row.id || ""),
        slug: String(row.slug || ""),
        status: String(row.status || ""),
        sort_order: row.sort_order === null ? null : Number(row.sort_order),
        name: String(row.name || ""),
      }));
    }

    const active = sortProductIndex(rows);
    let broad = false;
    for (const productId of productIds) {
      const raw = rows.find((row) => row.product_id === productId);
      if (raw?.slug) slugs.add(raw.slug);
      const index = active.findIndex((row) => row.product_id === productId);
      if (index < 0) {
        broad = true;
        continue;
      }
      const current = active[index];
      const previous = active.length > 1 ? active[(index - 1 + active.length) % active.length] : null;
      const next = active.length > 1 ? active[(index + 1) % active.length] : null;
      for (const row of [previous, current, next]) if (row?.slug) slugs.add(row.slug);
    }
    return { slugs: [...slugs], broad };
  } catch {
    return { slugs: [...slugs], broad: true };
  }
}

export async function POST(request: Request) {
  if (!process.env.REVALIDATE_SECRET && !process.env.WEBSITE_REVALIDATE_SECRET) {
    return NextResponse.json({ ok: false, error: "REVALIDATE_SECRET tanımlı değil." }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Revalidate secret hatalı." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const scope = body?.scope || new URL(request.url).searchParams.get("scope") || "all";
  const productIds = stringList(body?.productIds);
  const productSlugs = stringList(body?.productSlugs);
  const targetedCatalogChange = scope === "catalog" && (productIds.length > 0 || productSlugs.length > 0);

  // Admin writes require read-your-writes semantics. Next 16's "max" profile
  // intentionally serves stale content while it refreshes in the background,
  // which made the storefront appear out of sync with the panel. expire: 0
  // makes the next catalog read block for fresh data instead.
  if (scope === "all" || scope === "theme") revalidateTag("rosta-theme", IMMEDIATE_EXPIRY);

  let invalidatedProductSlugs: string[] = [];
  if (scope === "all" || scope === "catalog") {
    revalidateTag("rosta-products", IMMEDIATE_EXPIRY);

    if (targetedCatalogChange) {
      const targets = await productWindowInvalidationTargets(productIds, productSlugs);
      invalidatedProductSlugs = targets.slugs;
      if (targets.broad) {
        revalidateTag("rosta-product-windows", IMMEDIATE_EXPIRY);
      } else {
        for (const slug of targets.slugs) revalidateTag(`ruth-product-window:${slug}`, IMMEDIATE_EXPIRY);
      }
    } else {
      revalidateTag("rosta-product-windows", IMMEDIATE_EXPIRY);
      revalidateTag("rosta-collections", IMMEDIATE_EXPIRY);
      revalidateTag("rosta-categories", IMMEDIATE_EXPIRY);
    }
  }

  if (scope === "all" || scope === "discounts" || scope === "catalog") {
    revalidateTag("ruth-discounts", IMMEDIATE_EXPIRY);
  }

  if (scope === "all" || scope === "theme") {
    revalidatePath("/", "layout");
  }
  if (scope === "all" || scope === "catalog" || scope === "discounts") {
    revalidatePath("/");
    revalidatePath("/products");
    revalidatePath("/category/[slug]", "page");
    revalidatePath("/collections/[slug]", "page");
    if (invalidatedProductSlugs.length) {
      for (const slug of invalidatedProductSlugs) revalidatePath(`/products/${encodeURIComponent(slug)}`);
    } else if (!targetedCatalogChange) {
      revalidatePath("/products/[slug]", "page");
    }
  }

  return NextResponse.json({
    ok: true,
    revalidated: true,
    mode: "immediate-expiry",
    scope,
    targetedCatalogChange,
    invalidatedProductSlugs,
    at: new Date().toISOString(),
  });
}

export async function GET(request: Request) {
  return POST(request);
}
