import assert from "node:assert/strict";
import test from "node:test";
import {
  createPaytrPaymentSummaryToken,
  queryPaytrPaymentSummary,
} from "../src/paytr-payment-summary.ts";

const credentials = {
  merchantId: "123456",
  merchantKey: "merchant-key",
  merchantSalt: "merchant-salt",
};

test("PayTR payment summary token follows the official field order", () => {
  const token = createPaytrPaymentSummaryToken({
    ...credentials,
    startDate: "2026-09-01",
    endDate: "2026-10-01",
  });

  assert.equal(token, "4ivV1t9zTHZTwHryLgcqe8NdTgzBL+JjDH7VlN4FAmY=");
});

test("PayTR payment summary accepts at most 31 inclusive calendar days", async () => {
  await assert.rejects(
    queryPaytrPaymentSummary({
      ...credentials,
      startDate: "2026-09-01",
      endDate: "2026-10-02",
    }),
    /maximum 31-day inclusive range/,
  );
});

test("PayTR payment summary rejects reversed date ranges before provider access", async () => {
  await assert.rejects(
    queryPaytrPaymentSummary({
      ...credentials,
      startDate: "2026-09-02",
      endDate: "2026-09-01",
    }),
    /date range is invalid/,
  );
});
