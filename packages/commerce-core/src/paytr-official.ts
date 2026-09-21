import crypto from "node:crypto";

export const PAYTR_ENDPOINTS = {
  directPayment: "https://www.paytr.com/odeme",
  binDetail: "https://www.paytr.com/odeme/api/bin-detail",
  installmentRates: "https://www.paytr.com/odeme/taksit-oranlari",
  statusInquiry: "https://www.paytr.com/odeme/durum-sorgu",
  refund: "https://www.paytr.com/odeme/iade",
  transactionReport: "https://www.paytr.com/rapor/islem-dokumu",
} as const;

export type PaytrCredentials = {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
};

export type PaytrJsonResponse = Record<string, unknown> & {
  status?: string;
  err_no?: string | number;
  err_msg?: string;
};

const CARD_FIELD_NAMES = new Set([
  "cc_owner",
  "card_number",
  "expiry_month",
  "expiry_year",
  "cvv",
]);

function cleanCredential(value: string, name: string): string {
  const cleaned = value.trim().replace(/^(\"|')(.*)\1$/, "$2").trim();
  if (!cleaned) throw new Error(`${name} is required.`);
  return cleaned;
}

export function normalizePaytrCredentials(input: PaytrCredentials): PaytrCredentials {
  return {
    merchantId: cleanCredential(input.merchantId, "PAYTR_MERCHANT_ID"),
    merchantKey: cleanCredential(input.merchantKey, "PAYTR_MERCHANT_KEY"),
    merchantSalt: cleanCredential(input.merchantSalt, "PAYTR_MERCHANT_SALT"),
  };
}

export function paytrHmacBase64(data: string, merchantKey: string): string {
  return crypto.createHmac("sha256", merchantKey).update(data, "utf8").digest("base64");
}

export function paytrSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function normalizeMerchantOid(value: unknown): string {
  const merchantOid = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(merchantOid)) {
    throw new Error("PayTR merchant_oid must be 1-64 alphanumeric characters.");
  }
  return merchantOid;
}

export function normalizePaytrAmount(value: unknown): string {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("PayTR amount must use a dot and at most two decimal places.");
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("PayTR amount must be greater than zero.");
  return amount.toFixed(2);
}

export function createPaytrDirectToken(input: PaytrCredentials & {
  userIp: string;
  merchantOid: string;
  email: string;
  paymentAmount: string;
  paymentType: "card" | "card_points";
  installmentCount: number;
  currency: "TL" | "TRY" | "EUR" | "USD" | "GBP" | "RUB";
  testMode: 0 | 1;
  non3d: 0 | 1;
}): string {
  const credentials = normalizePaytrCredentials(input);
  const merchantOid = normalizeMerchantOid(input.merchantOid);
  const paymentAmount = normalizePaytrAmount(input.paymentAmount);
  const hashString = `${credentials.merchantId}${input.userIp}${merchantOid}${input.email}${paymentAmount}${input.paymentType}${input.installmentCount}${input.currency}${input.testMode}${input.non3d}`;
  return paytrHmacBase64(`${hashString}${credentials.merchantSalt}`, credentials.merchantKey);
}

export function createPaytrCallbackToken(input: PaytrCredentials & {
  merchantOid: string;
  status: "success" | "failed";
  totalAmount: string;
}): string {
  const credentials = normalizePaytrCredentials(input);
  const merchantOid = normalizeMerchantOid(input.merchantOid);
  return paytrHmacBase64(
    `${merchantOid}${credentials.merchantSalt}${input.status}${input.totalAmount}`,
    credentials.merchantKey,
  );
}

export function verifyPaytrCallbackToken(input: PaytrCredentials & {
  merchantOid: string;
  status: "success" | "failed";
  totalAmount: string;
  hash: string;
}): boolean {
  const expected = createPaytrCallbackToken(input);
  return paytrSafeEqual(expected, input.hash);
}

export function createPaytrBinToken(input: PaytrCredentials & { binNumber: string }): string {
  const credentials = normalizePaytrCredentials(input);
  const binNumber = String(input.binNumber).replace(/\D/g, "").slice(0, 8);
  if (!/^\d{6,8}$/.test(binNumber)) throw new Error("PayTR BIN number must contain 6 or 8 digits.");
  return paytrHmacBase64(`${binNumber}${credentials.merchantId}${credentials.merchantSalt}`, credentials.merchantKey);
}

export function createPaytrInstallmentToken(input: PaytrCredentials & { requestId: string }): string {
  const credentials = normalizePaytrCredentials(input);
  const requestId = String(input.requestId).trim().slice(0, 64);
  if (!requestId) throw new Error("PayTR request_id is required.");
  return paytrHmacBase64(`${credentials.merchantId}${requestId}${credentials.merchantSalt}`, credentials.merchantKey);
}

export function createPaytrStatusToken(input: PaytrCredentials & { merchantOid: string }): string {
  const credentials = normalizePaytrCredentials(input);
  const merchantOid = normalizeMerchantOid(input.merchantOid);
  return paytrHmacBase64(`${credentials.merchantId}${merchantOid}${credentials.merchantSalt}`, credentials.merchantKey);
}

export function createPaytrRefundToken(input: PaytrCredentials & { merchantOid: string; returnAmount: string }): string {
  const credentials = normalizePaytrCredentials(input);
  const merchantOid = normalizeMerchantOid(input.merchantOid);
  const returnAmount = normalizePaytrAmount(input.returnAmount);
  return paytrHmacBase64(
    `${credentials.merchantId}${merchantOid}${returnAmount}${credentials.merchantSalt}`,
    credentials.merchantKey,
  );
}

export function createPaytrTransactionReportToken(input: PaytrCredentials & { startDate: string; endDate: string }): string {
  const credentials = normalizePaytrCredentials(input);
  const startDate = String(input.startDate).trim();
  const endDate = String(input.endDate).trim();
  const pattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  if (!pattern.test(startDate) || !pattern.test(endDate)) {
    throw new Error("PayTR report dates must use YYYY-MM-DD HH:mm:ss format.");
  }
  return paytrHmacBase64(
    `${credentials.merchantId}${startDate}${endDate}${credentials.merchantSalt}`,
    credentials.merchantKey,
  );
}

export function redactPaytrPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, CARD_FIELD_NAMES.has(key) ? "[REDACTED]" : value]),
  );
}

export async function postPaytrForm(
  url: string,
  fields: Record<string, string>,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<PaytrJsonResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
      cache: "no-store",
      signal: controller.signal,
    });
    const raw = await response.text();
    let parsed: PaytrJsonResponse;
    try {
      parsed = JSON.parse(raw) as PaytrJsonResponse;
    } catch {
      throw new Error(`PayTR returned an invalid response (${response.status}).`);
    }
    if (!response.ok) throw new Error(String(parsed.err_msg || `PayTR request failed (${response.status}).`));
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

export async function queryPaytrStatus(input: PaytrCredentials & { merchantOid: string }): Promise<PaytrJsonResponse> {
  const credentials = normalizePaytrCredentials(input);
  const merchantOid = normalizeMerchantOid(input.merchantOid);
  return postPaytrForm(PAYTR_ENDPOINTS.statusInquiry, {
    merchant_id: credentials.merchantId,
    merchant_oid: merchantOid,
    paytr_token: createPaytrStatusToken({ ...credentials, merchantOid }),
  });
}

export async function requestPaytrRefund(input: PaytrCredentials & {
  merchantOid: string;
  returnAmount: string;
  referenceNo?: string;
}): Promise<PaytrJsonResponse> {
  const credentials = normalizePaytrCredentials(input);
  const merchantOid = normalizeMerchantOid(input.merchantOid);
  const returnAmount = normalizePaytrAmount(input.returnAmount);
  const referenceNo = input.referenceNo?.trim();
  if (referenceNo && !/^[A-Za-z0-9_-]{1,64}$/.test(referenceNo)) {
    throw new Error("PayTR reference_no must be at most 64 alphanumeric characters.");
  }
  return postPaytrForm(PAYTR_ENDPOINTS.refund, {
    merchant_id: credentials.merchantId,
    merchant_oid: merchantOid,
    return_amount: returnAmount,
    ...(referenceNo ? { reference_no: referenceNo } : {}),
    paytr_token: createPaytrRefundToken({ ...credentials, merchantOid, returnAmount }),
  }, { timeoutMs: 90_000 });
}

export async function queryPaytrTransactions(input: PaytrCredentials & {
  startDate: string;
  endDate: string;
  dummy?: 0 | 1;
}): Promise<PaytrJsonResponse> {
  const credentials = normalizePaytrCredentials(input);
  const start = new Date(input.startDate.replace(" ", "T") + "Z");
  const end = new Date(input.endDate.replace(" ", "T") + "Z");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() < start.getTime()) {
    throw new Error("PayTR report date range is invalid.");
  }
  if (end.getTime() - start.getTime() > 3 * 24 * 60 * 60 * 1000) {
    throw new Error("PayTR transaction reports support a maximum three-day range.");
  }
  return postPaytrForm(PAYTR_ENDPOINTS.transactionReport, {
    merchant_id: credentials.merchantId,
    start_date: input.startDate,
    end_date: input.endDate,
    dummy: String(input.dummy ?? 0),
    paytr_token: createPaytrTransactionReportToken({ ...credentials, startDate: input.startDate, endDate: input.endDate }),
  }, { timeoutMs: 90_000 });
}
