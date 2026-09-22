import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 25)));
  const q = String(url.searchParams.get("q") || "").trim();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = auth.supabase
    .from("products")
    .select("*", { count: "exact" })
    .neq("status", "archived")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (q) query = query.ilike("name", `%${q}%`);

  const products = await query;
  if (products.error) return NextResponse.json({ ok: false, error: products.error.message }, { status: 500 });

  const rows = products.data || [];
  const ids = rows.map((row: any) => row.id);

  const [variants, images, categoryLinks, collectionLinks, categories, collections] = await Promise.all([
    ids.length
      ? auth.supabase.from("product_variants").select("id,product_id,name,option_summary,price,stock,stock_status,image_url,is_active,sort_order").in("product_id", ids).eq("is_active", true).order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? auth.supabase.from("product_images").select("product_id,variant_id,image_url,is_main,sort_order").in("product_id", ids).order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? auth.supabase.from("product_categories").select("product_id,category_id").in("product_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? auth.supabase.from("product_collections").select("product_id,collection_id").in("product_id", ids)
      : Promise.resolve({ data: [], error: null }),
    auth.supabase.from("categories").select("id,name,slug,status,sort_order").order("sort_order", { ascending: true }),
    auth.supabase.from("collections").select("id,name,slug,status,sort_order").order("sort_order", { ascending: true }),
  ]);

  const hardError = variants.error || images.error || categoryLinks.error || collectionLinks.error;
  if (hardError) return NextResponse.json({ ok: false, error: hardError.message }, { status: 500 });

  const variantImages = new Map<string, string[]>();
  const productImages = new Map<string, string[]>();
  for (const image of images.data || []) {
    const urlValue = String((image as any).image_url || "");
    if (!urlValue) continue;
    const variantId = String((image as any).variant_id || "");
    const productId = String((image as any).product_id || "");
    if (variantId) variantImages.set(variantId, [...(variantImages.get(variantId) || []), urlValue]);
    else productImages.set(productId, [...(productImages.get(productId) || []), urlValue]);
  }

  const byProduct = new Map<string, any[]>();
  for (const variant of variants.data || []) {
    const key = String((variant as any).product_id);
    const imageUrls = variantImages.get(String((variant as any).id)) || [];
    const hydrated = { ...variant, image_urls: imageUrls, image_url: imageUrls[0] || (variant as any).image_url || null };
    byProduct.set(key, [...(byProduct.get(key) || []), hydrated]);
  }

  const catIds = new Map<string, string[]>();
  for (const link of categoryLinks.data || []) {
    const key = String((link as any).product_id);
    catIds.set(key, [...(catIds.get(key) || []), String((link as any).category_id)]);
  }
  const colIds = new Map<string, string[]>();
  for (const link of collectionLinks.data || []) {
    const key = String((link as any).product_id);
    colIds.set(key, [...(colIds.get(key) || []), String((link as any).collection_id)]);
  }

  const categoryRows = categories.data || [];
  const collectionRows = collections.data || [];
  const total = Number(products.count || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return NextResponse.json({
    ok: true,
    products: rows.map((row: any) => {
      const id = String(row.id);
      const categoryIds = catIds.get(id) || [];
      const collectionIds = colIds.get(id) || [];
      const media = productImages.get(id) || (row.main_image_url ? [row.main_image_url] : []);
      return {
        ...row,
        image_urls: media,
        product_variants: byProduct.get(id) || [],
        category_ids: categoryIds,
        collection_ids: collectionIds,
        categories: categoryRows.filter((item: any) => categoryIds.includes(String(item.id))),
        collection_list: collectionRows.filter((item: any) => collectionIds.includes(String(item.id))),
        discount_pricing: row.compare_at_price && Number(row.compare_at_price) > Number(row.price || 0)
          ? {
              productId: id,
              originalPrice: Number(row.compare_at_price),
              discountedPrice: Number(row.price || 0),
              discountAmount: Number(row.compare_at_price) - Number(row.price || 0),
              discountPercentage: Math.round((1 - Number(row.price || 0) / Number(row.compare_at_price)) * 100),
              hasDiscount: true,
              rules: [],
            }
          : null,
      };
    }),
    categories: categoryRows,
    collections: collectionRows,
    pagination: { page, pageSize, total, totalPages, hasMore: page < totalPages },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
