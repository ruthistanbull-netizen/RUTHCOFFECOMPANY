import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { transitionAdminOrder } from "@/lib/orderStateTransitions";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function turkeyTodayStartUtc() {
  const turkey = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(turkey.getUTCFullYear(), turkey.getUTCMonth(), turkey.getUTCDate()) - 3 * 60 * 60 * 1000);
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const cutoff = turkeyTodayStartUtc().toISOString();

  const { data: candidates, error } = await supabase
    .from("orders")
    .select("id, order_no, status, payment_status, state_version, shipping_status, shipping_provider, cargo_company, cargo_tracking_no, cargo_tracking_url, created_at")
    .eq("payment_status", "paid")
    .in("status", ["created", "new", "paid", "open", "pending"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(120);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });

  let advanced = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const order of candidates || []) {
    const result = await transitionAdminOrder({
      supabase,
      order,
      requestedStatus: "in_production",
      actorId: String(auth.profile?.id || auth.user.id),
      reason: "Sipariş ilk gününü işlemsiz tamamladığı için otomatik hazırlama kuyruğuna alındı.",
      source: "order-age-reconciliation",
      correlationId: `order-age:${order.id}:${cutoff}`,
      idempotencyKey: `order-age:${order.id}:${cutoff}:in_production`,
      metadata: { cutoff, automatic: true },
    });
    if (result.error) failures.push({ id: order.id, error: result.error.message });
    else if (result.changed) advanced += 1;
  }

  return NextResponse.json({ ok: failures.length === 0, advanced, checked: (candidates || []).length, failures }, { status: failures.length ? 207 : 200, headers: noStoreHeaders() });
}
