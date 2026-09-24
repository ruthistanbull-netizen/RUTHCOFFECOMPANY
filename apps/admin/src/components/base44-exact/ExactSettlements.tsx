"use client";

import { AlertTriangle, CalendarClock, Landmark, RefreshCw, RotateCcw, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactIconButton, ExactPageHeader, ExactSkeleton, ExactStatusBadge, useExactToast } from "./primitives";
import { ExactDataCard, ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn } from "./data";

type SettlementRow = {
  id: string;
  date: string;
  currency: string;
  sales: number;
  returns: number;
  net: number;
  ibanLast4: string | null;
  future: boolean;
};

type SettlementsResponse = {
  rows?: SettlementRow[];
  range?: { startDate: string; endDate: string };
  summary?: {
    futureNet: number;
    paidNet: number;
    totalReturns: number;
    futureCount: number;
    nextPayment: SettlementRow | null;
  };
  providerStatus?: string;
  providerWarning?: string | null;
};

const emptySummary: NonNullable<SettlementsResponse["summary"]> = {
  futureNet: 0,
  paidNet: 0,
  totalReturns: 0,
  futureCount: 0,
  nextPayment: null,
};

function currencyCode(value: string) {
  const normalized = String(value || "TL").toUpperCase();
  return normalized === "TL" ? "TRY" : normalized;
}

function money(value: number, currency = "TL") {
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: currencyCode(currency),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

function shortDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value || "—";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(date);
}

function daysUntil(value: string) {
  const target = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const targetStart = new Date(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()).getTime();
  return Math.max(0, Math.round((targetStart - todayStart) / 86_400_000));
}

export function ExactSettlements() {
  const toast = useExactToast();
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [summary, setSummary] = useState<NonNullable<SettlementsResponse["summary"]>>({ ...emptySummary });
  const [range, setRange] = useState<SettlementsResponse["range"] | null>(null);
  const [providerWarning, setProviderWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false): Promise<boolean> => {
    if (!silent) setLoading(true);
    try {
      const result = await adminRequest<SettlementsResponse>("/api/paytr/settlements", {
        force: true,
        ttlMs: 0,
        staleMs: 0,
      });
      setRows(result.rows || []);
      setSummary(result.summary || { ...emptySummary });
      setRange(result.range || null);
      setProviderWarning(result.providerWarning || null);
      return true;
    } catch (caught) {
      if (!silent) {
        setRows([]);
        setSummary({ ...emptySummary });
        setRange(null);
        setProviderWarning(null);
      }
      toast.error(caught instanceof Error ? caught.message : "PayTR hakedişleri alınamadı.");
      return false;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const ok = await load(true);
      if (ok) toast.success("Hakedişler yenilendi.");
    } finally {
      setRefreshing(false);
    }
  }, [load, toast]);

  const columns = useMemo<ExactColumn<SettlementRow>[]>(() => [
    {
      key: "date",
      label: "Ödeme tarihi",
      sortable: true,
      render: (row) => <div><p className="ruth-type-body-strong text-main">{shortDate(row.date)}</p><p className="ruth-type-caption text-muted">{row.future ? "Planlanan transfer" : "Gerçekleşen transfer"}</p></div>,
    },
    {
      key: "future",
      label: "Durum",
      render: (row) => <ExactStatusBadge status={row.future ? "pending" : "active"} label={row.future ? "Bekliyor" : "Aktarıldı"} size="sm" />,
    },
    {
      key: "sales",
      label: "Satış",
      align: "right",
      sortable: true,
      render: (row) => <span className="ruth-type-body text-main tabular-nums">{money(row.sales, row.currency)}</span>,
    },
    {
      key: "returns",
      label: "İade",
      align: "right",
      sortable: true,
      render: (row) => <span className="ruth-type-body text-muted tabular-nums">{money(row.returns, row.currency)}</span>,
    },
    {
      key: "net",
      label: "Net yatacak",
      align: "right",
      sortable: true,
      render: (row) => <span className="ruth-type-body-strong text-main tabular-nums">{money(row.net, row.currency)}</span>,
    },
    {
      key: "ibanLast4",
      label: "Hesap",
      align: "right",
      render: (row) => <span className="ruth-type-caption text-muted">{row.ibanLast4 ? `•••• ${row.ibanLast4}` : "—"}</span>,
    },
  ], []);

  const next = summary.nextPayment;
  const nextPaymentDays = next ? daysUntil(next.date) : null;

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="settlements">
      <ExactPageHeader
        title="Hakedişler"
        actions={<ExactIconButton icon={RefreshCw} label="PayTR hakedişlerini yenile" variant="secondary" onClick={() => void refresh()} loading={refreshing} />}
      />

      {loading ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ExactSkeleton className="h-28" /><ExactSkeleton className="h-28" /><ExactSkeleton className="h-28" /><ExactSkeleton className="h-28" />
          </div>
          <ExactSkeleton className="h-72" />
        </>
      ) : (
        <>
          {providerWarning ? (
            <ExactDataCard bodyClassName="p-0">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center radius-small bg-accent-soft text-accent"><AlertTriangle className="h-4 w-4" /></div>
                <p className="ruth-type-body text-main">{providerWarning}</p>
              </div>
            </ExactDataCard>
          ) : null}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ExactMetricCard label="Bekleyen Hakediş" value={summary.futureNet} format="currency" icon={WalletCards} accent />
            <ExactMetricCard label="Aktarılan" value={summary.paidNet} format="currency" icon={Landmark} />
            <ExactMetricCard label="İadeler" value={summary.totalReturns} format="currency" icon={RotateCcw} />
            <article className="relative overflow-hidden radius-card p-4 bg-surface-primary shadow-card transition-all duration-200 hover:shadow-card">
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="ruth-type-label text-muted">En Yakın Ödeme</span>
                <div className="flex items-center justify-center h-7 w-7 radius-small shrink-0 bg-accent-soft text-accent"><CalendarClock className="h-3.5 w-3.5" /></div>
              </div>
              <div className="ruth-type-metric text-main">
                {nextPaymentDays == null ? "—" : nextPaymentDays === 0 ? "Bugün" : `${nextPaymentDays} gün sonra`}
              </div>
            </article>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2 px-1">
              <div>
                <h2 className="ruth-type-card-title text-main">Ödeme takvimi</h2>
                {range ? <p className="ruth-type-caption mt-0.5 text-muted">{shortDate(range.startDate)} – {shortDate(range.endDate)}</p> : null}
              </div>
            </div>
            <ExactDataTable
              columns={columns}
              data={rows}
              density="compact"
              emptyState={<ExactEmptyState icon={CalendarClock} title="Hakediş bulunamadı" description="PayTR'den gösterilecek ödeme bulunamadı." />}
              mobileCard={(row) => (
                <ExactDataCard className="mb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="ruth-type-body-strong text-main">{shortDate(row.date)}</p>
                      <p className="ruth-type-caption mt-1 text-muted">Net hakediş</p>
                    </div>
                    <ExactStatusBadge status={row.future ? "pending" : "active"} label={row.future ? "Bekliyor" : "Aktarıldı"} size="sm" />
                  </div>
                  <p className="mt-3 text-xl font-semibold tracking-[-0.03em] text-main tabular-nums">{money(row.net, row.currency)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="p-2.5 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Satış</p><p className="ruth-type-caption mt-1 text-main tabular-nums">{money(row.sales, row.currency)}</p></div>
                    <div className="p-2.5 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">İade</p><p className="ruth-type-caption mt-1 text-main tabular-nums">{money(row.returns, row.currency)}</p></div>
                  </div>
                  {row.ibanLast4 ? <p className="ruth-type-caption mt-3 text-muted">Hesap: •••• {row.ibanLast4}</p> : null}
                </ExactDataCard>
              )}
            />
          </div>
        </>
      )}
    </div>
  );
}
