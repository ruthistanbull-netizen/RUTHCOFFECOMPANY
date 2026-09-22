"use client";

import Link from "next/link";
import { Clock3, ExternalLink, Loader2, Package, RefreshCw, ShoppingCart, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactIconButton, ExactSegmentedControl, exactCx } from "./primitives";
import { ExactLargePopup } from "./ExactLargePopup";

type RangeKey = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "this_year" | "last_year" | "all" | "7d" | "30d" | "90d";
type CartItem = { product_slug: string; product_name: string; variant_id: string | null; quantity: number; price: number; image_url: string | null };
type CartActivity = { session_id: string; created_at: string; last_activity_at: string; source: string; device_type: string | null; quantity: number; estimated_amount: number; items: CartItem[] };
type Payload = { carts?: CartActivity[] };

const RANGE_LABELS: Record<RangeKey, string> = { today: "Bugün", yesterday: "Dün", this_week: "Bu hafta", last_week: "Geçen hafta", this_month: "Bu ay", last_month: "Geçen ay", this_year: "Bu yıl", last_year: "Geçen yıl", all: "Tüm zamanlar", "7d": "7G", "30d": "30G", "90d": "90G" };
const QUICK_RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [{ value: "today", label: "Bugün" }, { value: "7d", label: "7G" }, { value: "30d", label: "30G" }, { value: "90d", label: "90G" }];

function normalizeRange(value: string | null | undefined): RangeKey { return value && Object.prototype.hasOwnProperty.call(RANGE_LABELS, value) ? value as RangeKey : "today"; }
function selectedDashboardRange(): RangeKey { if (typeof document === "undefined") return "today"; return normalizeRange(document.querySelector<HTMLElement>("[data-dashboard-range]")?.dataset.dashboardRange || document.querySelector<HTMLSelectElement>('select[aria-label="Tarih aralığı"]')?.value); }
function money(value: number) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 }).format(Number(value || 0)); }
function dateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date); }
function sourceLabel(source: string) { const labels: Record<string, string> = { direct: "Doğrudan", instagram_paid: "Instagram reklam", instagram_organic: "Instagram organik", facebook_paid: "Facebook reklam", facebook_organic: "Facebook organik", google_paid: "Google reklam", google_organic: "Google organik", tiktok_paid: "TikTok reklam", tiktok_organic: "TikTok organik", referral: "Yönlendirme" }; return labels[source] || source || "Doğrudan"; }
function deviceLabel(device: string | null) { if (device === "mobile") return "Mobil"; if (device === "tablet") return "Tablet"; if (device === "desktop") return "Masaüstü"; return "Cihaz bilinmiyor"; }
function shortSession(sessionId: string) { const clean = String(sessionId || "").replace(/[^a-zA-Z0-9]/g, ""); return clean.slice(-6).toLocaleUpperCase("tr-TR") || "SEPET"; }

function ProductImage({ item }: { item: CartItem }) {
  const [failed, setFailed] = useState(false);
  return <div className="h-14 w-12 shrink-0 overflow-hidden radius-small bg-surface-tertiary">{item.image_url && !failed ? <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" onError={() => setFailed(true)} /> : <div className="flex h-full w-full items-center justify-center text-subtle"><Package className="h-4 w-4" /></div>}</div>;
}

export function ExactCartActivityPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [range, setRange] = useState<RangeKey>("today");
  const [rangeReady, setRangeReady] = useState(false);
  const [carts, setCarts] = useState<CartActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    if (!open) { sequenceRef.current += 1; setRangeReady(false); setCarts([]); setError(null); setLoading(false); return; }
    setLoading(true);
    setCarts([]);
    setError(null);
    setRange(selectedDashboardRange());
    setRangeReady(true);
  }, [open]);

  const load = useCallback(async () => {
    if (!open || !rangeReady) return;
    const sequence = ++sequenceRef.current;
    setLoading(true);
    setCarts([]);
    setError(null);
    try {
      const result = await adminRequest<Payload>(`/api/dashboard/cart-activity?range=${encodeURIComponent(range)}`, { hardRefresh: true, force: true, ttlMs: 0, staleMs: 0 });
      if (sequence !== sequenceRef.current) return;
      setCarts(result.carts || []);
    } catch (caught) {
      if (sequence === sequenceRef.current) setError(caught instanceof Error ? caught.message : "Sepetler alınamadı.");
    } finally {
      if (sequence === sequenceRef.current) setLoading(false);
    }
  }, [open, range, rangeReady]);

  useEffect(() => { void load(); }, [load]);
  const rangeOptions = QUICK_RANGE_OPTIONS.some((option) => option.value === range) ? QUICK_RANGE_OPTIONS : [{ value: range, label: RANGE_LABELS[range] }, ...QUICK_RANGE_OPTIONS];

  return (
    <ExactLargePopup open={open} onClose={onClose} title="Sepetler" subtitle="Müşterilerin sepete eklediği ürünler" size="wide" dismissalPolicy="light-dismiss"
      headerActions={<ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" size="icon-sm" onClick={() => void load()} loading={loading} />}
      toolbar={<div className="overflow-x-auto no-scrollbar"><ExactSegmentedControl size="sm" value={range} onChange={(value) => { setLoading(true); setCarts([]); setRange(value as RangeKey); }} options={rangeOptions} /></div>}
      footer={<Link href="/cart-activity" onClick={onClose} className={exactCx("flex h-11 w-full items-center justify-center gap-2 radius-control bg-accent text-accent-foreground ruth-type-control font-semibold md:h-9")}>Tüm sepetleri aç <ExternalLink className="h-4 w-4" /></Link>}
    >
      {loading ? <div className="flex min-h-[260px] items-center justify-center p-6" aria-live="polite"><div className="flex flex-col items-center gap-3 text-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /><div><p className="text-sm font-semibold text-main">Güncel sepetler yükleniyor...</p><p className="mt-1 text-xs text-muted">Sepet hareketleri canlı kaynaktan alınıyor.</p></div></div></div> : error ? <div className="radius-small bg-danger-soft p-3 ruth-type-caption text-danger-foreground">{error}</div> : !carts.length ? <div className="flex min-h-52 flex-col items-center justify-center text-center"><ShoppingCart className="mb-3 h-8 w-8 text-subtle" /><p className="ruth-type-card-title text-main">Bu aralıkta sepet yok</p></div> : <div className="space-y-3">{carts.map((cart) => <article key={cart.session_id} className="overflow-hidden radius-card border border-border-subtle bg-surface-primary"><div className="flex items-center justify-between gap-3 border-b border-border-subtle px-3.5 py-3"><p className="ruth-type-card-title text-main">Sepet #{shortSession(cart.session_id)}</p><span className="ruth-type-caption shrink-0 text-subtle">{dateTime(cart.last_activity_at)}</span></div><div className="px-3.5 py-3"><div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 ruth-type-caption text-muted"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5 text-subtle" />{dateTime(cart.created_at)}</span><span className="inline-flex items-center gap-1"><Smartphone className="h-3.5 w-3.5 text-subtle" />{deviceLabel(cart.device_type)}</span><span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">{sourceLabel(cart.source)}</span></div><div className="space-y-2">{cart.items.map((item, index) => <div key={`${cart.session_id}-${item.product_slug}-${item.variant_id || "standard"}-${index}`} className="flex items-center gap-3 radius-small bg-surface-secondary p-2.5"><ProductImage item={item} /><div className="min-w-0 flex-1"><p className="ruth-type-table truncate font-semibold text-main">{item.product_name}</p><p className="ruth-type-caption mt-0.5 text-muted">{item.quantity} adet</p></div><p className="ruth-type-price shrink-0 font-semibold text-main">{money(item.price * item.quantity)}</p></div>)}</div><div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3"><span className="ruth-type-caption text-muted">{cart.quantity} ürün</span><span className="ruth-type-price font-bold text-main">{money(cart.estimated_amount)}</span></div></div></article>)}</div>}
    </ExactLargePopup>
  );
}
