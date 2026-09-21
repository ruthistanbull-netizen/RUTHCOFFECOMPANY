import assert from "node:assert/strict";
import test from "node:test";
import {
  CommerceInvariantError,
  assertOrderTransition,
  assertShipmentTransition,
  canTransitionOrder,
  canTransitionShipment,
  commerceCoreVersion,
} from "../src/state-transitions.ts";

test("Phase 4 Commerce Core version and admin-compatible order transitions are registered", () => {
  assert.equal(commerceCoreVersion, "1.3.0");
  assert.equal(canTransitionOrder("paid", "queued"), true);
  assert.equal(canTransitionOrder("paid", "in_production"), true);
  assert.equal(canTransitionOrder("paid", "ready_to_ship"), true);
  assert.equal(canTransitionOrder("queued", "ready_to_ship"), true);
  assert.equal(canTransitionOrder("queued", "delivered"), false);
  assert.doesNotThrow(() => assertOrderTransition("quality_control", "in_production"));
});

test("Shipment transitions converge when carrier webhooks skip intermediate events", () => {
  assert.equal(canTransitionShipment("not_created", "ready_for_handover"), true);
  assert.equal(canTransitionShipment("not_created", "in_transit"), true);
  assert.equal(canTransitionShipment("label_created", "delivered"), true);
  assert.equal(canTransitionShipment("ready_for_handover", "exception"), true);
  assert.equal(canTransitionShipment("exception", "delivered"), true);
  assert.equal(canTransitionShipment("exception", "ready_for_handover"), true);
  assert.equal(canTransitionShipment("delivered", "returned"), true);
});

test("A cancelled carrier label can be recreated without reopening terminal order states", () => {
  assert.equal(canTransitionShipment("cancelled", "label_created"), true);
  assert.equal(canTransitionShipment("cancelled", "ready_for_handover"), true);
  assert.equal(canTransitionShipment("cancelled", "in_transit"), true);
  assert.equal(canTransitionShipment("cancelled", "returned"), false);
  assert.equal(canTransitionOrder("cancelled", "paid"), false);
  assert.equal(canTransitionOrder("returned", "delivered"), false);
});

test("Unsafe shipment backwards transitions remain rejected", () => {
  assert.equal(canTransitionShipment("returned", "delivered"), false);
  assert.throws(
    () => assertShipmentTransition("delivered", "in_transit"),
    (error: unknown) => error instanceof CommerceInvariantError && error.code === "INVALID_SHIPMENT_TRANSITION",
  );
});
