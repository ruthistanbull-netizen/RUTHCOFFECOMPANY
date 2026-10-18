import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { PRODUCT_IMAGE_MAX_BYTES } from "@/lib/productImagePipeline";
import { createPhotoAsset, defaultPhotoEdits, normalizedPhotoCrop } from "@/lib/productPhotoAssets";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > PRODUCT_IMAGE_MAX_BYTES + 1_000_000) {
    return NextResponse.json(
      { ok: false, error: "Görsel en fazla 24 MB olabilir." },
      { status: 413 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Dosya bulunamadı." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > PRODUCT_IMAGE_MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Görsel en fazla 24 MB olabilir." },
      { status: 413 },
    );
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: "Yalnız JPG, PNG veya WebP görsel yüklenebilir." },
      { status: 415 },
    );
  }

  try {
    const edits = defaultPhotoEdits();
    edits.website = normalizedPhotoCrop({
      focalX: Number(form.get("focalX") ?? 0.5), focalY: Number(form.get("focalY") ?? 0.5),
      zoom: Number(form.get("zoom") ?? 1), rotation: Number(form.get("rotation") ?? 0),
    });
    const result = await createPhotoAsset(auth.supabase, Buffer.from(await file.arrayBuffer()), edits);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? `Görsel işlenemedi: ${error.message}` : "Görsel işlenemedi.",
      },
      { status: 400 },
    );
  }
}

