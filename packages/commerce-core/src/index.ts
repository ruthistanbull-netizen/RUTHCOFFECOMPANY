import type { InventoryItem, Money } from "@ruth-commerce/contracts";
import { CommerceInvariantError } from "./state-transitions";

export * from "./state-transitions";

export function availableInventory(item: InventoryItem): number {
  return Math.max(0, item.onHand - item.reserved - item.allocated - item.safetyStock);
}

export function assertCanReserveInventory(item: InventoryItem, quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new CommerceInvariantError("INVALID_RESERVATION_QUANTITY", "Inventory reservation quantity must be a positive integer.");
  }
  if (availableInventory(item) < quantity) {
    throw new CommerceInvariantError("INSUFFICIENT_AVAILABLE_INVENTORY", `Only ${availableInventory(item)} unit(s) are available for SKU ${item.sku}.`);
  }
}

export function assertMoney(value: Money): void {
  if (!Number.isSafeInteger(value.amountMinor) || value.amountMinor < 0) {
    throw new CommerceInvariantError("INVALID_MONEY_AMOUNT", "Money amountMinor must be a non-negative safe integer.");
  }
  if (value.currency !== "TRY") {
    throw new CommerceInvariantError("UNSUPPORTED_CURRENCY", `Currency ${value.currency} is not supported.`);
  }
}

export function addMoney(...values: Money[]): Money {
  if (values.length === 0) return { amountMinor: 0, currency: "TRY" };
  values.forEach(assertMoney);
  const currency = values[0].currency;
  if (values.some((value) => value.currency !== currency)) {
    throw new CommerceInvariantError("CURRENCY_MISMATCH", "Money values with different currencies cannot be added.");
  }
  return { amountMinor: values.reduce((total, value) => total + value.amountMinor, 0), currency };
}

export * from "./inventory";
export * from "./points";
export * from "./commands";
export * from "./events";
export * from "./handlers";
export * from "./idempotency";
export * from "./outbox";
export * from "./jobs";
export * from "./audit";
export * from "./audit-enterprise";
export * from "./event-contracts";
export * from "./pricing";
export * from "./product-bulk";
export * from "./order";
export * from "./repositories";
export * from "./orchestrators";
export * from "./observability";
export * from "./distributed-lock";
export * from "./reconciliation";
export * from "./reconciliation-worker";
export * from "./saga-monitor";
export * from "./event-replay";
export * from "./diagnostics";
export * from "./dead-letter-manager";
export * from "./scheduler";
export * from "./enterprise-runtime";
export * from "./payment";
export * from "./paytr-official";
export * from "./paytr-payment-summary";
export * from "./paytr-callback";
export * from "./search";
export * from "./status-normalization";
export * from "./return";
export * from "./ruthie";
export * from "./theme-engine";
export * from "./http-resilience";
export * from "./internal-transport";
