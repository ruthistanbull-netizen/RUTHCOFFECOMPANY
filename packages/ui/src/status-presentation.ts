import type {
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
  ReturnStatus,
  ShipmentStatus,
} from "@ruth-commerce/contracts";
import type {
  CommerceStatusDomain,
  OrderDisplayStatus,
  PaymentDisplayStatus,
} from "@ruth-commerce/contracts/status-display";
import type { StatusTone } from "./primitives";

export type { CommerceStatusDomain, OrderDisplayStatus, PaymentDisplayStatus } from "@ruth-commerce/contracts/status-display";

export type CommerceStatusKey =
  | OrderDisplayStatus
  | PaymentDisplayStatus
  | OrderStatus
  | PaymentStatus
  | FulfillmentStatus
  | ShipmentStatus
  | ReturnStatus
  | "confirmed"
  | "unpaid"
  | "partially_paid"
  | "picking"
  | "packed"
  | "delivery_failed";

export interface CommerceStatusPresentation {
  label: string;
  tone: StatusTone;
}

export interface CommerceStatusOption<Status extends string = string> extends CommerceStatusPresentation {
  value: Status;
}

const orderStatusDictionary: Record<string, CommerceStatusPresentation> = {
  created: { label: "Oluşturuldu", tone: "warning" },
  draft: { label: "Taslak", tone: "neutral" },
  awaiting_payment: { label: "Ödeme Bekleniyor", tone: "warning" },
  pending: { label: "Bekliyor", tone: "warning" },
  confirmed: { label: "Onaylandı", tone: "warning" },
  paid: { label: "Yeni Sipariş", tone: "warning" },
  processing: { label: "Hazırlanıyor", tone: "info" },
  queued: { label: "Hazırlanıyor", tone: "info" },
  in_production: { label: "Hazırlanıyor", tone: "info" },
  quality_control: { label: "Hazırlanıyor", tone: "info" },
  preparing: { label: "Hazırlanıyor", tone: "info" },
  prepared: { label: "Kargoya Hazır", tone: "info" },
  ready: { label: "Kargoya Hazır", tone: "info" },
  ready_to_ship: { label: "Kargoya Hazır", tone: "info" },
  shipped: { label: "Gönderildi", tone: "success" },
  delivered: { label: "Teslim Edildi", tone: "success" },
  completed: { label: "Teslim Edildi", tone: "success" },
  reviewed: { label: "Değerlendirildi", tone: "neutral" },
  cancelled: { label: "İptal Edildi", tone: "danger" },
  return_requested: { label: "İade Talebi", tone: "warning" },
  returned: { label: "Geri Döndü", tone: "neutral" },
};

const paymentStatusDictionary: Record<string, CommerceStatusPresentation> = {
  waiting: { label: "Ödeme Bekleniyor", tone: "warning" },
  pending: { label: "Ödeme Bekleniyor", tone: "warning" },
  requires_action: { label: "Müşteri İşlemi Bekleniyor", tone: "warning" },
  processing: { label: "Ödeme İşleniyor", tone: "info" },
  authorized: { label: "Ödeme Onaylandı", tone: "info" },
  unpaid: { label: "Ödenmedi", tone: "warning" },
  paid: { label: "Ödeme Alındı", tone: "success" },
  partially_paid: { label: "Kısmen Ödendi", tone: "info" },
  failed: { label: "Ödeme Başarısız", tone: "danger" },
  cancelled: { label: "Ödeme İptal Edildi", tone: "danger" },
  partially_refunded: { label: "Kısmen İade Edildi", tone: "info" },
  refunded: { label: "Ödeme İade Edildi", tone: "neutral" },
};

const fulfillmentStatusDictionary: Record<string, CommerceStatusPresentation> = {
  unfulfilled: { label: "Hazırlanmadı", tone: "neutral" },
  queued: { label: "Hazırlanıyor", tone: "info" },
  in_production: { label: "Hazırlanıyor", tone: "info" },
  quality_control: { label: "Hazırlanıyor", tone: "info" },
  picking: { label: "Hazırlanıyor", tone: "info" },
  packed: { label: "Paketlendi", tone: "info" },
  ready: { label: "Hazır", tone: "info" },
  fulfilled: { label: "Tamamlandı", tone: "success" },
  cancelled: { label: "Hazırlama İptal Edildi", tone: "danger" },
};

const shippingStatusDictionary: Record<string, CommerceStatusPresentation> = {
  not_created: { label: "Kargo Oluşturulmadı", tone: "neutral" },
  label_created: { label: "Kargoya Hazır", tone: "info" },
  ready_for_handover: { label: "Kargoya Hazır", tone: "info" },
  ready_to_ship: { label: "Kargoya Hazır", tone: "info" },
  shipped: { label: "Gönderildi", tone: "success" },
  in_transit: { label: "Gönderildi", tone: "success" },
  delivered: { label: "Teslim Edildi", tone: "success" },
  exception: { label: "Kargo İstisnası", tone: "danger" },
  delivery_failed: { label: "Teslim Edilemedi", tone: "danger" },
  cancelled: { label: "Kargo İptal Edildi", tone: "danger" },
  returned: { label: "Geri Döndü", tone: "neutral" },
};

const refundStatusDictionary: Record<string, CommerceStatusPresentation> = {
  requested: { label: "İade Talep Edildi", tone: "warning" },
  return_requested: { label: "İade Talep Edildi", tone: "warning" },
  approved: { label: "İade Onaylandı", tone: "info" },
  rejected: { label: "İade Reddedildi", tone: "danger" },
  in_transit: { label: "İade Kargoda", tone: "info" },
  received: { label: "İade Teslim Alındı", tone: "info" },
  inspected: { label: "İade İncelendi", tone: "info" },
  partially_refunded: { label: "Kısmen İade Edildi", tone: "info" },
  refunded: { label: "İade Edildi", tone: "success" },
  exchanged: { label: "Değişim Tamamlandı", tone: "success" },
  returned: { label: "Geri Döndü", tone: "neutral" },
  cancelled: { label: "İade İptal Edildi", tone: "danger" },
};

const statusDictionaries: Record<CommerceStatusDomain, Record<string, CommerceStatusPresentation>> = {
  order: orderStatusDictionary,
  payment: paymentStatusDictionary,
  fulfillment: fulfillmentStatusDictionary,
  shipping: shippingStatusDictionary,
  refund: refundStatusDictionary,
};

const domainFallbacks: Record<CommerceStatusDomain, CommerceStatusPresentation> = {
  order: { label: "Sipariş durumu bilinmiyor", tone: "neutral" },
  payment: { label: "Ödeme durumu bilinmiyor", tone: "neutral" },
  fulfillment: { label: "Hazırlama durumu bilinmiyor", tone: "neutral" },
  shipping: { label: "Kargo durumu bilinmiyor", tone: "neutral" },
  refund: { label: "İade durumu bilinmiyor", tone: "neutral" },
};

export const orderDisplayStatusOptions: ReadonlyArray<CommerceStatusOption<OrderDisplayStatus>> = [
  { value: "created", ...orderStatusDictionary.created },
  { value: "preparing", ...orderStatusDictionary.preparing },
  { value: "ready", ...orderStatusDictionary.ready },
  { value: "shipped", ...orderStatusDictionary.shipped },
  { value: "completed", ...orderStatusDictionary.completed },
  { value: "reviewed", ...orderStatusDictionary.reviewed },
  { value: "cancelled", ...orderStatusDictionary.cancelled },
];

export const paymentDisplayStatusOptions: ReadonlyArray<CommerceStatusOption<PaymentDisplayStatus>> = [
  { value: "waiting", ...paymentStatusDictionary.waiting },
  { value: "paid", ...paymentStatusDictionary.paid },
  { value: "failed", ...paymentStatusDictionary.failed },
  { value: "refunded", ...paymentStatusDictionary.refunded },
];

export function getCommerceStatusPresentation(
  status: CommerceStatusKey | string,
  domain: CommerceStatusDomain = "order"
): CommerceStatusPresentation {
  return statusDictionaries[domain][status] ?? domainFallbacks[domain];
}

export function getOrderDisplayStatusPresentation(status: OrderDisplayStatus) {
  return getCommerceStatusPresentation(status, "order");
}

export function getPaymentDisplayStatusPresentation(status: PaymentDisplayStatus) {
  return getCommerceStatusPresentation(status, "payment");
}
