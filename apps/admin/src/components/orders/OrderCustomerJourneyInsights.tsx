"use client";

import {
  Clock3,
  Eye,
  Flame,
  Gauge,
  MousePointerClick,
  Route,
  ShoppingCart,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { adminRequest } from "@/lib/adminApi";

import styles from "./OrderCustomerJourneyInsights.module.css";

type JsonRecord = Record<string, unknown>;
type JourneyOrder = {
  id: string;
  order_no: string;
  visitor_id?: string | null;
  purchase_session_id?: string | null;
  session_count_before_purchase?: number | null;
  purchase_session_number?: number | null;
  total_session_duration_seconds?: number | null;
  purchase_session_duration_seconds?: number | null;
  attribution_data?: JsonRecord | null;
};

type JourneyResponse = { order: JourneyOrder };

const visibleTranslations: Record<string, string> = {
  Storefront: "Mağaza",
  storefront: "Mağaza",
  direct: "Doğrudan",
  referral: "Yönlendirme",
  organic: "Organik",
  paid: "Ödendi",
  refunded: "İade edildi",
  cancelled: "İptal edildi",
  active: "Aktif",
  inactive: "Pasif",
  ready_to_ship: "Kargoya hazır",
  in_production: "Hazırlanıyor",
  quality_control: "Kalite kontrol",
  shipped: "Gönderildi",
  delivered: "Teslim edildi",
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function list(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as JsonRecord[] : [];
}

function numeric(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function durationLabel(totalSeconds: unknown) {
  const seconds = Math.max(0, Math.round(numeric(totalSeconds)));
  if (seconds < 60) return `${seconds} sn`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk ${seconds % 60} sn`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours} sa ${remainingMinutes} dk`;
  const days = Math.floor(hours / 24);
  return `${days} gün ${hours % 24} sa`;
}

function heatPresentation(score: number) {
  if (score >= 75) return { label: "Sıcak müşteri", tone: styles.hot };
  if (score >= 45) return { label: "Ilık müşteri", tone: styles.warm };
  return { label: "Soğuk müşteri", tone: styles.cold };
}

function fallbackHeatScore(attribution: JsonRecord, order: JourneyOrder) {
  const pageViews = numeric(attribution.page_views);
  const cartAdds = numeric(attribution.cart_adds);
  const checkoutStarts = numeric(attribution.checkout_starts);
  const sessions = numeric(order.session_count_before_purchase || order.purchase_session_number);
  return Math.min(100, Math.round(
    Math.min(35, pageViews * 0.35)
    + Math.min(25, cartAdds * 7)
    + Math.min(25, checkoutStarts * 5)
    + Math.min(15, sessions * 1.5),
  ));
}

function translateDrawerValues(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const value = node.nodeValue?.trim() || "";
    const translated = visibleTranslations[value];
    if (translated && node.nodeValue) node.nodeValue = node.nodeValue.replace(value, translated);
    node = walker.nextNode();
  }
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <article className={styles.metric}>
      <span>{icon}</span>
      <div><small>{label}</small><strong>{value}</strong></div>
    </article>
  );
}

export function OrderCustomerJourneyInsights({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order") || "";
  const [target, setTarget] = useState<Element | null>(null);
  const [order, setOrder] = useState<JourneyOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setTarget(null);
      setOrder(null);
      setError(null);
      return;
    }

    const syncTarget = () => {
      const nextTarget = document.querySelector(".ruth-drawer .cr-order-detail-content");
      setTarget(nextTarget);
      const drawer = document.querySelector(".ruth-drawer");
      if (drawer) translateDrawerValues(drawer);
    };

    syncTarget();
    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [orderId]);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await adminRequest<JourneyResponse>(
        `/api/orders/insights?order_id=${encodeURIComponent(orderId)}`,
        { force: true, ttlMs: 0, staleMs: 0 },
      );
      setOrder(result.order || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Müşteri yolculuğu alınamadı.");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const insight = useMemo(() => {
    if (!order) return null;
    const attribution = record(order.attribution_data);
    const customer = record(attribution.customer);
    const sessions = list(attribution.sessions);
    const timeline = list(attribution.timeline);
    const purchaseSession = sessions.find((session) => text(session.session_id) === order.purchase_session_id)
      || sessions.at(-1)
      || {};
    const scoreValue = numeric(customer.heat_score) || fallbackHeatScore(attribution, order);
    const score = Math.max(0, Math.min(100, Math.round(scoreValue)));
    const pageSequence = Array.isArray(purchaseSession.pages)
      ? purchaseSession.pages.map(text).filter(Boolean)
      : [];
    const uniquePages = [...new Set(pageSequence)];
    const recentTimeline = timeline.slice(-12);

    return {
      attribution,
      customer,
      purchaseSession,
      score,
      heat: heatPresentation(score),
      uniquePages,
      recentTimeline,
    };
  }, [order]);

  const card = target ? createPortal(
    <section className={`cr-inspector-section ${styles.card}`} aria-label="Müşteri ısı haritası ve satın alma yolculuğu">
      <div className="cr-inspector-section__header">
        <div><span>Müşteri analizi</span><h3>Isı haritası ve satın alma yolculuğu</h3></div>
        <Flame />
      </div>

      {loading ? <div className={styles.loading}><span className="cr-spinner cr-spinner--small" /> Yolculuk verileri hazırlanıyor</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      {!loading && insight && order ? (
        <>
          <div className={`${styles.heatPanel} ${insight.heat.tone}`}>
            <div className={styles.scoreRing} aria-label={`Müşteri sıcaklık puanı ${insight.score} üzerinden 100`}>
              <strong>{insight.score}</strong><span>/100</span>
            </div>
            <div className={styles.heatCopy}>
              <small>Müşteri sıcaklığı</small>
              <strong>{insight.heat.label}</strong>
              <p>{text(insight.customer.segment) || "Davranış verilerine göre otomatik sınıflandırma"}</p>
            </div>
            <div className={styles.progress} aria-hidden="true"><span style={{ width: `${insight.score}%` }} /></div>
          </div>

          <div className={styles.metrics}>
            <Metric icon={<Clock3 />} label="Satın alma oturumu" value={durationLabel(order.purchase_session_duration_seconds)} />
            <Metric icon={<Gauge />} label="Toplam aktif süre" value={durationLabel(order.total_session_duration_seconds)} />
            <Metric icon={<Route />} label="Satın alma kararı" value={durationLabel(insight.attribution.decision_time_seconds)} />
            <Metric icon={<MousePointerClick />} label="Satın almaya kadar" value={`${order.session_count_before_purchase || order.purchase_session_number || 1} oturum`} />
            <Metric icon={<Eye />} label="Görüntülenen sayfa" value={`${numeric(insight.attribution.page_views)} görüntüleme`} />
            <Metric icon={<ShoppingCart />} label="Sepet / ödeme ilgisi" value={`${numeric(insight.attribution.cart_adds)} sepet · ${numeric(insight.attribution.checkout_starts)} ödeme`} />
          </div>

          <div className={styles.journeyBlock}>
            <div className={styles.blockHeading}><div><small>Satın alma oturumu</small><strong>Gezilen sayfalar</strong></div><span>{insight.uniquePages.length} farklı sayfa</span></div>
            {insight.uniquePages.length ? (
              <div className={styles.pageFlow}>
                {insight.uniquePages.map((page, index) => <span key={`${page}-${index}`}>{page === "/" ? "Ana sayfa" : page}</span>)}
              </div>
            ) : <p className={styles.empty}>Bu sipariş için sayfa yolculuğu bulunmuyor.</p>}
          </div>

          {insight.recentTimeline.length ? (
            <details className={styles.timelineDetails}>
              <summary>Son müşteri hareketlerini göster</summary>
              <div className={styles.timeline}>
                {insight.recentTimeline.map((event, index) => (
                  <div key={`${text(event.at)}-${index}`}>
                    <span>{text(event.event) === "cart_add" ? "Sepete ekledi" : text(event.event) === "payment_start" ? "Ödemeyi başlattı" : "Sayfayı görüntüledi"}</span>
                    <strong>{text(event.product_name) || (text(event.path) === "/" ? "Ana sayfa" : text(event.path)) || "—"}</strong>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </section>,
    target,
  ) : null;

  return <div className={styles.root}>{children}{card}</div>;
}
