import { createHash } from "node:crypto";
import {
  basitKargoRequest,
  basitStatusLabel,
  normalizeBasitShipment,
  type BasitKargoPackage,
  type NormalizedBasitShipment,
} from "@/lib/basitKargo";
import { enrichOrdersWithShippingAddresses, resolveStructuredShippingAddress } from "@/lib/shippingAddress";
import { sendOrderLifecycleEmail } from "@/lib/orderLifecycleEmails";

export type RecipientOverride = {
  name?: string | null;
  phone?: string | null;
  city?: string | null;
  town?: string | null;
  neighborhood?: string | null;
  address?: string | null;
};

type SaveRemoteShipmentOptions = {
  packages?: BasitKargoPackage[];
  recipient?: Record<string, string>;
  handlerCode?: string;
  handlerName?: string | null;
  quotedPrice?: number | null;
  eventType: string;
  providerEventKey?: string | null;
  correlationId?: string | null;
  source?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeOrderState(value: unknown, paymentStatus?: unknown) {
  const status = clean(value).toLowerCase();
  const payment = clean(paymentStatus).toLowerCase();
  const paid = ["paid", "partially_refunded", "refunded"].includes(payment);

  if (["", "created", "open", "pending"].includes(status)) return paid ? "paid" : "awaiting_payment";
  if (status === "waiting") return "awaiting_payment";
  if (status === "processing") return "in_production";
  if (["preparing", "ready"].includes(status)) return "ready_to_ship";
  if (["completed", "fulfilled"].includes(status)) return "delivered";
  if (status === "canceled") return "cancelled";
  return status;
}

export function mapBasitStatusToShipmentState(status: unknown) {
  const value = clean(status).toUpperCase();
  if (["NEW", "CREATED", "LABEL_CREATED"].includes(value)) return "label_created";
  if (["READY_TO_SHIP", "READY", "READY_FOR_HANDOVER", "PREPARED"].includes(value)) return "ready_for_handover";
  if (["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELAYED"].includes(value)) return "in_transit";
  if (["NEEDS_SUPPORT", "LOST", "DELIVERY_FAILED", "FAILED", "EXCEPTION"].includes(value)) return "exception";
  if (value === "DELIVERED") return "delivered";
  if (["CANCELLED", "CANCELED"].includes(value)) return "cancelled";
  if (value === "RETURNED") return "returned";
  return null;
}

export function normalizePackages(value: unknown): BasitKargoPackage[] {
  const defaults = {
    height: safeNumber(process.env.BASIT_KARGO_DEFAULT_HEIGHT, 1),
    width: safeNumber(process.env.BASIT_KARGO_DEFAULT_WIDTH, 1),
    depth: safeNumber(process.env.BASIT_KARGO_DEFAULT_DEPTH, 1),
    weight: safeNumber(process.env.BASIT_KARGO_DEFAULT_WEIGHT, 1),
  };
  const rows = Array.isArray(value) ? value : [];
  const normalized = rows.slice(0, 10).map((item: any) => ({
    height: safeNumber(item?.height, defaults.height),
    width: safeNumber(item?.width, defaults.width),
    depth: safeNumber(item?.depth, defaults.depth),
    weight: safeNumber(item?.weight, defaults.weight),
  }));
  return normalized.length ? normalized : [defaults];
}

export async function loadShippingOrder(supabase: any, orderId: string) {
  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      id, profile_id, order_no, customer_name, customer_email, customer_phone, status, payment_status,
      state_version, fulfillment_status,
      shipping_address_id, shipping_address_text, shipping_city, shipping_town,
      shipping_neighborhood, shipping_address_line, shipping_postal_code,
      cargo_company, cargo_tracking_no, cargo_tracking_url, shipping_provider, shipping_status,
      shipping_price, shipping_package, shipping_recipient, shipping_updated_at,
      shipping_error, basit_kargo_order_id, basit_kargo_barcode,
      basit_kargo_handler_code, basit_kargo_return_barcode,
      order_items (id, product_id, variant_id, product_slug, product_name, variant_name, quantity)
    `)
    .eq("id", orderId)
    .single();
  if (error || !order) throw new Error(error?.message || "Sipariş bulunamadı.");

  const [enriched] = await enrichOrdersWithShippingAddresses(supabase, [order]);
  return enriched || order;
}

function resolveRecipient(order: any, override: RecipientOverride = {}) {
  const structured = resolveStructuredShippingAddress(order, order.saved_address || null);
  const neighborhood = clean(override.neighborhood) || structured.neighborhood;
  const addressLine = clean(override.address) || structured.address;
  const recipient = {
    name: clean(override.name) || clean(order.customer_name) || clean(order.saved_address?.full_name),
    phone: clean(override.phone) || clean(order.customer_phone) || clean(order.saved_address?.phone),
    city: clean(override.city) || structured.city,
    town: clean(override.town) || structured.town,
    address: [neighborhood, addressLine].filter(Boolean).join(" ").trim(),
  };

  const missing = Object.entries(recipient).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) {
    throw new Error(`Alıcı bilgisi eksik: ${missing.join(", ")}. İl, ilçe ve açık adresi tamamla.`);
  }
  return { ...recipient, neighborhood, addressLine };
}

function contentForOrder(order: any, packages: BasitKargoPackage[]) {
  return {
    name: `Ruth Istanbul ${order.order_no}`,
    code: String(order.order_no || order.id),
    items: (order.order_items || []).map((item: any) => ({
      name: [clean(item.product_name) || "Ürün", clean(item.variant_name)].filter(Boolean).join(" · "),
      code: clean(item.variant_id) || clean(item.product_slug) || clean(item.product_id) || clean(item.id),
      quantity: String(Math.max(1, Number(item.quantity || 1))),
    })),
    packages,
  };
}

export function shippingEventKey(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function appendShippingEvent(supabase: any, orderId: string, input: {
  eventType: string;
  status?: string | null;
  externalOrderId?: string | null;
  barcode?: string | null;
  trackingNo?: string | null;
  payload: unknown;
  eventTime?: string | null;
  eventKey?: string | null;
}) {
  const key = clean(input.eventKey) || shippingEventKey({ orderId, ...input });
  const { error } = await supabase.from("shipping_events").upsert({
    order_id: orderId,
    provider: "basit_kargo",
    event_key: key,
    event_type: input.eventType,
    external_order_id: input.externalOrderId || null,
    barcode: input.barcode || null,
    tracking_no: input.trackingNo || null,
    status: input.status || null,
    status_label: basitStatusLabel(input.status),
    event_time: input.eventTime || new Date().toISOString(),
    payload: input.payload,
  }, { onConflict: "event_key", ignoreDuplicates: true });
  if (error) throw new Error(`Kargo hareketi kaydedilemedi: ${error.message}`);
}

async function transitionOrderReturnRequested(
  supabase: any,
  order: any,
  input: { providerEventKey: string; correlationId: string; metadata: Record<string, unknown> },
) {
  const current = normalizeOrderState(order.status, order.payment_status);
  if (!["shipped", "delivered"].includes(current)) return order;

  const { data, error } = await supabase.rpc("transition_order_state", {
    p_order_id: order.id,
    p_next_status: "return_requested",
    p_expected_version: Number(order.state_version || 0),
    p_reason: "Basit Kargo iade süreci başladı.",
    p_actor_type: "integration",
    p_actor_id: "basit_kargo",
    p_source: "basit_kargo",
    p_correlation_id: input.correlationId,
    p_idempotency_key: `${input.providerEventKey}:return-requested`,
    p_metadata: input.metadata,
  });
  if (error) throw new Error(`İade sipariş durumuna işlenemedi: ${error.message}`);
  return data || order;
}

async function saveRemoteShipment(
  supabase: any,
  order: any,
  shipment: NormalizedBasitShipment,
  input: SaveRemoteShipmentOptions,
) {
  const externalId = shipment.id || clean(order.basit_kargo_order_id) || null;
  const barcode = shipment.barcode || clean(order.basit_kargo_barcode) || null;
  const trackingNo = shipment.trackingNo || barcode || clean(order.cargo_tracking_no) || null;
  const handlerCode = shipment.handlerCode || input.handlerCode || clean(order.basit_kargo_handler_code) || null;
  const handlerName = shipment.handlerName || input.handlerName || clean(order.cargo_company) || handlerCode || null;
  const rawStatus = shipment.status || clean(order.shipping_status) || "READY_TO_SHIP";
  const codeCreated = input.eventType === "shipment_created" && Boolean(externalId || barcode || trackingNo);
  const shipmentState = mapBasitStatusToShipmentState(rawStatus) || (codeCreated ? "label_created" : null);
  const lifecycleStatus = codeCreated && ["label_created", "ready_for_handover"].includes(shipmentState || "")
    ? "READY_TO_SHIP"
    : rawStatus;
  const price = shipment.price ?? input.quotedPrice ?? (Number.isFinite(Number(order.shipping_price)) ? Number(order.shipping_price) : null);
  const providerEventKey = clean(input.providerEventKey) || `basit-kargo:${shippingEventKey({
    orderId: order.id,
    externalId,
    barcode,
    trackingNo,
    rawStatus,
    eventType: input.eventType,
    payload: shipment.raw,
  })}`;
  const correlationId = clean(input.correlationId) || `shipping:${order.id}:${providerEventKey}`;
  const now = new Date().toISOString();

  const metadataUpdate: Record<string, unknown> = {
    shipping_provider: "basit_kargo",
    shipping_price: price,
    shipping_updated_at: now,
    shipping_error: null,
    basit_kargo_order_id: externalId,
    basit_kargo_barcode: barcode,
    basit_kargo_handler_code: handlerCode,
    cargo_company: handlerName,
    cargo_tracking_no: trackingNo,
    updated_at: now,
  };
  if (input.packages) metadataUpdate.shipping_package = input.packages;
  if (input.recipient) {
    metadataUpdate.shipping_recipient = input.recipient;
    metadataUpdate.shipping_city = clean(input.recipient.city) || null;
    metadataUpdate.shipping_town = clean(input.recipient.town) || null;
    metadataUpdate.shipping_neighborhood = clean(input.recipient.neighborhood) || null;
    metadataUpdate.shipping_address_line = clean(input.recipient.addressLine) || clean(input.recipient.address) || null;
    metadataUpdate.shipping_address_text = [
      clean(input.recipient.neighborhood),
      clean(input.recipient.addressLine) || clean(input.recipient.address),
      [clean(input.recipient.town), clean(input.recipient.city)].filter(Boolean).join("/"),
    ].filter(Boolean).join(", ");
  }

  const persisted = await supabase
    .from("orders")
    .update(metadataUpdate)
    .eq("id", order.id)
    .select("*")
    .single();
  if (persisted.error || !persisted.data) {
    throw new Error(`Kargo bilgisi siparişe kaydedilemedi: ${persisted.error?.message || "Bilinmeyen hata"}`);
  }

  const metadata = {
    provider: "basit_kargo",
    raw_status: rawStatus,
    handler_code: handlerCode,
    handler_name: handlerName,
    barcode,
    price,
    event_type: input.eventType,
    raw: shipment.raw,
  };
  let savedOrder = persisted.data;

  if (clean(rawStatus).toUpperCase() === "RETURNING") {
    savedOrder = await transitionOrderReturnRequested(supabase, savedOrder, {
      providerEventKey,
      correlationId,
      metadata,
    });
  } else if (shipmentState) {
    const { data, error } = await supabase.rpc("transition_order_shipment_state", {
      p_order_id: order.id,
      p_next_status: shipmentState,
      p_provider: "basit_kargo",
      p_provider_event_key: providerEventKey,
      p_tracking_no: trackingNo,
      p_tracking_url: clean(order.cargo_tracking_url) || null,
      p_external_order_id: externalId,
      p_expected_version: Number(savedOrder.state_version || 0),
      p_actor_type: "integration",
      p_actor_id: "basit_kargo",
      p_source: input.source || "basit_kargo",
      p_correlation_id: correlationId,
      p_idempotency_key: providerEventKey,
      p_metadata: metadata,
    });
    if (error) throw new Error(`Kargo durumu işlenemedi: ${error.message}`);
    savedOrder = data || savedOrder;
  }

  await appendShippingEvent(supabase, order.id, {
    eventType: input.eventType,
    status: rawStatus,
    externalOrderId: externalId,
    barcode,
    trackingNo,
    payload: shipment.raw,
    eventKey: `${providerEventKey}:raw`,
  });

  try {
    await sendOrderLifecycleEmail(supabase, order.id, lifecycleStatus);
  } catch (error) {
    console.error("Sipariş durum e-postası gönderilemedi:", error);
  }

  return savedOrder;
}

export async function createShipmentForOrder(supabase: any, input: {
  orderId: string;
  handlerCode: string;
  handlerName?: string | null;
  packages?: unknown;
  recipient?: RecipientOverride;
  quotedPrice?: number | null;
}) {
  const order = await loadShippingOrder(supabase, input.orderId);
  if (clean(order.payment_status) !== "paid") throw new Error("Ödemesi alınmamış sipariş için kargo oluşturulamaz.");
  if (order.basit_kargo_order_id && !["cancelled", "canceled"].includes(clean(order.shipping_status).toLowerCase())) {
    throw new Error("Bu sipariş için Basit Kargo gönderisi zaten oluşturulmuş.");
  }

  const packages = normalizePackages(input.packages);
  const recipient = resolveRecipient(order, input.recipient);
  const body = {
    handlerCode: clean(input.handlerCode),
    type: "OUTGOING",
    content: contentForOrder(order, packages),
    client: { name: recipient.name, phone: recipient.phone, city: recipient.city, town: recipient.town, address: recipient.address },
  };
  if (!body.handlerCode) throw new Error("Kargo firması seçilmedi.");

  const created = await basitKargoRequest("/v2/order/barcode", { method: "POST", body: JSON.stringify(body) });
  let normalized = normalizeBasitShipment(created);
  if (normalized.id) {
    try {
      normalized = normalizeBasitShipment(await basitKargoRequest(`/v2/order/${encodeURIComponent(normalized.id)}`));
    } catch {
      // Oluşturma cevabı kaydetmek için yeterliyse detay çağrısının geçici hatası işlemi bozmaz.
    }
  }

  const saved = await saveRemoteShipment(supabase, order, normalized, {
    packages,
    recipient,
    handlerCode: body.handlerCode,
    handlerName: input.handlerName,
    quotedPrice: input.quotedPrice,
    eventType: "shipment_created",
    providerEventKey: `basit-kargo-create:${order.id}:${normalized.id || normalized.barcode || shippingEventKey(created)}`,
  });
  return { order: saved, shipment: normalized };
}

export async function syncShipmentForOrder(
  supabase: any,
  orderId: string,
  eventType = "manual_sync",
  options: { providerEventKey?: string | null; correlationId?: string | null; source?: string } = {},
) {
  const order = await loadShippingOrder(supabase, orderId);
  let payload: unknown;
  if (order.basit_kargo_order_id) payload = await basitKargoRequest(`/v2/order/${encodeURIComponent(order.basit_kargo_order_id)}`);
  else if (order.basit_kargo_barcode) payload = await basitKargoRequest(`/v2/order/barcode/${encodeURIComponent(order.basit_kargo_barcode)}`);
  else if (order.cargo_tracking_no) payload = await basitKargoRequest(`/v2/order/handler-shipment-code/${encodeURIComponent(order.cargo_tracking_no)}`);
  else throw new Error("Senkronize edilecek Basit Kargo gönderisi bulunamadı.");

  const shipment = normalizeBasitShipment(payload);
  const saved = await saveRemoteShipment(supabase, order, shipment, {
    eventType,
    providerEventKey: options.providerEventKey,
    correlationId: options.correlationId,
    source: options.source,
  });
  return { order: saved, shipment };
}

export async function cancelShipmentForOrder(supabase: any, orderId: string) {
  const order = await loadShippingOrder(supabase, orderId);
  const barcode = clean(order.basit_kargo_barcode) || clean(order.cargo_tracking_no);
  if (!barcode) throw new Error("İptal edilecek barkod bulunamadı.");

  const payload = await basitKargoRequest(`/order/barcode/${encodeURIComponent(barcode)}`, { method: "DELETE" });
  const normalizedPayload = normalizeBasitShipment(payload);
  const normalized: NormalizedBasitShipment = {
    ...normalizedPayload,
    id: clean(order.basit_kargo_order_id) || normalizedPayload.id,
    barcode,
    trackingNo: clean(order.cargo_tracking_no) || barcode,
    status: "CANCELLED",
    raw: payload,
  };
  const saved = await saveRemoteShipment(supabase, order, normalized, {
    eventType: "shipment_cancelled",
    providerEventKey: `basit-kargo-cancel:${order.id}:${barcode}`,
  });
  return { order: saved, payload };
}

export async function createReturnForOrder(supabase: any, orderId: string) {
  const order = await loadShippingOrder(supabase, orderId);
  const barcode = clean(order.basit_kargo_barcode) || clean(order.cargo_tracking_no);
  if (!barcode) throw new Error("İade oluşturulacak barkod bulunamadı.");

  const payload = await basitKargoRequest(`/v2/order/return/barcode/${encodeURIComponent(barcode)}`);
  const shipment = normalizeBasitShipment(payload);
  const returnBarcode = shipment.barcode || shipment.trackingNo || (
    typeof payload === "string"
      ? clean(payload)
      : payload && typeof payload === "object"
        ? clean((payload as any).returnBarcode || (payload as any).barcode || (payload as any).code)
        : ""
  );
  const now = new Date().toISOString();
  const result = await supabase.from("orders").update({
    basit_kargo_return_barcode: returnBarcode || null,
    shipping_updated_at: now,
    shipping_error: null,
    updated_at: now,
  }).eq("id", orderId).select("*").single();
  if (result.error || !result.data) throw new Error(result.error?.message || "İade bilgisi kaydedilemedi.");

  const providerEventKey = `basit-kargo-return:${order.id}:${returnBarcode || barcode}`;
  const correlationId = `return:${order.id}:${providerEventKey}`;
  const transitioned = await transitionOrderReturnRequested(supabase, result.data, {
    providerEventKey,
    correlationId,
    metadata: {
      provider: "basit_kargo",
      return_barcode: returnBarcode || barcode,
      raw: payload,
    },
  });

  await appendShippingEvent(supabase, orderId, {
    eventType: "return_created",
    status: "RETURNING",
    externalOrderId: shipment.id || order.basit_kargo_order_id,
    barcode: returnBarcode || barcode,
    trackingNo: shipment.trackingNo,
    payload,
    eventKey: `${providerEventKey}:raw`,
  });
  return { order: transitioned, shipment, payload };
}

export async function findLocalOrderForWebhook(supabase: any, payload: any) {
  const externalId = clean(payload?.id) || clean(payload?.orderId) || clean(payload?.data?.id) || clean(payload?.data?.orderId);
  const barcode = clean(payload?.barcode) || clean(payload?.data?.barcode);
  const trackingNo = clean(payload?.handlerShipmentCode)
    || clean(payload?.shipmentInfo?.handlerShipmentCode)
    || clean(payload?.data?.handlerShipmentCode)
    || clean(payload?.data?.shipmentInfo?.handlerShipmentCode);
  const orderNo = clean(payload?.orderNumber)
    || clean(payload?.content?.code)
    || clean(payload?.data?.orderNumber)
    || clean(payload?.data?.content?.code);

  const checks: Array<[string, string]> = [
    ["basit_kargo_order_id", externalId],
    ["basit_kargo_barcode", barcode],
    ["cargo_tracking_no", trackingNo],
    ["order_no", orderNo.replace(/^#/, "")],
  ];
  for (const [column, value] of checks) {
    if (!value) continue;
    const result = await supabase.from("orders").select("id").eq(column, value).maybeSingle();
    if (!result.error && result.data?.id) return String(result.data.id);
  }
  return null;
}
