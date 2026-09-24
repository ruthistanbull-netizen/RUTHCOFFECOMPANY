import { requireAdmin } from "@/lib/auth";
import { basitKargoLabelSvg, isBasitKargoConfigured } from "@/lib/basitKargo";
import { loadShippingOrder } from "@/lib/basitKargoShipping";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!isBasitKargoConfigured()) {
    return Response.json({ ok: false, configured: false, error: "Basit Kargo henüz bağlı değil." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const { orderId } = await context.params;
    const order = await loadShippingOrder(auth.supabase, orderId);
    if (!order.basit_kargo_order_id) return Response.json({ ok: false, error: "Etiket için Basit Kargo sipariş id bulunamadı." }, { status: 400 });
    const svg = await basitKargoLabelSvg(String(order.basit_kargo_order_id));
    const filename = `${String(order.order_no || order.id).replace(/[^a-zA-Z0-9_-]+/g, "-")}-kargo-etiketi.svg`;
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Etiket alınamadı." }, { status: 400 });
  }
}
