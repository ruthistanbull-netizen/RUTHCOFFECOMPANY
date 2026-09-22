// Product photos are owned by the live catalog (`main_image_url` / `image_urls`).
//
// This module remains only as a compatibility boundary for older admin API
// imports. Do not add filesystem or CDN fallback maps here: doing so makes the
// panel render a different image source than storefront/product studio.

export const localProductImages: Array<{ key: string; image: string }> = [];

export function getLocalProductImage(_slug?: unknown, _name?: unknown) {
  return null;
}
