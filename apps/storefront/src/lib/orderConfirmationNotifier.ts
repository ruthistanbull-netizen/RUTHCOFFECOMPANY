import crypto from "node:crypto";

const CANONICAL_ADMIN_INTERNAL_URL = "https://rostapanel.zeabur.app";

function isRetiredAdminUrl(value: string) {
  try {
    return new URL(value).hostname.endsWith(".onrender.com");
  } catch {
    return true;
  }
}

function adminInternalUrls() {
  const configured = (
    process.env.ADMIN_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_PANEL_URL ||
    ""
  ).trim().replace(/\/$/, "");
  const safeConfigured = configured && !isRetiredAdminUrl(configured)
    ? configured
    : null;

  return [...new Set([
    safeConfigured,
    CANONICAL_ADMIN_INTERNAL_URL,
  ].filter((value): value is string => Boolean(value)))];
}

function serviceSecret() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) throw new Error("SUPABASE_SERVICE_ROLE_KEY env eksik.");
  return value;
}

async function sendAttempt(orderId: string) {
  const body = JSON.stringify({ order_id: orderId });
  let lastError: Error | null = null;

  for (const baseUrl of adminInternalUrls()) {
    const timestamp = String(Date.now());
    const signature = crypto
      .createHmac("sha256", serviceSecret())
      .update(`${timestamp}.${body}`)
      .digest("hex");

    try {
      const response = await fetch(`${baseUrl}/api/internal/order-confirmation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rosta-timestamp": timestamp,
          "x-rosta-signature": signature,
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      const result = await response.json().catch(() => ({})) as Record<string, unknown>;

      if (response.ok && result.ok) return result;

      lastError = new Error(
        typeof result.error === "string" && result.error.trim()
          ? result.error
          : `Sipariş onay maili servisi ${response.status} döndürdü (${baseUrl}).`,
      );
    } catch (error) {
      lastError = error instanceof Error
        ? error
        : new Error(`Sipariş onay maili servisine ulaşılamadı (${baseUrl}).`);
    }
  }

  throw lastError || new Error("Sipariş onay maili servisine ulaşılamadı.");
}

export async function notifyOrderConfirmationEmail(orderId: string) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await sendAttempt(orderId);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Sipariş onay maili gönderilemedi.");
}
