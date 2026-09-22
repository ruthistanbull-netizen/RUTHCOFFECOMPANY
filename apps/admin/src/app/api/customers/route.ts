import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("customer_read_model")
    .select("id,profile_id,full_name,email,phone,is_member,membership_source,city,district,created_at,last_order_at,last_order_no")
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, customers: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
}
