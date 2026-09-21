import { NextResponse } from "next/server";
import { hasSupabaseEnv, supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function countTable(table: string) {
  if (!supabase) return { count: null, error: "Supabase env yok" };

  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  return { count, error: error?.message || null };
}

export async function GET() {
  const useSupabaseCatalog = process.env.NEXT_PUBLIC_USE_SUPABASE_CATALOG !== "false";

  const [products, categories, productCategories, variants, images, collections, productCollections] = await Promise.all([
    countTable("products"),
    countTable("categories"),
    countTable("product_categories"),
    countTable("product_variants"),
    countTable("product_images"),
    countTable("collections"),
    countTable("product_collections"),
  ]);

  let sampleProducts: Array<{ id: string; name: string; slug: string; status: string | null }> = [];
  let sampleError: string | null = null;

  if (supabase) {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, slug, status")
      .order("updated_at", { ascending: false })
      .limit(5);

    sampleProducts = (data || []) as typeof sampleProducts;
    sampleError = error?.message || null;
  }

  return NextResponse.json({
    ok: true,
    hasSupabaseEnv,
    useSupabaseCatalog,
    tables: {
      products,
      categories,
      product_categories: productCategories,
      product_variants: variants,
      product_images: images,
      collections,
      product_collections: productCollections,
    },
    sampleProducts,
    sampleError,
  });
}
