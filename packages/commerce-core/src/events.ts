import type {
  CommerceEvent,
  CommandContext,
  CustomerId,
  InventoryReservation,
  Money,
  OrderId,
  OrderStatus,
  PaymentStatus,
  PointsLedgerEntry,
  Shipment,
  ShipmentStatus,
} from "@ruth-commerce/contracts";

export interface DomainEventFactoryInput<TPayload> {
  type: CommerceEvent["type"];
  aggregateId: string;
  aggregateType: string;
  payload: TPayload;
  context: CommandContext;
  occurredAt?: string;
  causationId?: string;
}

export function createDomainEvent<TPayload>(
  input: DomainEventFactoryInput<TPayload>,
): CommerceEvent<TPayload> {
  return {
    eventId: crypto.randomUUID(),
    type: input.type,
    version: 1,
    aggregateId: input.aggregateId,
    aggregateType: input.aggregateType,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    channel: input.context.channel,
    correlationId: input.context.correlationId,
    causationId: input.causationId,
    actorId: input.context.actorId,
    payload: input.payload,
  };
}

export interface OrderCreatedPayload {
  orderId: OrderId;
  orderNumber: string;
  total: Money;
  itemCount: number;
  customerId?: CustomerId;
}

export interface OrderStatusChangedPayload {
  orderId: OrderId;
  from: OrderStatus;
  to: OrderStatus;
}

export interface PaymentStatusChangedPayload {
  orderId: OrderId;
  from: PaymentStatus;
  to: PaymentStatus;
  amount: Money;
  providerReference?: string;
}

export interface InventoryReservedPayload {
  reservation: InventoryReservation;
}

export interface InventoryReservationChangedPayload {
  reservation: InventoryReservation;
  previousStatus: InventoryReservation["status"];
  reason?: string;
}

export interface ShipmentStatusChangedPayload {
  shipment: Shipment;
  from: ShipmentStatus;
  to: ShipmentStatus;
}

export interface PointsAdjustedPayload {
  entry: PointsLedgerEntry;
}
