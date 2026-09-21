import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYTR_BIN_URL = "https://www.paytr.com/odeme/api/bin-detail";
const PAYTR_INSTALLMENT_URL = "https://www.paytr.com/odeme/taksit-oranlari";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} env eksik.`);
  return value;
}

function hmacBase64(data: string, key: string) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("base64");
}

async function postForm(url: string, params: URLSearchParams, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      cache: "no-store",
      signal: controller.signal,
    });
    const raw = await response.text();
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`PayTR geçersiz yanıt verdi (${response.status}).`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function normalize(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

type InstallmentRate = { count: number; rate: number };

function extractRate(value: Record<string, unknown>) {
  const candidates = [value.rate, value.ratio, value.oran, value.taksit_orani, value.commission_rate];
  for (const candidate of candidates) {
    const parsed = toNumber(candidate);
    if (parsed !== null && parsed >= 0 && parsed < 100) return parsed;
  }
  return null;
}

function collectBrandRates(node: unknown, brand: string, result: Map<number, number>, brandMatched = false) {
  if (Array.isArray(node)) {
    if (brandMatched && node.every((item) => item === null || ["string", "number"].includes(typeof item))) {
      node.forEach((item, index) => {
        const rate = toNumber(item);
        if (index >= 2 && index <= 12 && rate !== null && rate >= 0 && rate < 100) result.set(index, rate);
      });
    }
    for (const item of node) {
      if (Array.isArray(item) && item.length >= 2) {
        const count = Math.trunc(Number(item[0]));
        const rate = toNumber(item[1]);
        if (brandMatched && count >= 2 && count <= 12 && rate !== null && rate >= 0 && rate < 100) result.set(count, rate);
      } else {
        collectBrandRates(item, brand, result, brandMatched);
      }
    }
    return;
  }

  if (!node || typeof node !== "object") return;
  const object = node as Record<string, unknown>;
  const objectBrand = normalize(object.card_type ?? object.cardType ?? object.brand);
  const currentBrandMatched = brandMatched || objectBrand === brand;
  const directCount = Math.trunc(Number(object.installment_count ?? object.installment ?? object.taksit ?? object.taksit_sayisi ?? object.count));
  const directRate = extractRate(object);
  if (currentBrandMatched && directCount >= 2 && directCount <= 12 && directRate !== null) result.set(directCount, directRate);

  for (const [key, value] of Object.entries(object)) {
    const normalizedKey = normalize(key);
    const nextBrandMatched = currentBrandMatched || normalizedKey === brand;
    const numericKey = normalizedKey.match(/^(?:taksit[_-]?)?(1[0-2]|[2-9])(?:[_-]?(?:taksit|oran|ratio))?$/);
    if (nextBrandMatched && numericKey) {
      const rate = toNumber(value);
      if (rate !== null && rate >= 0 && rate < 100) result.set(Number(numericKey[1]), rate);
    }
    collectBrandRates(value, brand, result, nextBrandMatched);
  }
}

export async function POST(request: Request) {
  try {
    const paymentFlow = (process.env.PAYTR_PAYMENT_FLOW || "iframe_v2").trim().toLocaleLowerCase("tr-TR");
    if (paymentFlow !== "direct") {
      return NextResponse.json(
        { ok: false, error: "PayTR Direct API kart ve taksit sorgusu kapalı. iFrame V2 kullanılmalıdır." },
        { status: 410 },
      );
    }

    const merchantId = requiredEnv("PAYTR_MERCHANT_ID");
    const merchantKey = requiredEnv("PAYTR_MERCHANT_KEY");
    const merchantSalt = requiredEnv("PAYTR_MERCHANT_SALT");
    const body = await request.json();
    const binNumber = String(body.binNumber || "").replace(/\D/g, "").slice(0, 8);

    if (binNumber.length < 6) return NextResponse.json({ ok: true, card: null, installments: [] });

    const binToken = hmacBase64(`${binNumber}${merchantId}${merchantSalt}`, merchantKey);
    const binResult = await postForm(PAYTR_BIN_URL, new URLSearchParams({ merchant_id: merchantId, bin_number: binNumber, paytr_token: binToken }));
    if (binResult.status === "error") throw new Error(String(binResult.err_msg || "Kart bilgisi sorgulanamadı."));
    if (binResult.status !== "success") {
      return NextResponse.json({ ok: true, card: null, installments: [], warning: "Kart türü PayTR tarafından tanınamadı. Ödeme tek çekim olarak devam eder." });
    }

    const brand = normalize(binResult.brand || "none") || "none";
    const cardType = normalize(binResult.cardType || binResult.card_type || binResult.c_type);
    const isCreditCard = cardType === "credit";
    const installments: InstallmentRate[] = [];
    let warning: string | null = null;

    if (isCreditCard && brand === "none") warning = "Bu kredi kartı PayTR taksit programına dahil değil. Ödeme tek çekim devam eder.";
    if (isCreditCard && brand !== "none") {
      const requestId = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`.slice(0, 32);
      const installmentToken = hmacBase64(`${merchantId}${requestId}${merchantSalt}`, merchantKey);
      const installmentResult = await postForm(PAYTR_INSTALLMENT_URL, new URLSearchParams({ merchant_id: merchantId, request_id: requestId, paytr_token: installmentToken, single_ratio: "1", abroad_ratio: "1" }));
      if (installmentResult.status === "success") {
        const maxInstallment = Math.max(0, Math.min(12, Math.trunc(Number(installmentResult.max_inst_non_bus || 12))));
        const rates = new Map<number, number>();
        collectBrandRates(installmentResult.oranlar ?? installmentResult.rates, brand, rates);
        installments.push(...[...rates.entries()].filter(([count, rate]) => count <= maxInstallment && rate >= 0 && rate < 100).sort(([a], [b]) => a - b).map(([count, rate]) => ({ count, rate })));
      } else {
        warning = String(installmentResult.err_msg || "PayTR taksit seçeneklerini döndürmedi.");
      }
    }

    return NextResponse.json({
      ok: true,
      card: {
        brand,
        bank: String(binResult.bank || ""),
        schema: String(binResult.schema || ""),
        cardType,
        businessCard: String(binResult.businessCard || ""),
        isCreditCard,
      },
      installments,
      testMode: (process.env.PAYTR_TEST_MODE || "1").trim() === "1",
      warning,
    });
  } catch (error) {
    console.error("PayTR Direct options error", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Kart bilgileri alınamadı." }, { status: 400 });
  }
}
