import { NextResponse } from "next/server";
import {
  getBundleSectionProducts,
  getProductBySlug,
} from "@/data/site";

export const revalidate = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) {
    return NextResponse.json(
      { ok: false, products: [], error: "Ürün bulunamadı." },
      { status: 404 },
    );
  }

  const sourceParam = new URL(request.url).searchParams.get("source");
  const source = sourceParam === "all" ? "all" : "related";
  const products = await getBundleSectionProducts(product, source);

  return NextResponse.json(
    {
      ok: true,
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        compare_at_price: product.compare_at_price,
        currency: product.currency,
        image_url: product.main_image_url || product.image_urls?.[0] || null,
        stock_status: product.stock_status,
      })),
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } },
  );
}
