"use client";
import { Button, DataTable, Notice, PageSection } from "@ruth-commerce/ui";
import type { FinancePayout, FinancePayoutReport } from "@/lib/finance/paytrPayouts";
import { money } from "./shared";

export function FinancePayouts({ payouts }: { payouts: {
  data: FinancePayoutReport | null; error: string; loading: boolean;
  load: () => Promise<void>;
} }) {
  const { data, error, loading } = payouts;
  const unavailable = data?.providerStatus === "unavailable";
  return <PageSection className="finance-section" title="PayTR'den beklenen tahsilatlar"
    description="PayTR'nin mağaza için bildirdiği gerçek aktarım tarihleri ve net tutarlar. Tarih filtresinden bağımsızdır.">
    {error || unavailable ? <Notice tone="warning">
      PayTR hakedişleri şu an alınamıyor; bekleyen tutar sıfır olarak kabul edilmez.
      {error ? <p>{error}</p> : null}
      <Button variant="secondary" onClick={() => void payouts.load()} disabled={loading}>Tekrar dene</Button>
    </Notice> : null}
    {loading && !data ? <p>PayTR ödeme takvimi yükleniyor…</p> : null}
    {data?.payoutWarning ? <Notice tone="warning">{data.payoutWarning}</Notice> : null}
    {data?.providerStatus === "success" && !data.payoutWarning && !data.upcoming.length
      ? <p className="text-sm text-muted">PayTR bu sorguda bekleyen aktarım bildirmedi.</p> : null}
    {data?.upcoming.length ? <DataTable<FinancePayout> layout="fit" density="compact"
      rows={data.upcoming} getRowKey={row => row.date + "-" + row.currency}
      columns={[
        { key: "date", header: "Hesaba geçiş tarihi", cell: row => new Intl.DateTimeFormat(
          "tr-TR", { timeZone: "UTC", day: "2-digit", month: "long", year: "numeric" }
        ).format(new Date(row.date + "T12:00:00Z")) },
        { key: "net", header: "Beklenen net aktarım", cell: row => money(row.net, row.currency) },
        { key: "currency", header: "Para birimi", cell: row => row.currency },
      ]} /> : null}
  </PageSection>;
}
