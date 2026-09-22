import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { basitStatusLabel } from "@/lib/basitKargo";
import { applyRange } from "@/lib/ranges";
import { noStoreHeaders } from "@/lib/websiteRevalidate";
import { enrichOrdersWithShippingAddresses } from "@/lib/shippingAddress";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const range = url.searchParams.get("range") || "all";

  let query = auth.supabase
    .from("orders")
    .select(`
      id, profile_id, order_no, customer_name, customer_email, customer_phone, total_amount, currency,
      status, payment_status, created_at, shipping_address_id, shipping_address_text,
      shipping_city, shipping_town, shipping_neighborhood, shipping_address_line, shipping_postal_code,
      cargo_company, cargo_tracking_no, shipping_provider, shipping_status, shipping_price,
      shipping_package, shipping_recipient, shipping_updated_at, shipping_error,
      basit_kargo_order_id, basit_kargo_barcode, basit_kargo_handler_code,
      basit_kargo_return_barcode,
      order_items (id, product_name, variant_name, quantity)
    `)
    .eq("payment_status", "paid")
    .order("created_at", { ascending: false })
    .limit(250);

  query = applyRange(query, "created_at", range);
  if (q) query = query.or(`order_no.ilike.%${q}%,customer_name.ilike.%${q}%,customer_email.ilike.%${q}%,customer_phone.ilike.%${q}%`);
  const result = await query;
  if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 400, headers: noStoreHeaders() });

  const enrichedOrders = await enrichOrdersWithShippingAddresses(auth.supabase, result.data || []);
  const orderIds = enrichedOrders.map((order: any) => String(order.id));
  const eventByOrder = new Map<string, any[]>();
  if (orderIds.length) {
    const events = await auth.supabase
      .from("shipping_events")
      .select("id, order_id, event_type, status, status_label, tracking_no, barcode, event_time, created_at")
      .in("order_id", orderIds)
      .order("event_time", { ascending: false })
      .limit(1000);
    for (const event of events.data || []) {
      const key = String(event.order_id);
      const rows = eventByOrder.get(key) || [];
      if (rows.length < 12) rows.push(event);
      eventByOrder.set(key, rows);
    }
  }

  const orders = enrichedOrders.map((order: any) => ({
    ...order,
    shipping_status_label: basitStatusLabel(order.shipping_status),
    shipping_events: eventByOrder.get(String(order.id)) || [],
  }));
  return NextResponse.json({ ok: true, orders }, { headers: noStoreHeaders() });
}
