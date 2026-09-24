import { adminAuthHeaders, apiUrl } from "@/lib/adminApi";

const MAX_THEME_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_THEME_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_BROWSER_IMAGE_EDGE = 4096;

function looksLikeThemeImage(file: File) {
  if (file.type.startsWith("image/")) return true;
  return /\.(avif|heic|heif|jpe?g|png|webp)$/i.test(file.name || "");
}

function looksLikeThemeVideo(file: File) {
  if (file.type.startsWith("video/")) return true;
  return /\.(mp4|m4v|mov|webm)$/i.test(file.name || "");
}

function isIphonePhoto(file: File) {
  const type = String(file.type || "").toLowerCase();
  return type === "image/heic"
    || type === "image/heif"
    || type === "image/x-heic"
    || type === "image/x-heif"
    || /\.(heic|heif)$/i.test(file.name || "");
}

async function browserJpeg(file: File) {
  if (typeof document === "undefined" || typeof URL === "undefined") return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Görsel tarayıcıda açılamadı."));
      element.src = objectUrl;
    });

    const sourceWidth = Math.max(1, image.naturalWidth || image.width);
    const sourceHeight = Math.max(1, image.naturalHeight || image.height);
    const scale = Math.min(1, MAX_BROWSER_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });
    if (!blob) return null;
    const baseName = String(file.name || "iphone-photo").replace(/\.(heic|heif)$/i, "") || "iphone-photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function normalizedUploadFile(file: File) {
  if (!isIphonePhoto(file)) return file;
  return await browserJpeg(file) || file;
}

export async function uploadThemeImage(file: File) {
  if (!file || file.size <= 0) throw new Error("Bir fotoğraf veya video seç.");
  const isImage = looksLikeThemeImage(file);
  const isVideo = looksLikeThemeVideo(file);
  if (!isImage && !isVideo) throw new Error("JPG, PNG, WebP, AVIF, HEIC, MP4, MOV veya WebM yükleyebilirsin.");
  const maxBytes = isVideo ? MAX_THEME_VIDEO_BYTES : MAX_THEME_IMAGE_BYTES;
  if (file.size > maxBytes) throw new Error(isVideo ? "Video en fazla 80 MB olabilir." : "Görsel en fazla 24 MB olabilir.");

  const uploadFile = isImage ? await normalizedUploadFile(file) : file;
  if (uploadFile.size > maxBytes) throw new Error(isVideo ? "Video en fazla 80 MB olabilir." : "Görsel en fazla 24 MB olabilir.");

  const headers = await adminAuthHeaders();
  const body = new FormData();
  body.append("file", uploadFile);

  const response = await fetch(apiUrl("/api/theme/upload-image"), {
    method: "POST",
    headers,
    body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.url) {
    throw new Error(result?.error || "Görsel yüklenemedi.");
  }

  return String(result.url);
}
