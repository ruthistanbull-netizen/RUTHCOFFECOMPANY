import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = noStoreHeaders();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeText = (value: unknown) => typeof value === "string" ? value.trim() : "";
const deny = (error: string, status = 400) =>
  NextResponse.json({ ok: false, error }, { status, headers });

function validateURLs(input: unknown) {
  if (!Array.isArray(input) || input.length > 24) return null;
  const urls: string[] = [];
  for (const item of input) {
    const value = safeText(item);
    if (!value || value.length > 2048) return null;
    let parsed: URL;
    try { parsed = new URL(value); } catch { return null; }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || !parsed.hostname) return null;
    if (!urls.includes(value)) urls.push(value);
  }
  return urls;
}

const same = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

async function fetchVariant(supabase: any, productId: string, variantId: string) {
  const [variant, images] = await Promise.all([
    supabase.from("product_variants").select("id,product_id,name,image_url,is_active")
      .eq("id", variantId).eq("product_id", productId).maybeSingle(),
    supabase.from("product_images")
      .select("id,image_url,sort_order,is_main,alt_text")
      .eq("product_id", productId).eq("variant_id", variantId)
      .order("sort_order", { ascending: true }),
  ]);
  if (variant.error || images.error) {
    throw new Error(variant.error?.message || images.error?.message || "Varyant görselleri okunamadı.");
  }
  if (!variant.data) return null;
  const rows = (images.data || []) as Array<{
    id: string; image_url: string; sort_order: number; is_main: boolean; alt_text: string | null;
  }>;
  const urlList = rows.map((row) => safeText(row.image_url)).filter(Boolean);
  return { variant: variant.data, rows, urls: urlList };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const productId = safeText(url.searchParams.get("product_id"));
  const variantId = safeText(url.searchParams.get("variant_id"));
  if (!UUID.test(productId) || !UUID.test(variantId)) return deny("Varyant kimliği geçersiz.");
  try {
    const state = await fetchVariant(auth.supabase, productId, variantId);
    if (!state) return deny("Varyant bulunamadı.", 404);
    return NextResponse.json({
      ok: true, product_id: productId, variant_id: variantId,
      images: state.urls, primary: safeText(state.variant.image_url)
    }, { headers });
  } catch (error) {
    return deny(error instanceof Error ? error.message : "Görseller alınamadı.", 503);
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const productId = safeText(body?.product_id);
  const variantId = safeText(body?.variant_id);
  const requested = validateURLs(body?.images);
  const expected = validateURLs(body?.expected_images);
  if (!UUID.test(productId) || !UUID.test(variantId) || !requested || !expected) {
    return deny("Varyant veya görsel bilgileri geçersiz.");
  }
  let state: Awaited<ReturnType<typeof fetchVariant>>;
  try { state = await fetchVariant(auth.supabase, productId, variantId); }
  catch (error) { return deny(error instanceof Error ? error.message : "Görseller doğrulanamadı.", 503); }
  if (!state || state.variant.is_active === false) return deny("Aktif varyant bulunamadı.", 404);
  if (!same(state.urls, expected)) return deny("Varyant galerisi değişmiş. Yenileyip tekrar dene.", 409);
  if (same(state.urls, requested)) {
    return NextResponse.json({ ok: true, product_id: productId, variant_id: variantId, unchanged: true }, { headers });
  }

  const previousPrimary = state.variant.image_url || null;
  const nextPrimary = requested[0] || null;
  const label = safeText(state.variant.name) || "Varyant";

  const variantWrite = await auth.supabase.from("product_variants")
    .update({ image_url: nextPrimary, updated_at: new Date().toISOString() })
    .eq("id", variantId).eq("product_id", productId)
    .select("id,image_url").maybeSingle();
  if (variantWrite.error || !variantWrite.data) {
    return deny(variantWrite.error?.message || "Varyant görseli güncellenemedi.", 409);
  }

  let galleryError: string | null = null;
  const removal = await auth.supabase.from("product_images")
    .delete().eq("product_id", productId).eq("variant_id", variantId);
  if (removal.error) {
    galleryError = removal.error.message;
  } else if (requested.length) {
    const insert = await auth.supabase.from("product_images").insert(
      requested.map((image_url, index) => ({
        product_id: productId, variant_id: variantId, image_url, alt_text: label,
        sort_order: index, is_main: false
      }))
    );
    galleryError = insert.error?.message || null;
  }

  if (galleryError) {
    // Best-effort rollback on partial writes; never report this as success.
    await auth.supabase.from("product_variants")
      .update({ image_url: previousPrimary, updated_at: new Date().toISOString() })
      .eq("product_id", productId).eq("id", variantId);
    if (!removal.error) {
      await auth.supabase.from("product_images")
        .delete().eq("product_id", productId).eq("variant_id", variantId);
      if (state.rows.length) {
        await auth.supabase.from("product_images").insert(state.rows.map((row) => ({
          id: row.id, product_id: productId, variant_id: variantId,
          image_url: row.image_url, alt_text: row.alt_text,
          sort_order: row.sort_order, is_main: row.is_main
        })));
      }
    }
    return deny("Galeri kaydedilemedi; geri alma denendi: " + galleryError, 409);
  }

  let warning: string | null = null;
  try {
    const published = await revalidateWebsite({ source: "admin-ios-variant-gallery", productIds: [productId] });
    warning = published.ok ? null : published.message ?? "Mağaza yenilemesi doğrulanamadı.";
  } catch {
    warning = "Fotoğraflar kaydedildi ancak mağaza yenilemesi doğrulanamadı.";
  }
  return NextResponse.json({
    ok: true, product_id: productId, variant_id: variantId,
    images: requested, warning
  }, { headers });
}
