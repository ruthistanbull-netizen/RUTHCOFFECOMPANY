import { NextResponse } from "next/server";
import { getProducts } from "@/data/catalogReadModel";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanQuery(value: string | null) {
  return String(value || "").trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

function normalize(value: unknown) {
  return String(value || "").toLocaleLowerCase("tr-TR");
}

export async function GET(request: Request) {
  const query = cleanQuery(new URL(request.url).searchParams.get("q"));
  if (query.length < 2) {
    return NextResponse.json({ ok: true, query, products: [], collections: [], categories: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const supabase = getSupabaseAdmin();
  const pattern = `%${query}%`;
  const normalizedQuery = normalize(query);
  const [allProducts, collectionsResult, categoriesResult] = await Promise.all([
    getProducts(),
    supabase
      .from("collections")
      .select("id, name, slug, description, cover_image_url")
      .or(`name.ilike.${pattern},slug.ilike.${pattern},description.ilike.${pattern}`)
      .order("sort_order", { ascending: true })
      .limit(6),
    supabase
      .from("categories")
      .select("id, name, slug, description")
      .or(`name.ilike.${pattern},slug.ilike.${pattern},description.ilike.${pattern}`)
      .order("sort_order", { ascending: true })
      .limit(6),
  ]);

  const products = allProducts
    .filter((product) => normalize(`${product.name} ${product.slug} ${product.description || ""}`).includes(normalizedQuery))
    .slice(0, 12)
    .map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      compare_at_price: product.compare_at_price,
      material: product.material,
      stock_status: product.stock_status,
      main_image_url: product.main_image_url,
      status: product.status,
    }));

  return NextResponse.json({
    ok: true,
    query,
    products,
    collections: collectionsResult.error ? [] : collectionsResult.data || [],
    categories: categoriesResult.error ? [] : categoriesResult.data || [],
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
