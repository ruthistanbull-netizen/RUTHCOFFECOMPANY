"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  MapPin,
  PackageCheck,
  Save,
  Send,
  ShoppingBag,
  Truck,
  UserRound,
} from "lucide-react";
import { Drawer } from "@ruth-commerce/ui";
import { useCallback, useEffect, useRef, useState } from "react";

import { adminRequest } from "@/lib/adminApi";
import {
  formatDateTime,
  formatMoney,
  initials,
  orderStatusLabel,
  orderStatusTone,
  paymentStatusLabel,
  paymentStatusTone,
} from "@/lib/format";

type OrderItem = {
  id?: string;
  product_name: string;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url?: string | null;
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
  currency: string;
  status: string;
  payment_status: string;
  created_at: string;
  customer_note?: string | null;
  admin_note?: string | null;
  shipping_address_text?: string | null;
  shipping_address_line?: string | null;
  shipping_city?: string | null;
  shipping_town?: string | null;
  cargo_company?: string | null;
  cargo_tracking_no?: string | null;
  shipping_status?: string | null;
  basit_kargo_barcode?: string | null;
  order_items?: OrderItem[];
};

const statusOptions = [
  { value: "created", label: "Yeni sipariş" },
  { value: "in_production", label: "Hazırlanıyor" },
  { value: "ready_to_ship", label: "Kargoya hazır" },
  { value: "shipped", label: "Gönderildi" },
  { value: "delivered", label: "Teslim edildi" },
  { value: "cancelled", label: "İptal edildi" },
];

function cleanOrderNumber(value: string) {
  return value.replace(/^#/, "").trim();
}

function address(order: Order) {
  return [
    order.shipping_address_line || order.shipping_address_text,
    [order.shipping_town, order.shipping_city].filter(Boolean).join(" / "),
  ].filter(Boolean).join(", ") || "Adres bilgisi yok";
}

function ProductImage({ item }: { item: OrderItem }) {
  const [failed, setFailed] = useState(false);
  return item.image_url && !failed
    ? <img src={item.image_url} alt={item.product_name} onError={() => setFailed(true)} />
    : <span aria-label={`${item.product_name} görseli yok`}>R</span>;
}

export function DashboardRecentOrderDrawer() {
  const requestRef = useRef(0);
  const [requestedId, setRequestedId] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState("created");
  const [adminNote, setAdminNote] = useState("");

  const close = useCallback(() => {
    requestRef.current += 1;
    setRequestedId("");
    setOrder(null);
    setError(null);
    setNotice(null);
  }, []);

  const loadOrder = useCallback(async (id: string, orderNumber: string) => {
    const requestId = ++requestRef.current;
    setRequestedId(id);
    setOrder(null);
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const result = await adminRequest<{ orders?: Order[] }>(
        `/api/orders?range=all&payment=all&q=${encodeURIComponent(orderNumber)}`,
        { force: true, ttlMs: 0, staleMs: 0 },
      );
      if (requestId !== requestRef.current) return;
      const found = (result.orders || []).find((item) => item.id === id)
        || (result.orders || []).find((item) => cleanOrderNumber(item.order_no) === cleanOrderNumber(orderNumber))
        || null;
      if (!found) throw new Error("Sipariş detayı bulunamadı.");
      setOrder(found);
      setStatus(found.status || "created");
      setAdminNote(found.admin_note || "");
    } catch (caught) {
      if (requestId !== requestRef.current) return;
      setError(caught instanceof Error ? caught.message : "Sipariş detayı alınamadı.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onDashboardClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>(
        ".cr-dashboard-orders a[href*='/orders?'][href*='order=']",
      );
      if (!anchor) return;

      const url = new URL(anchor.href, window.location.origin);
      const id = url.searchParams.get("order") || "";
      const orderNumber = cleanOrderNumber(anchor.querySelector("strong")?.textContent || "");
      if (!id || !orderNumber) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void loadOrder(id, orderNumber);
    };

    document.addEventListener("click", onDashboardClick, true);
    return () => document.removeEventListener("click", onDashboardClick, true);
  }, [loadOrder]);

  const save = async () => {
    if (!order) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await adminRequest("/api/orders", {
        method: "PATCH",
        body: JSON.stringify({ id: order.id, status, admin_note: adminNote }),
      });
      setOrder((current) => current ? { ...current, status, admin_note: adminNote } : current);
      setNotice("Sipariş değişiklikleri kaydedildi.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sipariş güncellenemedi.");
    } finally {
      setSaving(false);
    }
  };

  const footer = order ? (
    <div className="cr-shared-overlay-actions">
      <button className="cr-button cr-button--secondary" type="button" onClick={close}>Kapat</button>
      <button className="cr-button cr-button--primary" type="button" onClick={() => void save()} disabled={saving}>
        {saving ? <span className="cr-spinner cr-spinner--small" /> : <Send />} Değişiklikleri kaydet
      </button>
    </div>
  ) : null;

  return (
    <Drawer
      open={Boolean(requestedId)}
      title={order ? `#${order.order_no}` : "Sipariş detayı"}
      description={order ? `${order.customer_name} · ${formatDateTime(order.created_at)}` : "Kontrol merkezinden açılıyor"}
      onClose={close}
      footer={footer}
    >
      {loading ? <div className="cr-loading"><span className="cr-spinner" /><strong>Sipariş detayı hazırlanıyor</strong></div> : null}
      {error ? <div className="cr-notice cr-notice--danger"><AlertTriangle /><span>{error}</span></div> : null}
      {notice ? <div className="cr-notice cr-notice--success"><Save /><span>{notice}</span></div> : null}

      {order ? (
        <div className="cr-order-detail-content cr-dashboard-order-detail">
          <div className="cr-drawer__summary">
            <div><small>Toplam</small><strong>{formatMoney(order.total_amount, order.currency)}</strong></div>
            <div><small>Ödeme</small><span className={`cr-payment-pill cr-payment-pill--${paymentStatusTone(order.payment_status)}`}>{paymentStatusLabel(order.payment_status)}</span></div>
            <div><small>Sipariş</small><span className={`cr-status cr-status--${orderStatusTone(order.status)}`}>{orderStatusLabel(order.status)}</span></div>
          </div>

          <section className="cr-inspector-section">
            <div className="cr-inspector-section__header"><div><span>Ürünler</span><h3>{(order.order_items || []).reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0)} ürün</h3></div><ShoppingBag /></div>
            <div className="cr-inspector-products">
              {(order.order_items || []).map((item, index) => (
                <div className="cr-inspector-product" key={item.id || `${item.product_name}-${index}`}>
                  <button className="cr-inspector-product__media cr-image-button" type="button" aria-label={`${item.product_name} görselini büyüt`}>
                    <ProductImage item={item} />
                  </button>
                  <div>
                    <strong>{item.product_name}</strong>
                    <span>Varyant: {item.variant_name || "Standart"}</span>
                    <span>Adet: {Math.max(1, Number(item.quantity || 1))}</span>
                  </div>
                  <strong>{formatMoney(item.total_price || item.unit_price * item.quantity, order.currency)}</strong>
                </div>
              ))}
            </div>
            <div className="cr-money-breakdown">
              <span><small>Ara toplam</small><strong>{formatMoney(order.subtotal ?? order.total_amount, order.currency)}</strong></span>
              <span><small>İndirim</small><strong>-{formatMoney(order.discount_total || 0, order.currency)}</strong></span>
              <span><small>Kargo</small><strong>{formatMoney(order.shipping_fee || 0, order.currency)}</strong></span>
              <span className="is-total"><small>Genel toplam</small><strong>{formatMoney(order.total_amount, order.currency)}</strong></span>
            </div>
          </section>

          <section className="cr-inspector-section">
            <div className="cr-inspector-section__header"><div><span>Operasyon</span><h3>Durum ve not</h3></div><PackageCheck /></div>
            <div className="cr-product-form-grid">
              <label className="cr-field"><span>Sipariş durumu</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="cr-field cr-field--wide"><span>Yönetici notu</span><textarea rows={4} value={adminNote} onChange={(event) => setAdminNote(event.target.value)} /></label>
            </div>
            <div className="cr-inspector-actions">
              <Link className="cr-button cr-button--secondary" href={`/orders/${order.id}/timeline`}><ExternalLink /> Kayıt zinciri</Link>
              <Link className="cr-button cr-button--secondary" href={`/returns?order=${encodeURIComponent(order.id)}`}><ExternalLink /> Değişim / iade</Link>
              <Link className="cr-button cr-button--secondary" href={`/orders?order=${encodeURIComponent(order.id)}`}><ExternalLink /> Siparişler ekranında aç</Link>
            </div>
          </section>

          <section className="cr-inspector-section">
            <div className="cr-inspector-section__header"><div><span>Müşteri</span><h3>İletişim ve teslimat</h3></div><UserRound /></div>
            <div className="cr-contact-card">
              <span className="cr-avatar cr-avatar--large">{initials(order.customer_name)}</span>
              <div>
                <strong>{order.customer_name || "İsimsiz müşteri"}</strong>
                <a href={order.customer_phone ? `tel:${order.customer_phone}` : undefined}>{order.customer_phone || "Telefon yok"}</a>
                <a href={order.customer_email ? `mailto:${order.customer_email}` : undefined}>{order.customer_email || "E-posta yok"}</a>
              </div>
            </div>
            <div className="cr-address-card"><MapPin /><div><strong>Teslimat adresi</strong><p>{address(order)}</p></div></div>
          </section>

          <section className="cr-inspector-section">
            <div className="cr-inspector-section__header"><div><span>Kargo</span><h3>Gönderi bilgileri</h3></div><Truck /></div>
            <div className="cr-key-values">
              <div><dt>Firma</dt><dd>{order.cargo_company || "Oluşturulmadı"}</dd></div>
              <div><dt>Takip no</dt><dd>{order.cargo_tracking_no || order.basit_kargo_barcode || "—"}</dd></div>
              <div><dt>Durum</dt><dd>{order.shipping_status || "—"}</dd></div>
            </div>
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}
