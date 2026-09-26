import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth";
import { RUTH_PRODUCT_PHOTO_BUCKET } from "@/lib/productPhotoStorage";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_BYTES = MAX_VIDEO_BYTES;
const PASSTHROUGH_TYPES: Record<string, { extension: string; contentType: string; mediaType?: "image" | "video" }> = {
  "image/jpeg": { extension: "jpg", contentType: "image/jpeg" },
  "image/png": { extension: "png", contentType: "image/png" },
  "image/webp": { extension: "webp", contentType: "image/webp" },
  "video/mp4": { extension: "mp4", contentType: "video/mp4", mediaType: "video" },
  "video/webm": { extension: "webm", contentType: "video/webm", mediaType: "video" },
  "video/quicktime": { extension: "mov", contentType: "video/quicktime", mediaType: "video" },
  "video/x-m4v": { extension: "m4v", contentType: "video/x-m4v", mediaType: "video" },
};
const CONVERT_TYPES = new Set([
  "image/avif",
  "image/heic",
  "image/heif",
  "image/x-heic",
  "image/x-heif",
]);

const execFileAsync = promisify(execFile);

async function browserSafeVideo(source: Uint8Array, extension: string) {
  const dir = await mkdtemp(join(tmpdir(), "rosta-theme-video-"));
  const input = join(dir, `input.${extension || "video"}`);
  const output = join(dir, "output.mp4");
  try {
    await writeFile(input, source);
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-i", input,
      "-map_metadata", "-1",
      "-an",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "22",
      "-pix_fmt", "yuv420p",
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-movflags", "+faststart",
      output,
    ], { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function safeName(value: string) {
  return String(value || "theme")
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "theme";
}

function fileKind(file: File) {
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  const passthrough = PASSTHROUGH_TYPES[type];
  if (passthrough) return { mode: "passthrough" as const, ...passthrough };
  if (/\.mp4$/.test(name)) return { mode: "passthrough" as const, extension: "mp4", contentType: "video/mp4", mediaType: "video" as const };
  if (/\.webm$/.test(name)) return { mode: "passthrough" as const, extension: "webm", contentType: "video/webm", mediaType: "video" as const };
  if (/\.mov$/.test(name)) return { mode: "passthrough" as const, extension: "mov", contentType: "video/quicktime", mediaType: "video" as const };
  if (/\.m4v$/.test(name)) return { mode: "passthrough" as const, extension: "m4v", contentType: "video/x-m4v", mediaType: "video" as const };
  if (CONVERT_TYPES.has(type) || /\.(avif|heic|heif)$/.test(name)) {
    return { mode: "convert" as const, extension: "webp", contentType: "image/webp", mediaType: "image" as const };
  }
  return null;
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES + 1_000_000) {
    return NextResponse.json({ ok: false, error: "Dosya boyutu en fazla 80 MB olabilir." }, { status: 413 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Dosya bulunamadı." }, { status: 400 });
  }
  const isVideo = String(file.type || "").toLowerCase().startsWith("video/") || /\.(mp4|m4v|mov|webm)$/i.test(file.name || "");
  const fileLimit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size <= 0 || file.size > fileLimit) {
    return NextResponse.json({ ok: false, error: isVideo ? "Video en fazla 80 MB olabilir." : "Görsel en fazla 24 MB olabilir." }, { status: 413 });
  }

  const kind = fileKind(file);
  if (!kind) {
    return NextResponse.json(
      { ok: false, error: "JPG, PNG, WebP, AVIF, HEIC, MP4, MOV veya WebM yükleyebilirsin." },
      { status: 415 },
    );
  }

  try {
    const source = new Uint8Array(await file.arrayBuffer());
    const video = kind.mediaType === "video";
    const uploadBytes = video
      ? await browserSafeVideo(source, kind.extension)
      : kind.mode === "convert"
        ? await sharp(source, { failOn: "none" })
            .rotate()
            .toColorspace("srgb")
            .webp({ quality: 92 })
            .toBuffer()
        : source;
    const outputExtension = video ? "mp4" : kind.extension;
    const outputContentType = video ? "video/mp4" : kind.contentType;

    if (uploadBytes.byteLength > MAX_VIDEO_BYTES) {
      return NextResponse.json({ ok: false, error: "İşlenmiş video 80 MB sınırını aşıyor." }, { status: 413 });
    }

    const path = `theme/${Date.now()}-${randomUUID()}-${safeName(file.name)}.${outputExtension}`;
    const { error } = await auth.supabase.storage
      .from(RUTH_PRODUCT_PHOTO_BUCKET)
      .upload(path, uploadBytes, {
        contentType: outputContentType,
        upsert: false,
        cacheControl: "31536000",
      });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    const { data } = auth.supabase.storage
      .from(RUTH_PRODUCT_PHOTO_BUCKET)
      .getPublicUrl(path);

    return NextResponse.json(
      {
        ok: true,
        url: data.publicUrl,
        converted: kind.mode === "convert" || video,
        videoNormalized: video,
        mediaType: kind.mediaType || "image",
        preservedAspectRatio: true,
        bytes: uploadBytes.byteLength,
        mime: outputContentType,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? `Medya işlenemedi: ${error.message}` : "Medya işlenemedi.",
      },
      { status: 400 },
    );
  }
}
