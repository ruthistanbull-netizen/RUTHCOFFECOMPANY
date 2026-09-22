import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type OrderItem = {
  id: string;
  product_id?: string | null;
  variant_id?: string | null;
  product_slug?: string | null;
  product_name: string;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url?: string | null;
};

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clientIp(request: Request) {
  return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function rateHash(request: Request, orderNo: string) {
  const salt = process.env.ORDER_TRACKING_RATE_LIMIT_SALT || "ruth-order-tracking-v1";
  return crypto.createHash("sha256").update(`${salt}|${clientIp(request)}|${orderNo.toLocaleUpperCase("tr-TR")}`).digest("hex");
}

function orderStatusLabel(status: string | null | undefined) {
  const normalized = clean(status).toLocaleLowerCase("tr-TR");
  if (["preparing", "ready", "processing", "hazırlanıyor", "hazirlaniyor"].includes(normalized)) return "Kargoya Hazır";
  if (["shipped", "sent", "cargo", "kargoda", "gönderildi", "gonderildi"].includes(normalized)) return "Gönderildi";
  if (["completed", "delivered", "fulfilled", "teslim", "teslim edildi"].includes(normalized)) return "Teslim Edildi";
  if (["cancelled", "canceled", "iptal"].includes(normalized)) return "İptal Edildi";
  return "Oluşturuldu";
}

function shippingStatusLabel(status: string | null | undefined) {
  const value = clean(status).toUpperCase();
  const labels: Record<string, string> = {
    NEW: "Yeni",
    READY_TO_SHIP: "Gönderime Hazır",
    SHIPPED: "Yolda",
    OUT_FOR_DELIVERY: "Dağıtıma Çıktı",
    DELIVERED: "Teslim Edildi",
    NEEDS_SUPPORT: "Destek Gerekiyor",
    DELAYED: "Gecikmeli",
    RETURNING: "Geri Dönüyor",
    RETURNED: "Geri Döndü",
    LOST: "Kayıp",
    CANCELLED: "İptal Edildi",
    CANCELED: "İptal Edildi",
  };
  return labels[value] || value || null;
}

function paymentStatusLabel(status: string | null | undefined) {
  const normalized = clean(status).toLocaleLowerCase("tr-TR");
  if (normalized === "paid") return "Ödeme Alındı";
  if (normalized === "waiting" || normalized === "pending") return "Ödeme Bekleniyor";
  if (normalized === "refunded") return "Ödeme İade Edildi";
  if (normalized === "failed") return "Ödeme Başarısız";
  return normalized || "-";
}

function contactMatches(order: any, contact: string) {
  const contactLower = contact.toLocaleLowerCase("tr-TR");
  const contactPhone = normalizePhone(contact);
  const orderEmail = clean(order.customer_email).toLocaleLowerCase("tr-TR");
  const orderPhone = normalizePhone(clean(order.customer_phone));

  if (contactLower && orderEmail && contactLower === orderEmail) return true;
  if (contactPhone && orderPhone && contactPhone === orderPhone) return true;
  return false;
}

async function attachItemImages(supabase: ReturnType<typeof getSupabaseAdmin>, items: OrderItem[]) {
  const productIds = [...new Set(items.map((item) => item.product_id).filter(Boolean).map(String))];
  const variantIds = [...new Set(items.map((item) => item.variant_id).filter(Boolean).map(String))];
  const productImageById = new Map<string, string>();
  const variantImageById = new Map<string, string>();

  if (variantIds.length > 0) {
    const { data: variants } = await supabase.from("product_variants").select("id, image_url").in("id", variantIds);
    for (const variant of variants || []) {
      if (variant.id && variant.image_url) variantImageById.set(String(variant.id), String(variant.image_url));
    }
  }

  if (productIds.length > 0) {
    const { data: products } = await supabase.from("products").select("id, slug, name, main_image_url").in("id", productIds);
    for (const product of products || []) {
      const image = product.main_image_url || null;
      if (product.id && image) productImageById.set(String(product.id), image);
    }
  }

  return items.map((item) => ({
    ...item,
    image_url:
      item.image_url ||
      (item.variant_id ? variantImageById.get(String(item.variant_id)) : null) ||
      (item.product_id ? productImageById.get(String(item.product_id)) : null) ||
      null,
  }));
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 10_000) return NextResponse.json({ ok: false, error: "Takip isteği çok büyük." }, { status: 413 });

    const body = await request.json().catch(() => ({}));
    const orderNo = clean(body.orderNo, 64);
    const contact = clean(body.contact, 180);

    if (!orderNo) return NextResponse.json({ ok: false, error: "Sipariş numarası gerekli." }, { status: 400 });
    if (!contact) return NextResponse.json({ ok: false, error: "E-posta veya telefon gerekli." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: allowed, error: rateError } = await supabase.rpc("claim_public_action_rate", {
      p_action: "order_tracking",
      p_identifier_hash: rateHash(request, orderNo),
      p_limit: 12,
      p_window_seconds: 900,
    });
    if (rateError) console.error("Order tracking rate limit failed", rateError);
    if (allowed === false) return NextResponse.json({ ok: false, error: "Çok fazla takip denemesi yapıldı. Lütfen 15 dakika sonra tekrar dene." }, { status: 429 });

    const { data: orders, error } = await supabase
      .from("orders")
      .select(`
        id, order_no, customer_name, customer_email, customer_phone, total_amount, currency,
        status, payment_status, cargo_company, cargo_tracking_no, shipping_address_text,
        shipping_status, basit_kargo_barcode, basit_kargo_return_barcode, created_at,
        shipping_events (id, event_type, status, status_label, tracking_no, barcode, event_time, created_at),
        order_items (id, product_id, variant_id, product_slug, product_name, variant_name, quantity, unit_price, total_price, image_url)
      `)
      .ilike("order_no", orderNo)
      .limit(2);

    if (error) throw new Error(error.message);
    const matched = (orders || []).find((order: any) => contactMatches(order, contact));
    if (!matched) return NextResponse.json({ ok: false, error: "Bu bilgilerle eşleşen sipariş bulunamadı." }, { status: 404 });

    const items = await attachItemImages(supabase, matched.order_items || []);
    const returnsResult = await supabase
      .from("returns_exchanges")
      .select("id, type, status, reason, amount, return_mode, refunded_items, exchange_items, refund_status, refund_provider, refund_reference, refunded_at, notes, created_at, updated_at")
      .eq("order_id", matched.id)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      ok: true,
      order: {
        id: matched.id,
        order_no: matched.order_no,
        customer_name: matched.customer_name,
        total_amount: Number(matched.total_amount || 0),
        currency: matched.currency || "TRY",
        status: matched.status || "created",
        status_label: orderStatusLabel(matched.status),
        payment_status: matched.payment_status || "waiting",
        payment_status_label: paymentStatusLabel(matched.payment_status),
        cargo_company: matched.cargo_company || null,
        cargo_tracking_no: matched.cargo_tracking_no || null,
        shipping_address_text: matched.shipping_address_text || null,
        shipping_status: matched.shipping_status || null,
        shipping_status_label: shippingStatusLabel(matched.shipping_status),
        basit_kargo_barcode: matched.basit_kargo_barcode || null,
        basit_kargo_return_barcode: matched.basit_kargo_return_barcode || null,
        shipping_events: [...(matched.shipping_events || [])].sort((a: any, b: any) => new Date(b.event_time || b.created_at || 0).getTime() - new Date(a.event_time || a.created_at || 0).getTime()).slice(0, 20),
        created_at: matched.created_at,
        order_items: items,
        return_cases: returnsResult.error ? [] : (returnsResult.data || []),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Order tracking failed", error);
    return NextResponse.json({ ok: false, error: "Sipariş takip şu anda çalışmadı. Lütfen daha sonra tekrar dene." }, { status: 400 });
  }
}
