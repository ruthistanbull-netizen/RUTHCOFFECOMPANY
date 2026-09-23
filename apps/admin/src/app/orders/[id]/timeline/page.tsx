"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Fingerprint, RefreshCw, ShieldCheck } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { formatDateTime } from "@/lib/format";

import styles from "./OrderTimeline.module.css";

type TimelineEvent = {
  id: string;
  event_key?: string | null;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  shipment_status?: string | null;
  source?: string | null;
  reason?: string | null;
  actor_type?: string | null;
  correlation_id?: string | null;
  occurred_at: string;
};

type TimelineResponse = {
  order: {
    id: string;
    order_no: string;
    status?: string | null;
    payment_status?: string | null;
    fulfillment_status?: string | null;
    shipping_status?: string | null;
    state_version?: number | null;
  };
  timeline: TimelineEvent[];
};

const statusLabels: Record<string, string> = {
  draft: "Taslak",
  created: "Yeni sipariş",
  new: "Yeni sipariş",
  awaiting_payment: "Ödeme bekleniyor",
  pending: "Bekleniyor",
  paid: "Ödendi",
  queued: "Hazırlama sırasına alındı",
  preparing: "Hazırlanıyor",
  in_production: "Hazırlanıyor",
  quality_control: "Kalite kontrol",
  ready: "Hazır",
  ready_to_ship: "Kargoya hazır",
  label_created: "Kargo etiketi oluşturuldu",
  ready_for_handover: "Kargoya teslim edilmeye hazır",
  in_transit: "Yolda",
  shipped: "Gönderildi",
  out_for_delivery: "Dağıtıma çıktı",
  delivered: "Teslim edildi",
  cancelled: "İptal edildi",
  canceled: "İptal edildi",
  returned: "İade edildi",
  refunded: "Ödeme iade edildi",
  partially_refunded: "Kısmen iade edildi",
  return_requested: "İade talebi oluşturuldu",
  not_created: "Oluşturulmadı",
};

const sourceLabels: Record<string, string> = {
  "admin-order-update": "Panelden sipariş güncellemesi",
  admin: "Panel yöneticisi",
  system: "Sistem",
  user: "Yönetici",
  webhook: "Sağlayıcı bildirimi",
  paytr: "PayTR",
  "payment-callback": "Ödeme doğrulaması",
};

function statusLabel(value?: string | null) {
  if (!value) return "—";
  const normalized = value.trim().toLocaleLowerCase("tr-TR");
  return statusLabels[normalized] || value.replaceAll("_", " ");
}

function sourceLabel(value?: string | null) {
  if (!value) return "Sistem";
  const normalized = value.trim().toLocaleLowerCase("tr-TR");
  return sourceLabels[normalized] || value.replaceAll("-", " ").replaceAll("_", " ");
}

function eventTitle(event: TimelineEvent) {
  if (event.event_type === "order.status_changed") return `Sipariş: ${statusLabel(event.from_status)} → ${statusLabel(event.to_status)}`;
  if (event.event_type === "shipment.status_changed") return `Kargo: ${statusLabel(event.shipment_status || event.to_status)}`;
  if (event.event_type === "payment.status_changed") return `Ödeme: ${statusLabel(event.payment_status || event.to_status)}`;
  if (event.event_type === "order.bootstrap") return "Sipariş kayıt zinciri oluşturuldu";
  if (event.event_type === "order.created") return "Sipariş oluşturuldu";
  if (event.event_type === "shipment.created") return "Kargo kaydı oluşturuldu";
  return event.event_type.replaceAll(".", " ").replaceAll("_", " ");
}

export default function OrderTimelinePage() {
  const params = useParams<{ id: string }>();
  const orderId = String(params?.id || "");
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "load" | "refresh" = "load") => {
    if (!orderId) return;
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await adminRequest<TimelineResponse>(`/api/orders/timeline?order_id=${encodeURIComponent(orderId)}&limit=250`, { force: true }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sipariş kayıt zinciri alınamadı.");
    } finally {
      if (mode === "refresh") setRefreshing(false);
      else setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <header className="cr-page-header">
        <div>
          <span className="cr-eyebrow">Sipariş denetim izi</span>
          <h1>Değiştirilemez Kayıt Zinciri</h1>
          <p className="cr-description">Sipariş, ödeme, hazırlama ve kargo durumlarının silinmeden ve değiştirilmeden saklanan operasyon geçmişi.</p>
        </div>
        <div className="cr-actions">
          <Link className="cr-button cr-button--secondary" href="/orders"><ArrowLeft /> Siparişlere dön</Link>
          <button className="cr-button cr-button--secondary" type="button" onClick={() => void load("refresh")} disabled={loading || refreshing} aria-busy={refreshing || undefined}>{refreshing ? <LoadingIndicator size="sm" label="Kayıt zinciri yenileniyor" /> : <RefreshCw />} Yenile</button>
        </div>
      </header>

      {error ? <div className="cr-notice cr-notice--danger"><AlertTriangle /><span>{error}</span></div> : null}
      {loading ? <div className="cr-loading" role="status" aria-busy="true"><LoadingIndicator size="md" label="Kayıt zinciri yükleniyor" /><strong>Kayıt zinciri yükleniyor</strong></div> : null}

      {!loading && data ? (
        <>
          <section className={`cr-grid cr-grid--metrics ${styles.metrics}`}>
            <article className="cr-card cr-metric"><small>Sipariş</small><strong>#{data.order.order_no}</strong><div className="cr-metric-footer"><span>Versiyon</span><span className="cr-status cr-status--neutral">v{data.order.state_version ?? 0}</span></div></article>
            <article className="cr-card cr-metric"><small>Sipariş durumu</small><strong>{statusLabel(data.order.status)}</strong><div className="cr-metric-footer"><span>Hazırlama</span><span>{statusLabel(data.order.fulfillment_status)}</span></div></article>
            <article className="cr-card cr-metric"><small>Ödeme</small><strong>{statusLabel(data.order.payment_status)}</strong><div className="cr-metric-footer"><span>Kargo</span><span>{statusLabel(data.order.shipping_status)}</span></div></article>
          </section>

          <section className={`cr-card ${styles.panel}`}>
            <div className="cr-card__header"><div><span className="cr-eyebrow">Değiştirilemez denetim</span><h2>Operasyon zaman çizelgesi</h2></div><ShieldCheck /></div>
            {data.timeline.length === 0 ? <div className="cr-empty"><CheckCircle2 /><strong>Henüz kayıt bulunmuyor</strong></div> : (
              <div className={styles.timeline}>
                {data.timeline.map((event) => (
                  <article key={event.id} className={styles.timelineItem}>
                    <span className={styles.dot} />
                    <div className={styles.eventCopy}>
                      <strong>{eventTitle(event)}</strong>
                      <span>{event.reason || sourceLabel(event.source || event.actor_type)}</span>
                      <div className={styles.meta}>
                        <small><Clock3 /> {formatDateTime(event.occurred_at)}</small>
                        <small className={styles.metaCode}><Fingerprint /> {event.event_key || event.correlation_id || event.id}</small>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
