import { NextResponse } from "next/server";
import { getProducts } from "@/data/catalogReadModel";
import { withProductMainImageOverride } from "@/lib/productImageOverrides";
import type { Product } from "@/types/site";

export const runtime = "nodejs";
export const revalidate = 300;

function hasImage(product: Product) {
  return Boolean(product.main_image_url || product.image_urls?.some(Boolean));
}

function prefetchImageUrls(product: Product) {
  return withProductMainImageOverride(product, [
    product.main_image_url,
    ...(product.image_urls || []),
    ...(product.variants || []).map((variant) => variant.image_url),
  ]).filter((value, index, source) => source.indexOf(value) === index);
}

export async function GET(request: Request) {
  try {
    const productId = new URL(request.url).searchParams.get("productId")?.trim();
    if (!productId) {
      return NextResponse.json({ ok: false, targets: [] }, { status: 400 });
    }

    const catalog = (await getProducts()).filter(hasImage);
    const currentIndex = catalog.findIndex((product) => product.id === productId);
    if (currentIndex < 0 || catalog.length < 2) {
      return NextResponse.json({ ok: true, targets: [] });
    }

    const nextProduct = catalog[(currentIndex + 1) % catalog.length];
    const targets = nextProduct && nextProduct.id !== productId
      ? [{ href: `/products/${nextProduct.slug}`, imageUrls: prefetchImageUrls(nextProduct) }]
      : [];

    return NextResponse.json(
      { ok: true, targets },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch {
    return NextResponse.json({ ok: true, targets: [] });
  }
}
