import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyRange } from "@/lib/ranges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type BasketOrder = {
  payment_status?: string | null;
  status?: string | null;
  imported_source?: string | null;
  customer_note?: string | null;
  admin_note?: string | null;
  order_items?: Array<{ quantity?: number | string | null }> | null;
};

function isTestOrder(order: BasketOrder) {
  const source = String(order.imported_source || "").trim().toLocaleLowerCase("tr-TR");
  const note = `${String(order.customer_note || "")} ${String(order.admin_note || "")}`.toLocaleLowerCase("tr-TR");
  return source === "test" || source.includes("sandbox") || source.includes("demo") || note.includes("test sipariş") || note.includes("test siparis");
}

function isPaid(order: BasketOrder) {
  const payment = String(order.payment_status || "").toLocaleLowerCase("tr-TR");
  const status = String(order.status || "").toLocaleLowerCase("tr-TR");
  return ["paid", "succeeded", "success"].includes(payment) || ["paid", "completed"].includes(status);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "today";

  const query = applyRange(
    supabase
      .from("orders")
      .select("payment_status,status,imported_source,customer_note,admin_note,order_items(quantity)")
      .limit(1000),
    "created_at",
    range,
  ) as any;

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  const paidOrders = ((data || []) as BasketOrder[]).filter((order) => !isTestOrder(order) && isPaid(order));
  const totalItems = paidOrders.reduce((orderTotal, order) => {
    const quantity = (order.order_items || []).reduce((itemTotal, item) => {
      const value = Number(item.quantity || 0);
      return itemTotal + (Number.isFinite(value) ? Math.max(0, value) : 0);
    }, 0);
    return orderTotal + quantity;
  }, 0);

  const averageItems = paidOrders.length > 0 ? totalItems / paidOrders.length : 0;

  return NextResponse.json({
    ok: true,
    averageItems,
    paidOrders: paidOrders.length,
    totalItems,
  }, {
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  });
}
