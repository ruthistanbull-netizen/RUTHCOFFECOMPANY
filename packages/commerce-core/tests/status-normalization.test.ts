import assert from "node:assert/strict";
import test from "node:test";
import {
  isHistoricalImportedOrder,
  normalizeOrderDisplayStatus,
  normalizePaymentDisplayStatus,
} from "../src/status-normalization.ts";

test("historical ikas orders stay out of live operation queues", () => {
  const order = { status: "in_production", imported_source: "ikas_excel" };
  assert.equal(isHistoricalImportedOrder(order), true);
  assert.equal(normalizeOrderDisplayStatus(order.status, order), "completed");
});

test("test orders stay out of live operation queues", () => {
  const order = { status: "ready_to_ship", imported_source: "test" };
  assert.equal(isHistoricalImportedOrder(order), true);
  assert.equal(normalizeOrderDisplayStatus(order.status, order), "completed");
});

test("order provider aliases normalize to one display vocabulary", () => {
  assert.equal(normalizeOrderDisplayStatus("quality_control"), "preparing");
  assert.equal(normalizeOrderDisplayStatus("ready_to_ship"), "ready");
  assert.equal(normalizeOrderDisplayStatus("kargoya-verildi"), "shipped");
  assert.equal(normalizeOrderDisplayStatus("teslim_edildi"), "completed");
  assert.equal(normalizeOrderDisplayStatus("iptal"), "cancelled");
  assert.equal(normalizeOrderDisplayStatus("awaiting_payment"), "created");
});

test("Commerce Core shipment status is authoritative for display", () => {
  assert.equal(
    normalizeOrderDisplayStatus("shipped", { status: "shipped", shipping_status: "delivered" }),
    "completed",
  );
  assert.equal(
    normalizeOrderDisplayStatus("preparing", { status: "preparing", shipping_status: "in_transit" }),
    "shipped",
  );
  assert.equal(
    normalizeOrderDisplayStatus("preparing", { status: "preparing", shipping_status: "ready_for_handover" }),
    "ready",
  );
});

test("payment provider aliases normalize to one display vocabulary", () => {
  assert.equal(normalizePaymentDisplayStatus("payment_success"), "paid");
  assert.equal(normalizePaymentDisplayStatus("succeeded"), "paid");
  assert.equal(normalizePaymentDisplayStatus("declined"), "failed");
  assert.equal(normalizePaymentDisplayStatus("iade edildi"), "refunded");
  assert.equal(normalizePaymentDisplayStatus("pending"), "waiting");
});
