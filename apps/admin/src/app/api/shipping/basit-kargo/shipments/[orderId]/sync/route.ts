import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { BasitKargoApiError, isBasitKargoConfigured } from "@/lib/basitKargo";
import { cancelShipmentForOrder, createShipmentForOrder, syncShipmentForOrder } from "@/lib/basitKargoShipping";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

function isRemoteMissing(error: unknown) {
  if (error instanceof BasitKargoApiError) return [404, 410].includes(error.status);
  const message = error instanceof Error ? error.message : String(error || "");
  return /(bulunamad|not\s*found|does\s*not\s*exist|mevcut\s*değil|kayıt\s*yok)/i.test(message);
}

async function clearLocalShipment(supabase: any, orderId: string) {
  const now = new Date().toISOString();
  const result = await supabase
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
      updated_at: now,
    })
    .eq("id", orderId)
    .select("*")
    .single();
  if (result.error || !result.data) throw new Error(result.error?.message || "Yerel kargo kaydı temizlenemedi.");
  return result.data;
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!isBasitKargoConfigured()) {
    return NextResponse.json({ ok: false, configured: false, error: "Basit Kargo henüz bağlı değil." }, { status: 503, headers: noStoreHeaders() });
  }
  try {
    const { orderId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const requestedHandlerCode = typeof body?.handlerCode === "string" ? body.handlerCode.trim() : "";
    const requestedHandlerName = typeof body?.handlerName === "string" ? body.handlerName.trim() : "";

    if (requestedHandlerCode) {
      const { data: current } = await auth.supabase
        .from("orders")
        .select("basit_kargo_order_id,basit_kargo_barcode,cargo_tracking_no,basit_kargo_handler_code,shipping_status")
        .eq("id", orderId)
        .maybeSingle();

      const currentHandlerCode = String(current?.basit_kargo_handler_code || "").trim();
      const hasCurrentShipment = Boolean(current?.basit_kargo_order_id || current?.basit_kargo_barcode || current?.cargo_tracking_no);
      const canReplace = hasCurrentShipment && currentHandlerCode && currentHandlerCode !== requestedHandlerCode;

      if (canReplace) {
        try {
          await cancelShipmentForOrder(auth.supabase, orderId);
        } catch (error) {
          if (!isRemoteMissing(error)) throw error;
        }
        await clearLocalShipment(auth.supabase, orderId);
        const created = await createShipmentForOrder(auth.supabase, {
          orderId,
          handlerCode: requestedHandlerCode,
          handlerName: requestedHandlerName || requestedHandlerCode,
          packages: body?.packages,
          recipient: body?.recipient,
          quotedPrice: Number.isFinite(Number(body?.quotedPrice)) ? Number(body.quotedPrice) : null,
        });
        const revalidate = await revalidateWebsite({ source: "basit-kargo-handler-replaced" });
        return NextResponse.json({ ok: true, replaced: true, ...created, revalidate }, { headers: noStoreHeaders() });
      }
    }

    try {
      const result = await syncShipmentForOrder(auth.supabase, orderId);
      const revalidate = await revalidateWebsite({ source: "basit-kargo-manual-sync" });
      return NextResponse.json({ ok: true, ...result, revalidate }, { headers: noStoreHeaders() });
    } catch (error) {
      if (!isRemoteMissing(error)) throw error;
      const order = await clearLocalShipment(auth.supabase, orderId);
      const revalidate = await revalidateWebsite({ source: "basit-kargo-remote-removed" });
      return NextResponse.json({ ok: true, recovered: true, removedRemotely: true, order, revalidate }, { headers: noStoreHeaders() });
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Kargo senkronize edilemedi." }, { status: 400, headers: noStoreHeaders() });
  }
}
