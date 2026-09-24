import crypto from "node:crypto";
import {
  PAYTR_ENDPOINTS,
  createPaytrBinToken,
  createPaytrDirectToken,
  createPaytrInstallmentToken,
  calculatePaymentTerms,
  paytrHmacBase64,
  paytrSafeEqual,
  postPaytrForm,
  verifyPaytrCallbackPayload,
} from "@ruth-commerce/commerce-core";
import { buildPaytrBasket, type CheckoutOrderDraft } from "@/lib/commerce/orderEngine";

export const PAYTR_DIRECT_URL = PAYTR_ENDPOINTS.directPayment;
const PAYTR_BIN_URL = PAYTR_ENDPOINTS.binDetail;
const PAYTR_INSTALLMENT_URL = PAYTR_ENDPOINTS.installmentRates;
const ALLOWED_CARD_TYPES = new Set(["advantage", "axess", "combo", "bonus", "cardfinans", "maximum", "paraf", "world", "saglamkart"]);

export function requiredEnv(name: string) {
  const raw = process.env[name]?.trim();
  if (!raw) throw new Error(`${name} env eksik.`);
  const value = raw.replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!value) throw new Error(`${name} env eksik.`);
  return value;
}

export function envChoice(name: string, fallback: string, allowed: string[]) {
  const value = (process.env[name] || fallback).trim();
  return allowed.includes(value) ? value : fallback;
}

export function hmacBase64(data: string, key: string) {
  return paytrHmacBase64(data, key);
}

export function secureEqual(left: string, right: string) {
  return paytrSafeEqual(left, right);
}

export function safeText(value: unknown, maxLength: number) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function getClientIp(request: Request) {
  const candidate =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "127.0.0.1";
  return candidate.replace(/^::ffff:/i, "").slice(0, 39);
}

async function postForm(url: string, params: URLSearchParams) {
  return postPaytrForm(url, Object.fromEntries(params.entries()));
}

function normalize(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

function toNumber(value: unknown) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function extractRate(value: Record<string, unknown>) {
  for (const candidate of [value.rate, value.ratio, value.oran, value.taksit_orani, value.commission_rate]) {
    const number = toNumber(candidate);
    if (number !== null && number >= 0 && number < 100) return number;
  }
  return null;
}

function collectRates(node: unknown, brand: string, result: Map<number, number>, matched = false) {
  if (Array.isArray(node)) {
    for (const item of node) collectRates(item, brand, result, matched);
    return;
  }
  if (!node || typeof node !== "object") return;
  const object = node as Record<string, unknown>;
  const current = matched || normalize(object.card_type ?? object.cardType ?? object.brand) === brand;
  const count = Math.trunc(Number(object.installment_count ?? object.installment ?? object.taksit ?? object.taksit_sayisi ?? object.count));
  const rate = extractRate(object);
  if (current && count >= 2 && count <= 12 && rate !== null) result.set(count, rate);
  for (const [key, value] of Object.entries(object)) {
    const normalizedKey = normalize(key);
    const next = current || normalizedKey === brand;
    const match = normalizedKey.match(/^(?:taksit[_-]?)?(1[0-2]|[2-9])(?:[_-]?(?:taksit|oran|ratio))?$/);
    if (next && match) {
      const number = toNumber(value);
      if (number !== null && number >= 0 && number < 100) result.set(Number(match[1]), number);
    }
    collectRates(value, brand, result, next);
  }
}

export async function verifyInstallment(input: {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  binNumber: string;
  installment: number;
  requestedCardType?: string;
}) {
  if (input.installment <= 0) return { cardType: "", rate: 0 };
  if (!/^\d{6,8}$/.test(input.binNumber)) throw new Error("Taksit doğrulaması için kart numaranı tekrar kontrol et.");

  const credentials = { merchantId: input.merchantId, merchantKey: input.merchantKey, merchantSalt: input.merchantSalt };
  const binToken = createPaytrBinToken({ ...credentials, binNumber: input.binNumber });
  const bin = await postForm(PAYTR_BIN_URL, new URLSearchParams({ merchant_id: input.merchantId, bin_number: input.binNumber, paytr_token: binToken }));
  if (bin.status !== "success") throw new Error(String(bin.err_msg || "Kart programı PayTR tarafından doğrulanamadı."));

  const type = normalize(bin.cardType || bin.card_type);
  const brand = normalize(bin.brand || "none");
  if (type !== "credit" || brand === "none" || !ALLOWED_CARD_TYPES.has(brand)) throw new Error("Bu kart taksitli işleme uygun değil.");
  if (input.requestedCardType && normalize(input.requestedCardType) !== brand) throw new Error("Kart programı doğrulaması başarısız oldu.");

  const requestId = `${Date.now()}${crypto.randomBytes(4).toString("hex")}`.slice(0, 32);
  const token = createPaytrInstallmentToken({ ...credentials, requestId });
  const table = await postForm(PAYTR_INSTALLMENT_URL, new URLSearchParams({
    merchant_id: input.merchantId,
    request_id: requestId,
    paytr_token: token,
    single_ratio: "1",
    abroad_ratio: "1",
  }));
  if (table.status !== "success") throw new Error(String(table.err_msg || "Taksit oranı PayTR'den alınamadı."));

  const max = Math.max(0, Math.min(12, Math.trunc(Number(table.max_inst_non_bus || 12))));
  if (input.installment > max) throw new Error("Seçilen taksit sayısı mağaza limitini aşıyor.");
  const rates = new Map<number, number>();
  collectRates(table.oranlar ?? table.rates, brand, rates);
  const rate = rates.get(input.installment);
  if (rate === undefined) throw new Error("Seçilen taksit için güncel PayTR oranı bulunamadı.");
  return { cardType: brand, rate };
}

export function calculatePayment(baseAmount: number, installment: number, rate: number) {
  const terms = calculatePaymentTerms({
    orderAmountMinor: Math.round(baseAmount * 100),
    installmentCount: installment,
    installmentRateBps: Math.round(rate * 100),
  });
  return {
    baseKurus: terms.orderAmount.amountMinor,
    paymentKurus: terms.chargedAmount.amountMinor,
    feeKurus: terms.installmentFee.amountMinor,
    rateBps: terms.rateBps,
    paymentAmount: (terms.chargedAmount.amountMinor / 100).toFixed(2),
  };
}

export function createPaytrRequest(input: {
  draft: CheckoutOrderDraft;
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  siteUrl: string;
  userIp: string;
  testMode: string;
  debugOn: string;
  installment: number;
  cardType: string;
  rate: number;
}) {
  const payment = calculatePayment(input.draft.totalAmount, input.installment, input.rate);
  const email = safeText(input.draft.customer.email, 100).toLocaleLowerCase("tr-TR");
  if (!/^[\x20-\x7E]+$/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("PayTR ödeme için geçerli, Türkçe karakter içermeyen bir e-posta adresi gerekli.");
  }

  const currency = "TL" as const;
  const paymentType = "card" as const;
  const installmentCount = String(input.installment);
  const expires = Math.floor(Date.now() / 1000) + 600;
  const non3d = 0 as const;
  const testMode = input.testMode === "1" ? 1 as const : 0 as const;
  const token = createPaytrDirectToken({
    merchantId: input.merchantId,
    merchantKey: input.merchantKey,
    merchantSalt: input.merchantSalt,
    userIp: input.userIp,
    merchantOid: input.draft.merchantOid,
    email,
    paymentAmount: payment.paymentAmount,
    paymentType,
    installmentCount: input.installment,
    currency,
    testMode,
    non3d,
  });
  const quoteId = crypto.randomBytes(16).toString("hex");
  const fingerprint = paytrHmacBase64(
    `${input.draft.merchantOid}|${payment.paymentKurus}|${input.installment}|${input.cardType}|${expires}|${quoteId}`,
    input.merchantKey,
  );

  const fields: Record<string, string> = {
    merchant_id: input.merchantId,
    user_ip: input.userIp,
    merchant_oid: input.draft.merchantOid,
    email,
    payment_type: paymentType,
    payment_amount: payment.paymentAmount,
    currency,
    test_mode: String(testMode),
    non_3d: String(non3d),
    request_exp_date: String(expires),
    merchant_ok_url: `${input.siteUrl}/order-success?order=${encodeURIComponent(input.draft.orderNo)}`,
    merchant_fail_url: `${input.siteUrl}/api/paytr/direct/fail?order=${encodeURIComponent(input.draft.orderNo)}`,
    user_name: safeText(input.draft.customer.fullName, 60),
    user_address: safeText([input.draft.customer.addressLine, `${input.draft.customer.district}/${input.draft.customer.city}`].filter(Boolean).join(", "), 400),
    user_phone: safeText(input.draft.customer.phone, 20),
    user_basket: JSON.stringify(buildPaytrBasket(input.draft, payment.feeKurus)),
    debug_on: input.debugOn,
    client_lang: "tr",
    paytr_token: token,
    non3d_test_failed: "0",
    installment_count: installmentCount,
  };
  if (input.cardType) fields.card_type = input.cardType;

  return {
    fields,
    token,
    meta: {
      integration_type: "direct_api",
      post_url: PAYTR_DIRECT_URL,
      merchant_oid: input.draft.merchantOid,
      order_no: input.draft.orderNo,
      payment_amount: payment.paymentAmount,
      payment_amount_kurus: payment.paymentKurus,
      base_payment_amount_kurus: payment.baseKurus,
      installment_fee_kurus: payment.feeKurus,
      installment_rate: input.rate,
      installment_rate_bps: payment.rateBps,
      installment_count: installmentCount,
      card_type: input.cardType,
      currency,
      test_mode: String(testMode),
      non_3d: String(non3d),
      request_exp_date: expires,
      quote_id: quoteId,
      quote_fingerprint: fingerprint,
      server_pricing: true,
      engine_version: "payment-engine-v2-paytr-official",
    },
    payment,
  };
}

export function verifyPaytrCallback(
  payload: Record<string, string>,
  meta: Record<string, unknown>,
  merchantKey: string,
  merchantSalt: string,
) {
  return verifyPaytrCallbackPayload(payload, meta, merchantKey, merchantSalt);
}
