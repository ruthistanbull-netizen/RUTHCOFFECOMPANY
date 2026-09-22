import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createReverseShipmentForReturnCase } from "@/lib/returnReverseShipping";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function searchable(row: any) {
  return [
    row.id,
    row.order_no,
    row.customer_name,
    row.customer_email,
    row.customer_phone,
    row.reverse_shipment_barcode,
    row.reverse_shipment_tracking_no,
    row.order?.order_no,
    row.order?.customer_name,
    row.order?.customer_email,
    row.order?.customer_phone,
  ].join(" ").toLocaleLowerCase("tr-TR");
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const q = clean(url.searchParams.get("q")).toLocaleLowerCase("tr-TR");
  const casesResult = await auth.supabase
    .from("returns_exchanges")
    .select(`
      id, order_id, order_no, type, status, reason, amount,
      customer_name, customer_email, customer_phone,
      reverse_shipment_provider, reverse_shipment_external_id,
      reverse_shipment_barcode, reverse_shipment_tracking_no,
      reverse_shipment_status, reverse_shipment_created_at, reverse_shipment_updated_at,
      created_at, updated_at
    `)
    .order("created_at", { ascending: false })
    .limit(250);

  if (casesResult.error) {
    return NextResponse.json(
      { ok: false, error: casesResult.error.message },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const cases = casesResult.data || [];
  const orderIds = [...new Set(cases.map((item: any) => clean(item.order_id)).filter(Boolean))];
  const ordersById = new Map<string, any>();
  if (orderIds.length) {
    const ordersResult = await auth.supabase
      .from("orders")
      .select(`
        id, order_no, customer_name, customer_email, customer_phone,
        total_amount, currency, status, payment_status, created_at,
        cargo_company, cargo_tracking_no, basit_kargo_barcode,
        basit_kargo_return_barcode, shipping_status
      `)
      .in("id", orderIds);
    if (ordersResult.error) {
      return NextResponse.json(
        { ok: false, error: ordersResult.error.message },
        { status: 400, headers: noStoreHeaders() },
      );
    }
    for (const order of ordersResult.data || []) ordersById.set(String(order.id), order);
  }

  const rows = cases
    .map((item: any) => ({ ...item, order: ordersById.get(String(item.order_id)) || null }))
    .filter((item: any) => !q || searchable(item).includes(q));

  return NextResponse.json({ ok: true, cases: rows }, { headers: noStoreHeaders() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const caseId = clean(body.case_id || body.caseId);
    if (!caseId) {
      return NextResponse.json(
        { ok: false, error: "İade/değişim kaydı seçilmedi." },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    const result = await createReverseShipmentForReturnCase(auth.supabase, caseId);
    const revalidate = await revalidateWebsite({
      source: "admin-return-reverse-shipment-created",
      paths: ["/account/orders"],
      tags: ["orders"],
    });
    return NextResponse.json({ ok: true, ...result, revalidate }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "İade kargo kodu oluşturulamadı.",
      },
      { status: 400, headers: noStoreHeaders() },
    );
  }
}
