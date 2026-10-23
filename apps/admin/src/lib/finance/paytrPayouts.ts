import type { SettlementRow } from "../paytrSettlementReport";

export type FinancePayout = {
  date: string; currency: string; sales: number; refunds: number;
  net: number; state: "upcoming" | "transferred";
};
export type FinancePayoutReport = {
  rows: FinancePayout[]; upcoming: FinancePayout[];
  unpaidTotal: number; byCurrency: Record<string, number>;
  checkedAt: string; windowsChecked: number;
  providerStatus: string; payoutWarning: string | null;
};

/** Adapt the canonical Hakedişler report to Finance's ISO currency contract.
 * Keep provider dates/net amounts and currencies separate; never estimate fees.
 */
export function financePayouts(report: {
  rows: SettlementRow[]; providerStatus: string; providerWarning: string | null;
  diagnostics: { queriedWindows: unknown[] };
}, now = new Date()): FinancePayoutReport {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const rows = report.rows.map((row): FinancePayout => ({
    date: row.date, currency: row.currency === "TL" ? "TRY" : row.currency,
    sales: row.sales, refunds: row.returns, net: row.net,
    state: row.future ? "upcoming" : "transferred",
  }));
  const upcoming = rows.filter(row => row.state === "upcoming" && row.date >= today && row.net > 0);
  const byCurrency: Record<string, number> = {};
  for (const row of upcoming) {
    byCurrency[row.currency] = Math.round(((byCurrency[row.currency] || 0) + row.net) * 100) / 100;
  }
  return {
    rows, upcoming, unpaidTotal: byCurrency.TRY || 0, byCurrency,
    checkedAt: now.toISOString(), windowsChecked: report.diagnostics.queriedWindows.length,
    providerStatus: report.providerStatus, payoutWarning: report.providerWarning,
  };
}
