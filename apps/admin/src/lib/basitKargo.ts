import { assertPhase4OrderShippingEnabled } from "@/lib/phase4Flags";

const DEFAULT_BASE_URL = "https://basitkargo.com/api";
const DEFAULT_TIMEOUT_MS = 15_000;

export type BasitKargoPackage = {
  height: number;
  width: number;
  depth: number;
  weight: number;
};

export type BasitKargoHandler = {
  name: string;
  code: string;
  logo?: string | null;
};

export type BasitKargoQuote = {
  desiKg?: number | null;
  handlerCode: string;
  price: number;
  codFee?: number | null;
};

export type NormalizedBasitShipment = {
  id: string | null;
  barcode: string | null;
  status: string | null;
  handlerCode: string | null;
  handlerName: string | null;
  trackingNo: string | null;
  price: number | null;
  raw: unknown;
};

export class BasitKargoApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "BasitKargoApiError";
    this.status = status;
    this.details = details;
  }
}

function apiToken() {
  assertPhase4OrderShippingEnabled();
  const token = process.env.BASIT_KARGO_API_TOKEN?.trim();
  if (!token) throw new BasitKargoApiError("BASIT_KARGO_API_TOKEN Render ortam değişkeni bulunamadı.", 500);
  return token;
}

function apiBaseUrl() {
  return (process.env.BASIT_KARGO_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function requestTimeoutMs() {
  const configured = Number(process.env.BASIT_KARGO_API_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.max(3_000, Math.min(60_000, Math.trunc(configured)));
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(attempt: number) {
  return Math.min(2_000, 250 * (2 ** attempt));
}

function isTransientStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function transportError(error: unknown, timeoutMs: number) {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new BasitKargoApiError(`Basit Kargo isteği ${timeoutMs} ms içinde tamamlanmadı.`, 504, { cause: name || "timeout" });
  }
  return new BasitKargoApiError(
    error instanceof Error ? `Basit Kargo bağlantı hatası: ${error.message}` : "Basit Kargo bağlantı hatası.",
    503,
    { cause: name || "network_error" },
  );
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!text) return null;
  if (contentType.includes("json")) {
    try { return JSON.parse(text); } catch { return text; }
  }
  try { return JSON.parse(text); } catch { return text; }
}

function apiMessage(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "title"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return fallback;
}

export async function basitKargoRequest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${apiToken()}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!headers.has("X-Request-Id")) headers.set("X-Request-Id", `ruth-${crypto.randomUUID()}`);
  headers.set("X-Ruth-Retry-Owner", "basit-kargo-client");

  const method = String(init.method || "GET").toUpperCase();
  const safeToRetry = ["GET", "HEAD"].includes(method) && !init.signal;
  const maxAttempts = safeToRetry ? 3 : 1;
  const timeoutMs = requestTimeoutMs();
  const url = `${apiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers,
        signal: init.signal || AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      const payload = await parseResponse(response);
      if (response.ok) return payload as T;

      const apiError = new BasitKargoApiError(
        apiMessage(payload, `Basit Kargo isteği başarısız (${response.status}).`),
        response.status,
        payload,
      );
      if (safeToRetry && attempt + 1 < maxAttempts && isTransientStatus(response.status)) {
        await sleep(retryDelay(attempt));
        continue;
      }
      throw apiError;
    } catch (error) {
      if (error instanceof BasitKargoApiError) throw error;
      if (safeToRetry && attempt + 1 < maxAttempts) {
        await sleep(retryDelay(attempt));
        continue;
      }
      throw transportError(error, timeoutMs);
    }
  }

  throw new BasitKargoApiError("Basit Kargo isteği tamamlanamadı.", 503);
}

export async function basitKargoLabelSvg(id: string) {
  const timeoutMs = requestTimeoutMs();
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/label/svg/${encodeURIComponent(id)}`, {
      headers: {
        Authorization: `Bearer ${apiToken()}`,
        Accept: "image/svg+xml, text/plain, */*",
        "X-Request-Id": `ruth-label-${crypto.randomUUID()}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    throw transportError(error, timeoutMs);
  }

  const body = await response.text();
  if (!response.ok) {
    let details: unknown = body;
    try { details = JSON.parse(body); } catch {}
    throw new BasitKargoApiError(apiMessage(details, `Etiket alınamadı (${response.status}).`), response.status, details);
  }
  return body;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function rootRecord(value: unknown) {
  const source = record(value);
  return record(source.data || source.result || source.order || source.shipment || source);
}

function readPath(source: unknown, path: string) {
  return path.split(".").reduce<any>((current, part) => current && typeof current === "object" ? current[part] : undefined, source as any);
}

function firstText(source: unknown, paths: string[]) {
  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstNumber(source: unknown, paths: string[]) {
  for (const path of paths) {
    const value = Number(readPath(source, path));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function normalizeProviderShipmentStatus(status: string | null) {
  const value = String(status || "").trim().toLocaleUpperCase("tr-TR");
  const normalized = value
    .replace(/İ/g, "I")
    .replace(/Ş/g, "S")
    .replace(/Ğ/g, "G")
    .replace(/Ü/g, "U")
    .replace(/Ö/g, "O")
    .replace(/Ç/g, "C")
    .replace(/ı/g, "I")
    .replace(/ş/g, "S")
    .replace(/ğ/g, "G")
    .replace(/ü/g, "U")
    .replace(/ö/g, "O")
    .replace(/ç/g, "C");

  if (["DELETED", "CANCELLED", "CANCELED", "IPTAL EDILDI", "IPTAL"].includes(normalized)) return "CANCELLED";
  if (["DELIVERED", "COMPLETED", "FULFILLED", "TESLIM EDILDI", "TESLIM", "TESLIMAT TAMAMLANDI", "DELIVERY_COMPLETED", "DELIVERED_COMPLETED"].includes(normalized)) return "DELIVERED";
  if (["OUT_FOR_DELIVERY", "DAGITIMA CIKTI", "DAGITIMDA", "DAGITIM"].includes(normalized)) return "OUT_FOR_DELIVERY";
  if (["SHIPPED", "IN_TRANSIT", "YOLDA", "KARGODA", "KARGODAN CIKTI"].includes(normalized)) return "SHIPPED";
  if (["READY_TO_SHIP", "READY", "GONDERIME HAZIR", "TESLIME HAZIR", "KARGODA TESLIME HAZIR"].includes(normalized)) return "READY_TO_SHIP";
  if (["NEW", "CREATED", "YENI"].includes(normalized)) return "NEW";
  if (["RETURNING", "GERI DONUYOR"].includes(normalized)) return "RETURNING";
  if (["RETURNED", "GERI DONDU"].includes(normalized)) return "RETURNED";
  if (["NEEDS_SUPPORT", "DESTEK GEREKIYOR", "DELIVERY_FAILED", "TESLIMAT BASARISIZ", "FAILED", "KARGO HATASI", "EXCEPTION"].includes(normalized)) return "NEEDS_SUPPORT";
  if (normalized === "DELAYED" || normalized === "GECIKMELI") return "DELAYED";
  return status;
}

export function normalizeBasitKargoQuotes(payload: unknown): BasitKargoQuote[] {
  const source = record(payload);
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(source.data)
      ? source.data
      : Array.isArray(source.result)
        ? source.result
        : Array.isArray(source.quotes)
          ? source.quotes
          : Array.isArray(source.fees)
            ? source.fees
            : [];

  return rows.reduce<BasitKargoQuote[]>((normalized, item: any) => {
    const handlerCode = firstText(item, ["handlerCode", "handler.code", "cargoCompanyCode", "code"]);
    const price = firstNumber(item, ["price", "shipmentFee", "totalCost", "fee", "amount", "priceInfo.totalCost", "priceInfo.shipmentFee"]);
    if (!handlerCode || price == null) return normalized;
    normalized.push({
      handlerCode,
      price,
      desiKg: firstNumber(item, ["desiKg", "desi", "totalDesiKg"]),
      codFee: firstNumber(item, ["codFee", "collectFee"]),
    });
    return normalized;
  }, []);
}

export function normalizeBasitShipment(payload: unknown): NormalizedBasitShipment {
  const source = rootRecord(payload);
  const traceRows = Array.isArray(source.traces) ? source.traces : [];
  const latestTraceStatus = traceRows.length
    ? firstText(traceRows[0], ["status", "state", "state.label", "description"])
    : null;
  const handlerCode = firstText(source, ["handler.code", "shipmentInfo.handler.code", "handlerCode", "cargoCompanyCode"]);
  const handlerName = firstText(source, ["handler.name", "shipmentInfo.handler.name", "handlerName", "cargoCompany"]);

  const topLevelStatus = firstText(source, ["status", "shipmentStatus", "state.code", "lastStatus"]);
  const nestedLastState = firstText(source, ["shipmentInfo.lastState", "shipmentInfo.lastStatus", "lastState"]);
  const deliveredTime = firstText(source, ["shipmentInfo.deliveredTime", "deliveredTime", "deliveredAt", "deliveryTime"]);
  const nestedNormalized = normalizeProviderShipmentStatus(nestedLastState);
  const topNormalized = normalizeProviderShipmentStatus(topLevelStatus);
  const rawStatus = deliveredTime || nestedNormalized === "DELIVERED"
    ? "DELIVERED"
    : topNormalized || nestedLastState || latestTraceStatus;

  return {
    id: firstText(source, ["id", "orderId", "shipmentId"]),
    barcode: firstText(source, ["barcode", "shipmentBarcode", "cargoBarcode"]),
    status: normalizeProviderShipmentStatus(rawStatus),
    handlerCode,
    handlerName,
    trackingNo: firstText(source, ["handlerShipmentCode", "shipmentInfo.handlerShipmentCode", "trackingNumber", "trackingNo", "cargoTrackingNumber"]),
    price: firstNumber(source, ["priceInfo.totalCost", "priceInfo.shipmentFee", "totalCost", "shipmentFee", "price"]),
    raw: payload,
  };
}

export function basitStatusLabel(status: unknown) {
  const value = String(status || "").trim().toUpperCase();
  const labels: Record<string, string> = {
    NOT_CREATED: "Henüz Oluşturulmadı",
    NEW: "Yeni",
    CREATED: "Etiket Oluşturuldu",
    LABEL_CREATED: "Etiket Oluşturuldu",
    READY: "Teslime Hazır",
    READY_TO_SHIP: "Gönderime Hazır",
    READY_FOR_HANDOVER: "Kargoya Teslime Hazır",
    SHIPPED: "Yolda",
    IN_TRANSIT: "Yolda",
    OUT_FOR_DELIVERY: "Dağıtıma Çıktı",
    DELIVERED: "Teslim Edildi",
    COMPLETED: "Teslim Edildi",
    FULFILLED: "Teslim Edildi",
    NEEDS_SUPPORT: "Destek Gerekiyor",
    DELIVERY_FAILED: "Teslimat Başarısız",
    FAILED: "Kargo Hatası",
    EXCEPTION: "İstisna / Müdahale Gerekli",
    DELAYED: "Gecikmeli",
    RETURNING: "Geri Dönüyor",
    RETURNED: "Geri Döndü",
    LOST: "Kayıp",
    CANCELLED: "İptal Edildi",
    CANCELED: "İptal Edildi",
    DELETED: "İptal Edildi",
  };
  return labels[value] || value || "Henüz oluşturulmadı";
}
