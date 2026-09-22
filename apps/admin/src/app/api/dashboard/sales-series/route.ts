import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function dayKey(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const metric = url.searchParams.get("metric") || "sales";
  const period = url.searchParams.get("period") || "weekly";
  const days = period === "daily" ? 14 : period === "monthly" ? 90 : period === "yearly" ? 365 : 42;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const { data, error } = await auth.supabase
    .from("orders")
    .select("id,total_amount,payment_status,status,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const buckets = new Map<string, { sales: number; orders: number }>();
  for (const order of data || []) {
    const key = dayKey(order.created_at);
    if (!key) continue;
    const current = buckets.get(key) || { sales: 0, orders: 0 };
    current.orders += 1;
    if (
      ["paid", "succeeded"].includes(String(order.payment_status || "").toLowerCase()) ||
      String(order.status || "").toLowerCase() === "completed"
    ) {
      current.sales += Number(order.total_amount || 0);
    }
    buckets.set(key, current);
  }

  const series = [...buckets.entries()].map(([key, value]) => ({
    key,
    label: new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(new Date(key)),
    value: metric === "sales" ? Number(value.sales.toFixed(2)) : metric === "carts" ? 0 : value.orders,
    secondary: metric === "sales" ? value.orders : undefined,
  }));

  return NextResponse.json(
    { ok: true, format: metric === "sales" ? "currency" : "number", series },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
