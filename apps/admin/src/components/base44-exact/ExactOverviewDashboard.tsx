"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  CircleDollarSign,
  Package,
  Percent,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Truck,
  UsersRound,
} from "lucide-react";
import { Pressable, isInteractiveActivationTarget, usePressable } from "@ruth-commerce/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { RuthieBrandIcon } from "@/components/RuthieBrandIcon";
import {
  ADMIN_DATE_RANGE_OPTIONS,
  dateRangeParam,
  type AdminDateRangeKey,
  type AdminDateRangeValue,
} from "@/components/DateRangeControl";
import {
  ExactButton,
  ExactPageHeader,
  ExactSkeleton,
  ExactStatusBadge,
  exactCx,
} from "./primitives";
import { ExactDataCard, ExactMetricCard } from "./data";
import {
  ExactRuthieInsightPopup,
  type RuthieInsightAutoPrompt,
} from "./ExactRuthieInsightPopup";

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
  paymentSummary?: {
    successfulCount?: number;
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

type CatalogCounts = {
  products?: number;
  variants?: number;
};

type ChartMetric = "sales" | "sessions" | "carts";
type ChartPeriod = "daily" | "weekly" | "monthly" | "yearly";
type ChartFormat = "currency" | "number";
type RuthieInsightAction = "orders" | "payments" | "shipping";

type ChartPoint = {
  key: string;
  label: string;
  value: number;
  secondary?: number;
};

type ChartSeriesPayload = {
  title?: string;
  format?: ChartFormat;
  series?: ChartPoint[];
};

type DashboardState = {
  summary: NonNullable<DashboardPayload["summary"]>;
  recentOrders: Order[];
  paymentSummary: NonNullable<DashboardPayload["paymentSummary"]>;
  shippingCounts: NonNullable<DashboardPayload["shippingCounts"]>;
  operationCounts: NonNullable<DashboardPayload["operationCounts"]>;
  openReturns: number;
  catalog: Required<CatalogCounts>;
};

type ChartState = {
  title: string;
  format: ChartFormat;
  series: ChartPoint[];
};

const CHART_METRIC_OPTIONS: Array<{ value: ChartMetric; label: string }> = [
  { value: "sales", label: "Satış" },
  { value: "sessions", label: "Oturum" },
  { value: "carts", label: "Sepet" },
];

const CHART_PERIOD_OPTIONS: Array<{ value: ChartPeriod; label: string }> = [
  { value: "daily", label: "Günlük" },
  { value: "weekly", label: "Haftalık" },
  { value: "monthly", label: "Aylık" },
  { value: "yearly", label: "Yıllık" },
];

const emptyData: DashboardState = {
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
    conversion: {
      cartRate: 0,
      checkoutRate: 0,
      purchaseRate: 0,
      carts: 0,
      checkoutReached: 0,
      paidOrders: 0,
      sessions: 0,
    },
  },
  recentOrders: [],
  paymentSummary: { successfulCount: 0, reviewRequired: 0 },
  shippingCounts: { orderExceptions: 0, waitingWebhooks: 0, failedWebhooks: 0, deadLetters: 0 },
  operationCounts: { newOrders: 0, preparing: 0, ready: 0, shippingAttention: 0 },
  openReturns: 0,
  catalog: { products: 0, variants: 0 },
};

const emptyChart: ChartState = {
  title: "Satış — Haftalık",
  format: "currency",
  series: [],
};

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function ruthieInsightPrompt(action: RuthieInsightAction, period: string) {
  if (action === "orders") {
    return `${period} için siparişleri özetle. Önemli, acil veya dikkat gerektiren siparişleri özellikle belirt.`;
  }
  if (action === "payments") {
    return `${period} için ödemeleri kontrol et. Başarısız, bekleyen veya dikkat gerektiren ödeme işlemlerini özetle.`;
  }
  return `${period} için kargo sorunlarını bul. Geciken, hata veren veya müdahale gerektiren gönderileri özetle.`;
}

function statusPresentation(order: Order): {
  label: string;
  tone: "success" | "warning" | "danger" | "info" | "accent" | "neutral";
} {
  const status = String(order.status || "").toLowerCase();
  if (["delivered", "completed", "fulfilled"].includes(status)) return { label: "Teslim edildi", tone: "success" };
  if (["shipped", "in_transit", "out_for_delivery"].includes(status)) return { label: "Gönderildi", tone: "accent" };
  if (["ready", "ready_to_ship", "prepared"].includes(status)) return { label: "Kargoya hazır", tone: "accent" };
  if (["preparing", "in_production", "processing", "queued"].includes(status)) return { label: "Hazırlanıyor", tone: "warning" };
  if (["cancelled", "canceled"].includes(status)) return { label: "İptal", tone: "neutral" };
  if (["failed", "rejected"].includes(String(order.payment_status || "").toLowerCase()) || order.shipping_error) {
    return { label: "Kontrol gerekli", tone: "danger" };
  }
  return { label: "Yeni", tone: "info" };
}

function RangeSelect({ value, onChange }: { value: AdminDateRangeValue; onChange: (next: AdminDateRangeValue) => void }) {
  return (
    <select
      aria-label="Tarih aralığı"
      value={value.range}
      onChange={(event) => onChange({ ...value, range: event.target.value as AdminDateRangeKey })}
      className="h-8 min-w-28 px-3 pr-8 radius-small bg-surface-secondary border border-border-subtle text-xs text-main focus:outline-none focus:ring-2 focus:ring-accent"
    >
      {ADMIN_DATE_RANGE_OPTIONS.filter((option) => option.value !== "custom").map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function ChartControls({
  metric,
  period,
  onMetricChange,
  onPeriodChange,
}: {
  metric: ChartMetric;
  period: ChartPeriod;
  onMetricChange: (metric: ChartMetric) => void;
  onPeriodChange: (period: ChartPeriod) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <select
        aria-label="Grafik verisi"
        value={metric}
        onChange={(event) => onMetricChange(event.target.value as ChartMetric)}
        className="h-8 min-w-[92px] rounded-[var(--radius-small)] border border-border-subtle bg-surface-secondary px-2.5 pr-7 text-[11px] font-medium text-main focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {CHART_METRIC_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <select
        aria-label="Grafik tarih görünümü"
        value={period}
        onChange={(event) => onPeriodChange(event.target.value as ChartPeriod)}
        className="h-8 min-w-[96px] rounded-[var(--radius-small)] border border-border-subtle bg-surface-secondary px-2.5 pr-7 text-[11px] font-medium text-main focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {CHART_PERIOD_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function ProductMetricCard({ products, variants }: { products: number; variants: number }) {
  return (
    <article className="relative overflow-hidden radius-card p-4 bg-surface-primary shadow-card transition-all duration-200 hover:shadow-floating">
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[11px] font-medium text-muted">Toplam Ürün</span>
        <div className="flex items-center justify-center h-7 w-7 radius-small bg-accent-soft text-accent">
          <Package className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="font-bold tracking-tight text-2xl text-main">{products.toLocaleString("tr-TR")}</div>
      <p className="mt-1.5 text-[11px] font-medium text-muted">
        {variants.toLocaleString("tr-TR")} toplam varyant
      </p>
    </article>
  );
}

function RuthieInsightCard({
  orders,
  revenue,
  attention,
  onOpen,
  onAction,
}: {
  orders: number;
  revenue: number;
  attention: number;
  onOpen: () => void;
  onAction: (action: RuthieInsightAction) => void;
}) {
  const { pressableProps } = usePressable<HTMLDivElement>();
  const { onKeyDown: onPressKeyDown, ...restPressableProps } = pressableProps;

  return (
    <div
      {...restPressableProps}
      role="button"
      tabIndex={0}
      aria-label="ROSTA Insight sohbetini aç"
      data-ruth-press-strength="subtle"
      data-ruth-hover-lift="false"
      onClick={(event) => {
        if (!isInteractiveActivationTarget(event.target)) onOpen();
      }}
      onKeyDown={(event) => {
        onPressKeyDown?.(event);
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="ruth-pressable cursor-pointer rounded-[var(--radius-card)] lg:col-span-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <ExactDataCard className="h-full">
        <div className="mb-3 flex items-start gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent-hover))] shadow-floating animate-orb-breathe">
            <RuthieBrandIcon size={22} className="text-white" />
            <span className="absolute inset-[-4px] rounded-full border border-accent/30 animate-orb-rotate" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-main">ROSTA Insight</h3>
              <span className="inline-flex items-center gap-1 text-[10px] text-success-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> hazır
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Bu dönemde {orders.toLocaleString("tr-TR")} sipariş ve {money(revenue)} satış oluştu. {attention > 0 ? `${attention} işlem kontrol bekliyor.` : "Acil kontrol bekleyen işlem görünmüyor."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pressable type="button" pressStrength="subtle" onClick={() => onAction("orders")} className="px-2.5 py-1 radius-small bg-accent-soft text-accent text-[11px] font-medium hover:bg-accent/10 transition-colors">Siparişleri özetle</Pressable>
          <Pressable type="button" pressStrength="subtle" onClick={() => onAction("payments")} className="px-2.5 py-1 radius-small bg-accent-soft text-accent text-[11px] font-medium hover:bg-accent/10 transition-colors">Ödemeleri kontrol et</Pressable>
          <Pressable type="button" pressStrength="subtle" onClick={() => onAction("shipping")} className="px-2.5 py-1 radius-small bg-accent-soft text-accent text-[11px] font-medium hover:bg-accent/10 transition-colors">Kargo sorunlarını bul</Pressable>
        </div>
      </ExactDataCard>
    </div>
  );
}

function ConversionCard({ conversion }: { conversion: Required<ConversionSummary> }) {
  const [open, setOpen] = useState(false);
  const rows = [
    { label: "Sepete ekleyen", count: conversion.carts, rate: conversion.cartRate },
    { label: "Ödemeye ulaşan", count: conversion.checkoutReached, rate: conversion.checkoutRate },
    { label: "Satın alan", count: conversion.paidOrders, rate: conversion.purchaseRate },
  ];

  return (
    <article className="col-span-2 overflow-hidden radius-card bg-surface-primary shadow-card">
      <button
        type="button"
        className="w-full p-4 text-left transition-colors hover:bg-surface-secondary/60"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-muted">Dönüşüm</p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-main">
              %{Number(conversion.purchaseRate || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
            </p>
            <p className="mt-1 text-[11px] text-subtle">
              {conversion.sessions.toLocaleString("tr-TR")} oturum baz alınır
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center radius-small bg-accent-soft text-accent">
              <Percent className="h-4 w-4" />
            </div>
            <ChevronDown className={exactCx("h-4 w-4 text-subtle transition-transform duration-200", open && "rotate-180")} />
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-3 border-t border-border-subtle px-4 py-4 md:grid-cols-3">
              {rows.map((row) => (
                <div key={row.label} className="radius-small bg-surface-secondary p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-muted">{row.label}</span>
                    <span className="text-xs font-bold text-main">{row.count.toLocaleString("tr-TR")}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-tertiary">
                      <div
                        className="h-full rounded-full bg-accent transition-[width] duration-500"
                        style={{ width: `${Math.min(100, Math.max(0, row.rate))}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-[10px] font-semibold text-accent">
                      %{Number(row.rate || 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

function MetricBarChart({ data, format, metric }: { data: ChartPoint[]; format: ChartFormat; metric: ChartMetric }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  const compact = width < 560;
  const height = compact ? 320 : width < 760 ? 300 : 280;
  const padding = compact
    ? { top: 30, right: 12, bottom: 50, left: 12 }
    : { top: 30, right: 22, bottom: 44, left: 28 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...data.map((point) => Number(point.value || 0)));
  const band = plotWidth / Math.max(1, data.length);
  const barWidth = Math.max(5, Math.min(54, band * 0.52));
  const labelStep = data.length > 28 ? 5 : data.length > 20 ? 3 : data.length > 14 ? 2 : 1;

  useEffect(() => {
    setActiveIndex(null);
  }, [data, metric]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const nextWidth = Math.max(280, Math.round(container.getBoundingClientRect().width));
      setWidth((currentWidth) => currentWidth === nextWidth ? currentWidth : nextWidth);
    };

    updateWidth();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        className="w-full select-none"
        role="img"
        aria-label="Seçilebilir ticaret performans grafiği"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + ratio * plotHeight;
          return (
            <line
              key={ratio}
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="hsl(var(--border-subtle))"
              strokeDasharray="3 4"
            />
          );
        })}

        {data.map((point, index) => {
          const x = padding.left + index * band + (band - barWidth) / 2;
          const rawHeight = (Number(point.value || 0) / max) * plotHeight;
          const barHeight = Math.max(Number(point.value || 0) > 0 ? 6 : 3, rawHeight);
          const y = padding.top + plotHeight - barHeight;
          const active = activeIndex === index;
          const tooltipWidth = Math.min(164, width - 16);
          const tooltipHeight = 54;
          const tooltipX = Math.min(width - tooltipWidth - 8, Math.max(8, x + barWidth / 2 - tooltipWidth / 2));
          const tooltipY = Math.max(4, y - tooltipHeight - 10);
          const formattedValue = format === "currency"
            ? money(point.value)
            : Number(point.value || 0).toLocaleString("tr-TR");
          const detail = metric === "sales"
            ? `${formattedValue} · ${Number(point.secondary || 0).toLocaleString("tr-TR")} sipariş`
            : `${formattedValue} ${metric === "sessions" ? "oturum" : "sepet"}`;
          const showLabel = index % labelStep === 0 || index === data.length - 1;

          return (
            <g key={point.key}>
              <rect
                x={padding.left + index * band}
                y={padding.top}
                width={band}
                height={plotHeight + 24}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                onTouchStart={() => setActiveIndex(index)}
              />
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={Math.min(barWidth / 2, 12)}
                fill={active ? "hsl(var(--accent))" : "hsl(var(--accent) / 0.3)"}
                className="pointer-events-none transition-all duration-200"
              />
              {showLabel ? (
                <text
                  x={x + barWidth / 2}
                  y={height - 15}
                  textAnchor="middle"
                  fontSize="10"
                  fill="hsl(var(--text-subtle))"
                >
                  {point.label}
                </text>
              ) : null}

              {active ? (
                <g className="pointer-events-none">
                  <line
                    x1={x + barWidth / 2}
                    x2={x + barWidth / 2}
                    y1={tooltipY + tooltipHeight}
                    y2={y - 3}
                    stroke="hsl(var(--text-main) / 0.25)"
                    strokeDasharray="3 3"
                  />
                  <rect
                    x={tooltipX}
                    y={tooltipY}
                    width={tooltipWidth}
                    height={tooltipHeight}
                    rx="12"
                    fill="hsl(var(--text-main))"
                  />
                  <text x={tooltipX + 12} y={tooltipY + 20} fontSize="10" fill="hsl(var(--surface-primary) / 0.72)">
                    {point.label}
                  </text>
                  <text x={tooltipX + 12} y={tooltipY + 40} fontSize="13" fontWeight="700" fill="hsl(var(--surface-primary))">
                    {detail}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ExactOverviewDashboard() {
  const [range, setRange] = useState<AdminDateRangeValue>({ range: "today", from: "", to: "" });
  const [data, setData] = useState<DashboardState>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);

  const [chartMetric, setChartMetric] = useState<ChartMetric>("sales");
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("weekly");
  const [chartData, setChartData] = useState<ChartState>(emptyChart);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const chartRequestSequence = useRef(0);

  const [ruthieInsightOpen, setRuthieInsightOpen] = useState(false);
  const [ruthieInsightAutoPrompt, setRuthieInsightAutoPrompt] = useState<RuthieInsightAutoPrompt | null>(null);
  const ruthiePromptSequence = useRef(0);

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const requestId = ++requestSequence.current;
    const selectedRange = dateRangeParam(range);
    if (!silent) setLoading(true);

    try {
      const [payload, catalogPayload] = await Promise.all([
        adminRequest<DashboardPayload>(`/api/summary?range=${encodeURIComponent(selectedRange)}`, {
          force: silent,
          ttlMs: 25_000,
          staleMs: 45 * 60_000,
        }),
        adminRequest<CatalogCounts>("/api/dashboard/catalog-counts", {
          force: silent,
          ttlMs: 25_000,
          staleMs: 45 * 60_000,
        }),
      ]);

      if (requestId !== requestSequence.current) return;

      setData({
        summary: { ...emptyData.summary, ...(payload.summary || {}) },
        recentOrders: payload.recentOrders || [],
        paymentSummary: { ...emptyData.paymentSummary, ...(payload.paymentSummary || {}) },
        shippingCounts: { ...emptyData.shippingCounts, ...(payload.shippingCounts || {}) },
        operationCounts: { ...emptyData.operationCounts, ...(payload.operationCounts || {}) },
        openReturns: Number(payload.openReturns || 0),
        catalog: {
          products: Number(catalogPayload.products ?? payload.summary?.products ?? 0),
          variants: Number(catalogPayload.variants || 0),
        },
      });
      setError(null);
    } catch (caught) {
      if (requestId !== requestSequence.current) return;
      setError(caught instanceof Error ? caught.message : "Kontrol merkezi verileri alınamadı.");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [range]);

  const loadChart = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const requestId = ++chartRequestSequence.current;
    if (!silent) setChartLoading(true);

    try {
      const payload = await adminRequest<ChartSeriesPayload>(
        `/api/dashboard/sales-series?metric=${encodeURIComponent(chartMetric)}&period=${encodeURIComponent(chartPeriod)}`,
        {
          force: silent,
          ttlMs: 25_000,
          staleMs: 10 * 60_000,
        },
      );

      if (requestId !== chartRequestSequence.current) return;

      const metricLabel = CHART_METRIC_OPTIONS.find((option) => option.value === chartMetric)?.label || "Satış";
      const periodLabel = CHART_PERIOD_OPTIONS.find((option) => option.value === chartPeriod)?.label || "Haftalık";
      setChartData({
        title: payload.title || `${metricLabel} — ${periodLabel}`,
        format: payload.format || (chartMetric === "sales" ? "currency" : "number"),
        series: payload.series || [],
      });
      setChartError(null);
    } catch (caught) {
      if (requestId !== chartRequestSequence.current) return;
      setChartError(caught instanceof Error ? caught.message : "Grafik verileri alınamadı.");
    } finally {
      if (requestId === chartRequestSequence.current) setChartLoading(false);
    }
  }, [chartMetric, chartPeriod]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load({ silent: true });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    void loadChart();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadChart({ silent: true });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadChart]);

  const summary = data.summary;
  const operations = data.operationCounts;
  const attention = Number(operations.shippingAttention || 0) + Number(data.paymentSummary.reviewRequired || 0) + data.openReturns;
  const averageOrder = Number(summary.paidOrders || 0) > 0
    ? Number(summary.revenue || 0) / Number(summary.paidOrders || 1)
    : 0;
  const rangeLabel = ADMIN_DATE_RANGE_OPTIONS.find((option) => option.value === range.range)?.label || "Seçili dönem";

  const openRuthieInsight = useCallback((action?: RuthieInsightAction) => {
    if (action) {
      ruthiePromptSequence.current += 1;
      setRuthieInsightAutoPrompt({
        id: ruthiePromptSequence.current,
        text: ruthieInsightPrompt(action, rangeLabel),
      });
    } else {
      setRuthieInsightAutoPrompt(null);
    }
    setRuthieInsightOpen(true);
  }, [rangeLabel]);

  const conversion = useMemo<Required<ConversionSummary>>(() => {
    const source = summary.conversion || {};
    const sessions = Number(source.sessions ?? summary.sessions ?? 0);
    const carts = Number(source.carts ?? summary.carts ?? 0);
    const checkoutReached = Number(source.checkoutReached ?? summary.checkoutReached ?? 0);
    const paidOrders = Number(source.paidOrders ?? summary.paidOrders ?? summary.orders ?? 0);
    const rate = (value: number) => sessions > 0 ? Math.round((value / sessions) * 1000) / 10 : 0;
    return {
      sessions,
      carts,
      checkoutReached,
      paidOrders,
      cartRate: Number(source.cartRate ?? rate(carts)),
      checkoutRate: Number(source.checkoutRate ?? rate(checkoutReached)),
      purchaseRate: Number(source.purchaseRate ?? summary.conversionRate ?? rate(paidOrders)),
    };
  }, [summary]);

  const chartSeries = chartData.series.length
    ? chartData.series
    : [{ key: "empty", label: "—", value: 0, secondary: 0 }];

  const orderDistribution = [
    { label: "Yeni", count: Number(operations.newOrders || 0), tone: "info" as const },
    { label: "Hazırlanıyor", count: Number(operations.preparing || 0), tone: "warning" as const },
    { label: "Kargoya hazır", count: Number(operations.ready || 0), tone: "accent" as const },
    { label: "İşlem gerekli", count: attention, tone: "danger" as const },
  ];
  const distributionTotal = Math.max(1, orderDistribution.reduce((sum, item) => sum + item.count, 0));

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="overview">
      <ExactPageHeader
        title="Genel Bakış"
        subtitle="Canlı ticaret ve operasyon özeti"
        actions={
          <>
            <RangeSelect value={range} onChange={setRange} />
            <Link href="/rosta-insight">
              <ExactButton variant="secondary" size="sm">
                <Sparkles className="h-4 w-4" /> ROSTA Insight’a sor
              </ExactButton>
            </Link>
          </>
        }
      />

      {error ? (
        <div className="flex items-center gap-2 radius-control border border-danger/20 bg-danger-soft px-4 py-3 text-xs text-danger-foreground">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <ExactSkeleton className="h-[146px]" />
          <ExactSkeleton className="h-[146px] lg:col-span-2" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <ExactMetricCard accent label="Net Satış" value={Number(summary.revenue || 0)} format="currency" icon={CircleDollarSign} />
          <RuthieInsightCard
            orders={Number(summary.orders || 0)}
            revenue={Number(summary.revenue || 0)}
            attention={attention}
            onOpen={() => openRuthieInsight()}
            onAction={openRuthieInsight}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <ExactMetricCard label="Oturum" value={Number(summary.sessions || 0)} icon={UsersRound} />
        <ExactMetricCard label="Sipariş" value={Number(summary.orders || 0)} icon={ShoppingBag} />
        <ExactMetricCard label="Sepet" value={Number(summary.carts || 0)} icon={ShoppingCart} />
        <ExactMetricCard label="İade" value={Number(summary.returns || 0)} icon={RotateCcw} />
        <ConversionCard conversion={conversion} />
        <ProductMetricCard products={data.catalog.products} variants={data.catalog.variants} />
        <ExactMetricCard label="Ortalama Sepet" value={averageOrder} format="currency" icon={CircleDollarSign} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ExactDataCard
          title={chartData.title}
          action={
            <ChartControls
              metric={chartMetric}
              period={chartPeriod}
              onMetricChange={setChartMetric}
              onPeriodChange={setChartPeriod}
            />
          }
          className="lg:col-span-2"
          bodyClassName="pt-2"
        >
          <div className="mb-1 text-right text-[10px] text-subtle">Sütuna dokunarak değeri gör</div>
          {chartError ? (
            <div className="mb-2 flex items-center gap-2 rounded-[var(--radius-small)] border border-danger/20 bg-danger-soft px-3 py-2 text-[11px] text-danger-foreground">
              <AlertCircle className="h-3.5 w-3.5" /> {chartError}
            </div>
          ) : null}
          {chartLoading ? (
            <ExactSkeleton className="h-[270px]" />
          ) : (
            <MetricBarChart data={chartSeries} format={chartData.format} metric={chartMetric} />
          )}
        </ExactDataCard>

        <ExactDataCard title="Sipariş Durumu">
          <div className="space-y-2.5">
            {orderDistribution.map((item) => {
              const percentage = (item.count / distributionTotal) * 100;
              return (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between">
                    <ExactStatusBadge status={item.label} label={item.label} tone={item.tone} dot={false} size="sm" />
                    <span className="text-xs font-semibold text-main">{item.count.toLocaleString("tr-TR")}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-tertiary">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-500"
                      style={{ width: `${Math.max(2, percentage)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </ExactDataCard>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ExactDataCard title="Son Siparişler" className="lg:col-span-2" noPadding>
          <div className="divide-y divide-border-subtle">
            {data.recentOrders.slice(0, 7).map((order) => {
              const presentation = statusPresentation(order);
              const Icon = presentation.tone === "danger" ? AlertCircle : presentation.tone === "accent" ? Truck : ShoppingBag;
              return (
                <Link
                  href={`/orders?q=${encodeURIComponent(order.order_no)}`}
                  key={order.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-secondary"
                >
                  <div className={exactCx(
                    "flex h-8 w-8 shrink-0 items-center justify-center radius-small",
                    presentation.tone === "danger"
                      ? "bg-danger-soft text-danger-foreground"
                      : presentation.tone === "accent"
                        ? "bg-accent-soft text-accent"
                        : "bg-info-soft text-info-foreground",
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-main">#{order.order_no} · {order.customer_name || "İsimsiz müşteri"}</p>
                    <p className="truncate text-[11px] text-muted">{money(order.total_amount)} · {presentation.label}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-subtle">{shortDate(order.created_at)}</span>
                </Link>
              );
            })}
            {!loading && data.recentOrders.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-subtle">Bu tarih aralığında sipariş yok</div>
            ) : null}
          </div>
        </ExactDataCard>

        <ExactDataCard title="İşlem Gerektirenler" bodyClassName="space-y-2">
          <Link href="/payments" className="block radius-small border border-warning/20 bg-warning-soft p-3 transition-all hover:brightness-[0.99]">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-warning-foreground">Ödeme Kontrolü</span>
              <span className="text-lg font-bold text-warning-foreground">{Number(data.paymentSummary.reviewRequired || 0)}</span>
            </div>
            <p className="text-[11px] text-muted">Bekleyen veya başarısız işlemler</p>
          </Link>
          <Link href="/returns" className="block radius-small border border-danger/20 bg-danger-soft p-3 transition-all hover:brightness-[0.99]">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-danger-foreground">Açık İadeler</span>
              <span className="text-lg font-bold text-danger-foreground">{data.openReturns}</span>
            </div>
            <p className="text-[11px] text-muted">İncelenmesi gereken iade ve değişimler</p>
          </Link>
          <Link href="/orders" className="mt-1 block">
            <ExactButton variant="secondary" size="sm" className="w-full">
              Tüm siparişleri gör <ArrowRight className="h-3.5 w-3.5" />
            </ExactButton>
          </Link>
        </ExactDataCard>
      </div>

      <ExactRuthieInsightPopup
        open={ruthieInsightOpen}
        onClose={() => setRuthieInsightOpen(false)}
        autoPrompt={ruthieInsightAutoPrompt}
      />
    </div>
  );
}
