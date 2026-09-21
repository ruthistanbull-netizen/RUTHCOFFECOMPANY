import type { FulfillmentStatus, Order, OrderItem, OrderStatus, PaymentStatus, ShipmentStatus } from "@ruth-commerce/contracts";
import { CommerceInvariantError, assertMoney, assertOrderTransition, assertPaymentTransition, assertShipmentTransition } from "./index";

export interface OrderMutationResult {
  order: Order;
  changed: boolean;
}

function nowIso(now?: string): string {
  const value = now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(value))) {
    throw new CommerceInvariantError("INVALID_TIMESTAMP", "Order mutation timestamp must be a valid ISO date.");
  }
  return value;
}

export function assertOrderItem(item: OrderItem): void {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new CommerceInvariantError("INVALID_ORDER_ITEM_QUANTITY", "Order item quantity must be a positive integer.");
  }
  assertMoney(item.unitPrice);
  assertMoney(item.discountTotal);
  assertMoney(item.lineTotal);
  const gross = item.unitPrice.amountMinor * item.quantity;
  if (!Number.isSafeInteger(gross) || item.discountTotal.amountMinor > gross) {
    throw new CommerceInvariantError("INVALID_ORDER_ITEM_DISCOUNT", "Order item discount exceeds its gross value.");
  }
  if (item.lineTotal.amountMinor !== gross - item.discountTotal.amountMinor) {
    throw new CommerceInvariantError("ORDER_ITEM_TOTAL_MISMATCH", "Order item line total does not match unit price, quantity and discount.");
  }
}

export function assertOrder(order: Order): void {
  if (!order.orderNumber.trim()) {
    throw new CommerceInvariantError("MISSING_ORDER_NUMBER", "Order number is required.");
  }
  if (order.items.length === 0) {
    throw new CommerceInvariantError("EMPTY_ORDER", "An order must contain at least one item.");
  }
  order.items.forEach(assertOrderItem);
  assertMoney(order.pricing.subtotal);
  assertMoney(order.pricing.discount);
  assertMoney(order.pricing.pointsDiscount);
  assertMoney(order.pricing.shipping);
  assertMoney(order.pricing.tax);
  assertMoney(order.pricing.total);
  const expectedTotal = order.pricing.subtotal.amountMinor
    - order.pricing.discount.amountMinor
    - order.pricing.pointsDiscount.amountMinor
    + order.pricing.shipping.amountMinor
    + order.pricing.tax.amountMinor;
  if (expectedTotal !== order.pricing.total.amountMinor) {
    throw new CommerceInvariantError("ORDER_TOTAL_MISMATCH", "Order pricing breakdown does not match its total.");
  }
}

export function transitionOrderStatus(order: Order, status: OrderStatus, now?: string): OrderMutationResult {
  if (order.status === status) return { order, changed: false };
  assertOrderTransition(order.status, status);
  if (status === "paid" && order.paymentStatus !== "paid") {
    throw new CommerceInvariantError("ORDER_PAYMENT_NOT_PAID", "Order cannot become paid before payment succeeds.");
  }
  if (status === "shipped" && order.shipmentStatus !== "in_transit") {
    throw new CommerceInvariantError("ORDER_SHIPMENT_NOT_IN_TRANSIT", "Order cannot become shipped before its shipment is in transit.");
  }
  if (status === "delivered" && order.shipmentStatus !== "delivered") {
    throw new CommerceInvariantError("ORDER_SHIPMENT_NOT_DELIVERED", "Order cannot become delivered before its shipment is delivered.");
  }
  return { order: { ...order, status, updatedAt: nowIso(now) }, changed: true };
}

export function transitionOrderPayment(order: Order, paymentStatus: PaymentStatus, now?: string): OrderMutationResult {
  if (order.paymentStatus === paymentStatus) return { order, changed: false };
  assertPaymentTransition(order.paymentStatus, paymentStatus);
  const updated: Order = { ...order, paymentStatus, updatedAt: nowIso(now) };
  if (paymentStatus === "paid" && order.status === "awaiting_payment") {
    updated.status = "paid";
  }
  if ((paymentStatus === "failed" || paymentStatus === "cancelled") && order.status === "awaiting_payment") {
    updated.status = "cancelled";
  }
  return { order: updated, changed: true };
}

export function transitionOrderFulfillment(order: Order, fulfillmentStatus: FulfillmentStatus, now?: string): OrderMutationResult {
  if (order.fulfillmentStatus === fulfillmentStatus) return { order, changed: false };
  if (order.status === "cancelled" || order.status === "returned") {
    throw new CommerceInvariantError("TERMINAL_ORDER_FULFILLMENT", "Fulfillment cannot change for a terminal order.");
  }
  return { order: { ...order, fulfillmentStatus, updatedAt: nowIso(now) }, changed: true };
}

export function transitionOrderShipment(order: Order, shipmentStatus: ShipmentStatus, now?: string): OrderMutationResult {
  if (order.shipmentStatus === shipmentStatus) return { order, changed: false };
  assertShipmentTransition(order.shipmentStatus, shipmentStatus);
  const updated: Order = { ...order, shipmentStatus, updatedAt: nowIso(now) };
  if (shipmentStatus === "in_transit" && order.status === "ready_to_ship") updated.status = "shipped";
  if (shipmentStatus === "delivered" && order.status === "shipped") updated.status = "delivered";
  return { order: updated, changed: true };
}
