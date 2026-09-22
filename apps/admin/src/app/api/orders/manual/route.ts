import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendOrderConfirmationEmail } from "@/lib/orderConfirmationEmail";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

const DEFAULT_FREE_SHIPPING_THRESHOLD = 2000;
const DEFAULT_CUSTOMER_SHIPPING_FEE = 79.9;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteMoney(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Number(number.toFixed(2))) : fallback;
}

function makeOrderNo(prefix = "MAN") {
  const yearCode = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Istanbul",
    year: "2-digit",
  }).format(new Date());
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `${prefix}${yearCode}${random}`;
}

function makeResumeToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function loadShippingSettings(supabase: any) {
  const { data } = await supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", "shipping_settings")
    .maybeSingle();
  const value = data?.setting_value && typeof data.setting_value === "object"
    ? data.setting_value as Record<string, unknown>
    : {};
  const threshold = Number(value.freeShippingThreshold ?? DEFAULT_FREE_SHIPPING_THRESHOLD);
  const fee = Number(value.customerShippingFee ?? value.shippingFee ?? DEFAULT_CUSTOMER_SHIPPING_FEE);
  return {
    freeShippingThreshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : DEFAULT_FREE_SHIPPING_THRESHOLD,
    customerShippingFee: Number.isFinite(fee) && fee >= 0 ? fee : DEFAULT_CUSTOMER_SHIPPING_FEE,
  };
}

async function resolveProfileId(supabase: any, email: string, phone: string) {
  const normalizedEmail = email.toLocaleLowerCase("tr-TR");
  const normalizedPhone = phone.replace(/\D/g, "").slice(-10);
  if (normalizedEmail) {
    const result = await supabase.from("profiles").select("id").ilike("email", normalizedEmail).maybeSingle();
    if (!result.error && result.data?.id) return String(result.data.id);
  }
  if (normalizedPhone) {
    const result = await supabase.from("profiles").select("id").eq("phone_normalized", normalizedPhone).maybeSingle();
    if (!result.error && result.data?.id) return String(result.data.id);
  }
  return null;
}

async function loadManualOrder(supabase: any, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_no, profile_id, customer_name, customer_email, customer_phone, subtotal, shipping_fee, discount_total, total_amount, currency, payment_status, shipping_city, shipping_town, shipping_address_line, customer_note, imported_source")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || "Sipariş bulunamadı.");
  if (String(data.imported_source || "") !== "manual" && !String(data.order_no || "").startsWith("MAN")) {
    throw new Error("Bu işlem yalnızca manuel siparişlerde kullanılabilir.");
  }
  return data;
}

async function createPaymentLinkForOrder(supabase: any, orderId: string) {
  const order = await loadManualOrder(supabase, orderId);
  if (String(order.payment_status || "") === "paid") throw new Error("Bu siparişin ödemesi zaten alınmış.");
  if (!clean(order.customer_email)) throw new Error("Ödeme linki için siparişte e-posta adresi olmalı.");
  if (!clean(order.shipping_city) || !clean(order.shipping_town) || !clean(order.shipping_address_line)) {
    throw new Error("Ödeme linki için siparişte il, ilçe ve açık adres olmalı.");
  }

  const { data: orderItems, error: itemError } = await supabase
    .from("order_items")
    .select("product_id, variant_id, product_slug, product_name, variant_name, quantity, unit_price, total_price, image_url")
    .eq("order_id", orderId);
  if (itemError) throw new Error(`Sipariş ürünleri alınamadı: ${itemError.message}`);
  if (!orderItems?.length) throw new Error("Siparişte ürün bulunamadı.");
  if (orderItems.some((item: any) => !item.product_id || !clean(item.product_slug))) {
    throw new Error("Ödeme linkinde yalnızca katalogdan seçilmiş ürünler kullanılabilir.");
  }

  const draftItems = orderItems.map((item: any) => ({
    productId: item.product_id,
    variantId: item.variant_id || null,
    productSlug: item.product_slug,
    productName: item.product_name,
    variantName: item.variant_name || null,
    quantity: Math.max(1, Number(item.quantity || 1)),
    unitPrice: Number(item.unit_price || 0),
    totalPrice: Number(item.total_price || 0),
    imageUrl: item.image_url || null,
    categoryIds: [],
    collectionIds: [],
  }));
  const customer = {
    fullName: clean(order.customer_name),
    email: clean(order.customer_email),
    phone: clean(order.customer_phone),
    city: clean(order.shipping_city),
    district: clean(order.shipping_town),
    neighborhood: "",
    addressLine: clean(order.shipping_address_line),
    postalCode: "",
    note: clean(order.customer_note) || "Panelden oluşturulan ödeme linki",
  };

  const { data: existingDraft, error: lookupError } = await supabase
    .from("checkout_drafts")
    .select("id, resume_token")
    .eq("merchant_oid", order.order_no)
    .maybeSingle();
  if (lookupError) throw new Error(`Ödeme taslağı kontrol edilemedi: ${lookupError.message}`);

  const siteUrl = (process.env.PAYMENT_SITE_URL || "https://rostacoffecompany.zeabur.app").replace(/\/$/, "");
  const existingToken = clean(existingDraft?.resume_token);
  if (existingDraft?.id && existingToken) {
    return { paymentLink: `${siteUrl}/checkout?draft=${encodeURIComponent(existingToken)}&payment=1`, orderNo: order.order_no, existing: true };
  }

  const resumeToken = makeResumeToken();
  const payload = {
    merchant_oid: order.order_no,
    order_no: order.order_no,
    profile_id: order.profile_id || null,
    customer,
    items: draftItems,
    subtotal: Number(order.subtotal || 0),
    shipping_fee: Number(order.shipping_fee || 0),
    discount_total: Number(order.discount_total || 0),
    total_amount: Number(order.total_amount || 0),
    currency: order.currency || "TRY",
    status: "waiting",
    order_id: null,
    resume_token: resumeToken,
    paytr_request: { source: "admin_payment_link", existing_order_id: order.id },
    callback_payload: null,
    failed_at: null,
    paid_at: null,
    updated_at: new Date().toISOString(),
  };
  const draftResult = existingDraft?.id
    ? await supabase.from("checkout_drafts").update(payload).eq("id", existingDraft.id)
    : await supabase.from("checkout_drafts").insert(payload);
  if (draftResult.error) throw new Error(`Ödeme linki oluşturulamadı: ${draftResult.error.message}`);
  return { paymentLink: `${siteUrl}/checkout?draft=${encodeURIComponent(resumeToken)}&payment=1`, orderNo: order.order_no, existing: false };
}

async function getExistingPaymentLink(supabase: any, orderId: string) {
  const order = await loadManualOrder(supabase, orderId);
  const { data: draft, error } = await supabase
    .from("checkout_drafts")
    .select("resume_token")
    .eq("merchant_oid", order.order_no)
    .maybeSingle();
  if (error) throw new Error(`Ödeme linki kontrol edilemedi: ${error.message}`);
  const token = clean(draft?.resume_token);
  const siteUrl = (process.env.PAYMENT_SITE_URL || "https://rostacoffecompany.zeabur.app").replace(/\/$/, "");
  return { paymentLink: token ? `${siteUrl}/checkout?draft=${encodeURIComponent(token)}&payment=1` : null, orderNo: order.order_no };
}

async function deleteManualOrder(supabase: any, orderId: string) {
  const order = await loadManualOrder(supabase, orderId);
  await supabase.from("checkout_drafts").delete().eq("merchant_oid", order.order_no);
  const itemDelete = await supabase.from("order_items").delete().eq("order_id", order.id);
  if (itemDelete.error) throw new Error(`Sipariş ürünleri silinemedi: ${itemDelete.error.message}`);
  const orderDelete = await supabase.from("orders").delete().eq("id", order.id);
  if (orderDelete.error) throw new Error(`Sipariş silinemedi: ${orderDelete.error.message}`);
  return { orderId: order.id, orderNo: order.order_no };
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const body = await request.json().catch(() => ({}));

  const action = clean(body.action);
  if (["create_payment_link", "get_payment_link", "delete_order"].includes(action)) {
    try {
      const orderId = clean(body.order_id);
      if (!orderId) throw new Error("Sipariş seçilmedi.");
      const result = action === "create_payment_link"
        ? await createPaymentLinkForOrder(supabase, orderId)
        : action === "get_payment_link"
          ? await getExistingPaymentLink(supabase, orderId)
          : await deleteManualOrder(supabase, orderId);
      const revalidate = action === "delete_order" ? await revalidateWebsite({ source: "admin-manual-order-delete" }) : null;
      return NextResponse.json({ ok: true, ...result, revalidate }, { headers: noStoreHeaders() });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Manuel sipariş işlemi tamamlanamadı." }, { status: 400, headers: noStoreHeaders() });
    }
  }

  const customerName = clean(body.customer_name);
  const customerEmail = clean(body.customer_email).toLocaleLowerCase("tr-TR");
  const customerPhone = clean(body.customer_phone);
  const shippingCity = clean(body.shipping_city);
  const shippingTown = clean(body.shipping_town);
  const shippingAddressLine = clean(body.shipping_address_line);
  const rawItems = Array.isArray(body.items) ? body.items : [];

  if (!customerName) return NextResponse.json({ ok: false, error: "Müşteri adı gerekli." }, { status: 400, headers: noStoreHeaders() });
  if (!customerPhone) return NextResponse.json({ ok: false, error: "Telefon gerekli." }, { status: 400, headers: noStoreHeaders() });
  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return NextResponse.json({ ok: false, error: "Geçerli e-posta gerekli." }, { status: 400, headers: noStoreHeaders() });
  }
  if (!shippingCity || !shippingTown || !shippingAddressLine) {
    return NextResponse.json({ ok: false, error: "İl, ilçe ve açık adres gerekli." }, { status: 400, headers: noStoreHeaders() });
  }
  if (!rawItems.length) return NextResponse.json({ ok: false, error: "En az 1 ürün ekle." }, { status: 400, headers: noStoreHeaders() });

  const items = rawItems.map((item: any) => {
    const quantity = Math.max(1, Math.trunc(Number(item.quantity || 1)));
    const unitPrice = finiteMoney(item.unit_price ?? item.price);
    return {
      product_id: clean(item.product_id) || null,
      variant_id: clean(item.variant_id) || null,
      product_slug: clean(item.product_slug),
      product_name: clean(item.product_name) || "Manuel ürün",
      variant_name: clean(item.variant_name) || null,
      quantity,
      unit_price: unitPrice,
      total_price: Number((unitPrice * quantity).toFixed(2)),
      image_url: clean(item.image_url) || null,
    };
  });
  if (items.some((item: any) => !item.product_id || !item.product_slug)) {
    return NextResponse.json({ ok: false, error: "Bütün ürünler katalogdan ve doğru varyantla seçilmeli." }, { status: 400, headers: noStoreHeaders() });
  }
  if (items.some((item: any) => item.unit_price <= 0)) {
    return NextResponse.json({ ok: false, error: "Bütün ürünlerde geçerli birim fiyat olmalı." }, { status: 400, headers: noStoreHeaders() });
  }

  const subtotal = Number(items.reduce((sum: number, item: any) => sum + item.total_price, 0).toFixed(2));
  const shippingSettings = await loadShippingSettings(supabase);
  const automaticShipping = subtotal >= shippingSettings.freeShippingThreshold ? 0 : shippingSettings.customerShippingFee;
  const shippingFee = body.shipping_fee == null ? automaticShipping : finiteMoney(body.shipping_fee, automaticShipping);
  const discountTotal = Math.min(subtotal + shippingFee, finiteMoney(body.discount_total));
  const totalAmount = Number((subtotal + shippingFee - discountTotal).toFixed(2));
  if (totalAmount <= 0) return NextResponse.json({ ok: false, error: "Genel toplam sıfırdan büyük olmalı." }, { status: 400, headers: noStoreHeaders() });

  const orderNo = clean(body.order_no) || makeOrderNo();
  const profileId = await resolveProfileId(supabase, customerEmail, customerPhone);
  const paymentStatus = ["paid", "waiting", "pending", "failed"].includes(clean(body.payment_status)) ? clean(body.payment_status) : "paid";
  const requestedStatus = paymentStatus === "paid" ? "paid" : "awaiting_payment";
  const basePayload = {
    order_no: orderNo,
    profile_id: profileId,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    subtotal,
    shipping_fee: shippingFee,
    discount_total: discountTotal,
    tax_total: 0,
    total_amount: totalAmount,
    currency: "TRY",
    payment_status: paymentStatus,
    cargo_company: null,
    cargo_tracking_no: null,
    customer_note: "Manuel panel siparişi",
    shipping_address_text: `${shippingAddressLine}, ${shippingTown}/${shippingCity}`,
    shipping_city: shippingCity,
    shipping_town: shippingTown,
    shipping_neighborhood: null,
    shipping_address_line: shippingAddressLine,
    shipping_postal_code: null,
    admin_note: clean(body.admin_note) || null,
    imported_source: "manual",
  };

  let order: { id: string; order_no: string } | null = null;
  let orderError: any = null;
  const candidates = [...new Set([requestedStatus, paymentStatus === "paid" ? "paid" : "awaiting_payment"])];
  for (const status of candidates) {
    const payload = status ? { ...basePayload, status } : basePayload;
    const result = await supabase.from("orders").insert(payload).select("id, order_no").single();
    if (!result.error && result.data) {
      order = result.data;
      orderError = null;
      break;
    }
    orderError = result.error;
    const statusConstraint = result.error?.code === "23514" || String(result.error?.message || "").includes("orders_status_check");
    if (!statusConstraint) break;
  }
  if (orderError || !order) {
    return NextResponse.json({ ok: false, error: orderError?.message || "Sipariş oluşturulamadı." }, { status: 400, headers: noStoreHeaders() });
  }

  const itemResult = await supabase.from("order_items").insert(items.map((item: any) => ({ order_id: order!.id, ...item })));
  if (itemResult.error) {
    await supabase.from("orders").delete().eq("id", order.id);
    return NextResponse.json({ ok: false, error: `Sipariş ürünleri kaydedilemedi: ${itemResult.error.message}` }, { status: 400, headers: noStoreHeaders() });
  }

  if (paymentStatus === "paid") {
    const stockResult = await supabase.rpc("apply_order_stock", { p_order_id: order.id });
    if (stockResult.error) {
      await supabase.from("order_items").delete().eq("order_id", order.id);
      await supabase.from("orders").delete().eq("id", order.id);
      return NextResponse.json({ ok: false, error: `Sipariş geri alındı; stok düşürülemedi: ${stockResult.error.message}` }, { status: 400, headers: noStoreHeaders() });
    }
  }

  const email = await sendOrderConfirmationEmail(supabase, order.id, profileId).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : "Sipariş maili gönderilemedi." }));
  const revalidate = await revalidateWebsite({ source: "admin-manual-order" });
  return NextResponse.json({
    ok: true,
    order,
    profile_id: profileId,
    shippingFee,
    discountTotal,
    freeShippingThreshold: shippingSettings.freeShippingThreshold,
    email,
    revalidate,
    warning: revalidate.ok ? null : revalidate.message,
  }, { headers: noStoreHeaders() });
}
