import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCanCreateReturnCase,
  assertCanCreateReverseShipment,
  assertReturnCaseTransition,
  canonicalReturnStatus,
  reverseShipmentIdempotencyKey,
  selectPrimaryOrderTracking,
} from "../src/return.ts";

test("maps persisted return statuses to canonical statuses", () => {
  assert.equal(canonicalReturnStatus("return", "open"), "requested");
  assert.equal(canonicalReturnStatus("return", "completed"), "refunded");
  assert.equal(canonicalReturnStatus("exchange", "completed"), "exchanged");
});

test("rejects a second active return or exchange case", () => {
  assert.throws(() => assertCanCreateReturnCase({
    paymentStatus: "paid",
    orderStatus: "delivered",
    type: "exchange",
    existingCases: [{ id: "case-1", type: "return", status: "approved" }],
  }), /aktif bir iade veya değişim/i);
});

test("requires the original barcode for reverse shipping", () => {
  assert.throws(() => assertCanCreateReverseShipment({
    returnCase: { id: "case-1", type: "return", status: "approved" },
    outboundBarcode: "",
  }), /ilk gönderi barkodu/i);
});

test("builds a stable reverse shipment idempotency key", () => {
  assert.equal(reverseShipmentIdempotencyKey("case-1", "OUT-123"), "reverse-shipment:case-1:OUT-123");
});

test("return tracking replaces outbound tracking while a case is active", () => {
  assert.deepEqual(selectPrimaryOrderTracking({
    outboundTrackingNo: "OUT-123",
    outboundStatus: "delivered",
    activeReturnCase: {
      id: "case-1",
      type: "exchange",
      status: "approved",
      reverseShipmentBarcode: "RET-456",
      reverseShipmentStatus: "RETURNING",
    },
  }), {
    direction: "return",
    label: "İade Kargo Takip",
    code: "RET-456",
    status: "RETURNING",
    returnCaseId: "case-1",
  });
});

test("an active case without a barcode exposes the return-code action", () => {
  const tracking = selectPrimaryOrderTracking({
    outboundTrackingNo: "OUT-123",
    activeReturnCase: { id: "case-1", type: "return", status: "open" },
  });
  assert.equal(tracking.direction, "return");
  assert.equal(tracking.label, "İade Kargo Kodu");
  assert.equal(tracking.code, null);
});

test("keeps reverse tracking visible after the case is completed", () => {
  const tracking = selectPrimaryOrderTracking({
    outboundTrackingNo: "OUT-123",
    activeReturnCase: {
      id: "case-1",
      type: "return",
      status: "completed",
      reverseShipmentTrackingNo: "RET-999",
      reverseShipmentStatus: "DELIVERED",
    },
  });
  assert.equal(tracking.direction, "return");
  assert.equal(tracking.label, "İade Kargo Takip");
  assert.equal(tracking.code, "RET-999");
});

test("enforces return case state transitions", () => {
  assert.doesNotThrow(() => assertReturnCaseTransition("open", "approved"));
  assert.doesNotThrow(() => assertReturnCaseTransition("approved", "completed"));
  assert.throws(() => assertReturnCaseTransition("completed", "approved"), /durumuna geçilemez/i);
});

test("rejects a fully refunded order", () => {
  assert.throws(() => assertCanCreateReturnCase({
    paymentStatus: "refunded",
    orderStatus: "delivered",
    type: "return",
  }), /ödemesi alınmış sipariş/i);
});
