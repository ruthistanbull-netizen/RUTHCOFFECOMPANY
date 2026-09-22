import { formatPrice } from "@/lib/format";

export type OrderPresentationLike = {
  id: string;
  order_no: string;
  customer_name: string;
  total_amount: number;
  currency?: string | null;
  created_at: string;
  shipping_fee?: number | null;
  shipping_status?: string | null;
  basit_kargo_order_id?: string | null;
  basit_kargo_barcode?: string | null;
  cargo_tracking_no?: string | null;
  order_items?: Array<{
    quantity?: number | null;
    product_name?: string | null;
    variant_name?: string | null;
    image_url?: string | null;
  }>;
};

const TIME_ZONE = "Europe/Istanbul";

function dateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "invalid";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";
  return `${year}-${month}-${day}`;
}

export function orderItemCount(order: Pick<OrderPresentationLike, "order_items">) {
  return (order.order_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

export function hasActiveShipment(order: Pick<OrderPresentationLike, "basit_kargo_order_id" | "shipping_status">) {
  const status = String(order.shipping_status || "").trim().toLowerCase();
  return Boolean(order.basit_kargo_order_id && !["cancelled", "canceled", "not_created"].includes(status));
}

export function orderTrackingCode(order: Pick<OrderPresentationLike, "cargo_tracking_no" | "basit_kargo_barcode">) {
  return order.cargo_tracking_no || order.basit_kargo_barcode || "";
}

export function customerShippingInfo(order: Pick<OrderPresentationLike, "shipping_fee" | "currency">) {
  const fee = Number(order.shipping_fee || 0);
  if (!Number.isFinite(fee) || fee <= 0) {
    return { label: "Ücretsiz Kargo", detail: "Müşteri ₺0,00" };
  }
  return { label: "Ücretli Kargo", detail: `Müşteri ${formatPrice(fee, order.currency || "TRY")}` };
}

export function orderDateGroupLabel(value: string, now = new Date()) {
  const key = dateKey(value);
  const todayKey = dateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dateKey(yesterday);

  if (key === todayKey) return "Bugün";
  if (key === yesterdayKey) return "Dün";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarihsiz";
  const sameYear = key.slice(0, 4) === todayKey.slice(0, 4);
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" as const }),
  }).format(date);
}

export function orderCardTimeText(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function groupOrdersByDate<T extends { created_at: string }>(orders: T[]) {
  const groups = new Map<string, { key: string; label: string; orders: T[] }>();
  for (const order of orders) {
    const key = dateKey(order.created_at);
    const current = groups.get(key);
    if (current) current.orders.push(order);
    else groups.set(key, { key, label: orderDateGroupLabel(order.created_at), orders: [order] });
  }
  return Array.from(groups.values());
}
