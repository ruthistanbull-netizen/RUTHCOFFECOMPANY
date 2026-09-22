import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { cancelShipmentForOrder } from "@/lib/basitKargoShipping";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  try {
    const { orderId } = await context.params;
    const result = await cancelShipmentForOrder(auth.supabase, orderId);
    const now = new Date().toISOString();
    const cleared = await auth.supabase
      .from("orders")
      .update({
        shipping_provider: null,
        shipping_status: "not_created",
        shipping_price: null,
        shipping_error: null,
        shipping_updated_at: now,
        basit_kargo_order_id: null,
        basit_kargo_barcode: null,
        basit_kargo_handler_code: null,
        cargo_company: null,
        cargo_tracking_no: null,
        cargo_tracking_url: null,
        fulfillment_status: "unfulfilled",
        updated_at: now,
      })
      .eq("id", orderId)
      .select("*")
      .single();
    if (cleared.error || !cleared.data) throw new Error(cleared.error?.message || "Yerel kargo kaydı temizlenemedi.");

    const { order: _cancelledOrder, ...cancelResult } = result;
    const revalidate = await revalidateWebsite({ source: "basit-kargo-cancelled" });
    return NextResponse.json({ ok: true, ...cancelResult, order: cleared.data, revalidate }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Kargo iptal edilemedi." }, { status: 400, headers: noStoreHeaders() });
  }
}
