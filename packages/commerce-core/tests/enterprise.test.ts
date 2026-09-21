import assert from "node:assert/strict";
import test from "node:test";
import { reconcileCommerceState } from "../src/reconciliation.ts";
import { buildSagaSnapshot, orderFulfillmentSaga } from "../src/saga-monitor.ts";
import { CommerceScheduler } from "../src/scheduler.ts";
import { DeadLetterManager } from "../src/dead-letter-manager.ts";

test("reconciliation repairs a paid payment with an unpaid order", () => {
  const report = reconcileCommerceState({
    orderId: "order-1",
    orderStatus: "awaiting_payment",
    paymentStatus: "paid",
    shipmentStatus: "not_created",
    capturedAt: "2026-07-20T00:00:00.000Z",
    reservations: [],
    inventory: [],
  });

  assert.equal(report.status, "repairable");
  assert.equal(report.issues[0]?.code, "PAYMENT_PAID_ORDER_UNPAID");
  assert.equal(report.issues[0]?.action.type, "mark_order_paid");
});

test("reconciliation detects inventory counter drift", () => {
  const report = reconcileCommerceState({
    orderId: "order-2",
    orderStatus: "awaiting_payment",
    paymentStatus: "pending",
    capturedAt: "2026-07-20T00:00:00.000Z",
    reservations: [{
      id: "reservation-1",
      orderId: "order-2",
      variantId: "variant-1",
      quantity: 2,
      status: "active",
    }],
    inventory: [{
      variantId: "variant-1",
      onHand: 10,
      reserved: 1,
      allocated: 0,
      safetyStock: 0,
    }],
  });

  assert.ok(report.issues.some((issue) => issue.code === "RESERVED_COUNTER_DRIFT"));
});

test("saga monitor marks an overdue payment step as timed out", () => {
  const snapshot = buildSagaSnapshot({
    sagaId: "saga-1",
    aggregateId: "order-1",
    definition: orderFulfillmentSaga,
    now: "2026-07-20T01:00:00.000Z",
    events: [
      {
        id: "event-1",
        sagaId: "saga-1",
        aggregateId: "order-1",
        type: "order.created",
        occurredAt: "2026-07-20T00:00:00.000Z",
      },
      {
        id: "event-2",
        sagaId: "saga-1",
        aggregateId: "order-1",
        type: "inventory.reserved",
        occurredAt: "2026-07-20T00:01:00.000Z",
      },
    ],
  });

  assert.equal(snapshot.status, "timed_out");
  assert.equal(snapshot.steps.find((step) => step.name === "payment")?.state, "timed_out");
});

test("scheduler executes due jobs and persists completion", async () => {
  const states = new Map();
  let executions = 0;
  const scheduler = new CommerceScheduler([
    {
      name: "reconciliation",
      intervalMs: 60_000,
      timeoutMs: 1_000,
      async run() {
        executions += 1;
      },
    },
  ], {
    async get(name) {
      return states.get(name) ?? null;
    },
    async save(state) {
      states.set(state.name, state);
    },
  });

  const result = await scheduler.runDue("2026-07-20T00:00:00.000Z");
  assert.equal(executions, 1);
  assert.equal(result[0]?.status, "completed");
  assert.equal(states.get("reconciliation")?.running, false);
});

test("dead-letter retry resolves a successfully dispatched record", async () => {
  const records = new Map();
  records.set("dead-1", {
    id: "dead-1",
    source: "outbox",
    sourceId: "outbox-1",
    payload: {},
    status: "open",
    attempts: 0,
    error: "temporary failure",
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  });

  const manager = new DeadLetterManager({
    repository: {
      async findById(id) {
        return records.get(id) ?? null;
      },
      async listOpen() {
        return [...records.values()].filter((record) => record.status === "open");
      },
      async save(record) {
        records.set(record.id, record);
      },
    },
    dispatcher: {
      async dispatch() {},
    },
    audit: {
      async record() {},
    },
  });

  const resolved = await manager.retry({
    id: "dead-1",
    actorId: "system",
    reason: "Automated retry",
  });

  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.attempts, 1);
});
