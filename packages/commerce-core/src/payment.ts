import type {
  CurrencyCode,
  InstallmentOption,
  IsoDateTime,
  Money,
  PaymentMethod,
  PaymentProvider,
  PaymentQuote,
  PaymentQuoteId,
  PaymentStatus,
  PaymentSummary,
  PaymentSummaryFallbackReason,
  PaymentSummarySource,
} from "@ruth-commerce/contracts";
const MAX_INSTALLMENT_COUNT = 12;
const MAX_RATE_BPS = 9_999;

function invariant(code: string, message: string): never {
  const error = Object.assign(new Error(message), { code });
  error.name = "CommerceInvariantError";
  throw error;
}

export interface PaymentTermsInput {
  orderAmountMinor: number;
  installmentCount?: number;
  installmentRateBps?: number;
  chargedAmountMinor?: number | null;
  installmentFeeMinor?: number | null;
  cardProgram?: string | null;
  currency?: CurrencyCode;
}

export interface PaymentQuoteInput {
  quoteId: string;
  orderAmountMinor: number;
  options: Array<{
    installmentCount: number;
    installmentRateBps: number;
    cardProgram?: string | null;
  }>;
  selectedInstallmentCount?: number;
  expiresAt?: IsoDateTime;
}

export interface NormalizePaymentSummaryInput extends PaymentTermsInput {
  source: PaymentSummarySource;
  provider?: PaymentProvider;
  method?: PaymentMethod;
  status: PaymentStatus;
  quoteId?: string | null;
  providerReference?: string | null;
  paidAt?: IsoDateTime | null;
  fallbackReason?: PaymentSummaryFallbackReason;
}

function assertMinorAmount(value: number, code: string, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    invariant(code, `${label} must be a non-negative safe integer.`);
  }
}

function normalizeCurrency(value?: CurrencyCode): CurrencyCode {
  return value ?? "TRY";
}

function normalizeInstallmentCount(value: unknown): number {
  const count = Math.trunc(Number(value ?? 0));
  if (!Number.isFinite(count) || count < 2) return 0;
  return Math.min(count, MAX_INSTALLMENT_COUNT);
}

function normalizeRateBps(value: unknown, installmentCount: number): number {
  if (installmentCount === 0) return 0;
  const rate = Math.round(Number(value ?? 0));
  if (!Number.isFinite(rate) || rate < 0) return 0;
  return Math.min(rate, MAX_RATE_BPS);
}

export function majorToMinorAmount(value: unknown): number {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

function money(amountMinor: number, currency: CurrencyCode): Money {
  return { amountMinor, currency };
}

function splitInstallments(chargedAmountMinor: number, installmentCount: number) {
  const count = installmentCount || 1;
  const regularAmountMinor = Math.floor(chargedAmountMinor / count);
  const finalAmountMinor = chargedAmountMinor - regularAmountMinor * (count - 1);
  return { regularAmountMinor, finalAmountMinor };
}

export function calculatePaymentTerms(input: PaymentTermsInput): InstallmentOption {
  const currency = normalizeCurrency(input.currency);
  const orderAmountMinor = Math.trunc(input.orderAmountMinor);
  assertMinorAmount(orderAmountMinor, "INVALID_PAYMENT_ORDER_AMOUNT", "Payment order amount");

  const installmentCount = normalizeInstallmentCount(input.installmentCount);
  const rateBps = normalizeRateBps(input.installmentRateBps, installmentCount);

  const suppliedChargedAmount = input.chargedAmountMinor == null
    ? null
    : Math.trunc(Number(input.chargedAmountMinor));
  const suppliedFee = input.installmentFeeMinor == null
    ? null
    : Math.trunc(Number(input.installmentFeeMinor));

  if (suppliedChargedAmount !== null) {
    assertMinorAmount(suppliedChargedAmount, "INVALID_PAYMENT_CHARGED_AMOUNT", "Payment charged amount");
  }
  if (suppliedFee !== null) {
    assertMinorAmount(suppliedFee, "INVALID_PAYMENT_INSTALLMENT_FEE", "Payment installment fee");
  }

  let chargedAmountMinor: number;
  if (suppliedChargedAmount !== null && suppliedChargedAmount >= orderAmountMinor) {
    chargedAmountMinor = suppliedChargedAmount;
  } else if (suppliedFee !== null) {
    chargedAmountMinor = orderAmountMinor + suppliedFee;
  } else if (installmentCount > 0 && rateBps > 0) {
    chargedAmountMinor = Math.ceil((orderAmountMinor * 10_000) / (10_000 - rateBps));
  } else {
    chargedAmountMinor = orderAmountMinor;
  }

  assertMinorAmount(chargedAmountMinor, "INVALID_PAYMENT_CHARGED_AMOUNT", "Payment charged amount");
  if (chargedAmountMinor < orderAmountMinor) {
    invariant(
      "PAYMENT_CHARGED_AMOUNT_BELOW_ORDER_AMOUNT",
      "Payment charged amount cannot be lower than the order amount.",
    );
  }

  const installmentFeeMinor = chargedAmountMinor - orderAmountMinor;
  const split = splitInstallments(chargedAmountMinor, installmentCount);

  return {
    installmentCount,
    rateBps,
    cardProgram: input.cardProgram?.trim() || undefined,
    orderAmount: money(orderAmountMinor, currency),
    installmentFee: money(installmentFeeMinor, currency),
    chargedAmount: money(chargedAmountMinor, currency),
    regularInstallmentAmount: money(split.regularAmountMinor, currency),
    finalInstallmentAmount: money(split.finalAmountMinor, currency),
  };
}

export function createPaymentQuote(input: PaymentQuoteInput): PaymentQuote {
  const quoteId = input.quoteId.trim();
  if (!quoteId) {
    invariant("MISSING_PAYMENT_QUOTE_ID", "Payment quote id is required.");
  }
  if (input.options.length === 0) {
    invariant("EMPTY_PAYMENT_QUOTE", "Payment quote must contain at least one option.");
  }

  const seenInstallmentCounts = new Set<number>();
  const options = input.options.map((option) => {
    const terms = calculatePaymentTerms({
      orderAmountMinor: input.orderAmountMinor,
      installmentCount: option.installmentCount,
      installmentRateBps: option.installmentRateBps,
      cardProgram: option.cardProgram,
    });
    if (seenInstallmentCounts.has(terms.installmentCount)) {
      invariant(
        "DUPLICATE_PAYMENT_INSTALLMENT_OPTION",
        `Payment quote contains duplicate installment count: ${terms.installmentCount}.`,
      );
    }
    seenInstallmentCounts.add(terms.installmentCount);
    return terms;
  });
  const selectedCount = normalizeInstallmentCount(input.selectedInstallmentCount);
  const selectedOption = options.find((option) => option.installmentCount === selectedCount) ?? options[0];

  return {
    id: quoteId as PaymentQuoteId,
    provider: "paytr",
    method: "card",
    currency: "TRY",
    options,
    selectedOption,
    expiresAt: input.expiresAt,
  };
}

export function normalizePaymentSummary(input: NormalizePaymentSummaryInput): PaymentSummary {
  const terms = calculatePaymentTerms(input);
  const fallbackReason = input.fallbackReason ?? (
    input.source === "legacy" ? "legacy_order" : undefined
  );

  return {
    source: input.source,
    provider: input.provider ?? (input.source === "legacy" ? "legacy" : "paytr"),
    method: input.method ?? (input.source === "legacy" ? "manual" : "card"),
    status: input.status,
    orderAmount: terms.orderAmount,
    chargedAmount: terms.chargedAmount,
    installmentFee: terms.installmentFee,
    installmentCount: terms.installmentCount,
    installmentRateBps: terms.rateBps,
    regularInstallmentAmount: terms.regularInstallmentAmount,
    finalInstallmentAmount: terms.finalInstallmentAmount,
    cardProgram: terms.cardProgram,
    quoteId: input.quoteId?.trim() ? input.quoteId.trim() as PaymentQuoteId : undefined,
    providerReference: input.providerReference?.trim() || undefined,
    paidAt: input.paidAt || undefined,
    fallbackReason,
  };
}

export const PaymentEngine = {
  majorToMinorAmount,
  calculateTerms: calculatePaymentTerms,
  createQuote: createPaymentQuote,
  normalizeSummary: normalizePaymentSummary,
} as const;
