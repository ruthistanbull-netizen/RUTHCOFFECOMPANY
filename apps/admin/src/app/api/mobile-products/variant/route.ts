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
