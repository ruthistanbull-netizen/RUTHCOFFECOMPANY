"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Mail,
  MapPin,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  Search,
  Send,
  ShoppingBag,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { Drawer, FullscreenOverlay, Modal } from "@ruth-commerce/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { DateRangeControl, dateRangeParam, type AdminDateRangeValue } from "@/components/DateRangeControl";
import { adminAuthHeaders, adminRequest, apiUrl } from "@/lib/adminApi";
import {
  formatDateTime,
  formatMoney,
  formatShortDate,
  initials,
  normalize,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from "@/lib/format";

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

type ProductVariant = {
  id: string;
  option_summary: string;
  price: number;
  image_url?: string | null;
  is_active?: boolean;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  price: number;
  currency?: string;
  main_image_url?: string | null;
  product_variants?: ProductVariant[];
};

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
  basit_kargo_handler_code?: string | null;
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

type OrderUpdateResult = {
  notification?: { ok?: boolean; sent?: boolean; skipped?: string; error?: string } | null;
  warning?: string | null;
};

type StatusFilter = "all" | "new" | "preparing" | "ready" | "shipped" | "delivered" | "attention";
type PaymentFilter = "all" | "paid" | "waiting" | "failed";
type Lightbox = { item: OrderItem; order: Order };

const statusOptions = [
  { value: "awaiting_payment", label: "Ödeme bekleniyor" },
  { value: "paid", label: "Yeni sipariş" },
  { value: "in_production", label: "Hazırlanıyor" },
  { value: "ready_to_ship", label: "Kargoya hazır" },
  { value: "shipped", label: "Gönderildi" },
  { value: "delivered", label: "Teslim edildi" },
  { value: "cancelled", label: "İptal edildi" },
];

const manualPaymentOptions = [
  { value: "pending", label: "Ödeme Bekleniyor" },
  { value: "paid", label: "Ödendi" },
  { value: "failed", label: "Ödeme Başarısız" },
  { value: "cancelled", label: "Ödeme İptal Edildi" },
  { value: "refunded", label: "Ödeme İade Edildi" },
];

function paid(order: Order) {
  return ["paid", "succeeded", "success"].includes(normalize(order.payment_status));
}

function manualOrder(order: Order) {
  return normalize(order.imported_source) === "manual" || String(order.order_no || "").toLocaleUpperCase("tr-TR").startsWith("MAN");
}

function variantsFor(product: Product) {
  return (product.product_variants || []).filter((variant) => variant.is_active !== false);
}

function shipmentExists(order: Order) {
  return Boolean(order.basit_kargo_order_id || order.basit_kargo_barcode || order.cargo_tracking_no);
}

function stateGroup(order: Order) {
  const value = normalize(order.status);
  if (["created", "new", "paid"].includes(value)) return "new";
  if (["preparing", "queued", "in_production", "quality_control"].includes(value)) return "preparing";
  if (["prepared", "ready", "ready_to_ship"].includes(value)) return "ready";
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

function attention(order: Order) {
  return Boolean(order.shipping_error) || ["failed", "rejected", "requires_action"].includes(normalize(order.payment_status));
}

function normalizeItem(item: OrderItem): OrderItem {
  const quantity = Math.max(1, Math.trunc(Number(item.quantity || 1)));
  const unitPrice = Math.max(0, Number(item.unit_price || 0));
  return { ...item, quantity, unit_price: unitPrice, total_price: quantity * unitPrice };
}

function itemCount(order: Order) {
  return (order.order_items || []).reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0);
}

function address(order: Order) {
  return [
    order.shipping_address_line || order.shipping_address_text,
    [order.shipping_town, order.shipping_city].filter(Boolean).join(" / "),
  ].filter(Boolean).join(", ") || "Adres bilgisi yok";
}

function datetimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function stop(event: MouseEvent) {
  event.stopPropagation();
}

function ProductImage({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed
    ? <img src={src} alt={alt} onError={() => setFailed(true)} />
    : <span aria-label={`${alt} görseli yok`}>R</span>;
}

export function OrdersControlRoomComplete() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeQuery = searchParams.get("q")?.trim() || "";
  const routeQueue = searchParams.get("queue");
  const allowedQueues: StatusFilter[] = ["new", "preparing", "ready", "shipped", "delivered", "attention"];
  const initialQueue = allowedQueues.includes(routeQueue as StatusFilter) ? routeQueue as StatusFilter : "all";

  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState(routeQuery);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialQueue);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [range, setRange] = useState<AdminDateRangeValue>({ range: "this_month", from: "", to: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [preparingOrder, setPreparingOrder] = useState<Order | null>(null);
  const [lightbox, setLightbox] = useState<Lightbox | null>(null);
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
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);

  const load = useCallback(async () => {
    if (range.range === "custom" && (!range.from || !range.to)) return [] as Order[];
    setLoading(true);
    setError(null);
    try {
      const result = await adminRequest<{ orders?: Order[] }>(`/api/orders?range=${encodeURIComponent(dateRangeParam(range))}&payment=all&q=`);
      const next = Array.isArray(result.orders) ? result.orders : [];
      setOrders(next);
      setSelected((current) => current ? next.find((order) => order.id === current.id) || null : null);
      setPreparingOrder((current) => current ? next.find((order) => order.id === current.id) || null : null);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Siparişler alınamadı.");
      return [] as Order[];
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const setDetailFields = (order: Order) => {
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
    setVariantProduct(null);
  };

  const openDetail = useCallback((order: Order) => {
    setSelected(order);
    setDetailFields(order);
    const params = new URLSearchParams(searchParams.toString());
    params.set("order", order.id);
    router.push(`/orders?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const closeDetail = useCallback(() => {
    setSelected(null);
    setNotifyCustomer(false);
    setEditingItems(false);
    setVariantProduct(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("order");
    router.replace(params.toString() ? `/orders?${params.toString()}` : "/orders", { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    const orderId = searchParams.get("order");
    if (!orderId || !orders.length || selected?.id === orderId) return;
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    const frame = window.requestAnimationFrame(() => {
      setSelected(order);
      setDetailFields(order);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [orders, searchParams, selected?.id]);

  const metrics = useMemo(() => ({
    newOrders: orders.filter((order) => stateGroup(order) === "new" && paid(order)).length,
    preparing: orders.filter((order) => stateGroup(order) === "preparing").length,
    ready: orders.filter((order) => stateGroup(order) === "ready").length,
    attention: orders.filter(attention).length,
  }), [orders]);

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

  const patchOrder = async (order: Order, patch: Record<string, unknown>, success: string) => {
    setBusy(`order:${order.id}`);
    setError(null);
    setNotice(null);
    try {
      const result = await adminRequest<OrderUpdateResult>("/api/orders/manual-update", { method: "PATCH", body: JSON.stringify({ id: order.id, ...patch }) });
      const next = await load();
      const refreshed = next.find((item) => item.id === order.id);
      if (refreshed && selected?.id === order.id) setDetailFields(refreshed);
      let message = success;
      if (patch.notify_customer === true) {
        if (result.notification?.sent) message += " Müşteriye durum e-postası gönderildi.";
        else if (result.notification?.skipped === "no_email") message += " Müşterinin e-posta adresi olmadığı için bildirim gönderilmedi.";
        else if (result.notification?.skipped === "no_integration") message += " E-posta entegrasyonu aktif olmadığı için bildirim gönderilmedi.";
        else if (result.notification?.skipped === "status_unchanged") message += " Durum değişmediği için bildirim gönderilmedi.";
        else if (result.notification?.error) message += ` Bildirim gönderilemedi: ${result.notification.error}`;
      }
      if (result.warning) message += ` ${result.warning}`;
      setNotice(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sipariş güncellenemedi.");
      throw caught;
    } finally {
      setBusy(null);
    }
  };

  const searchProducts = async (value: string) => {
    setProductQuery(value);
    setVariantProduct(null);
    if (value.trim().length < 2) {
      setProducts([]);
      return;
    }
    setSearchingProducts(true);
    try {
      const result = await adminRequest<{ products?: Product[] }>(`/api/products?q=${encodeURIComponent(value.trim())}`);
      const unique = new Map<string, Product>();
      for (const product of result.products || []) if (product?.id && !unique.has(product.id)) unique.set(product.id, product);
      setProducts([...unique.values()].slice(0, 12));
    } catch (caught) {
      setProducts([]);
      setError(caught instanceof Error ? caught.message : "Ürünler aranamadı.");
    } finally {
      setSearchingProducts(false);
    }
  };

  const addProduct = (product: Product, variant?: ProductVariant) => {
    const key = `${product.id}:${variant?.id || "standard"}`;
    const price = Math.max(0, Number(variant?.price ?? product.price ?? 0));
    setDraftItems((current) => {
      const existing = current.findIndex((item) => `${item.product_id}:${item.variant_id || "standard"}` === key);
      if (existing >= 0) return current.map((item, index) => index === existing ? normalizeItem({ ...item, quantity: item.quantity + 1 }) : item);
      return [...current, normalizeItem({
        product_id: product.id,
        product_slug: product.slug,
        variant_id: variant?.id || null,
        product_name: product.name,
        variant_name: variant?.option_summary || null,
        quantity: 1,
        unit_price: price,
        total_price: price,
        image_url: variant?.image_url || product.main_image_url || null,
      })];
    });
    setProductQuery("");
    setProducts([]);
    setVariantProduct(null);
  };

  const chooseProduct = (product: Product) => {
    if (variantsFor(product).length) setVariantProduct(product);
    else addProduct(product);
  };

  const updateDraftItem = (index: number, patch: Partial<OrderItem>) => {
    setDraftItems((current) => current.map((item, itemIndex) => itemIndex === index ? normalizeItem({ ...item, ...patch }) : item));
  };

  const resetDraftItems = () => {
    setDraftItems((selected?.order_items || []).map((item) => normalizeItem({ ...item })));
    setEditingItems(false);
    setProductQuery("");
    setProducts([]);
    setVariantProduct(null);
  };

  const createShipment = async (order: Order) => {
    if (!order.shipping_city || !(order.shipping_address_line || order.shipping_address_text)) {
      setError(`${order.order_no} için il ve açık adres tamamlanmadan kargo oluşturulamaz.`);
      openDetail(order);
      return;
    }
    setBusy(`shipping:${order.id}`);
    setError(null);
    try {
      await adminRequest("/api/shipping/basit-kargo/shipments", {
        method: "POST",
        body: JSON.stringify({
          orderId: order.id,
          handlerCode: "ECONOMIC",
          handlerName: "En Ekonomik (Otomatik)",
          quotedPrice: null,
          packages: [{ height: 1, width: 1, depth: 1, weight: 1 }],
          recipient: { city: order.shipping_city || "", town: order.shipping_town || "", address: order.shipping_address_line || order.shipping_address_text || "" },
        }),
      });
      const next = await load();
      const refreshed = next.find((item) => item.id === order.id);
      if (refreshed && selected?.id === order.id) setDetailFields(refreshed);
      setNotice(`${order.order_no} için kargo kodu oluşturuldu ve müşteri bilgilendirildi.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kargo kodu oluşturulamadı.");
    } finally {
      setBusy(null);
    }
  };

  const openLabel = async (order: Order) => {
    setBusy(`label:${order.id}`);
    setError(null);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch(apiUrl(`/api/shipping/basit-kargo/shipments/${order.id}/label`), { headers });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Kargo etiketi alınamadı.");
      const url = URL.createObjectURL(await response.blob());
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kargo etiketi alınamadı.");
    } finally {
      setBusy(null);
    }
  };

  const syncShipment = async (order: Order) => {
    setBusy(`sync:${order.id}`);
    setError(null);
    try {
      await adminRequest(`/api/shipping/basit-kargo/shipments/${order.id}/sync`, { method: "POST", body: "{}" });
      const next = await load();
      const refreshed = next.find((item) => item.id === order.id);
      if (refreshed && selected?.id === order.id) setDetailFields(refreshed);
      setNotice(`${order.order_no} kargo durumu sağlayıcı üzerinden güncellendi.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kargo durumu güncellenemedi.");
    } finally {
      setBusy(null);
    }
  };

  const saveInspector = async () => {
    if (!selected) return;
    if (reminderAt && new Date(reminderAt).getTime() <= Date.now()) {
      setError("Hatırlatma zamanı geçmiş bir tarih olamaz.");
      return;
    }
    if (editingItems && !draftItems.length) {
      setError("Siparişte en az bir ürün olmalı.");
      return;
    }
    if (editingItems && draftItems.some((item) => !item.product_name.trim() || item.quantity < 1 || item.unit_price < 0)) {
      setError("Sipariş ürünlerinin adı, adedi ve fiyatı geçerli olmalı.");
      return;
    }
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
    if (editingItems) patch.order_items = draftItems.map((item) => normalizeItem(item));
    try {
      await patchOrder(selected, patch, `${selected.order_no} değişiklikleri kaydedildi.`);
      setEditingItems(false);
      setNotifyCustomer(false);
    } catch {
      // Hata üst seviyede gösterilir; düzenleme taslağı korunur.
    }
  };

  const sendReview = async (order: Order) => {
    setBusy(`review:${order.id}`);
    try {
      const result = await adminRequest<{ sent?: number; error?: string }>("/api/review-automation/send", { method: "POST", body: JSON.stringify({ order_ids: [order.id] }) });
      if (!result.sent) throw new Error(result.error || "Değerlendirme maili gönderilemedi.");
      setNotice(`${order.order_no} için değerlendirme maili gönderildi.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Değerlendirme maili gönderilemedi.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (value: string, message: string) => {
    await navigator.clipboard.writeText(value).catch(() => undefined);
    setNotice(message);
  };

  const orderDetailFooter = selected ? (
    <div className="cr-shared-overlay-actions">
      <button className="cr-button cr-button--secondary" type="button" onClick={closeDetail}>Kapat</button>
      <button className="cr-button cr-button--primary" type="button" onClick={() => void saveInspector()} disabled={Boolean(busy)}>
        {busy === `order:${selected.id}` ? <span className="cr-spinner cr-spinner--small" /> : <Send />} Değişiklikleri kaydet
      </button>
    </div>
  ) : null;

  return (
    <>
      <header className="cr-page-header">
        <div><span className="cr-eyebrow">Sipariş operasyonları</span><h1>Siparişler</h1><p className="cr-description">Sipariş içeriği, ödeme, hazırlama, kargo, müşteri ve bildirim akışını tek ekrandan yönet.</p></div>
        <div className="cr-actions"><DateRangeControl value={range} onChange={setRange} /><button className="cr-button cr-button--primary" type="button" onClick={() => router.push("/orders/new")}><ShoppingBag /> Manuel sipariş</button></div>
      </header>

      {error ? <div className="cr-notice cr-notice--danger" role="alert"><AlertTriangle /><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Uyarıyı kapat"><X /></button></div> : null}
      {notice ? <div className="cr-notice cr-notice--success" role="status"><Check /><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Bildirimi kapat"><X /></button></div> : null}

      <section className="cr-grid cr-grid--metrics cr-order-metrics">
        <button className={`cr-card cr-metric cr-metric-button ${statusFilter === "new" ? "is-selected" : ""}`} type="button" onClick={() => setStatusFilter(statusFilter === "new" ? "all" : "new")}><small>Yeni sipariş</small><strong>{metrics.newOrders}</strong><div className="cr-metric-footer"><span>Ödenen ve işlenmeyen</span><span className="cr-status cr-status--new">Yeni</span></div></button>
        <button className={`cr-card cr-metric cr-metric-button ${statusFilter === "preparing" ? "is-selected" : ""}`} type="button" onClick={() => setStatusFilter(statusFilter === "preparing" ? "all" : "preparing")}><small>Hazırlanıyor</small><strong>{metrics.preparing}</strong><div className="cr-metric-footer"><span>Paketleme kuyruğu</span><span className="cr-status cr-status--preparing">Hazırlanıyor</span></div></button>
        <button className={`cr-card cr-metric cr-metric-button ${statusFilter === "ready" ? "is-selected" : ""}`} type="button" onClick={() => setStatusFilter(statusFilter === "ready" ? "all" : "ready")}><small>Kargoya hazır</small><strong>{metrics.ready}</strong><div className="cr-metric-footer"><span>Kargo kodu oluşturulan</span><span className="cr-status cr-status--ready">Hazır</span></div></button>
        <button className={`cr-card cr-metric cr-metric-button ${statusFilter === "attention" ? "is-selected" : ""}`} type="button" onClick={() => setStatusFilter(statusFilter === "attention" ? "all" : "attention")}><small>İşlem gerekli</small><strong>{metrics.attention}</strong><div className="cr-metric-footer"><span>Ödeme veya kargo hatası</span><span className="cr-status cr-status--danger">Kontrol</span></div></button>
      </section>

      <section className="cr-card cr-order-workspace">
        <div className="cr-order-toolbar">
          <label className="cr-search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sipariş no, müşteri, telefon, takip no veya barkod" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Aramayı temizle"><X /></button> : null}</label>
          <div className="cr-filter-row" role="group" aria-label="Sipariş durumu filtresi">{[["all","Tümü"],["new","Yeni"],["preparing","Hazırlanıyor"],["ready","Kargoya hazır"],["shipped","Gönderildi"],["delivered","Teslim edildi"],["attention","İşlem gerekli"]].map(([value,label]) => <button key={value} type="button" className={statusFilter === value ? "is-active" : ""} onClick={() => setStatusFilter(value as StatusFilter)}>{label}</button>)}</div>
          <label className="cr-select-inline"><span>Ödeme</span><select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as PaymentFilter)}><option value="all">Tümü</option><option value="paid">Ödendi</option><option value="waiting">Ödeme Bekleniyor</option><option value="failed">Başarısız</option></select></label>
          <span className="cr-result-count">{visibleOrders.length} sipariş</span>
        </div>

        {loading ? <div className="cr-loading"><span className="cr-spinner" /><strong>Siparişler yükleniyor</strong></div> : null}
        {!loading && visibleOrders.length === 0 ? <div className="cr-empty"><ShoppingBag /><strong>Bu filtrede sipariş yok</strong></div> : null}
        {!loading && visibleOrders.length ? <div className="cr-order-list">{visibleOrders.map((order) => {
          const shipment = shipmentExists(order);
          const group = stateGroup(order);
          return <article className={`cr-order-card ${attention(order) ? "has-attention" : ""}`} key={order.id} onClick={() => openDetail(order)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openDetail(order); }}>
            <div className="cr-order-card__identity"><span className="cr-avatar">{initials(order.customer_name)}</span><div><div className="cr-order-card__number"><strong>#{order.order_no}</strong><span>{formatShortDate(order.created_at)}</span></div><h2>{order.customer_name || "İsimsiz müşteri"}</h2><p>{order.customer_phone || order.customer_email || "İletişim bilgisi yok"}</p></div></div>
            <div className="cr-order-card__products"><strong>{itemCount(order)} ürün</strong><span>{(order.order_items || []).slice(0,2).map((item) => item.product_name).join(", ") || "Ürün bilgisi yok"}</span></div>
            <div className="cr-order-card__money"><strong>{formatMoney(order.total_amount, order.currency)}</strong><span className={`cr-payment-pill cr-payment-pill--${paymentStatusTone(order.payment_status)}`}>{paymentStatusLabel(order.payment_status)}</span></div>
            <div className="cr-order-card__status"><span className={`cr-status cr-status--${orderStatusTone(order.status)}`}>{orderStatusLabel(order.status)}</span><small>{shipment ? order.cargo_tracking_no || order.basit_kargo_barcode || "Kargo oluştu" : "Kargo kodu yok"}</small></div>
            <div className="cr-order-card__actions" onClick={stop}>
              {["new","preparing"].includes(group) ? <button className="cr-button cr-button--secondary" type="button" disabled={Boolean(busy)} onClick={() => setPreparingOrder(order)}><PackageCheck /> Hazırla</button> : null}
              {paid(order) && !shipment ? <button className="cr-button cr-button--primary" type="button" disabled={Boolean(busy)} onClick={() => void createShipment(order)}><Truck /> Kargo oluştur</button> : null}
              {shipment ? <button className="cr-button cr-button--secondary" type="button" disabled={Boolean(busy)} onClick={() => void openLabel(order)}><Printer /> Etiket</button> : null}
              <button className="cr-icon-button" type="button" aria-label={`${order.order_no} detayını aç`} onClick={() => openDetail(order)}><ArrowRight /></button>
            </div>
          </article>;
        })}</div> : null}
      </section>

      <Drawer open={Boolean(selected)} title={selected ? `#${selected.order_no}` : "Sipariş detayı"} description={selected ? `${selected.customer_name} · ${formatDateTime(selected.created_at)}` : undefined} onClose={closeDetail} footer={orderDetailFooter}>
        {selected ? <div className="cr-order-detail-content">
          <div className="cr-drawer__summary"><div><small>Toplam</small><strong>{formatMoney(selected.total_amount, selected.currency)}</strong></div><div><small>Ödeme</small><span className={`cr-payment-pill cr-payment-pill--${paymentStatusTone(selected.payment_status)}`}>{paymentStatusLabel(selected.payment_status)}</span></div><div><small>Sipariş</small><span className={`cr-status cr-status--${orderStatusTone(selected.status)}`}>{orderStatusLabel(selected.status)}</span></div></div>

          <section className="cr-inspector-section">
            <div className="cr-inspector-section__header"><div><span>Operasyon</span><h3>Durum ve aksiyonlar</h3></div><PackageCheck /></div>
            <div className="cr-product-form-grid">
              <label className="cr-field"><span>Sipariş durumu</span><select value={detailStatus} onChange={(event) => { const value = event.target.value; setDetailStatus(value); if (value === statusForEditor(selected)) setNotifyCustomer(false); }}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              {manualOrder(selected) ? <label className="cr-field"><span>Manuel sipariş ödeme durumu</span><select value={detailPayment} onChange={(event) => setDetailPayment(event.target.value)}>{manualPaymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> : <div className="cr-field"><span>Ödeme durumu</span><strong className={`cr-payment-pill cr-payment-pill--${paymentStatusTone(selected.payment_status)}`}>{paymentStatusLabel(selected.payment_status)}</strong><small>PayTR ödemesi yalnız doğrulanmış ödeme/iade akışından değişir.</small></div>}
            </div>
            <label className="cr-check-field">
              <input type="checkbox" checked={notifyCustomer} onChange={(event) => setNotifyCustomer(event.target.checked)} disabled={!selected.customer_email || detailStatus === statusForEditor(selected)} />
              <span>Müşteriye durum bildirimi gönder</span>
            </label>
            <p className="cr-muted">{!selected.customer_email ? "Müşterinin e-posta adresi olmadığı için bildirim gönderilemez." : detailStatus === statusForEditor(selected) ? "Bildirim seçeneği, sipariş durumu değiştirildiğinde açılır." : "İşaretliyken seçilen yeni durum müşteriye e-posta olarak gönderilir."}</p>
            <div className="cr-inspector-actions">
              <button className="cr-button cr-button--secondary" type="button" onClick={() => setPreparingOrder(selected)}><PackageCheck /> Hazırlama ekranı</button>
              <Link className="cr-button cr-button--secondary" href={`/orders/${selected.id}/timeline`}><ExternalLink /> Kayıt zinciri</Link>
              <Link className="cr-button cr-button--secondary" href={`/returns?order=${encodeURIComponent(selected.id)}`}><ExternalLink /> Değişim / iade yap</Link>
              {!shipmentExists(selected) && paid(selected) ? <button className="cr-button cr-button--primary" type="button" onClick={() => void createShipment(selected)} disabled={Boolean(busy)}><Truck /> Kargo kodu oluştur</button> : null}
              {shipmentExists(selected) ? <button className="cr-button cr-button--secondary" type="button" onClick={() => void openLabel(selected)} disabled={Boolean(busy)}><Printer /> Etiketi aç</button> : null}
              {shipmentExists(selected) ? <button className="cr-button cr-button--secondary" type="button" onClick={() => void syncShipment(selected)} disabled={Boolean(busy)}><Truck /> Kargoyu sorgula</button> : null}
              <button className="cr-button cr-button--secondary" type="button" onClick={() => void sendReview(selected)} disabled={Boolean(busy) || !selected.customer_email}><Mail /> Değerlendirme maili</button>
            </div>
            {selected.shipping_error ? <div className="cr-notice cr-notice--danger"><strong>Kargo hatası</strong><span>{selected.shipping_error}</span></div> : null}
          </section>

          <section className="cr-inspector-section">
            <div className="cr-inspector-section__header"><div><span>Ürünler</span><h3>{draftItems.reduce((sum, item) => sum + item.quantity, 0)} ürün</h3></div>{editingItems ? <div className="cr-actions"><button className="cr-button cr-button--secondary" type="button" onClick={resetDraftItems}>Vazgeç</button></div> : <button className="cr-button cr-button--secondary" type="button" onClick={() => setEditingItems(true)}><Pencil /> Sipariş içeriğini düzenle</button>}</div>

            {editingItems ? <div className="cr-order-item-editor">
              <label className="cr-search-field"><Search /><input value={productQuery} onChange={(event) => void searchProducts(event.target.value)} placeholder="Siparişe ürün ekle: ad veya slug ara" aria-label="Siparişe eklenecek ürün ara" />{productQuery ? <button type="button" onClick={() => { setProductQuery(""); setProducts([]); }} aria-label="Ürün aramasını temizle"><X /></button> : null}</label>
              {searchingProducts ? <div className="cr-loading cr-loading--compact"><span className="cr-spinner" /><strong>Ürün aranıyor</strong></div> : null}
              {products.length ? <div className="cr-manual-product-results cr-manual-product-results--catalog">{products.map((product) => <button className="cr-manual-product-card" type="button" key={product.id} onClick={() => chooseProduct(product)}><span className="cr-manual-product-card__media"><ProductImage src={product.main_image_url} alt={product.name} /></span><span className="cr-manual-product-card__copy"><strong>{product.name}</strong><small>{variantsFor(product).length ? `${variantsFor(product).length} varyant · seçmek için aç` : formatMoney(product.price, product.currency || "TRY")}</small></span><ChevronRight /></button>)}</div> : null}
              <div className="cr-editable-order-items">{draftItems.map((item, index) => <article className="cr-editable-order-item" key={`${item.id || item.product_id || item.product_name}-${index}`}>
                <button className="cr-inspector-product__media cr-image-button" type="button" onClick={() => setLightbox({ item, order: selected })} aria-label={`${item.product_name} görselini büyüt`}><ProductImage src={item.image_url} alt={item.product_name} /></button>
                <div className="cr-editable-order-item__copy"><strong>{item.product_name}</strong><span>{item.variant_name || "Standart"}</span></div>
                <label className="cr-field"><span>Adet</span><input type="number" min="1" value={item.quantity} onChange={(event) => updateDraftItem(index, { quantity: Number(event.target.value || 1) })} /></label>
                <label className="cr-field"><span>Birim fiyat</span><input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateDraftItem(index, { unit_price: Number(event.target.value || 0) })} /></label>
                <strong>{formatMoney(item.total_price, selected.currency)}</strong>
                <button className="cr-icon-button cr-icon-button--danger" type="button" onClick={() => setDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`${item.product_name} ürününü siparişten sil`}><Trash2 /></button>
              </article>)}</div>
              {!draftItems.length ? <div className="cr-notice cr-notice--danger"><AlertTriangle /><span>Siparişte en az bir ürün olmalı.</span></div> : null}
            </div> : <div className="cr-inspector-products">{(selected.order_items || []).map((item) => <div className="cr-inspector-product" key={item.id || `${item.product_name}-${item.variant_name}`}><button className="cr-inspector-product__media cr-image-button" type="button" onClick={() => setLightbox({ item, order: selected })} aria-label={`${item.product_name} görselini büyüt`}><ProductImage src={item.image_url} alt={item.product_name} /></button><div><strong>{item.product_name}</strong><span>{item.variant_name || "Standart"} · {item.quantity} adet</span></div><strong>{formatMoney(item.total_price || item.unit_price * item.quantity, selected.currency)}</strong></div>)}{!(selected.order_items || []).length ? <p className="cr-muted">Ürün satırı bulunamadı.</p> : null}</div>}

            <div className="cr-money-breakdown">
              <span><small>Ara toplam</small><strong>{formatMoney(editingItems ? draftItems.reduce((sum, item) => sum + item.total_price, 0) : selected.subtotal ?? selected.total_amount, selected.currency)}</strong></span>
              <span><small>İndirim</small><strong>-{formatMoney(selected.discount_total || 0, selected.currency)}</strong></span>
              <span><small>Kargo</small><strong>{formatMoney(selected.shipping_fee || 0, selected.currency)}</strong></span>
              <span className="is-total"><small>Genel toplam</small><strong>{formatMoney(editingItems ? Math.max(0, draftItems.reduce((sum, item) => sum + item.total_price, 0) + Number(selected.shipping_fee || 0) - Number(selected.discount_total || 0)) : selected.total_amount, selected.currency)}</strong></span>
            </div>
          </section>

          <section className="cr-inspector-section"><div className="cr-inspector-section__header"><div><span>Müşteri</span><h3>İletişim ve teslimat</h3></div><UserRound /></div><div className="cr-contact-card"><span className="cr-avatar cr-avatar--large">{initials(selected.customer_name)}</span><div><strong>{selected.customer_name || "İsimsiz müşteri"}</strong><a href={selected.customer_phone ? `tel:${selected.customer_phone}` : undefined}>{selected.customer_phone || "Telefon yok"}</a><a href={selected.customer_email ? `mailto:${selected.customer_email}` : undefined}>{selected.customer_email || "E-posta yok"}</a></div></div><div className="cr-address-card"><MapPin /><div><strong>Teslimat adresi</strong><p>{address(selected)}</p></div><button className="cr-icon-button" type="button" aria-label="Adresi kopyala" onClick={() => void copy(address(selected), "Adres panoya kopyalandı.")}><Copy /></button></div>{selected.customer_note ? <div className="cr-customer-note"><strong>Müşteri notu</strong><p>{selected.customer_note}</p></div> : null}</section>

          <section className="cr-inspector-section"><div className="cr-inspector-section__header"><div><span>Kargo</span><h3>Gönderi bilgileri</h3></div><Truck /></div><dl className="cr-key-values"><div><dt>Firma</dt><dd>{selected.cargo_company || selected.basit_kargo_handler_code || "Oluşturulmadı"}</dd></div><div><dt>Takip no</dt><dd>{selected.cargo_tracking_no || "—"}</dd></div><div><dt>Barkod</dt><dd>{selected.basit_kargo_barcode || "—"}</dd></div><div><dt>Durum</dt><dd>{selected.shipping_status_label || selected.shipping_status || "—"}</dd></div><div><dt>Kargo maliyeti</dt><dd>{selected.shipping_price != null ? formatMoney(selected.shipping_price, selected.currency) : "—"}</dd></div></dl></section>

          <section className="cr-inspector-section"><div className="cr-inspector-section__header"><div><span>CRM</span><h3>Not ve hatırlatma</h3></div><BellRing /></div><label className="cr-field"><span>Operasyon notu</span><textarea rows={4} value={adminNote} onChange={(event) => setAdminNote(event.target.value)} /></label><label className="cr-field"><span>Hatırlatma notu</span><textarea rows={3} value={reminderNote} onChange={(event) => setReminderNote(event.target.value)} /></label><label className="cr-field"><span>Hatırlatma zamanı</span><input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} /></label></section>

          <section className="cr-inspector-section"><div className="cr-inspector-section__header"><div><span>Kaynak</span><h3>Sipariş bağlamı</h3></div><ExternalLink /></div><dl className="cr-key-values"><div><dt>Sipariş kaynağı</dt><dd>{selected.imported_source || "Storefront"}</dd></div><div><dt>Trafik kaynağı</dt><dd>{selected.traffic_source || "Bilinmiyor"}</dd></div><div><dt>Kampanya</dt><dd>{selected.traffic_campaign || "—"}</dd></div><div><dt>Değerlendirme maili</dt><dd>{selected.review_email_status === "sent" ? `Gönderildi · ${formatDateTime(selected.review_email_sent_at)}` : "Gönderilmedi"}</dd></div></dl></section>
        </div> : null}
      </Drawer>

      <Modal open={Boolean(variantProduct)} title={variantProduct ? `${variantProduct.name} varyantı` : "Varyant seç"} description="Siparişe eklenecek varyantı seç." size="lg" onClose={() => setVariantProduct(null)}>
        {variantProduct ? <div className="cr-manual-product-results cr-manual-product-results--variants">{variantsFor(variantProduct).map((variant) => <button className="cr-manual-product-card" type="button" key={variant.id} onClick={() => addProduct(variantProduct, variant)}><span className="cr-manual-product-card__media"><ProductImage src={variant.image_url || variantProduct.main_image_url} alt={`${variantProduct.name} ${variant.option_summary}`} /></span><span className="cr-manual-product-card__copy"><strong>{variant.option_summary}</strong><small>{formatMoney(variant.price || variantProduct.price, variantProduct.currency || "TRY")}</small></span><Plus /></button>)}</div> : null}
      </Modal>

      <Modal open={Boolean(preparingOrder)} title={preparingOrder ? `#${preparingOrder.order_no} hazırlama listesi` : "Sipariş hazırlama"} description="Paketlenecek ürün, varyant ve adetleri doğrula." size="lg" onClose={() => setPreparingOrder(null)} footer={preparingOrder ? <div className="cr-shared-overlay-actions"><button className="cr-button cr-button--secondary" type="button" onClick={() => setPreparingOrder(null)}>Kapat</button>{stateGroup(preparingOrder) === "new" ? <button className="cr-button cr-button--primary" type="button" onClick={() => void patchOrder(preparingOrder, { status: "in_production" }, `${preparingOrder.order_no} hazırlamaya alındı.`).then(() => setPreparingOrder(null)).catch(() => undefined)}><PackageCheck /> Hazırlamaya al</button> : <button className="cr-button cr-button--primary" type="button" onClick={() => void patchOrder(preparingOrder, { status: "ready_to_ship" }, `${preparingOrder.order_no} kargoya hazır.`).then(() => setPreparingOrder(null)).catch(() => undefined)}><Check /> Hazırlandı</button>}</div> : null}>
        {preparingOrder ? <div className="cr-preparation-list">{(preparingOrder.order_items || []).map((item) => <article className="cr-preparation-item" key={item.id || `${item.product_name}-${item.variant_name}`}><button className="cr-image-button" type="button" onClick={() => setLightbox({ item, order: preparingOrder })}><ProductImage src={item.image_url} alt={item.product_name} /></button><div><strong>{item.product_name}</strong><small>{item.variant_name || "Standart"}</small></div><b>{item.quantity} adet</b></article>)}</div> : null}
      </Modal>

      <FullscreenOverlay open={Boolean(lightbox)} title={lightbox?.item.product_name || "Sipariş ürünü"} onClose={() => setLightbox(null)} closeOnBackdrop panelClassName="cr-image-lightbox__panel">
        {lightbox ? <div className="cr-image-lightbox__layout"><div className="cr-image-lightbox__media"><ProductImage src={lightbox.item.image_url} alt={lightbox.item.product_name} /></div><div className="cr-image-lightbox__info"><span className="cr-eyebrow">Sipariş ürünü</span><h2>{lightbox.item.product_name}</h2><dl><div><dt>Varyant</dt><dd>{lightbox.item.variant_name || "Standart"}</dd></div><div><dt>Adet</dt><dd>{lightbox.item.quantity}</dd></div><div><dt>Birim fiyat</dt><dd>{formatMoney(lightbox.item.unit_price, lightbox.order.currency)}</dd></div><div><dt>Satır toplamı</dt><dd>{formatMoney(lightbox.item.total_price, lightbox.order.currency)}</dd></div><div><dt>Sipariş</dt><dd>#{lightbox.order.order_no}</dd></div></dl></div></div> : null}
      </FullscreenOverlay>
    </>
  );
}
