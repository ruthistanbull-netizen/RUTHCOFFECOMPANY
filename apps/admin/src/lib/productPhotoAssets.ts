import { previewRostaPublicMediaUrl } from "@/lib/supabaseRuntime";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { PRODUCT_IMAGE_MAX_BYTES, transformProductImage, type ProductImageTransform } from "@/lib/productImagePipeline";
import { RUTH_PRODUCT_PHOTO_BUCKET, RUTH_PRODUCT_PHOTO_SYSTEM_NAME } from "@/lib/productPhotoStorage";

type Storage = Pick<SupabaseClient, "storage">;
export type PhotoEdits = { website: ProductImageTransform; application: ProductImageTransform };
export const defaultPhotoEdits = (): PhotoEdits => ({
  website: { focalX: 0.5, focalY: 0.5, zoom: 1, rotation: 0, flipX: false },
  application: { focalX: 0.5, focalY: 0.5, zoom: 1, rotation: 0, flipX: false },
});

function publicURL(store: Storage, path: string) {
  return previewRostaPublicMediaUrl(store.storage.from(RUTH_PRODUCT_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl);
}

export function photoAssetFolder(store: Storage, raw: string): string | null {
  const base = new URL(publicURL(store, "products/crops-v1/"));
  const url = new URL(raw);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
  const suffix = url.pathname.slice(base.pathname.length);
  if (!/^[0-9a-f-]{36}\/(website|application)\.webp$/.test(suffix)) return null;
  return "products/crops-v1/" + suffix.split("/")[0];
}

export function normalizedPhotoCrop(value: unknown): ProductImageTransform {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Kırpma ayarları geçersiz.");
  const crop = value as Record<string, unknown>;
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(crop[key] ?? fallback);
    if (!Number.isFinite(value)) throw new Error("Kırpma ayarları geçersiz.");
    return Math.min(max, Math.max(min, value));
  };
  return {
    focalX: number("focalX", 0.5, 0, 1), focalY: number("focalY", 0.5, 0, 1),
    zoom: number("zoom", 1, 1, 4),
    rotation: Math.round(number("rotation", 0, -360, 360) / 90) * 90,
    flipX: crop.flipX === true,
  };
}

export async function readPhotoAsset(store: Storage, url: string) {
  const folder = photoAssetFolder(store, url);
  if (!folder) return { originalURL: url, edits: defaultPhotoEdits(), folder: null };
  const { data, error } = await store.storage.from(RUTH_PRODUCT_PHOTO_BUCKET).download(folder + "/edits.json");
  if (error || !data) throw new Error("Fotoğrafın kayıtlı kırpma ayarları okunamadı.");
  const manifest = JSON.parse(await data.text());
  if (manifest.version !== 1) throw new Error("Fotoğraf kaydı sürümü desteklenmiyor.");
  return {
    originalURL: publicURL(store, folder + "/original"), folder,
    edits: {
      website: normalizedPhotoCrop(manifest.edits?.website),
      application: normalizedPhotoCrop(manifest.edits?.application),
    },
  };
}

// A photo is one immutable asset family: uncut source, two independent crops
// and their edit settings. Existing gallery URLs remain the website rendition;
// the iOS media resolver selects the sibling application rendition.
export async function createPhotoAsset(store: Storage, input: Buffer, edits: PhotoEdits) {
  if (!input.byteLength || input.byteLength > PRODUCT_IMAGE_MAX_BYTES) throw new Error("Görsel 24 MB sınırını aşamaz.");
  const metadata = await sharp(input, { limitInputPixels: 80_000_000 }).metadata();
  const mimeTypes: Record<string, string> = {
    jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif",
  };
  const format = metadata.format === "heif" && metadata.compression === "av1" ? "avif" : metadata.format;
  const mime = mimeTypes[format || ""];
  if (!mime) throw new Error("Desteklenmeyen fotoğraf biçimi.");
  const settings = {
    website: normalizedPhotoCrop(edits.website),
    application: normalizedPhotoCrop(edits.application),
  };
  const website = await transformProductImage(input, { ...settings.website, target: "website" });
  const application = await transformProductImage(input, { ...settings.application, target: "application" });
  const folder = "products/crops-v1/" + randomUUID();
  const files = [
    { path: folder + "/original", data: input, type: mime },
    { path: folder + "/website.webp", data: website.buffer, type: "image/webp" },
    { path: folder + "/application.webp", data: application.buffer, type: "image/webp" },
    { path: folder + "/edits.json", data: Buffer.from(JSON.stringify({ version: 1, edits: settings })), type: "application/json" },
  ];
  const bucket = store.storage.from(RUTH_PRODUCT_PHOTO_BUCKET);
  const uploaded: string[] = [];
  try {
    for (const file of files) {
      const { error } = await bucket.upload(file.path, file.data, {
        contentType: file.type, upsert: false, cacheControl: "31536000",
      });
      if (error) throw new Error(error.message);
      uploaded.push(file.path);
    }
  } catch (error) {
    if (uploaded.length) {
      try { await bucket.remove(uploaded); } catch { /* Preserve the original upload error. */ }
    }
    throw error;
  }
  return {
    url: publicURL(store, folder + "/website.webp"),
    applicationURL: publicURL(store, folder + "/application.webp"),
    originalURL: publicURL(store, folder + "/original"), edits: settings,
    width: 1200, height: 1600, aspect: "3:4", applicationAspect: "2:3",
    originalWidth: website.originalWidth, originalHeight: website.originalHeight,
    storage: RUTH_PRODUCT_PHOTO_SYSTEM_NAME, bucket: RUTH_PRODUCT_PHOTO_BUCKET,
  };
}
