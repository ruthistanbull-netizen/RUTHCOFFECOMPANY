import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = noStoreHeaders();

const number = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const productId = text(body?.product_id);
  const variantId = text(body?.variant_id);
  const price = number(body?.price);
  const stock = number(body?.stock);
  const oldPrice = number(body?.expected_price);
  const oldStock = number(body?.expected_stock);

  if (!productId || !variantId || !Number.isInteger(stock) || stock < 0 ||
      stock > 999999 || !Number.isFinite(price) || price <= 0 ||
      price > 99999999 || !Number.isFinite(oldPrice) ||
      !Number.isInteger(oldStock) || oldStock < 0) {
    return NextResponse.json({ ok: false, error: "Varyant bilgileri geçersiz." },
      { status: 400, headers });
  }

  const { data: existing, error: readError } = await auth.supabase
    .from("product_variants")
    .select("id, product_id, price, stock, stock_status, is_active")
    .eq("id", variantId).eq("product_id", productId).maybeSingle();

  if (readError || !existing) {
    return NextResponse.json({ ok: false, error: "Bu markada varyant bulunamadı." },
      { status: 404, headers });
  }
  if (Math.abs(Number(existing.price) - oldPrice) > 0.005 ||
      Number(existing.stock) !== oldStock) {
    return NextResponse.json({ ok: false, error: "Varyant başka bir işlemle değişti. Sayfayı yenile." },
      { status: 409, headers });
  }
  const rounded = Math.round(price * 100) / 100;
  const { data: saved, error: writeError } = await auth.supabase
    .from("product_variants")
    .update({
      price: rounded,
      stock,
      stock_status: stock > 0 ? "in_stock" : "out_of_stock",
      updated_at: new Date().toISOString(),
    })
    .eq("id", variantId).eq("product_id", productId)
    .eq("stock", oldStock).eq("price", oldPrice)
    .select("id, product_id, price, stock").maybeSingle();

  if (writeError) return NextResponse.json({ ok: false, error: "Varyant kaydedilemedi." }, { status: 400, headers });
  if (!saved) return NextResponse.json({ ok: false, error: "Varyant değişmiş olabilir. Yeniden yükle." }, { status: 409, headers });

  const verified = Math.abs(Number(saved.price) - rounded) < 0.005 && Number(saved.stock) === stock;
  if (!verified) return NextResponse.json({ ok: false, error: "Kayıt doğrulanamadı." }, { status: 500, headers });

  // Persistence already succeeded. A storefront revalidation error must
  // not turn this response into a false failure that invites unsafe retries.
  let warning: string | null = null;
  try {
    const published = await revalidateWebsite({
      source: "admin-mobile-variant-update", productIds: [productId],
    });
    warning = published.ok ? null : published.message;
  } catch {
    warning = "Varyant kaydedildi ancak storefront yenilemesi doğrulanamadı.";
  }
  return NextResponse.json({
    ok: true,
    product_id: productId,
    variant_id: variantId,
    price: Number(saved.price),
    stock: Number(saved.stock),
    warning,
  }, { headers });
}


// Mobile creation does not rewrite other variants or related media.
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const productId = text(body?.product_id);
  const name = text(body?.name);
  const price = number(body?.price), stock = number(body?.stock);
  if (!/^[0-9a-f-]{36}$/i.test(productId) || !name || name.length > 120 ||
      !(price > 0 && price <= 99999999) || !Number.isInteger(stock) || stock < 0 || stock > 999999) {
    return NextResponse.json({ ok: false, error: "Varyant alanları geçersiz." }, { status: 400, headers });
  }
  const candidate = body?.options;
  if (candidate && (typeof candidate !== "object" || Array.isArray(candidate))) {
    return NextResponse.json({ ok: false, error: "Seçenek biçimi geçersiz." }, { status: 400, headers });
  }
  const options = Object.entries((candidate || {}) as Record<string, unknown>);
  if (options.length > 24 || options.some(([key, value]) =>
    !key || key.length > 100 || typeof value !== "string" || value.length > 180)) {
    return NextResponse.json({ ok: false, error: "Seçenek değerleri geçersiz." }, { status: 400, headers });
  }
  const { data: product, error: pError } = await auth.supabase.from("products")
    .select("id, status, main_image_url").eq("id", productId).maybeSingle();
  if (pError || !product || ["archived", "deleted"].includes(String(product.status))) {
    return NextResponse.json({ ok: false, error: "Ürün bulunamadı." }, { status: 404, headers });
  }
  const { data: siblings, error: sError } = await auth.supabase.from("product_variants")
    .select("id, option_summary, is_active").eq("product_id", productId).limit(201);
  if (sError || !Array.isArray(siblings)) {
    return NextResponse.json({ ok: false, error: "Varyant listesi yüklenemedi." }, { status: 503, headers });
  }
  if (siblings.length >= 200 || siblings.some((v: any) => v.is_active !== false &&
      text(v.option_summary).toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"))) {
    return NextResponse.json({ ok: false, error: "Aynı isimli aktif varyant mevcut." }, { status: 409, headers });
  }
  const { data: saved, error } = await auth.supabase.from("product_variants")
    .insert({
      id: crypto.randomUUID(), product_id: productId,
      name, option_summary: name, options: Object.fromEntries(options),
      price: Math.round(price * 100) / 100, stock,
      stock_status: stock > 0 ? "in_stock" : "out_of_stock", is_active: true,
      sort_order: siblings.length,
      image_url: product.main_image_url || null, updated_at: new Date().toISOString()
    }).select("id, product_id").single();
  if (error || !saved) return NextResponse.json({ ok: false, error: error?.message || "Varyant kaydedilemedi." }, { status: 400, headers });
  let warning: string | null = null;
  try {
    const result = await revalidateWebsite({ source: "admin-ios-variant-create", productIds: [productId] });
    warning = result.ok ? null : result.message;
  } catch { warning = "Varyant kaydedildi, mağaza yenilemesi doğrulanamadı."; }
  return NextResponse.json({ ok: true, product_id: productId, variant_id: saved.id, warning }, { headers });
}

// Archive instead of deleting: historic order records keep referencing variant ID.
export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const productId = text(body?.product_id), variantId = text(body?.variant_id);
  const oldPrice = number(body?.expected_price), oldStock = number(body?.expected_stock);
  if (!/^[0-9a-f-]{36}$/i.test(productId) || !/^[0-9a-f-]{36}$/i.test(variantId) ||
      !Number.isFinite(oldPrice) || !Number.isInteger(oldStock) || oldStock < 0) {
    return NextResponse.json({ ok: false, error: "Varyant kimliği geçersiz." }, { status: 400, headers });
  }
  const { data: active, error: readError } = await auth.supabase.from("product_variants")
    .select("id, price, stock").eq("product_id", productId).eq("is_active", true).limit(201);
  if (readError || !Array.isArray(active)) {
    return NextResponse.json({ ok: false, error: "Varyantlar doğrulanamadı." }, { status: 503, headers });
  }
  const existing = active.find((row: any) => String(row.id) === variantId);
  if (!existing || active.length <= 1) {
    return NextResponse.json({ ok: false, error: "Son aktif varyant arşivlenemez veya varyant bulunamadı." }, { status: 409, headers });
  }
  if (Math.abs(Number(existing.price) - oldPrice) > 0.005 || Number(existing.stock) !== oldStock) {
    return NextResponse.json({ ok: false, error: "Varyant değişmiş, yeniden yükle." }, { status: 409, headers });
  }
  const { data: saved, error } = await auth.supabase.from("product_variants")
    .update({ is_active: false, stock_status: "archived", updated_at: new Date().toISOString() })
    .eq("product_id", productId).eq("id", variantId).eq("is_active", true)
    .eq("price", oldPrice).eq("stock", oldStock)
    .select("id, is_active").maybeSingle();
  if (error || !saved || saved.is_active !== false) {
    return NextResponse.json({ ok: false, error: error?.message || "Varyant arşivlenemedi." }, { status: 409, headers });
  }
  let warning: string | null = null;
  try {
    const result = await revalidateWebsite({ source: "admin-ios-variant-archive", productIds: [productId] });
    warning = result.ok ? null : result.message;
  } catch { warning = "Arşivleme kaydedildi, mağaza yenilemesi doğrulanamadı."; }
  return NextResponse.json({ ok: true, product_id: productId, variant_id: variantId, archived: true, warning }, { headers });
}
