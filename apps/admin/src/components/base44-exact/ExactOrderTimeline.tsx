"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, FileKey2, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { hardRefreshAdminResource } from "@/lib/adminFreshnessActions";
import { ExactButton, ExactIconButton, ExactPageHeader, ExactSegmentedControl, ExactSkeleton, ExactStatusBadge, useExactToast } from "./primitives";
import { ExactDataCard, ExactEmptyState, ExactMetricCard } from "./data";

type EventRow = {
  id: string;
  order_id?: string | null;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  shipment_status?: string | null;
  source?: string | null;
  reason?: string | null;
  actor_profile_id?: string | null;
  actor_email?: string | null;
  metadata?: Record<string, unknown> | null;
  occurred_at?: string | null;
  created_at?: string | null;
};
type OrderSummary = {
  id: string;
  order_no: string;
  customer_name?: string | null;
  status?: string | null;
  payment_status?: string | null;
  shipping_status?: string | null;
  total_amount?: number | null;
  currency?: string | null;
};
type Filter = "all" | "order" | "payment" | "shipping" | "system";
type TimelineResult = { events?: EventRow[]; timeline?: EventRow[]; order?: OrderSummary };

function dateTime(value?: string | null) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}
function money(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}
function category(row: EventRow): Filter {
  const type = row.event_type.toLowerCase();
  if (type.includes("shipment") || type.includes("shipping") || type.includes("cargo")) return "shipping";
  if (type.includes("payment") || type.includes("refund") || type.includes("paytr")) return "payment";
  if (type.includes("order") || type.includes("status")) return "order";
  return "system";
}
function title(row: EventRow) {
  if (row.event_type === "shipment.status_changed") return `Kargo durumu: ${row.shipment_status || row.to_status || "güncellendi"}`;
  if (row.event_type === "order.status_changed") return `Sipariş durumu: ${row.from_status || "—"} → ${row.to_status || "—"}`;
  if (row.event_type.includes("payment")) return `Ödeme olayı: ${row.to_status || row.event_type}`;
  return row.event_type.replaceAll(".", " ").replaceAll("_", " ");
}
function iconFor(row: EventRow) {
  const kind = category(row);
  return kind === "shipping" ? Truck : kind === "payment" ? ShieldCheck : kind === "order" ? CheckCircle2 : FileKey2;
}

export function ExactOrderTimeline({ orderId }: { orderId: string }) {
  const toast = useExactToast();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const timelinePath = useMemo(() => `/api/orders/timeline?order_id=${encodeURIComponent(orderId)}`, [orderId]);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    setLoading(true);
    try {
      const result = mode === "refresh"
        ? (await hardRefreshAdminResource<TimelineResult>(timelinePath)).value
        : await adminRequest<TimelineResult>(timelinePath);
      setEvents(result.events || result.timeline || []);
      setOrder(result.order || null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Sipariş kayıt zinciri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [timelinePath, toast]);

  useEffect(() => { void load("initial"); }, [load]);

  const visible = useMemo(() => events.filter((event) => filter === "all" || category(event) === filter), [events, filter]);
  const counts = useMemo(() => ({
    order: events.filter((event) => category(event) === "order").length,
    payment: events.filter((event) => category(event) === "payment").length,
    shipping: events.filter((event) => category(event) === "shipping").length,
    system: events.filter((event) => category(event) === "system").length,
  }), [events]);

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="order-timeline">
    <ExactPageHeader
      title={order ? `Kayıt Zinciri · #${order.order_no}` : "Değiştirilemez Kayıt Zinciri"}
      subtitle={order ? `${order.customer_name || "Müşteri"} · ${money(Number(order.total_amount || 0), order.currency || "TRY")}` : "Sipariş, ödeme ve kargo olaylarının denetim izi"}
      actions={<>
        <Link href={`/orders?order=${encodeURIComponent(orderId)}`}><ExactButton variant="secondary" size="sm"><ArrowLeft className="h-4 w-4" /> Siparişe dön</ExactButton></Link>
        <ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load("refresh")} loading={loading} />
      </>}
    />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <ExactMetricCard label="Sipariş Olayı" value={counts.order} icon={CheckCircle2} />
      <ExactMetricCard label="Ödeme Olayı" value={counts.payment} icon={ShieldCheck} />
      <ExactMetricCard label="Kargo Olayı" value={counts.shipping} icon={Truck} />
      <ExactMetricCard label="Sistem Olayı" value={counts.system} icon={FileKey2} />
    </div>
    {order ? <ExactDataCard><div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div><p className="ruth-type-label uppercase text-subtle">Sipariş</p><ExactStatusBadge status={order.status || "pending"} label={order.status || "—"} size="sm" /></div>
      <div><p className="ruth-type-label uppercase text-subtle">Ödeme</p><ExactStatusBadge status={order.payment_status || "pending"} label={order.payment_status || "—"} size="sm" /></div>
      <div><p className="ruth-type-label uppercase text-subtle">Kargo</p><ExactStatusBadge status={order.shipping_status || "pending"} label={order.shipping_status || "—"} size="sm" /></div>
      <div><p className="ruth-type-label uppercase text-subtle">Kayıt Sayısı</p><p className="ruth-type-metric text-main">{events.length}</p></div>
    </div></ExactDataCard> : null}
    <ExactSegmentedControl
      size="sm"
      value={filter}
      onChange={(value) => setFilter(value as Filter)}
      options={[
        { value: "all", label: "Tümü" },
        { value: "order", label: "Sipariş" },
        { value: "payment", label: "Ödeme" },
        { value: "shipping", label: "Kargo" },
        { value: "system", label: "Sistem" },
      ]}
    />
    <ExactDataCard title="Operasyon timeline’ı">
      {loading ? <div className="space-y-3"><ExactSkeleton className="h-20" /><ExactSkeleton className="h-20" /><ExactSkeleton className="h-20" /></div> : !visible.length ? <ExactEmptyState icon={Clock3} title="Bu filtrede kayıt yok" /> : <div className="relative">
        <div className="absolute left-[17px] top-3 bottom-3 w-px bg-border-subtle" />
        {visible.map((event) => {
          const Icon = iconFor(event);
          const kind = category(event);
          return <article key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
            <div className={`relative z-10 flex items-center justify-center h-9 w-9 rounded-full shrink-0 border border-border-subtle ${kind === "shipping" ? "bg-info-soft text-info-foreground" : kind === "payment" ? "bg-success-soft text-success-foreground" : kind === "order" ? "bg-accent-soft text-accent" : "bg-surface-tertiary text-muted"}`}><Icon className="h-4 w-4" /></div>
            <div className="flex-1 min-w-0 p-3 radius-control bg-surface-secondary">
              <div className="flex items-start justify-between gap-3">
                <div><p className="ruth-type-card-title capitalize text-main">{title(event)}</p><p className="ruth-type-caption mt-1 text-muted">{event.reason || event.source || "Sistem kaydı"}</p></div>
                <span className="ruth-type-code shrink-0 text-subtle">{dateTime(event.occurred_at || event.created_at)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {event.from_status ? <span className="ruth-type-caption px-2 py-1 radius-small bg-surface-primary text-muted">Önce: {event.from_status}</span> : null}
                {event.to_status ? <span className="ruth-type-caption px-2 py-1 radius-small bg-accent-soft text-accent">Sonra: {event.to_status}</span> : null}
                {event.actor_email ? <span className="ruth-type-caption px-2 py-1 radius-small bg-surface-primary text-muted">{event.actor_email}</span> : null}
              </div>
              {event.metadata && Object.keys(event.metadata).length ? <details className="mt-2">
                <summary className="ruth-type-control cursor-pointer text-accent">Teknik ayrıntı</summary>
                <pre className="ruth-type-code mt-2 max-h-48 overflow-auto p-2 radius-small bg-surface-primary text-muted">{JSON.stringify(event.metadata, null, 2)}</pre>
              </details> : null}
            </div>
          </article>;
        })}
      </div>}
    </ExactDataCard>
  </div>;
}
