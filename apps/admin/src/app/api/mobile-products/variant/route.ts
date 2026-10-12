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
    warning = published.ok ? null : (published.message ?? "Mağaza yenilemesi doğrulanamadı.");
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

function variantError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status, headers });
}

function cleanVariantOptions(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 24) return null;
  const output: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    if (!key || key.startsWith("__") || key.length > 100
        || typeof rawValue !== "string" || !rawValue.trim()
        || rawValue.length > 180) return null;
    output[key] = rawValue.trim();
  }
  return output;
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const productId = text(body?.product_id);
  const name = text(body?.name);
  const price = number(body?.price);
  const stock = number(body?.stock);
  const options = cleanVariantOptions(body?.options);
  if (!productId || !name || name.length > 120 || !options
      || !Number.isFinite(price) || price <= 0 || price > 99999999
      || !Number.isInteger(stock) || stock < 0 || stock > 999999) {
    return variantError("Varyant adı, seçenekler, fiyat veya stok geçersiz.");
  }

  const { data: product, error: productError } = await auth.supabase
    .from("products").select("id, status").eq("id", productId).maybeSingle();
  if (productError || !product || ["deleted", "archived"].includes(String(product.status))) {
    return variantError("Bu markada aktif ürün bulunamadı.", 404);
  }
  const { data: existing, error: existingError } = await auth.supabase
    .from("product_variants").select("id, name, option_summary, is_active")
    .eq("product_id", productId);
  if (existingError) return variantError("Mevcut varyantlar okunamadı.", 503);
  const normalizedName = name.toLocaleLowerCase("tr-TR");
  if ((existing || []).some((item: any) => item.is_active !== false
      && String(item.option_summary || item.name || "").trim().toLocaleLowerCase("tr-TR")
        === normalizedName)) {
    return variantError("Bu isimde aktif varyant zaten var.", 409);
  }

  const variantId = crypto.randomUUID();
  const { data: saved, error: writeError } = await auth.supabase
    .from("product_variants")
    .insert({
      id: variantId, product_id: productId, name,
      option_summary: name, price: Math.round(price * 100) / 100, stock,
      stock_status: stock > 0 ? "in_stock" : "out_of_stock",
      is_active: true, sort_order: (existing || []).length, options,
      image_url: null, updated_at: new Date().toISOString(),
    })
    .select("id, product_id, name, price, stock").maybeSingle();
  if (writeError || !saved) return variantError(writeError?.message || "Varyant oluşturulamadı.", 400);
  let warning: string | null = null;
  try {
    const published = await revalidateWebsite({
      source: "admin-mobile-variant-create", productIds: [productId],
    });
    if (!published.ok) warning = published.message || "Mağaza yenilenemedi.";
  } catch {
    warning = "Varyant oluşturuldu; mağaza yenilemesi doğrulanamadı.";
  }
  return NextResponse.json({
    ok: true, product_id: productId, variant_id: String(saved.id), warning,
  }, { headers });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const productId = text(body?.product_id);
  const variantId = text(body?.variant_id);
  const expectedPrice = number(body?.expected_price);
  const expectedStock = number(body?.expected_stock);
  if (!productId || !variantId || !Number.isFinite(expectedPrice)
      || !Number.isInteger(expectedStock) || expectedStock < 0) {
    return variantError("Varyant kimliği ve eski fiyat/stok gerekli.");
  }
  const { data: rows, error: readError } = await auth.supabase
    .from("product_variants")
    .select("id, price, stock, is_active").eq("product_id", productId);
  if (readError) return variantError("Varyantlar okunamadı.", 503);
  const active = (rows || []).filter((row: any) => row.is_active !== false);
  const selected = active.find((row: any) => String(row.id) === variantId);
  if (!selected) return variantError("Aktif varyant bulunamadı.", 404);
  if (active.length < 2) return variantError(
    "Son aktif varyant arşivlenemez. Gerekirse ürünü arşivle.", 409);
  if (Math.abs(Number(selected.price) - expectedPrice) > 0.005
      || Number(selected.stock) !== expectedStock) {
    return variantError("Varyant başka bir işlemde değiştirildi. Yenile.", 409);
  }

  const { data: updated, error: updateError } = await auth.supabase
    .from("product_variants")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", variantId).eq("product_id", productId)
    .eq("is_active", true)
    .eq("price", expectedPrice).eq("stock", expectedStock)
    .select("id, is_active").maybeSingle();
  if (updateError) return variantError(updateError.message, 400);
  if (!updated || updated.is_active !== false) {
    return variantError("Varyant eş zamanlı değişti. Yenileyip kontrol et.", 409);
  }
  let warning: string | null = null;
  try {
    const published = await revalidateWebsite({
      source: "admin-mobile-variant-archive", productIds: [productId],
    });
    if (!published.ok) warning = published.message || "Mağaza yenilenemedi.";
  } catch {
    warning = "Arşivlendi; mağaza yenilemesi doğrulanamadı.";
  }
  return NextResponse.json({
    ok: true, product_id: productId, variant_id: variantId,
    archived: true, warning,
  }, { headers });
}
