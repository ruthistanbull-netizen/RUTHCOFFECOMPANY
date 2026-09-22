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
  const membership = String(url.searchParams.get("membership") || "all");
  const sort = String(url.searchParams.get("sort") || "recent");
  const q = String(url.searchParams.get("q") || "").trim();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = auth.supabase.from("customer_read_model").select("*", { count: "exact" });
  if (membership === "member") query = query.eq("is_member", true);
  if (membership === "non_member" || membership === "guest") query = query.eq("is_member", false);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,city.ilike.%${q}%`);

  if (sort === "spent") query = query.order("total_spent", { ascending: false });
  else if (sort === "orders") query = query.order("order_count", { ascending: false });
  else if (sort === "name") query = query.order("full_name", { ascending: true, nullsFirst: false });
  else query = query.order("created_at", { ascending: false });

  const pageResult = await query.range(from, to);
  if (pageResult.error) return NextResponse.json({ ok: false, error: pageResult.error.message }, { status: 500 });

  const [countAll, countMembers, countOrders, revenue] = await Promise.all([
    auth.supabase.from("customer_read_model").select("id", { count: "exact", head: true }),
    auth.supabase.from("customer_read_model").select("id", { count: "exact", head: true }).eq("is_member", true),
    auth.supabase.from("customer_read_model").select("id", { count: "exact", head: true }).gt("order_count", 0),
    auth.supabase.from("customer_read_model").select("total_spent").gt("total_spent", 0).limit(5000),
  ]);

  const customerCount = Number(countAll.count || 0);
  const memberCount = Number(countMembers.count || 0);
  const total = Number(pageResult.count || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const totalPaidRevenue = (revenue.data || []).reduce((sum: number, row: any) => sum + Number(row.total_spent || 0), 0);

  return NextResponse.json({
    ok: true,
    customers: (pageResult.data || []).map((row: any) => ({
      ...row,
      reward_points_balance: Number(row.reward_points_balance || 0),
      birthday_reward_points: Number(row.birthday_reward_points || 0),
      service_email_allowed: row.service_email_allowed !== false,
    })),
    summary: {
      customerCount,
      memberCount,
      nonMemberCount: Math.max(0, customerCount - memberCount),
      customersWithOrders: Number(countOrders.count || 0),
      totalPaidRevenue: Number(totalPaidRevenue.toFixed(2)),
    },
    pagination: { page, pageSize, total, totalPages },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
