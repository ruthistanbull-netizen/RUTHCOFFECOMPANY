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
  | "delivery_failed"
  | "ready_packing"
  | "active"
  | "in_stock"
  | "out_of_stock"
  | "succeeded"
  | "success"
  | "archived";

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
  archived: { label: "Arşivlendi", tone: "neutral" },
  awaiting_payment: { label: "Ödeme Bekleniyor", tone: "warning" },
  pending: { label: "Bekliyor", tone: "warning" },
  confirmed: { label: "Onaylandı", tone: "warning" },
  paid: { label: "Yeni Sipariş", tone: "success" },
  succeeded: { label: "Başarılı", tone: "success" },
  success: { label: "Başarılı", tone: "success" },
  active: { label: "Aktif", tone: "success" },
  in_stock: { label: "Stokta", tone: "success" },
  out_of_stock: { label: "Stok Yok", tone: "danger" },
  processing: { label: "Hazırlanıyor", tone: "info" },
  queued: { label: "Hazırlanıyor", tone: "info" },
  in_production: { label: "Üretimde", tone: "warning" },
  quality_control: { label: "Kontrol Ediliyor", tone: "info" },
  preparing: { label: "Hazırlanıyor", tone: "info" },
  prepared: { label: "Kargoya Hazır", tone: "accent" },
  ready: { label: "Kargoya Hazır", tone: "accent" },
  ready_packing: { label: "Paketlemeye Hazır", tone: "accent" },
  ready_to_ship: { label: "Kargoya Hazır", tone: "accent" },
  shipped: { label: "Gönderildi", tone: "accent" },
  in_transit: { label: "Transferde", tone: "info" },
  delivered: { label: "Teslim Edildi", tone: "success" },
  completed: { label: "Teslim Edildi", tone: "success" },
  reviewed: { label: "Değerlendirildi", tone: "neutral" },
  cancelled: { label: "İptal Edildi", tone: "neutral" },
  canceled: { label: "İptal Edildi", tone: "neutral" },
  return_requested: { label: "İade Talebi", tone: "danger" },
  refunded: { label: "İade Edildi", tone: "danger" },
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
  succeeded: { label: "Ödeme Başarılı", tone: "success" },
  success: { label: "Ödeme Başarılı", tone: "success" },
  partially_paid: { label: "Kısmen Ödendi", tone: "info" },
  failed: { label: "Ödeme Başarısız", tone: "danger" },
  cancelled: { label: "Ödeme İptal Edildi", tone: "neutral" },
  canceled: { label: "Ödeme İptal Edildi", tone: "neutral" },
  partially_refunded: { label: "Kısmen İade Edildi", tone: "danger" },
  refunded: { label: "Ödeme İade Edildi", tone: "danger" },
};

const fulfillmentStatusDictionary: Record<string, CommerceStatusPresentation> = {
  unfulfilled: { label: "Hazırlanmadı", tone: "neutral" },
  queued: { label: "Hazırlanıyor", tone: "info" },
  in_production: { label: "Üretimde", tone: "warning" },
  quality_control: { label: "Kontrol Ediliyor", tone: "info" },
  picking: { label: "Toplanıyor", tone: "info" },
  packed: { label: "Paketlendi", tone: "accent" },
  ready_packing: { label: "Paketlemeye Hazır", tone: "accent" },
  ready: { label: "Hazır", tone: "accent" },
  ready_to_ship: { label: "Kargoya Hazır", tone: "accent" },
  fulfilled: { label: "Tamamlandı", tone: "success" },
  cancelled: { label: "Hazırlama İptal Edildi", tone: "neutral" },
  canceled: { label: "Hazırlama İptal Edildi", tone: "neutral" },
};

const shippingStatusDictionary: Record<string, CommerceStatusPresentation> = {
  not_created: { label: "Kargo Oluşturulmadı", tone: "neutral" },
  label_created: { label: "Kargoya Hazır", tone: "accent" },
  ready_for_handover: { label: "Kargoya Hazır", tone: "accent" },
  ready_to_ship: { label: "Kargoya Hazır", tone: "accent" },
  shipped: { label: "Gönderildi", tone: "accent" },
  in_transit: { label: "Transferde", tone: "info" },
  delivered: { label: "Teslim Edildi", tone: "success" },
  exception: { label: "Kargo İstisnası", tone: "danger" },
  delivery_failed: { label: "Teslim Edilemedi", tone: "danger" },
  cancelled: { label: "Kargo İptal Edildi", tone: "neutral" },
  canceled: { label: "Kargo İptal Edildi", tone: "neutral" },
  returned: { label: "Geri Döndü", tone: "neutral" },
};

const refundStatusDictionary: Record<string, CommerceStatusPresentation> = {
  requested: { label: "İade Talep Edildi", tone: "danger" },
  return_requested: { label: "İade Talep Edildi", tone: "danger" },
  approved: { label: "İade Onaylandı", tone: "info" },
  rejected: { label: "İade Reddedildi", tone: "danger" },
  in_transit: { label: "İade Kargoda", tone: "info" },
  received: { label: "İade Teslim Alındı", tone: "info" },
  inspected: { label: "İade İncelendi", tone: "info" },
  partially_refunded: { label: "Kısmen İade Edildi", tone: "danger" },
  refunded: { label: "İade Edildi", tone: "danger" },
  exchanged: { label: "Değişim Tamamlandı", tone: "success" },
  returned: { label: "Geri Döndü", tone: "neutral" },
  cancelled: { label: "İade İptal Edildi", tone: "neutral" },
  canceled: { label: "İade İptal Edildi", tone: "neutral" },
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
