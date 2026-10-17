import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { PRODUCT_IMAGE_MAX_BYTES } from "@/lib/productImagePipeline";
import { createPhotoAsset, defaultPhotoEdits, normalizedPhotoCrop } from "@/lib/productPhotoAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Görsel dosyası bulunamadı." },
      { status: 400 },
    );
  }
  if (file.size <= 0 || file.size > PRODUCT_IMAGE_MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Görsel 24 MB sınırını aşamaz." },
      { status: 400 },
    );
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { ok: false, error: "Yalnız görsel dosyaları yüklenebilir." },
      { status: 400 },
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
        error: error instanceof Error ? error.message : "Görsel işlenemedi.",
      },
      { status: 400 },
    );
  }
}

