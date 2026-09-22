import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanQuery(value: string | null) {
  return String(value || "").trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ").slice(0, 80);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const query = cleanQuery(new URL(request.url).searchParams.get("q"));
  if (query.length < 2) {
    return NextResponse.json({ ok: true, query, orders: [], customers: [], products: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const pattern = `%${query}%`;
  const { supabase } = auth;
  const [ordersResult, customersResult, productsResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_no, customer_name, customer_email, total_amount, currency, status, payment_status, created_at")
      .or(`order_no.ilike.${pattern},customer_name.ilike.${pattern},customer_email.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("customer_read_model")
      .select("id, full_name, email, phone, reward_points_balance")
      .or(`full_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("products")
      .select("id, name, slug, price, stock_status, main_image_url, status")
      .or(`name.ilike.${pattern},slug.ilike.${pattern}`)
      .order("updated_at", { ascending: false })
      .limit(8),
  ]);

  const error = ordersResult.error || customersResult.error || productsResult.error;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({
    ok: true,
    query,
    orders: ordersResult.data || [],
    customers: customersResult.data || [],
    products: productsResult.data || [],
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
