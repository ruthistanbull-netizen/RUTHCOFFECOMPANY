import type {
  CommandContext,
  CustomerId,
  InventoryItem,
  InventoryReservation,
  InventoryReservationId,
  Money,
  Order,
  OrderId,
  PaymentStatus,
  PointsLedgerEntryId,
  PointsLedgerEntryType,
  Shipment,
  ShipmentStatus,
  VariantId,
} from "@ruth-commerce/contracts";
import type { RuthiePointsAccount } from "./points";

export interface CommerceCommand<TType extends string, TPayload> {
  type: TType;
  payload: TPayload;
  context: CommandContext;
  issuedAt: string;
}

export type RegisterOrderCommand = CommerceCommand<
  "order.register",
  {
    orderId: OrderId;
    orderNumber: string;
    total: Money;
    itemCount: number;
    customerId?: CustomerId;
  }
>;

export type ChangeOrderStatusCommand = CommerceCommand<
  "order.change_status",
  {
    order: Order;
    nextStatus: Order["status"];
  }
>;

export type ChangePaymentStatusCommand = CommerceCommand<
  "payment.change_status",
  {
    orderId: OrderId;
    currentStatus: PaymentStatus;
    nextStatus: PaymentStatus;
    amount: Money;
    providerReference?: string;
  }
>;

export type ReserveInventoryCommand = CommerceCommand<
  "inventory.reserve",
  {
    inventory: InventoryItem;
    reservationId: InventoryReservationId;
    orderId: OrderId;
    variantId: VariantId;
    quantity: number;
    expiresAt?: string;
  }
>;

export type ReleaseInventoryCommand = CommerceCommand<
  "inventory.release",
  {
    inventory: InventoryItem;
    reservation: InventoryReservation;
    reason?: string;
  }
>;

export type AllocateInventoryCommand = CommerceCommand<
  "inventory.allocate",
  {
    inventory: InventoryItem;
    reservation: InventoryReservation;
  }
>;

export type ExpireInventoryCommand = CommerceCommand<
  "inventory.expire",
  {
    inventory: InventoryItem;
    reservation: InventoryReservation;
  }
>;

export type ChangeShipmentStatusCommand = CommerceCommand<
  "shipment.change_status",
  {
    shipment: Shipment;
    nextStatus: ShipmentStatus;
  }
>;

export type AdjustPointsCommand = CommerceCommand<
  "points.adjust",
  {
    account: RuthiePointsAccount;
    entryId: PointsLedgerEntryId;
    entryType: PointsLedgerEntryType;
    points: number;
    orderId?: OrderId;
    reason?: string;
    expiresAt?: string;
  }
>;

export type CommerceCommandUnion =
  | RegisterOrderCommand
  | ChangeOrderStatusCommand
  | ChangePaymentStatusCommand
  | ReserveInventoryCommand
  | ReleaseInventoryCommand
  | AllocateInventoryCommand
  | ExpireInventoryCommand
  | ChangeShipmentStatusCommand
  | AdjustPointsCommand;
