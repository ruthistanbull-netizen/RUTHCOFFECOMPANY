import type {
  CommerceEvent,
  InventoryItem,
  InventoryReservation,
  Order,
  PaymentStatus,
  PointsLedgerEntry,
  Shipment,
} from "@ruth-commerce/contracts";
import {
  assertOrderTransition,
  assertPaymentTransition,
  assertShipmentTransition,
} from "./index";
import type {
  AdjustPointsCommand,
  AllocateInventoryCommand,
  ChangeOrderStatusCommand,
  ChangePaymentStatusCommand,
  ChangeShipmentStatusCommand,
  ExpireInventoryCommand,
  RegisterOrderCommand,
  ReleaseInventoryCommand,
  ReserveInventoryCommand,
} from "./commands";
import {
  createDomainEvent,
  type InventoryReservationChangedPayload,
  type InventoryReservedPayload,
  type OrderCreatedPayload,
  type OrderStatusChangedPayload,
  type PaymentStatusChangedPayload,
  type PointsAdjustedPayload,
  type ShipmentStatusChangedPayload,
} from "./events";
import {
  allocateInventoryReservation,
  expireInventoryReservation,
  releaseInventoryReservation,
  reserveInventory,
} from "./inventory";
import { applyPointsEntry, type RuthiePointsAccount } from "./points";

export interface CommandResult<TState, TPayload> {
  state: TState;
  events: CommerceEvent<TPayload>[];
}

export function handleRegisterOrder(
  command: RegisterOrderCommand,
): CommandResult<RegisterOrderCommand["payload"], OrderCreatedPayload> {
  const state = command.payload;
  if (!state.orderNumber.trim()) throw new Error("Sipariş numarası gerekli.");
  if (!Number.isSafeInteger(state.itemCount) || state.itemCount <= 0) {
    throw new Error("Sipariş en az bir ürün içermeli.");
  }
  if (!Number.isSafeInteger(state.total.amountMinor) || state.total.amountMinor < 0) {
    throw new Error("Sipariş toplamı geçersiz.");
  }

  return {
    state,
    events: [
      createDomainEvent({
        type: "order.created",
        aggregateId: state.orderId,
        aggregateType: "order",
        context: command.context,
        occurredAt: command.issuedAt,
        payload: state,
      }),
    ],
  };
}

export function handleChangeOrderStatus(
  command: ChangeOrderStatusCommand,
): CommandResult<Order, OrderStatusChangedPayload> {
  const { order, nextStatus } = command.payload;
  assertOrderTransition(order.status, nextStatus);
  const state: Order = { ...order, status: nextStatus, updatedAt: command.issuedAt };
  return { state, events: [createDomainEvent({ type: "order.status_changed", aggregateId: order.id, aggregateType: "order", context: command.context, occurredAt: command.issuedAt, payload: { orderId: order.id, from: order.status, to: nextStatus } })] };
}

function paymentEventType(status: PaymentStatus): CommerceEvent["type"] {
  switch (status) {
    case "authorized": return "payment.authorized";
    case "paid": return "payment.paid";
    case "failed": return "payment.failed";
    case "partially_refunded":
    case "refunded": return "payment.refunded";
    default: return "order.status_changed";
  }
}

export function handleChangePaymentStatus(command: ChangePaymentStatusCommand): CommandResult<PaymentStatus, PaymentStatusChangedPayload> {
  const { currentStatus, nextStatus, orderId, amount, providerReference } = command.payload;
  assertPaymentTransition(currentStatus, nextStatus);
  return { state: nextStatus, events: [createDomainEvent({ type: paymentEventType(nextStatus), aggregateId: orderId, aggregateType: "payment", context: command.context, occurredAt: command.issuedAt, payload: { orderId, from: currentStatus, to: nextStatus, amount, providerReference } })] };
}

export interface InventoryCommandState { inventory: InventoryItem; reservation: InventoryReservation; }

export function handleReserveInventory(command: ReserveInventoryCommand): CommandResult<InventoryCommandState, InventoryReservedPayload> {
  const result = reserveInventory({ inventory: command.payload.inventory, reservationId: command.payload.reservationId, orderId: command.payload.orderId, variantId: command.payload.variantId, quantity: command.payload.quantity, now: command.issuedAt, expiresAt: command.payload.expiresAt });
  return { state: result, events: [createDomainEvent({ type: "inventory.reserved", aggregateId: result.reservation.id, aggregateType: "inventory_reservation", context: command.context, occurredAt: command.issuedAt, payload: { reservation: result.reservation } })] };
}

export function handleReleaseInventory(command: ReleaseInventoryCommand): CommandResult<InventoryCommandState, InventoryReservationChangedPayload> {
  const previousStatus = command.payload.reservation.status;
  const result = releaseInventoryReservation(command.payload.inventory, command.payload.reservation, command.issuedAt);
  return { state: result, events: [createDomainEvent({ type: "inventory.released", aggregateId: result.reservation.id, aggregateType: "inventory_reservation", context: command.context, occurredAt: command.issuedAt, payload: { reservation: result.reservation, previousStatus, reason: command.payload.reason } })] };
}

export function handleAllocateInventory(command: AllocateInventoryCommand): CommandResult<InventoryCommandState, InventoryReservationChangedPayload> {
  const previousStatus = command.payload.reservation.status;
  const result = allocateInventoryReservation(command.payload.inventory, command.payload.reservation, command.issuedAt);
  return { state: result, events: [createDomainEvent({ type: "inventory.allocated", aggregateId: result.reservation.id, aggregateType: "inventory_reservation", context: command.context, occurredAt: command.issuedAt, payload: { reservation: result.reservation, previousStatus } })] };
}

export function handleExpireInventory(command: ExpireInventoryCommand): CommandResult<InventoryCommandState, InventoryReservationChangedPayload> {
  const previousStatus = command.payload.reservation.status;
  const result = expireInventoryReservation(command.payload.inventory, command.payload.reservation, command.issuedAt);
  return { state: result, events: [createDomainEvent({ type: "inventory.released", aggregateId: result.reservation.id, aggregateType: "inventory_reservation", context: command.context, occurredAt: command.issuedAt, payload: { reservation: result.reservation, previousStatus, reason: "expired" } })] };
}

export function handleChangeShipmentStatus(command: ChangeShipmentStatusCommand): CommandResult<Shipment, ShipmentStatusChangedPayload> {
  const { shipment, nextStatus } = command.payload;
  assertShipmentTransition(shipment.status, nextStatus);
  const state: Shipment = { ...shipment, status: nextStatus, shippedAt: nextStatus === "in_transit" ? shipment.shippedAt ?? command.issuedAt : shipment.shippedAt, deliveredAt: nextStatus === "delivered" ? shipment.deliveredAt ?? command.issuedAt : shipment.deliveredAt, updatedAt: command.issuedAt };
  const type: CommerceEvent["type"] = nextStatus === "delivered" ? "shipment.delivered" : nextStatus === "in_transit" ? "shipment.shipped" : "shipment.created";
  return { state, events: [createDomainEvent({ type, aggregateId: shipment.id, aggregateType: "shipment", context: command.context, occurredAt: command.issuedAt, payload: { shipment: state, from: shipment.status, to: nextStatus } })] };
}

export interface PointsCommandState { account: RuthiePointsAccount; entry: PointsLedgerEntry; }

export function handleAdjustPoints(command: AdjustPointsCommand): CommandResult<PointsCommandState, PointsAdjustedPayload> {
  const result = applyPointsEntry({ account: command.payload.account, entryId: command.payload.entryId, type: command.payload.entryType, points: command.payload.points, now: command.issuedAt, orderId: command.payload.orderId, reason: command.payload.reason, expiresAt: command.payload.expiresAt });
  return { state: result, events: [createDomainEvent({ type: "points.adjusted", aggregateId: result.entry.customerId, aggregateType: "points_account", context: command.context, occurredAt: command.issuedAt, payload: { entry: result.entry } })] };
}
