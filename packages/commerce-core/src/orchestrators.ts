import type {
  InventoryReservationId,
  IsoDateTime,
  OrderId,
  PaymentAttemptId,
  PaymentIntentId,
  VariantId,
} from "@ruth-commerce/contracts";
import {
  allocateInventoryReservation,
  expireInventoryReservation,
  releaseInventoryReservation,
  reserveInventory,
} from "./inventory";
import { CommerceInvariantError } from "./index";
import {
  inventoryLockKey,
  orderLockKey,
  paymentIntentLockKey,
  reservationLockKey,
  withDistributedLock,
} from "./distributed-lock";
import type { DistributedLockManager } from "./distributed-lock";
import {
  createCorrelationContext,
  createNoopObservability,
  withObservedOperation,
} from "./observability";
import type { CorrelationContext, Observability } from "./observability";
import type {
  CommerceUnitOfWork,
  DomainEventPublisher,
  InventoryRepository,
  InventoryReservationRepository,
  OrderRepository,
  PaymentRepository,
  ProcessedCallbackRepository,
} from "./repositories";

export interface CommerceOrchestratorRuntime {
  locks?: DistributedLockManager;
  observability?: Observability;
  lockTtlMs?: number;
}

async function runEnterpriseOperation<T>(input: {
  runtime: CommerceOrchestratorRuntime;
  name: string;
  lockKey?: string;
  context: CorrelationContext;
  attributes?: Record<string, string | number | boolean>;
  operation: () => Promise<T>;
}): Promise<T> {
  const observability = input.runtime.observability ?? createNoopObservability();
  const operation = input.runtime.locks && input.lockKey
    ? () => withDistributedLock({
        locks: input.runtime.locks as DistributedLockManager,
        key: input.lockKey as string,
        ownerId: `${input.name}:${crypto.randomUUID()}`,
        ttlMs: input.runtime.lockTtlMs,
        operation: input.operation,
      })
    : input.operation;

  return withObservedOperation({
    observability,
    name: input.name,
    context: input.context,
    attributes: input.attributes,
    operation,
  });
}

export interface InventoryReservationRequest {
  reservationId: InventoryReservationId;
  orderId: OrderId;
  variantId: VariantId;
  quantity: number;
  now: IsoDateTime;
  expiresAt?: IsoDateTime;
}

export class InventoryOrchestrator {
  constructor(
    private readonly uow: CommerceUnitOfWork,
    private readonly inventory: InventoryRepository,
    private readonly reservations: InventoryReservationRepository,
    private readonly events: DomainEventPublisher,
    private readonly runtime: CommerceOrchestratorRuntime = {},
  ) {}

  async reserve(input: InventoryReservationRequest): Promise<void> {
    const context = createCorrelationContext({ orderId: input.orderId });
    await runEnterpriseOperation({
      runtime: this.runtime,
      name: "inventory.reserve",
      lockKey: inventoryLockKey(input.variantId),
      context,
      attributes: {
        orderId: input.orderId,
        variantId: input.variantId,
        quantity: input.quantity,
      },
      operation: async () => {
        await this.uow.transaction(async (tx) => {
          const item = await this.inventory.findByVariantIdForUpdate(input.variantId, tx);
          if (!item) throw new CommerceInvariantError("INVENTORY_NOT_FOUND", "Inventory item was not found.");
          const result = reserveInventory({ inventory: item, ...input });
          await this.inventory.save(result.inventory, tx);
          await this.reservations.save(result.reservation, tx);
          await this.events.publish("inventory.reserved", input.orderId, {
            reservationId: input.reservationId,
            variantId: input.variantId,
            quantity: input.quantity,
            traceId: context.traceId,
            correlationId: context.correlationId,
          }, tx);
        });
      },
    });
  }

  async allocateForOrder(orderId: OrderId, now: IsoDateTime): Promise<void> {
    const context = createCorrelationContext({ orderId });
    await runEnterpriseOperation({
      runtime: this.runtime,
      name: "inventory.allocate_for_order",
      lockKey: orderLockKey(orderId),
      context,
      attributes: { orderId },
      operation: async () => {
        await this.uow.transaction(async (tx) => {
          const reservations = await this.reservations.findActiveByOrderId(orderId, tx);
          for (const reservation of reservations) {
            const item = await this.inventory.findByVariantIdForUpdate(reservation.variantId, tx);
            if (!item) throw new CommerceInvariantError("INVENTORY_NOT_FOUND", "Inventory item was not found.");
            const result = allocateInventoryReservation(item, reservation, now);
            await this.inventory.save(result.inventory, tx);
            await this.reservations.save(result.reservation, tx);
          }
          await this.events.publish("inventory.allocated", orderId, {
            reservationCount: reservations.length,
            traceId: context.traceId,
            correlationId: context.correlationId,
          }, tx);
        });
      },
    });
  }

  async releaseForOrder(orderId: OrderId, now: IsoDateTime, reason: string): Promise<void> {
    const context = createCorrelationContext({ orderId });
    await runEnterpriseOperation({
      runtime: this.runtime,
      name: "inventory.release_for_order",
      lockKey: orderLockKey(orderId),
      context,
      attributes: { orderId, reason },
      operation: async () => {
        await this.uow.transaction(async (tx) => {
          const reservations = await this.reservations.findActiveByOrderId(orderId, tx);
          for (const reservation of reservations) {
            const item = await this.inventory.findByVariantIdForUpdate(reservation.variantId, tx);
            if (!item) throw new CommerceInvariantError("INVENTORY_NOT_FOUND", "Inventory item was not found.");
            const result = releaseInventoryReservation(item, reservation, now);
            await this.inventory.save(result.inventory, tx);
            await this.reservations.save(result.reservation, tx);
          }
          await this.events.publish("inventory.released", orderId, {
            reason,
            reservationCount: reservations.length,
            traceId: context.traceId,
            correlationId: context.correlationId,
          }, tx);
        });
      },
    });
  }

  async expire(reservationId: InventoryReservationId, now: IsoDateTime): Promise<boolean> {
    const context = createCorrelationContext();
    return runEnterpriseOperation({
      runtime: this.runtime,
      name: "inventory.expire_reservation",
      lockKey: reservationLockKey(reservationId),
      context,
      attributes: { reservationId },
      operation: () => this.uow.transaction(async (tx) => {
        const reservation = await this.reservations.findById(reservationId, tx);
        if (!reservation || reservation.status !== "active") return false;
        const item = await this.inventory.findByVariantIdForUpdate(reservation.variantId, tx);
        if (!item) throw new CommerceInvariantError("INVENTORY_NOT_FOUND", "Inventory item was not found.");
        const result = expireInventoryReservation(item, reservation, now);
        await this.inventory.save(result.inventory, tx);
        await this.reservations.save(result.reservation, tx);
        await this.events.publish("inventory.released", reservation.orderId, {
          reservationId,
          reason: "expired",
          traceId: context.traceId,
          correlationId: context.correlationId,
        }, tx);
        return true;
      }),
    });
  }
}

export interface PaytrCallbackInput {
  callbackId: string;
  paymentIntentId: PaymentIntentId;
  paymentAttemptId: PaymentAttemptId;
  status: "paid" | "failed";
  providerReference?: string;
  failureCode?: string;
  failureMessage?: string;
  occurredAt: IsoDateTime;
}

export class PaymentOrchestrator {
  constructor(
    private readonly uow: CommerceUnitOfWork,
    private readonly payments: PaymentRepository,
    private readonly callbacks: ProcessedCallbackRepository,
    private readonly orders: OrderRepository,
    private readonly inventory: InventoryOrchestrator,
    private readonly events: DomainEventPublisher,
    private readonly runtime: CommerceOrchestratorRuntime = {},
  ) {}

  async handlePaytrCallback(input: PaytrCallbackInput): Promise<"processed" | "duplicate"> {
    const context = createCorrelationContext({ paymentIntentId: input.paymentIntentId });
    return runEnterpriseOperation({
      runtime: this.runtime,
      name: "payment.handle_paytr_callback",
      lockKey: paymentIntentLockKey(input.paymentIntentId),
      context,
      attributes: {
        callbackId: input.callbackId,
        paymentIntentId: input.paymentIntentId,
        paymentAttemptId: input.paymentAttemptId,
        status: input.status,
      },
      operation: async () => {
        const outcome = await this.uow.transaction(async (tx) => {
          if (await this.callbacks.exists("paytr", input.callbackId, tx)) return "duplicate" as const;
          const intent = await this.payments.findIntentById(input.paymentIntentId, tx);
          const attempt = await this.payments.findAttemptById(input.paymentAttemptId, tx);
          if (!intent || !attempt) throw new CommerceInvariantError("PAYMENT_NOT_FOUND", "Payment intent or attempt was not found.");
          if (attempt.paymentIntentId !== intent.id) throw new CommerceInvariantError("PAYMENT_LINK_MISMATCH", "Payment attempt does not belong to intent.");
          if (attempt.amount.amountMinor !== intent.amountMinor) throw new CommerceInvariantError("PAYMENT_AMOUNT_MISMATCH", "Payment amount does not match intent.");

          const order = await this.orders.findById(intent.orderId, tx);
          if (!order) throw new CommerceInvariantError("ORDER_NOT_FOUND", "Order was not found.");

          const nextAttempt = {
            ...attempt,
            status: input.status,
            providerReference: input.providerReference,
            failureCode: input.failureCode,
            failureMessage: input.failureMessage,
            updatedAt: input.occurredAt,
          };
          await this.payments.saveAttempt(nextAttempt, tx);
          await this.payments.saveIntent({ ...intent, status: input.status, updatedAt: input.occurredAt }, tx);
          await this.callbacks.markProcessed("paytr", input.callbackId, input.occurredAt, tx);

          const nextOrder = input.status === "paid"
            ? { ...order, status: "paid" as const, paymentStatus: "paid" as const, updatedAt: input.occurredAt }
            : { ...order, paymentStatus: "failed" as const, updatedAt: input.occurredAt };
          await this.orders.save(nextOrder, tx);
          await this.events.publish(input.status === "paid" ? "payment.paid" : "payment.failed", intent.orderId, {
            paymentIntentId: intent.id,
            paymentAttemptId: attempt.id,
            traceId: context.traceId,
            correlationId: context.correlationId,
          }, tx);
          return "processed" as const;
        });

        if (outcome === "processed") {
          const intent = await this.payments.findIntentById(input.paymentIntentId);
          if (!intent) throw new CommerceInvariantError("PAYMENT_NOT_FOUND", "Payment intent disappeared after callback processing.");
          if (input.status === "paid") await this.inventory.allocateForOrder(intent.orderId, input.occurredAt);
          else await this.inventory.releaseForOrder(intent.orderId, input.occurredAt, "payment_failed");
        }
        return outcome;
      },
    });
  }
}

export class ReservationExpiryWorker {
  constructor(
    private readonly reservations: InventoryReservationRepository,
    private readonly inventory: InventoryOrchestrator,
    private readonly runtime: CommerceOrchestratorRuntime = {},
  ) {}

  async run(now: IsoDateTime, limit = 100): Promise<number> {
    const context = createCorrelationContext();
    return runEnterpriseOperation({
      runtime: this.runtime,
      name: "inventory.expiry_worker",
      context,
      attributes: { limit },
      operation: async () => {
        const expired = await this.reservations.findExpired(limit, now);
        let processed = 0;
        for (const reservation of expired) {
          if (await this.inventory.expire(reservation.id, now)) processed += 1;
        }
        return processed;
      },
    });
  }
}
