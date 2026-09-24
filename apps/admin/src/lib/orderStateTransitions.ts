import type { SupabaseClient } from "@supabase/supabase-js";
import { sendOrderLifecycleEmail } from "@/lib/orderLifecycleEmails";

export const canonicalOrderStates = [
  "draft", "awaiting_payment", "paid", "queued", "in_production", "quality_control",
  "ready_to_ship", "shipped", "delivered", "cancelled", "return_requested", "returned",
] as const;

export type CanonicalOrderState = (typeof canonicalOrderStates)[number];
const canonicalOrderStateSet = new Set<string>(canonicalOrderStates);

export type TransitionableOrderRow = {
  id: string;
  order_no?: string | null;
  status?: string | null;
  payment_status?: string | null;
  shipping_status?: string | null;
  shipping_provider?: string | null;
  cargo_company?: string | null;
  cargo_tracking_no?: string | null;
  cargo_tracking_url?: string | null;
  state_version?: number | null;
};

export function canonicalOrderState(value: unknown, paymentStatus?: unknown): CanonicalOrderState | null {
  const raw = String(value || "").trim().toLowerCase();
  const payment = String(paymentStatus || "").trim().toLowerCase();
  const paymentIsPaid = ["paid", "partially_refunded", "refunded"].includes(payment);
  let normalized = raw;
  if (["", "created", "open", "pending", "new"].includes(raw)) normalized = paymentIsPaid ? "paid" : "awaiting_payment";
  else if (raw === "waiting") normalized = "awaiting_payment";
  else if (["processing", "preparing"].includes(raw)) normalized = "in_production";
  else if (["prepared", "ready", "kargoya_hazir", "kargoya-hazir"].includes(raw)) normalized = "ready_to_ship";
  else if (["completed", "fulfilled", "teslim", "teslim_edildi", "teslim-edildi"].includes(raw)) normalized = "delivered";
  else if (raw === "canceled") normalized = "cancelled";
  return canonicalOrderStateSet.has(normalized) ? normalized as CanonicalOrderState : null;
}

export function canonicalShipmentState(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "not_created";
  if (raw === "created") return "label_created";
  if (raw === "ready") return "ready_for_handover";
  if (["shipped", "kargoda"].includes(raw)) return "in_transit";
  if (raw === "teslim_edildi") return "delivered";
  if (["delivery_failed", "failed"].includes(raw)) return "exception";
  if (raw === "canceled") return "cancelled";
  return raw;
}

export type AdminOrderTransitionInput<T extends TransitionableOrderRow = TransitionableOrderRow> = {
  supabase: SupabaseClient;
  order: T;
  requestedStatus: unknown;
  actorId: string;
  reason?: string | null;
  source?: string;
  correlationId?: string;
  idempotencyKey?: string;
  cargoCompany?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  metadata?: Record<string, unknown>;
};

export type AdminOrderTransitionResult<T extends TransitionableOrderRow = TransitionableOrderRow> = {
  data: T | null;
  error: { message: string } | null;
  changed: boolean;
  correlationId: string | null;
  nextStatus: CanonicalOrderState | null;
  email?: unknown;
};

async function lifecycleMail(supabase: SupabaseClient, orderId: string, status: CanonicalOrderState) {
  if (!["ready_to_ship", "shipped", "delivered"].includes(status)) return null;
  try {
    return await sendOrderLifecycleEmail(supabase, orderId, status);
  } catch (error) {
    console.error("Sipariş durum e-postası gönderilemedi:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Sipariş durum e-postası gönderilemedi." };
  }
}

export async function transitionAdminOrder<T extends TransitionableOrderRow>(input: AdminOrderTransitionInput<T>): Promise<AdminOrderTransitionResult<T>> {
  const nextStatus = canonicalOrderState(input.requestedStatus, input.order.payment_status);
  const currentStatus = canonicalOrderState(input.order.status, input.order.payment_status);
  if (!nextStatus) return { data: null, error: { message: `Bilinmeyen sipariş durumu: ${String(input.requestedStatus || "")}` }, changed: false, correlationId: null, nextStatus: null };
  if (currentStatus === nextStatus) return { data: input.order, error: null, changed: false, correlationId: null, nextStatus };

  const expectedVersion = Number(input.order.state_version || 0);
  const source = input.source || "admin";
  const correlationId = input.correlationId || crypto.randomUUID();
  const idempotencyKey = input.idempotencyKey || `admin-order-transition:${input.order.id}:${expectedVersion}:${nextStatus}`;
  const metadata = { order_no: input.order.order_no || null, requested_status: String(input.requestedStatus || ""), ...input.metadata };

  if (nextStatus === "shipped" || nextStatus === "delivered") {
    const nextShipmentStatus = nextStatus === "shipped" ? "in_transit" : "delivered";
    const provider = input.order.shipping_provider || input.cargoCompany || input.order.cargo_company || "manual";
    const response = await (input.supabase.rpc as any)("transition_order_shipment_state", {
      p_order_id: input.order.id,
      p_next_status: nextShipmentStatus,
      p_provider: provider,
      p_provider_event_key: `admin-shipment:${input.order.id}:${expectedVersion}:${nextShipmentStatus}`,
      p_tracking_no: input.trackingNumber || input.order.cargo_tracking_no || null,
      p_tracking_url: input.trackingUrl || input.order.cargo_tracking_url || null,
      p_external_order_id: null,
      p_expected_version: expectedVersion,
      p_actor_type: "user",
      p_actor_id: input.actorId,
      p_source: source,
      p_correlation_id: correlationId,
      p_idempotency_key: idempotencyKey,
      p_metadata: metadata,
    });
    const email = response.error ? null : await lifecycleMail(input.supabase, input.order.id, nextStatus);
    return { data: response.data as T | null, error: response.error, changed: true, correlationId, nextStatus, email };
  }

  const response = await (input.supabase.rpc as any)("transition_order_state", {
    p_order_id: input.order.id,
    p_next_status: nextStatus,
    p_expected_version: expectedVersion,
    p_reason: input.reason || null,
    p_actor_type: "user",
    p_actor_id: input.actorId,
    p_source: source,
    p_correlation_id: correlationId,
    p_idempotency_key: idempotencyKey,
    p_metadata: metadata,
  });
  const email = response.error ? null : await lifecycleMail(input.supabase, input.order.id, nextStatus);
  return { data: response.data as T | null, error: response.error, changed: true, correlationId, nextStatus, email };
}
