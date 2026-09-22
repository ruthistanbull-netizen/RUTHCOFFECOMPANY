"use client";

import { ArrowLeft, CalendarClock, Mail, MapPin, Phone, RefreshCw, Save, ShoppingBag, StickyNote } from "lucide-react";
import { useSaveLifecycle, useSaveLifecycleSource } from "@ruth-commerce/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactDetailDrawer, ExactField, ExactIconButton, ExactPageHeader, ExactSearchInput, ExactSegmentedControl, ExactSkeleton, ExactStatusBadge, exactFormInputClass, useExactToast } from "./primitives";
import { ExactAvatar, ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn } from "./data";

type OrderItem = { id: string; product_name: string; variant_name?: string | null; quantity: number; unit_price: number; total_price: number };
type CrmOrder = { id: string; order_no: string; customer_name: string; customer_email?: string | null; customer_phone?: string | null; total_amount: number; currency: string; status: string; payment_status: string; created_at: string; shipping_status?: string | null; basit_kargo_order_id?: string | null; basit_kargo_barcode?: string | null; cargo_tracking_no?: string | null; admin_note?: string | null; reminder_note?: string | null; reminder_at?: string | null; shipping_address_text?: string | null; shipping_city?: string | null; shipping_town?: string | null; shipping_neighborhood?: string | null; shipping_address_line?: string | null; shipping_postal_code?: string | null; order_items?: OrderItem[] };
type ReminderFilter = "all" | "upcoming" | "overdue" | "without";
type CrmDraft = { note: string; reminderNote: string; reminderAt: string };

const emptyDraft: CrmDraft = { note: "", reminderNote: "", reminderAt: "" };

function address(order: CrmOrder) { return [order.shipping_neighborhood, order.shipping_address_line, [order.shipping_town, order.shipping_city].filter(Boolean).join(" / "), order.shipping_postal_code].filter(Boolean).join(", ") || order.shipping_address_text || "Adres bilgisi yok"; }
function overdue(order: CrmOrder) { if (!order.reminder_at) return false; const time = new Date(order.reminder_at).getTime(); return Number.isFinite(time) && time <= Date.now(); }
function upcoming(order: CrmOrder) { if (!order.reminder_at) return false; const time = new Date(order.reminder_at).getTime(); return Number.isFinite(time) && time > Date.now(); }
function datetimeLocal(value?: string | null) { if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function preset(days: number, hour: number) { const date = new Date(); date.setDate(date.getDate() + days); date.setHours(hour, 0, 0, 0); if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1); return datetimeLocal(date.toISOString()); }
function money(value: number, currency = "TRY") { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY", maximumFractionDigits: 0 }).format(Number(value || 0)); }
function dateTime(value?: string | null) { const date = new Date(value || ""); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
function statusLabel(value: string) { const key = String(value || "").toLowerCase(); if (["delivered", "completed", "fulfilled"].includes(key)) return "Teslim edildi"; if (["shipped", "in_transit"].includes(key)) return "Gönderildi"; if (["ready", "ready_to_ship", "prepared"].includes(key)) return "Kargoya hazır"; if (["preparing", "in_production", "processing"].includes(key)) return "Hazırlanıyor"; return "Yeni"; }
function draftFromOrder(order: CrmOrder): CrmDraft { return { note: order.admin_note || "", reminderNote: order.reminder_note || "", reminderAt: datetimeLocal(order.reminder_at) }; }
function draftFingerprint(draft: CrmDraft) { return JSON.stringify(draft); }

export function ExactCRM() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useExactToast();
  const { save: saveLifecycle, requestTransition, saving } = useSaveLifecycle();
  const routeQuery = searchParams.get("q") || "";
  const [orders, setOrders] = useState<CrmOrder[]>([]);
  const [query, setQuery] = useState(routeQuery);
  const [filter, setFilter] = useState<ReminderFilter>("all");
  const [selected, setSelected] = useState<CrmOrder | null>(null);
  const [draft, setDraft] = useState<CrmDraft>({ ...emptyDraft });
  const [savedDraft, setSavedDraft] = useState<CrmDraft>({ ...emptyDraft });
  const [loading, setLoading] = useState(true);
  const selectedRef = useRef<CrmOrder | null>(null);
  const dirtyRef = useRef(false);
  selectedRef.current = selected;

  const draftDirty = Boolean(selected) && draftFingerprint(draft) !== draftFingerprint(savedDraft);
  dirtyRef.current = draftDirty;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range: "all", payment: "all", q: query.trim() });
      const result = await adminRequest<{ orders?: CrmOrder[] }>(`/api/orders?${params.toString()}`);
      const next = result.orders || [];
      setOrders(next);
      const current = selectedRef.current;
      if (current) {
        const refreshed = next.find((order) => order.id === current.id) || current;
        setSelected(refreshed);
        selectedRef.current = refreshed;
        if (!dirtyRef.current) {
          const baseline = draftFromOrder(refreshed);
          setDraft(baseline);
          setSavedDraft(baseline);
        }
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "CRM kayıtları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [query, toast]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), query ? 250 : 0); return () => window.clearTimeout(timer); }, [load, query]);
  useEffect(() => setQuery(routeQuery), [routeQuery]);

  const visible = useMemo(() => orders.filter((order) => filter === "upcoming" ? upcoming(order) : filter === "overdue" ? overdue(order) : filter === "without" ? !order.reminder_at : true), [filter, orders]);
  const metrics = useMemo(() => ({ upcoming: orders.filter(upcoming).length, overdue: orders.filter(overdue).length, notes: orders.filter((order) => Boolean(order.admin_note?.trim())).length, without: orders.filter((order) => !order.reminder_at).length }), [orders]);

  const acceptOrder = useCallback((order: CrmOrder) => {
    const baseline = draftFromOrder(order);
    selectedRef.current = order;
    setSelected(order);
    setDraft(baseline);
    setSavedDraft(baseline);
  }, []);

  const selectOrder = (order: CrmOrder) => {
    if (saving || selected?.id === order.id) return;
    void requestTransition(() => acceptOrder(order));
  };

  const closeImmediately = useCallback(() => {
    selectedRef.current = null;
    setSelected(null);
    setDraft({ ...emptyDraft });
    setSavedDraft({ ...emptyDraft });
  }, []);

  const requestClose = useCallback(() => {
    if (saving) return;
    void requestTransition(closeImmediately);
  }, [closeImmediately, requestTransition, saving]);

  const validateDraft = useCallback(() => {
    if (!selected) return false;
    if (draft.reminderAt && new Date(draft.reminderAt).getTime() <= Date.now()) {
      toast.error("Hatırlatma zamanı geçmiş bir tarih olamaz.");
      return false;
    }
    return true;
  }, [draft.reminderAt, selected, toast]);

  const persistDraft = useCallback(async () => {
    if (!selected) return false;
    try {
      const reminderIso = draft.reminderAt ? new Date(draft.reminderAt).toISOString() : null;
      await adminRequest("/api/orders", {
        method: "PATCH",
        body: JSON.stringify({ id: selected.id, admin_note: draft.note, reminder_note: draft.reminderNote, reminder_at: reminderIso }),
      });
      const nextOrder = { ...selected, admin_note: draft.note, reminder_note: draft.reminderNote, reminder_at: reminderIso };
      setOrders((current) => current.map((order) => order.id === selected.id ? nextOrder : order));
      setSelected(nextOrder);
      selectedRef.current = nextOrder;
      setSavedDraft({ ...draft });
      toast.success(`${selected.order_no} CRM notu ve hatırlatması kaydedildi.`);
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "CRM bilgileri kaydedilemedi.");
      return false;
    }
  }, [draft, selected, toast]);

  const discardDraft = useCallback(() => {
    setDraft({ ...savedDraft });
  }, [savedDraft]);

  useSaveLifecycleSource({
    id: "crm-order-editor",
    dirty: draftDirty,
    validate: validateDraft,
    save: persistDraft,
    discard: discardDraft,
  });

  const columns: ExactColumn<CrmOrder>[] = [
    { key: "customer_name", label: "Müşteri", sortable: true, render: (order) => <div className="flex items-center gap-2"><ExactAvatar name={order.customer_name || "?"} size="sm" /><div><p className="ruth-type-table font-medium text-main">{order.customer_name}</p><p className="ruth-type-caption text-subtle">{order.customer_phone || order.customer_email || "İletişim yok"}</p></div></div> },
    { key: "order_no", label: "Sipariş", sortable: true, render: (order) => <div><p className="ruth-type-table font-semibold text-main">#{order.order_no}</p><p className="ruth-type-code text-subtle">{dateTime(order.created_at)}</p></div> },
    { key: "total_amount", label: "Tutar", sortable: true, align: "right", render: (order) => <span className="ruth-type-price text-main">{money(order.total_amount, order.currency)}</span> },
    { key: "status", label: "Durum", align: "center", render: (order) => <ExactStatusBadge status={order.status} label={statusLabel(order.status)} size="sm" /> },
    { key: "reminder_at", label: "Hatırlatma", render: (order) => order.reminder_at ? <ExactStatusBadge status={overdue(order) ? "failed" : "ready_to_ship"} label={`${overdue(order) ? "Gecikmiş" : "Planlı"} · ${dateTime(order.reminder_at)}`} size="sm" /> : <span className="ruth-type-caption text-subtle">Yok</span> },
  ];

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="crm">
    <ExactPageHeader title="CRM ve Hatırlatmalar" subtitle={`${visible.length} sipariş kaydı`} actions={<><ExactButton variant="secondary" size="sm" onClick={() => void requestTransition(() => router.push("/customers"))} disabled={saving}><ArrowLeft className="h-4 w-4" /> Müşteriler</ExactButton><ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load()} loading={loading} /></>} />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><button type="button" onClick={() => setFilter(filter === "upcoming" ? "all" : "upcoming")}><ExactMetricCard label="Yaklaşan" value={metrics.upcoming} icon={CalendarClock} className={filter === "upcoming" ? "ring-2 ring-accent" : ""} /></button><button type="button" onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")}><ExactMetricCard label="Geciken" value={metrics.overdue} icon={CalendarClock} className={filter === "overdue" ? "ring-2 ring-accent" : ""} /></button><ExactMetricCard label="Notlu Sipariş" value={metrics.notes} icon={StickyNote} /><button type="button" onClick={() => setFilter(filter === "without" ? "all" : "without")}><ExactMetricCard label="Hatırlatmasız" value={metrics.without} icon={ShoppingBag} className={filter === "without" ? "ring-2 ring-accent" : ""} /></button></div>
    <div className="space-y-3"><ExactSearchInput value={query} onChange={setQuery} placeholder="Sipariş, müşteri, e-posta veya telefon ara..." /><ExactSegmentedControl size="sm" value={filter} onChange={(value) => setFilter(value as ReminderFilter)} options={[{ value: "all", label: "Tümü" }, { value: "upcoming", label: "Yaklaşan" }, { value: "overdue", label: "Geciken" }, { value: "without", label: "Hatırlatmasız" }]} /></div>
    {loading ? <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div> : <ExactDataTable columns={columns} data={visible} onRowClick={selectOrder} emptyState={<ExactEmptyState icon={CalendarClock} title="Bu filtrede CRM kaydı yok" />} />}
    <ExactDetailDrawer open={Boolean(selected)} onClose={requestClose} title={selected ? `CRM · #${selected.order_no}` : "CRM"} subtitle={selected?.customer_name} width={660} footer={selected ? <div className="flex gap-2"><ExactButton variant="secondary" size="sm" className="flex-1" onClick={requestClose} disabled={saving}>Kapat</ExactButton><ExactButton size="sm" className="flex-1" onClick={() => void saveLifecycle()} loading={saving}><Save className="h-4 w-4" /> Kaydet</ExactButton></div> : null}>
      {selected ? <div className="space-y-5"><section><div className="flex items-center gap-3"><ExactAvatar name={selected.customer_name || "?"} size="lg" /><div><p className="ruth-type-card-title text-main">{selected.customer_name}</p>{selected.customer_phone ? <a href={`tel:${selected.customer_phone}`} className="ruth-type-caption flex items-center gap-1 text-muted"><Phone className="h-3 w-3" /> {selected.customer_phone}</a> : null}{selected.customer_email ? <a href={`mailto:${selected.customer_email}`} className="ruth-type-caption flex items-center gap-1 text-muted"><Mail className="h-3 w-3" /> {selected.customer_email}</a> : null}</div></div><div className="mt-3 p-3 radius-small bg-surface-secondary"><p className="ruth-type-label flex items-center gap-1 uppercase text-subtle"><MapPin className="h-3 w-3" /> Teslimat adresi</p><p className="ruth-type-body mt-1 text-main">{address(selected)}</p></div></section><div className="grid grid-cols-3 gap-2"><div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Sipariş</p><p className="ruth-type-price font-bold text-main">{money(selected.total_amount, selected.currency)}</p></div><div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Durum</p><ExactStatusBadge status={selected.status} label={statusLabel(selected.status)} size="sm" /></div><div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Ürün</p><p className="ruth-type-table font-bold text-main">{(selected.order_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0)} adet</p></div></div><ExactField label="Operasyon / müşteri notu"><textarea rows={5} value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} className={`${exactFormInputClass} min-h-28`} placeholder="Müşteri tercihi, ölçü bilgisi, görüşme sonucu..." /></ExactField><ExactField label="Hatırlatma notu"><textarea rows={3} value={draft.reminderNote} onChange={(event) => setDraft((current) => ({ ...current, reminderNote: event.target.value }))} className={`${exactFormInputClass} min-h-20`} placeholder="Örn. Değişim ölçüsü için müşteriyi ara" /></ExactField><ExactField label="Hatırlatma zamanı"><input type="datetime-local" value={draft.reminderAt} onChange={(event) => setDraft((current) => ({ ...current, reminderAt: event.target.value }))} className={exactFormInputClass} /></ExactField><div className="flex flex-wrap gap-2"><ExactButton variant="tertiary" size="sm" onClick={() => setDraft((current) => ({ ...current, reminderAt: preset(0, 15) }))}>Bugün 15:00</ExactButton><ExactButton variant="tertiary" size="sm" onClick={() => setDraft((current) => ({ ...current, reminderAt: preset(1, 10) }))}>Yarın 10:00</ExactButton><ExactButton variant="tertiary" size="sm" onClick={() => setDraft((current) => ({ ...current, reminderAt: preset(3, 10) }))}>3 gün sonra</ExactButton><ExactButton variant="tertiary" size="sm" onClick={() => setDraft((current) => ({ ...current, reminderAt: "", reminderNote: "" }))}>Temizle</ExactButton></div></div> : null}
    </ExactDetailDrawer>
  </div>;
}
