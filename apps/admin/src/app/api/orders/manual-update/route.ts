import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canonicalOrderState, type CanonicalOrderState } from "@/lib/orderStateTransitions";
import { sendOrderLifecycleEmail } from "@/lib/orderLifecycleEmails";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";
import { PATCH as patchOrderFields } from "../route";

export const runtime = "nodejs";

type OrderRow = {
  id: string;
  order_no?: string | null;
  status?: string | null;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  shipping_status?: string | null;
  state_version?: number | null;
  cancelled_at?: string | null;
  delivered_at?: string | null;
};

function fulfillmentFor(status: CanonicalOrderState, current: unknown) {
  if (status === "queued") return "queued";
  if (status === "in_production") return "in_production";
  if (status === "quality_control") return "quality_control";
  if (status === "ready_to_ship") return "ready";
  if (["shipped", "delivered", "return_requested", "returned"].includes(status)) return "fulfilled";
  if (status === "cancelled") return "cancelled";
  return typeof current === "string" && current.trim() ? current : "unfulfilled";
}

function shippingFor(status: CanonicalOrderState, current: unknown) {
  const value = typeof current === "string" ? current.trim() : "";
  if (status === "shipped") return "in_transit";
  if (status === "delivered") return "delivered";
  if (status === "cancelled" && value && value !== "delivered") return "cancelled";
  return value || null;
}

function withoutManualFields(body: Record<string, unknown>) {
  const next = { ...body };
  delete next.status;
  delete next.notify_customer;
  delete next.admin_override;
  delete next.status_reason;
  return next;
}

async function saveOtherFields(request: Request, body: Record<string, unknown>) {
  const passthrough = withoutManualFields(body);
  const hasFields = Object.keys(passthrough).some((key) => key !== "id");
  if (!hasFields) return { ok: true } as Record<string, unknown>;

  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const forwarded = new Request(new URL("/api/orders", request.url), {
    method: "PATCH",
    headers,
    body: JSON.stringify(passthrough),
  });
  const response = await patchOrderFields(forwarded);
  if (!response) {
    return NextResponse.json(
      { ok: false, error: "Sipariş alanları kaydedilemedi: API yanıt döndürmedi." },
      { status: 500, headers: noStoreHeaders() },
    );
  }
  const payload = await response.json().catch(() => ({ ok: false, error: "Sipariş alanları kaydedilemedi." }));
  if (!response.ok) {
    return NextResponse.json(payload, { status: response.status, headers: noStoreHeaders() });
  }
  return payload as Record<string, unknown>;
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Sipariş id yok." }, { status: 400, headers: noStoreHeaders() });

  const baseResult = await saveOtherFields(request, body);
  if (baseResult instanceof NextResponse) return baseResult;
  const requestedStatus = String(body.status || "").trim();
  if (!requestedStatus) {
    return NextResponse.json({ ...baseResult, ok: true, notification: { ok: true, skipped: "status_unchanged" } }, { headers: noStoreHeaders() });
  }

  const { supabase } = auth;
  const { data: current, error: currentError } = await supabase
    .from("orders")
    .select("id, order_no, status, payment_status, fulfillment_status, shipping_status, state_version, cancelled_at, delivered_at")
    .eq("id", id)
    .single();
  if (currentError || !current) {
    return NextResponse.json({ ok: false, error: currentError?.message || "Sipariş bulunamadı." }, { status: 404, headers: noStoreHeaders() });
  }

  const order = current as OrderRow;
  const nextStatus = canonicalOrderState(requestedStatus, order.payment_status);
  const previousStatus = canonicalOrderState(order.status, order.payment_status);
  if (!nextStatus) {
    return NextResponse.json({ ok: false, error: `Bilinmeyen sipariş durumu: ${requestedStatus}` }, { status: 400, headers: noStoreHeaders() });
  }
  if (nextStatus === "paid" && !["paid", "partially_refunded", "refunded"].includes(String(order.payment_status || "").toLowerCase())) {
    return NextResponse.json({ ok: false, error: "Ödeme alınmadan sipariş Yeni sipariş durumuna geçirilemez." }, { status: 400, headers: noStoreHeaders() });
  }

  const notifyCustomer = body.notify_customer === true;
  const changed = previousStatus !== nextStatus;
  let updated: OrderRow = order;
  let warning: string | null = null;
  const correlationId = String(request.headers.get("x-correlation-id") || crypto.randomUUID());

  if (changed) {
    const now = new Date().toISOString();
    const expectedVersion = Number(order.state_version || 0);
    const eventId = crypto.randomUUID();
    const reason = String(body.status_reason || "Panelden manuel durum değişikliği").trim();
    const metadata = {
      route: "/api/orders/manual-update",
      manual_override: body.admin_override !== false,
      requested_status: requestedStatus,
      notify_customer: notifyCustomer,
    };

    const { data, error } = await supabase
      .from("orders")
      .update({
        status: nextStatus,
        fulfillment_status: fulfillmentFor(nextStatus, order.fulfillment_status),
        shipping_status: shippingFor(nextStatus, order.shipping_status),
        state_version: expectedVersion + 1,
        cancelled_at: nextStatus === "cancelled" ? now : order.cancelled_at,
        delivered_at: nextStatus === "delivered" ? now : order.delivered_at,
        updated_at: now,
      })
      .eq("id", id)
      .eq("state_version", expectedVersion)
      .select("id, order_no, status, payment_status, fulfillment_status, shipping_status, state_version, cancelled_at, delivered_at")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message || "Sipariş başka bir işlem tarafından değiştirildi. Sayfayı yenileyip tekrar dene." },
        { status: 409, headers: noStoreHeaders() },
      );
    }
    updated = data as OrderRow;

    const auditResults = await Promise.all([
      supabase.from("order_timeline_events").insert({
        order_id: id,
        event_key: `admin-override:${eventId}`,
        event_type: "order.status_changed",
        from_status: previousStatus,
        to_status: nextStatus,
        payment_status: updated.payment_status,
        fulfillment_status: updated.fulfillment_status,
        shipment_status: updated.shipping_status,
        source: "admin-order-manual-update",
        reason,
        actor_type: "user",
        actor_id: String(auth.profile?.id || auth.user.id),
        correlation_id: correlationId,
        idempotency_key: `admin-override:${id}:${expectedVersion}:${nextStatus}`,
        metadata,
        occurred_at: now,
      }),
      supabase.from("commerce_events").insert({
        event_id: eventId,
        event_type: "order.status_changed",
        aggregate_id: id,
        aggregate_type: "order",
        event_version: 1,
        channel: "admin",
        correlation_id: correlationId,
        actor_id: String(auth.profile?.id || auth.user.id),
        idempotency_key: `admin-override:${id}:${expectedVersion}:${nextStatus}`,
        payload: { orderId: id, from: previousStatus, to: nextStatus, stateVersion: expectedVersion + 1, reason, manualOverride: true },
        occurred_at: now,
      }),
      supabase.from("commerce_audit_logs").insert({
        action: "order.status_changed",
        entity_type: "order",
        entity_id: id,
        actor_type: "user",
        actor_id: String(auth.profile?.id || auth.user.id),
        correlation_id: correlationId,
        reason,
        before_data: { status: previousStatus, state_version: expectedVersion },
        after_data: { status: nextStatus, state_version: expectedVersion + 1 },
        metadata,
        occurred_at: now,
      }),
    ]);
    const auditError = auditResults.find((result) => result.error)?.error;
    if (auditError) {
      console.error("Manual order status audit could not be fully written", auditError);
      warning = `Durum değişti ancak kayıt zincirinin bir bölümü yazılamadı: ${auditError.message}`;
    }
  }

  let notification: unknown = { ok: true, skipped: notifyCustomer ? "status_unchanged" : "disabled" };
  if (notifyCustomer && changed) {
    notification = await sendOrderLifecycleEmail(supabase, id, nextStatus, { allowRepeat: true });
    if (notification && typeof notification === "object" && "ok" in notification && (notification as { ok?: boolean }).ok === false) {
      const message = "error" in notification ? String((notification as { error?: unknown }).error || "Müşteri bildirimi gönderilemedi.") : "Müşteri bildirimi gönderilemedi.";
      warning = warning ? `${warning} ${message}` : message;
    }
  }

  const revalidate = await revalidateWebsite({ source: "admin-order-manual-update" });
  return NextResponse.json({
    ok: true,
    order: updated,
    changed,
    notification,
    correlation_id: correlationId,
    warning: warning || (revalidate.ok ? null : revalidate.message),
  }, { headers: noStoreHeaders() });
}