import type {
  OrderDisplayStatus,
  OrderStatusContext,
  PaymentDisplayStatus,
} from "@ruth-commerce/contracts/status-display";

function clean(value?: string | null) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

export function isHistoricalImportedOrder(order?: OrderStatusContext | null) {
  if (!order) return false;
  const source = clean(order.imported_source);
  const note = `${clean(order.customer_note)} ${clean(order.admin_note)}`;
  return (
    source.includes("ikas") ||
    source === "test" ||
    source.includes("sandbox") ||
    source.includes("demo") ||
    note.includes("ikas geçmiş") ||
    note.includes("ikas gecmis") ||
    note.includes("test sipariş") ||
    note.includes("test siparis")
  );
}

function normalizeShippingDisplayStatus(status?: string | null): OrderDisplayStatus | null {
  const value = clean(status);
  if (["delivered", "teslim", "teslim_edildi", "teslim-edildi"].includes(value)) return "completed";
  if (["shipped", "sent", "cargo", "gonderildi", "gönderildi", "in_transit", "out_for_delivery", "kargoya_verildi", "kargoya-verildi"].includes(value)) return "shipped";
  if (["ready", "ready_to_ship", "label_created", "ready_for_handover", "kargoya_hazir", "kargoya-hazir"].includes(value)) return "ready";
  return null;
}

export function normalizeOrderDisplayStatus(
  status?: string | null,
  order?: OrderStatusContext | null
): OrderDisplayStatus {
  const value = clean(status || order?.status);

  if (["reviewed", "degerlendirildi", "değerlendirildi"].includes(value)) return "reviewed";

  if (isHistoricalImportedOrder(order)) {
    if (["cancelled", "canceled", "iptal", "iptal_edildi", "iptal-edildi"].includes(value)) return "cancelled";
    return "completed";
  }

  // Commerce Core shipment state is authoritative for fulfillment display.
  // This also protects the UI from a stale legacy `orders.status` value while
  // the transactional shipment transition is being reconciled.
  const shippingDisplayStatus = normalizeShippingDisplayStatus(order?.shipping_status);
  if (shippingDisplayStatus === "completed") return "completed";
  if (shippingDisplayStatus === "shipped" && value !== "cancelled") return "shipped";
  if (shippingDisplayStatus === "ready" && ["created", "new", "paid", "confirmed", "preparing", "processing", "queued", "in_production", "quality_control"].includes(value)) {
    return "ready";
  }

  if (
    [
      "preparing",
      "processing",
      "queued",
      "in_production",
      "quality_control",
      "return_requested",
    ].includes(value)
  ) {
    return "preparing";
  }

  if (["prepared", "ready", "ready_to_ship", "kargoya_hazir", "kargoya-hazir"].includes(value)) {
    return "ready";
  }

  if (["shipped", "sent", "cargo", "gonderildi", "gönderildi", "in_transit", "out_for_delivery", "kargoya_verildi", "kargoya-verildi"].includes(value)) {
    return "shipped";
  }

  if (["completed", "delivered", "fulfilled", "returned", "teslim", "teslim_edildi", "teslim-edildi"].includes(value)) {
    return "completed";
  }

  if (["cancelled", "canceled", "iptal", "iptal_edildi", "iptal-edildi"].includes(value)) {
    return "cancelled";
  }

  return "created";
}

export function normalizePaymentDisplayStatus(status?: string | null): PaymentDisplayStatus {
  const value = clean(status);

  if (["paid", "success", "successful", "completed", "odendi", "ödendi", "payment_success", "succeeded"].includes(value)) {
    return "paid";
  }

  if (["failed", "fail", "error", "cancelled", "canceled", "declined", "basarisiz", "başarısız", "rejected"].includes(value)) {
    return "failed";
  }

  if (["refunded", "refund", "iade", "iade edildi", "partially_refunded"].includes(value)) {
    return "refunded";
  }

  return "waiting";
}
