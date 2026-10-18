import type { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Db = ReturnType<typeof getSupabaseAdmin>;
export type ExpenseFxQuote = {
  rates: { USD: number; EUR: number };
  publishedOn: string;
  source: "TCMB-ForexSelling";
  checkedAt: string;
};
export type ExpenseLine = {
  id: string;
  title: string;
  category: string | null;
  occurred_on: string;
  nature: string;
  currency: string;
  originalNet: number;
  originalGross: number;
  originalTax: number;
  fxToTry: number;
  fxPublishedOn: string | null;
  fxMode: "original" | "recorded" | "current_for_legacy";
  tryNet: number;
};

const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const cache: { quote: ExpenseFxQuote | null; at: number } = { quote: null, at: 0 };

export async function getExpenseFxRates(): Promise<ExpenseFxQuote> {
  if (cache.quote && Date.now() - cache.at < 15 * 60_000) return cache.quote;
  const response = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml", {
    headers: { Accept: "application/xml,text/xml" },
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error("TCMB döviz kuru alınamadı (HTTP " + response.status + ").");
  const xml = await response.text();
  const match = xml.match(/<Tarih_Date\b[^>]*\bDate=["'](\d{2})\/(\d{2})\/(\d{4})["']/i);
  if (!match) throw new Error("TCMB kur tarihi doğrulanamadı.");
  const rates = {} as ExpenseFxQuote["rates"];
  for (const currency of ["USD", "EUR"] as const) {
    const block = xml.match(new RegExp('<Currency\\b[^>]*\\b(?:Kod|Code)=["\\\']' + currency + '["\\\'][^>]*>[\\s\\S]*?<\\/Currency>', "i"))?.[0];
    const number = Number(block?.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/i)?.[1]);
    if (!Number.isFinite(number) || number <= 0 || number > 10000)
      throw new Error("TCMB " + currency + " satış kuru doğrulanamadı.");
    rates[currency] = number;
  }
  const quote: ExpenseFxQuote = {
    rates,
    publishedOn: match[3] + "-" + match[1] + "-" + match[2],
    checkedAt: new Date().toISOString(),
    source: "TCMB-ForexSelling",
  };
  cache.quote = quote;
  cache.at = Date.now();
  return quote;
}

type RawExpense = {
  id: string; title: string; occurred_on: string; currency: string;
  nature: string; source: string; net: number | string; tax: number | string;
  gross: number | string; metadata: Record<string, unknown> | null;
};
async function expenseRows(db: Db, from: string, to: string): Promise<RawExpense[]> {
  const all: RawExpense[] = [];
  // Never silently return a partial financial total when the date range
  // has more records than PostgREST's usual 1,000-row page.
  for (let start = 0; start < 100_000; start += 500) {
    const result = await db.from("finance_entries")
      .select("id,title,occurred_on,currency,nature,source,net,tax,gross,metadata")
      .eq("direction", "expense").eq("cancelled", false)
      .in("currency", ["TRY", "USD", "EUR"])
      .in("nature", ["operating", "tax", "financing"])
      .gte("occurred_on", from).lte("occurred_on", to)
      .order("occurred_on", { ascending: false })
      .order("id", { ascending: false })
      .range(start, start + 499);
    if (result.error) throw new Error("Giderler okunamadı: " + result.error.message);
    const batch = (result.data || []) as RawExpense[];
    all.push(...batch);
    if (batch.length < 500) return all;
  }
  throw new Error("Gider sayısı sorgulama sınırını aştı; eksik toplam gösterilmiyor.");
}

export async function expenseBreakdown(db: Db, from: string, to: string, baseReport?: {
  current?: { cogs?: unknown };
  monthly?: Array<{date: string; values: {cogs?: unknown}}>;
}) {
  const raw = await expenseRows(db, from, to);
  const needsRate = raw.some(e => e.currency === "USD" || e.currency === "EUR");
  // Existing foreign expenses without saved quotes use the current official
  // reference quote, explicitly marked as estimates, never invented.
  const needsCurrentRate = raw.some(e => ["USD","EUR"].includes(e.currency) &&
    !(Number(e.metadata?.fx_to_try) > 0));
  const quote = needsCurrentRate ? await getExpenseFxRates() : null;
  const rows: ExpenseLine[] = raw.map(entry => {
    const currency = entry.currency;
    const originalNet = Number(entry.net);
    const saved = Number(entry.metadata?.fx_to_try);
    const converted = currency !== "TRY";
    const fxToTry = !converted ? 1 :
      saved > 0 ? saved : (currency === "USD" ? quote?.rates.USD : quote?.rates.EUR) || 0;
    if (!Number.isFinite(originalNet) || !Number.isFinite(fxToTry) || fxToTry <= 0)
      throw new Error(currency + " kuru doğrulanamadı; eksik gider toplamı gösterilmiyor.");
    return {
      id: entry.id, title: entry.title, occurred_on: entry.occurred_on,
      category: entry.nature, nature: entry.nature, currency,
      originalNet, originalGross: Number(entry.gross), originalTax: Number(entry.tax),
      fxToTry, fxPublishedOn: !converted ? null :
        saved > 0 ? String(entry.metadata?.fx_published_on || "") || null : quote?.publishedOn || null,
      fxMode: !converted ? "original" : saved > 0 ? "recorded" : "current_for_legacy",
      tryNet: round(originalNet * fxToTry),
    };
  });
  const countByCurrency = { USD: 0, EUR: 0 };
  for (const entry of rows) {
    if (entry.currency === "USD") countByCurrency.USD++;
    if (entry.currency === "EUR") countByCurrency.EUR++;
  }
  // The original finance report already includes COGS (from immutable sale
  // snapshots), but purchase_payable is merely a debt tracking that COGS.
  // Excluding inventory expense entries avoids counting product costs twice.
  const rawCost = baseReport?.current?.cogs;
  const costKnown = rawCost !== null && rawCost !== undefined && Number.isFinite(Number(rawCost));
  const cogs = costKnown ? Number(rawCost) : null;
  const linesTotal = round(rows.reduce((sum, e) => sum + e.tryNet, 0));
  const totalTRY = cogs === null ? null : round(cogs + linesTotal);
  const monthly: Record<string, number> = {};
  for (const e of rows) {
    const month = e.occurred_on.slice(0, 7);
    monthly[month] = round((monthly[month] || 0) + e.tryNet);
  }
  if (Array.isArray(baseReport?.monthly)) {
    for (const m of baseReport.monthly) {
      const month = String(m.date).slice(0, 7);
      const monthCogs = m.values.cogs;
      monthly[month] = monthCogs == null ? Number.NaN :
        round((monthly[month] || 0) + Number(monthCogs || 0));
    }
  }
  return {
    currency: "TRY" as const,
    totalTRY,
    cogs,
    linesTotalTRY: linesTotal,
    rows,
    monthly,
    countByCurrency,
    conversionNote: needsRate ? "Yabancı para kayıtları TCMB satış kuruyla TL'ye çevrilir." : "",
    legacyWarning: rows.some(x=>x.fxMode==="current_for_legacy"),
  };
}
