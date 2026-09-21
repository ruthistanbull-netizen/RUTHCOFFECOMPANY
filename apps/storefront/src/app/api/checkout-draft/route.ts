import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asObj(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_RE.test(value);
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  const url = new URL(request.url);
  const token = clean(url.searchParams.get("draft"));

  if (!token) return NextResponse.json({ ok: false, error: "Sepet bağlantısı eksik." }, { status: 400 });

  const queryParts = [`resume_token.eq.${token}`, `merchant_oid.eq.${token}`, `order_no.eq.${token}`];
  if (isUuid(token)) queryParts.push(`id.eq.${token}`);

  const { data: draft, error } = await supabase
    .from("checkout_drafts")
    .select("id, merchant_oid, order_no, customer, items, subtotal, shipping_fee, discount_total, total_amount, currency, status, order_id, resume_token, paytr_request")
    .or(queryParts.join(","))
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!draft) return NextResponse.json({ ok: false, error: "Sepet bulunamadı." }, { status: 404 });

  if (draft.status === "paid" || draft.order_id) {
    return NextResponse.json({ ok: false, error: "Bu sepet zaten tamamlanmış." }, { status: 400 });
  }

  const customer = asObj(draft.customer);
  const items = Array.isArray(draft.items) ? draft.items : [];

  const cartItems = items.map((item: any) => {
    const slug = clean(item.productSlug || item.product_slug || item.slug);
    const variantId = clean(item.variantId || item.variant_id);
    const quantity = Math.max(1, Number(item.quantity || 1));

    return {
      key: `${slug}:${variantId || "standard"}`,
      id: clean(item.productId || item.product_id || slug),
      slug,
      name: clean(item.productName || item.product_name || "Ürün"),
      price: Number(item.unitPrice || item.unit_price || 0),
      currency: draft.currency || "TRY",
      image: clean(item.imageUrl || item.image_url) || null,
      material: null,
      finish: clean(item.variantName || item.variant_name) || "Standart",
      size: clean(item.variantName || item.variant_name) || "Standart",
      quantity,
      checkoutUrl: null,
    };
  }).filter((item: any) => item.slug && item.price > 0);

  return NextResponse.json({
    ok: true,
    draft: {
      orderNo: draft.order_no,
      merchantOid: draft.merchant_oid,
      subtotal: Number(draft.subtotal || 0),
      shippingFee: Number(draft.shipping_fee || 0),
      discountTotal: Number(draft.discount_total || 0),
      totalAmount: Number(draft.total_amount || 0),
      currency: draft.currency || "TRY",
      source: asObj(draft.paytr_request).source || null,
    },
    customer: {
      fullName: clean(customer.fullName || customer.full_name),
      email: clean(customer.email),
      phone: clean(customer.phone),
      city: clean(customer.city),
      district: clean(customer.district),
      neighborhood: clean(customer.neighborhood),
      addressLine: clean(customer.addressLine || customer.address_line),
      postalCode: clean(customer.postalCode || customer.postal_code),
      note: clean(customer.note),
    },
    items: cartItems,
  });
}
