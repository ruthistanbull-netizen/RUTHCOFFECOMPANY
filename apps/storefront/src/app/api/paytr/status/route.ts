import crypto from "node:crypto";
import { after, NextResponse } from "next/server";
import { sendMetaCapiEvent } from "@/lib/analytics/serverMarketing";
import { createPaidOrderFromCheckoutDraft } from "@/lib/orderServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYTR_STATUS_URL = "https://www.paytr.com/odeme/durum-sorgu";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!value) throw new Error(`${name} env eksik.`);
  return value;
}

function parseMajorAmount(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function stringifyPayload(payload: Record<string, unknown> | null | undefined) {
  return Object.fromEntries(
    Object.entries(payload || {}).map(([key, value]) => [key, String(value ?? "")]),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeCurrency(value: unknown) {
  const currency = String(value || "TRY").trim().toUpperCase();
  return currency === "TL" ? "TRY" : currency;
}

function purchaseItems(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object") as Record<string, unknown>[]
    : [];
}

function purchaseContentIds(value: unknown) {
  return purchaseItems(value)
    .map((item) => String(item.productSlug || item.productId || item.product_slug || item.product_id || "").trim())
    .filter(Boolean);
}

function purchaseItemCount(value: unknown) {
  return purchaseItems(value).reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    return sum + (Number.isFinite(quantity) && quantity > 0 ? Math.trunc(quantity) : 0);
  }, 0);
}

function makePurchasePayload(input: {
  orderId: string;
  orderNo: string;
  totalAmount: unknown;
  currency: unknown;
  items: unknown;
}) {
  return {
    eventId: `purchase-${input.orderId}`,
    orderNo: input.orderNo,
    value: Math.max(0, Number(input.totalAmount || 0)),
    currency: normalizeCurrency(input.currency),
    contentIds: purchaseContentIds(input.items),
    numItems: purchaseItemCount(input.items),
  };
}

async function sendPurchaseCapi(input: {
  origin: string;
  orderId: string;
  totalAmount: unknown;
  currency: unknown;
  items?: unknown;
  contentIds?: string[];
  numItems?: number;
  customer?: unknown;
  attribution?: unknown;
}) {
  const attribution = asRecord(input.attribution);
  const customer = asRecord(input.customer);
  const explicitContentIds = Array.isArray(input.contentIds)
    ? input.contentIds.map(String).map((value) => value.trim()).filter(Boolean)
    : [];
  const explicitNumItems = Number(input.numItems || 0);

  return sendMetaCapiEvent({
    eventName: "Purchase",
    eventId: `purchase-${input.orderId}`,
    eventSourceUrl: `${input.origin}/order-success`,
    visitorId: String(attribution.visitor_id || ""),
    fbp: String(attribution.fbp || ""),
    fbc: String(attribution.fbc || ""),
    email: String(customer.email || ""),
    phone: String(customer.phone || ""),
    value: Math.max(0, Number(input.totalAmount || 0)),
    currency: normalizeCurrency(input.currency),
    contentIds: explicitContentIds.length ? explicitContentIds : purchaseContentIds(input.items),
    numItems: Number.isFinite(explicitNumItems) && explicitNumItems > 0
      ? Math.trunc(explicitNumItems)
      : purchaseItemCount(input.items),
  });
}

async function queryPaytrStatus(merchantOid: string) {
  const merchantId = requiredEnv("PAYTR_MERCHANT_ID");
  const merchantKey = requiredEnv("PAYTR_MERCHANT_KEY");
  const merchantSalt = requiredEnv("PAYTR_MERCHANT_SALT");
  const paytrToken = crypto
    .createHmac("sha256", merchantKey)
    .update(`${merchantId}${merchantOid}${merchantSalt}`, "utf8")
    .digest("base64");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(PAYTR_STATUS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        merchant_id: merchantId,
        merchant_oid: merchantOid,
        paytr_token: paytrToken,
      }).toString(),
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !data || data.status !== "success") return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function scheduleOrderReconciliation(merchantOid: string, callbackPayload: Record<string, string>, origin: string) {
  after(async () => {
    try {
      const orderResult = await createPaidOrderFromCheckoutDraft({ merchantOid, callbackPayload });
      if (!orderResult?.orderId) return;
      await sendPurchaseCapi({
        origin,
        orderId: String(orderResult.orderId),
        totalAmount: orderResult.totalAmount,
        currency: orderResult.currency,
        contentIds: Array.isArray(orderResult.itemIds) ? orderResult.itemIds.map(String) : [],
        numItems: Number(orderResult.itemCount || 0),
        customer: { email: orderResult.customerEmail, phone: orderResult.customerPhone },
        attribution: orderResult.attribution,
      });
    } catch (reconcileError) {
      console.error("PayTR paid order background reconciliation failed", { merchantOid, reconcileError });
    }
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const orderNo = requestUrl.searchParams.get("order")?.trim() || "";
  if (!orderNo || orderNo.length > 64 || !/^[A-Za-z0-9_-]+$/.test(orderNo)) {
    return NextResponse.json({ ok: false, status: "not_found" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("checkout_drafts")
    .select("status, order_id, updated_at, merchant_oid, total_amount, currency, callback_payload, customer, attribution, items")
    .eq("order_no", orderNo)
    .maybeSingle();

  if (error) {
    console.error("PayTR status query error", error);
    return NextResponse.json({ ok: false, status: "error" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: true, status: "not_found" }, { headers: { "Cache-Control": "no-store" } });
  }

  const merchantOid = String(data.merchant_oid || orderNo);

  if (data.order_id) {
    const orderId = String(data.order_id);
    const purchase = makePurchasePayload({
      orderId,
      orderNo,
      totalAmount: data.total_amount,
      currency: data.currency,
      items: data.items,
    });

    // Callback, recovery ve başarı sayfası aynı deterministic event_id'yi kullanır.
    // Meta bu tekrarları tek Purchase olarak deduplicate eder.
    after(async () => {
      try {
        await sendPurchaseCapi({
          origin: requestUrl.origin,
          orderId,
          totalAmount: data.total_amount,
          currency: data.currency,
          items: data.items,
          customer: data.customer,
          attribution: data.attribution,
        });
      } catch (metaError) {
        console.error("Meta Purchase CAPI status retry failed", { orderId, metaError });
      }
    });

    return NextResponse.json(
      { ok: true, status: "paid", orderNo, orderId, purchase, updatedAt: data.updated_at || null },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  // Ödeme gerçeği ile sipariş materialization'ını birbirinden ayırıyoruz.
  // Verified PayTR callback draft'ı paid yaptıysa müşteri ödeme açısından tamamlandı;
  // eksik order kaydı idempotent olarak arka planda tamamlanır.
  if (data.status === "paid") {
    scheduleOrderReconciliation(
      merchantOid,
      stringifyPayload(data.callback_payload as Record<string, unknown> | null),
      requestUrl.origin,
    );
    return NextResponse.json(
      { ok: true, status: "paid", orderNo, orderPending: true, recoveryPending: true, updatedAt: data.updated_at || null },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  if (data.status === "failed") {
    return NextResponse.json(
      { ok: true, status: "failed", orderNo, updatedAt: data.updated_at || null },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  // Callback henüz ulaşmadıysa PayTR durum sorgusu recovery kaynağıdır.
  const paytrStatus = await queryPaytrStatus(merchantOid);
  if (paytrStatus) {
    const paidAmount = parseMajorAmount(paytrStatus.payment_amount);
    const expectedAmount = Number(data.total_amount || 0);
    const amountMatches = paidAmount !== null && Math.abs(paidAmount - expectedAmount) < 0.011;
    const currency = String(paytrStatus.currency || "TL").toUpperCase();
    const currencyMatches = ["TL", "TRY"].includes(currency) && ["TL", "TRY"].includes(String(data.currency || "TRY").toUpperCase());

    if (amountMatches && currencyMatches) {
      const callbackPayload = stringifyPayload(paytrStatus);
      const now = new Date().toISOString();
      const { error: paidStateError } = await supabase
        .from("checkout_drafts")
        .update({
          status: "paid",
          callback_payload: callbackPayload,
          paid_at: now,
          failed_at: null,
          updated_at: now,
        })
        .eq("merchant_oid", merchantOid);

      if (paidStateError) {
        console.error("PayTR status paid-state persistence failed", { merchantOid, paidStateError });
        return NextResponse.json({ ok: false, status: "error" }, { status: 500 });
      }

      scheduleOrderReconciliation(merchantOid, callbackPayload, requestUrl.origin);
      return NextResponse.json(
        { ok: true, status: "paid", orderNo, orderPending: true, recoveryPending: true, providerVerified: true },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    console.error("PayTR status amount/currency mismatch", {
      merchantOid,
      expectedAmount,
      paidAmount,
      draftCurrency: data.currency,
      paytrCurrency: paytrStatus.currency,
    });
  }

  return NextResponse.json(
    { ok: true, status: "waiting", orderNo, recoveryPending: false, updatedAt: data.updated_at || null },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
