import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 25)));
  const membership = url.searchParams.get("membership") || "all";
  const q = String(url.searchParams.get("q") || "").trim();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = auth.supabase.from("customer_read_model").select("*", { count: "exact" });
  if (membership === "member") query = query.eq("is_member", true);
  if (membership === "guest") query = query.eq("is_member", false);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);

  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = data || [];
  const total = Number(count || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalSpent = rows.reduce((sum: number, row: any) => sum + Number(row.total_spent || 0), 0);
  const totalOrders = rows.reduce((sum: number, row: any) => sum + Number(row.order_count || 0), 0);

  return NextResponse.json({
    ok: true,
    customers: rows.map((row: any) => ({
      ...row,
      reward_points_balance: Number(row.reward_points_balance || 0),
    })),
    summary: {
      totalCustomers: total,
      members: rows.filter((row: any) => row.is_member).length,
      guests: rows.filter((row: any) => !row.is_member).length,
      totalOrders,
      totalSpent,
    },
    pagination: { page, pageSize, total, totalPages, hasMore: page < totalPages },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
