import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { BasitKargoApiError, basitKargoRequest, normalizeBasitShipment } from "@/lib/basitKargo";
import { appendShippingEvent, loadShippingOrder } from "@/lib/basitKargoShipping";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

type ShippingOrder = Awaited<ReturnType<typeof loadShippingOrder>>;

type RemoteLookup = {
  payload: unknown;
  id: string | null;
  barcode: string | null;
  trackingNo: string | null;
  status: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function statusKey(value: unknown) {
  return clean(value).toUpperCase();
}

function errorText(error: unknown) {
  const parts: string[] = [];
  if (error instanceof Error && error.message) parts.push(error.message);
  if (error instanceof BasitKargoApiError && error.details != null) {
    try { parts.push(JSON.stringify(error.details)); } catch { /* noop */ }
  }
  if (typeof error === "string") parts.push(error);
  return parts.join(" ");
}

function missingText(value: unknown) {
  const text = typeof value === "string"
    ? value
    : (() => {
        try { return JSON.stringify(value ?? ""); } catch { return ""; }
      })();
  return /(bulunamad|bulunmuyor|not\s*found|does\s*not\s*exist|mevcut\s*değil|kayıt\s*yok|kargo\s*yok|shipment\s*not\s*found|order\s*not\s*found)/i.test(text);
}

function isAlreadyMissing(error: unknown) {
  if (missingText(errorText(error))) return true;
  if (!(error instanceof BasitKargoApiError)) return false;
  if ([404, 410].includes(error.status)) return true;
  if (error.status < 400 || error.status >= 500 || [401, 403, 408, 429].includes(error.status)) return false;
  return missingText(error.details);
}

function lookupPaths(order: ShippingOrder) {
  const rows = [
    clean(order.basit_kargo_order_id) ? `/v2/order/${encodeURIComponent(clean(order.basit_kargo_order_id))}` : null,
    clean(order.basit_kargo_barcode) ? `/v2/order/barcode/${encodeURIComponent(clean(order.basit_kargo_barcode))}` : null,
    clean(order.cargo_tracking_no) ? `/v2/order/handler-shipment-code/${encodeURIComponent(clean(order.cargo_tracking_no))}` : null,
  ];
  return [...new Set(rows.filter((value): value is string => Boolean(value)))];
}

function meaningfulRemote(remote: RemoteLookup) {
  return Boolean(remote.id || remote.barcode || remote.trackingNo || remote.status);
}

async function lookupRemote(order: ShippingOrder): Promise<RemoteLookup | null> {
  const paths = lookupPaths(order);
  if (!paths.length) return null;

  let sawDefinitiveMissing = false;
  let lastNonMissingError: unknown = null;

  for (const path of paths) {
    try {
      const payload = await basitKargoRequest(path);
      if (missingText(payload)) {
        sawDefinitiveMissing = true;
        continue;
      }
      const normalized = normalizeBasitShipment(payload);
      const remote = {
        payload,
        id: clean(normalized.id) || null,
        barcode: clean(normalized.barcode) || null,
        trackingNo: clean(normalized.trackingNo) || null,
        status: clean(normalized.status) || null,
      };
      if (!meaningfulRemote(remote)) {
        sawDefinitiveMissing = true;
        continue;
      }
      return remote;
    } catch (error) {
      if (isAlreadyMissing(error)) {
        sawDefinitiveMissing = true;
        continue;
      }
      lastNonMissingError = error;
    }
  }

  if (sawDefinitiveMissing) return null;
  if (lastNonMissingError) throw lastNonMissingError;
  return null;
}

function isCancelledRemote(remote: RemoteLookup | null) {
  return ["CANCELLED", "CANCELED", "DELETED"].includes(statusKey(remote?.status));
}

function cancellationBlockedMessage(remote: RemoteLookup | null) {
  const status = statusKey(remote?.status);
  if (["SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "RETURNING", "RETURNED", "LOST"].includes(status)) {
    return "Bu gönderi kargo firmasına teslim edilmiş görünüyor. Basit Kargo API yalnızca şubeye teslim edilmemiş kargo kodlarını iptal edebiliyor.";
  }
  return null;
}

async function cancelRemoteShipment(order: ShippingOrder) {
  const paths = lookupPaths(order);
  if (!paths.length) {
    return {
      alreadyRemoved: true,
      message: "Panelde uzak kargoya ait geçerli kimlik kalmamış; yerel kargo alanları temizlenecek.",
      lookup: null,
    };
  }

  const before = await lookupRemote(order);
  if (!before) {
    return {
      alreadyRemoved: true,
      message: "Basit Kargo kaydı bulunmuyor; panelde kalan eski kargo kodları temizlenecek.",
      lookup: null,
    };
  }
  if (isCancelledRemote(before)) {
    return {
      alreadyRemoved: true,
      message: "Basit Kargo kaydı zaten iptal edilmiş; panel kaydı temizlenecek.",
      lookup: before.payload,
    };
  }

  const candidates = [...new Set([
    clean(before.barcode),
    clean(order.basit_kargo_barcode),
    clean(before.trackingNo),
    clean(order.cargo_tracking_no),
  ].filter(Boolean))];

  if (!candidates.length) {
    return {
      alreadyRemoved: true,
      message: "Basit Kargo kaydında iptal edilebilir barkod bulunmuyor; paneldeki eski kargo alanları temizlenecek.",
      lookup: before.payload,
    };
  }

  const missingErrors: string[] = [];
  let lastNonMissingError: unknown = null;
  for (const barcode of candidates) {
    try {
      const payload = await basitKargoRequest(`/order/barcode/${encodeURIComponent(barcode)}`, { method: "DELETE" });
      if (missingText(payload)) {
        missingErrors.push(typeof payload === "string" ? payload : "Kargo bulunamadı.");
        continue;
      }
      return {
        alreadyRemoved: false,
        barcode,
        payload,
        lookup: before.payload,
      };
    } catch (error) {
      if (isAlreadyMissing(error)) {
        missingErrors.push(errorText(error) || "Kargo bulunamadı.");
        continue;
      }
      lastNonMissingError = error;
    }
  }

  const after = await lookupRemote(order).catch((error) => {
    if (isAlreadyMissing(error)) return null;
    if (missingErrors.length) return null;
    throw error;
  });
  if (!after || isCancelledRemote(after)) {
    return {
      alreadyRemoved: true,
      message: "Basit Kargo kaydı artık bulunmuyor; panelde kalan kargo bilgileri temizlenecek.",
      lookup: after?.payload || before.payload,
      deleteErrors: missingErrors,
    };
  }

  const blocked = cancellationBlockedMessage(after);
  if (blocked) throw new Error(blocked);
  if (lastNonMissingError) throw lastNonMissingError;
  throw new Error("Basit Kargo kaydı hâlâ aktif görünüyor ve iptal isteği kabul edilmedi. Panel kaydı güvenlik için korunuyor.");
}

function nextOrderState(order: ShippingOrder) {
  const current = statusKey(order.status);
  if (["SHIPPED", "DELIVERED", "COMPLETED", "FULFILLED"].includes(current)) {
    return clean(order.payment_status).toLowerCase() === "paid" ? "ready_to_ship" : "awaiting_payment";
  }
  return clean(order.status) || (clean(order.payment_status).toLowerCase() === "paid" ? "ready_to_ship" : "awaiting_payment");
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const { orderId } = await context.params;
    const order = await loadShippingOrder(auth.supabase, orderId);
    const remote = await cancelRemoteShipment(order);
    const now = new Date().toISOString();
    const previous = {
      externalOrderId: clean(order.basit_kargo_order_id) || null,
      barcode: clean(order.basit_kargo_barcode) || null,
      trackingNo: clean(order.cargo_tracking_no) || null,
      handlerCode: clean(order.basit_kargo_handler_code) || null,
      shippingStatus: clean(order.shipping_status) || null,
      orderStatus: clean(order.status) || null,
    };

    const nextStatus = nextOrderState(order);
    const cleared = await auth.supabase
      .from("orders")
      .update({
        status: nextStatus,
        fulfillment_status: nextStatus === "ready_to_ship" ? "ready" : "unfulfilled",
        delivered_at: null,
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
        updated_at: now,
      })
      .eq("id", orderId)
      .select("*")
      .single();

    if (cleared.error || !cleared.data) {
      throw new Error(cleared.error?.message || "Kargo kodu siparişten kaldırılamadı.");
    }

    await appendShippingEvent(auth.supabase, orderId, {
      eventType: "shipment_removed_by_admin",
      status: "NOT_CREATED",
      externalOrderId: previous.externalOrderId,
      barcode: previous.barcode,
      trackingNo: previous.trackingNo,
      payload: {
        source: "admin_order_detail",
        previous,
        remote,
      },
      eventKey: `basit-kargo-admin-remove:${orderId}:${previous.externalOrderId || previous.barcode || previous.trackingNo || now}`,
    });

    const revalidate = await revalidateWebsite({ source: "basit-kargo-shipment-removed" });
    return NextResponse.json({
      ok: true,
      order: cleared.data,
      remote,
      revalidate,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Kargo kodu kaldırılamadı.",
    }, { status: 400, headers: noStoreHeaders() });
  }
}
