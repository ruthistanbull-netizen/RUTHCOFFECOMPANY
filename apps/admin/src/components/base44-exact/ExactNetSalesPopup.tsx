"use client";

import Link from "next/link";
import { Banknote, Clock3, ExternalLink, Loader2, Package, RefreshCw, ShoppingBag, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactIconButton, ExactSegmentedControl, exactCx } from "./primitives";
import { ExactLargePopup } from "./ExactLargePopup";

type RangeKey = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "this_year" | "last_year" | "all" | "7d" | "30d" | "90d";
type SaleItem = { id: string | null; product_slug: string; product_name: string; variant_name: string | null; quantity: number; unit_price: number; total_price: number; image_url: string | null };
type SaleOrder = { id: string; order_no: string; customer_name: string; currency: string; status: string; payment_status: string; created_at: string; traffic_source: string; collected_amount: number; item_count: number; items: SaleItem[] };
type Payload = { orders?: SaleOrder[] };

const RANGE_LABELS: Record<RangeKey, string> = { today: "Bugün", yesterday: "Dün", this_week: "Bu hafta", last_week: "Geçen hafta", this_month: "Bu ay", last_month: "Geçen ay", this_year: "Bu yıl", last_year: "Geçen yıl", all: "Tüm zamanlar", "7d": "7G", "30d": "30G", "90d": "90G" };
const QUICK_RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [{ value: "today", label: "Bugün" }, { value: "7d", label: "7G" }, { value: "30d", label: "30G" }, { value: "90d", label: "90G" }];

function normalizeRange(value: string | null | undefined): RangeKey { return value && Object.prototype.hasOwnProperty.call(RANGE_LABELS, value) ? value as RangeKey : "today"; }
function selectedDashboardRange(): RangeKey { if (typeof document === "undefined") return "today"; return normalizeRange(document.querySelector<HTMLElement>("[data-dashboard-range]")?.dataset.dashboardRange || document.querySelector<HTMLSelectElement>('select[aria-label="Tarih aralığı"]')?.value); }
function money(value: number, currency = "TRY") { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY", maximumFractionDigits: 2 }).format(Number(value || 0)); }
function dateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date); }
function sourceLabel(value: string) { const key = String(value || "").trim().toLocaleLowerCase("tr-TR"); const labels: Record<string, string> = { direct: "Doğrudan", instagram: "Instagram", instagram_paid: "Instagram reklam", instagram_organic: "Instagram organik", facebook: "Facebook", facebook_paid: "Facebook reklam", facebook_organic: "Facebook organik", google: "Google", google_paid: "Google reklam", google_organic: "Google organik", tiktok: "TikTok", tiktok_paid: "TikTok reklam", tiktok_organic: "TikTok organik", manual: "Manuel" }; return labels[key] || value || "Doğrudan"; }

function ProductImage({ item }: { item: SaleItem }) {
  const [failed, setFailed] = useState(false);
  return <div className="h-14 w-12 shrink-0 overflow-hidden radius-small bg-surface-tertiary">{item.image_url && !failed ? <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" onError={() => setFailed(true)} /> : <div className="flex h-full w-full items-center justify-center text-subtle"><Package className="h-4 w-4" /></div>}</div>;
}

export function ExactNetSalesPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [range, setRange] = useState<RangeKey>("today");
  const [rangeReady, setRangeReady] = useState(false);
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    if (!open) { sequenceRef.current += 1; setRangeReady(false); setOrders([]); setError(null); setLoading(false); return; }
    setLoading(true);
    setOrders([]);
    setError(null);
    setRange(selectedDashboardRange());
    setRangeReady(true);
  }, [open]);

  const load = useCallback(async () => {
    if (!open || !rangeReady) return;
    const sequence = ++sequenceRef.current;
    setLoading(true);
    setOrders([]);
    setError(null);
    try {
      const result = await adminRequest<Payload>(`/api/dashboard/net-sales?range=${encodeURIComponent(range)}`, { hardRefresh: true, force: true, ttlMs: 0, staleMs: 0 });
      if (sequence !== sequenceRef.current) return;
      setOrders(result.orders || []);
    } catch (caught) {
      if (sequence === sequenceRef.current) setError(caught instanceof Error ? caught.message : "Net satış siparişleri alınamadı.");
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, [open, range, rangeReady]);

  useEffect(() => { void load(); }, [load]);
  const rangeOptions = QUICK_RANGE_OPTIONS.some((option) => option.value === range) ? QUICK_RANGE_OPTIONS : [{ value: range, label: RANGE_LABELS[range] }, ...QUICK_RANGE_OPTIONS];

  return (
    <ExactLargePopup open={open} onClose={onClose} title="Net Satış Siparişleri" subtitle="Seçili dönemin net satışını oluşturan siparişler" size="wide" dismissalPolicy="light-dismiss"
      headerActions={<ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" size="icon-sm" onClick={() => void load()} loading={loading} />}
      toolbar={<div className="overflow-x-auto no-scrollbar"><ExactSegmentedControl size="sm" value={range} onChange={(value) => { setLoading(true); setOrders([]); setRange(value as RangeKey); }} options={rangeOptions} /></div>}
      footer={<Link href="/orders" onClick={onClose} className={exactCx("flex h-11 w-full items-center justify-center gap-2 radius-control bg-accent text-accent-foreground ruth-type-control font-semibold md:h-9")}>Tüm siparişleri aç <ExternalLink className="h-4 w-4" /></Link>}
    >
      {loading ? <div className="flex min-h-[260px] items-center justify-center p-6" aria-live="polite"><div className="flex flex-col items-center gap-3 text-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /><div><p className="text-sm font-semibold text-main">Güncel net satışlar yükleniyor...</p><p className="mt-1 text-xs text-muted">Net satış siparişleri canlı kaynaktan alınıyor.</p></div></div></div> : error ? <div className="radius-small bg-danger-soft p-3 ruth-type-caption text-danger-foreground">{error}</div> : !orders.length ? <div className="flex min-h-52 flex-col items-center justify-center text-center"><Banknote className="mb-3 h-8 w-8 text-subtle" /><p className="ruth-type-card-title text-main">Bu aralıkta net satış yok</p></div> : <div className="space-y-3">{orders.map((order) => <article key={order.id} className="overflow-hidden radius-card border border-border-subtle bg-surface-primary"><div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3.5 py-3"><p className="ruth-type-card-title text-main">Sipariş #{order.order_no}</p><span className="ruth-type-caption shrink-0 text-subtle">{dateTime(order.created_at)}</span></div><div className="px-3.5 py-3"><div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 ruth-type-caption text-muted"><span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5 text-subtle" />{order.customer_name}</span><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5 text-subtle" />{dateTime(order.created_at)}</span><span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">{sourceLabel(order.traffic_source)}</span></div><div className="space-y-2">{order.items.map((item, index) => <div key={`${order.id}-${item.id || item.product_slug}-${index}`} className="flex items-center gap-3 radius-small bg-surface-secondary p-2.5"><ProductImage item={item} /><div className="min-w-0 flex-1"><p className="ruth-type-table truncate font-semibold text-main">{item.product_name}</p><p className="ruth-type-caption mt-0.5 truncate text-muted">{item.variant_name || "Standart varyant"} · {item.quantity} adet</p></div><p className="ruth-type-price shrink-0 font-semibold text-main">{money(item.total_price, order.currency)}</p></div>)}</div><div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3"><span className="ruth-type-caption inline-flex items-center gap-1 text-muted"><ShoppingBag className="h-3.5 w-3.5" />{order.item_count} ürün</span><span className="ruth-type-price font-bold text-main">{money(order.collected_amount, order.currency)}</span></div><Link href={`/orders/${order.id}`} onClick={onClose} className="mt-3 flex items-center justify-center gap-1 rounded-lg bg-surface-secondary py-2 text-[10px] font-semibold text-accent">Sipariş detayını aç <ExternalLink className="h-3.5 w-3.5" /></Link></div></article>)}</div>}
    </ExactLargePopup>
  );
}
