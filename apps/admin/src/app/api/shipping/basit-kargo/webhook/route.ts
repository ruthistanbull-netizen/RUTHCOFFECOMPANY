import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { findLocalOrderForWebhook } from "@/lib/basitKargoShipping";
import { phase4OrderShippingEnabled } from "@/lib/phase4Flags";
import { processShippingWebhookInbox } from "@/lib/shippingWebhookProcessor";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function suppliedSecret(request: Request) {
  return clean(request.headers.get("x-webhook-secret"))
    || clean(request.headers.get("x-basit-kargo-secret"))
    || clean(request.headers.get("x-api-key"));
}

function webhookAuthorized(request: Request) {
  const expected = clean(process.env.BASIT_KARGO_WEBHOOK_SECRET);
  if (!expected) return { configured: false, valid: false };
  const supplied = suppliedSecret(request);
  return { configured: true, valid: Boolean(supplied && constantTimeEqual(supplied, expected)) };
}

function eventType(payload: any) {
  return clean(payload?.eventType)
    || clean(payload?.type)
    || clean(payload?.event)
    || clean(payload?.data?.eventType)
    || clean(payload?.data?.type)
    || "basit_kargo.webhook";
}

function externalOrderId(payload: any) {
  return clean(payload?.id)
    || clean(payload?.orderId)
    || clean(payload?.data?.id)
    || clean(payload?.data?.orderId)
    || null;
}

function trackingNumber(payload: any) {
  return clean(payload?.handlerShipmentCode)
    || clean(payload?.shipmentInfo?.handlerShipmentCode)
    || clean(payload?.trackingNo)
    || clean(payload?.data?.handlerShipmentCode)
    || clean(payload?.data?.shipmentInfo?.handlerShipmentCode)
    || null;
}

function eventKey(payload: any, rawBody: string) {
  return clean(payload?.eventId)
    || clean(payload?.eventKey)
    || clean(payload?.idempotencyKey)
    || clean(payload?.data?.eventId)
    || createHash("sha256").update(rawBody).digest("hex");
}

function safeHeaders(request: Request) {
  const allowed = [
    "content-type",
    "user-agent",
    "x-request-id",
    "x-event-id",
    "x-forwarded-for",
    "x-vercel-id",
  ];
  return Object.fromEntries(
    allowed
      .map((name) => [name, request.headers.get(name)])
      .filter(([, value]) => Boolean(value)),
  );
}

export async function POST(request: Request) {
  const authorization = webhookAuthorized(request);
  if (!authorization.configured) {
    return NextResponse.json(
      { ok: false, error: "BASIT_KARGO_WEBHOOK_SECRET ortam değişkeni tanımlı değil." },
      { status: 503 },
    );
  }
  if (!authorization.valid) {
    return NextResponse.json({ ok: false, error: "Webhook anahtarı geçersiz." }, { status: 401 });
  }

  const rawBody = await request.text();
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Webhook gövdesi geçerli JSON değil." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const providerEventKey = eventKey(payload, rawBody);
    const matchedOrderId = await findLocalOrderForWebhook(supabase, payload);

    const { data, error } = await supabase
      .from("shipping_webhook_inbox")
      .upsert({
        provider: "basit_kargo",
        event_key: providerEventKey,
        event_type: eventType(payload),
        external_order_id: externalOrderId(payload),
        tracking_no: trackingNumber(payload),
        signature_valid: true,
        headers: safeHeaders(request),
        payload,
        status: "received",
        next_attempt_at: new Date().toISOString(),
      }, {
        onConflict: "provider,event_key",
        ignoreDuplicates: true,
      })
      .select("id,status")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Webhook kuyruğa alınamadı: ${error.message}` },
        { status: 503 },
      );
    }

    if (!data) {
      return NextResponse.json({ ok: true, duplicate: true, eventKey: providerEventKey });
    }

    if (!phase4OrderShippingEnabled()) {
      return NextResponse.json({
        ok: true,
        accepted: true,
        deferred: true,
        reason: "phase4_disabled",
        inboxId: data.id,
        eventKey: providerEventKey,
        matchedOrderId,
      }, { status: 202 });
    }

    const processing = await processShippingWebhookInbox(supabase, {
      workerId: `webhook-request:${data.id}`,
      limit: 5,
    });

    return NextResponse.json({
      ok: true,
      accepted: true,
      inboxId: data.id,
      eventKey: providerEventKey,
      matchedOrderId,
      processing,
    }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Webhook kuyruğa alınamadı." },
      { status: 503 },
    );
  }
}
