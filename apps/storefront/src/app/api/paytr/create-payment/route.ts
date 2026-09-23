import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createCheckoutDraft, updateCheckoutDraftPaytrRequest } from "@/lib/orderServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const PAYTR_TOKEN_URL = "https://www.paytr.com/odeme/api/get-token";
const PAYTR_IFRAME_URL = "https://www.paytr.com/odeme/guvenli";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function requiredEnv(name: string) {
  const raw = process.env[name]?.trim();
  if (!raw) throw new Error(`${name} env eksik.`);
  const value = raw.replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!value) throw new Error(`${name} env eksik.`);
  return value;
}

function envChoice(name: string, fallback: string, allowed: string[]) {
  const value = (process.env[name] || fallback).trim();
  return allowed.includes(value) ? value : fallback;
}

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const candidate = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim();
  return (candidate || "127.0.0.1").replace(/^::ffff:/i, "").slice(0, 39);
}

function hmacBase64(data: string, key: string) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("base64");
}

function toPaytrAmount(value: number) {
  const amount = Math.round(Number(value || 0) * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Ödeme tutarı geçersiz.");
  return String(amount);
}

function toBase64Utf8(value: string) {
  return Buffer.from(value, "utf8").toString("base64");
}

function safeText(value: unknown, maxLength: number) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeEmail(value: unknown) {
  const email = safeText(value, 100).toLocaleLowerCase("tr-TR");
  if (!/^[\x20-\x7E]+$/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("PayTR ödeme için geçerli, Türkçe karakter içermeyen bir e-posta adresi gerekli.");
  }
  return email;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function variantIdFromKey(key: string) {
  const [, variantId] = key.split(":");
  if (!variantId || variantId === "standard") return "";
  return variantId;
}

function cartSignature(items: unknown) {
  if (!Array.isArray(items)) return "[]";
  const normalized = items
    .map((item: any) => ({
      product: clean(item.productSlug || item.product_slug || item.slug || item.productId || item.product_id || item.id),
      variant: clean(item.variantId || item.variant_id) || variantIdFromKey(clean(item.key)),
      quantity: Math.max(1, Number(item.quantity || 1)),
    }))
    .sort((left, right) => `${left.product}|${left.variant}`.localeCompare(`${right.product}|${right.variant}`));
  return JSON.stringify(normalized);
}

function customerMatches(left: Record<string, any>, right: Record<string, any>) {
  const leftEmail = clean(left.email).toLocaleLowerCase("tr-TR");
  const rightEmail = clean(right.email).toLocaleLowerCase("tr-TR");
  if (leftEmail && rightEmail && leftEmail === rightEmail) return true;

  const leftPhone = clean(left.phone).replace(/\D/g, "").slice(-10);
  const rightPhone = clean(right.phone).replace(/\D/g, "").slice(-10);
  return Boolean(leftPhone && rightPhone && leftPhone === rightPhone);
}

async function prepareUnchangedDraftForReuse({
  token,
  items,
  customer,
}: {
  token: unknown;
  items: unknown;
  customer: Record<string, any>;
}) {
  const draftToken = clean(token);
  if (!draftToken) return;

  const supabase = getSupabaseAdmin();
  const queryParts = [`resume_token.eq.${draftToken}`, `merchant_oid.eq.${draftToken}`, `order_no.eq.${draftToken}`];
  const { data: existing, error } = await supabase
    .from("checkout_drafts")
    .select("id, status, order_id, paytr_token, items, customer")
    .or(queryParts.join(","))
    .maybeSingle();

  if (error || !existing || existing.order_id || existing.status === "paid") return;

  const hasReachedPayment = Boolean(existing.paytr_token || existing.status === "failed");
  if (!hasReachedPayment) return;

  const unchangedCart = cartSignature(existing.items) === cartSignature(items);
  const sameCustomer = customerMatches((existing.customer || {}) as Record<string, any>, customer || {});
  if (!unchangedCart || !sameCustomer) return;

  // Aynı müşteri + aynı ürün/varyant/adet için yeni checkout_draft oluşturma.
  // PayTR ödeme denemeleri payment_attempts tablosunda ayrı ayrı tutulmaya devam eder.
  await supabase
    .from("checkout_drafts")
    .update({
      paytr_token: null,
      status: "waiting",
      failed_at: null,
      callback_payload: {
        source: "payment_retry",
        retried_at: new Date().toISOString(),
        abandoned_logic: "reuse_unchanged_cart",
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
}

function buildDiscountedBasket(
  items: { productName: string; variantName: string | null; quantity: number; totalPrice: number }[],
  discountTotal: number,
  shippingFee: number,
) {
  const subtotalKurus = items.reduce((sum, item) => sum + Math.round(Number(item.totalPrice || 0) * 100), 0);
  let remainingDiscountKurus = Math.min(Math.max(Math.round(Number(discountTotal || 0) * 100), 0), subtotalKurus);
  const basket: [string, string, number][] = items.map((item, index) => {
    const quantity = Math.max(1, Math.trunc(Number(item.quantity || 1)));
    const lineKurus = Math.round(Number(item.totalPrice || 0) * 100);
    const proportional = index === items.length - 1 || subtotalKurus <= 0
      ? remainingDiscountKurus
      : Math.min(remainingDiscountKurus, Math.round((lineKurus / subtotalKurus) * Math.round(Number(discountTotal || 0) * 100)));
    remainingDiscountKurus -= proportional;
    const discountedLineKurus = Math.max(quantity, lineKurus - proportional);
    const unitKurus = Math.round(discountedLineKurus / quantity);
    const productName = item.variantName ? `${item.productName} - ${item.variantName}` : item.productName;
    return [safeText(productName, 120), (unitKurus / 100).toFixed(2), quantity];
  });
  const shippingKurus = Math.round(Number(shippingFee || 0) * 100);
  if (shippingKurus > 0) basket.push(["Kargo", (shippingKurus / 100).toFixed(2), 1]);
  return basket;
}

async function requestPaytrToken(params: URLSearchParams) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(PAYTR_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      cache: "no-store",
      signal: controller.signal,
    });
    const raw = await response.text();
    let result: { status?: string; token?: string; reason?: string };
    try { result = JSON.parse(raw); } catch { throw new Error(`PayTR geçersiz yanıt verdi (${response.status}).`); }
    if (!response.ok || result.status !== "success" || !result.token) throw new Error(result.reason || `PayTR token alınamadı (${response.status}).`);
    return result.token;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("PayTR bağlantısı zaman aşımına uğradı. Tekrar dene.");
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function POST(request: Request) {
  try {
    const merchantId = requiredEnv("PAYTR_MERCHANT_ID");
    const merchantKey = requiredEnv("PAYTR_MERCHANT_KEY");
    const merchantSalt = requiredEnv("PAYTR_MERCHANT_SALT");
    const siteUrl = requiredEnv("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");
    const testMode = envChoice("PAYTR_TEST_MODE", "1", ["0", "1"]);
    const debugOn = envChoice("PAYTR_DEBUG_ON", testMode === "1" ? "1" : "0", ["0", "1"]);
    const noInstallment = envChoice("PAYTR_NO_INSTALLMENT", "0", ["0", "1"]);
    const maxInstallment = envChoice("PAYTR_MAX_INSTALLMENT", "0", ["0", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    const body = await request.json();
    const incomingDraftToken = body.draftToken || body.resumeToken || body.abandonedDraftToken || null;

    await prepareUnchangedDraftForReuse({
      token: incomingDraftToken,
      items: body.items || [],
      customer: body.customer || {},
    });

    const draft = await createCheckoutDraft({
      customer: body.customer || {},
      items: body.items || [],
      authToken: bearerToken(request),
      existingDraftToken: incomingDraftToken,
      rewards: body.rewards || null,
      coupon: body.coupon || null,
      attribution: body.attribution || null,
    });

    const userIp = getClientIp(request);
    const email = safeEmail(draft.customer.email);
    const paymentAmount = toPaytrAmount(draft.totalAmount);
    const paymentAmountKurus = Number(paymentAmount);
    const currency = "TL";
    const userBasket = toBase64Utf8(JSON.stringify(buildDiscountedBasket(draft.items, draft.discountTotal, draft.shippingFee)));
    const hashStr = `${merchantId}${userIp}${draft.merchantOid}${email}${paymentAmount}${userBasket}${noInstallment}${maxInstallment}${currency}${testMode}`;
    const paytrToken = hmacBase64(`${hashStr}${merchantSalt}`, merchantKey);

    const params = new URLSearchParams({
      merchant_id: merchantId,
      user_ip: userIp,
      merchant_oid: draft.merchantOid,
      email,
      payment_amount: paymentAmount,
      user_basket: userBasket,
      no_installment: noInstallment,
      max_installment: maxInstallment,
      currency,
      test_mode: testMode,
      paytr_token: paytrToken,
      user_name: safeText(draft.customer.fullName, 60),
      user_address: safeText([draft.customer.neighborhood, draft.customer.addressLine, `${draft.customer.district}/${draft.customer.city}`, draft.customer.postalCode].filter(Boolean).join(", "), 400),
      user_phone: safeText(draft.customer.phone, 20),
      merchant_ok_url: `${siteUrl}/order-success?order=${encodeURIComponent(draft.orderNo)}`,
      merchant_fail_url: `${siteUrl}/order-fail?order=${encodeURIComponent(draft.orderNo)}`,
      timeout_limit: "30",
      debug_on: debugOn,
      lang: "tr",
      iframe_v2: "1",
      iframe_v2_dark: "0",
    });

    const iframeToken = await requestPaytrToken(params);
    const supabase = getSupabaseAdmin();
    const intentKey = `paytr:iframe:intent:${draft.merchantOid}`;
    const metadata = {
      integration_type: "iframe_v2",
      merchant_id: merchantId,
      merchant_oid: draft.merchantOid,
      order_no: draft.orderNo,
      payment_amount: paymentAmount,
      payment_amount_kurus: paymentAmountKurus,
      currency,
      test_mode: testMode,
      no_installment: noInstallment,
      max_installment: maxInstallment,
      iframe_v2: true,
      server_pricing: true,
      engine_version: "payment-engine-v2-paytr-iframe",
    };

    const { data: intent, error: intentError } = await supabase.from("payment_intents").upsert({
      checkout_draft_id: draft.draftId,
      merchant_oid: draft.merchantOid,
      provider: "paytr",
      status: "requires_action",
      amount_kurus: paymentAmountKurus,
      currency,
      installment_count: 0,
      card_type: null,
      idempotency_key: intentKey,
      metadata,
    }, { onConflict: "provider,merchant_oid" }).select("id").single();
    if (intentError || !intent) throw new Error(`Ödeme intent kaydı oluşturulamadı: ${intentError?.message || "kayıt dönmedi"}`);

    const { data: latestAttempt, error: attemptLookupError } = await supabase.from("payment_attempts").select("attempt_no").eq("payment_intent_id", intent.id).order("attempt_no", { ascending: false }).limit(1).maybeSingle();
    if (attemptLookupError) throw new Error(`Ödeme denemesi okunamadı: ${attemptLookupError.message}`);
    const nextAttemptNo = Number(latestAttempt?.attempt_no || 0) + 1;
    const requestFingerprint = crypto.createHash("sha256").update(`${draft.merchantOid}|${paymentAmount}|iframe_v2|${nextAttemptNo}`, "utf8").digest("hex");
    const { data: attempt, error: attemptError } = await supabase.from("payment_attempts").insert({
      payment_intent_id: intent.id,
      attempt_no: nextAttemptNo,
      provider: "paytr",
      status: "prepared",
      amount_kurus: paymentAmountKurus,
      installment_count: 0,
      card_type: null,
      bin_prefix: null,
      provider_reference: draft.merchantOid,
      request_fingerprint: requestFingerprint,
      provider_payload: { integration_type: "iframe_v2", test_mode: testMode, no_installment: noInstallment, max_installment: maxInstallment },
    }).select("id").single();
    if (attemptError || !attempt) throw new Error(`Ödeme denemesi kaydedilemedi: ${attemptError?.message || "kayıt dönmedi"}`);

    await updateCheckoutDraftPaytrRequest({
      merchantOid: draft.merchantOid,
      paytrToken: iframeToken,
      paytrRequest: { ...metadata, token_url: PAYTR_TOKEN_URL, payment_intent_id: intent.id, payment_attempt_id: attempt.id, payment_attempt_no: nextAttemptNo, request_fingerprint: requestFingerprint },
    });

    return NextResponse.json({
      ok: true,
      orderNo: draft.orderNo,
      merchantOid: draft.merchantOid,
      resumeToken: draft.resumeToken,
      token: iframeToken,
      iframeUrl: `${PAYTR_IFRAME_URL}/${encodeURIComponent(iframeToken)}`,
      testMode: testMode === "1",
      paymentAmount: paymentAmountKurus / 100,
      paymentIntentId: intent.id,
      paymentAttemptId: attempt.id,
      paymentAttemptNo: nextAttemptNo,
    });
  } catch (error) {
    console.error("PayTR iframe token error", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Ödeme başlatılamadı." }, { status: 400 });
  }
}
