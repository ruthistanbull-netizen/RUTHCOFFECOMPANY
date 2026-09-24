import dns from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth";
import {
  RUTH_PRODUCT_PHOTO_BUCKET,
  RUTH_PRODUCT_PHOTO_SYSTEM_NAME,
  ruthProductPhotoPath,
} from "@/lib/productPhotoStorage";

export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 1600;

function finite(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function privateAddress(address: string) {
  if (address === "::1" || address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd")) return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 0;
}

async function safeImageUrl(value: unknown) {
  const url = value instanceof URL ? value : new URL(String(value || ""));
  if (url.protocol !== "https:") throw new Error("Görsel adresi HTTPS olmalı.");
  if (url.username || url.password) throw new Error("Kimlik bilgisi içeren görsel adresleri kullanılamaz.");

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) throw new Error("Geçersiz görsel adresi.");
  if (isIP(hostname)) {
    if (privateAddress(hostname)) throw new Error("Özel ağ adresleri kullanılamaz.");
  } else {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses.length || addresses.some((item) => privateAddress(item.address))) throw new Error("Görsel adresi güvenli değil.");
  }
  return url;
}

async function fetchSafeImage(initial: URL) {
  let current = initial;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    current = await safeImageUrl(current);
    const response = await fetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5" },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Görsel yönlendirmesi geçersiz.");
      if (redirectCount === MAX_REDIRECTS) throw new Error("Görsel çok fazla yönlendirme yaptı.");
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) throw new Error(`Görsel indirilemedi (${response.status}).`);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.startsWith("image/")) throw new Error("Adres bir görsel dosyası döndürmedi.");
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_SOURCE_BYTES) throw new Error("Görsel en fazla 24 MB olabilir.");
    return response;
  }
  throw new Error("Görsel indirilemedi.");
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const url = await safeImageUrl(body.url);
    const zoom = finite(body.zoom, 1, 1, 3);
    const rotation = Math.round(finite(body.rotation, 0, -360, 360) / 90) * 90;
    const offsetX = finite(body.offsetX, 0, -1, 1);
    const offsetY = finite(body.offsetY, 0, -1, 1);
    const flipX = Boolean(body.flipX);

    const response = await fetchSafeImage(url);
    const input = Buffer.from(await response.arrayBuffer());
    if (!input.length || input.length > MAX_SOURCE_BYTES) throw new Error("Görsel boyutu geçersiz.");

    let pipeline = sharp(input, { failOn: "error", limitInputPixels: 80_000_000 }).rotate(rotation);
    if (flipX) pipeline = pipeline.flop();

    const workWidth = Math.max(OUTPUT_WIDTH, Math.round(OUTPUT_WIDTH * zoom));
    const workHeight = Math.max(OUTPUT_HEIGHT, Math.round(OUTPUT_HEIGHT * zoom));
    const maxLeft = workWidth - OUTPUT_WIDTH;
    const maxTop = workHeight - OUTPUT_HEIGHT;
    const left = Math.round((offsetX + 1) * 0.5 * maxLeft);
    const top = Math.round((offsetY + 1) * 0.5 * maxTop);

    const output = await pipeline
      .resize(workWidth, workHeight, { fit: "cover", position: "centre" })
      .extract({ left, top, width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT })
      .webp({ quality: 91, effort: 4 })
      .toBuffer();

    const path = ruthProductPhotoPath("edited-product", "edited");
    const { error } = await auth.supabase.storage
      .from(RUTH_PRODUCT_PHOTO_BUCKET)
      .upload(path, output, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
    if (error) throw new Error(error.message);

    const { data } = auth.supabase.storage.from(RUTH_PRODUCT_PHOTO_BUCKET).getPublicUrl(path);
    return NextResponse.json({
      ok: true,
      url: data.publicUrl,
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      aspect: "3:4",
      storage: RUTH_PRODUCT_PHOTO_SYSTEM_NAME,
      bucket: RUTH_PRODUCT_PHOTO_BUCKET,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Görsel düzenlenemedi." }, { status: 400 });
  }
}
