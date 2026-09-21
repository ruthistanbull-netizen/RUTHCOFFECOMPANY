export type ReconciliationSeverity = "info" | "warning" | "critical";
export type ReconciliationResolution = "automatic" | "manual";

export interface ReconciliationInventoryItem {
  variantId: string;
  onHand: number;
  reserved: number;
  allocated: number;
  safetyStock: number;
}

export interface ReconciliationReservation {
  id: string;
  orderId: string;
  variantId: string;
  quantity: number;
  status: "active" | "allocated" | "released" | "expired";
}

export interface ReconciliationSnapshot {
  orderId: string;
  orderStatus: string;
  paymentStatus?: string;
  shipmentStatus?: string;
  reservations: ReconciliationReservation[];
  inventory: ReconciliationInventoryItem[];
  capturedAt: string;
}

export type ReconciliationActionType =
  | "mark_order_paid"
  | "allocate_reservations"
  | "release_reservations"
  | "recalculate_reserved_inventory"
  | "mark_order_shipped"
  | "manual_review";

export interface ReconciliationAction {
  type: ReconciliationActionType;
  orderId: string;
  variantId?: string;
  reservationIds?: string[];
  reason: string;
}

export interface ReconciliationIssue {
  code: string;
  message: string;
  severity: ReconciliationSeverity;
  resolution: ReconciliationResolution;
  action: ReconciliationAction;
  metadata: Record<string, unknown>;
}

export interface ReconciliationReport {
  id: string;
  orderId: string;
  status: "consistent" | "repairable" | "manual_review";
  issues: ReconciliationIssue[];
  generatedAt: string;
}

const paidOrderStatuses = new Set([
  "paid",
  "queued",
  "in_production",
  "quality_control",
  "ready_to_ship",
  "shipped",
  "delivered",
  "return_requested",
  "returned",
]);

const shippedOrderStatuses = new Set([
  "shipped",
  "delivered",
  "return_requested",
  "returned",
]);

const paidPaymentStatuses = new Set(["paid", "partially_refunded", "refunded"]);
const shippedShipmentStatuses = new Set(["in_transit", "delivered", "returned"]);

function issue(input: Omit<ReconciliationIssue, "metadata"> & {
  metadata?: Record<string, unknown>;
}): ReconciliationIssue {
  return { ...input, metadata: input.metadata ?? {} };
}

function expectedReservedByVariant(
  reservations: readonly ReconciliationReservation[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const reservation of reservations) {
    if (reservation.status !== "active") continue;
    totals.set(
      reservation.variantId,
      (totals.get(reservation.variantId) ?? 0) + reservation.quantity,
    );
  }
  return totals;
}

export function reconcileCommerceState(
  snapshot: ReconciliationSnapshot,
): ReconciliationReport {
  const issues: ReconciliationIssue[] = [];
  const paymentIsPaid = snapshot.paymentStatus
    ? paidPaymentStatuses.has(snapshot.paymentStatus)
    : false;
  const orderIsPaid = paidOrderStatuses.has(snapshot.orderStatus);
  const orderIsShipped = shippedOrderStatuses.has(snapshot.orderStatus);
  const shipmentIsShipped = snapshot.shipmentStatus
    ? shippedShipmentStatuses.has(snapshot.shipmentStatus)
    : false;

  if (paymentIsPaid && !orderIsPaid) {
    issues.push(issue({
      code: "PAYMENT_PAID_ORDER_UNPAID",
      message: "Payment is paid but the order has not entered a paid state.",
      severity: "critical",
      resolution: "automatic",
      action: {
        type: "mark_order_paid",
        orderId: snapshot.orderId,
        reason: "Verified payment requires a paid order state.",
      },
      metadata: {
        orderStatus: snapshot.orderStatus,
        paymentStatus: snapshot.paymentStatus,
      },
    }));
  }

  if (orderIsPaid && !paymentIsPaid && snapshot.orderStatus !== "returned") {
    issues.push(issue({
      code: "ORDER_PAID_PAYMENT_UNPAID",
      message: "Order is in a paid lifecycle state but no paid payment exists.",
      severity: "critical",
      resolution: "manual",
      action: {
        type: "manual_review",
        orderId: snapshot.orderId,
        reason: "The payment provider must be checked before changing financial state.",
      },
      metadata: {
        orderStatus: snapshot.orderStatus,
        paymentStatus: snapshot.paymentStatus,
      },
    }));
  }

  const activeReservations = snapshot.reservations.filter(
    (reservation) => reservation.status === "active",
  );
  const allocatedReservations = snapshot.reservations.filter(
    (reservation) => reservation.status === "allocated",
  );

  if (paymentIsPaid && activeReservations.length > 0) {
    issues.push(issue({
      code: "PAID_ORDER_HAS_ACTIVE_RESERVATIONS",
      message: "Paid order still has active reservations waiting for allocation.",
      severity: "warning",
      resolution: "automatic",
      action: {
        type: "allocate_reservations",
        orderId: snapshot.orderId,
        reservationIds: activeReservations.map((reservation) => reservation.id),
        reason: "Successful payment must convert active reservations into allocation.",
      },
    }));
  }

  if (!paymentIsPaid && allocatedReservations.length > 0 && snapshot.orderStatus === "cancelled") {
    issues.push(issue({
      code: "CANCELLED_ORDER_HAS_ALLOCATED_INVENTORY",
      message: "Cancelled unpaid order still owns allocated inventory.",
      severity: "critical",
      resolution: "automatic",
      action: {
        type: "release_reservations",
        orderId: snapshot.orderId,
        reservationIds: allocatedReservations.map((reservation) => reservation.id),
        reason: "Cancelled unpaid orders must not retain stock allocation.",
      },
    }));
  }

  if (shipmentIsShipped && !orderIsShipped) {
    issues.push(issue({
      code: "SHIPMENT_MOVED_ORDER_NOT_SHIPPED",
      message: "Shipment is moving or delivered while the order is not marked shipped.",
      severity: "warning",
      resolution: "automatic",
      action: {
        type: "mark_order_shipped",
        orderId: snapshot.orderId,
        reason: "Shipment carrier state proves that fulfillment has left the warehouse.",
      },
      metadata: {
        orderStatus: snapshot.orderStatus,
        shipmentStatus: snapshot.shipmentStatus,
      },
    }));
  }

  if (orderIsShipped && !shipmentIsShipped) {
    issues.push(issue({
      code: "ORDER_SHIPPED_SHIPMENT_NOT_MOVING",
      message: "Order is marked shipped but shipment state does not confirm handover.",
      severity: "critical",
      resolution: "manual",
      action: {
        type: "manual_review",
        orderId: snapshot.orderId,
        reason: "Carrier and warehouse records must be checked before changing state.",
      },
      metadata: {
        orderStatus: snapshot.orderStatus,
        shipmentStatus: snapshot.shipmentStatus,
      },
    }));
  }

  const expectedReserved = expectedReservedByVariant(snapshot.reservations);
  for (const inventory of snapshot.inventory) {
    if (
      inventory.onHand < 0 ||
      inventory.reserved < 0 ||
      inventory.allocated < 0 ||
      inventory.safetyStock < 0
    ) {
      issues.push(issue({
        code: "NEGATIVE_INVENTORY_COUNTER",
        message: "Inventory counters must never be negative.",
        severity: "critical",
        resolution: "manual",
        action: {
          type: "manual_review",
          orderId: snapshot.orderId,
          variantId: inventory.variantId,
          reason: "Negative inventory requires an audit of all stock movements.",
        },
        metadata: { ...inventory },
      }));
      continue;
    }

    const expected = expectedReserved.get(inventory.variantId) ?? 0;
    if (inventory.reserved !== expected) {
      issues.push(issue({
        code: "RESERVED_COUNTER_DRIFT",
        message: "Inventory reserved counter differs from active reservations.",
        severity: "warning",
        resolution: "automatic",
        action: {
          type: "recalculate_reserved_inventory",
          orderId: snapshot.orderId,
          variantId: inventory.variantId,
          reason: "Reserved inventory should equal the sum of active reservations.",
        },
        metadata: {
          recordedReserved: inventory.reserved,
          expectedReserved: expected,
        },
      }));
    }

    if (inventory.reserved + inventory.allocated > inventory.onHand) {
      issues.push(issue({
        code: "INVENTORY_OVERCOMMITTED",
        message: "Reserved and allocated stock exceeds physical on-hand stock.",
        severity: "critical",
        resolution: "manual",
        action: {
          type: "manual_review",
          orderId: snapshot.orderId,
          variantId: inventory.variantId,
          reason: "Overcommitted stock can represent overselling or a missing stock movement.",
        },
        metadata: { ...inventory },
      }));
    }
  }

  const hasManualIssue = issues.some((item) => item.resolution === "manual");
  return {
    id: crypto.randomUUID(),
    orderId: snapshot.orderId,
    status: issues.length === 0
      ? "consistent"
      : hasManualIssue
        ? "manual_review"
        : "repairable",
    issues,
    generatedAt: new Date().toISOString(),
  };
}

export interface ReconciliationExecutor {
  execute(action: ReconciliationAction): Promise<void>;
}

export async function applyAutomaticReconciliation(
  report: ReconciliationReport,
  executor: ReconciliationExecutor,
): Promise<ReconciliationAction[]> {
  const applied: ReconciliationAction[] = [];
  for (const item of report.issues) {
    if (item.resolution !== "automatic") continue;
    await executor.execute(item.action);
    applied.push(item.action);
  }
  return applied;
}
