import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const orderId = String(url.searchParams.get("order_id") || url.searchParams.get("id") || "").trim();
  const requestedLimit = Number(url.searchParams.get("limit") || 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(Math.trunc(requestedLimit), 250))
    : 100;

  if (!orderId) {
    return NextResponse.json(
      { ok: false, error: "Sipariş id gerekli." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const { data: order, error: orderError } = await auth.supabase
    .from("orders")
    .select("id, order_no, status, payment_status, fulfillment_status, shipping_status, state_version")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json(
      { ok: false, error: orderError?.message || "Sipariş bulunamadı." },
      { status: 404, headers: noStoreHeaders() },
    );
  }

  const { data: timeline, error: timelineError } = await auth.supabase
    .from("order_timeline_events")
    .select(`
      id,
      event_key,
      event_type,
      from_status,
      to_status,
      payment_status,
      fulfillment_status,
      shipment_status,
      source,
      reason,
      actor_type,
      actor_id,
      correlation_id,
      metadata,
      occurred_at
    `)
    .eq("order_id", orderId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (timelineError) {
    return NextResponse.json(
      { ok: false, error: timelineError.message },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  return NextResponse.json(
    { ok: true, order, timeline: timeline || [] },
    { headers: noStoreHeaders() },
  );
}
