import { verifyPaytrCallbackToken } from "./paytr-official";

export type PaytrIntegrationType = "direct_api" | "iframe_v2";

export type PaytrCallbackVerification =
  | {
      ok: true;
      status: "success" | "failed";
      integrationType: PaytrIntegrationType;
      orderAmountKurus: number;
      chargedAmountKurus: number;
    }
  | {
      ok: false;
      reason: "missing_fields" | "bad_hash" | "missing_quote" | "quote_mismatch";
    };

function positiveInteger(value: unknown): number | null {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const normalized = String(value ?? "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function integrationType(value: unknown): PaytrIntegrationType | null {
  return value === "direct_api" || value === "iframe_v2" ? value : null;
}

export function verifyPaytrCallbackPayload(
  payload: Record<string, string>,
  meta: Record<string, unknown>,
  merchantKey: string,
  merchantSalt: string,
): PaytrCallbackVerification {
  const merchantOid = String(payload.merchant_oid || "").trim();
  const status = payload.status;
  const totalAmount = String(payload.total_amount || "").trim();
  const hash = String(payload.hash || "").trim();

  if (!merchantOid || (status !== "success" && status !== "failed") || !totalAmount || !hash) {
    return { ok: false, reason: "missing_fields" };
  }

  const tokenValid = verifyPaytrCallbackToken({
    merchantId: String(meta.merchant_id || "callback-not-required"),
    merchantKey,
    merchantSalt,
    merchantOid,
    status,
    totalAmount,
    hash,
  });
  if (!tokenValid) return { ok: false, reason: "bad_hash" };

  const mode = integrationType(meta.integration_type);
  const expectedOrderAmount = positiveInteger(meta.payment_amount_kurus);
  if (!mode || meta.server_pricing !== true || !expectedOrderAmount) {
    return { ok: false, reason: "missing_quote" };
  }

  const callbackOrderAmount = positiveInteger(payload.payment_amount);
  const callbackChargedAmount = nonNegativeInteger(payload.total_amount);
  if (callbackChargedAmount === null) return { ok: false, reason: "quote_mismatch" };

  if (callbackOrderAmount !== null && callbackOrderAmount !== expectedOrderAmount) {
    return { ok: false, reason: "quote_mismatch" };
  }

  // PayTR başarısız bildirimlerde ödeme gerçekleşmediği için total_amount=0
  // gönderebilir; payment_amount, currency ve test_mode alanları da gelmeyebilir.
  // Hash yine merchant_oid + salt + status + total_amount üzerinden doğrulanır.
  if (status === "failed") {
    return {
      ok: true,
      status,
      integrationType: mode,
      orderAmountKurus: expectedOrderAmount,
      chargedAmountKurus: callbackChargedAmount,
    };
  }

  if (callbackOrderAmount !== expectedOrderAmount || callbackChargedAmount <= 0) {
    return { ok: false, reason: "quote_mismatch" };
  }

  if (payload.payment_type !== "card") {
    return { ok: false, reason: "quote_mismatch" };
  }
  if (payload.currency !== String(meta.currency || "TL")) {
    return { ok: false, reason: "quote_mismatch" };
  }

  const callbackTestMode = String(payload.test_mode ?? "").trim();
  if (callbackTestMode && callbackTestMode !== String(meta.test_mode || "0")) {
    return { ok: false, reason: "quote_mismatch" };
  }

  // PayTR'nin bildirim yükünde installment_count ve test_mode her işlemde
  // bulunmayabilir. Alan geldiyse doğrula, gelmediyse hash ve zorunlu alanlarla ilerle.
  const rawInstallmentCount = String(payload.installment_count ?? "").trim();
  const installmentCount = rawInstallmentCount ? nonNegativeInteger(rawInstallmentCount) : null;
  if (rawInstallmentCount && (installmentCount === null || installmentCount > 12)) {
    return { ok: false, reason: "quote_mismatch" };
  }

  if (mode === "direct_api") {
    if (callbackChargedAmount < expectedOrderAmount) {
      return { ok: false, reason: "quote_mismatch" };
    }
    if (
      rawInstallmentCount &&
      rawInstallmentCount !== String(meta.installment_count ?? "0")
    ) {
      return { ok: false, reason: "quote_mismatch" };
    }
  } else if (callbackChargedAmount < expectedOrderAmount) {
    return { ok: false, reason: "quote_mismatch" };
  }

  return {
    ok: true,
    status,
    integrationType: mode,
    orderAmountKurus: expectedOrderAmount,
    chargedAmountKurus: callbackChargedAmount,
  };
}
