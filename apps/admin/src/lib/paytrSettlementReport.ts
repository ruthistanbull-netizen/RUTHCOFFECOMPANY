import { queryPaytrPaymentSummary } from "@ruth-commerce/commerce-core";

type PaytrCredentials = {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
};

export type SettlementRow = {
  id: string;
  date: string;
  currency: string;
  sales: number;
  returns: number;
  net: number;
  ibanLast4: string | null;
  future: boolean;
};

type ReportWindow = { startDate: string; endDate: string };
type Metric = "sales" | "returns" | "net";
type ProviderResult = Awaited<ReturnType<typeof queryPaytrPaymentSummary>>;

type MetricContext = {
  date: string | null;
  currency: string | null;
  metric: Metric | null;
};

function dateOnlyInIstanbul(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function decode(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text || (!text.startsWith("{") && !text.startsWith("["))) return value;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

function object(value: unknown): Record<string, unknown> | null {
  const decoded = decode(value);
  return decoded && typeof decoded === "object" && !Array.isArray(decoded)
    ? decoded as Record<string, unknown>
    : null;
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\D|$)/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  const tr = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\D|$)/);
  if (tr) return `${tr[3]}-${tr[2].padStart(2, "0")}-${tr[1].padStart(2, "0")}`;

  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : null;
}

function normalizeCurrency(value: unknown) {
  const currency = String(value ?? "").trim().toUpperCase();
  if (!/^(TL|TRY|USD|EUR|GBP|CHF|AED|SAR|CAD|AUD)$/.test(currency)) return null;
  return currency === "TRY" ? "TL" : currency;
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function metricForKey(value: string): Metric | null {
  const key = normalizeKey(value);
  if (["net", "netamount", "netamounts"].includes(key)) return "net";
  if (["sale", "sales", "saleamount", "saleamounts", "salesamount", "salesamounts"].includes(key)) return "sales";
  if (["return", "returns", "refund", "refunds", "returnamount", "returnamounts", "returnsamount", "returnsamounts"].includes(key)) return "returns";
  return null;
}

function localizedNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim().replace(/\s+/g, "");
  if (!raw) return 0;
  const stripped = raw.replace(/[^0-9,.-]/g, "");
  const comma = stripped.lastIndexOf(",");
  const dot = stripped.lastIndexOf(".");
  let normalized = stripped;

  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? stripped.replace(/\./g, "").replace(",", ".")
      : stripped.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = stripped.replace(/\./g, "").replace(",", ".");
  } else if ((stripped.match(/\./g) || []).length > 1) {
    const parts = stripped.split(".");
    const decimal = parts.pop();
    normalized = `${parts.join("")}.${decimal}`;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ibanLast4(value: unknown) {
  const iban = String(value ?? "").replace(/\s+/g, "").trim();
  return iban.length >= 4 ? iban.slice(-4) : null;
}

function directDate(record: Record<string, unknown>) {
  for (const key of ["date_paid", "payment_date", "transfer_date", "pay_date", "date"]) {
    const date = normalizeDate(record[key]);
    if (date) return date;
  }
  return null;
}

function directCurrency(record: Record<string, unknown>) {
  for (const key of ["currency", "currency_type", "currency_code", "para_birimi"]) {
    const currency = normalizeCurrency(record[key]);
    if (currency) return currency;
  }
  return null;
}

function findFutureBlocks(value: unknown, depth = 0): unknown[] {
  if (depth > 12 || value == null) return [];
  const decoded = decode(value);
  if (Array.isArray(decoded)) return decoded.flatMap((item) => findFutureBlocks(item, depth + 1));
  const record = object(decoded);
  if (!record) return [];

  const blocks: unknown[] = [];
  for (const [key, child] of Object.entries(record)) {
    if (normalizeKey(key) === "futurepayments") blocks.push(decode(child));
    else blocks.push(...findFutureBlocks(child, depth + 1));
  }
  return blocks;
}

function collectFutureMetricLeaves(
  value: unknown,
  context: MetricContext,
  output: Array<{ date: string; currency: string; metric: Metric; value: number }>,
  depth = 0,
) {
  if (depth > 16 || value == null) return;
  const decoded = decode(value);

  if (Array.isArray(decoded)) {
    for (const child of decoded) collectFutureMetricLeaves(child, context, output, depth + 1);
    return;
  }

  const record = object(decoded);
  if (record) {
    const inherited: MetricContext = {
      date: directDate(record) || context.date,
      currency: directCurrency(record) || context.currency,
      metric: context.metric,
    };

    for (const [key, child] of Object.entries(record)) {
      if (["date_paid", "payment_date", "transfer_date", "pay_date", "date", "currency", "currency_type", "currency_code", "para_birimi"].includes(key)) continue;
      collectFutureMetricLeaves(child, {
        date: normalizeDate(key) || inherited.date,
        currency: normalizeCurrency(key) || inherited.currency,
        metric: metricForKey(key) || inherited.metric,
      }, output, depth + 1);
    }
    return;
  }

  if (!context.date || !context.metric) return;
  output.push({
    date: context.date,
    currency: context.currency || "TL",
    metric: context.metric,
    value: localizedNumber(decoded),
  });
}

function futureRowsFromBlock(value: unknown, fallbackIban: string | null) {
  const leaves: Array<{ date: string; currency: string; metric: Metric; value: number }> = [];
  collectFutureMetricLeaves(value, { date: null, currency: null, metric: null }, leaves);

  const grouped = new Map<string, { date: string; currency: string; sales: number; returns: number; net: number }>();
  for (const leaf of leaves) {
    const key = `${leaf.date}:${leaf.currency}`;
    const row = grouped.get(key) || { date: leaf.date, currency: leaf.currency, sales: 0, returns: 0, net: 0 };
    row[leaf.metric] += leaf.value;
    grouped.set(key, row);
  }

  return [...grouped.values()].map<SettlementRow>((row) => ({
    id: `future:${row.date}:${row.currency}`,
    ...row,
    ibanLast4: fallbackIban,
    future: true,
  }));
}

function paidRow(result: ProviderResult): SettlementRow | null {
  const root = object(result);
  if (!root) return null;
  const date = directDate(root);
  if (!date) return null;
  const currency = directCurrency(root) || "TL";
  const hasPaidAmounts = root.sales != null || root.return != null || root.returns != null || root.net != null;
  if (!hasPaidAmounts) return null;
  return {
    id: `paid:${date}:${currency}`,
    date,
    currency,
    sales: localizedNumber(root.sales ?? 0),
    returns: localizedNumber(root.return ?? root.returns ?? 0),
    net: localizedNumber(root.net ?? 0),
    ibanLast4: ibanLast4(root.merchant_iban),
    future: false,
  };
}

function uniqueRows(rows: SettlementRow[]) {
  const grouped = new Map<string, SettlementRow>();
  for (const row of rows) {
    const key = `${row.future ? "future" : "paid"}:${row.date}:${row.currency}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...row });
      continue;
    }
    // The same future block may be repeated in adjacent PayTR report windows.
    // Keep the largest snapshot instead of adding duplicates together.
    existing.sales = Math.max(existing.sales, row.sales);
    existing.returns = Math.max(existing.returns, row.returns);
    existing.net = Math.max(existing.net, row.net);
    existing.ibanLast4 ||= row.ibanLast4;
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date) || Number(a.future) - Number(b.future));
}

function defaultWindows(today: string): ReportWindow[] {
  return [
    { startDate: addDays(today, -7), endDate: addDays(today, 23) },
    { startDate: addDays(today, 24), endDate: addDays(today, 54) },
    { startDate: addDays(today, 55), endDate: addDays(today, 85) },
  ];
}

export async function loadPaytrSettlementReport(input: PaytrCredentials & { startDate?: string | null; endDate?: string | null }) {
  const today = dateOnlyInIstanbul();
  const customStart = normalizeDate(input.startDate);
  const customEnd = normalizeDate(input.endDate);
  const windows = customStart || customEnd
    ? [{ startDate: customStart || addDays(today, -7), endDate: customEnd || addDays(today, 23) }]
    : defaultWindows(today);

  const paid: SettlementRow[] = [];
  const future: SettlementRow[] = [];
  const statuses: Array<{ startDate: string; endDate: string; status: string; futureBlocks: number }> = [];
  const errors: string[] = [];
  let providerFutureBlockCount = 0;
  let fallbackIban: string | null = null;

  for (const window of windows) {
    try {
      const result = await queryPaytrPaymentSummary({
        merchantId: input.merchantId,
        merchantKey: input.merchantKey,
        merchantSalt: input.merchantSalt,
        ...window,
      });
      const status = String(result.status ?? "unknown").toLowerCase();
      const blocks = findFutureBlocks(result);
      providerFutureBlockCount += blocks.length;
      statuses.push({ ...window, status, futureBlocks: blocks.length });

      // Do not discard future_payments just because PayTR marks the paid-summary
      // portion of this report window as `failed`.
      if (status !== "error") {
        const currentPaid = paidRow(result);
        if (currentPaid && status === "success") {
          paid.push(currentPaid);
          fallbackIban ||= currentPaid.ibanLast4;
        }
        for (const block of blocks) future.push(...futureRowsFromBlock(block, fallbackIban));
      } else {
        const root = object(result);
        errors.push(String(root?.err_msg || `PayTR ${window.startDate}–${window.endDate} raporu hata döndürdü.`));
      }
    } catch (error) {
      statuses.push({ ...window, status: "request_error", futureBlocks: 0 });
      errors.push(error instanceof Error ? error.message : "PayTR ödeme özeti isteği başarısız oldu.");
    }
  }

  if (errors.length === windows.length) throw new Error(errors[0] || "PayTR ödeme özeti alınamadı.");

  const rows = uniqueRows([...paid, ...future]);
  const futureOnly = rows.filter((row) => row.future && row.date >= today && Math.abs(row.net) + Math.abs(row.sales) + Math.abs(row.returns) > 0);
  const paidOnly = rows.filter((row) => !row.future);
  const overallRange = { startDate: windows[0]?.startDate || today, endDate: windows.at(-1)?.endDate || today };
  const parserMismatch = providerFutureBlockCount > 0 && futureOnly.length === 0;
  const providerFutureDataSeen = providerFutureBlockCount > 0;

  let providerWarning: string | null = null;
  if (parserMismatch) providerWarning = "PayTR future_payments verisi döndürdü ancak geçerli tarih/tutar satırına dönüştürülemedi.";
  else if (!providerFutureDataSeen) providerWarning = "PayTR ödeme özeti servisi bu sorguda future_payments bloğu döndürmedi.";
  else if (errors.length) providerWarning = "PayTR rapor aralığının bir bölümü sorgulanamadı; gösterilen gelecek tutarlar eksik olabilir.";

  return {
    providerStatus: errors.length ? "partial" : "success",
    providerWarning,
    range: overallRange,
    rows,
    summary: {
      futureNet: futureOnly.reduce((sum, row) => sum + row.net, 0),
      paidNet: paidOnly.reduce((sum, row) => sum + row.net, 0),
      totalReturns: rows.reduce((sum, row) => sum + row.returns, 0),
      futureCount: futureOnly.length,
      nextPayment: futureOnly[0] || null,
    },
    diagnostics: {
      providerFutureDataSeen,
      providerFutureBlockCount,
      parsedFutureRowCount: futureOnly.length,
      parserMismatch,
      queriedWindows: statuses,
      failedWindowCount: errors.length,
    },
  };
}
