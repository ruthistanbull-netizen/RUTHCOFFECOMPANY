import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePaymentTerms,
  createPaymentQuote,
  majorToMinorAmount,
  normalizePaymentSummary,
} from "../src/payment.ts";

test("Payment Engine converts persisted major amounts at the domain boundary", () => {
  assert.equal(majorToMinorAmount("123.45"), 12_345);
  assert.equal(majorToMinorAmount(null), 0);
  assert.equal(majorToMinorAmount("invalid"), 0);
});

test("Payment Engine keeps a single payment free of installment charges", () => {
  const terms = calculatePaymentTerms({ orderAmountMinor: 12_345 });

  assert.equal(terms.installmentCount, 0);
  assert.equal(terms.rateBps, 0);
  assert.equal(terms.orderAmount.amountMinor, 12_345);
  assert.equal(terms.installmentFee.amountMinor, 0);
  assert.equal(terms.chargedAmount.amountMinor, 12_345);
  assert.equal(terms.regularInstallmentAmount.amountMinor, 12_345);
  assert.equal(terms.finalInstallmentAmount.amountMinor, 12_345);
});

test("Payment Engine normalizes finance charge and exact installment split", () => {
  const terms = calculatePaymentTerms({
    orderAmountMinor: 10_001,
    installmentCount: 3,
    installmentRateBps: 1_000,
    cardProgram: "bonus",
  });

  assert.equal(terms.chargedAmount.amountMinor, 11_113);
  assert.equal(terms.installmentFee.amountMinor, 1_112);
  assert.equal(terms.regularInstallmentAmount.amountMinor, 3_704);
  assert.equal(terms.finalInstallmentAmount.amountMinor, 3_705);
  assert.equal(
    terms.regularInstallmentAmount.amountMinor * 2 + terms.finalInstallmentAmount.amountMinor,
    terms.chargedAmount.amountMinor,
  );
});

test("Payment Engine treats persisted charged amount as authoritative", () => {
  const summary = normalizePaymentSummary({
    source: "commerce_v2",
    provider: "paytr",
    method: "card",
    status: "paid",
    orderAmountMinor: 20_000,
    chargedAmountMinor: 21_500,
    installmentFeeMinor: 999,
    installmentCount: 4,
    installmentRateBps: 700,
    cardProgram: "world",
    quoteId: "quote-1",
    providerReference: "merchant-1",
  });

  assert.equal(summary.chargedAmount.amountMinor, 21_500);
  assert.equal(summary.installmentFee.amountMinor, 1_500);
  assert.equal(summary.installmentCount, 4);
  assert.equal(summary.cardProgram, "world");
});

test("Payment Engine gives legacy orders a safe no-fee fallback", () => {
  const summary = normalizePaymentSummary({
    source: "legacy",
    provider: "legacy",
    method: "manual",
    status: "paid",
    orderAmountMinor: 7_500,
    fallbackReason: "missing_payment_intent",
  });

  assert.equal(summary.source, "legacy");
  assert.equal(summary.fallbackReason, "missing_payment_intent");
  assert.equal(summary.installmentCount, 0);
  assert.equal(summary.chargedAmount.amountMinor, 7_500);
  assert.equal(summary.installmentFee.amountMinor, 0);
});

test("Payment Engine creates a quote with the selected canonical option", () => {
  const quote = createPaymentQuote({
    quoteId: "quote-2",
    orderAmountMinor: 15_000,
    selectedInstallmentCount: 3,
    options: [
      { installmentCount: 0, installmentRateBps: 0 },
      { installmentCount: 3, installmentRateBps: 850, cardProgram: "maximum" },
    ],
  });

  assert.equal(quote.options.length, 2);
  assert.equal(quote.selectedOption?.installmentCount, 3);
  assert.equal(quote.selectedOption?.cardProgram, "maximum");
});

test("Payment Engine rejects duplicate canonical installment options", () => {
  assert.throws(
    () => createPaymentQuote({
      quoteId: "quote-duplicate",
      orderAmountMinor: 10_000,
      options: [
        { installmentCount: 0, installmentRateBps: 0 },
        { installmentCount: 1, installmentRateBps: 0 },
      ],
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "DUPLICATE_PAYMENT_INSTALLMENT_OPTION");
      return true;
    },
  );
});
