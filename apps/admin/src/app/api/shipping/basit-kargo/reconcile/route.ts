import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { BasitKargoApiError, basitKargoRequest, isBasitKargoConfigured, normalizeBasitShipment } from "@/lib/basitKargo";
import { appendShippingEvent, syncShipmentForOrder } from "@/lib/basitKargoShipping";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

const REMOTE_STATUSES = [
  "NEW",
  "READY_TO_SHIP",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "NEEDS_SUPPORT",
  "DELAYED",
  "RETURNING",
  "RETURNED",
  "LOST",
];

const LOCAL_FINAL_STATES = new Set(["delivered", "returned", "not_created"]);
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const MAX_DIRECT_VERIFICATIONS = 30;
const MAX_STATUS_SYNCS = 120;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function pageRows(payload: unknown) {
  if (Array.isArray(payload)) return { rows: payload, totalPages: null as number | null, recognized: true };
  const source = record(payload);
  for (const key of ["content", "data", "items", "orders", "result"]) {
    if (Array.isArray(source[key])) {
      const totalPages = Number(source.totalPages ?? source.total_pages ?? source.pageCount ?? source.page_count);
      return {
        rows: source[key] as unknown[],
        totalPages: Number.isFinite(totalPages) && totalPages > 0 ? Math.trunc(totalPages) : null,
        recognized: true,
      };
    }
  }
  return { rows: [] as unknown[], totalPages: null as number | null, recognized: false };
}

function canonicalOrderState(status: unknown, paymentStatus: unknown) {
  const value = clean(status).toLocaleLowerCase("tr-TR");
  const payment = clean(paymentStatus).toLocaleLowerCase("tr-TR");
  const paid = ["paid", "partially_refunded", "refunded"].includes(payment);

  if (["created", "new", "open", "pending", "paid", "confirmed"].includes(value)) return paid ? "paid" : "awaiting_payment";
  if (["preparing", "processing", "queued", "in_production", "quality_control"].includes(value)) return "in_production";
  if (["prepared", "ready", "ready_to_ship", "label_created", "ready_for_handover"].includes(value)) return "ready_to_ship";
  if (["shipped", "in_transit", "out_for_delivery"].includes(value)) return "shipped";
  if (["completed", "fulfilled", "delivered"].includes(value)) return "delivered";
  if (["cancelled", "canceled"].includes(value)) return "cancelled";
  return value;
}

function expectedFulfillmentStatus(order: any) {
  const state = canonicalOrderState(order.status, order.payment_status);
  if (state === "in_production") return "in_production";
  if (state === "ready_to_ship") return "ready";
  if (state === "delivered") return "fulfilled";
  return "unfulfilled";
}

function shouldCheck(order: any) {
  const hasIdentity = Boolean(clean(order.basit_kargo_order_id) || clean(order.basit_kargo_barcode) || clean(order.cargo_tracking_no));
  if (!hasIdentity) return false;
  const shippingState = clean(order.shipping_status).toLocaleLowerCase("tr-TR");
  return !LOCAL_FINAL_STATES.has(shippingState);
}

function remoteKeys(rows: unknown[]) {
  const ids = new Set<string>();
  const barcodes = new Set<string>();
  const trackingNumbers = new Set<string>();

  for (const row of rows) {
    const shipment = normalizeBasitShipment(row);
    if (shipment.id) ids.add(shipment.id);
    if (shipment.barcode) barcodes.add(shipment.barcode);
    if (shipment.trackingNo) trackingNumbers.add(shipment.trackingNo);
  }
  return { ids, barcodes, trackingNumbers };
}

function findRemoteShipment(order: any, rows: unknown[]) {
  const id = clean(order.basit_kargo_order_id);
  const barcode = clean(order.basit_kargo_barcode);
  const tracking = clean(order.cargo_tracking_no);
  for (const row of rows) {
    const shipment = normalizeBasitShipment(row);
    if ((id && shipment.id === id) || (barcode && shipment.barcode === barcode) || (tracking && shipment.trackingNo === tracking)) {
      return shipment;
    }
  }
  return null;
}

function existsRemotely(order: any, keys: ReturnType<typeof remoteKeys>) {
  const id = clean(order.basit_kargo_order_id);
  const barcode = clean(order.basit_kargo_barcode);
  const tracking = clean(order.cargo_tracking_no);
  return Boolean(
    (id && keys.ids.has(id)) ||
    (barcode && keys.barcodes.has(barcode)) ||
    (tracking && keys.trackingNumbers.has(tracking)),
  );
}

function lookupPaths(order: any) {
  const paths: string[] = [];
  const id = clean(order.basit_kargo_order_id);
  const barcode = clean(order.basit_kargo_barcode);
  const tracking = clean(order.cargo_tracking_no);
  if (id) paths.push(`/v2/order/${encodeURIComponent(id)}`);
  if (barcode) paths.push(`/v2/order/barcode/${encodeURIComponent(barcode)}`);
  if (tracking) paths.push(`/v2/order/handler-shipment-code/${encodeURIComponent(tracking)}`);
  return [...new Set(paths)];
}

function isMissingError(error: unknown) {
  if (!(error instanceof BasitKargoApiError)) return false;
  if ([404, 410].includes(error.status)) return true;
  if (error.status !== 400) return false;
  return /(bulunamad|not\s*found|does\s*not\s*exist|mevcut\s*değil|kayıt\s*yok)/i.test(error.message);
}

async function confirmedRemovedRemotely(order: any) {
  const paths = lookupPaths(order);
  if (!paths.length) return false;
  let missingResponses = 0;

  for (const path of paths) {
    try {
      const payload = await basitKargoRequest(path);
      const status = clean(normalizeBasitShipment(payload).status).toUpperCase();
      if (["CANCELLED", "CANCELED", "DELETED"].includes(status)) return true;
      return false;
    } catch (error) {
      if (!isMissingError(error)) throw error;
      missingResponses += 1;
    }
  }

  return missingResponses === paths.length;
}

async function clearDeletedShipment(supabase: any, order: any) {
  const now = new Date().toISOString();
  const previous = {
    basit_kargo_order_id: clean(order.basit_kargo_order_id) || null,
    basit_kargo_barcode: clean(order.basit_kargo_barcode) || null,
    cargo_tracking_no: clean(order.cargo_tracking_no) || null,
    shipping_status: clean(order.shipping_status) || null,
  };

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
      basit_kargo_return_barcode: null,
      cargo_company: null,
      cargo_tracking_no: null,
      cargo_tracking_url: null,
      delivered_at: canonicalOrderState(order.status, order.payment_status) === "delivered" ? order.delivered_at || null : null,
      fulfillment_status: expectedFulfillmentStatus(order),
      updated_at: now,
    })
    .eq("id", order.id)
    .select("id, order_no, shipping_status, fulfillment_status")
    .single();

  if (result.error || !result.data) throw new Error(result.error?.message || "Yerel kargo kaydı temizlenemedi.");

  await appendShippingEvent(supabase, order.id, {
    eventType: "remote_shipment_removed",
    status: "NOT_CREATED",
    externalOrderId: previous.basit_kargo_order_id,
    barcode: previous.basit_kargo_barcode,
    trackingNo: previous.cargo_tracking_no,
    payload: {
      source: "basit_kargo_minute_reconcile",
      reason: "shipment_confirmed_missing_or_cancelled",
      previous,
    },
    eventKey: `basit-kargo-remote-removed:${order.id}:${previous.basit_kargo_order_id || previous.basit_kargo_barcode || previous.cargo_tracking_no || "unknown"}`,
  });

  return result.data;
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!isBasitKargoConfigured()) {
    return NextResponse.json({ ok: true, configured: false, checked: 0, synced: 0, removed: 0, deferred: 0, source: "unbound" }, { headers: noStoreHeaders() });
  }

  try {
    const localResult = await auth.supabase
      .from("orders")
      .select("id,order_no,status,payment_status,fulfillment_status,delivered_at,created_at,shipping_status,shipping_updated_at,shipping_provider,basit_kargo_order_id,basit_kargo_barcode,cargo_tracking_no")
      .or("basit_kargo_order_id.not.is.null,basit_kargo_barcode.not.is.null,cargo_tracking_no.not.is.null")
      .order("created_at", { ascending: false })
      .limit(120);

    if (localResult.error) throw new Error(localResult.error.message);
    const localOrders = (localResult.data || []).filter(shouldCheck);
    if (!localOrders.length) {
      return NextResponse.json({ ok: true, checked: 0, synced: 0, removed: 0, deferred: 0 }, { headers: noStoreHeaders() });
    }

    const earliestCreated = localOrders
      .map((order: any) => new Date(order.created_at || "").getTime())
      .filter((value: number) => Number.isFinite(value))
      .reduce((minimum: number, value: number) => Math.min(minimum, value), Date.now());
    const startDate = new Date(earliestCreated - 24 * 60 * 60 * 1000).toISOString().slice(0, 19);

    const remoteRows: unknown[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload = await basitKargoRequest("/v2/order/filter", {
        method: "POST",
        body: JSON.stringify({
          startDate,
          statusList: REMOTE_STATUSES,
          sortBy: "UPDATED_TIME",
          page,
          size: PAGE_SIZE,
        }),
      });
      const parsed = pageRows(payload);
      if (!parsed.recognized) throw new Error("Basit Kargo liste yanıtı tanınamadı; yerel kayıtlar değiştirilmedi.");
      remoteRows.push(...parsed.rows);
      if (parsed.totalPages != null && page + 1 >= parsed.totalPages) break;
      if (parsed.rows.length < PAGE_SIZE) break;
    }

    const keys = remoteKeys(remoteRows);
    const missing = localOrders.filter((order: any) => !existsRemotely(order, keys));
    const present = localOrders.filter((order: any) => existsRemotely(order, keys));
    const candidates = missing.slice(0, MAX_DIRECT_VERIFICATIONS);
    const syncCandidates = present.slice(0, MAX_STATUS_SYNCS);
    const removed: any[] = [];
    const synced: any[] = [];
    const failures: Array<{ orderId: string; error: string }> = [];

    // The old reconcile path only handled shipments that disappeared from Basit Kargo.
    // That left an order stuck at `shipped` when the remote shipment had already become
    // `DELIVERED`. Always reconcile the current remote status for existing shipments too.
    for (const order of syncCandidates) {
      try {
        const remoteShipment = findRemoteShipment(order, remoteRows);
        const remoteStatus = clean(remoteShipment?.status).toUpperCase();
        if (!remoteShipment || !remoteStatus) continue;

        const beforeOrderStatus = clean(order.status).toLowerCase();
        const beforeShipmentStatus = clean(order.shipping_status).toLowerCase();
        const result = await syncShipmentForOrder(auth.supabase, order.id, "scheduled_status_reconcile", {
          source: "basit_kargo_reconcile",
          providerEventKey: `basit-kargo-reconcile:${order.id}:${remoteStatus}:${remoteShipment.id || remoteShipment.barcode || remoteShipment.trackingNo || "unknown"}`,
        });
        const afterOrderStatus = clean(result.order?.status).toLowerCase();
        const afterShipmentStatus = clean(result.order?.shipping_status).toLowerCase();
        if (beforeOrderStatus !== afterOrderStatus || beforeShipmentStatus !== afterShipmentStatus) {
          synced.push(result.order || result);
        }
      } catch (error) {
        failures.push({ orderId: String(order.id), error: error instanceof Error ? error.message : "Kargo durumu senkronize edilemedi." });
      }
    }

    for (const order of candidates) {
      try {
        if (await confirmedRemovedRemotely(order)) removed.push(await clearDeletedShipment(auth.supabase, order));
      } catch (error) {
        failures.push({ orderId: String(order.id), error: error instanceof Error ? error.message : "Kargo kaydı doğrulanamadı." });
      }
    }

    const changed = synced.length + removed.length;
    const revalidate = changed ? await revalidateWebsite({ source: "basit-kargo-minute-reconcile" }) : null;
    return NextResponse.json({
      ok: failures.length === 0,
      checked: localOrders.length,
      remote: remoteRows.length,
      present: present.length,
      missing: missing.length,
      verified: candidates.length,
      synced: synced.length,
      deferred: Math.max(0, missing.length - candidates.length) + Math.max(0, present.length - syncCandidates.length),
      removed: removed.length,
      changed,
      syncedOrders: synced,
      removedOrders: removed,
      failures,
      revalidate,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Basit Kargo kayıtları uzlaştırılamadı.",
    }, { status: 400, headers: noStoreHeaders() });
  }
}
