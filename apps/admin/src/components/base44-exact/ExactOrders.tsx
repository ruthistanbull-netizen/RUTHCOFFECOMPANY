"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  Mail,
  MapPin,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShoppingBag,
  Trash2,
  Truck,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAuthHeaders, adminRequest, apiUrl } from "@/lib/adminApi";
import { dateRangeParam, type AdminDateRangeValue } from "@/components/DateRangeControl";
import {
  ExactButton,
  ExactDetailDrawer,
  ExactField,
  ExactFilterBar,
  ExactFormModal,
  ExactIconButton,
  ExactPageHeader,
  ExactSearchInput,
  ExactSkeleton,
  ExactStatusBadge,
  exactFormInputClass,
  useExactToast,
} from "./primitives";
import { ExactAvatar, ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn } from "./data";

type OrderItem = {
  id?: string;
  product_id?: string | null;
  variant_id?: string | null;
  product_slug?: string | null;
  product_name: string;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url?: string | null;
};

type ProductVariant = { id: string; option_summary: string; price: number; image_url?: string | null; is_active?: boolean };
type Product = { id: string; name: string; slug: string; price: number; currency?: string; main_image_url?: string | null; product_variants?: ProductVariant[] };

type Order = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  total_amount: number;
  subtotal?: number | null;
  shipping_fee?: number | null;
  discount_total?: number | null;
  tax_total?: number | null;
  currency: string;
  status: string;
  payment_status: string;
  created_at: string;
  cargo_company?: string | null;
  cargo_tracking_no?: string | null;
  shipping_status?: string | null;
  shipping_status_label?: string | null;
  shipping_error?: string | null;
  shipping_price?: number | null;
  basit_kargo_order_id?: string | null;
  basit_kargo_barcode?: string | null;
  shipping_address_text?: string | null;
  shipping_city?: string | null;
  shipping_town?: string | null;
  shipping_address_line?: string | null;
  customer_note?: string | null;
  admin_note?: string | null;
  reminder_note?: string | null;
  reminder_at?: string | null;
  review_email_status?: string | null;
  review_email_sent_at?: string | null;
  imported_source?: string | null;
  traffic_source?: string | null;
  traffic_campaign?: string | null;
  order_items?: OrderItem[];
};

type StatusFilter = "all" | "new" | "preparing" | "ready" | "shipped" | "delivered" | "attention";
type PaymentFilter = "all" | "paid" | "waiting" | "failed";

const orderStatusOptions = [
  { value: "awaiting_payment", label: "Ödeme bekleniyor" },
  { value: "paid", label: "Yeni sipariş" },
  { value: "in_production", label: "Hazırlanıyor" },
  { value: "ready_to_ship", label: "Kargoya hazır" },
  { value: "shipped", label: "Gönderildi" },
  { value: "delivered", label: "Teslim edildi" },
  { value: "cancelled", label: "İptal edildi" },
];
const paymentOptions = ["pending", "paid", "failed", "cancelled", "refunded"];

function normalize(value: unknown) { return String(value || "").trim().toLowerCase(); }
function paid(order: Order) { return ["paid", "succeeded", "success"].includes(normalize(order.payment_status)); }
function manualOrder(order: Order) { return normalize(order.imported_source) === "manual" || String(order.order_no || "").toLocaleUpperCase("tr-TR").startsWith("MAN"); }
function shipmentExists(order: Order) { return Boolean(order.basit_kargo_order_id || order.basit_kargo_barcode || order.cargo_tracking_no); }
function itemCount(order: Order) { return (order.order_items || []).reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0); }
function attention(order: Order) { return Boolean(order.shipping_error) || ["failed", "rejected", "requires_action"].includes(normalize(order.payment_status)); }
function stateGroup(order: Order) {
  const value = normalize(order.status);
  if (["created", "new", "paid", "confirmed"].includes(value)) return "new";
  if (["preparing", "queued", "in_production", "quality_control", "processing"].includes(value)) return "preparing";
  if (["prepared", "ready", "ready_to_ship", "label_created", "ready_for_handover"].includes(value)) return "ready";
  if (["shipped", "in_transit", "out_for_delivery"].includes(value)) return "shipped";
  if (["delivered", "completed", "fulfilled"].includes(value)) return "delivered";
  return value;
}
function statusForEditor(order: Order) {
  const value = normalize(order.status);
  if (["awaiting_payment", "pending", "waiting"].includes(value)) return "awaiting_payment";
  if (["created", "new", "paid", "confirmed"].includes(value)) return paid(order) ? "paid" : "awaiting_payment";
  if (["preparing", "queued", "in_production", "quality_control", "processing"].includes(value)) return "in_production";
  if (["prepared", "ready", "ready_to_ship", "label_created", "ready_for_handover"].includes(value)) return "ready_to_ship";
  if (["shipped", "in_transit", "out_for_delivery"].includes(value)) return "shipped";
  if (["delivered", "completed", "fulfilled"].includes(value)) return "delivered";
  if (["cancelled", "canceled"].includes(value)) return "cancelled";
  return paid(order) ? "paid" : "awaiting_payment";
}
function statusLabel(value: string) { return orderStatusOptions.find((option) => option.value === statusForEditor({ status: value, payment_status: "paid" } as Order))?.label || value || "Yeni"; }
function paymentLabel(value: string) {
  const labels: Record<string, string> = { pending: "Ödeme Bekleniyor", waiting: "Ödeme Bekleniyor", paid: "Ödendi", succeeded: "Ödendi", success: "Ödendi", failed: "Başarısız", rejected: "Başarısız", refunded: "İade edildi", cancelled: "İptal" };
  return labels[normalize(value)] || value || "Bekliyor";
}
function money(value: number, currency = "TRY") { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY", maximumFractionDigits: 2 }).format(Number(value || 0)); }
function dateTime(value?: string | null) { const date = new Date(value || ""); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
function relative(value: string) { const date = new Date(value); const diff = Date.now() - date.getTime(); const minutes = Math.max(0, Math.floor(diff / 60_000)); if (minutes < 60) return `${minutes} dk önce`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} sa önce`; return dateTime(value); }
function address(order: Order) { return [order.shipping_address_line || order.shipping_address_text, [order.shipping_town, order.shipping_city].filter(Boolean).join(" / ")].filter(Boolean).join(", ") || "Adres bilgisi yok"; }
function datetimeLocal(value?: string | null) { if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function normalizeItem(item: OrderItem): OrderItem { const quantity = Math.max(1, Math.trunc(Number(item.quantity || 1))); const unitPrice = Math.max(0, Number(item.unit_price || 0)); return { ...item, quantity, unit_price: unitPrice, total_price: quantity * unitPrice }; }

function RangeSelect({ value, onChange }: { value: AdminDateRangeValue; onChange: (value: AdminDateRangeValue) => void }) {
  return <select value={value.range} onChange={(event) => onChange({ ...value, range: event.target.value as AdminDateRangeValue["range"] })} className="h-8 px-3 radius-small bg-surface-secondary border border-border-subtle text-xs text-main"><option value="today">Bugün</option><option value="this_week">Bu hafta</option><option value="this_month">Bu ay</option><option value="last_30_days">Son 30 gün</option><option value="last_90_days">Son 90 gün</option></select>;
}

export function ExactOrders() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useExactToast();
  const queue = searchParams.get("queue") as StatusFilter | null;
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState(searchParams.get("q")?.trim() || "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(queue && ["new", "preparing", "ready", "shipped", "delivered", "attention"].includes(queue) ? queue : "all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [range, setRange] = useState<AdminDateRangeValue>({ range: "this_month", from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [detailStatus, setDetailStatus] = useState("paid");
  const [detailPayment, setDetailPayment] = useState("pending");
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [editingItems, setEditingItems] = useState(false);
  const [draftItems, setDraftItems] = useState<OrderItem[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [confirm, setConfirm] = useState<null | { title: string; message: string; action: () => Promise<void>; destructive?: boolean }>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ orders?: Order[] }>(`/api/orders?range=${encodeURIComponent(dateRangeParam(range))}&payment=all&q=`);
      const next = Array.isArray(result.orders) ? result.orders : [];
      setOrders(next);
      setSelected((current) => current ? next.find((order) => order.id === current.id) || current : current);
      return next;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Siparişler alınamadı.");
      return [];
    } finally {
      setLoading(false);
    }
  }, [range, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setQuery(searchParams.get("q")?.trim() || ""); }, [searchParams]);

  const openDetail = (order: Order) => {
    setSelected(order);
    setDetailStatus(statusForEditor(order));
    setDetailPayment(normalize(order.payment_status) || "pending");
    setNotifyCustomer(false);
    setAdminNote(order.admin_note || "");
    setReminderNote(order.reminder_note || "");
    setReminderAt(datetimeLocal(order.reminder_at));
    setDraftItems((order.order_items || []).map((item) => normalizeItem({ ...item })));
    setEditingItems(false);
    setProductQuery("");
    setProducts([]);
    const params = new URLSearchParams(searchParams.toString());
    params.set("order", order.id);
    router.replace(`/orders?${params.toString()}`, { scroll: false });
  };
  const closeDetail = () => {
    setSelected(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("order");
    router.replace(params.toString() ? `/orders?${params.toString()}` : "/orders", { scroll: false });
  };

  useEffect(() => {
    const orderId = searchParams.get("order");
    if (!orderId || !orders.length || selected?.id === orderId) return;
    const order = orders.find((item) => item.id === orderId);
    if (order) openDetail(order);
  }, [orders]);

  const visibleOrders = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return orders.filter((order) => {
      const searchable = [order.order_no, order.customer_name, order.customer_email, order.customer_phone, order.cargo_tracking_no, order.basit_kargo_barcode].join(" ").toLocaleLowerCase("tr-TR");
      if (needle && !searchable.includes(needle)) return false;
      if (statusFilter !== "all" && statusFilter !== "attention" && stateGroup(order) !== statusFilter) return false;
      if (statusFilter === "attention" && !attention(order)) return false;
      if (paymentFilter === "paid" && !paid(order)) return false;
      if (paymentFilter === "waiting" && !["pending", "waiting", "requires_action"].includes(normalize(order.payment_status))) return false;
      if (paymentFilter === "failed" && !["failed", "rejected"].includes(normalize(order.payment_status))) return false;
      return true;
    });
  }, [orders, paymentFilter, query, statusFilter]);

  const metrics = useMemo(() => ({
    newOrders: orders.filter((order) => stateGroup(order) === "new" && paid(order)).length,
    preparing: orders.filter((order) => stateGroup(order) === "preparing").length,
    ready: orders.filter((order) => stateGroup(order) === "ready").length,
    attention: orders.filter(attention).length,
  }), [orders]);

  const patchOrder = async (order: Order, patch: Record<string, unknown>, successMessage: string) => {
    setBusy(`order:${order.id}`);
    try {
      const result = await adminRequest<{ warning?: string; notification?: { sent?: boolean } }>("/api/orders/manual-update", { method: "PATCH", body: JSON.stringify({ id: order.id, ...patch }) });
      await load();
      toast.success(`${successMessage}${result.warning ? ` ${result.warning}` : ""}${patch.notify_customer && result.notification?.sent ? " Müşteriye e-posta gönderildi." : ""}`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Sipariş güncellenemedi.");
      throw caught;
    } finally {
      setBusy(null);
    }
  };

  const saveInspector = async () => {
    if (!selected) return;
    if (reminderAt && new Date(reminderAt).getTime() <= Date.now()) { toast.error("Hatırlatma zamanı geçmiş bir tarih olamaz."); return; }
    if (editingItems && !draftItems.length) { toast.error("Siparişte en az bir ürün olmalı."); return; }
    const patch: Record<string, unknown> = {
      status: detailStatus,
      admin_override: true,
      notify_customer: notifyCustomer,
      status_reason: "Sipariş detay ekranından manuel durum değişikliği",
      admin_note: adminNote,
      reminder_note: reminderNote,
      reminder_at: reminderAt ? new Date(reminderAt).toISOString() : null,
    };
    if (manualOrder(selected)) patch.payment_status = detailPayment;
    if (editingItems) patch.order_items = draftItems.map(normalizeItem);
    await patchOrder(selected, patch, `${selected.order_no} değişiklikleri kaydedildi.`);
    setEditingItems(false);
    setNotifyCustomer(false);
  };

  const createShipment = async (order: Order) => {
    if (!order.shipping_city || !(order.shipping_address_line || order.shipping_address_text)) { toast.error(`${order.order_no} için il ve açık adres tamamlanmadan kargo oluşturulamaz.`); openDetail(order); return; }
    setBusy(`shipping:${order.id}`);
    try {
      await adminRequest("/api/shipping/basit-kargo/shipments", { method: "POST", body: JSON.stringify({ orderId: order.id, handlerCode: "ECONOMIC", handlerName: "En Ekonomik (Otomatik)", quotedPrice: null, packages: [{ height: 1, width: 1, depth: 1, weight: 1 }], recipient: { city: order.shipping_city || "", town: order.shipping_town || "", address: order.shipping_address_line || order.shipping_address_text || "" } }) });
      await load(); toast.success(`${order.order_no} için kargo kodu oluşturuldu.`);
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Kargo oluşturulamadı."); } finally { setBusy(null); }
  };
  const openLabel = async (order: Order) => {
    setBusy(`label:${order.id}`);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch(apiUrl(`/api/shipping/basit-kargo/shipments/${order.id}/label`), { headers });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Kargo etiketi alınamadı.");
      const url = URL.createObjectURL(await response.blob()); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Kargo etiketi alınamadı."); } finally { setBusy(null); }
  };
  const syncShipment = async (order: Order) => {
    setBusy(`sync:${order.id}`);
    try { await adminRequest(`/api/shipping/basit-kargo/shipments/${order.id}/sync`, { method: "POST", body: "{}" }); await load(); toast.success("Kargo durumu güncellendi."); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "Kargo durumu güncellenemedi."); } finally { setBusy(null); }
  };
  const sendReview = async (order: Order) => {
    setBusy(`review:${order.id}`);
    try { const result = await adminRequest<{ sent?: number; error?: string }>("/api/review-automation/send", { method: "POST", body: JSON.stringify({ order_ids: [order.id] }) }); if (!result.sent) throw new Error(result.error || "Değerlendirme maili gönderilemedi."); toast.success("Değerlendirme maili gönderildi."); await load(); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "Değerlendirme maili gönderilemedi."); } finally { setBusy(null); }
  };

  const searchProducts = async (value: string) => {
    setProductQuery(value);
    if (value.trim().length < 2) { setProducts([]); return; }
    setSearchingProducts(true);
    try { const result = await adminRequest<{ products?: Product[] }>(`/api/products?q=${encodeURIComponent(value.trim())}`); setProducts((result.products || []).slice(0, 12)); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "Ürünler aranamadı."); } finally { setSearchingProducts(false); }
  };
  const addProduct = (product: Product, variant?: ProductVariant) => {
    const price = Number(variant?.price ?? product.price ?? 0);
    const key = `${product.id}:${variant?.id || "standard"}`;
    setDraftItems((current) => {
      const index = current.findIndex((item) => `${item.product_id}:${item.variant_id || "standard"}` === key);
      if (index >= 0) return current.map((item, itemIndex) => itemIndex === index ? normalizeItem({ ...item, quantity: item.quantity + 1 }) : item);
      return [...current, normalizeItem({ product_id: product.id, product_slug: product.slug, variant_id: variant?.id || null, product_name: product.name, variant_name: variant?.option_summary || null, quantity: 1, unit_price: price, total_price: price, image_url: variant?.image_url || product.main_image_url || null })];
    });
    setProductQuery(""); setProducts([]);
  };

  const exportCsv = () => {
    const rows = [["Sipariş", "Müşteri", "Tarih", "Toplam", "Ödeme", "Durum"], ...visibleOrders.map((order) => [order.order_no, order.customer_name, order.created_at, String(order.total_amount), order.payment_status, order.status])];
    const csv = rows.map((row) => row.map((value) => `"${String(value || "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `ruth-orders-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const columns: ExactColumn<Order>[] = [
    { key: "order_no", label: "Sipariş", sortable: true, render: (order) => <span className="font-semibold text-main">#{order.order_no}</span> },
    { key: "customer_name", label: "Müşteri", sortable: true, render: (order) => <div className="flex items-center gap-2"><ExactAvatar name={order.customer_name || "?"} size="xs" /><div className="min-w-0"><p className="text-sm font-medium text-main truncate">{order.customer_name || "İsimsiz müşteri"}</p><p className="text-[10px] text-subtle truncate">{order.customer_email || order.customer_phone || "İletişim yok"}</p></div></div> },
    { key: "created_at", label: "Tarih", sortable: true, render: (order) => <span className="text-muted text-xs">{relative(order.created_at)}</span> },
    { key: "total_amount", label: "Toplam", sortable: true, align: "right", render: (order) => <span className="font-semibold text-main">{money(order.total_amount, order.currency)}</span> },
    { key: "payment_status", label: "Ödeme", align: "center", render: (order) => <ExactStatusBadge status={order.payment_status} label={paymentLabel(order.payment_status)} size="sm" /> },
    { key: "status", label: "Operasyon", align: "center", render: (order) => <ExactStatusBadge status={order.status} label={statusLabel(order.status)} size="sm" /> },
    { key: "shipping_status", label: "Kargo", align: "center", render: (order) => <ExactStatusBadge status={order.shipping_status || (shipmentExists(order) ? "ready_to_ship" : "pending")} label={order.shipping_status_label || (shipmentExists(order) ? "Kargo oluştu" : "Bekliyor")} size="sm" /> },
  ];

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="orders">
      <ExactPageHeader title="Siparişler" subtitle={`${visibleOrders.length} sipariş`} actions={<><RangeSelect value={range} onChange={setRange} /><ExactButton variant="secondary" size="sm" onClick={exportCsv}><Download className="h-4 w-4" /> Dışa aktar</ExactButton><ExactButton size="sm" onClick={() => router.push("/orders/new")}><Plus className="h-4 w-4" /> Manuel sipariş</ExactButton></>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button type="button" onClick={() => setStatusFilter(statusFilter === "new" ? "all" : "new")}><ExactMetricCard label="Yeni Sipariş" value={metrics.newOrders} icon={ShoppingBag} className={statusFilter === "new" ? "ring-2 ring-accent" : ""} /></button>
        <button type="button" onClick={() => setStatusFilter(statusFilter === "preparing" ? "all" : "preparing")}><ExactMetricCard label="Hazırlanıyor" value={metrics.preparing} icon={PackageCheck} className={statusFilter === "preparing" ? "ring-2 ring-accent" : ""} /></button>
        <button type="button" onClick={() => setStatusFilter(statusFilter === "ready" ? "all" : "ready")}><ExactMetricCard label="Kargoya Hazır" value={metrics.ready} icon={Truck} className={statusFilter === "ready" ? "ring-2 ring-accent" : ""} /></button>
        <button type="button" onClick={() => setStatusFilter(statusFilter === "attention" ? "all" : "attention")}><ExactMetricCard label="İşlem Gerektiren" value={metrics.attention} icon={AlertCircle} className={statusFilter === "attention" ? "ring-2 ring-accent" : ""} /></button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-2"><ExactSearchInput value={query} onChange={setQuery} placeholder="Sipariş no, müşteri, telefon, takip no veya barkod..." className="flex-1" /><ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load()} loading={loading} /></div>
        <ExactFilterBar chips={[
          { key: "status", label: "Tüm Durumlar", value: statusFilter === "all" ? null : statusFilter, options: [{ label: "Yeni", value: "new" }, { label: "Hazırlanıyor", value: "preparing" }, { label: "Kargoya hazır", value: "ready" }, { label: "Gönderildi", value: "shipped" }, { label: "Teslim edildi", value: "delivered" }, { label: "İşlem gerekli", value: "attention" }] },
          { key: "payment", label: "Tüm Ödemeler", value: paymentFilter === "all" ? null : paymentFilter, options: [{ label: "Ödendi", value: "paid" }, { label: "Bekliyor", value: "waiting" }, { label: "Başarısız", value: "failed" }] },
        ]} onChipChange={(key, value) => key === "status" ? setStatusFilter((value || "all") as StatusFilter) : setPaymentFilter((value || "all") as PaymentFilter)} />
      </div>

      {loading ? <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div> : <ExactDataTable columns={columns} data={visibleOrders} onRowClick={openDetail} emptyState={<ExactEmptyState icon={ShoppingBag} title="Bu filtrede sipariş yok" description="Arama veya filtreleri değiştir." />} mobileCard={(order) => <button type="button" onClick={() => openDetail(order)} className="w-full text-left bg-surface-primary radius-card shadow-card p-3.5 active:scale-[0.98] transition-transform"><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><ExactAvatar name={order.customer_name || "?"} size="xs" /><div><p className="font-semibold text-sm text-main">#{order.order_no}</p><p className="text-[11px] text-muted">{order.customer_name}</p></div></div><span className="font-bold text-sm text-main">{money(order.total_amount, order.currency)}</span></div><div className="flex flex-wrap gap-1.5"><ExactStatusBadge status={order.payment_status} label={paymentLabel(order.payment_status)} size="sm" /><ExactStatusBadge status={order.status} label={statusLabel(order.status)} size="sm" />{attention(order) ? <ExactStatusBadge status="failed" label="Kontrol" tone="danger" size="sm" /> : null}</div><p className="text-[10px] text-subtle mt-2">{relative(order.created_at)} · {itemCount(order)} ürün</p></button>} />}

      <ExactDetailDrawer open={Boolean(selected)} onClose={closeDetail} title={selected ? `Sipariş #${selected.order_no}` : "Sipariş"} subtitle={selected ? `${selected.customer_name} · ${dateTime(selected.created_at)}` : undefined} width={720} footer={selected ? <div className="flex items-center gap-2"><ExactButton variant="secondary" size="sm" onClick={closeDetail} className="flex-1">Kapat</ExactButton><ExactButton size="sm" onClick={() => void saveInspector()} loading={busy === `order:${selected.id}`} className="flex-1"><Save className="h-4 w-4" /> Değişiklikleri kaydet</ExactButton></div> : null}>
        {selected ? <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2"><div className="p-3 radius-small bg-surface-secondary"><p className="text-[10px] text-subtle uppercase">Toplam</p><p className="text-base font-bold text-main">{money(selected.total_amount, selected.currency)}</p></div><div className="p-3 radius-small bg-surface-secondary"><p className="text-[10px] text-subtle uppercase">Ödeme</p><ExactStatusBadge status={selected.payment_status} label={paymentLabel(selected.payment_status)} size="sm" /></div><div className="p-3 radius-small bg-surface-secondary"><p className="text-[10px] text-subtle uppercase">Durum</p><ExactStatusBadge status={selected.status} label={statusLabel(selected.status)} size="sm" /></div></div>

          <section><div className="flex items-center gap-2 mb-2"><PackageCheck className="h-3.5 w-3.5 text-subtle" /><h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Operasyon</h4></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><ExactField label="Sipariş durumu"><select value={detailStatus} onChange={(event) => setDetailStatus(event.target.value)} className={exactFormInputClass}>{orderStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></ExactField>{manualOrder(selected) ? <ExactField label="Manuel ödeme durumu"><select value={detailPayment} onChange={(event) => setDetailPayment(event.target.value)} className={exactFormInputClass}>{paymentOptions.map((value) => <option key={value} value={value}>{paymentLabel(value)}</option>)}</select></ExactField> : <ExactField label="Ödeme durumu"><div className="h-10 flex items-center"><ExactStatusBadge status={selected.payment_status} label={paymentLabel(selected.payment_status)} /></div></ExactField>}</div><label className="mt-3 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={notifyCustomer} onChange={(event) => setNotifyCustomer(event.target.checked)} /> Durum değişikliğini müşteriye e-posta ile bildir</label></section>

          <section><div className="flex items-center justify-between gap-2 mb-2"><div className="flex items-center gap-2"><ShoppingBag className="h-3.5 w-3.5 text-subtle" /><h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Ürünler</h4></div><ExactButton variant="tertiary" size="sm" onClick={() => setEditingItems((current) => !current)}><Pencil className="h-3.5 w-3.5" /> {editingItems ? "Düzenlemeyi kapat" : "İçeriği düzenle"}</ExactButton></div>
            <div className="space-y-2">{(editingItems ? draftItems : selected.order_items || []).map((item, index) => <div key={`${item.id || item.product_id}-${index}`} className="flex items-center gap-3 p-2.5 radius-small bg-surface-secondary"><div className="h-11 w-11 radius-small bg-surface-tertiary overflow-hidden shrink-0">{item.image_url ? <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-subtle">R</div>}</div><div className="flex-1 min-w-0"><p className="text-sm font-medium text-main truncate">{item.product_name}</p><p className="text-[10px] text-muted">{item.variant_name || "Standart"}</p></div>{editingItems ? <><input type="number" min="1" value={item.quantity} onChange={(event) => setDraftItems((current) => current.map((candidate, itemIndex) => itemIndex === index ? normalizeItem({ ...candidate, quantity: Number(event.target.value) }) : candidate))} className="w-16 form-input" /><input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => setDraftItems((current) => current.map((candidate, itemIndex) => itemIndex === index ? normalizeItem({ ...candidate, unit_price: Number(event.target.value) }) : candidate))} className="w-24 form-input" /><ExactIconButton icon={Trash2} label="Ürünü sil" variant="ghost" size="icon-sm" onClick={() => setDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} /></> : <div className="text-right"><p className="text-sm font-semibold text-main">{money(item.total_price, selected.currency)}</p><p className="text-[10px] text-muted">{item.quantity} adet</p></div>}</div>)}</div>
            {editingItems ? <div className="mt-3 relative"><ExactSearchInput value={productQuery} onChange={(value) => void searchProducts(value)} placeholder="Siparişe ürün ekle: ad veya slug ara..." />{searchingProducts ? <ExactSkeleton className="h-10 mt-2" /> : null}{products.length ? <div className="absolute z-20 mt-1 inset-x-0 bg-surface-primary border border-border-subtle radius-control shadow-floating overflow-hidden max-h-72 overflow-y-auto">{products.map((product) => <div key={product.id} className="border-b last:border-0 border-border-subtle"><button type="button" onClick={() => product.product_variants?.filter((variant) => variant.is_active !== false).length ? undefined : addProduct(product)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-secondary"><span className="flex-1 text-sm font-medium text-main">{product.name}</span><span className="text-xs text-muted">{money(product.price, product.currency)}</span>{!product.product_variants?.length ? <Plus className="h-4 w-4 text-accent" /> : null}</button>{product.product_variants?.filter((variant) => variant.is_active !== false).map((variant) => <button key={variant.id} type="button" onClick={() => addProduct(product, variant)} className="w-full flex items-center gap-3 pl-7 pr-3 py-2 text-left hover:bg-accent-soft"><span className="flex-1 text-xs text-muted">{variant.option_summary}</span><span className="text-xs text-main">{money(variant.price, product.currency)}</span><Plus className="h-3.5 w-3.5 text-accent" /></button>)}</div>)}</div> : null}</div> : null}
          </section>

          <section><div className="flex items-center gap-2 mb-2"><UserRound className="h-3.5 w-3.5 text-subtle" /><h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Müşteri</h4></div><div className="flex items-center gap-3"><ExactAvatar name={selected.customer_name || "?"} size="md" /><div className="min-w-0"><p className="text-sm font-medium text-main">{selected.customer_name}</p><p className="text-[11px] text-muted">{selected.customer_email || "E-posta yok"}</p><p className="text-[11px] text-muted">{selected.customer_phone || "Telefon yok"}</p></div></div></section>
          <section><div className="flex items-center gap-2 mb-2"><MapPin className="h-3.5 w-3.5 text-subtle" /><h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Teslimat</h4></div><p className="text-sm text-main">{address(selected)}</p><div className="flex flex-wrap gap-2 mt-3">{!shipmentExists(selected) ? <ExactButton size="sm" onClick={() => void createShipment(selected)} loading={busy === `shipping:${selected.id}`}><Truck className="h-4 w-4" /> Kargo kodu oluştur</ExactButton> : <><ExactButton variant="secondary" size="sm" onClick={() => void openLabel(selected)} loading={busy === `label:${selected.id}`}><Printer className="h-4 w-4" /> Etiket</ExactButton><ExactButton variant="secondary" size="sm" onClick={() => void syncShipment(selected)} loading={busy === `sync:${selected.id}`}><RefreshCw className="h-4 w-4" /> Kargoyu güncelle</ExactButton></>}{selected.cargo_tracking_no || selected.basit_kargo_barcode ? <ExactButton variant="tertiary" size="sm" onClick={() => { void navigator.clipboard.writeText(selected.cargo_tracking_no || selected.basit_kargo_barcode || ""); toast.success("Takip kodu kopyalandı."); }}><Copy className="h-4 w-4" /> Takip kodu</ExactButton> : null}</div></section>

          <section><div className="flex items-center gap-2 mb-2"><ClipboardList className="h-3.5 w-3.5 text-subtle" /><h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Not ve hatırlatma</h4></div><div className="space-y-3"><ExactField label="Admin notu"><textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} className={`${exactFormInputClass} min-h-24`} /></ExactField><ExactField label="Hatırlatma notu"><input value={reminderNote} onChange={(event) => setReminderNote(event.target.value)} className={exactFormInputClass} /></ExactField><ExactField label="Hatırlatma zamanı"><input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} className={exactFormInputClass} /></ExactField></div></section>

          <section><div className="flex items-center gap-2 mb-2"><Send className="h-3.5 w-3.5 text-subtle" /><h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Hızlı aksiyonlar</h4></div><div className="grid grid-cols-2 gap-2"><Link href={`/production?order=${selected.id}`}><ExactButton variant="secondary" size="sm" className="w-full">Üretime git <ArrowRight className="h-3.5 w-3.5" /></ExactButton></Link><Link href={`/packaging?order=${selected.id}`}><ExactButton variant="secondary" size="sm" className="w-full">Paketlemeye git <ArrowRight className="h-3.5 w-3.5" /></ExactButton></Link><Link href={`/shipping?order=${selected.id}`}><ExactButton variant="secondary" size="sm" className="w-full">Kargoya git <ArrowRight className="h-3.5 w-3.5" /></ExactButton></Link><Link href={`/returns?order=${selected.id}`}><ExactButton variant="secondary" size="sm" className="w-full">İade/değişim <RotateCcw className="h-3.5 w-3.5" /></ExactButton></Link><Link href={`/orders/${selected.id}/timeline`} className="col-span-2"><ExactButton variant="secondary" size="sm" className="w-full">Kayıt zinciri <ExternalLink className="h-3.5 w-3.5" /></ExactButton></Link><ExactButton variant="tertiary" size="sm" className="col-span-2" onClick={() => void sendReview(selected)} loading={busy === `review:${selected.id}`}><Mail className="h-4 w-4" /> Değerlendirme maili gönder</ExactButton></div></section>
        </div> : null}
      </ExactDetailDrawer>

      <ExactFormModal open={Boolean(confirm)} onClose={() => setConfirm(null)} title={confirm?.title || "Onay"} subtitle={confirm?.message} size="sm" footer={<><ExactButton variant="secondary" size="sm" onClick={() => setConfirm(null)}>Vazgeç</ExactButton><ExactButton variant={confirm?.destructive ? "destructive" : "primary"} size="sm" onClick={() => { const action = confirm?.action; setConfirm(null); if (action) void action(); }}>Onayla</ExactButton></>}><div className="text-sm text-muted">Bu işlem seçili sipariş üzerinde uygulanacak.</div></ExactFormModal>
    </div>
  );
}
