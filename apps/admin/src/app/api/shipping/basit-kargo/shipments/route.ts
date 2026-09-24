import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isBasitKargoConfigured } from "@/lib/basitKargo";
import { createShipmentForOrder, syncShipmentForOrder } from "@/lib/basitKargoShipping";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

function canonicalOrderState(status: unknown, paymentStatus: unknown) {
  const value = clean(status);
  const payment = clean(paymentStatus);
  const paid = ["paid", "partially_refunded", "refunded"].includes(payment);

  if (["preparing", "processing", "queued", "in_production", "quality_control"].includes(value)) return "in_production";
  if (["prepared", "ready", "ready_to_ship"].includes(value)) return "ready_to_ship";
  if (["created", "new", "pending", "open", "paid", "confirmed"].includes(value)) return paid ? "paid" : "awaiting_payment";
  if (["cancelled", "canceled"].includes(value)) return "cancelled";
  if (["completed", "fulfilled", "delivered"].includes(value)) return "delivered";
  return value;
}

function expectedFulfillmentStatus(orderState: string) {
  if (orderState === "queued") return "queued";
  if (orderState === "in_production") return "in_production";
  if (orderState === "quality_control") return "quality_control";
  if (orderState === "ready_to_ship") return "ready";
  return "unfulfilled";
}

async function reconcileStaleShipmentBeforeCreate(supabase: any, orderId: string) {
  if (!orderId) return { hasShipmentIdentity: false, reconciled: false };

  const { data: order, error } = await supabase
    .from("orders")
    .select("id,status,payment_status,shipping_status,fulfillment_status,delivered_at,basit_kargo_order_id,basit_kargo_barcode,cargo_tracking_no")
    .eq("id", orderId)
    .single();

  if (error || !order) return { hasShipmentIdentity: false, reconciled: false };

  const orderState = canonicalOrderState(order.status, order.payment_status);
  const preShipmentOrder = ["paid", "queued", "in_production", "quality_control", "ready_to_ship"].includes(orderState);
  const hasShipmentIdentity = Boolean(order.basit_kargo_order_id || order.basit_kargo_barcode || order.cargo_tracking_no);
  const shipmentState = clean(order.shipping_status) || "not_created";
  const staleShipmentState = ["label_created", "ready_for_handover", "in_transit", "delivered", "exception", "returned"].includes(shipmentState);

  if (!preShipmentOrder || !staleShipmentState) return { hasShipmentIdentity, reconciled: false };

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      shipping_status: "not_created",
      fulfillment_status: expectedFulfillmentStatus(orderState),
      delivered_at: null,
      shipping_error: null,
      shipping_updated_at: now,
      updated_at: now,
    })
    .eq("id", orderId);

  if (updateError) throw new Error(`Eski kargo durumu temizlenemedi: ${updateError.message}`);
  return { hasShipmentIdentity, reconciled: true };
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!isBasitKargoConfigured()) {
    return NextResponse.json({ ok: false, configured: false, error: "Basit Kargo henüz bağlı değil." }, { status: 503, headers: noStoreHeaders() });
  }
  try {
    const body = await request.json();
    const orderId = String(body.orderId || "");

    const recovery = await reconcileStaleShipmentBeforeCreate(auth.supabase, orderId);

    if (recovery.hasShipmentIdentity && recovery.reconciled) {
      const result = await syncShipmentForOrder(auth.supabase, orderId);
      const revalidate = await revalidateWebsite({ source: "basit-kargo-shipment-recovered" });
      return NextResponse.json({ ok: true, recovered: true, ...result, revalidate }, { headers: noStoreHeaders() });
    }

    const result = await createShipmentForOrder(auth.supabase, {
      orderId,
      handlerCode: String(body.handlerCode || ""),
      handlerName: typeof body.handlerName === "string" ? body.handlerName : null,
      packages: body.packages,
      recipient: body.recipient,
      quotedPrice: Number.isFinite(Number(body.quotedPrice)) ? Number(body.quotedPrice) : null,
    });
    const revalidate = await revalidateWebsite({ source: "basit-kargo-shipment-created" });
    return NextResponse.json({ ok: true, ...result, revalidate }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Kargo oluşturulamadı." }, { status: 400, headers: noStoreHeaders() });
  }
}
