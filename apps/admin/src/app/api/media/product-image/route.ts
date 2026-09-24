import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  PRODUCT_IMAGE_HEIGHT,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_WIDTH,
  transformProductImage,
} from "@/lib/productImagePipeline";
import {
  RUTH_PRODUCT_PHOTO_BUCKET,
  RUTH_PRODUCT_PHOTO_SYSTEM_NAME,
  ruthProductPhotoPath,
} from "@/lib/productPhotoStorage";

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
    const transformed = await transformProductImage(
      Buffer.from(await file.arrayBuffer()),
      {
        focalX: Number(form.get("focalX") ?? 0.5),
        focalY: Number(form.get("focalY") ?? 0.5),
        zoom: Number(form.get("zoom") ?? 1),
        rotation: Number(form.get("rotation") ?? 0),
      },
    );
    const { buffer, ...metadata } = transformed;
    const path = ruthProductPhotoPath(file.name, "original");

    const { error } = await auth.supabase.storage
      .from(RUTH_PRODUCT_PHOTO_BUCKET)
      .upload(path, buffer, {
        contentType: "image/webp",
        upsert: false,
        cacheControl: "31536000",
      });
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }

    const { data } = auth.supabase.storage
      .from(RUTH_PRODUCT_PHOTO_BUCKET)
      .getPublicUrl(path);
    return NextResponse.json({
      ok: true,
      url: data.publicUrl,
      width: PRODUCT_IMAGE_WIDTH,
      height: PRODUCT_IMAGE_HEIGHT,
      aspect: "3:4",
      storage: RUTH_PRODUCT_PHOTO_SYSTEM_NAME,
      bucket: RUTH_PRODUCT_PHOTO_BUCKET,
      ...metadata,
    });
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
