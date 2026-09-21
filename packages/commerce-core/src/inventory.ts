import type {
  InventoryItem,
  InventoryReservation,
  InventoryReservationId,
  IsoDateTime,
  OrderId,
  VariantId,
} from "@ruth-commerce/contracts";
import { CommerceInvariantError, assertCanReserveInventory } from "./index";

export interface ReserveInventoryInput {
  inventory: InventoryItem;
  reservationId: InventoryReservationId;
  orderId: OrderId;
  variantId: VariantId;
  quantity: number;
  now: IsoDateTime;
  expiresAt?: IsoDateTime;
}

export interface InventoryReservationResult {
  inventory: InventoryItem;
  reservation: InventoryReservation;
}

function assertMatchingVariant(
  inventory: InventoryItem,
  reservation: InventoryReservation,
): void {
  if (inventory.variantId !== reservation.variantId) {
    throw new CommerceInvariantError(
      "INVENTORY_VARIANT_MISMATCH",
      "Inventory item and reservation variant must match.",
    );
  }
}

function assertActiveReservation(reservation: InventoryReservation): void {
  if (reservation.status !== "active") {
    throw new CommerceInvariantError(
      "RESERVATION_NOT_ACTIVE",
      "Only active inventory reservations can be changed.",
    );
  }
}

function assertReservedInventoryCanBeReduced(
  inventory: InventoryItem,
  reservation: InventoryReservation,
): void {
  if (inventory.reserved < reservation.quantity) {
    throw new CommerceInvariantError(
      "RESERVED_INVENTORY_UNDERFLOW",
      "Reservation transition would make reserved inventory negative.",
    );
  }
}

export function reserveInventory(input: ReserveInventoryInput): InventoryReservationResult {
  if (input.inventory.variantId !== input.variantId) {
    throw new CommerceInvariantError(
      "INVENTORY_VARIANT_MISMATCH",
      "Inventory item and reservation variant must match.",
    );
  }

  if (input.expiresAt && Date.parse(input.expiresAt) <= Date.parse(input.now)) {
    throw new CommerceInvariantError(
      "INVALID_RESERVATION_EXPIRY",
      "Inventory reservation expiry must be later than its creation time.",
    );
  }

  assertCanReserveInventory(input.inventory, input.quantity);

  return {
    inventory: {
      ...input.inventory,
      reserved: input.inventory.reserved + input.quantity,
      updatedAt: input.now,
    },
    reservation: {
      id: input.reservationId,
      orderId: input.orderId,
      variantId: input.variantId,
      quantity: input.quantity,
      status: "active",
      expiresAt: input.expiresAt,
      createdAt: input.now,
      updatedAt: input.now,
    },
  };
}

export function releaseInventoryReservation(
  inventory: InventoryItem,
  reservation: InventoryReservation,
  now: IsoDateTime,
): InventoryReservationResult {
  assertActiveReservation(reservation);
  assertMatchingVariant(inventory, reservation);
  assertReservedInventoryCanBeReduced(inventory, reservation);

  return {
    inventory: {
      ...inventory,
      reserved: inventory.reserved - reservation.quantity,
      updatedAt: now,
    },
    reservation: {
      ...reservation,
      status: "released",
      updatedAt: now,
    },
  };
}

export function expireInventoryReservation(
  inventory: InventoryItem,
  reservation: InventoryReservation,
  now: IsoDateTime,
): InventoryReservationResult {
  assertActiveReservation(reservation);
  assertMatchingVariant(inventory, reservation);
  assertReservedInventoryCanBeReduced(inventory, reservation);

  if (!reservation.expiresAt || Date.parse(reservation.expiresAt) > Date.parse(now)) {
    throw new CommerceInvariantError(
      "RESERVATION_NOT_EXPIRED",
      "Inventory reservation cannot expire before its expiry time.",
    );
  }

  return {
    inventory: {
      ...inventory,
      reserved: inventory.reserved - reservation.quantity,
      updatedAt: now,
    },
    reservation: {
      ...reservation,
      status: "expired",
      updatedAt: now,
    },
  };
}

export function allocateInventoryReservation(
  inventory: InventoryItem,
  reservation: InventoryReservation,
  now: IsoDateTime,
): InventoryReservationResult {
  assertActiveReservation(reservation);
  assertMatchingVariant(inventory, reservation);
  assertReservedInventoryCanBeReduced(inventory, reservation);

  if (reservation.expiresAt && Date.parse(reservation.expiresAt) <= Date.parse(now)) {
    throw new CommerceInvariantError(
      "RESERVATION_EXPIRED",
      "Expired inventory reservations cannot be allocated.",
    );
  }

  return {
    inventory: {
      ...inventory,
      reserved: inventory.reserved - reservation.quantity,
      allocated: inventory.allocated + reservation.quantity,
      updatedAt: now,
    },
    reservation: {
      ...reservation,
      status: "allocated",
      updatedAt: now,
    },
  };
}
