import { NextResponse } from "next/server";
import {
  getCrossSellProducts,
  type CrossSellSource,
} from "@/data/crossSell";

export const runtime = "nodejs";
export const revalidate = 300;

const SOURCES = new Set<CrossSellSource>(["related", "best-sellers", "new-arrivals"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const anchorSlugs = (url.searchParams.get("items") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 20);
  const rawSource = url.searchParams.get("source") || "related";
  const source: CrossSellSource = SOURCES.has(rawSource as CrossSellSource)
    ? rawSource as CrossSellSource
    : "related";
  const limit = Math.min(8, Math.max(2, Number(url.searchParams.get("limit") || 4) || 4));
  const preview = url.searchParams.get("preview") === "1";

  const products = await getCrossSellProducts({
    anchorSlugs,
    source,
    limit,
    preview,
  });

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
    {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
