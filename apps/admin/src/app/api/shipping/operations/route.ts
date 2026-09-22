import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { processShippingWebhookInbox } from "@/lib/shippingWebhookProcessor";
import { syncShipmentForOrder } from "@/lib/basitKargoShipping";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function loadOperations(supabase: any) {
  const [ordersResult, inboxResult, deadLetterResult] = await Promise.all([
    supabase
      .from("orders")
      .select(`
        id,order_no,customer_name,customer_phone,status,payment_status,state_version,
        shipping_provider,shipping_status,shipping_error,shipping_updated_at,
        cargo_company,cargo_tracking_no,basit_kargo_order_id,basit_kargo_barcode,updated_at
      `)
      .or("shipping_status.eq.exception,shipping_error.not.is.null,status.eq.return_requested")
      .order("shipping_updated_at", { ascending: false, nullsFirst: false })
      .limit(100),
    supabase
      .from("shipping_webhook_inbox")
      .select(`
        id,provider,event_key,event_type,external_order_id,tracking_no,signature_valid,
        status,attempts,max_attempts,next_attempt_at,last_error,received_at,processed_at,updated_at
      `)
      .in("status", ["received", "processing", "failed", "dead_letter"])
      .order("received_at", { ascending: false })
      .limit(150),
    supabase
      .from("commerce_dead_letters")
      .select("id,source,source_id,event_type,aggregate_id,status,attempts,error,root_cause,resolution_note,created_at,updated_at")
      .eq("source", "shipping_webhook")
      .in("status", ["open", "retrying"])
      .order("created_at", { ascending: false })
      .limit(150),
  ]);

  const firstError = ordersResult.error || inboxResult.error || deadLetterResult.error;
  if (firstError) throw new Error(firstError.message);

  const orders = ordersResult.data || [];
  const orderIds = orders.map((order: any) => order.id).filter(Boolean);
  let timeline: any[] = [];
  if (orderIds.length) {
    const timelineResult = await supabase
      .from("order_timeline_events")
      .select("id,order_id,event_type,from_status,to_status,shipment_status,source,reason,metadata,occurred_at")
      .in("order_id", orderIds)
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (timelineResult.error) throw new Error(timelineResult.error.message);
    timeline = timelineResult.data || [];
  }

  return {
    orders,
    inbox: inboxResult.data || [],
    deadLetters: deadLetterResult.data || [],
    timeline,
    counts: {
      orderExceptions: orders.length,
      waitingWebhooks: (inboxResult.data || []).filter((row: any) => ["received", "processing"].includes(row.status)).length,
      failedWebhooks: (inboxResult.data || []).filter((row: any) => row.status === "failed").length,
      deadLetters: (inboxResult.data || []).filter((row: any) => row.status === "dead_letter").length,
    },
  };
}

async function auditAction(supabase: any, auth: any, action: string, entityId: string, metadata: Record<string, unknown>) {
  const { error } = await supabase.from("commerce_audit_logs").insert({
    action,
    entity_type: action.startsWith("shipping.webhook") ? "shipping_webhook" : "order",
    entity_id: entityId,
    actor_type: "user",
    actor_id: String(auth.profile?.id || auth.user.id),
    actor_name: auth.profile?.full_name || auth.profile?.email || auth.user.email || null,
    correlation_id: `admin-shipping-operations:${crypto.randomUUID()}`,
    metadata,
    occurred_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Operasyon audit kaydı oluşturulamadı: ${error.message}`);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const data = await loadOperations(auth.supabase);
    return NextResponse.json({ ok: true, ...data }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Kargo operasyonları alınamadı." },
      { status: 400, headers: noStoreHeaders() },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const action = clean(body.action);

  try {
    if (action === "retry_webhook") {
      const inboxId = clean(body.inbox_id);
      if (!inboxId) throw new Error("Webhook inbox id gerekli.");

      const { data, error } = await auth.supabase
        .from("shipping_webhook_inbox")
        .update({
          status: "received",
          attempts: 0,
          next_attempt_at: new Date().toISOString(),
          locked_at: null,
          locked_by: null,
          last_error: null,
          processed_at: null,
        })
        .eq("id", inboxId)
        .in("status", ["failed", "dead_letter"])
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Yeniden denenecek webhook bulunamadı.");

      await auth.supabase
        .from("commerce_dead_letters")
        .update({ status: "retrying", updated_at: new Date().toISOString() })
        .eq("source", "shipping_webhook")
        .eq("source_id", inboxId)
        .in("status", ["open", "retrying"]);

      await auditAction(auth.supabase, auth, "shipping.webhook.retry_requested", inboxId, { route: "/api/shipping/operations" });
      const processing = await processShippingWebhookInbox(auth.supabase, {
        workerId: `admin-retry:${auth.profile?.id || auth.user.id}:${crypto.randomUUID()}`,
        limit: 10,
      });
      return NextResponse.json({ ok: true, processing }, { headers: noStoreHeaders() });
    }

    if (action === "retry_all_webhooks") {
      const { data, error } = await auth.supabase
        .from("shipping_webhook_inbox")
        .update({
          status: "received",
          attempts: 0,
          next_attempt_at: new Date().toISOString(),
          locked_at: null,
          locked_by: null,
          last_error: null,
          processed_at: null,
        })
        .in("status", ["failed", "dead_letter"])
        .select("id");
      if (error) throw new Error(error.message);

      await auth.supabase
        .from("commerce_dead_letters")
        .update({ status: "retrying", updated_at: new Date().toISOString() })
        .eq("source", "shipping_webhook")
        .in("status", ["open", "retrying"]);

      await auditAction(auth.supabase, auth, "shipping.webhook.retry_all_requested", "all", { count: data?.length || 0 });
      const processing = await processShippingWebhookInbox(auth.supabase, {
        workerId: `admin-retry-all:${auth.profile?.id || auth.user.id}:${crypto.randomUUID()}`,
        limit: 50,
      });
      return NextResponse.json({ ok: true, retried: data?.length || 0, processing }, { headers: noStoreHeaders() });
    }

    if (action === "sync_order") {
      const orderId = clean(body.order_id);
      if (!orderId) throw new Error("Sipariş id gerekli.");
      const result = await syncShipmentForOrder(auth.supabase, orderId, "admin_exception_sync", {
        providerEventKey: `admin-exception-sync:${orderId}:${Date.now()}`,
        correlationId: `admin-exception-sync:${crypto.randomUUID()}`,
        source: "admin_shipping_operations",
      });
      await auditAction(auth.supabase, auth, "shipping.order.sync_requested", orderId, { shipment_status: result.shipment.status });
      return NextResponse.json({ ok: true, result }, { headers: noStoreHeaders() });
    }

    throw new Error("Geçersiz operasyon işlemi.");
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Kargo operasyon işlemi başarısız." },
      { status: 400, headers: noStoreHeaders() },
    );
  }
}
