import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createShipmentForOrder } from "@/lib/basitKargoShipping";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const ids: string[] = [...new Set<string>((Array.isArray(body.ids) ? body.ids : []).map((value: unknown) => String(value)).filter(Boolean))].slice(0, 100);
  if (!ids.length) return NextResponse.json({ ok: false, error: "Sipariş seçilmedi." }, { status: 400, headers: noStoreHeaders() });

  const successes: any[] = [];
  const failures: any[] = [];
  for (const orderId of ids) {
    try {
      const result = await createShipmentForOrder(auth.supabase, {
        orderId,
        handlerCode: String(body.handlerCode || ""),
        handlerName: typeof body.handlerName === "string" ? body.handlerName : null,
        packages: body.packages,
        quotedPrice: Number.isFinite(Number(body.quotedPrice)) ? Number(body.quotedPrice) : null,
      });
      successes.push({ orderId, externalId: result.shipment.id, barcode: result.shipment.barcode, trackingNo: result.shipment.trackingNo });
    } catch (error) {
      failures.push({ orderId, error: error instanceof Error ? error.message : "Kargo oluşturulamadı." });
    }
  }
  const revalidate = successes.length ? await revalidateWebsite({ source: "basit-kargo-bulk-created" }) : null;
  return NextResponse.json({ ok: successes.length > 0, created: successes.length, failed: failures.length, successes, failures, revalidate }, {
    status: successes.length ? 200 : 400,
    headers: noStoreHeaders(),
  });
}
