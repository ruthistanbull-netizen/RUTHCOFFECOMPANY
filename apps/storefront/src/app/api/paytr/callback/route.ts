import { after, NextResponse } from "next/server";
import type { CommerceEvent, PaymentStatus } from "@ruth-commerce/contracts";
import { createPaidOrderFromCheckoutDraft, markCheckoutDraftFailed } from "@/lib/orderServer";
import { sendGa4MeasurementEvent, sendMetaCapiEvent } from "@/lib/analytics/serverMarketing";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requiredEnv, verifyPaytrCallback } from "@/lib/commerce/paymentEngine";
import { executePaymentStatusCommand, executeRegisterOrderCommand } from "@/lib/commerce/commandAdapter";
import { persistCommerceEvents } from "@/lib/commerce/eventStore";
import { notifyOrderConfirmationEmail } from "@/lib/orderConfirmationNotifier";

export const runtime = "nodejs";

function digitsToNumber(value: string | undefined) {
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

function draftPaymentStatus(value: unknown): PaymentStatus {
  if (value === "paid") return "paid";
  if (value === "failed") return "failed";
  if (value === "cancelled") return "cancelled";
  if (value === "refunded") return "refunded";
  return "pending";
}

async function finalizeCallbackLedger(input: {
  supabase: any;
  callbackEventId: string;
  paymentIntentId: string | null;
  paymentAttemptId: string | null;
  orderId: string | null;
  expectedKurus: number;
  currency: string;
  merchantOid: string;
  payload: Record<string, string>;
  completedAt: string;
}) {
  const { data, error } = await input.supabase.rpc("finalize_verified_paytr_callback", {
    p_callback_event_id: input.callbackEventId,
    p_payment_intent_id: input.paymentIntentId,
    p_payment_attempt_id: input.paymentAttemptId,
    p_order_id: input.orderId,
    p_expected_amount_kurus: input.expectedKurus,
    p_currency: input.currency,
    p_provider_reference: input.merchantOid,
    p_provider_payload: input.payload,
    p_completed_at: input.completedAt,
  });
  if (error || !data) {
    throw new Error(`PayTR callback yerel ledger kapanışı tamamlanamadı: ${error?.message || "Bilinmeyen hata"}`);
  }
}

async function recordBackgroundFailure(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  merchantOid: string,
  orderId: string | null,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  const { error: deadLetterError } = await supabase
    .from("commerce_dead_letters")
    .upsert({
      source: "paytr_callback_background",
      source_id: merchantOid,
      event_type: "verified_payment_side_effects",
      aggregate_id: orderId || merchantOid,
      payload: { merchant_oid: merchantOid, order_id: orderId },
      status: "open",
      attempts: 1,
      error: message,
      root_cause: "post_acknowledgement_processing",
      correlation_id: `paytr:${merchantOid}`,
      updated_at: new Date().toISOString(),
    }, { onConflict: "source,source_id" });

  if (deadLetterError) {
    console.error("PayTR background failure could not be recorded", { merchantOid, deadLetterError });
  }
}

export async function POST(request: Request) {
  try {
    const merchantKey = requiredEnv("PAYTR_MERCHANT_KEY");
    const merchantSalt = requiredEnv("PAYTR_MERCHANT_SALT");
    const form = await request.formData();
    const payload = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
    const merchantOid = payload.merchant_oid || "";
    const status = payload.status || "";
    const hash = payload.hash || "";

    if (!merchantOid || !["success", "failed"].includes(status) || !hash) {
      return new NextResponse("BAD", { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: draft, error: draftError } = await supabase
      .from("checkout_drafts")
      .select("id, status, order_id, profile_id, total_amount, currency, paytr_request")
      .eq("merchant_oid", merchantOid)
      .maybeSingle();

    if (draftError || !draft) {
      console.error("PayTR callback draft not found", merchantOid, draftError);
      return new NextResponse("BAD", { status: 400 });
    }

    const meta = draft.paytr_request && typeof draft.paytr_request === "object"
      ? draft.paytr_request as Record<string, unknown>
      : {};
    const verification = verifyPaytrCallback(payload, meta, merchantKey, merchantSalt);

    const { data: callbackEvent, error: callbackError } = await supabase
      .from("payment_callback_events")
      .upsert({
        provider: "paytr",
        merchant_oid: merchantOid,
        callback_hash: hash,
        status,
        total_amount_kurus: digitsToNumber(payload.total_amount),
        payment_amount_kurus: digitsToNumber(payload.payment_amount),
        installment_count: digitsToNumber(payload.installment_count),
        verified: verification.ok,
        verification_error: verification.ok ? null : verification.reason,
        payload,
      }, { onConflict: "provider,merchant_oid,callback_hash" })
      .select("id, processed_at")
      .single();

    if (callbackError || !callbackEvent) {
      console.error("PayTR callback ledger write failed", merchantOid, callbackError);
      return new NextResponse("BAD", { status: 400 });
    }

    if (!verification.ok) {
      console.error("PayTR callback verification failed", merchantOid, verification.reason);
      return new NextResponse("BAD", { status: 400 });
    }

    const expectedKurus = Number(meta.payment_amount_kurus);
    if (!Number.isSafeInteger(expectedKurus) || expectedKurus <= 0) {
      console.error("PayTR callback invalid payment amount", merchantOid, meta.payment_amount_kurus);
      return new NextResponse("BAD", { status: 400 });
    }

    const paymentIntentId = typeof meta.payment_intent_id === "string" ? meta.payment_intent_id : null;
    const paymentAttemptId = typeof meta.payment_attempt_id === "string" ? meta.payment_attempt_id : null;
    const completedAt = new Date().toISOString();
    const currency = String(meta.currency || "TL");
    const currentStatus = draftPaymentStatus(draft.status);
    const nextStatus: PaymentStatus = status === "success" ? "paid" : "failed";
    let confirmedOrderId = draft.order_id ? String(draft.order_id) : null;
    let coreCreated = false;
    let orderResult: Awaited<ReturnType<typeof createPaidOrderFromCheckoutDraft>> = null;

    if (status === "success") {
      // Verified PayTR success is the payment-truth boundary. Persist it before
      // customer/order materialization so a schema/reconciliation incident can
      // never turn a genuinely paid checkout back into a waiting checkout.
      const { error: paidStateError } = await supabase
        .from("checkout_drafts")
        .update({
          status: "paid",
          callback_payload: payload,
          paid_at: completedAt,
          failed_at: null,
          updated_at: completedAt,
        })
        .eq("id", draft.id);

      if (paidStateError) {
        console.error("PayTR verified success could not persist paid checkout state", merchantOid, paidStateError);
        return new NextResponse("BAD", { status: 400 });
      }

      // Durable order materialization remains idempotent. If it fails, PayTR is
      // intentionally not ACKed so provider retry + status recovery can finish
      // the order later; the checkout nevertheless remains truthfully paid.
      orderResult = await createPaidOrderFromCheckoutDraft({ merchantOid, callbackPayload: payload });
      if (!orderResult?.orderId) {
        console.error("PayTR paid order finalization returned no order", merchantOid);
        return new NextResponse("BAD", { status: 400 });
      }
      confirmedOrderId = String(orderResult.orderId);
      coreCreated = !orderResult.alreadyPaid;
    } else {
      await markCheckoutDraftFailed({ merchantOid, callbackPayload: payload });
    }

    // Only non-critical event, ledger enrichment, e-mail and marketing work remains
    // after the PayTR ACK. The order itself is already durable and visible to admin.
    after(async () => {
      const backgroundSupabase = getSupabaseAdmin();
      try {
        const correlationId = `paytr:${merchantOid}`;
        const idempotencyKey = `paytr:${merchantOid}:${status}:${hash}`;
        const commerceEvents: CommerceEvent<unknown>[] = [];

        if (currentStatus !== nextStatus) {
          if (currentStatus === "failed" && nextStatus === "paid") {
            const retryCommand = executePaymentStatusCommand({
              orderId: confirmedOrderId || merchantOid,
              currentStatus: "failed",
              nextStatus: "pending",
              amountMinor: expectedKurus,
              providerReference: merchantOid,
              correlationId,
              idempotencyKey: `${idempotencyKey}:retry`,
            });
            commerceEvents.push(...retryCommand.events);
          }

          const effectiveCurrentStatus: PaymentStatus = currentStatus === "failed" && nextStatus === "paid"
            ? "pending"
            : currentStatus;
          const paymentCommand = executePaymentStatusCommand({
            orderId: confirmedOrderId || merchantOid,
            currentStatus: effectiveCurrentStatus,
            nextStatus,
            amountMinor: expectedKurus,
            providerReference: merchantOid,
            correlationId,
            idempotencyKey,
          });
          commerceEvents.push(...paymentCommand.events);
        }

        if (status === "success" && coreCreated && orderResult?.orderId) {
          const orderCommand = executeRegisterOrderCommand({
            orderId: orderResult.orderId,
            orderNumber: orderResult.orderNo,
            totalAmountMinor: Math.round(Number(orderResult.totalAmount || 0) * 100),
            itemCount: orderResult.itemCount,
            customerId: draft.profile_id ? String(draft.profile_id) : null,
            correlationId,
            idempotencyKey: `${idempotencyKey}:order-created`,
          });
          commerceEvents.push(...orderCommand.events);
        }

        await persistCommerceEvents(commerceEvents, idempotencyKey);
        await finalizeCallbackLedger({
          supabase: backgroundSupabase,
          callbackEventId: callbackEvent.id,
          paymentIntentId,
          paymentAttemptId,
          orderId: confirmedOrderId,
          expectedKurus,
          currency,
          merchantOid,
          payload,
          completedAt,
        });

        if (status === "success" && confirmedOrderId && coreCreated) {
          try {
            await notifyOrderConfirmationEmail(confirmedOrderId);
          } catch (emailError) {
            console.error("Sipariş alındı e-postası gönderilemedi", { orderId: confirmedOrderId, emailError });
          }

          if (orderResult?.orderId) {
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
            const attribution = (orderResult.attribution || {}) as Record<string, unknown>;
            const eventId = `purchase-${orderResult.orderId}`;
            await Promise.allSettled([
              sendMetaCapiEvent({
                eventName: "Purchase",
                eventId,
                eventSourceUrl: `${siteUrl}/order-success`,
                visitorId: String(attribution.visitor_id || ""),
                fbp: String(attribution.fbp || ""),
                fbc: String(attribution.fbc || ""),
                email: String(orderResult.customerEmail || ""),
                phone: String(orderResult.customerPhone || ""),
                value: expectedKurus / 100,
                currency: String(orderResult.currency || currency),
                contentIds: Array.isArray(orderResult.itemIds) ? orderResult.itemIds.map(String) : [],
                numItems: Number(orderResult.itemCount || 0),
              }),
              sendGa4MeasurementEvent(
                "purchase",
                String(attribution.visitor_id || attribution.session_id || orderResult.orderId),
                {
                  transaction_id: orderResult.orderNo,
                  value: expectedKurus / 100,
                  currency: String(orderResult.currency || currency),
                  items: (orderResult.itemIds || []).map((id) => ({ item_id: id })),
                  source: String(attribution.source || "direct"),
                  medium: String(attribution.medium || "direct"),
                  campaign: String(attribution.campaign || ""),
                },
              ),
            ]);
          }
        }

        await backgroundSupabase
          .from("commerce_dead_letters")
          .update({ status: "resolved", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("source", "paytr_callback_background")
          .eq("source_id", merchantOid)
          .eq("status", "open");

        console.info("PayTR post-acknowledgement processing completed", {
          merchantOid,
          orderId: confirmedOrderId,
          status: nextStatus,
          eventIds: commerceEvents.map((event) => event.eventId),
        });
      } catch (backgroundError) {
        console.error("PayTR post-acknowledgement processing failed", {
          merchantOid,
          orderId: confirmedOrderId,
          backgroundError,
        });
        await recordBackgroundFailure(backgroundSupabase, merchantOid, confirmedOrderId, backgroundError);
      }
    });

    console.info("PayTR callback acknowledged after durable order commit", {
      merchantOid,
      status,
      orderId: confirmedOrderId,
      coreCreated,
    });
    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("PayTR callback error", error);
    return new NextResponse("BAD", { status: 400 });
  }
}
