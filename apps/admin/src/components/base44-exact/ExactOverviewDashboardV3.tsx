"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, CircleDollarSign, Package, Percent, RotateCcw, ShoppingBag, ShoppingCart, Truck, UsersRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { adminRequest } from "@/lib/adminApi";
import { RuthieBrandIcon } from "@/components/RuthieBrandIcon";
import { ADMIN_DATE_RANGE_OPTIONS, dateRangeParam, type AdminDateRangeKey, type AdminDateRangeValue } from "@/components/DateRangeControl";
import { ExactButton, ExactPageHeader, ExactSkeleton, ExactStatusBadge } from "./primitives";
import { ExactDataCard, ExactMetricCard } from "./data";
import { ExactSelect } from "./ExactSelect";
import { ExactRuthieInsightPopup, type RuthieInsightAutoPrompt } from "./ExactRuthieInsightPopup";

type Order = { id: string; order_no: string; customer_name: string; total_amount: number; currency?: string; status: string; payment_status: string; created_at: string; shipping_error?: string | null };
type Conversion = { cartRate?: number; checkoutRate?: number; purchaseRate?: number; carts?: number; checkoutReached?: number; paidOrders?: number; sessions?: number };
type SummaryPayload = { summary?: { orders?: number; paidOrders?: number; revenue?: number; sessions?: number; carts?: number; checkoutReached?: number; returns?: number; products?: number; conversionRate?: number; conversion?: Conversion }; recentOrders?: Order[]; operationCounts?: { newOrders?: number; preparing?: number; ready?: number; shippingAttention?: number }; openReturns?: number };
type ChartMetric = "sales" | "sessions" | "carts";
type ChartPeriod = "daily" | "weekly" | "monthly" | "yearly";
type ChartPoint = { key: string; label: string; value: number; secondary?: number };
type ChartPayload = { format?: "currency" | "number"; series?: ChartPoint[] };
type State = { summary: NonNullable<SummaryPayload["summary"]>; recentOrders: Order[]; operations: NonNullable<SummaryPayload["operationCounts"]>; openReturns: number; products: number; variants: number };

const EMPTY: State = { summary: { orders: 0, paidOrders: 0, revenue: 0, sessions: 0, carts: 0, checkoutReached: 0, returns: 0, products: 0, conversionRate: 0, conversion: {} }, recentOrders: [], operations: { newOrders: 0, preparing: 0, ready: 0, shippingAttention: 0 }, openReturns: 0, products: 0, variants: 0 };
const METRIC_OPTIONS = [{ value: "sales", label: "Satış" }, { value: "sessions", label: "Oturum" }, { value: "carts", label: "Sepet" }];
const PERIOD_OPTIONS = [{ value: "daily", label: "Günlük" }, { value: "weekly", label: "Haftalık" }, { value: "monthly", label: "Aylık" }, { value: "yearly", label: "Yıllık" }];
const INSIGHT_QUESTIONS = [
  { label: "Siparişleri özetle", text: "Bu dönem için siparişleri özetle. Önemli veya dikkat gerektiren siparişleri belirt." },
  { label: "Ödemeleri kontrol et", text: "Bu dönem için ödemeleri kontrol et. Başarısız veya bekleyen işlemleri özetle." },
  { label: "Kargo sorunlarını bul", text: "Bu dönem için kargo sorunlarını bul. Önce müdahale etmem gerekenleri sırala." },
];

function money(value: number, digits = 0) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: digits }).format(Number(value || 0));
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
  const width = 820;
  const height = 300;
  const left = 48;
  const right = 20;
  const top = 22;
  const bottom = 38;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const max = Math.max(1, ...data.map((item) => Number(item.value || 0)));
  const points = data.map((item, index) => ({
    x: left + (data.length <= 1 ? plotW / 2 : index / (data.length - 1) * plotW),
    y: top + plotH - Number(item.value || 0) / max * plotH,
  }));
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
      <defs><linearGradient id="dashboard-v3-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="hsl(var(--accent) / .2)" /><stop offset="100%" stopColor="hsl(var(--accent) / .01)" /></linearGradient></defs>
      {[0, .25, .5, .75, 1].map((ratio) => {
        const y = top + plotH * ratio;
        return <g key={ratio}><line x1={left} x2={width - right} y1={y} y2={y} stroke="hsl(var(--border-subtle))" strokeDasharray="3 4" /><text x={left - 8} y={y + 3} textAnchor="end" fontSize="9" fill="hsl(var(--text-subtle))">{format === "currency" ? money(max * (1 - ratio)) : Math.round(max * (1 - ratio)).toLocaleString("tr-TR")}</text></g>;
      })}
      <motion.path d={area} fill="url(#dashboard-v3-fill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .35 }} />
      <motion.path d={line} fill="none" stroke="hsl(var(--accent))" strokeWidth="2.5" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .65, ease: [0.22, 1, 0.36, 1] }} />
      {data.map((item, index) => (index % Math.max(1, Math.ceil(data.length / 8)) === 0 || index === data.length - 1) ? <text key={item.key} x={points[index].x} y={height - 13} textAnchor="middle" fontSize="9" fill="hsl(var(--text-subtle))">{item.label}</text> : null)}
      {point && row ? <g className="pointer-events-none"><line x1={point.x} x2={point.x} y1={top} y2={top + plotH} stroke="hsl(var(--text-main) / .18)" /><circle cx={point.x} cy={point.y} r="5" fill="hsl(var(--surface-primary))" stroke="hsl(var(--accent))" strokeWidth="3" /><rect x={tooltipX} y={tooltipY} width="160" height="52" rx="10" fill="hsl(var(--surface-primary))" stroke="hsl(var(--border-subtle))" /><text x={tooltipX + 12} y={tooltipY + 19} fontSize="9" fill="hsl(var(--text-subtle))">{row.label}</text><text x={tooltipX + 12} y={tooltipY + 38} fontSize="12" fontWeight="700" fill="hsl(var(--text-main))">{format === "currency" ? money(row.value, 2) : row.value.toLocaleString("tr-TR")}{metric === "sales" ? ` · ${Number(row.secondary || 0)} sipariş` : ""}</text></g> : null}
    </svg>
  );
}

function ProductMetricCard({ products, variants }: { products: number; variants: number }) {
  return (
    <article className="relative overflow-hidden radius-card bg-surface-primary p-4 shadow-card transition-all duration-200 hover:shadow-card">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="ruth-type-label text-muted">Toplam Ürün</span>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center radius-small bg-accent-soft text-accent"><Package className="h-3.5 w-3.5" /></div>
      </div>
      <div className="ruth-type-metric text-main">{products.toLocaleString("tr-TR")}</div>
      <p className="mt-1.5 text-[11px] font-medium text-muted">{variants.toLocaleString("tr-TR")} toplam varyant</p>
    </article>
  );
}

function SessionDonut({ summary }: { summary: State["summary"] }) {
  const conversion = summary.conversion || {};
  const sessions = Math.max(0, Number(conversion.sessions ?? summary.sessions ?? 0));
  const carts = Math.min(sessions, Math.max(0, Number(conversion.carts ?? summary.carts ?? 0)));
  const checkout = Math.min(carts, Math.max(0, Number(conversion.checkoutReached ?? summary.checkoutReached ?? 0)));
  const purchases = Math.min(checkout, Math.max(0, Number(conversion.paidOrders ?? summary.orders ?? 0)));
  const items = [
    { label: "Sadece gezinen", value: Math.max(0, sessions - carts), stroke: "hsl(var(--accent))" },
    { label: "Sepette kalan", value: Math.max(0, carts - checkout), stroke: "hsl(var(--info))" },
    { label: "Ödemeye geçen", value: Math.max(0, checkout - purchases), stroke: "hsl(var(--warning))" },
    { label: "Satın alan", value: purchases, stroke: "hsl(var(--success))" },
  ].filter((item) => item.value > 0);
  const total = Math.max(1, items.reduce((sum, item) => sum + item.value, 0));
  const circumference = 2 * Math.PI * 58;
  const [active, setActive] = useState(0);
  let offset = 0;

  return (
    <ExactDataCard title="Oturum Akışı">
      <div className="relative mx-auto h-44 w-44">
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" aria-label="Oturum akışı halka grafiği">
          <circle cx="80" cy="80" r="58" fill="none" stroke="hsl(var(--surface-tertiary))" strokeWidth="20" />
          {items.map((item, index) => {
            const ratio = item.value / total;
            const length = Math.max(0, circumference * ratio - 3);
            const dashOffset = -circumference * offset;
            offset += ratio;
            return (
              <motion.circle
                key={item.label}
                cx="80"
                cy="80"
                r="58"
                fill="none"
                stroke={item.stroke}
                strokeWidth={active === index ? 24 : 20}
                strokeDasharray={`${length} ${Math.max(0, circumference - length)}`}
                strokeDashoffset={dashOffset}
                className="cursor-pointer transition-[stroke-width,opacity] duration-200"
                initial={{ opacity: 0, pathLength: 0 }}
                animate={{ opacity: active === index ? 1 : .72, pathLength: 1 }}
                transition={{ duration: .48, ease: [0.22, 1, 0.36, 1] }}
                onPointerEnter={() => setActive(index)}
                onPointerDown={() => setActive(index)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-[10px] text-subtle">Toplam</span><strong className="text-xl text-main">{sessions.toLocaleString("tr-TR")}</strong><span className="text-[9px] text-muted">oturum</span></div>
      </div>
      {items[active] ? <motion.div key={`${active}-${items[active].label}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 rounded-lg bg-surface-secondary p-2 text-center text-[10px] font-semibold text-main">{items[active].label}: {items[active].value.toLocaleString("tr-TR")} · %{Math.round(items[active].value / total * 100)}</motion.div> : null}
    </ExactDataCard>
  );
}

export function ExactOverviewDashboardV3() {
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
  const [ruthieOpen, setRuthieOpen] = useState(false);
  const [autoPrompt, setAutoPrompt] = useState<RuthieInsightAutoPrompt | null>(null);

  const load = useCallback(async (silent = false) => {
    const request = ++requestRef.current;
    if (!silent) setLoading(true);
    try {
      const selected = dateRangeParam(range);
      const [summary, catalog] = await Promise.all([
        adminRequest<SummaryPayload>(`/api/summary?range=${encodeURIComponent(selected)}`, { force: silent, ttlMs: 20_000, staleMs: 5 * 60_000 }),
        adminRequest<{ products?: number; variants?: number }>("/api/dashboard/catalog-counts", { force: silent, ttlMs: 20_000, staleMs: 5 * 60_000 }),
      ]);
      if (request !== requestRef.current) return;
      setState({
        summary: { ...EMPTY.summary, ...(summary.summary || {}) },
        recentOrders: summary.recentOrders || [],
        operations: { ...EMPTY.operations, ...(summary.operationCounts || {}) },
        openReturns: Number(summary.openReturns || 0),
        products: Number(catalog.products ?? summary.summary?.products ?? 0),
        variants: Number(catalog.variants || 0),
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
    } finally {
      setChartLoading(false);
    }
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
  const ask = (text: string) => { setAutoPrompt({ id: Date.now(), text }); setRuthieOpen(true); };
  const openRuthie = () => { setAutoPrompt(null); setRuthieOpen(true); };
  const onInsightKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openRuthie(); }
  };

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="overview-v3" data-dashboard-range={range.range}>
      <select aria-label="Tarih aralığı" value={range.range} onChange={() => undefined} className="sr-only" tabIndex={-1}>{ADMIN_DATE_RANGE_OPTIONS.filter((item) => item.value !== "custom").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <ExactPageHeader title="Kontrol Merkezi" subtitle="Canlı mağaza özeti" actions={<div className="w-36"><ExactSelect label="Tarih aralığı" value={range.range} onValueChange={(value) => setRange({ ...range, range: value as AdminDateRangeKey })} options={ADMIN_DATE_RANGE_OPTIONS.filter((item) => item.value !== "custom").map((item) => ({ value: item.value, label: item.label }))} className="h-9 rounded-[var(--radius-small)] border border-border-subtle bg-surface-secondary px-3 text-xs text-main" /></div>} />
      {error ? <div className="rounded-lg bg-danger-soft p-3 text-xs text-danger-foreground">{error}</div> : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3"><ExactSkeleton className="h-[146px]" /><ExactSkeleton className="h-[146px] lg:col-span-2" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <ExactMetricCard label="Net Satış" value={Number(summary.revenue || 0)} format="currency" icon={CircleDollarSign} accent />
          <div role="button" tabIndex={0} onClick={openRuthie} onKeyDown={onInsightKeyDown} className="cursor-pointer rounded-[var(--radius-card)] lg:col-span-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="Ruthie Insight sohbetini aç">
            <ExactDataCard className="h-full transition-shadow hover:shadow-floating">
              <div className="flex items-start gap-3"><div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-floating"><RuthieBrandIcon size={23} /><span className="absolute inset-[-3px] rounded-full border border-accent/25" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-main">Ruthie Insight</p><span className="inline-flex items-center gap-1 text-[9px] text-success-foreground"><span className="h-1.5 w-1.5 rounded-full bg-success" />hazır</span></div><p className="mt-1 text-[11px] text-muted">Bu dönemde {Number(summary.orders || 0)} sipariş ve {money(Number(summary.revenue || 0))} satış oluştu. {attention ? `${attention} işlem dikkat bekliyor.` : "Acil kontrol bekleyen işlem görünmüyor."}</p></div></div>
              <div className="mt-3 flex flex-wrap gap-2">{INSIGHT_QUESTIONS.map((question) => <button key={question.label} type="button" onClick={(event) => { event.stopPropagation(); ask(question.text); }} className="rounded-full bg-accent-soft px-3 py-1.5 text-[10px] font-medium text-accent transition-colors hover:bg-accent hover:text-white">{question.label}</button>)}</div>
            </ExactDataCard>
          </div>
        </div>
      )}

      {!loading ? (
        <>
          <div className="grid grid-cols-2 items-start gap-3">
            <div className="min-w-0">
              <button type="button" className="block w-full rounded-[var(--radius-card)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => setSessionsOpen((value) => !value)} aria-expanded={sessionsOpen}>
                <ExactMetricCard label="Oturum" value={Number(summary.sessions || 0)} icon={UsersRound} className={sessionsOpen ? "ring-2 ring-accent/40" : ""} />
              </button>
              <AnimatePresence initial={false}>
                {sessionsOpen ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0, y: -10, scale: .985 }}
                    animate={{ height: "auto", opacity: 1, y: 0, scale: 1 }}
                    exit={{ height: 0, opacity: 0, y: -8, scale: .985 }}
                    transition={{ height: { duration: .34, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: .22 }, y: { duration: .34, ease: [0.22, 1, 0.36, 1] }, scale: { duration: .34, ease: [0.22, 1, 0.36, 1] } }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2"><SessionDonut summary={summary} /></div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <Link href="/orders" className="block rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><ExactMetricCard label="Sipariş" value={Number(summary.orders || 0)} icon={ShoppingBag} /></Link>
            <ExactMetricCard label="Sepet" value={Number(summary.carts || 0)} icon={ShoppingCart} />
            <Link href="/returns" className="block rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><ExactMetricCard label="İade" value={Number(summary.returns || 0)} icon={RotateCcw} /></Link>

            <div className="col-span-2">
              <button type="button" className="w-full rounded-[var(--radius-card)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={() => setConversionOpen((value) => !value)} aria-expanded={conversionOpen}>
                <ExactMetricCard label="Dönüşüm" value={Number(summary.conversionRate || 0)} format="percent" icon={Percent} className={conversionOpen ? "ring-2 ring-accent/40" : ""} />
              </button>
              <AnimatePresence initial={false}>
                {conversionOpen ? <motion.div initial={{ height: 0, opacity: 0, y: -6 }} animate={{ height: "auto", opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0, y: -6 }} transition={{ duration: .28, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden"><div className="mt-2 rounded-[var(--radius-card)] bg-surface-primary p-3 shadow-card text-[10px] text-muted">Sepet %{Number(summary.conversion?.cartRate || 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} · Ödeme %{Number(summary.conversion?.checkoutRate || 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} · Satın alma %{Number(summary.conversion?.purchaseRate ?? summary.conversionRate ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</div></motion.div> : null}
              </AnimatePresence>
            </div>

            <Link href="/products" className="block rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><ProductMetricCard products={state.products} variants={state.variants} /></Link>
            <Link href="/orders" className="block rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><ExactMetricCard label="Ortalama Sepet" value={averageOrder} format="currency" icon={ShoppingBag} /></Link>
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
              ].map((row) => <Link key={row.label} href={row.href} className="flex items-center justify-between rounded-lg bg-surface-secondary px-3 py-2.5 transition-colors hover:bg-accent-soft"><span className="text-xs text-muted">{row.label}</span><strong className="text-sm text-main">{Number(row.value || 0)}</strong></Link>)}</div>
            </ExactDataCard>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <ExactDataCard title="Son Siparişler" className="lg:col-span-2">{state.recentOrders.length ? <div className="divide-y divide-border-subtle">{state.recentOrders.slice(0, 6).map((order) => { const presentation = orderStatus(order); return <Link key={order.id} href={`/orders/${order.id}`} className="flex items-center gap-3 py-3 hover:bg-surface-secondary/60"><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-main">#{order.order_no} · {order.customer_name}</p><p className="text-[10px] text-subtle">{shortDate(order.created_at)}</p></div><ExactStatusBadge status={order.status} label={presentation.label} tone={presentation.tone} size="sm" /><strong className="text-xs text-main">{money(order.total_amount, 2)}</strong></Link>; })}</div> : <p className="py-8 text-center text-xs text-subtle">Henüz sipariş yok.</p>}<Link href="/orders" className="mt-3 flex items-center justify-center gap-1 text-[10px] font-semibold text-accent">Tüm siparişleri aç <ArrowRight className="h-3.5 w-3.5" /></Link></ExactDataCard>
            <ExactDataCard title="İşlem Gerektirenler" action={<AlertCircle className="h-4 w-4 text-warning-foreground" />}><div className="space-y-2"><Link href="/shipping" className="flex justify-between rounded-lg bg-surface-secondary p-3 text-xs"><span>Kargo kontrolü</span><strong>{Number(state.operations.shippingAttention || 0)}</strong></Link><Link href="/returns" className="flex justify-between rounded-lg bg-surface-secondary p-3 text-xs"><span>Açık iade/değişim</span><strong>{state.openReturns}</strong></Link></div><Link href="/analytics" className="mt-3 block"><ExactButton variant="secondary" size="sm" className="w-full">Analitiği Aç <ArrowRight className="h-3.5 w-3.5" /></ExactButton></Link></ExactDataCard>
          </div>
        </>
      ) : null}

      <ExactRuthieInsightPopup open={ruthieOpen} onClose={() => setRuthieOpen(false)} autoPrompt={autoPrompt} />
    </div>
  );
}
