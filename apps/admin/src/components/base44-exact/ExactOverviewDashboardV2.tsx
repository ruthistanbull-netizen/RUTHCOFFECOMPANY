"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  CircleDollarSign,
  Package,
  Percent,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  Truck,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  ADMIN_DATE_RANGE_OPTIONS,
  dateRangeParam,
  type AdminDateRangeKey,
  type AdminDateRangeValue,
} from "@/components/DateRangeControl";
import { ExactButton, ExactPageHeader, ExactSkeleton, ExactStatusBadge } from "./primitives";
import { ExactDataCard, ExactMetricCard } from "./data";

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

type ConversionSummary = {
  cartRate?: number;
  checkoutRate?: number;
  purchaseRate?: number;
  carts?: number;
  checkoutReached?: number;
  paidOrders?: number;
  sessions?: number;
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
    conversion?: ConversionSummary;
  };
  recentOrders?: Order[];
  operationCounts?: {
    newOrders?: number;
    preparing?: number;
    ready?: number;
    shippingAttention?: number;
  };
  openReturns?: number;
};

type CatalogCounts = { products?: number; variants?: number };
type ChartMetric = "sales" | "sessions" | "carts";
type ChartPeriod = "daily" | "weekly" | "monthly" | "yearly";
type ChartPoint = { key: string; label: string; value: number; secondary?: number };
type ChartPayload = { title?: string; format?: "currency" | "number"; series?: ChartPoint[] };

type DashboardState = {
  summary: NonNullable<DashboardPayload["summary"]>;
  recentOrders: Order[];
  operationCounts: NonNullable<DashboardPayload["operationCounts"]>;
  openReturns: number;
  catalog: { products: number; variants: number };
};

const emptyState: DashboardState = {
  summary: {
    orders: 0,
    paidOrders: 0,
    revenue: 0,
    sessions: 0,
    carts: 0,
    checkoutReached: 0,
    returns: 0,
    products: 0,
    conversionRate: 0,
    conversion: { cartRate: 0, checkoutRate: 0, purchaseRate: 0, carts: 0, checkoutReached: 0, paidOrders: 0, sessions: 0 },
  },
  recentOrders: [],
  operationCounts: { newOrders: 0, preparing: 0, ready: 0, shippingAttention: 0 },
  openReturns: 0,
  catalog: { products: 0, variants: 0 },
};

const metricOptions: Array<{ value: ChartMetric; label: string }> = [
  { value: "sales", label: "Satış" },
  { value: "sessions", label: "Oturum" },
  { value: "carts", label: "Sepet" },
];
const periodOptions: Array<{ value: ChartPeriod; label: string }> = [
  { value: "daily", label: "Günlük" },
  { value: "weekly", label: "Haftalık" },
  { value: "monthly", label: "Aylık" },
  { value: "yearly", label: "Yıllık" },
];

function money(value: number, digits = 0) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: digits }).format(Number(value || 0));
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
  if (["failed", "rejected"].includes(String(order.payment_status || "").toLowerCase()) || order.shipping_error) return { label: "Kontrol gerekli", tone: "danger" };
  if (["cancelled", "canceled"].includes(status)) return { label: "İptal", tone: "neutral" };
  return { label: "Yeni", tone: "info" };
}

function RangeSelect({ value, onChange }: { value: AdminDateRangeValue; onChange: (next: AdminDateRangeValue) => void }) {
  return (
    <select
      aria-label="Tarih aralığı"
      value={value.range}
      onChange={(event) => onChange({ ...value, range: event.target.value as AdminDateRangeKey })}
      className="h-9 min-w-28 rounded-[var(--radius-small)] border border-border-subtle bg-surface-secondary px-3 pr-8 text-xs text-main focus:outline-none focus:ring-2 focus:ring-accent"
    >
      {ADMIN_DATE_RANGE_OPTIONS.filter((option) => option.value !== "custom").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function CardLink({ href, children, ariaLabel }: { href: string; children: React.ReactNode; ariaLabel: string }) {
  return <Link href={href} aria-label={ariaLabel} className="block rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{children}</Link>;
}

function smoothLine(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return path;
}

function TrendChart({ data, format, metric }: { data: ChartPoint[]; format: "currency" | "number"; metric: ChartMetric }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 820;
  const height = 300;
  const pad = { left: 48, right: 20, top: 22, bottom: 38 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxValue = Math.max(1, ...data.map((point) => Number(point.value || 0)));
  const points = data.map((point, index) => ({
    x: pad.left + (data.length <= 1 ? plotW / 2 : (index / (data.length - 1)) * plotW),
    y: pad.top + plotH - (Number(point.value || 0) / maxValue) * plotH,
  }));
  const line = smoothLine(points);
  const area = points.length ? `${line} L ${points[points.length - 1].x} ${pad.top + plotH} L ${points[0].x} ${pad.top + plotH} Z` : "";
  const activePoint = activeIndex == null ? null : points[activeIndex];
  const activeData = activeIndex == null ? null : data[activeIndex];

  const setNearest = (clientX: number, currentTarget: SVGSVGElement) => {
    if (!data.length) return;
    const rect = currentTarget.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / Math.max(1, rect.width)) * width;
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    points.forEach((point, index) => {
      const next = Math.abs(point.x - svgX);
      if (next < distance) { best = index; distance = next; }
    });
    setActiveIndex(best);
  };

  if (!data.length) return <div className="flex h-64 items-center justify-center text-xs text-subtle">Bu görünüm için grafik verisi yok.</div>;

  const activeValue = activeData
    ? format === "currency" ? money(activeData.value, 2) : Number(activeData.value || 0).toLocaleString("tr-TR")
    : "";
  const tooltipWidth = 160;
  const tooltipX = activePoint ? Math.max(8, Math.min(width - tooltipWidth - 8, activePoint.x - tooltipWidth / 2)) : 0;
  const tooltipY = activePoint ? Math.max(8, activePoint.y - 68) : 0;

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto min-h-[240px] w-full touch-pan-y select-none"
        onPointerMove={(event) => setNearest(event.clientX, event.currentTarget)}
        onPointerDown={(event) => setNearest(event.clientX, event.currentTarget)}
        onPointerLeave={() => setActiveIndex(null)}
        aria-label="Etkileşimli satış trendi grafiği"
      >
        <defs>
          <linearGradient id="ruth-sales-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--accent) / 0.2)" />
            <stop offset="100%" stopColor="hsl(var(--accent) / 0.01)" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = pad.top + plotH * ratio;
          const value = maxValue * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="hsl(var(--border-subtle))" strokeDasharray="3 4" />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fontSize="9" fill="hsl(var(--text-subtle))">{format === "currency" ? money(value) : Math.round(value).toLocaleString("tr-TR")}</text>
            </g>
          );
        })}
        {area ? <motion.path d={area} fill="url(#ruth-sales-fill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45 }} /> : null}
        {line ? <motion.path d={line} fill="none" stroke="hsl(var(--accent))" strokeWidth="2.5" strokeLinecap="round" initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} /> : null}
        {data.map((point, index) => {
          const pos = points[index];
          const step = Math.max(1, Math.ceil(data.length / 8));
          const show = index % step === 0 || index === data.length - 1;
          return show ? <text key={point.key} x={pos.x} y={height - 13} textAnchor="middle" fontSize="9" fill="hsl(var(--text-subtle))">{point.label}</text> : null;
        })}
        {activePoint && activeData ? (
          <g className="pointer-events-none">
            <line x1={activePoint.x} x2={activePoint.x} y1={pad.top} y2={pad.top + plotH} stroke="hsl(var(--text-main) / 0.18)" />
            <circle cx={activePoint.x} cy={activePoint.y} r="5" fill="hsl(var(--surface-primary))" stroke="hsl(var(--accent))" strokeWidth="3" />
            <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height="52" rx="10" fill="hsl(var(--surface-primary))" stroke="hsl(var(--border-subtle))" />
            <text x={tooltipX + 12} y={tooltipY + 19} fontSize="9" fill="hsl(var(--text-subtle))">{activeData.label}</text>
            <text x={tooltipX + 12} y={tooltipY + 38} fontSize="12" fontWeight="700" fill="hsl(var(--text-main))">
              {metric === "sales" ? `${activeValue} · ${Number(activeData.secondary || 0).toLocaleString("tr-TR")} sipariş` : `${activeValue} ${metric === "sessions" ? "oturum" : "sepet"}`}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

type DonutItem = { key: string; label: string; value: number; stroke: string };

function SessionDonut({ summary, onClose }: { summary: NonNullable<DashboardState["summary"]>; onClose: () => void }) {
  const conversion = summary.conversion || {};
  const sessions = Math.max(0, Number(conversion.sessions ?? summary.sessions ?? 0));
  const carts = Math.min(sessions, Math.max(0, Number(conversion.carts ?? summary.carts ?? 0)));
  const checkout = Math.min(carts, Math.max(0, Number(conversion.checkoutReached ?? summary.checkoutReached ?? 0)));
  const purchases = Math.min(checkout, Math.max(0, Number(conversion.paidOrders ?? summary.orders ?? 0)));
  const items: DonutItem[] = [
    { key: "browse", label: "Sadece gezinen", value: Math.max(0, sessions - carts), stroke: "hsl(var(--accent))" },
    { key: "cart", label: "Sepette kalan", value: Math.max(0, carts - checkout), stroke: "hsl(var(--info))" },
    { key: "checkout", label: "Ödemeye geçen", value: Math.max(0, checkout - purchases), stroke: "hsl(var(--warning))" },
    { key: "purchase", label: "Satın alan", value: purchases, stroke: "hsl(var(--success))" },
  ].filter((item) => item.value > 0);
  const total = Math.max(1, items.reduce((sum, item) => sum + item.value, 0));
  const [active, setActive] = useState<string | null>(items[0]?.key || null);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offsetRatio = 0;
  const activeItem = items.find((item) => item.key === active) || items[0];

  return (
    <motion.div initial={{ opacity: 0, x: 20, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.97 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
      <ExactDataCard title="Oturum Akışı" action={<button type="button" onClick={onClose} className="text-[10px] font-semibold text-accent">Kapat</button>}>
        <div className="relative mx-auto h-44 w-44">
          <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" aria-label="Oturum akışı halka grafiği">
            <circle cx="80" cy="80" r={radius} fill="none" stroke="hsl(var(--surface-tertiary))" strokeWidth="20" />
            {items.map((item) => {
              const ratio = item.value / total;
              const length = Math.max(0, circumference * ratio - 3);
              const dashOffset = -circumference * offsetRatio;
              offsetRatio += ratio;
              return (
                <motion.circle
                  key={item.key}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke={item.stroke}
                  strokeWidth={active === item.key ? 24 : 20}
                  strokeLinecap="butt"
                  strokeDasharray={`${length} ${Math.max(0, circumference - length)}`}
                  strokeDashoffset={dashOffset}
                  className="cursor-pointer transition-[stroke-width] duration-200"
                  initial={{ opacity: 0, pathLength: 0 }}
                  animate={{ opacity: active && active !== item.key ? 0.62 : 1, pathLength: 1 }}
                  transition={{ duration: 0.5 }}
                  onPointerEnter={() => setActive(item.key)}
                  onPointerDown={() => setActive(item.key)}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] text-subtle">Toplam</span>
            <strong className="text-xl text-main">{sessions.toLocaleString("tr-TR")}</strong>
            <span className="text-[9px] text-muted">oturum</span>
          </div>
          {activeItem ? (
            <motion.div key={activeItem.key} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="pointer-events-none absolute right-[-8px] top-4 rounded-lg border border-border-subtle bg-surface-primary px-2.5 py-2 shadow-floating">
              <p className="text-[9px] font-semibold text-main">{activeItem.label}: {activeItem.value.toLocaleString("tr-TR")}</p>
            </motion.div>
          ) : null}
        </div>
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <button key={item.key} type="button" onMouseEnter={() => setActive(item.key)} onClick={() => setActive(item.key)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${active === item.key ? "bg-surface-secondary" : ""}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.stroke }} />
              <span className="flex-1 text-[10px] text-muted">{item.label}</span>
              <span className="text-[10px] font-semibold text-main">{item.value.toLocaleString("tr-TR")} · %{Math.round((item.value / total) * 100)}</span>
            </button>
          ))}
        </div>
      </ExactDataCard>
    </motion.div>
  );
}

function ConversionCard({ summary }: { summary: NonNullable<DashboardState["summary"]> }) {
  const [open, setOpen] = useState(false);
  const conversion = summary.conversion || {};
  const stages = [
    { label: "Sepete ekleme", value: Number(conversion.cartRate || 0), count: Number(conversion.carts || summary.carts || 0) },
    { label: "Ödemeye geçiş", value: Number(conversion.checkoutRate || 0), count: Number(conversion.checkoutReached || summary.checkoutReached || 0) },
    { label: "Satın alma", value: Number(conversion.purchaseRate ?? summary.conversionRate ?? 0), count: Number(conversion.paidOrders || summary.orders || 0) },
  ];
  return (
    <div className="lg:col-span-2">
      <button type="button" onClick={() => setOpen((value) => !value)} className="block w-full text-left rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <ExactMetricCard label="Dönüşüm" value={Number(summary.conversionRate || 0)} format="percent" icon={Percent} className={open ? "ring-2 ring-accent/40" : ""} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0, y: -6 }} animate={{ height: "auto", opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="mt-2 rounded-[var(--radius-card)] bg-surface-primary p-4 shadow-card">
              <div className="space-y-3">
                {stages.map((stage) => (
                  <div key={stage.label}>
                    <div className="mb-1 flex items-center justify-between text-[10px]"><span className="font-medium text-muted">{stage.label}</span><span className="font-semibold text-main">{stage.count.toLocaleString("tr-TR")} · %{stage.value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-tertiary"><motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, stage.value))}%` }} transition={{ duration: 0.45 }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function ExactOverviewDashboardV2() {
  const [range, setRange] = useState<AdminDateRangeValue>({ range: "today", from: "", to: "" });
  const [data, setData] = useState<DashboardState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const [metric, setMetric] = useState<ChartMetric>("sales");
  const [period, setPeriod] = useState<ChartPeriod>("weekly");
  const [chart, setChart] = useState<{ format: "currency" | "number"; series: ChartPoint[] }>({ format: "currency", series: [] });
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const chartSeq = useRef(0);
  const [sessionOpen, setSessionOpen] = useState(false);

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const sequence = ++requestSeq.current;
    if (!silent) setLoading(true);
    try {
      const selectedRange = dateRangeParam(range);
      const [summary, catalog] = await Promise.all([
        adminRequest<DashboardPayload>(`/api/summary?range=${encodeURIComponent(selectedRange)}`, { force: silent, ttlMs: 20_000, staleMs: 5 * 60_000 }),
        adminRequest<CatalogCounts>("/api/dashboard/catalog-counts", { force: silent, ttlMs: 20_000, staleMs: 5 * 60_000 }),
      ]);
      if (sequence !== requestSeq.current) return;
      setData({
        summary: { ...emptyState.summary, ...(summary.summary || {}) },
        recentOrders: summary.recentOrders || [],
        operationCounts: { ...emptyState.operationCounts, ...(summary.operationCounts || {}) },
        openReturns: Number(summary.openReturns || 0),
        catalog: { products: Number(catalog.products ?? summary.summary?.products ?? 0), variants: Number(catalog.variants || 0) },
      });
      setError(null);
    } catch (caught) {
      if (sequence === requestSeq.current) setError(caught instanceof Error ? caught.message : "Kontrol merkezi verileri alınamadı.");
    } finally {
      if (sequence === requestSeq.current) setLoading(false);
    }
  }, [range]);

  const loadChart = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const sequence = ++chartSeq.current;
    if (!silent) setChartLoading(true);
    try {
      const result = await adminRequest<ChartPayload>(`/api/dashboard/sales-series?metric=${encodeURIComponent(metric)}&period=${encodeURIComponent(period)}`, { force: silent, ttlMs: 20_000, staleMs: 5 * 60_000 });
      if (sequence !== chartSeq.current) return;
      setChart({ format: result.format === "number" ? "number" : "currency", series: result.series || [] });
      setChartError(null);
    } catch (caught) {
      if (sequence === chartSeq.current) setChartError(caught instanceof Error ? caught.message : "Grafik verisi alınamadı.");
    } finally {
      if (sequence === chartSeq.current) setChartLoading(false);
    }
  }, [metric, period]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadChart(); }, [loadChart]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load({ silent: true });
      void loadChart({ silent: true });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load, loadChart]);

  const summary = data.summary;
  const averageOrder = Number(summary.orders || 0) > 0 ? Number(summary.revenue || 0) / Number(summary.orders || 1) : 0;
  const operationRows = [
    { label: "Yeni sipariş", value: Number(data.operationCounts.newOrders || 0), href: "/orders" },
    { label: "Hazırlanıyor", value: Number(data.operationCounts.preparing || 0), href: "/orders" },
    { label: "Kargoya hazır", value: Number(data.operationCounts.ready || 0), href: "/orders" },
    { label: "Kontrol gerekli", value: Number(data.operationCounts.shippingAttention || 0), href: "/shipping" },
  ];

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="overview-v2">
      <ExactPageHeader title="Kontrol Merkezi" subtitle="Canlı mağaza özeti" actions={<RangeSelect value={range} onChange={setRange} />} />
      {error ? <div className="rounded-[var(--radius-small)] bg-danger-soft p-3 text-xs text-danger-foreground">{error}</div> : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><ExactSkeleton className="h-28" /><ExactSkeleton className="h-28" /><ExactSkeleton className="h-28" /><ExactSkeleton className="h-28" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="col-span-2"><ExactMetricCard label="Net Satış" value={Number(summary.revenue || 0)} format="currency" icon={CircleDollarSign} accent /></div>
            <button type="button" onClick={() => setSessionOpen((value) => !value)} className="text-left rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><ExactMetricCard label="Oturum" value={Number(summary.sessions || 0)} icon={UsersRound} className={sessionOpen ? "ring-2 ring-accent/40" : ""} /></button>
            <CardLink href="/orders" ariaLabel="Siparişleri aç"><ExactMetricCard label="Sipariş" value={Number(summary.orders || 0)} icon={ShoppingBag} /></CardLink>
            <ExactMetricCard label="Sepet" value={Number(summary.carts || 0)} icon={ShoppingCart} />
            <CardLink href="/returns" ariaLabel="İade ve değişimleri aç"><ExactMetricCard label="İade" value={Number(summary.returns || 0)} icon={RotateCcw} /></CardLink>
            <ConversionCard summary={summary} />
            <CardLink href="/products" ariaLabel="Ürünleri aç"><ExactMetricCard label="Toplam Ürün" value={data.catalog.products} icon={Package} suffix={` · ${data.catalog.variants.toLocaleString("tr-TR")} varyant`} /></CardLink>
            <CardLink href="/orders" ariaLabel="Sipariş sepet ortalamasını aç"><ExactMetricCard label="Ortalama Sepet" value={averageOrder} format="currency" icon={ShoppingBag} /></CardLink>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <ExactDataCard
              className="lg:col-span-2"
              title="Satış Trendi"
              action={(
                <div className="flex gap-2">
                  <select aria-label="Grafik verisi" value={metric} onChange={(event) => setMetric(event.target.value as ChartMetric)} className="h-8 rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[10px] text-main">{metricOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  <select aria-label="Grafik tarih görünümü" value={period} onChange={(event) => setPeriod(event.target.value as ChartPeriod)} className="h-8 rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[10px] text-main">{periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                </div>
              )}
            >
              {chartError ? <div className="mb-2 rounded-lg bg-danger-soft p-2 text-[10px] text-danger-foreground">{chartError}</div> : null}
              {chartLoading && !chart.series.length ? <ExactSkeleton className="h-64" /> : <TrendChart data={chart.series} format={chart.format} metric={metric} />}
            </ExactDataCard>

            <AnimatePresence mode="wait" initial={false}>
              {sessionOpen ? (
                <SessionDonut key="session-donut" summary={summary} onClose={() => setSessionOpen(false)} />
              ) : (
                <motion.div key="order-status" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.22 }}>
                  <ExactDataCard title="Sipariş Durumu" action={<Truck className="h-4 w-4 text-accent" />}>
                    <div className="space-y-2">
                      {operationRows.map((row) => <Link key={row.label} href={row.href} className="flex items-center justify-between rounded-lg bg-surface-secondary px-3 py-2.5 transition-colors hover:bg-accent-soft"><span className="text-xs text-muted">{row.label}</span><strong className="text-sm text-main">{row.value.toLocaleString("tr-TR")}</strong></Link>)}
                    </div>
                  </ExactDataCard>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <ExactDataCard title="Son Siparişler" className="lg:col-span-2">
              {!data.recentOrders.length ? <div className="py-8 text-center text-xs text-subtle">Henüz sipariş yok.</div> : <div className="divide-y divide-border-subtle">{data.recentOrders.slice(0, 6).map((order) => { const status = statusPresentation(order); return <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center gap-3 py-3 transition-colors hover:bg-surface-secondary/60"><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-main">#{order.order_no} · {order.customer_name}</p><p className="mt-0.5 text-[10px] text-subtle">{shortDate(order.created_at)}</p></div><ExactStatusBadge status={order.status} label={status.label} tone={status.tone} size="sm" /><strong className="text-xs text-main">{money(order.total_amount, 2)}</strong></Link>; })}</div>}
              <Link href="/orders" className="mt-3 flex items-center justify-center gap-1 text-[10px] font-semibold text-accent">Tüm siparişleri aç <ArrowRight className="h-3.5 w-3.5" /></Link>
            </ExactDataCard>

            <ExactDataCard title="İşlem Gerektirenler" action={<AlertCircle className="h-4 w-4 text-warning-foreground" />}>
              <div className="space-y-2">
                <Link href="/shipping" className="flex items-center justify-between rounded-lg bg-surface-secondary px-3 py-2.5"><span className="text-xs text-muted">Kargo kontrolü</span><strong className="text-sm text-main">{Number(data.operationCounts.shippingAttention || 0)}</strong></Link>
                <Link href="/returns" className="flex items-center justify-between rounded-lg bg-surface-secondary px-3 py-2.5"><span className="text-xs text-muted">Açık iade/değişim</span><strong className="text-sm text-main">{data.openReturns}</strong></Link>
                <Link href="/products" className="flex items-center justify-between rounded-lg bg-surface-secondary px-3 py-2.5"><span className="text-xs text-muted">Aktif ürünler</span><strong className="text-sm text-main">{data.catalog.products}</strong></Link>
              </div>
              <Link href="/analytics" className="mt-3 block"><ExactButton variant="secondary" size="sm" className="w-full">Analitiği Aç <ArrowRight className="h-3.5 w-3.5" /></ExactButton></Link>
            </ExactDataCard>
          </div>
        </>
      )}
    </div>
  );
}
