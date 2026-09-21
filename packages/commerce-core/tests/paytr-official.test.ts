import assert from "node:assert/strict";
import test from "node:test";
import {
  createPaytrBinToken,
  createPaytrCallbackToken,
  createPaytrDirectToken,
  createPaytrInstallmentToken,
  createPaytrRefundToken,
  createPaytrStatusToken,
  createPaytrTransactionReportToken,
  normalizePaytrAmount,
  redactPaytrPayload,
  verifyPaytrCallbackToken,
} from "../src/paytr-official.ts";

const credentials = {
  merchantId: "123456",
  merchantKey: "merchant-key",
  merchantSalt: "merchant-salt",
};

test("PayTR Direct API token follows the official field order", () => {
  const token = createPaytrDirectToken({
    ...credentials,
    userIp: "203.0.113.10",
    merchantOid: "ORDER123",
    email: "test@example.com",
    paymentAmount: "100.99",
    paymentType: "card",
    installmentCount: 0,
    currency: "TL",
    testMode: 1,
    non3d: 0,
  });
  assert.equal(token, "dmS69odDPvW7tinRZm4yNv3EpZHY1+ukHiq19fYR4yw=");
});

test("PayTR callback token and timing-safe verification use the official formula", () => {
  const token = createPaytrCallbackToken({
    ...credentials,
    merchantOid: "ORDER123",
    status: "success",
    totalAmount: "10099",
  });
  assert.equal(token, "rrRaqIog7luLYZjKSWXGiVlSTFg46K57vrROONyAV68=");
  assert.equal(verifyPaytrCallbackToken({
    ...credentials,
    merchantOid: "ORDER123",
    status: "success",
    totalAmount: "10099",
    hash: token,
  }), true);
});

test("PayTR auxiliary services use the official token formulas", () => {
  assert.equal(createPaytrBinToken({ ...credentials, binNumber: "43550843" }), "8oilQ5Ad+xzQqmGKl7yZsXlze29t8UrpTAqSY6lahGA=");
  assert.equal(createPaytrInstallmentToken({ ...credentials, requestId: "REQ123" }), "4t2xT6UkbF+fRwUf98syZ6nxX9O5P2l70nv8+Q6kO2Y=");
  assert.equal(createPaytrStatusToken({ ...credentials, merchantOid: "ORDER123" }), "7f6BT3FpxdyhuxCT7ASaSRMiPOJJ52oN5mitr3tKyxU=");
  assert.equal(createPaytrRefundToken({ ...credentials, merchantOid: "ORDER123", returnAmount: "11.97" }), "BUzftfa1QzXhBmQIwIBVjzOmjOBojKwoPLWbGAU4jOM=");
  assert.equal(createPaytrTransactionReportToken({
    ...credentials,
    startDate: "2026-07-20 00:00:00",
    endDate: "2026-07-20 23:59:59",
  }), "aEpU3tO6r6GLKOSn1Vfg13NNw2uCO0BmsQfkIwinauE=");
});

test("PayTR amounts are normalized and card fields are never persisted in clear text", () => {
  assert.equal(normalizePaytrAmount("11,9"), "11.90");
  assert.deepEqual(redactPaytrPayload({
    merchant_oid: "ORDER123",
    card_number: "4355084355084358",
    cvv: "000",
    expiry_month: "12",
    expiry_year: "29",
    cc_owner: "PAYTR TEST",
  }), {
    merchant_oid: "ORDER123",
    card_number: "[REDACTED]",
    cvv: "[REDACTED]",
    expiry_month: "[REDACTED]",
    expiry_year: "[REDACTED]",
    cc_owner: "[REDACTED]",
  });
});
