import {
  normalizePaytrCredentials,
  paytrHmacBase64,
  postPaytrForm,
  type PaytrCredentials,
  type PaytrJsonResponse,
} from "./paytr-official";

const PAYTR_PAYMENT_SUMMARY_ENDPOINT = "https://www.paytr.com/rapor/odeme-dokumu";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeReportDate(value: unknown, field: string) {
  const normalized = String(value ?? "").trim();
  if (!DATE_PATTERN.test(normalized)) {
    throw new Error(`PayTR ${field} must use YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${normalized}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`PayTR ${field} is not a valid calendar date.`);
  }
  return normalized;
}

export function createPaytrPaymentSummaryToken(input: PaytrCredentials & { startDate: string; endDate: string }) {
  const credentials = normalizePaytrCredentials(input);
  const startDate = normalizeReportDate(input.startDate, "payment summary start date");
  const endDate = normalizeReportDate(input.endDate, "payment summary end date");
  return paytrHmacBase64(
    `${credentials.merchantId}${startDate}${endDate}${credentials.merchantSalt}`,
    credentials.merchantKey,
  );
}

export async function queryPaytrPaymentSummary(input: PaytrCredentials & {
  startDate: string;
  endDate: string;
}): Promise<PaytrJsonResponse> {
  const credentials = normalizePaytrCredentials(input);
  const startDate = normalizeReportDate(input.startDate, "payment summary start date");
  const endDate = normalizeReportDate(input.endDate, "payment summary end date");
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);

  if (end.getTime() < start.getTime()) {
    throw new Error("PayTR payment summary date range is invalid.");
  }
  if (end.getTime() - start.getTime() > 30 * 24 * 60 * 60 * 1000) {
    throw new Error("PayTR payment summary supports a maximum 31-day inclusive range.");
  }

  return postPaytrForm(PAYTR_PAYMENT_SUMMARY_ENDPOINT, {
    merchant_id: credentials.merchantId,
    start_date: startDate,
    end_date: endDate,
    paytr_token: createPaytrPaymentSummaryToken({ ...credentials, startDate, endDate }),
  }, { timeoutMs: 90_000 });
}
