import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const url = String(body.url || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ ok: false, error: "Düzenlenecek görsel adresi geçersiz." }, { status: 400 });
  }

  try {
    const source = await fetch(url, { cache: "no-store" });
    if (!source.ok) throw new Error("Kaynak görsel indirilemedi.");
    const bytes = Buffer.from(await source.arrayBuffer());
    if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw new Error("Kaynak görsel boyutu desteklenmiyor.");

    const rotationRaw = Number(body.rotation || 0);
    const rotation = [0, 90, 180, 270].includes(((rotationRaw % 360) + 360) % 360)
      ? ((rotationRaw % 360) + 360) % 360
      : 0;
    const zoom = clamp(Number(body.zoom || 1), 1, 4);
    const offsetX = clamp(Number(body.offsetX || 0), -800, 800);
    const offsetY = clamp(Number(body.offsetY || 0), -800, 800);

    const targetWidth = 1200;
    const targetHeight = 1600;
    const workWidth = Math.ceil(targetWidth * zoom);
    const workHeight = Math.ceil(targetHeight * zoom);

    let pipeline = sharp(bytes, { failOn: "none" }).rotate(rotation);
    if (body.flipX === true) pipeline = pipeline.flop();

    const prepared = await pipeline
      .resize(workWidth, workHeight, { fit: "cover", position: "centre", withoutEnlargement: false })
      .toBuffer();

    const maxLeft = Math.max(0, workWidth - targetWidth);
    const maxTop = Math.max(0, workHeight - targetHeight);
    const left = clamp(Math.round(maxLeft / 2 - offsetX), 0, maxLeft);
    const top = clamp(Math.round(maxTop / 2 - offsetY), 0, maxTop);

    const output = await sharp(prepared)
      .extract({ left, top, width: targetWidth, height: targetHeight })
      .webp({ quality: 92, effort: 4 })
      .toBuffer();

    const storagePath = `products/edited/${Date.now()}-${randomUUID().slice(0, 10)}.webp`;
    const uploaded = await auth.supabase.storage.from("rosta-media").upload(storagePath, output, {
      contentType: "image/webp",
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploaded.error) throw new Error(uploaded.error.message);

    const { data } = auth.supabase.storage.from("rosta-media").getPublicUrl(storagePath);
    return NextResponse.json({ ok: true, url: data.publicUrl, path: storagePath });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Görsel düzenlenemedi.",
    }, { status: 400 });
  }
}
