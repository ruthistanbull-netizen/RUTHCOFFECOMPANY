import type { Product } from "@/types/site";

/**
 * Product photo URLs are owned by the live catalog record.
 *
 * Older storefront builds carried a second, code-level map that silently
 * replaced catalog photos with local legacy files. That made
 * the same product render a different image depending on the surface. Keep
 * these compatibility helpers, but make the catalog the single source of
 * truth everywhere.
 */
export function productMainImageOverride(
  _product: Pick<Product, "slug" | "main_image_url">,
) {
  return null;
}

export function primaryProductImage(
  product: Pick<Product, "slug" | "main_image_url" | "image_urls">,
) {
  return product.main_image_url || product.image_urls?.find(Boolean) || "";
}

export function withProductMainImageOverride(
  _product: Pick<Product, "slug" | "main_image_url" | "image_urls">,
  images: Array<string | null | undefined>,
) {
  return [...new Set(images.filter((image): image is string => Boolean(image)))];
}

export function resolveProductImage(
  _product: Pick<Product, "slug" | "main_image_url" | "image_urls">,
  imageUrl: string | null | undefined,
) {
  return imageUrl || null;
}
