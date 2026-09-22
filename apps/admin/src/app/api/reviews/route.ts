import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = await requireAdmin(request); if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "pending";
  const { data, error } = await auth.supabase
    .from("product_reviews")
    .select("id, product_id, product_slug, product_name, rating, title, comment, status, reviewer_name, reviewer_email, coupon_code, created_at, updated_at")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, reviews: data || [] });
}
