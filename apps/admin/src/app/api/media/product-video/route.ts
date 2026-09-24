import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";
import {
  RUTH_PRODUCT_PHOTO_BUCKET,
  RUTH_PRODUCT_PHOTO_FOLDER,
  RUTH_PRODUCT_PHOTO_SYSTEM_NAME,
} from "@/lib/productPhotoStorage";

export const runtime = "nodejs";

const PRODUCT_VIDEO_MAX_BYTES = 60 * 1024 * 1024;
const TUS_VERSION = "1.0.0";
const TUS_SESSION_TIMEOUT_MS = 15_000;
const PRODUCT_MEDIA_MIME_TYPES = [
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;
const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

type VideoUploadRequest = {
  fileName?: string;
  fileSize?: number;
  contentType?: string;
};

function safeFileStem(fileName: string) {
  return String(fileName || "product-video")
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "product-video";
}

function normalizedContentType(contentType: string, fileName: string) {
  const cleanType = String(contentType || "").trim().toLowerCase();
  if (ALLOWED_VIDEO_MIME_TYPES.has(cleanType)) return cleanType;
  const cleanName = String(fileName || "").toLowerCase();
  if (cleanName.endsWith(".webm")) return "video/webm";
  if (cleanName.endsWith(".mov")) return "video/quicktime";
  if (cleanName.endsWith(".mp4") || cleanName.endsWith(".m4v")) return "video/mp4";
  return "";
}

function extensionFor(contentType: string) {
  if (contentType === "video/webm") return "webm";
  if (contentType === "video/quicktime") return "mov";
  return "mp4";
}

function base64Utf8(value: string) {
  return Buffer.from(String(value), "utf8").toString("base64");
}

function tusMetadata(entries: Record<string, string>) {
  return Object.entries(entries)
    .map(([key, value]) => `${key} ${base64Utf8(value)}`)
    .join(",");
}

function storageOrigin() {
  const base = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  return new URL(base).origin;
}

function serviceStorageHeaders() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!key) throw new Error("Supabase service-role anahtarı eksik.");

  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

async function ensureProductMediaBucket(supabase: SupabaseClient) {
  // Only expand MIME support. Do not override fileSizeLimit here: a bucket limit
  // cannot exceed the self-hosted Storage global object-size limit, and forcing
  // 60 MB can make the bucket update itself fail before an upload starts.
  const { error } = await supabase.storage.updateBucket(RUTH_PRODUCT_PHOTO_BUCKET, {
    public: true,
    allowedMimeTypes: [...PRODUCT_MEDIA_MIME_TYPES],
  });
  if (error) {
    throw new Error(`Ürün medya bucket ayarı güncellenemedi: ${error.message}`);
  }
}

async function createTusSession(input: {
  path: string;
  fileSize: number;
  contentType: string;
}) {
  const endpoint = `${storageOrigin()}/storage/v1/upload/resumable`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TUS_SESSION_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...serviceStorageHeaders(),
        "Tus-Resumable": TUS_VERSION,
        "Upload-Length": String(input.fileSize),
        "Upload-Metadata": tusMetadata({
          bucketName: RUTH_PRODUCT_PHOTO_BUCKET,
          objectName: input.path,
          contentType: input.contentType,
          cacheControl: "31536000",
        }),
        "x-upsert": "false",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const rawMessage = await response.text().catch(() => "");
      const lower = rawMessage.toLowerCase();
      const message = lower.includes("maximum allowed size") || lower.includes("exceeded the maximum")
        ? "Video, Storage sunucusunun izin verdiği maksimum dosya boyutunu aşıyor."
        : rawMessage;
      throw new Error(message || `Storage resumable oturumu oluşturulamadı (${response.status}).`);
    }

    const location = response.headers.get("Location") || response.headers.get("location");
    if (!location) throw new Error("Storage resumable oturum adresi dönmedi.");
    return new URL(location, endpoint).toString();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Storage resumable oturumu 15 saniye içinde başlatılamadı.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  let body: VideoUploadRequest = {};
  try {
    body = await request.json() as VideoUploadRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Video yükleme bilgileri okunamadı." }, { status: 400 });
  }

  const fileName = String(body.fileName || "product-video").trim();
  const fileSize = Number(body.fileSize || 0);
  const contentType = normalizedContentType(String(body.contentType || ""), fileName);

  if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json({ ok: false, error: "Video dosyası bilgileri eksik." }, { status: 400 });
  }
  if (fileSize > PRODUCT_VIDEO_MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Video en fazla 60 MB olabilir." }, { status: 413 });
  }
  if (!contentType) {
    return NextResponse.json(
      { ok: false, error: "Yalnız MP4, WebM veya MOV video yüklenebilir." },
      { status: 415 },
    );
  }

  const extension = extensionFor(contentType);
  const path = `${RUTH_PRODUCT_PHOTO_FOLDER}/videos/${Date.now()}-${randomUUID()}-${safeFileStem(fileName)}.${extension}`;

  try {
    await ensureProductMediaBucket(auth.supabase);

    const uploadUrl = await createTusSession({
      path,
      fileSize,
      contentType,
    });

    const { data: publicData } = auth.supabase.storage
      .from(RUTH_PRODUCT_PHOTO_BUCKET)
      .getPublicUrl(path);

    return NextResponse.json(
      {
        ok: true,
        uploadUrl,
        path,
        url: publicData.publicUrl,
        mediaType: "video",
        contentType,
        aspect: "3:4",
        storage: RUTH_PRODUCT_PHOTO_SYSTEM_NAME,
        bucket: RUTH_PRODUCT_PHOTO_BUCKET,
        maxBytes: PRODUCT_VIDEO_MAX_BYTES,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? `Video yükleme başlatılamadı: ${error.message}` : "Video yükleme başlatılamadı.",
      },
      { status: 400 },
    );
  }
}
