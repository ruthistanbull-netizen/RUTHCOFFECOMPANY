import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const orderId = clean(body.order_id || body.orderId);
    if (!orderId) throw new Error("Sipariş seçilmedi.");

    const { data, error } = await auth.supabase.rpc("delete_manual_order_hard", {
      p_order_id: orderId,
    });
    if (error) throw new Error(error.message);

    const result = data && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, unknown>
      : {};
    const revalidate = await revalidateWebsite({ source: "admin-manual-order-hard-delete" });

    return NextResponse.json({
      ok: true,
      orderId: clean(result.orderId) || orderId,
      orderNo: clean(result.orderNo) || null,
      revalidate,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Manuel sipariş silinemedi.",
    }, { status: 400, headers: noStoreHeaders() });
  }
}
