import { NextResponse } from "next/server";
import { resolveCheckoutOrder } from "@/lib/commerce/orderEngine";
import { createPaytrRequest, envChoice, getClientIp, PAYTR_DIRECT_URL, requiredEnv, safeText, verifyInstallment } from "@/lib/commerce/paymentEngine";
import { updateCheckoutDraftPaytrRequest } from "@/lib/orderServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function bearerToken(request: Request) {
  const match = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function normalizeInstallment(value: unknown) {
  const parsed = Math.trunc(Number(value || 0));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 12) : 0;
}

export async function POST(request: Request) {
  try {
    const paymentFlow = (process.env.PAYTR_PAYMENT_FLOW || "iframe_v2").trim().toLocaleLowerCase("tr-TR");
    if (paymentFlow !== "direct") {
      return NextResponse.json(
        { ok: false, error: "PayTR Direct API kapalı. Güvenli ödeme için iFrame V2 kullanılmalıdır." },
        { status: 410 },
      );
    }

    const merchantId = requiredEnv("PAYTR_MERCHANT_ID");
    const merchantKey = requiredEnv("PAYTR_MERCHANT_KEY");
    const merchantSalt = requiredEnv("PAYTR_MERCHANT_SALT");
    const siteUrl = requiredEnv("NEXT_PUBLIC_SITE_URL").replace(/\/$/, "");
    const testMode = envChoice("PAYTR_TEST_MODE", "1", ["0", "1"]);
    const debugOn = envChoice("PAYTR_DEBUG_ON", testMode === "1" ? "1" : "0", ["0", "1"]);
    const body = await request.json();
    const installment = normalizeInstallment(body.payment?.installmentCount);
    const requestedCardType = safeText(body.payment?.cardType || "", 24).toLocaleLowerCase("tr-TR");
    const binNumber = String(body.payment?.binNumber || "").replace(/\D/g, "").slice(0, 8);

    const [draft, verified] = await Promise.all([
      resolveCheckoutOrder({ body, authToken: bearerToken(request) }),
      verifyInstallment({ merchantId, merchantKey, merchantSalt, binNumber, installment, requestedCardType }),
    ]);

    const prepared = createPaytrRequest({
      draft,
      merchantId,
      merchantKey,
      merchantSalt,
      siteUrl,
      userIp: getClientIp(request),
      testMode,
      debugOn,
      installment,
      cardType: verified.cardType,
      rate: verified.rate,
    });

    delete prepared.fields.request_exp_date;

    const supabase = getSupabaseAdmin();
    const intentKey = `paytr:intent:${draft.merchantOid}`;
    const { data: intent, error: intentError } = await supabase
      .from("payment_intents")
      .upsert({
        checkout_draft_id: draft.draftId,
        merchant_oid: draft.merchantOid,
        provider: "paytr",
        status: "requires_action",
        amount_kurus: prepared.payment.paymentKurus,
        currency: "TL",
        installment_count: installment,
        card_type: verified.cardType || null,
        idempotency_key: intentKey,
        metadata: prepared.meta,
      }, { onConflict: "provider,merchant_oid" })
      .select("id")
      .single();

    if (intentError || !intent) throw new Error(`Ödeme intent kaydı oluşturulamadı: ${intentError?.message || "kayıt dönmedi"}`);

    const { data: latestAttempt, error: attemptLookupError } = await supabase
      .from("payment_attempts")
      .select("attempt_no")
      .eq("payment_intent_id", intent.id)
      .order("attempt_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (attemptLookupError) throw new Error(`Ödeme denemesi okunamadı: ${attemptLookupError.message}`);

    const nextAttemptNo = Number(latestAttempt?.attempt_no || 0) + 1;
    const { data: attempt, error: attemptError } = await supabase
      .from("payment_attempts")
      .insert({
        payment_intent_id: intent.id,
        attempt_no: nextAttemptNo,
        provider: "paytr",
        status: "prepared",
        amount_kurus: prepared.payment.paymentKurus,
        installment_count: installment,
        card_type: verified.cardType || null,
        bin_prefix: binNumber || null,
        provider_reference: draft.merchantOid,
        request_fingerprint: String(prepared.meta.quote_fingerprint || ""),
        provider_payload: { test_mode: testMode, request_exp_date: prepared.meta.request_exp_date, installment_rate: verified.rate },
      })
      .select("id")
      .single();
    if (attemptError || !attempt) throw new Error(`Ödeme denemesi kaydedilemedi: ${attemptError?.message || "kayıt dönmedi"}`);

    await updateCheckoutDraftPaytrRequest({
      merchantOid: draft.merchantOid,
      paytrToken: prepared.token,
      paytrRequest: { ...prepared.meta, payment_intent_id: intent.id, payment_attempt_id: attempt.id, payment_attempt_no: nextAttemptNo },
    });

    return NextResponse.json({
      ok: true,
      action: PAYTR_DIRECT_URL,
      fields: prepared.fields,
      orderNo: draft.orderNo,
      merchantOid: draft.merchantOid,
      resumeToken: draft.resumeToken,
      testMode: testMode === "1",
      non3dEnabled: false,
      paymentAmount: prepared.payment.paymentKurus / 100,
      installmentRate: verified.rate,
      installmentFee: prepared.payment.feeKurus / 100,
      paymentIntentId: intent.id,
      paymentAttemptId: attempt.id,
      paymentAttemptNo: nextAttemptNo,
    });
  } catch (error) {
    console.error("PayTR Direct API prepare error", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Ödeme hazırlanamadı." }, { status: 400 });
  }
}
