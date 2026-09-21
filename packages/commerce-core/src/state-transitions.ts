import type { OrderStatus, PaymentStatus, ShipmentStatus } from "@ruth-commerce/contracts";

export const commerceCoreVersion = "1.3.0";

export class CommerceInvariantError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CommerceInvariantError";
    this.code = code;
  }
}

const orderTransitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  draft: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["paid", "cancelled"],
  paid: ["queued", "in_production", "ready_to_ship", "cancelled"],
  queued: ["in_production", "ready_to_ship", "cancelled"],
  in_production: ["quality_control", "ready_to_ship", "cancelled"],
  quality_control: ["in_production", "ready_to_ship", "cancelled"],
  ready_to_ship: ["shipped", "cancelled"],
  shipped: ["delivered", "return_requested"],
  delivered: ["return_requested"],
  return_requested: ["returned", "delivered"],
  returned: [],
  cancelled: [],
};

const paymentTransitions: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = {
  pending: ["requires_action", "processing", "authorized", "paid", "failed", "cancelled"],
  requires_action: ["processing", "authorized", "paid", "failed", "cancelled"],
  processing: ["authorized", "paid", "failed", "cancelled"],
  authorized: ["paid", "failed", "cancelled"],
  paid: ["partially_refunded", "refunded"],
  partially_refunded: ["partially_refunded", "refunded"],
  failed: ["pending", "cancelled"],
  cancelled: [],
  refunded: [],
};

const shipmentTransitions: Readonly<Record<ShipmentStatus, readonly ShipmentStatus[]>> = {
  not_created: ["label_created", "ready_for_handover", "in_transit", "delivered", "exception", "cancelled"],
  label_created: ["ready_for_handover", "in_transit", "delivered", "exception", "cancelled", "returned"],
  ready_for_handover: ["in_transit", "delivered", "exception", "cancelled", "returned"],
  in_transit: ["delivered", "exception", "returned"],
  exception: ["label_created", "ready_for_handover", "in_transit", "delivered", "returned", "cancelled"],
  delivered: ["returned"],
  returned: [],
  cancelled: ["label_created", "ready_for_handover", "in_transit", "delivered", "exception"],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return orderTransitions[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new CommerceInvariantError("INVALID_ORDER_TRANSITION", `Order status cannot transition from ${from} to ${to}.`);
  }
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return paymentTransitions[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!canTransitionPayment(from, to)) {
    throw new CommerceInvariantError("INVALID_PAYMENT_TRANSITION", `Payment status cannot transition from ${from} to ${to}.`);
  }
}

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return shipmentTransitions[from].includes(to);
}

export function assertShipmentTransition(from: ShipmentStatus, to: ShipmentStatus): void {
  if (!canTransitionShipment(from, to)) {
    throw new CommerceInvariantError("INVALID_SHIPMENT_TRANSITION", `Shipment status cannot transition from ${from} to ${to}.`);
  }
}
