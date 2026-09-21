import type { Product } from "@/types/site";
import { resolveProductImage } from "@/lib/productImageOverrides";

export type ProductImageMode = "card" | "detail" | "thumb";

function stableImageSource(
  product: Product,
  imageUrl: string | null | undefined,
  mode: ProductImageMode,
) {
  if (mode !== "detail") return imageUrl;

  const mainImage = String(product.main_image_url || "").trim();
  if (!mainImage) return imageUrl;

  const firstGalleryImage = product.image_urls?.find(Boolean) || "";
  if (!imageUrl || imageUrl === firstGalleryImage) return mainImage;
  return imageUrl;
}

export function productDisplayImageSrc(
  product: Product,
  imageUrl: string | null | undefined,
  mode: ProductImageMode,
) {
  // Do not rewrite a catalog URL to a second /public derivative tree. The
  // product record is the single source used by storefront and panel.
  const source = stableImageSource(product, imageUrl, mode);
  return resolveProductImage(product, source) || "";
}

export function productPrimaryDetailImageSrc(product: Product | null | undefined) {
  if (!product) return "";
  const source = product.main_image_url || product.image_urls?.[0] || "";
  return productDisplayImageSrc(product, source, "detail");
}
