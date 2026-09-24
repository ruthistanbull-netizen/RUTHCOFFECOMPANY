import { NextResponse } from "next/server";
import type { Money, MoneyBreakdown, PaymentStatus } from "@ruth-commerce/contracts";
import { majorToMinorAmount, normalizePaymentSummary } from "@ruth-commerce/commerce-core";
import { requireAdmin } from "@/lib/auth";
import { applyRange } from "@/lib/ranges";
import { getLocalProductImage } from "@/lib/localProductImages";
import { normalizeOrderStatus } from "@/lib/statusLabels";
import { transitionAdminOrder } from "@/lib/orderStateTransitions";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";
import { enrichOrdersWithShippingAddresses } from "@/lib/shippingAddress";

export const runtime = "nodejs";
function money(amountMinor: number): Money { return { amountMinor, currency: "TRY" }; }
function persistedPricing(order: any): MoneyBreakdown { const totalDiscountMinor = majorToMinorAmount(order.discount_total); const pointsDiscountMinor = Math.min(totalDiscountMinor, majorToMinorAmount(order.reward_discount_total)); return { subtotal: money(majorToMinorAmount(order.subtotal ?? order.total_amount)), discount: money(totalDiscountMinor - pointsDiscountMinor), pointsDiscount: money(pointsDiscountMinor), shipping: money(majorToMinorAmount(order.shipping_fee ?? order.shipping_price)), tax: money(majorToMinorAmount(order.tax_total)), total: money(majorToMinorAmount(order.total_amount)), calculationId: `persisted-order:${String(order.id || order.order_no || "unknown")}` }; }
function canonicalPaymentStatus(value: unknown): PaymentStatus { switch (String(value || "").toLocaleLowerCase("tr-TR")) { case "requires_action": return "requires_action"; case "processing": return "processing"; case "authorized": return "authorized"; case "succeeded": case "paid": return "paid"; case "failed": return "failed"; case "cancelled": case "canceled": return "cancelled"; case "partially_refunded": return "partially_refunded"; case "refunded": return "refunded"; default: return "pending"; } }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function paymentSummaryForOrder(order: any, intent: any | null) { const orderAmountMinor = majorToMinorAmount(order.total_amount); if (!intent) { const manual = order.imported_source === "manual" || String(order.order_no || "").startsWith("MAN"); return normalizePaymentSummary({ source: "legacy", provider: manual ? "manual" : "legacy", method: "manual", status: canonicalPaymentStatus(order.payment_status), orderAmountMinor, chargedAmountMinor: orderAmountMinor, fallbackReason: "missing_payment_intent" }); } const metadata = record(intent.metadata); const rawRateBps = Number(metadata.installment_rate_bps); const rawRatePercent = Number(metadata.installment_rate); const installmentRateBps = Number.isFinite(rawRateBps) ? Math.round(rawRateBps) : Number.isFinite(rawRatePercent) ? Math.round(rawRatePercent * 100) : 0; const installmentCount = Math.trunc(Number(intent.installment_count ?? metadata.installment_count ?? 0)); const metadataMissing = installmentCount >= 2 && metadata.installment_fee_kurus == null && metadata.installment_rate_bps == null && metadata.installment_rate == null; return normalizePaymentSummary({ source: "commerce_v2", provider: "paytr", method: "card", status: canonicalPaymentStatus(intent.status ?? order.payment_status), orderAmountMinor: Number.isSafeInteger(Number(metadata.base_payment_amount_kurus)) ? Number(metadata.base_payment_amount_kurus) : orderAmountMinor, chargedAmountMinor: Number(intent.amount_kurus ?? metadata.payment_amount_kurus ?? orderAmountMinor), installmentFeeMinor: metadata.installment_fee_kurus == null ? null : Number(metadata.installment_fee_kurus), installmentCount, installmentRateBps, cardProgram: String(intent.card_type ?? metadata.card_type ?? "") || null, quoteId: String(metadata.quote_id ?? "") || null, providerReference: String(intent.merchant_oid ?? "") || null, paidAt: intent.succeeded_at ? String(intent.succeeded_at) : null, fallbackReason: metadataMissing ? "missing_quote_metadata" : undefined }); }
function safeImageValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function emptyQueryResult() { return Promise.resolve({ data: [] as any[], error: null as any }); }

export async function GET(request: Request) {
  const auth = await requireAdmin(request); if ("error" in auth) return auth.error;
  const { supabase } = auth; const url = new URL(request.url); const range = url.searchParams.get("range") || "all"; const search = (url.searchParams.get("q") || "").trim(); const payment = url.searchParams.get("payment") || "paid";
  let query = supabase.from("orders").select(`
      id, profile_id, order_no, customer_name, customer_email, customer_phone,
      total_amount, currency, status, payment_status, state_version, fulfillment_status,
      cancelled_at, delivered_at, cargo_company, cargo_tracking_no, cargo_tracking_url,
      customer_note, admin_note, imported_source, reminder_note, reminder_at,
      shipping_address_id, shipping_address_text, shipping_city, shipping_town,
      shipping_neighborhood, shipping_address_line, shipping_postal_code, shipping_recipient,
      shipping_provider, shipping_status, shipping_price, shipping_error,
      basit_kargo_order_id, basit_kargo_barcode, basit_kargo_handler_code,
      basit_kargo_return_barcode, subtotal, shipping_fee, discount_total,
      reward_discount_total, tax_total, traffic_source, traffic_medium, traffic_campaign,
      traffic_referrer, visitor_id, purchase_session_id, session_count_before_purchase,
      purchase_session_number, total_session_duration_seconds, purchase_session_duration_seconds,
      attribution_data, created_at,
      order_items (id, product_id, variant_id, product_slug, product_name, variant_name, quantity, unit_price, total_price, image_url)
    `).order("created_at", { ascending: false }).limit(120);
  query = applyRange(query, "created_at", range);
  if (payment === "paid") query = query.eq("payment_status", "paid"); else if (payment !== "all") query = query.eq("payment_status", payment);
  if (search) query = query.or(`order_no.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,customer_phone.ilike.%${search}%`);
  const { data, error } = await query; if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const orders = await enrichOrdersWithShippingAddresses(supabase, data || []);
  const orderIds = orders.map((order: any) => String(order.id || "")).filter(Boolean);
  const allItems = orders.flatMap((order: any) => order.order_items || []);

  // Ana katalog fotoğrafını garanti etmek için ürün görseli çözümlemesini tüm sipariş kalemlerine uygula.
  const imageLookupItems = allItems;
  const productIds = [...new Set<string>(imageLookupItems.map((item: any) => item.product_id).filter(Boolean).map(String))];
  const productSlugs = [...new Set<string>(imageLookupItems.map((item: any) => item.product_slug).filter(Boolean).map(String))];
  const productNames = [...new Set<string>(imageLookupItems.map((item: any) => item.product_name).filter(Boolean).map(String))];
  const variantIds = [...new Set<string>(imageLookupItems.map((item: any) => item.variant_id).filter(Boolean).map(String))];

  const variantsQuery = variantIds.length ? supabase.from("product_variants").select("id, image_url").in("id", variantIds) : emptyQueryResult();
  const variantImagesQuery = variantIds.length ? supabase.from("product_images").select("variant_id, image_url, sort_order").in("variant_id", variantIds).order("sort_order", { ascending: true }) : emptyQueryResult();
  const idProductsQuery = productIds.length ? supabase.from("products").select("id, name, slug, main_image_url").in("id", productIds) : emptyQueryResult();
  const slugProductsQuery = productSlugs.length ? supabase.from("products").select("id, name, slug, main_image_url").in("slug", productSlugs) : emptyQueryResult();
  const nameProductsQuery = productNames.length ? supabase.from("products").select("id, name, slug, main_image_url").in("name", productNames.slice(0, 120)).limit(140) : emptyQueryResult();
  const reviewMailsQuery = orderIds.length ? supabase.from("review_request_emails").select("order_id, status, sent_at, error_message").in("order_id", orderIds) : emptyQueryResult();
  const paymentIntentsQuery = orderIds.length ? supabase.from("payment_intents").select("id, order_id, merchant_oid, provider, status, amount_kurus, currency, installment_count, card_type, metadata, created_at, succeeded_at").in("order_id", orderIds).order("created_at", { ascending: false }) : emptyQueryResult();
  const [variantsResult, variantImagesResult, idProductsResult, slugProductsResult, nameProductsResult, reviewMailsResult, paymentIntentsResult] = await Promise.all([variantsQuery, variantImagesQuery, idProductsQuery, slugProductsQuery, nameProductsQuery, reviewMailsQuery, paymentIntentsQuery]);

  const variantImageById = new Map<string, string>();
  for (const variant of variantsResult.data || []) { const imageUrl = safeImageValue(variant.image_url); if (variant.id && imageUrl) variantImageById.set(String(variant.id), imageUrl); }
  for (const image of variantImagesResult.data || []) { const id = String(image.variant_id || ""); const imageUrl = safeImageValue(image.image_url); if (id && imageUrl && !variantImageById.has(id)) variantImageById.set(id, imageUrl); }

  const productRowsById = new Map<string, any>();
  for (const product of [...(idProductsResult.data || []), ...(slugProductsResult.data || []), ...(nameProductsResult.data || [])]) if (product?.id && !productRowsById.has(String(product.id))) productRowsById.set(String(product.id), product);
  const resolvedProductIds = [...productRowsById.keys()];
  const productImagesResult = resolvedProductIds.length ? await supabase.from("product_images").select("product_id, image_url, is_main, sort_order").in("product_id", resolvedProductIds).order("is_main", { ascending: false }).order("sort_order", { ascending: true }) : { data: [] as any[], error: null as any };

  const productImageById = new Map<string, string>();
  const productImageBySlug = new Map<string, string>();
  const productImageByName = new Map<string, string>();
  for (const product of productRowsById.values()) { const imageUrl = safeImageValue(product.main_image_url); if (imageUrl) { productImageById.set(String(product.id), imageUrl); if (product.slug) productImageBySlug.set(String(product.slug), imageUrl); if (product.name) productImageByName.set(String(product.name), imageUrl); } }
  for (const image of productImagesResult.data || []) { const productId = String(image.product_id || ""); const imageUrl = safeImageValue(image.image_url); if (!productId || !imageUrl || productImageById.has(productId)) continue; productImageById.set(productId, imageUrl); const product = productRowsById.get(productId); if (product?.slug && !productImageBySlug.has(String(product.slug))) productImageBySlug.set(String(product.slug), imageUrl); if (product?.name && !productImageByName.has(String(product.name))) productImageByName.set(String(product.name), imageUrl); }

  const reviewMailByOrderId = new Map<string, any>();
  for (const mail of reviewMailsResult.data || []) if (mail.order_id) reviewMailByOrderId.set(String(mail.order_id), mail);
  if (paymentIntentsResult.error) console.error("Admin order payment summaries could not be loaded", paymentIntentsResult.error);
  const paymentIntentByOrderId = new Map<string, any>();
  for (const intent of paymentIntentsResult.data || []) { const orderId = String(intent.order_id || ""); if (orderId && !paymentIntentByOrderId.has(orderId)) paymentIntentByOrderId.set(orderId, intent); }

  const normalizedOrders = orders.map((order: any) => { const reviewMail = reviewMailByOrderId.get(String(order.id)); const paymentIntent = paymentIntentByOrderId.get(String(order.id)) || null; return { ...order, status: normalizeOrderStatus(order.status, order), pricing: persistedPricing(order), paymentSummary: paymentSummaryForOrder(order, paymentIntent), review_email_status: reviewMail?.status || null, review_email_sent_at: reviewMail?.sent_at || null, review_email_error_message: reviewMail?.error_message || null,
      order_items: (order.order_items || []).map((item: any) => ({ ...item,
        // Ürün kartlarında snapshot/varyant görseli değil, katalog ana fotoğrafı gösterilir.
        image_url:
          (item.product_id ? productImageById.get(String(item.product_id)) : null) ||
          (item.product_slug ? productImageBySlug.get(String(item.product_slug)) : null) ||
          (item.product_name ? productImageByName.get(String(item.product_name)) : null) ||
          safeImageValue(item.image_url) ||
          (item.variant_id ? variantImageById.get(String(item.variant_id)) : null) ||
          getLocalProductImage(item.product_slug, item.product_name) ||
          null,
      })),
    }; });
  return NextResponse.json({ ok: true, orders: normalizedOrders }, { headers: { "Cache-Control": "private, no-store", "Server-Timing": "orders;desc=optimized" } });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request); if ("error" in auth) return auth.error;
  const { supabase } = auth; const body = await request.json(); const id = String(body.id || "");
  if (!id) return NextResponse.json({ ok: false, error: "Sipariş id yok." }, { status: 400, headers: noStoreHeaders() });
  const { data: currentOrder, error: currentOrderError } = await supabase.from("orders").select(`id, order_no, status, payment_status, state_version, shipping_status, shipping_provider, cargo_company, cargo_tracking_no, cargo_tracking_url, shipping_fee, tax_total, discount_total`).eq("id", id).single();
  if (currentOrderError || !currentOrder) return NextResponse.json({ ok: false, error: currentOrderError?.message || "Sipariş bulunamadı." }, { status: 404, headers: noStoreHeaders() });

  const requestedStatus = "status" in body ? String(body.status || "") : null;
  const update: Record<string, unknown> = {};
  for (const key of ["payment_status", "cargo_company", "cargo_tracking_no", "cargo_tracking_url", "admin_note", "reminder_note", "shipping_address_text", "shipping_city", "shipping_town", "shipping_neighborhood", "shipping_address_line", "shipping_postal_code"]) if (key in body) update[key] = body[key] || null;
  if ("reminder_at" in body) { if (!body.reminder_at) update.reminder_at = null; else { const reminderDate = new Date(String(body.reminder_at)); if (Number.isNaN(reminderDate.getTime())) return NextResponse.json({ ok: false, error: "Hatırlatma tarihi geçersiz." }, { status: 400, headers: noStoreHeaders() }); if (reminderDate.getTime() <= Date.now()) return NextResponse.json({ ok: false, error: "Hatırlatma tarihi geçmiş bir zaman olamaz." }, { status: 400, headers: noStoreHeaders() }); update.reminder_at = reminderDate.toISOString(); } }

  const incomingItems = Array.isArray(body.order_items) ? body.order_items : null;
  if (incomingItems) {
    const normalizedItems = incomingItems.map((item: any) => { const quantity = Math.max(1, Math.trunc(Number(item.quantity || 1))); const unitPrice = Math.max(0, Number(item.unit_price || 0)); return { product_id: item.product_id || null, variant_id: item.variant_id || null, product_slug: item.product_slug || "manual", product_name: String(item.product_name || "Ürün"), variant_name: item.variant_name || null, quantity, unit_price: unitPrice, total_price: quantity * unitPrice, image_url: item.image_url || null }; });
    if (!normalizedItems.length) return NextResponse.json({ ok: false, error: "Siparişte en az bir ürün olmalı." }, { status: 400, headers: noStoreHeaders() });
    const shippingFee = "shipping_fee" in body ? Number(body.shipping_fee || 0) : Number(currentOrder.shipping_fee || 0); const taxTotal = "tax_total" in body ? Number(body.tax_total || 0) : Number(currentOrder.tax_total || 0); const discountTotal = "discount_total" in body ? Number(body.discount_total || 0) : Number(currentOrder.discount_total || 0);
    const { error: replaceError } = await supabase.rpc("replace_order_items", { p_order_id: id, p_items: normalizedItems, p_shipping_fee: shippingFee, p_tax_total: taxTotal, p_discount_total: discountTotal });
    if (replaceError) return NextResponse.json({ ok: false, error: `${replaceError.message}. RUTH-TUM-SISTEM-FIX.sql dosyasını Supabase'te çalıştır.` }, { status: 400, headers: noStoreHeaders() });
  }

  update.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from("orders").update(update).eq("id", id).select(`id, order_no, status, payment_status, state_version, shipping_status, shipping_provider, cargo_company, cargo_tracking_no, cargo_tracking_url`).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });

  const previousPayment = String(currentOrder.payment_status || ""); const nextPayment = String(data.payment_status || previousPayment);
  if (previousPayment !== "paid" && nextPayment === "paid") { const { error: stockError } = await supabase.rpc("apply_order_stock", { p_order_id: id }); if (stockError) { await supabase.from("orders").update({ payment_status: previousPayment, updated_at: new Date().toISOString() }).eq("id", id); return NextResponse.json({ ok: false, error: `Ödeme durumu geri alındı; stok düşürülemedi: ${stockError.message}` }, { status: 400, headers: noStoreHeaders() }); } }
  if (previousPayment === "paid" && ["refunded", "cancelled", "canceled"].includes(nextPayment)) { const { error: restoreError } = await supabase.rpc("restore_order_stock", { p_order_id: id, p_reason: `payment_${nextPayment}` }); if (restoreError) { await supabase.from("orders").update({ payment_status: previousPayment, updated_at: new Date().toISOString() }).eq("id", id); return NextResponse.json({ ok: false, error: `Ödeme durumu geri alındı; stok geri eklenemedi: ${restoreError.message}` }, { status: 400, headers: noStoreHeaders() }); } }

  let finalOrder = data; let transitionCorrelationId: string | null = null;
  if (requestedStatus) { const transition = await transitionAdminOrder({ supabase, order: data, requestedStatus, actorId: String(auth.profile?.id || auth.user.id), reason: body.status_reason ? String(body.status_reason) : null, source: "admin-order-update", correlationId: String(request.headers.get("x-correlation-id") || crypto.randomUUID()), cargoCompany: data.cargo_company, trackingNumber: data.cargo_tracking_no, trackingUrl: data.cargo_tracking_url, metadata: { route: "/api/orders", items_replaced: Boolean(incomingItems), payment_changed: previousPayment !== nextPayment } }); if (transition.error) return NextResponse.json({ ok: false, error: transition.error.message, correlation_id: transition.correlationId || null }, { status: /another operation|reload and retry/i.test(transition.error.message) ? 409 : 400, headers: noStoreHeaders() }); finalOrder = transition.data || data; transitionCorrelationId = transition.correlationId || null; }

  const revalidate = await revalidateWebsite({ source: "admin-order-update" });
  return NextResponse.json({ ok: true, order: finalOrder, correlation_id: transitionCorrelationId, revalidate, warning: revalidate.ok ? null : revalidate.message }, { headers: noStoreHeaders() });
}
