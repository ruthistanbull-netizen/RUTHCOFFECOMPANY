import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

type ProductGalleryRow = {
  id: string;
  name: string;
  main_image_url?: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const url = new URL(request.url);
  const name = clean(url.searchParams.get("name"));
  if (!name) {
    return NextResponse.json({ ok: false, error: "Ürün adı gerekli." }, { status: 400, headers: noStoreHeaders() });
  }

  let product: ProductGalleryRow | null = null;

  const exact = await supabase
    .from("products")
    .select("id,name,main_image_url")
    .eq("name", name)
    .limit(1)
    .maybeSingle();

  if (!exact.error && exact.data) {
    product = exact.data as ProductGalleryRow;
  } else {
    const fallback = await supabase
      .from("products")
      .select("id,name,main_image_url")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (!fallback.error && fallback.data) product = fallback.data as ProductGalleryRow;
  }

  if (!product) {
    return NextResponse.json({ ok: true, product: null, images: [] }, { headers: noStoreHeaders() });
  }

  const [imagesResult, variantsResult] = await Promise.all([
    supabase
      .from("product_images")
      .select("image_url,is_main,sort_order")
      .eq("product_id", product.id)
      .order("is_main", { ascending: false })
      .order("sort_order", { ascending: true }),
    supabase
      .from("product_variants")
      .select("image_url,is_active")
      .eq("product_id", product.id),
  ]);

  const images = [
    product.main_image_url,
    ...((imagesResult.data || []).map((item: any) => item.image_url)),
    ...((variantsResult.data || []).filter((item: any) => item.is_active !== false).map((item: any) => item.image_url)),
  ]
    .map((value) => clean(value))
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

  return NextResponse.json({
    ok: true,
    product: { id: product.id, name: product.name },
    images,
  }, { headers: noStoreHeaders() });
}
