import type {
  OrderDisplayStatus,
  OrderStatusContext,
  PaymentDisplayStatus,
} from "@ruth-commerce/contracts/status-display";
import {
  isHistoricalImportedOrder,
  normalizeOrderDisplayStatus,
  normalizePaymentDisplayStatus,
} from "@ruth-commerce/commerce-core/status-normalization";
import {
  getOrderDisplayStatusPresentation,
  getPaymentDisplayStatusPresentation,
  orderDisplayStatusOptions,
} from "@ruth-commerce/ui/status-presentation";

export type OrderStatusKey = OrderDisplayStatus;

export const orderStatusOptions: Array<{ value: OrderStatusKey; label: string }> =
  orderDisplayStatusOptions.map(({ value, label }) => ({ value, label }));

export { isHistoricalImportedOrder };

export function normalizeOrderStatus(
  status?: string | null,
  order?: OrderStatusContext | null
): OrderStatusKey {
  return normalizeOrderDisplayStatus(status, order);
}

export function orderStatusLabel(status?: string | null, order?: OrderStatusContext | null) {
  return getOrderDisplayStatusPresentation(normalizeOrderStatus(status, order)).label;
}

export function orderStatusBadgeClass(status?: string | null, order?: OrderStatusContext | null) {
  return `order-${normalizeOrderStatus(status, order)}`;
}

export function normalizePaymentStatus(status?: string | null): PaymentDisplayStatus {
  return normalizePaymentDisplayStatus(status);
}

export function paymentStatusLabel(status?: string | null) {
  return getPaymentDisplayStatusPresentation(normalizePaymentStatus(status)).label;
}

export function paymentStatusBadgeClass(status?: string | null) {
  return `payment-${normalizePaymentStatus(status)}`;
}
