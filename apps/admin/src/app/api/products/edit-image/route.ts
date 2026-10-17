import dns from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { RUTH_PRODUCT_PHOTO_BUCKET } from "@/lib/productPhotoStorage";
import { createPhotoAsset, readPhotoAsset, normalizedPhotoCrop } from "@/lib/productPhotoAssets";
export const runtime = "nodejs";

const MAX_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_REDIRECTS = 4;

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

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const url = await safeImageUrl(new URL(request.url).searchParams.get("url"));
    const asset = await readPhotoAsset(auth.supabase, url.toString());
    return NextResponse.json({ ok: true, originalURL: asset.originalURL, edits: asset.edits,
      hasRenditions: Boolean(asset.folder) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Fotoğraf okunamadı." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const body = await request.json();
    if (!body.edits?.website || !body.edits?.application) throw new Error("İki gösterim ayarı da gerekli. Düzenleyiciyi yenile.");
    const edits = {
      website: normalizedPhotoCrop(body.edits.website),
      application: normalizedPhotoCrop(body.edits.application),
    };
    const url = await safeImageUrl(body.url);
    const asset = await readPhotoAsset(auth.supabase, url.toString());
    let input: Buffer;
    if (asset.folder) {
      const { data, error } = await auth.supabase.storage.from(RUTH_PRODUCT_PHOTO_BUCKET)
        .download(asset.folder + "/original");
      if (error || !data) throw new Error("Orijinal fotoğraf okunamadı.");
      if (data.size > MAX_SOURCE_BYTES) throw new Error("Görsel en fazla 24 MB olabilir.");
      input = Buffer.from(await data.arrayBuffer());
    } else {
      const response = await fetchSafeImage(url);
      input = Buffer.from(await response.arrayBuffer());
    }
    if (!input.length || input.length > MAX_SOURCE_BYTES) throw new Error("Görsel boyutu geçersiz.");

    const result = await createPhotoAsset(auth.supabase, input, edits);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Görsel düzenlenemedi." }, { status: 400 });
  }
}
