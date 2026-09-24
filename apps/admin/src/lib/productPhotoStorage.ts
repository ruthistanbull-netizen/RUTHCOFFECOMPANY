import { randomUUID } from "node:crypto";

export const RUTH_PRODUCT_PHOTO_BUCKET = "rosta-media";
export const RUTH_PRODUCT_PHOTO_FOLDER = "products";
export const RUTH_PRODUCT_PHOTO_SYSTEM_NAME = "ROSTA Product Media";

export function ruthProductPhotoPath(
  fileName: string,
  kind: "original" | "edited" = "original",
) {
  const safeName = String(fileName || "product")
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "product";

  return `${RUTH_PRODUCT_PHOTO_FOLDER}/${Date.now()}-${randomUUID()}-${kind}-${safeName}.webp`;
}
