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

  const [products, categories, collections] = await Promise.all([
    query,
    auth.supabase.from("categories").select("id,name,slug,status,sort_order").order("sort_order", { ascending: true }),
    auth.supabase.from("collections").select("id,name,slug,status,sort_order").order("sort_order", { ascending: true }),
  ]);

  if (products.error) return NextResponse.json({ ok: false, error: products.error.message }, { status: 500 });

  const rows = products.data || [];
  const ids = rows.map((row: any) => row.id);
  let variants: any[] = [];
  if (ids.length) {
    const result = await auth.supabase
      .from("product_variants")
      .select("id,product_id,name,option_summary,price,stock,stock_status,image_url,image_urls,is_active,sort_order")
      .in("product_id", ids)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    variants = result.data || [];
  }

  const byProduct = new Map<string, any[]>();
  for (const variant of variants) {
    const key = String(variant.product_id);
    byProduct.set(key, [...(byProduct.get(key) || []), variant]);
  }

  const total = Number(products.count || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return NextResponse.json({
    ok: true,
    products: rows.map((row: any) => ({
      ...row,
      product_variants: byProduct.get(String(row.id)) || [],
      collection_list: row.collection_list || [],
      image_urls: row.image_urls || [],
    })),
    categories: categories.data || [],
    collections: collections.data || [],
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
