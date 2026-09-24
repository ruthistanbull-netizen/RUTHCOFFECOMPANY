import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getLocalProductImage } from "@/lib/localProductImages";
import { normalizeOrderStatus } from "@/lib/statusLabels";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function clean(value: unknown) { return String(value || "").trim(); }
function numeric(value: unknown) { const number = Number(value || 0); return Number.isFinite(number) ? number : 0; }
function safeImage(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function normalizeCurrency(value: unknown) { const raw = clean(value).toUpperCase(); if (!raw || raw === "TL" || raw === "TRL") return "TRY"; return /^[A-Z]{3}$/.test(raw) ? raw : "TRY"; }

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const orderId = clean(new URL(request.url).searchParams.get("order_id"));
  if (!orderId) return NextResponse.json({ ok: false, error: "Sipariş bilgisi eksik." }, { status: 400, headers: noStoreHeaders() });

  const [orderResult, emailResult, reviewResult, paymentResult] = await Promise.all([
    auth.supabase.from("orders").select(`
      id, profile_id, order_no, customer_name, customer_email, customer_phone,
      total_amount, currency, status, payment_status, fulfillment_status,
      cancelled_at, delivered_at, cargo_company, cargo_tracking_no, cargo_tracking_url,
      customer_note, admin_note, imported_source, reminder_note, reminder_at,
      shipping_address_id, shipping_address_text, shipping_city, shipping_town,
      shipping_neighborhood, shipping_address_line, shipping_postal_code,
      shipping_recipient, shipping_provider, shipping_status, shipping_price,
      shipping_error, basit_kargo_order_id, basit_kargo_barcode,
      basit_kargo_handler_code, basit_kargo_return_barcode, subtotal, shipping_fee,
      discount_total, automatic_discount_total, reward_discount_total, coupon_code,
      coupon_discount_total, applied_discounts, tax_total, traffic_source, traffic_medium,
      traffic_campaign, traffic_referrer, visitor_id, purchase_session_id,
      session_count_before_purchase, purchase_session_number,
      total_session_duration_seconds, purchase_session_duration_seconds,
      attribution_data, created_at,
      order_items (id, product_id, variant_id, product_slug, product_name, variant_name, quantity, unit_price, total_price, image_url)
    `).eq("id", orderId).single(),
    auth.supabase.from("email_logs").select("template_key,status,sent_at,error_message,created_at").eq("order_id", orderId).order("created_at", { ascending: true }),
    auth.supabase.from("review_request_emails").select("status,sent_at,error_message,created_at").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1),
    auth.supabase.from("payment_intents").select("merchant_oid,provider,status,amount_kurus,currency,installment_count,card_type,metadata,created_at,succeeded_at").eq("order_id", orderId).order("created_at", { ascending: false }).limit(1),
  ]);

  if (orderResult.error || !orderResult.data) return NextResponse.json({ ok: false, error: orderResult.error?.message || "Sipariş bulunamadı." }, { status: 404, headers: noStoreHeaders() });

  const order = orderResult.data as any;
  const orderCurrency = normalizeCurrency(order.currency);
  const productIds = [...new Set<string>((order.order_items || []).map((item: any) => clean(item.product_id)).filter(Boolean))];

  const [profileResult, productResult] = await Promise.all([
    order.profile_id ? auth.supabase.from("profiles").select("id,auth_user_id,reward_points_balance").eq("id", order.profile_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    productIds.length ? auth.supabase.from("products").select("id,name,slug,price,compare_at_price,currency,main_image_url").in("id", productIds) : Promise.resolve({ data: [], error: null }),
  ]);

  const productsById = new Map<string, any>();
  for (const product of productResult.data || []) productsById.set(String(product.id), product);

  const items = (order.order_items || []).map((item: any) => {
    const product = item.product_id ? productsById.get(String(item.product_id)) : null;
    const currentUnitPrice = Math.max(0, numeric(item.unit_price));
    const productPrice = Math.max(0, numeric(product?.price));
    const compareAtPrice = Math.max(0, numeric(product?.compare_at_price));
    const originalUnitPrice = Math.max(currentUnitPrice, productPrice, compareAtPrice);
    return {
      ...item,
      quantity: Math.max(1, Math.trunc(numeric(item.quantity) || 1)),
      unit_price: currentUnitPrice,
      total_price: Math.max(0, numeric(item.total_price)),
      // Panelde ürün olarak gösterilen görsel DAİMA katalogdaki ana fotoğraf.
      image_url: safeImage(product?.main_image_url) || safeImage(item.image_url) || getLocalProductImage(item.product_slug, item.product_name) || null,
      original_unit_price: originalUnitPrice,
      has_price_reduction: originalUnitPrice > currentUnitPrice + 0.001,
    };
  });

  const profile = profileResult.data as any;
  const payment = (paymentResult.data || [])[0] || null;
  const review = (reviewResult.data || [])[0] || null;

  return NextResponse.json({
    ok: true,
    source: "direct_order_detail",
    order: {
      ...order,
      currency: orderCurrency,
      status: normalizeOrderStatus(order.status, order),
      order_items: items,
      review_email_status: review?.status || null,
      review_email_sent_at: review?.sent_at || null,
      review_email_error_message: review?.error_message || null,
    },
    customer: { isMember: Boolean(profile?.auth_user_id), rewardPoints: Math.max(0, Math.floor(numeric(profile?.reward_points_balance))) },
    emailLogs: emailResult.error ? [] : emailResult.data || [],
    payment: payment ? {
      provider: payment.provider || "paytr",
      status: payment.status || order.payment_status,
      amountKurus: numeric(payment.amount_kurus),
      currency: normalizeCurrency(payment.currency || orderCurrency),
      installmentCount: Math.max(1, Math.trunc(numeric(payment.installment_count) || 1)),
      cardProgram: payment.card_type || null,
      providerReference: payment.merchant_oid || null,
      paidAt: payment.succeeded_at || null,
      metadata: payment.metadata || null,
    } : null,
  }, { headers: noStoreHeaders() });
}
