import type {
  CommandContext,
  CommerceEvent,
  CorrelationId,
  CustomerId,
  IdempotencyKey,
  Money,
  OrderId,
  PaymentStatus,
} from "@ruth-commerce/contracts";
import {
  handleChangePaymentStatus,
  handleRegisterOrder,
  type OrderCreatedPayload,
  type PaymentStatusChangedPayload,
} from "@ruth-commerce/commerce-core";

function commandContext(input: {
  correlationId: string;
  idempotencyKey: string;
  actorId?: string;
}): CommandContext {
  return {
    actorId: input.actorId,
    channel: "storefront",
    correlationId: input.correlationId as CorrelationId,
    idempotencyKey: input.idempotencyKey as IdempotencyKey,
  };
}

export type RegisterOrderAdapterInput = {
  orderId: string;
  orderNumber: string;
  totalAmountMinor: number;
  itemCount: number;
  customerId?: string | null;
  correlationId: string;
  idempotencyKey: string;
  actorId?: string;
  issuedAt?: string;
};

export function executeRegisterOrderCommand(input: RegisterOrderAdapterInput): {
  events: CommerceEvent<OrderCreatedPayload>[];
} {
  const result = handleRegisterOrder({
    type: "order.register",
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    context: commandContext(input),
    payload: {
      orderId: input.orderId as OrderId,
      orderNumber: input.orderNumber,
      total: { amountMinor: input.totalAmountMinor, currency: "TRY" },
      itemCount: input.itemCount,
      customerId: input.customerId ? input.customerId as CustomerId : undefined,
    },
  });
  return { events: result.events };
}

export type PaymentCommandAdapterInput = {
  orderId: string;
  currentStatus: PaymentStatus;
  nextStatus: PaymentStatus;
  amountMinor: number;
  providerReference?: string;
  correlationId: string;
  idempotencyKey: string;
  actorId?: string;
  issuedAt?: string;
};

export type PaymentCommandAdapterResult = {
  status: PaymentStatus;
  events: CommerceEvent<PaymentStatusChangedPayload>[];
};

export function executePaymentStatusCommand(input: PaymentCommandAdapterInput): PaymentCommandAdapterResult {
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const amount: Money = { amountMinor: input.amountMinor, currency: "TRY" };
  const result = handleChangePaymentStatus({
    type: "payment.change_status",
    issuedAt,
    context: commandContext(input),
    payload: {
      orderId: input.orderId as OrderId,
      currentStatus: input.currentStatus,
      nextStatus: input.nextStatus,
      amount,
      providerReference: input.providerReference,
    },
  });
  return { status: result.state, events: result.events };
}