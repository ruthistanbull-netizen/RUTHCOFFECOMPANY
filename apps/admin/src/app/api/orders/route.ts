import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("orders")
    .select("id,order_no,customer_name,customer_email,total_amount,currency,status,payment_status,shipping_status,cargo_tracking_no,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, orders: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
}
