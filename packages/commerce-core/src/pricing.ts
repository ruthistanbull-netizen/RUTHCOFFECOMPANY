import type { Money, MoneyBreakdown } from "@ruth-commerce/contracts";
import { CommerceInvariantError, addMoney, assertMoney } from "./index";

export interface PricingLineInput {
  quantity: number;
  unitPrice: Money;
  discount?: Money;
}

export interface PricingInput {
  lines: readonly PricingLineInput[];
  shipping?: Money;
  tax?: Money;
  orderDiscount?: Money;
  pointsDiscount?: Money;
  calculationId: string;
}

function zeroMoney(): Money {
  return { amountMinor: 0, currency: "TRY" };
}

function multiplyMoney(value: Money, quantity: number): Money {
  assertMoney(value);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new CommerceInvariantError("INVALID_LINE_QUANTITY", "Pricing quantity must be a positive integer.");
  }
  const amountMinor = value.amountMinor * quantity;
  if (!Number.isSafeInteger(amountMinor)) {
    throw new CommerceInvariantError("MONEY_OVERFLOW", "Calculated money amount exceeds the safe integer range.");
  }
  return { amountMinor, currency: value.currency };
}

function clampDiscount(discount: Money, maximum: Money): Money {
  assertMoney(discount);
  assertMoney(maximum);
  return { amountMinor: Math.min(discount.amountMinor, maximum.amountMinor), currency: maximum.currency };
}

export function calculatePricing(input: PricingInput): MoneyBreakdown {
  if (!input.calculationId.trim()) {
    throw new CommerceInvariantError("MISSING_CALCULATION_ID", "Pricing calculationId is required.");
  }
  if (input.lines.length === 0) {
    throw new CommerceInvariantError("EMPTY_PRICING_LINES", "At least one pricing line is required.");
  }

  const lineSubtotals = input.lines.map((line) => multiplyMoney(line.unitPrice, line.quantity));
  const subtotal = addMoney(...lineSubtotals);
  const lineDiscount = addMoney(...input.lines.map((line, index) => clampDiscount(line.discount ?? zeroMoney(), lineSubtotals[index])));
  const orderDiscount = clampDiscount(input.orderDiscount ?? zeroMoney(), {
    amountMinor: subtotal.amountMinor - lineDiscount.amountMinor,
    currency: subtotal.currency,
  });
  const discount = addMoney(lineDiscount, orderDiscount);
  const pointsDiscount = clampDiscount(input.pointsDiscount ?? zeroMoney(), {
    amountMinor: subtotal.amountMinor - discount.amountMinor,
    currency: subtotal.currency,
  });
  const shipping = input.shipping ?? zeroMoney();
  const tax = input.tax ?? zeroMoney();
  assertMoney(shipping);
  assertMoney(tax);

  const totalAmount = subtotal.amountMinor - discount.amountMinor - pointsDiscount.amountMinor + shipping.amountMinor + tax.amountMinor;
  if (!Number.isSafeInteger(totalAmount) || totalAmount < 0) {
    throw new CommerceInvariantError("INVALID_ORDER_TOTAL", "Calculated order total is invalid.");
  }

  return {
    subtotal,
    discount,
    pointsDiscount,
    shipping,
    tax,
    total: { amountMinor: totalAmount, currency: subtotal.currency },
    calculationId: input.calculationId,
  };
}
