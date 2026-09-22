"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  type LucideIcon,
} from "lucide-react";
import { usePressable } from "@ruth-commerce/ui";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { adminRequest } from "@/lib/adminApi";
import { RuthieBrandIcon } from "@/components/RuthieBrandIcon";
import { ADMIN_DATE_RANGE_OPTIONS, dateRangeParam, type AdminDateRangeKey, type AdminDateRangeValue } from "@/components/DateRangeControl";
import { ExactButton, ExactPageHeader, ExactSkeleton, ExactStatusBadge, exactCx } from "./primitives";
import { ExactDataCard, ExactMetricCard } from "./data";
import { ExactSelect } from "./ExactSelect";
import { ExactRuthieInsightPopup, type RuthieInsightAutoPrompt } from "./ExactRuthieInsightPopup";

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
type Conversion = {
  cartRate?: number;
  checkoutRate?: number;
  purchaseRate?: number;
  carts?: number;
  checkoutReached?: number;
  paidOrders?: number;
  sessions?: number;
};
type SummaryPayload = {
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
    conversion?: Conversion;
  };
  recentOrders?: Order[];
  operationCounts?: { newOrders?: number; preparing?: number; ready?: number; shippingAttention?: number };
  openReturns?: number;
};
type SessionSource = { key: string; name: string; value: number; percent: number };
type SessionSourcesPayload = { total?: number; sources?: SessionSource[] };
type ChartMetric = "sales" | "sessions" | "carts";
type ChartPeriod = "daily" | "weekly" | "monthly" | "yearly";
type ChartPoint = { key: string; label: string; value: number; secondary?: number };
type ChartPayload = { format?: "currency" | "number"; series?: ChartPoint[] };
type State = {
  summary: NonNullable<SummaryPayload["summary"]>;
  recentOrders: Order[];
  operations: NonNullable<SummaryPayload["operationCounts"]>;
  openReturns: number;
  products: number;
  variants: number;
  sessionSources: SessionSource[];
  sourceSessionTotal: number;
};

const EMPTY: State = {
  summary: { orders: 0, paidOrders: 0, revenue: 0, sessions: 0, carts: 0, checkoutReached: 0, returns: 0, products: 0, conversionRate: 0, conversion: {} },
  recentOrders: [],
  operations: { newOrders: 0, preparing: 0, ready: 0, shippingAttention: 0 },
  openReturns: 0,
  products: 0,
  variants: 0,
  sessionSources: [],
  sourceSessionTotal: 0,
};
const METRIC_OPTIONS = [{ value: "sales", label: "Satış" }, { value: "sessions", label: "Oturum" }, { value: "carts", label: "Sepet" }];
const PERIOD_OPTIONS = [{ value: "daily", label: "Günlük" }, { value: "weekly", label: "Haftalık" }, { value: "monthly", label: "Aylık" }, { value: "yearly", label: "Yıllık" }];
const INSIGHT_QUESTIONS = [
  { label: "Siparişleri özetle", text: "Bu dönem için siparişleri özetle. Önemli veya dikkat gerektiren siparişleri belirt." },
  { label: "Ödemeleri kontrol et", text: "Bu dönem için ödemeleri kontrol et. Başarısız veya bekleyen işlemleri özetle." },
  { label: "Kargo sorunlarını bul", text: "Bu dönem için kargo sorunlarını bul. Önce müdahale etmem gerekenleri sırala." },
];
const SOURCE_COLORS: Record<string, string> = {
  instagram: "#B9563D",
  facebook: "#2B1B16",
  tiktok: "#111111",
  google_ads: "#AAA8A1",
  organic: "#6F725B",
  direct: "#B9563D",
  referral: "#2B1B16",
  email: "#6F725B",
  other: "#AAA8A1",
};

function money(value: number, digits = 0) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: digits }).format(Number(value || 0));
}
function number(value: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Number(value || 0));
}
function percent(value: number) {
  return `${Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`;
}
function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}
function orderStatus(order: Order) {
  const status = String(order.status || "").toLowerCase();
  if (["delivered", "completed", "fulfilled"].includes(status)) return { label: "Teslim edildi", tone: "success" as const };
  if (["shipped", "in_transit", "out_for_delivery"].includes(status)) return { label: "Gönderildi", tone: "accent" as const };
  if (["ready", "ready_to_ship", "prepared"].includes(status)) return { label: "Kargoya hazır", tone: "accent" as const };
  if (["preparing", "in_production", "processing", "queued"].includes(status)) return { label: "Hazırlanıyor", tone: "info" as const };
  if (["failed", "rejected"].includes(String(order.payment_status || "").toLowerCase()) || order.shipping_error) return { label: "Kontrol gerekli", tone: "danger" as const };
  return { label: "Yeni", tone: "info" as const };
}

function DashboardPressSurface({ ariaLabel, onActivate, children, className }: { ariaLabel: string; onActivate: () => void; children: ReactNode; className?: string }) {
  const { pressableProps } = usePressable<HTMLDivElement>();
  const { onKeyDown: onPressKeyDown, ...pressProps } = pressableProps;
  return (
    <div
      {...pressProps}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      data-ruth-press-strength="subtle"
      data-ruth-hover-lift="false"
      onClick={onActivate}
      onKeyDown={(event) => {
        onPressKeyDown?.(event);
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      className={exactCx("ruth-pressable cursor-pointer rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background", className)}
    >
      {children}
    </div>
  );
}

function DashboardMetricTile({
  label,
  value,
  icon: Icon,
  format = "number",
  secondary,
  expanded = false,
  details,
  onActivate,
  ariaLabel,
  className,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  format?: "number" | "currency" | "percent";
  secondary?: ReactNode;
  expanded?: boolean;
  details?: ReactNode;
  onActivate: () => void;
  ariaLabel: string;
  className?: string;
}) {
  const display = format === "currency" ? money(value) : format === "percent" ? percent(value) : number(value);
  return (
    <DashboardPressSurface ariaLabel={ariaLabel} onActivate={onActivate} className={className}>
      <motion.article
        layout
        transition={{ layout: { duration: .38, ease: [0.22, 1, 0.36, 1] } }}
        className={exactCx(
          "relative min-h-[132px] overflow-hidden rounded-[var(--radius-card)] bg-surface-primary p-4 shadow-card",
          expanded ? "ring-1 ring-accent/25" : "",
        )}
      >
        <div className="flex min-h-[100px] flex-col">
          <div className="mb-3 flex items-start justify-between gap-2">
            <span className="ruth-type-label text-muted">{label}</span>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-small)] bg-accent-soft text-accent"><Icon className="h-3.5 w-3.5" /></div>
          </div>
          <div className="ruth-type-metric text-main">{display}</div>
          {secondary ? <div className="mt-auto pt-2">{secondary}</div> : null}
        </div>
        <AnimatePresence initial={false}>
          {expanded && details ? (
            <motion.div
              key="expanded"
              initial={{ height: 0, opacity: 0, y: -8 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -6 }}
              transition={{ height: { duration: .38, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: .22 }, y: { duration: .32, ease: [0.22, 1, 0.36, 1] } }}
              className="overflow-hidden"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="mt-3 border-t border-border-subtle pt-4">{details}</div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.article>
    </DashboardPressSurface>
  );
}

function useLiveVisitors() {
  const [activeVisitors, setActiveVisitors] = useState(0);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const load = async () => {
      const request = ++sequence;
      try {
        const result = await adminRequest<{ activeVisitors?: number }>("/api/dashboard/live-visitors", { hardRefresh: true, ttlMs: 0, staleMs: 0 });
        if (active && request === sequence) setActiveVisitors(Math.max(0, Number(result.activeVisitors || 0)));
      } catch {}
    };
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      sequence += 1;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return activeVisitors;
}

function SessionSourceRing({ sources, total }: { sources: SessionSource[]; total: number }) {
  const circumference = 2 * Math.PI * 48;
  let offset = 0;
  if (!sources.length || total <= 0) {
    return (
      <div className="flex min-h-[170px] items-center justify-center rounded-[var(--radius-small)] bg-surface-secondary px-5 text-center text-[11px] leading-5 text-muted">
        Bu tarih aralığında kaynak bilgisi olan oturum bulunmuyor.
      </div>
    );
  }

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
      <div className="relative mx-auto h-[152px] w-[152px] max-w-full overflow-hidden">
        <svg viewBox="0 0 140 140" className="h-full w-full" aria-label="Oturum kaynakları halka grafiği">
          <circle cx="70" cy="70" r="48" fill="none" stroke="hsl(var(--surface-tertiary))" strokeWidth="15" />
          {sources.map((source, index) => {
            const ratio = Math.max(0, source.value) / Math.max(1, total);
            const length = Math.max(0, circumference * ratio - 2.4);
            const dashOffset = -circumference * offset;
            offset += ratio;
            return (
              <motion.circle
                key={source.key}
                cx="70"
                cy="70"
                r="48"
                fill="none"
                stroke={SOURCE_COLORS[source.key] || SOURCE_COLORS.other}
                strokeWidth="15"
                strokeLinecap="round"
                strokeDasharray={`${length} ${Math.max(0, circumference - length)}`}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 70 70)"
                initial={{ opacity: 0, pathLength: 0 }}
                animate={{ opacity: 1, pathLength: 1 }}
                transition={{ duration: .55, delay: index * .035, ease: [0.22, 1, 0.36, 1] }}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <strong className="text-xl font-bold text-main">{number(total)}</strong>
          <span className="mt-0.5 text-[9px] font-medium text-muted">oturum</span>
        </div>
      </div>
      <div className="grid min-w-0 gap-2">
        {sources.map((source) => (
          <div key={source.key} className="flex min-w-0 items-center gap-2 rounded-[var(--radius-small)] bg-surface-secondary px-3 py-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SOURCE_COLORS[source.key] || SOURCE_COLORS.other }} />
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-main">{source.name}</span>
            <span className="shrink-0 text-[10px] text-muted">{number(source.value)} · {percent(source.percent)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConversionExpansion({ summary }: { summary: State["summary"] }) {
  const conversion = summary.conversion || {};
  const sessions = Math.max(0, Number(conversion.sessions ?? summary.sessions ?? 0));
  const steps = [
    { label: "Sepete ekleme", rate: Number(conversion.cartRate || 0), value: Number(conversion.carts ?? summary.carts ?? 0) },
    { label: "Ödemeye geçiş", rate: Number(conversion.checkoutRate || 0), value: Number(conversion.checkoutReached ?? summary.checkoutReached ?? 0) },
    { label: "Satın alma", rate: Number(conversion.purchaseRate ?? summary.conversionRate ?? 0), value: Number(conversion.paidOrders ?? summary.orders ?? 0) },
  ];
  return (
    <div className="pb-1">
      <div className="grid gap-2 sm:grid-cols-3">
        {steps.map((step) => (
          <div key={step.label} className="rounded-[var(--radius-small)] bg-surface-secondary p-3.5">
            <p className="text-[10px] font-semibold text-muted">{step.label}</p>
            <div className="mt-2 flex items-end justify-between gap-2">
              <strong className="text-xl font-bold text-main">{percent(step.rate)}</strong>
              <span className="pb-0.5 text-[10px] text-subtle">{number(step.value)} oturum</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-tertiary">
              <motion.div
                className="h-full rounded-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(0, Math.min(100, step.rate))}%` }}
                transition={{ duration: .55, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-[var(--radius-small)] border border-border-subtle px-3.5 py-3 text-[10px] text-muted">
        <span>Dönüşüm tabanı</span>
        <strong className="text-main">{number(sessions)} oturum</strong>
      </div>
    </div>
  );
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    path += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return path;
}

function TrendChart({ data, format, metric }: { data: ChartPoint[]; format: "currency" | "number"; metric: ChartMetric }) {
  const [active, setActive] = useState<number | null>(null);
  const width = 820, height = 300, left = 48, right = 20, top = 22, bottom = 38;
  const plotW = width - left - right, plotH = height - top - bottom;
  const max = Math.max(1, ...data.map((item) => Number(item.value || 0)));
  const points = data.map((item, index) => ({ x: left + (data.length <= 1 ? plotW / 2 : index / (data.length - 1) * plotW), y: top + plotH - Number(item.value || 0) / max * plotH }));
  if (!data.length) return <div className="flex h-64 items-center justify-center text-xs text-subtle">Bu görünüm için grafik verisi yok.</div>;
  const line = smoothPath(points);
  const finalPoint = points[points.length - 1];
  const area = `${line} L ${finalPoint.x} ${top + plotH} L ${points[0].x} ${top + plotH} Z`;
  const pick = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect();
    const x = (clientX - rect.left) / Math.max(1, rect.width) * width;
    let best = 0;
    points.forEach((point, index) => { if (Math.abs(point.x - x) < Math.abs(points[best].x - x)) best = index; });
    setActive(best);
  };
  const point = active == null ? null : points[active];
  const row = active == null ? null : data[active];
  const tooltipX = point ? Math.max(8, Math.min(width - 168, point.x - 80)) : 0;
  const tooltipY = point ? Math.max(8, point.y - 68) : 0;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="min-h-[240px] w-full touch-pan-y select-none" onPointerMove={(event) => pick(event.clientX, event.currentTarget)} onPointerDown={(event) => pick(event.clientX, event.currentTarget)} onPointerLeave={() => setActive(null)} aria-label="Etkileşimli satış trendi">
      <defs><linearGradient id="dashboard-v4-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="hsl(var(--accent) / .2)" /><stop offset="100%" stopColor="hsl(var(--accent) / .01)" /></linearGradient></defs>
      {[0, .25, .5, .75, 1].map((ratio) => { const y = top + plotH * ratio; return <g key={ratio}><line x1={left} x2={width - right} y1={y} y2={y} stroke="hsl(var(--border-subtle))" strokeDasharray="3 4" /><text x={left - 8} y={y + 3} textAnchor="end" fontSize="9" fill="hsl(var(--text-subtle))">{format === "currency" ? money(max * (1 - ratio)) : Math.round(max * (1 - ratio)).toLocaleString("tr-TR")}</text></g>; })}
      <motion.path d={area} fill="url(#dashboard-v4-fill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .35 }} />
      <motion.path d={line} fill="none" stroke="hsl(var(--accent))" strokeWidth="2.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .65, ease: [0.22, 1, 0.36, 1] }} />
      {data.map((item, index) => (index % Math.max(1, Math.ceil(data.length / 8)) === 0 || index === data.length - 1) ? <text key={item.key} x={points[index].x} y={height - 13} textAnchor="middle" fontSize="9" fill="hsl(var(--text-subtle))">{item.label}</text> : null)}
      {point && row ? <g className="pointer-events-none"><line x1={point.x} x2={point.x} y1={top} y2={top + plotH} stroke="hsl(var(--text-main) / .18)" /><circle cx={point.x} cy={point.y} r="5" fill="hsl(var(--surface-primary))" stroke="hsl(var(--accent))" strokeWidth="3" /><rect x={tooltipX} y={tooltipY} width="160" height="52" rx="10" fill="hsl(var(--surface-primary))" stroke="hsl(var(--border-subtle))" /><text x={tooltipX + 12} y={tooltipY + 19} fontSize="9" fill="hsl(var(--text-subtle))">{row.label}</text><text x={tooltipX + 12} y={tooltipY + 38} fontSize="12" fontWeight="700" fill="hsl(var(--text-main))">{format === "currency" ? money(row.value, 2) : row.value.toLocaleString("tr-TR")}{metric === "sales" ? ` · ${Number(row.secondary || 0)} sipariş` : ""}</text></g> : null}
    </svg>
  );
}

export function ExactOverviewDashboardV4() {
  const router = useRouter();
  const [range, setRange] = useState<AdminDateRangeValue>({ range: "today", from: "", to: "" });
  const [state, setState] = useState<State>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const [metric, setMetric] = useState<ChartMetric>("sales");
  const [period, setPeriod] = useState<ChartPeriod>("weekly");
  const [chart, setChart] = useState<{ format: "currency" | "number"; series: ChartPoint[] }>({ format: "currency", series: [] });
  const [chartLoading, setChartLoading] = useState(true);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [ruthieOpen, setROSTAOpen] = useState(false);
  const [autoPrompt, setAutoPrompt] = useState<RuthieInsightAutoPrompt | null>(null);
  const activeVisitors = useLiveVisitors();

  const load = useCallback(async (silent = false) => {
    const request = ++requestRef.current;
    if (!silent) setLoading(true);
    try {
      const selected = dateRangeParam(range);
      const [summary, catalog, sourceResult] = await Promise.all([
        adminRequest<SummaryPayload>(`/api/summary?range=${encodeURIComponent(selected)}`, { force: silent, ttlMs: 20_000, staleMs: 5 * 60_000 }),
        adminRequest<{ products?: number; variants?: number }>("/api/dashboard/catalog-counts", { force: silent, ttlMs: 20_000, staleMs: 5 * 60_000 }),
        adminRequest<SessionSourcesPayload>(`/api/dashboard/session-sources?range=${encodeURIComponent(selected)}`, { force: silent, ttlMs: 20_000, staleMs: 5 * 60_000 }).catch(() => ({ total: 0, sources: [] })),
      ]);
      if (request !== requestRef.current) return;
      setState({
        summary: { ...EMPTY.summary, ...(summary.summary || {}) },
        recentOrders: summary.recentOrders || [],
        operations: { ...EMPTY.operations, ...(summary.operationCounts || {}) },
        openReturns: Number(summary.openReturns || 0),
        products: Number(catalog.products ?? summary.summary?.products ?? 0),
        variants: Number(catalog.variants || 0),
        sessionSources: sourceResult.sources || [],
        sourceSessionTotal: Number(sourceResult.total || 0),
      });
      setError(null);
    } catch (caught) {
      if (request === requestRef.current) setError(caught instanceof Error ? caught.message : "Kontrol merkezi verileri alınamadı.");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [range]);

  const loadChart = useCallback(async () => {
    setChartLoading(true);
    try {
      const result = await adminRequest<ChartPayload>(`/api/dashboard/sales-series?metric=${metric}&period=${period}`, { ttlMs: 20_000, staleMs: 5 * 60_000 });
      setChart({ format: result.format === "number" ? "number" : "currency", series: result.series || [] });
    } finally { setChartLoading(false); }
  }, [metric, period]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadChart(); }, [loadChart]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const summary = state.summary;
  const averageOrder = Number(summary.orders || 0) ? Number(summary.revenue || 0) / Number(summary.orders || 1) : 0;
  const attention = Number(state.operations.shippingAttention || 0) + state.openReturns;
  const ask = (text: string) => { setAutoPrompt({ id: Date.now(), text }); setROSTAOpen(true); };
  const openROSTA = () => { setAutoPrompt(null); setROSTAOpen(true); };

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="overview-v4" data-dashboard-range={range.range}>
      <select aria-label="Tarih aralığı" value={range.range} onChange={() => undefined} className="sr-only" tabIndex={-1}>{ADMIN_DATE_RANGE_OPTIONS.filter((item) => item.value !== "custom").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <ExactPageHeader title="Kontrol Merkezi" subtitle="Canlı mağaza özeti" actions={<div className="w-36"><ExactSelect label="Tarih aralığı" value={range.range} onValueChange={(value) => setRange({ ...range, range: value as AdminDateRangeKey })} options={ADMIN_DATE_RANGE_OPTIONS.filter((item) => item.value !== "custom").map((item) => ({ value: item.value, label: item.label }))} className="h-9 rounded-[var(--radius-small)] border border-border-subtle bg-surface-secondary px-3 text-xs text-main" /></div>} />
      {error ? <div className="rounded-lg bg-danger-soft p-3 text-xs text-danger-foreground">{error}</div> : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3"><ExactSkeleton className="h-[132px]" /><ExactSkeleton className="h-[132px] lg:col-span-2" /></div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-3">
          <ExactMetricCard label="Net Satış" value={Number(summary.revenue || 0)} format="currency" icon={CircleDollarSign} accent className="h-full min-h-[132px]" />
          <DashboardPressSurface ariaLabel="ROSTA Insight sohbetini aç" onActivate={openROSTA} className="lg:col-span-2">
            <ExactDataCard className="h-full min-h-[132px] transition-shadow hover:shadow-floating">
              <div className="flex items-start gap-3"><div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-floating"><RuthieBrandIcon size={23} /><span className="absolute inset-[-3px] rounded-full border border-accent/25" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-main">ROSTA Insight</p><span className="inline-flex items-center gap-1 text-[9px] text-success-foreground"><span className="h-1.5 w-1.5 rounded-full bg-success" />hazır</span></div><p className="mt-1 text-[11px] text-muted">Bu dönemde {Number(summary.orders || 0)} sipariş ve {money(Number(summary.revenue || 0))} satış oluştu. {attention ? `${attention} işlem dikkat bekliyor.` : "Acil kontrol bekleyen işlem görünmüyor."}</p></div></div>
              <div className="mt-3 flex flex-wrap gap-2">{INSIGHT_QUESTIONS.map((question) => <button key={question.label} type="button" onClick={(event) => { event.stopPropagation(); ask(question.text); }} className="rounded-full bg-accent-soft px-3 py-1.5 text-[10px] font-medium text-accent transition-colors hover:bg-accent hover:text-white">{question.label}</button>)}</div>
            </ExactDataCard>
          </DashboardPressSurface>
        </div>
      )}

      {!loading ? (
        <>
          <div className="grid grid-cols-2 items-start gap-3">
            <DashboardMetricTile
              label="Oturum"
              value={Number(summary.sessions || 0)}
              icon={UsersRound}
              expanded={sessionsOpen}
              onActivate={() => setSessionsOpen((value) => !value)}
              ariaLabel={sessionsOpen ? "Oturum kaynaklarını kapat" : "Oturum kaynaklarını aç"}
              secondary={<div className="flex items-center gap-2 text-[11px] font-medium text-success-foreground"><span className="relative flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" /></span><span>{activeVisitors.toLocaleString("tr-TR")} kişi şu anda sitede</span></div>}
              details={<SessionSourceRing sources={state.sessionSources} total={state.sourceSessionTotal} />}
            />
            <DashboardMetricTile label="Sipariş" value={Number(summary.orders || 0)} icon={ShoppingBag} onActivate={() => router.push("/orders")} ariaLabel="Siparişleri aç" />
            <ExactMetricCard label="Sepet" value={Number(summary.carts || 0)} icon={ShoppingCart} className="min-h-[132px]" />
            <DashboardMetricTile label="İade" value={Number(summary.returns || 0)} icon={RotateCcw} onActivate={() => router.push("/returns")} ariaLabel="İadeleri aç" />

            <DashboardMetricTile
              label="Dönüşüm"
              value={Number(summary.conversionRate || 0)}
              format="percent"
              icon={Percent}
              expanded={conversionOpen}
              onActivate={() => setConversionOpen((value) => !value)}
              ariaLabel={conversionOpen ? "Dönüşüm detayını kapat" : "Dönüşüm detayını aç"}
              className="col-span-2"
              details={<ConversionExpansion summary={summary} />}
            />

            <DashboardMetricTile label="Toplam Ürün" value={state.products} icon={Package} onActivate={() => router.push("/products")} ariaLabel="Ürünleri aç" secondary={<p className="text-[11px] font-medium text-muted">{state.variants.toLocaleString("tr-TR")} toplam varyant</p>} />
            <DashboardMetricTile label="Ortalama Sepet" value={averageOrder} format="currency" icon={ShoppingBag} onActivate={() => router.push("/orders")} ariaLabel="Siparişleri aç" />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <ExactDataCard className="lg:col-span-2" title="Satış Trendi" action={<div className="flex gap-2"><div className="w-24"><ExactSelect label="Grafik verisi" value={metric} onValueChange={(value) => setMetric(value as ChartMetric)} options={METRIC_OPTIONS} className="h-8 rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[10px]" /></div><div className="w-24"><ExactSelect label="Grafik dönemi" value={period} onValueChange={(value) => setPeriod(value as ChartPeriod)} options={PERIOD_OPTIONS} className="h-8 rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[10px]" /></div></div>}>
              {chartLoading && !chart.series.length ? <ExactSkeleton className="h-64" /> : <TrendChart data={chart.series} format={chart.format} metric={metric} />}
            </ExactDataCard>
            <ExactDataCard title="Sipariş Durumu" action={<Truck className="h-4 w-4 text-accent" />}>
              <div className="space-y-2">{[
                { label: "Yeni sipariş", value: state.operations.newOrders, href: "/orders" },
                { label: "Hazırlanıyor", value: state.operations.preparing, href: "/orders" },
                { label: "Kargoya hazır", value: state.operations.ready, href: "/orders" },
                { label: "Kontrol gerekli", value: state.operations.shippingAttention, href: "/shipping" },
              ].map((row) => <Link key={row.label} href={row.href} className="ruth-pressable flex items-center justify-between rounded-lg bg-surface-secondary px-3 py-2.5 transition-colors hover:bg-accent-soft" data-ruth-press-strength="subtle"><span className="text-xs text-muted">{row.label}</span><strong className="text-sm text-main">{Number(row.value || 0)}</strong></Link>)}</div>
            </ExactDataCard>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <ExactDataCard title="Son Siparişler" className="lg:col-span-2">{state.recentOrders.length ? <div className="divide-y divide-border-subtle">{state.recentOrders.slice(0, 6).map((order) => { const presentation = orderStatus(order); return <Link key={order.id} href={`/orders/${order.id}`} className="ruth-pressable flex items-center gap-3 py-3 hover:bg-surface-secondary/60" data-ruth-press-strength="subtle"><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-main">#{order.order_no} · {order.customer_name}</p><p className="text-[10px] text-subtle">{shortDate(order.created_at)}</p></div><ExactStatusBadge status={order.status} label={presentation.label} tone={presentation.tone} size="sm" /><strong className="text-xs text-main">{money(order.total_amount, 2)}</strong></Link>; })}</div> : <p className="py-8 text-center text-xs text-subtle">Henüz sipariş yok.</p>}<Link href="/orders" className="mt-3 flex items-center justify-center gap-1 text-[10px] font-semibold text-accent">Tüm siparişleri aç <ArrowRight className="h-3.5 w-3.5" /></Link></ExactDataCard>
            <ExactDataCard title="İşlem Gerektirenler" action={<AlertCircle className="h-4 w-4 text-warning-foreground" />}><div className="space-y-2"><Link href="/shipping" className="ruth-pressable flex justify-between rounded-lg bg-surface-secondary p-3 text-xs" data-ruth-press-strength="subtle"><span>Kargo kontrolü</span><strong>{Number(state.operations.shippingAttention || 0)}</strong></Link><Link href="/returns" className="ruth-pressable flex justify-between rounded-lg bg-surface-secondary p-3 text-xs" data-ruth-press-strength="subtle"><span>Açık iade/değişim</span><strong>{state.openReturns}</strong></Link></div><Link href="/analytics" className="mt-3 block"><ExactButton variant="secondary" size="sm" className="w-full">Analitiği Aç <ArrowRight className="h-3.5 w-3.5" /></ExactButton></Link></ExactDataCard>
          </div>
        </>
      ) : null}

      <ExactRuthieInsightPopup open={ruthieOpen} onClose={() => setROSTAOpen(false)} autoPrompt={autoPrompt} />
    </div>
  );
}
