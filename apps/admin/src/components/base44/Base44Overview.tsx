"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CircleDollarSign,
  CreditCard,
  Hammer,
  Package,
  Percent,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Truck,
  UserPlus,
} from "lucide-react";
import { adminRequest } from "@/lib/adminApi";
import {
  ADMIN_DATE_RANGE_OPTIONS,
  dateRangeParam,
  type AdminDateRangeKey,
  type AdminDateRangeValue,
} from "@/components/DateRangeControl";
import {
  Base44Button,
  Base44DataCard,
  Base44MetricCard,
  Base44PageHeader,
  Base44Skeleton,
  Base44StatusBadge,
  base44Cx,
} from "./ui";

type Order = {
  id: string;
  order_no: string;
  customer_name: string;
  total_amount: number;
  currency?: string;
  status: string;
  payment_status: string;
  created_at: string;
  shipping_error?: string | null;
};

type DashboardPayload = {
  summary?: {
    orders?: number;
    paidOrders?: number;
    revenue?: number;
    sessions?: number;
    carts?: number;
    checkoutReached?: number;
    returns?: number;
    products?: number;
    conversionRate?: number;
  };
  recentOrders?: Order[];
  paymentSummary?: {
    totalCollected?: number;
    successfulCount?: number;
    refundedTotal?: number;
    reviewRequired?: number;
  };
  shippingCounts?: {
    orderExceptions?: number;
    waitingWebhooks?: number;
    failedWebhooks?: number;
    deadLetters?: number;
  };
  operationCounts?: {
    newOrders?: number;
    preparing?: number;
    ready?: number;
    shippingAttention?: number;
  };
  openReturns?: number;
};

type DashboardState = Required<Pick<DashboardPayload, "summary" | "recentOrders" | "paymentSummary" | "shippingCounts" | "operationCounts">> & { openReturns: number };

const emptyData: DashboardState = {
  summary: { orders: 0, paidOrders: 0, revenue: 0, sessions: 0, carts: 0, checkoutReached: 0, returns: 0, products: 0, conversionRate: 0 },
  recentOrders: [],
  paymentSummary: { totalCollected: 0, successfulCount: 0, refundedTotal: 0, reviewRequired: 0 },
  shippingCounts: { orderExceptions: 0, waitingWebhooks: 0, failedWebhooks: 0, deadLetters: 0 },
  operationCounts: { newOrders: 0, preparing: 0, ready: 0, shippingAttention: 0 },
  openReturns: 0,
};

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function statusPresentation(order: Order): { label: string; tone: "success" | "warning" | "danger" | "info" | "accent" | "neutral" } {
  const status = String(order.status || "").toLowerCase();
  if (["delivered", "completed", "fulfilled"].includes(status)) return { label: "Teslim edildi", tone: "success" };
  if (["shipped", "in_transit", "out_for_delivery"].includes(status)) return { label: "Gönderildi", tone: "accent" };
  if (["ready", "ready_to_ship", "prepared"].includes(status)) return { label: "Kargoya hazır", tone: "accent" };
  if (["preparing", "in_production", "processing", "queued"].includes(status)) return { label: "Hazırlanıyor", tone: "warning" };
  if (["cancelled", "canceled"].includes(status)) return { label: "İptal", tone: "neutral" };
  if (["failed", "rejected"].includes(String(order.payment_status || "").toLowerCase()) || order.shipping_error) return { label: "Kontrol gerekli", tone: "danger" };
  return { label: "Yeni", tone: "info" };
}

function chartData(orders: Order[]) {
  const now = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    const sales = orders
      .filter((order) => {
        const created = new Date(order.created_at);
        return created >= date && created < next && ["paid", "succeeded", "success"].includes(String(order.payment_status || "").toLowerCase());
      })
      .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    return { day: new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(date), sales };
  });
}

function SalesChart({ data }: { data: Array<{ day: string; sales: number }> }) {
  const width = 720;
  const height = 220;
  const padding = { top: 18, right: 16, bottom: 32, left: 20 };
  const max = Math.max(1, ...data.map((point) => point.sales));
  const points = data.map((point, index) => {
    const x = padding.left + (index * (width - padding.left - padding.right)) / Math.max(1, data.length - 1);
    const y = padding.top + (1 - point.sales / max) * (height - padding.top - padding.bottom);
    return { ...point, x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding.left},${height - padding.bottom} ${line} ${width - padding.right},${height - padding.bottom}`;

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[220px]" role="img" aria-label="Son yedi gün satış grafiği">
        <defs>
          <linearGradient id="base44SalesGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((ratio) => <line key={ratio} x1={padding.left} x2={width - padding.right} y1={padding.top + ratio * (height - padding.top - padding.bottom)} y2={padding.top + ratio * (height - padding.top - padding.bottom)} stroke="hsl(var(--border-subtle))" strokeDasharray="3 3" />)}
        <polygon points={area} fill="url(#base44SalesGradient)" />
        <polyline points={line} fill="none" stroke="hsl(var(--accent))" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point) => <circle key={point.day} cx={point.x} cy={point.y} r="3" fill="hsl(var(--accent))"><title>{point.day}: {money(point.sales)}</title></circle>)}
        {points.map((point) => <text key={`${point.day}-label`} x={point.x} y={height - 9} textAnchor="middle" fontSize="11" fill="hsl(var(--text-subtle))">{point.day}</text>)}
      </svg>
    </div>
  );
}

function Base44RangeSelect({ value, onChange }: { value: AdminDateRangeValue; onChange: (next: AdminDateRangeValue) => void }) {
  return (
    <select
      aria-label="Tarih aralığı"
      value={value.range}
      onChange={(event) => onChange({ ...value, range: event.target.value as AdminDateRangeKey })}
      className="h-8 px-3 radius-small bg-surface-secondary border border-border-subtle text-xs text-main focus:outline-none focus:ring-2 focus:ring-accent"
    >
      {ADMIN_DATE_RANGE_OPTIONS.filter((option) => option.value !== "custom").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

export function Base44Overview() {
  const [range, setRange] = useState<AdminDateRangeValue>({ range: "this_week", from: "", to: "" });
  const [data, setData] = useState<DashboardState>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (!silent) setLoading(true);
    try {
      const payload = await adminRequest<DashboardPayload>(`/api/summary?range=${encodeURIComponent(dateRangeParam(range))}`, { force: silent, ttlMs: 25_000, staleMs: 45 * 60_000 });
      setData({
        summary: { ...emptyData.summary, ...(payload.summary || {}) },
        recentOrders: payload.recentOrders || [],
        paymentSummary: { ...emptyData.paymentSummary, ...(payload.paymentSummary || {}) },
        shippingCounts: { ...emptyData.shippingCounts, ...(payload.shippingCounts || {}) },
        operationCounts: { ...emptyData.operationCounts, ...(payload.operationCounts || {}) },
        openReturns: Number(payload.openReturns || 0),
      });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kontrol merkezi verileri alınamadı.");
    } finally {
      inFlight.current = false;
      if (!silent) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load({ silent: true }); }, 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const summary = data.summary;
  const operations = data.operationCounts;
  const attention = Number(operations.shippingAttention || 0) + Number(data.paymentSummary.reviewRequired || 0) + data.openReturns;
  const averageOrder = Number(summary.paidOrders || 0) > 0 ? Number(summary.revenue || 0) / Number(summary.paidOrders || 1) : 0;
  const sales = useMemo(() => chartData(data.recentOrders), [data.recentOrders]);
  const orderDistribution = [
    { label: "Yeni", count: Number(operations.newOrders || 0), tone: "info" as const },
    { label: "Hazırlanıyor", count: Number(operations.preparing || 0), tone: "warning" as const },
    { label: "Kargoya hazır", count: Number(operations.ready || 0), tone: "accent" as const },
    { label: "İşlem gerekli", count: attention, tone: "danger" as const },
  ];
  const distributionTotal = Math.max(1, orderDistribution.reduce((sum, item) => sum + item.count, 0));

  return (
    <div className="space-y-4 animate-fade-in" data-base44-page="overview">
      <Base44PageHeader
        title="Control Room"
        subtitle="Canlı ticaret ve operasyon özeti"
        actions={
          <>
            <Base44RangeSelect value={range} onChange={setRange} />
            <Link href="/ruthie"><Base44Button variant="secondary" size="sm"><Sparkles className="h-4 w-4" /> Ruthie’ye sor</Base44Button></Link>
          </>
        }
      />

      {error ? <div className="radius-control bg-danger-soft border border-danger/20 px-4 py-3 text-xs text-danger-foreground flex items-center gap-2"><AlertCircle className="h-4 w-4" />{error}</div> : null}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3"><Base44Skeleton className="h-[146px]" /><Base44Skeleton className="h-[146px] lg:col-span-2" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Base44MetricCard accent label="Net Satış" value={Number(summary.revenue || 0)} format="currency" icon={CircleDollarSign} />
          <Base44DataCard className="lg:col-span-2">
            <div className="flex items-start gap-3 mb-3">
              <div className="relative h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent-hover))] shadow-floating flex items-center justify-center animate-orb-breathe"><Sparkles className="h-5 w-5 text-white" /><span className="absolute inset-[-4px] rounded-full border border-accent/30 animate-orb-rotate" /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-main">Ruthie Insight</h3><span className="inline-flex items-center gap-1 text-[10px] text-success-foreground"><span className="h-1.5 w-1.5 rounded-full bg-success" /> hazır</span></div>
                <p className="text-xs text-muted mt-1 leading-relaxed">Bu dönemde {Number(summary.orders || 0).toLocaleString("tr-TR")} sipariş ve {money(Number(summary.revenue || 0))} satış oluştu. {attention > 0 ? `${attention} işlem kontrol bekliyor.` : "Acil kontrol bekleyen işlem görünmüyor."}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Link href="/orders" className="px-2.5 py-1 radius-small bg-accent-soft text-accent text-[11px] font-medium hover:bg-accent/10 transition-colors">Siparişleri özetle</Link>
              <Link href="/payments" className="px-2.5 py-1 radius-small bg-accent-soft text-accent text-[11px] font-medium hover:bg-accent/10 transition-colors">Ödemeleri kontrol et</Link>
              <Link href="/shipping/operations" className="px-2.5 py-1 radius-small bg-accent-soft text-accent text-[11px] font-medium hover:bg-accent/10 transition-colors">Kargo sorunlarını bul</Link>
            </div>
          </Base44DataCard>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Base44MetricCard label="Toplam Sipariş" value={Number(summary.orders || 0)} icon={ShoppingBag} />
        <Base44MetricCard label="İşlem Gerektiren" value={attention} icon={AlertCircle} />
        <Base44MetricCard label="Toplam Ürün" value={Number(summary.products || 0)} icon={Package} />
        <Base44MetricCard label="Açık İade" value={data.openReturns} icon={RotateCcw} />
        <Base44MetricCard label="Dönüşüm Oranı" value={Number(summary.conversionRate || 0)} format="percent" icon={Percent} />
        <Base44MetricCard label="Ortalama Sepet" value={averageOrder} format="currency" icon={CircleDollarSign} />
        <Base44MetricCard label="Başarılı Ödeme" value={Number(data.paymentSummary.successfulCount || summary.paidOrders || 0)} icon={CreditCard} />
        <Base44MetricCard label="Oturum" value={Number(summary.sessions || 0)} icon={UserPlus} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Base44DataCard title="Satış — Son 7 Gün" className="lg:col-span-2" bodyClassName="pt-2"><SalesChart data={sales} /></Base44DataCard>
        <Base44DataCard title="Sipariş Durumu">
          <div className="space-y-2.5">
            {orderDistribution.map((item) => {
              const percentage = (item.count / distributionTotal) * 100;
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1"><Base44StatusBadge label={item.label} tone={item.tone} dot={false} size="sm" /><span className="text-xs font-semibold text-main">{item.count.toLocaleString("tr-TR")}</span></div>
                  <div className="h-1.5 rounded-full bg-surface-tertiary overflow-hidden"><div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(2, percentage)}%` }} /></div>
                </div>
              );
            })}
          </div>
        </Base44DataCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Base44DataCard title="Canlı Aktivite" className="lg:col-span-2" bodyClassName="p-0" noPadding>
          <div className="divide-y divide-border-subtle">
            {data.recentOrders.slice(0, 7).map((order) => {
              const presentation = statusPresentation(order);
              const Icon = presentation.tone === "danger" ? AlertCircle : presentation.tone === "warning" ? Hammer : presentation.tone === "accent" ? Truck : ShoppingBag;
              return (
                <Link href={`/orders?q=${encodeURIComponent(order.order_no)}`} key={order.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-secondary transition-colors">
                  <div className={base44Cx("flex items-center justify-center h-8 w-8 radius-small shrink-0", presentation.tone === "danger" ? "bg-danger-soft text-danger-foreground" : presentation.tone === "warning" ? "bg-warning-soft text-warning-foreground" : presentation.tone === "accent" ? "bg-accent-soft text-accent" : "bg-info-soft text-info-foreground")}><Icon className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0"><p className="text-xs font-medium text-main truncate">#{order.order_no} · {order.customer_name || "İsimsiz müşteri"}</p><p className="text-[11px] text-muted truncate">{money(order.total_amount)} · {presentation.label}</p></div>
                  <span className="text-[10px] text-subtle shrink-0">{shortDate(order.created_at)}</span>
                </Link>
              );
            })}
            {!loading && data.recentOrders.length === 0 ? <div className="px-4 py-8 text-center text-sm text-subtle">Bu tarih aralığında sipariş yok</div> : null}
          </div>
        </Base44DataCard>

        <Base44DataCard title="Acil Operasyonlar" bodyClassName="space-y-2">
          <Link href="/payments" className="block p-3 radius-small bg-warning-soft border border-warning/20 hover:brightness-[0.99] transition-all"><div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold text-warning-foreground">Ödeme Kontrolü</span><span className="text-lg font-bold text-warning-foreground">{Number(data.paymentSummary.reviewRequired || 0)}</span></div><p className="text-[11px] text-muted">Bekleyen veya başarısız işlemler</p></Link>
          <Link href="/orders?queue=preparing" className="block p-3 radius-small bg-info-soft border border-info/20 hover:brightness-[0.99] transition-all"><div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold text-info-foreground">Üretimde</span><span className="text-lg font-bold text-info-foreground">{Number(operations.preparing || 0)}</span></div><p className="text-[11px] text-muted">Hazırlanan siparişler</p></Link>
          <Link href="/orders?queue=ready" className="block p-3 radius-small bg-accent-soft border border-accent/20 hover:brightness-[0.99] transition-all"><div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold text-accent">Paketlemeye Hazır</span><span className="text-lg font-bold text-accent">{Number(operations.ready || 0)}</span></div><p className="text-[11px] text-muted">Gönderim bekleyen siparişler</p></Link>
          <Link href="/orders"><Base44Button variant="secondary" size="sm" className="w-full mt-1">Tüm kuyrukları gör <ArrowRight className="h-3.5 w-3.5" /></Base44Button></Link>
        </Base44DataCard>
      </div>
    </div>
  );
}
