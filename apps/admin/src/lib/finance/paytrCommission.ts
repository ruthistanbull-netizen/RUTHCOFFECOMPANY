/** Merchant-configured flat PayTR fee: 4.10% (410 basis points).
 * Customer-financed installment surcharge is NOT merchant revenue.
 * The base is the order's original price after confirmed refunds.
 * Always work in integer kuruş to avoid floating-point commission drift.
 */
export const PAYTR_COMMISSION_BPS = 410;
export const PAYTR_COMMISSION_PERCENT = 4.10;

export function paytrCommission(amountAfterRefunds: unknown): number {
  const value = Number(amountAfterRefunds);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const amountKurus = Math.round(value * 100);
  return Math.round(amountKurus * PAYTR_COMMISSION_BPS / 10_000) / 100;
}

export function isNonPaytrOrder(
  order: { imported_source?: string | null },
  hasProviderPayment = false,
): boolean {
  const source = String(order.imported_source || "").toLowerCase();
  return !hasProviderPayment &&
    ["manual", "wholesale", "b2b", "bulk", "consulting"].includes(source);
}
