import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const [productsResult, ordersCountResult, customersResult, recentResult, paidResult] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("orders").select("id", { count: "exact", head: true }),
    supabase.from("customer_read_model").select("id", { count: "exact", head: true }),
    supabase.from("orders").select("id,order_no,customer_name,total_amount,currency,status,payment_status,created_at").order("created_at", { ascending: false }).limit(8),
    supabase.from("orders").select("total_amount,status,payment_status").or("payment_status.eq.paid,payment_status.eq.succeeded,status.eq.completed").limit(1000),
  ]);

  const hardError = productsResult.error || ordersCountResult.error || recentResult.error;
  if (hardError) {
    return NextResponse.json({ ok: false, error: hardError.message }, { status: 500 });
  }

  const revenue = (paidResult.data || []).reduce((sum, order: any) => sum + number(order.total_amount), 0);

  return NextResponse.json({
    ok: true,
    summary: {
      orders: Number(ordersCountResult.count || 0),
      revenue: Number(revenue.toFixed(2)),
      products: Number(productsResult.count || 0),
      customers: Number(customersResult.count || 0),
    },
    recentOrders: recentResult.data || [],
    warnings: [
      customersResult.error?.message,
      paidResult.error?.message,
    ].filter(Boolean),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
