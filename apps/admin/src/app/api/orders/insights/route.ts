import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const orderId = new URL(request.url).searchParams.get("order_id")?.trim() || "";
  if (!orderId) {
    return NextResponse.json(
      { ok: false, error: "Sipariş bilgisi eksik." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const [{ data, error }, emailResult] = await Promise.all([
    auth.supabase
      .from("orders")
      .select(`
        id,
        order_no,
        profile_id,
        visitor_id,
        purchase_session_id,
        session_count_before_purchase,
        purchase_session_number,
        total_session_duration_seconds,
        purchase_session_duration_seconds,
        attribution_data
      `)
      .eq("id", orderId)
      .single(),
    auth.supabase
      .from("email_logs")
      .select("template_key,status,sent_at,error_message")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
  ]);

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Sipariş bulunamadı." },
      { status: 404, headers: noStoreHeaders() },
    );
  }

  let customer = {
    isMember: false,
    rewardPoints: 0,
  };

  if (data.profile_id) {
    const { data: profile } = await auth.supabase
      .from("profiles")
      .select("auth_user_id,reward_points_balance")
      .eq("id", data.profile_id)
      .maybeSingle();

    customer = {
      isMember: Boolean(profile?.auth_user_id),
      rewardPoints: Math.max(0, Math.floor(Number(profile?.reward_points_balance || 0))),
    };
  }

  return NextResponse.json(
    {
      ok: true,
      order: data,
      customer,
      emailLogs: emailResult.error ? [] : emailResult.data || [],
    },
    { headers: noStoreHeaders() },
  );
}
