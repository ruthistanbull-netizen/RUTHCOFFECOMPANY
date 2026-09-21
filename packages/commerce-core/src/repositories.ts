import type {
  InventoryItem,
  InventoryReservation,
  InventoryReservationId,
  Order,
  OrderId,
  PaymentAttempt,
  PaymentAttemptId,
  PaymentIntentId,
  VariantId,
} from "@ruth-commerce/contracts";

export interface TransactionContext {
  readonly transactionId: string;
}

export interface CommerceUnitOfWork {
  transaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

export interface OrderRepository {
  findById(id: OrderId, tx?: TransactionContext): Promise<Order | null>;
  save(order: Order, tx?: TransactionContext): Promise<void>;
}

export interface InventoryRepository {
  findByVariantIdForUpdate(variantId: VariantId, tx: TransactionContext): Promise<InventoryItem | null>;
  save(item: InventoryItem, tx: TransactionContext): Promise<void>;
}

export interface InventoryReservationRepository {
  findById(id: InventoryReservationId, tx?: TransactionContext): Promise<InventoryReservation | null>;
  findActiveByOrderId(orderId: OrderId, tx?: TransactionContext): Promise<InventoryReservation[]>;
  findExpired(limit: number, now: string): Promise<InventoryReservation[]>;
  save(reservation: InventoryReservation, tx: TransactionContext): Promise<void>;
}

export interface PaymentIntentRecord {
  id: PaymentIntentId;
  orderId: OrderId;
  status: "pending" | "processing" | "paid" | "failed" | "cancelled" | "partially_refunded" | "refunded";
  amountMinor: number;
  currency: "TRY";
  provider: "paytr";
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRepository {
  findIntentById(id: PaymentIntentId, tx?: TransactionContext): Promise<PaymentIntentRecord | null>;
  findAttemptById(id: PaymentAttemptId, tx?: TransactionContext): Promise<PaymentAttempt | null>;
  saveIntent(intent: PaymentIntentRecord, tx: TransactionContext): Promise<void>;
  saveAttempt(attempt: PaymentAttempt, tx: TransactionContext): Promise<void>;
}

export interface ProcessedCallbackRepository {
  exists(provider: "paytr", callbackId: string, tx: TransactionContext): Promise<boolean>;
  markProcessed(provider: "paytr", callbackId: string, occurredAt: string, tx: TransactionContext): Promise<void>;
}

export interface DomainEventPublisher {
  publish(type: string, aggregateId: string, payload: Record<string, unknown>, tx: TransactionContext): Promise<void>;
}
