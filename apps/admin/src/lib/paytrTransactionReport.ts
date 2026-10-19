import { createHmac } from "node:crypto";

// Official PayTR Sale & Refund Transaction Detail API, NOT the payout summary.
// The report carries real per-order kesinti_tutari / net_tutar / siparis_no.
// No fixed percentage estimates and no card/account identifiers are returned.
export type PaytrTransaction = {
  orderReference: string;
  kind: "sale" | "refund";
  currency: string;
  gross: number;
  fee: number;
  net: number;
};
export type PaytrTransactionReport = {
  complete: boolean;
  rows: PaytrTransaction[];
  warning: string | null;
  checkedAt: string;
};
type Credentials = { merchantId: string; merchantKey: string; merchantSalt: string };
const cache = new Map<string, { expiry: number; report: PaytrTransactionReport }>();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function money(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const original = String(value).trim();
  if (!original) return null;
  const normalized = original.includes(",")
    ? original.replace(/\./g, "").replace(",", ".") : original;
  const amount = Number(normalized);
  return Number.isFinite(amount) && Math.abs(amount) < 1e12 ? amount : null;
}
function currency(value: unknown) {
  const name = String(value || "TL").trim().toUpperCase();
  if (name === "TL" || name === "TRL" || name === "TRY") return "TRY";
  return ["USD", "EUR", "GBP", "RUB"].includes(name) ? name : "UNKNOWN";
}
function transactionObjects(value: unknown, level = 0): Record<string, unknown>[] {
  if (level > 6) return [];
  if (Array.isArray(value)) return value.flatMap((item) => transactionObjects(item, level + 1));
  const record = asRecord(value);
  if (!record) return [];
  const order = record.siparis_no;
  if (typeof order === "string" && order.trim()
    && ["S", "I"].includes(String(record.islem_tipi || "").toUpperCase())) return [record];
  // PayTR can wrap rows in named arrays or keyed objects. Descend through
  // unknown report envelopes too; only objects with transaction fields pass.
  return Object.values(record).flatMap((child) => transactionObjects(child, level + 1));
}
function dayInIstanbul(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return fields.year + "-" + fields.month + "-" + fields.day;
}
function addDays(day: string, days: number) {
  const date = new Date(day + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function dayDiff(first: string, last: string) {
  return Math.round((Date.parse(last + "T12:00:00Z") - Date.parse(first + "T12:00:00Z")) / 86400000);
}
async function requestWindow(credentials: Credentials, first: string, last: string) {
  const startDate = first + " 00:00:00";
  const endDate = last + " 23:59:59";
  const token = createHmac("sha256", credentials.merchantKey)
    .update(credentials.merchantId + startDate + endDate + credentials.merchantSalt)
    .digest("base64");
  const body = new URLSearchParams({
    merchant_id: credentials.merchantId, start_date: startDate,
    end_date: endDate, paytr_token: token,
  });
  const response = await fetch("https://www.paytr.com/rapor/islem-dokumu", {
    method: "POST", body, cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!response.ok) throw new Error("PayTR işlem dökümü HTTP " + response.status);
  const payload: unknown = await response.json();
  const root = asRecord(payload);
  if (!root) throw new Error("PayTR işlem dökümü JSON nesnesi dönmedi.");
  const status = String(root.status || "").toLowerCase();
  if (status === "failed") return [];
  if (status !== "success") throw new Error("PayTR işlem dökümü hata döndürdü.");
  const source = transactionObjects(root);
  if (!source.length) throw new Error("PayTR işlem dökümü başarılı ancak satırlar çözümlenemedi.");
  return source.map((row): PaytrTransaction => {
    const gross = money(row.islem_tutari);
    const fee = money(row.kesinti_tutari);
    const net = money(row.net_tutar);
    const kind = String(row.islem_tipi).toUpperCase() === "I" ? "refund" : "sale";
    const orderReference = String(row.siparis_no).trim();
    if (gross === null || fee === null || net === null)
      throw new Error("PayTR işlem tutarı/kesintisi okunamadı.");
    return {
      orderReference, kind, currency: currency(row.para_birimi),
      gross: Math.abs(gross), fee: Math.abs(fee), net: Math.abs(net),
    };
  });
}
export async function loadPaytrTransactions(
  input: Credentials & { from: Date | null; to: Date | null },
): Promise<PaytrTransactionReport> {
  const checkedAt = new Date().toISOString();
  const unavailable = (warning: string): PaytrTransactionReport =>
    ({ complete: false, rows: [], warning, checkedAt });
  if (!input.merchantId || !input.merchantKey || !input.merchantSalt)
    return unavailable("PayTR entegrasyon bilgileri eksik.");
  if (!input.from || !input.to)
    return unavailable("Bu tarih aralığında PayTR işlem bazlı net hesaplama henüz desteklenmiyor.");
  const first = dayInIstanbul(input.from);
  const last = dayInIstanbul(new Date(input.to.getTime() - 1));
  const difference = dayDiff(first, last);
  if (difference < 0 || difference > 30)
    return unavailable("31 günü aşan dönemlerde gerçek işlem kesintisi henüz topluca doğrulanamıyor.");
  const key = input.merchantId + "|" + first + "|" + last;
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) return cached.report;
  const windows: Array<[string, string]> = [];
  for (let day = first; day <= last;) {
    const end = addDays(day, 2) > last ? last : addDays(day, 2);
    windows.push([day, end]);
    day = addDays(end, 1);
  }
  const rows: PaytrTransaction[] = [];
  try {
    // Four windows maximum at a time; PayTR only permits three calendar days/request.
    for (let index = 0; index < windows.length; index += 4) {
      const reports = await Promise.all(windows.slice(index, index + 4)
        .map(([start, end]) => requestWindow(input, start, end)));
      for (const report of reports) rows.push(...report);
    }
    const output: PaytrTransactionReport = { complete: true, rows, warning: null, checkedAt };
    // Merchant data is cached only inside this server instance; no browser storage.
    cache.set(key, { expiry: Date.now() + 90000, report: output });
    if (cache.size > 100) cache.delete(cache.keys().next().value || key);
    return output;
  } catch (error) {
    return unavailable("PayTR gerçek işlem kesintisi doğrulanamadı: "
      + (error instanceof Error ? error.message : "API isteği başarısız oldu."));
  }
}
