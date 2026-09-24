import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyRange } from "@/lib/ranges";
import { normalizeOrderStatus } from "@/lib/statusLabels";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

function majorToMinor(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function normalizedCurrency(value: unknown) {
  const raw = String(value || "TRY").trim().toUpperCase();
  return raw === "TL" || raw === "TRL" ? "TRY" : /^[A-Z]{3}$/.test(raw) ? raw : "TRY";
}

function persistedPricing(order: any) {
  const discountMinor = majorToMinor(order.discount_total);
  const pointsMinor = Math.min(discountMinor, majorToMinor(order.reward_discount_total));
  const currency = normalizedCurrency(order.currency);
  return {
    subtotal: { amountMinor: majorToMinor(order.subtotal ?? order.total_amount), currency },
    discount: { amountMinor: Math.max(0, discountMinor - pointsMinor), currency },
    pointsDiscount: { amountMinor: pointsMinor, currency },
    shipping: { amountMinor: majorToMinor(order.shipping_fee ?? order.shipping_price), currency },
    tax: { amountMinor: majorToMinor(order.tax_total), currency },
    total: { amountMinor: majorToMinor(order.total_amount), currency },
    calculationId: `persisted-order:${String(order.id || order.order_no || "unknown")}`,
  };
}

function minimalPaymentSummary(order: any) {
  const amountMinor = majorToMinor(order.total_amount);
  return {
    source: "order",
    provider: order.imported_source === "manual" ? "manual" : "paytr",
    method: order.imported_source === "manual" ? "manual" : "card",
    status: String(order.payment_status || "pending"),
    orderAmountMinor: amountMinor,
    chargedAmountMinor: amountMinor,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "all";
  const search = String(url.searchParams.get("q") || "").trim();
  const payment = url.searchParams.get("payment") || "all";

  let query = auth.supabase
    .from("orders")
    .select(`
      id,
      profile_id,
      order_no,
      customer_name,
      customer_email,
      customer_phone,
      total_amount,
      currency,
      status,
      payment_status,
      state_version,
      fulfillment_status,
      cancelled_at,
      delivered_at,
      cargo_company,
      cargo_tracking_no,
      cargo_tracking_url,
      customer_note,
      admin_note,
      imported_source,
      reminder_note,
      reminder_at,
      shipping_address_id,
      shipping_address_text,
      shipping_city,
      shipping_town,
      shipping_neighborhood,
      shipping_address_line,
      shipping_postal_code,
      shipping_recipient,
      shipping_provider,
      shipping_status,
      shipping_price,
      shipping_error,
      basit_kargo_order_id,
      basit_kargo_barcode,
      basit_kargo_handler_code,
      basit_kargo_return_barcode,
      subtotal,
      shipping_fee,
      discount_total,
      reward_discount_total,
      tax_total,
      traffic_source,
      traffic_medium,
      traffic_campaign,
      traffic_referrer,
      visitor_id,
      purchase_session_id,
      session_count_before_purchase,
      purchase_session_number,
      total_session_duration_seconds,
      purchase_session_duration_seconds,
      attribution_data,
      created_at,
      order_items (
        id,
        product_id,
        variant_id,
        product_slug,
        product_name,
        variant_name,
        quantity,
        unit_price,
        total_price,
        image_url
      )
    `)
    .order("created_at", { ascending: false });

  query = applyRange(query, "created_at", range);
  if (payment === "paid") query = query.eq("payment_status", "paid");
  else if (payment !== "all") query = query.eq("payment_status", payment);
  if (search) {
    query = query.or(`order_no.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,customer_phone.ilike.%${search}%`);
  }

  const { data, error } = await query.limit(120);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  }

  const orders = (data || []).map((order: any) => ({
    ...order,
    currency: normalizedCurrency(order.currency),
    status: normalizeOrderStatus(order.status, order),
    pricing: persistedPricing(order),
    paymentSummary: minimalPaymentSummary(order),
  }));

  return NextResponse.json({ ok: true, orders }, { headers: noStoreHeaders() });
}
