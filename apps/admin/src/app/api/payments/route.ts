import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { queryPaytrStatus, requestPaytrRefund } from "@ruth-commerce/commerce-core";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESERVED_REFUND_STATUSES = new Set([
  "requested",
  "processing",
  "outcome_unknown",
  "reconciliation_required",
  "succeeded",
]);

function moneyToKurus(value: unknown) {
  const amount = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function paytrCredentials() {
  return {
    merchantId: process.env.PAYTR_MERCHANT_ID || "",
    merchantKey: process.env.PAYTR_MERCHANT_KEY || "",
    merchantSalt: process.env.PAYTR_MERCHANT_SALT || "",
  };
}

function mutationErrors(results: Array<any>) {
  return results
    .map((result) => result?.error?.message)
    .filter((message): message is string => Boolean(message));
}

function paytrRefundEvidence(statusResult: any, referenceNo: string, requestedKurus: number) {
  if (!statusResult || String(statusResult.status || "").toLowerCase() !== "success") return null;
  const returns = Array.isArray(statusResult.returns) ? statusResult.returns : [];
  return returns.find((item: any) => {
    const reference = String(item?.reference_no || "").trim();
    if (reference !== referenceNo) return false;
    const amountKurus = moneyToKurus(item?.return_amount);
    return amountKurus === 0 || amountKurus === requestedKurus;
  }) || null;
}

function legacyPaymentTimeline(order: any) {
  const paid = String(order.payment_status || "").toLowerCase() === "paid";
  return [{
    id: `legacy-order-${order.id}`,
    kind: "legacy",
    status: paid ? "paid" : order.payment_status || "waiting",
    title: paid ? "Eski sistem tahsilatı" : "Eski sistem ödeme kaydı",
    amount_kurus: moneyToKurus(order.total_amount),
    created_at: order.created_at,
    detail: order.imported_source
      ? `Kaynak: ${order.imported_source}`
      : "Commerce V2 öncesinde orders tablosuna kaydedilmiş sipariş",
  }];
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ ok: true, order: null, intent: null, timeline: [], refunds: [], paymentSource: null, refundableKurus: 0 });

  const orderSelect = `
    id, profile_id, order_no, customer_name, customer_email, customer_phone,
    total_amount, subtotal, shipping_fee, discount_total, tax_total, currency,
    payment_status, status, imported_source, created_at,
    order_items (id, product_id, variant_id, product_slug, product_name, variant_name, quantity, unit_price, total_price, image_url)
  `;

  let { data: order, error: orderError } = await supabase
    .from("orders")
    .select(orderSelect)
    .ilike("order_no", q)
    .limit(1)
    .maybeSingle();

  if (!order && !orderError && isUuid(q)) {
    const result = await supabase
      .from("orders")
      .select(orderSelect)
      .eq("id", q)
      .maybeSingle();
    order = result.data;
    orderError = result.error;
  }

  if (orderError) return NextResponse.json({ ok: false, error: orderError.message }, { status: 400 });
  if (!order) return NextResponse.json({ ok: false, error: "Sipariş bulunamadı." }, { status: 404 });

  let intent: any = null;
  const { data: directIntent } = await supabase
    .from("payment_intents")
    .select("*")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  intent = directIntent;

  if (!intent) {
    const { data: draft } = await supabase
      .from("checkout_drafts")
      .select("merchant_oid")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (draft?.merchant_oid) {
      const { data } = await supabase.from("payment_intents").select("*").eq("merchant_oid", draft.merchant_oid).maybeSingle();
      intent = data;
    }
  }

  if (!intent) {
    return NextResponse.json({
      ok: true,
      order,
      intent: null,
      paymentSource: "legacy",
      timeline: legacyPaymentTimeline(order),
      refunds: [],
      refundableKurus: 0,
      legacy: {
        canProviderRefund: false,
        paidAmountKurus: String(order.payment_status || "").toLowerCase() === "paid" ? moneyToKurus(order.total_amount) : 0,
        message: "Sipariş mevcut veritabanından okunuyor. Payment Intent olmadığı için PayTR API iadesi Commerce V2 üzerinden başlatılamaz.",
      },
    });
  }

  const [{ data: attempts }, { data: callbacks }, { data: transactions }, { data: refunds }] = await Promise.all([
    supabase.from("payment_attempts").select("*").eq("payment_intent_id", intent.id).order("created_at", { ascending: true }),
    supabase.from("payment_callback_events").select("*").eq("merchant_oid", intent.merchant_oid).order("received_at", { ascending: true }),
    supabase.from("payment_transactions").select("*").eq("payment_intent_id", intent.id).order("created_at", { ascending: true }),
    supabase.from("payment_refunds").select("*").eq("payment_intent_id", intent.id).order("created_at", { ascending: false }),
  ]);

  const timeline = [
    { id: `intent-${intent.id}`, kind: "intent", status: intent.status, title: "Ödeme niyeti oluşturuldu", amount_kurus: intent.amount_kurus, created_at: intent.created_at, detail: `${intent.installment_count || 0} taksit · ${intent.card_type || "tek çekim"}` },
    ...(attempts || []).map((item: any) => ({ id: `attempt-${item.id}`, kind: "attempt", status: item.status, title: `Ödeme denemesi #${item.attempt_no}`, amount_kurus: item.amount_kurus, created_at: item.created_at, detail: item.error_message || item.card_type || "PayTR" })),
    ...(callbacks || []).map((item: any) => ({ id: `callback-${item.id}`, kind: "callback", status: item.verified ? item.status : "rejected", title: item.verified ? "PayTR callback doğrulandı" : "Callback reddedildi", amount_kurus: item.total_amount_kurus, created_at: item.received_at, detail: item.verification_error || `${item.installment_count || 0} taksit` })),
    ...(transactions || []).map((item: any) => ({ id: `transaction-${item.id}`, kind: "transaction", status: item.status, title: ["refund", "partial_refund"].includes(item.transaction_type) ? "İade işlemi" : "Tahsilat işlemi", amount_kurus: item.amount_kurus, created_at: item.created_at, detail: item.provider_reference || item.provider })),
    ...(refunds || []).map((item: any) => ({ id: `refund-${item.id}`, kind: "refund", status: item.status, title: item.refund_type === "full" ? "Tam iade talebi" : "Kısmi iade talebi", amount_kurus: item.amount_kurus, created_at: item.created_at, detail: item.reason || "İade nedeni belirtilmedi" })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const successfulRefundKurus = (refunds || [])
    .filter((refund: any) => RESERVED_REFUND_STATUSES.has(String(refund.status || "")))
    .reduce((sum: number, refund: any) => sum + Number(refund.amount_kurus || 0), 0);
  const refundableKurus = Math.max(0, Number(intent.amount_kurus || 0) - successfulRefundKurus);
  return NextResponse.json({ ok: true, order, intent, paymentSource: "commerce_v2", timeline, refunds: refunds || [], refundableKurus });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { supabase, profile, user } = auth;
  const body = await request.json();
  const orderId = String(body.orderId || "");
  const reason = String(body.reason || "").trim().slice(0, 500);
  const requestedKurus = moneyToKurus(body.amount);
  if (!orderId || requestedKurus <= 0) return NextResponse.json({ ok: false, error: "Geçerli sipariş ve iade tutarı gerekli." }, { status: 400 });

  const { data: intent, error: intentError } = await supabase
    .from("payment_intents")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (intentError) return NextResponse.json({ ok: false, error: intentError.message }, { status: 400 });
  if (!intent) return NextResponse.json({ ok: false, error: "Bu eski sistem siparişinde Payment Intent yok. PayTR API iadesi yalnızca Commerce V2 ödeme kaydı bulunan siparişlerde başlatılabilir." }, { status: 409 });
  if (!intent.merchant_oid) return NextResponse.json({ ok: false, error: "PayTR merchant_oid bulunamadı." }, { status: 409 });

  const { data: refunds, error: refundsError } = await supabase
    .from("payment_refunds")
    .select("amount_kurus,status")
    .eq("payment_intent_id", intent.id);
  if (refundsError) return NextResponse.json({ ok: false, error: refundsError.message }, { status: 400 });

  const reserved = (refunds || [])
    .filter((refund: any) => RESERVED_REFUND_STATUSES.has(String(refund.status || "")))
    .reduce((sum: number, refund: any) => sum + Number(refund.amount_kurus || 0), 0);
  const remaining = Math.max(0, Number(intent.amount_kurus || 0) - reserved);
  if (requestedKurus > remaining) return NextResponse.json({ ok: false, error: `En fazla ${(remaining / 100).toFixed(2)} TL iade talebi oluşturabilirsin.` }, { status: 400 });

  const refundType = requestedKurus === remaining ? "full" : "partial";
  const idempotencyKey = `admin-refund:${intent.id}:${randomUUID()}`;
  const { data: refund, error: refundError } = await supabase.from("payment_refunds").insert({
    payment_intent_id: intent.id,
    order_id: orderId,
    provider: intent.provider || "paytr",
    provider_reference: intent.merchant_oid,
    refund_type: refundType,
    status: "processing",
    amount_kurus: requestedKurus,
    currency: intent.currency || "TL",
    reason: reason || null,
    requested_by: profile?.id || null,
    idempotency_key: idempotencyKey,
    metadata: { source: "admin_panel", provider_submission: "official_paytr_api" },
  }).select("*").single();
  if (refundError || !refund) return NextResponse.json({ ok: false, error: refundError?.message || "İade kaydı oluşturulamadı." }, { status: 400 });

  const referenceNo = `ROSTAREF${String(refund.id).replace(/-/g, "")}`.slice(0, 64);
  const { data: attempt, error: attemptError } = await supabase.from("payment_refund_attempts").insert({
    refund_id: refund.id,
    attempt_no: 1,
    provider: intent.provider || "paytr",
    status: "submitted",
    provider_reference: referenceNo,
    request_payload: { merchant_oid: intent.merchant_oid, amount_kurus: requestedKurus, reason },
  }).select("id").single();

  if (attemptError || !attempt) {
    await supabase.from("payment_refunds").update({
      status: "failed",
      failed_at: new Date().toISOString(),
      metadata: { source: "admin_panel", provider_submission: "not_started", error: attemptError?.message || "Refund attempt oluşturulamadı." },
    }).eq("id", refund.id);
    return NextResponse.json({ ok: false, error: attemptError?.message || "İade denemesi oluşturulamadı." }, { status: 400 });
  }

  try {
    const paytrResult = await requestPaytrRefund({
      ...paytrCredentials(),
      merchantOid: String(intent.merchant_oid),
      returnAmount: (requestedKurus / 100).toFixed(2),
      referenceNo,
    });
    const completedAt = new Date().toISOString();

    // An explicit provider rejection is authoritative and can safely become failed.
    if (paytrResult.status !== "success") {
      const errorMessage = String(paytrResult.err_msg || "PayTR iade talebini reddetti.");
      const results = await Promise.all([
        supabase.from("payment_refunds").update({
          status: "failed",
          failed_at: completedAt,
          metadata: { source: "admin_panel", provider_submission: "official_paytr_api", paytr_response: paytrResult },
        }).eq("id", refund.id),
        supabase.from("payment_refund_attempts").update({
          status: "failed",
          response_payload: paytrResult,
          error_code: String(paytrResult.err_no || "paytr_error"),
          error_message: errorMessage,
          completed_at: completedAt,
        }).eq("id", attempt.id),
        supabase.from("commerce_audit_logs").insert({
          action: "paytr.refund_failed",
          entity_type: "payment_refund",
          entity_id: refund.id,
          actor_type: "user",
          actor_id: user.id,
          reason: reason || null,
          metadata: { merchant_oid: intent.merchant_oid, reference_no: referenceNo, amount_kurus: requestedKurus, paytr_response: paytrResult },
        }),
      ]);
      const localErrors = mutationErrors(results);
      return NextResponse.json({
        ok: false,
        refund: { ...refund, status: "failed", provider_reference: referenceNo },
        error: errorMessage,
        result: paytrResult,
        persistence_warning: localErrors.length ? localErrors.join(" | ") : null,
      }, { status: localErrors.length ? 502 : 400 });
    }

    const { data: finalizedRefund, error: finalizeError } = await supabase.rpc("finalize_succeeded_payment_refund", {
      p_refund_id: refund.id,
      p_attempt_id: attempt.id,
      p_provider_reference: referenceNo,
      p_response_payload: paytrResult,
      p_actor_id: user.id,
      p_completed_at: completedAt,
    });
    if (finalizeError || !finalizedRefund) {
      throw new Error(`PayTR iadesi kabul edildi fakat yerel kapanış tamamlanamadı: ${finalizeError?.message || "Bilinmeyen hata"}`);
    }

    return NextResponse.json({
      ok: true,
      refund: finalizedRefund,
      result: paytrResult,
      message: "İade PayTR tarafından kabul edildi ve yerel kayıtlar atomik olarak kapatıldı.",
    });
  } catch (caught) {
    const reconciliationAt = new Date().toISOString();
    const originalError = caught instanceof Error ? caught.message : "PayTR iade sonucu kesinleştirilemedi.";
    let statusResult: any = null;
    let statusQueryError: string | null = null;
    let evidence: any = null;

    // A transport timeout or local finalization failure is not an authoritative
    // provider rejection. Query the provider with the same reference before
    // deciding the local outcome.
    try {
      statusResult = await queryPaytrStatus({
        ...paytrCredentials(),
        merchantOid: String(intent.merchant_oid),
      });
      evidence = paytrRefundEvidence(statusResult, referenceNo, requestedKurus);
    } catch (queryError) {
      statusQueryError = queryError instanceof Error ? queryError.message : "PayTR durum sorgusu başarısız.";
    }

    if (evidence) {
      const { data: finalizedRefund, error: finalizeError } = await supabase.rpc("finalize_succeeded_payment_refund", {
        p_refund_id: refund.id,
        p_attempt_id: attempt.id,
        p_provider_reference: referenceNo,
        p_response_payload: {
          reconciliation_source: "paytr_status_query",
          matched_return: evidence,
          original_error: originalError,
        },
        p_actor_id: user.id,
        p_completed_at: reconciliationAt,
      });

      if (!finalizeError && finalizedRefund) {
        return NextResponse.json({
          ok: true,
          reconciled: true,
          refund: finalizedRefund,
          message: "İade ilk yanıtta kesinleşmedi; PayTR durum sorgusunda provider kanıtı bulundu ve kayıt atomik olarak uzlaştırıldı.",
        });
      }

      statusQueryError = `Provider iade kanıtı bulundu fakat yerel finalizasyon tamamlanamadı: ${finalizeError?.message || "Bilinmeyen hata"}`;
    }

    const reconciliationError = [originalError, statusQueryError].filter(Boolean).join(" | ");
    const results = await Promise.all([
      supabase.from("payment_refunds").update({
        status: "reconciliation_required",
        failed_at: null,
        provider_reference: referenceNo,
        metadata: {
          source: "admin_panel",
          provider_submission: "outcome_unknown",
          reference_no: referenceNo,
          error: originalError,
          status_query_status: statusResult?.status || null,
          provider_evidence_found: Boolean(evidence),
          reconciliation_error: statusQueryError,
        },
      }).eq("id", refund.id).neq("status", "succeeded"),
      supabase.from("payment_refund_attempts").update({
        status: "outcome_unknown",
        error_code: "provider_outcome_unknown",
        error_message: reconciliationError,
        response_payload: statusResult || {},
        completed_at: reconciliationAt,
      }).eq("id", attempt.id).neq("status", "succeeded"),
      supabase.from("commerce_audit_logs").insert({
        action: "paytr.refund_reconciliation_required",
        entity_type: "payment_refund",
        entity_id: refund.id,
        actor_type: "user",
        actor_id: user.id,
        reason: reason || null,
        metadata: {
          merchant_oid: intent.merchant_oid,
          reference_no: referenceNo,
          amount_kurus: requestedKurus,
          original_error: originalError,
          status_query_error: statusQueryError,
          provider_evidence_found: Boolean(evidence),
        },
      }),
    ]);
    const localErrors = mutationErrors(results);

    return NextResponse.json({
      ok: false,
      outcome_unknown: true,
      reconciliation_required: true,
      refund: { ...refund, status: "reconciliation_required", provider_reference: referenceNo },
      error: "İadenin PayTR sonucu kesin olarak doğrulanamadı. Aynı iadeyi tekrar göndermeyin; kayıt uzlaştırma gerektiriyor.",
      detail: reconciliationError,
      persistence_warning: localErrors.length ? localErrors.join(" | ") : null,
    }, { status: 502 });
  }
}
