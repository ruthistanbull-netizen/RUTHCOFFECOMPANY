import { createHash } from "node:crypto";
import {
  assertCanCreateReverseShipment,
  reverseShipmentIdempotencyKey,
} from "@ruth-commerce/commerce-core";
import { basitKargoRequest, basitStatusLabel, normalizeBasitShipment } from "@/lib/basitKargo";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function eventKey(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function responseBarcode(payload: unknown) {
  const shipment = normalizeBasitShipment(payload);
  if (shipment.barcode || shipment.trackingNo) {
    return { shipment, code: shipment.trackingNo || shipment.barcode || "" };
  }
  if (typeof payload === "string") return { shipment, code: clean(payload) };
  if (payload && typeof payload === "object") {
    const row = payload as Record<string, unknown>;
    return {
      shipment,
      code: clean(row.returnBarcode) || clean(row.barcode) || clean(row.trackingNo) || clean(row.code),
    };
  }
  return { shipment, code: "" };
}

async function loadReturnCase(supabase: any, caseId: string) {
  const result = await supabase
    .from("returns_exchanges")
    .select(`
      id, order_id, order_no, type, status, customer_name, customer_email, customer_phone,
      reverse_shipment_provider, reverse_shipment_external_id,
      reverse_shipment_barcode, reverse_shipment_tracking_no,
      reverse_shipment_status, reverse_shipment_idempotency_key,
      reverse_shipment_payload, reverse_shipment_created_at, reverse_shipment_updated_at,
      created_at, updated_at
    `)
    .eq("id", caseId)
    .single();
  if (result.error || !result.data) {
    throw new Error(result.error?.message || "İade/değişim kaydı bulunamadı.");
  }
  return result.data;
}

async function loadOrder(supabase: any, orderId: string) {
  const result = await supabase
    .from("orders")
    .select(`
      id, order_no, customer_name, customer_email, customer_phone,
      status, payment_status, cargo_company, cargo_tracking_no,
      basit_kargo_order_id, basit_kargo_barcode, basit_kargo_return_barcode,
      shipping_status, shipping_updated_at
    `)
    .eq("id", orderId)
    .single();
  if (result.error || !result.data) {
    throw new Error(result.error?.message || "Sipariş bulunamadı.");
  }
  return result.data;
}

function existingReverseCode(returnCase: any) {
  return clean(returnCase.reverse_shipment_tracking_no) || clean(returnCase.reverse_shipment_barcode);
}

async function saveReturnShipment(
  supabase: any,
  input: {
    returnCase: any;
    order: any;
    payload: unknown;
    code: string;
    idempotencyKey: string;
  },
) {
  const now = new Date().toISOString();
  const normalized = normalizeBasitShipment(input.payload);
  const status = normalized.status || "RETURNING";
  const barcode = normalized.barcode || input.code;
  const trackingNo = normalized.trackingNo || input.code;

  const savedCase = await supabase
    .from("returns_exchanges")
    .update({
      reverse_shipment_provider: "basit_kargo",
      reverse_shipment_external_id: normalized.id || clean(input.order.basit_kargo_order_id) || null,
      reverse_shipment_barcode: barcode,
      reverse_shipment_tracking_no: trackingNo,
      reverse_shipment_status: status,
      reverse_shipment_idempotency_key: input.idempotencyKey,
      reverse_shipment_payload: input.payload || {},
      reverse_shipment_created_at: input.returnCase.reverse_shipment_created_at || now,
      reverse_shipment_updated_at: now,
      updated_at: now,
    })
    .eq("id", input.returnCase.id)
    .select("*")
    .single();
  if (savedCase.error || !savedCase.data) {
    throw new Error(savedCase.error?.message || "İade kargo bilgisi kaydedilemedi.");
  }

  const savedOrder = await supabase
    .from("orders")
    .update({
      basit_kargo_return_barcode: trackingNo,
      shipping_updated_at: now,
      shipping_error: null,
      updated_at: now,
    })
    .eq("id", input.order.id)
    .select("id, order_no, basit_kargo_return_barcode, status")
    .single();
  if (savedOrder.error || !savedOrder.data) {
    throw new Error(savedOrder.error?.message || "İade barkodu siparişe kaydedilemedi.");
  }

  const providerEventKey = `basit-kargo-return:${input.returnCase.id}:${trackingNo}`;
  const shippingEvent = {
    order_id: input.order.id,
    provider: "basit_kargo",
    event_key: providerEventKey,
    event_type: "return_created",
    external_order_id: normalized.id || clean(input.order.basit_kargo_order_id) || null,
    barcode,
    tracking_no: trackingNo,
    status,
    status_label: basitStatusLabel(status),
    event_time: now,
    payload: input.payload || {},
    direction: "return",
    return_case_id: input.returnCase.id,
  };
  const eventResult = await supabase
    .from("shipping_events")
    .upsert(shippingEvent, { onConflict: "event_key", ignoreDuplicates: true });
  if (eventResult.error) {
    throw new Error(`İade kargo hareketi kaydedilemedi: ${eventResult.error.message}`);
  }

  return {
    returnCase: savedCase.data,
    order: savedOrder.data,
    shipment: { ...normalized, barcode, trackingNo, status },
  };
}

export async function createReverseShipmentForReturnCase(supabase: any, caseId: string) {
  const returnCase = await loadReturnCase(supabase, caseId);
  const order = await loadOrder(supabase, String(returnCase.order_id));
  const currentCode = existingReverseCode(returnCase) || clean(order.basit_kargo_return_barcode);
  const outboundBarcode = clean(order.basit_kargo_barcode) || clean(order.cargo_tracking_no);

  if (currentCode) {
    return {
      returnCase,
      order,
      shipment: {
        id: clean(returnCase.reverse_shipment_external_id) || null,
        barcode: clean(returnCase.reverse_shipment_barcode) || currentCode,
        trackingNo: clean(returnCase.reverse_shipment_tracking_no) || currentCode,
        status: clean(returnCase.reverse_shipment_status) || "RETURNING",
        handlerCode: null,
        handlerName: null,
        price: null,
        raw: returnCase.reverse_shipment_payload || {},
      },
      idempotent: true,
    };
  }

  assertCanCreateReverseShipment({
    returnCase: {
      id: String(returnCase.id),
      type: returnCase.type === "exchange" ? "exchange" : "return",
      status: String(returnCase.status || "open"),
    },
    outboundBarcode,
  });

  const idempotencyKey = reverseShipmentIdempotencyKey(String(returnCase.id), outboundBarcode);
  const previousKey = clean(returnCase.reverse_shipment_idempotency_key);
  if (previousKey) {
    const updatedAt = Date.parse(clean(returnCase.reverse_shipment_updated_at));
    const fresh = Number.isFinite(updatedAt) && Date.now() - updatedAt < 5 * 60_000;
    if (fresh && clean(returnCase.reverse_shipment_status).toUpperCase() === "CREATING") {
      throw new Error("İade kargo kodu oluşturma işlemi zaten devam ediyor.");
    }
    await supabase
      .from("returns_exchanges")
      .update({
        reverse_shipment_idempotency_key: null,
        reverse_shipment_status: null,
        reverse_shipment_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", returnCase.id)
      .eq("reverse_shipment_idempotency_key", previousKey)
      .is("reverse_shipment_barcode", null)
      .is("reverse_shipment_tracking_no", null);
  }

  const claimTime = new Date().toISOString();
  const claim = await supabase
    .from("returns_exchanges")
    .update({
      reverse_shipment_idempotency_key: idempotencyKey,
      reverse_shipment_status: "CREATING",
      reverse_shipment_updated_at: claimTime,
      updated_at: claimTime,
    })
    .eq("id", returnCase.id)
    .is("reverse_shipment_idempotency_key", null)
    .select("*")
    .maybeSingle();
  if (claim.error) throw new Error(`İade kargo işlemi kilitlenemedi: ${claim.error.message}`);
  if (!claim.data) {
    const current = await loadReturnCase(supabase, caseId);
    const code = existingReverseCode(current);
    if (code) {
      return createReverseShipmentForReturnCase(supabase, caseId);
    }
    throw new Error("İade kargo kodu oluşturma işlemi başka bir istek tarafından başlatıldı.");
  }

  try {
    const payload = await basitKargoRequest(
      `/v2/order/return/barcode/${encodeURIComponent(outboundBarcode)}`,
      { headers: { "X-Idempotency-Key": idempotencyKey } },
    );
    const normalized = responseBarcode(payload);
    if (!normalized.code) throw new Error("Basit Kargo iade barkodu üretmedi.");
    const saved = await saveReturnShipment(supabase, {
      returnCase: claim.data,
      order,
      payload,
      code: normalized.code,
      idempotencyKey,
    });
    return { ...saved, idempotent: false };
  } catch (error) {
    const resetTime = new Date().toISOString();
    await supabase
      .from("returns_exchanges")
      .update({
        reverse_shipment_idempotency_key: null,
        reverse_shipment_status: null,
        reverse_shipment_updated_at: resetTime,
        updated_at: resetTime,
      })
      .eq("id", returnCase.id)
      .eq("reverse_shipment_idempotency_key", idempotencyKey)
      .is("reverse_shipment_barcode", null)
      .is("reverse_shipment_tracking_no", null);
    throw error;
  }
}

export function returnShippingEventFingerprint(input: unknown) {
  return eventKey(input);
}
