"use client";

import Link from "next/link";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Button, CommerceStatusBadge } from "@ruth-commerce/ui";
import FallbackImage from "@/components/FallbackImage";
import { formatPrice } from "@/lib/format";
import { orderCardTimeText, orderDateGroupLabel, orderItemCount, type OrderPresentationLike } from "@/lib/orderPresentation";
import { normalizeOrderStatus } from "@/lib/statusLabels";

export type UnifiedOrderCardOrder = OrderPresentationLike & {
  status: string;
  payment_status: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  shipping_city?: string | null;
  shipping_town?: string | null;
};

type Props = {
  order: UnifiedOrderCardOrder;
  onClick?: () => void;
  leading?: ReactNode;
  footerMeta?: ReactNode;
  action?: ReactNode;
  className?: string;
  showTimelineAction?: boolean;
  detailLabel?: string;
};

type OrderStage = "created" | "preparing" | "shipped" | "completed" | "cancelled";
const stageOrder: Exclude<OrderStage, "cancelled">[] = ["created", "preparing", "shipped", "completed"];

function orderStage(order: UnifiedOrderCardOrder): OrderStage {
  const status = normalizeOrderStatus(order.status, order);
  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "completed";
  if (status === "shipped") return "shipped";
  if (status === "preparing") return "preparing";
  return "created";
}

function stageTitle(stage: OrderStage) {
  if (stage === "preparing") return "Kargoya Hazır";
  if (stage === "shipped") return "Kargoya Verildi";
  if (stage === "completed") return "Teslim Edildi";
  if (stage === "cancelled") return "İptal Edildi";
  return "Yeni Sipariş";
}

function stageDescription(stage: OrderStage) {
  if (stage === "preparing") return "Paketleme ve kargo işlemi bekliyor";
  if (stage === "shipped") return "Gönderi kargo firmasına teslim edildi";
  if (stage === "completed") return "Sipariş müşteriye teslim edildi";
  if (stage === "cancelled") return "Sipariş operasyon akışından çıkarıldı";
  return "Sipariş oluşturuldu, hazırlama bekliyor";
}

function shippingStatus(order: UnifiedOrderCardOrder) {
  const raw = String(order.shipping_status || "").toLocaleLowerCase("tr-TR");
  if (["delivered", "teslim_edildi"].includes(raw)) return "delivered";
  if (["in_transit", "shipped", "kargoda"].includes(raw) || order.cargo_tracking_no) return "in_transit";
  if (["label_created", "created"].includes(raw) || order.basit_kargo_barcode) return "label_created";
  if (["ready_for_handover", "ready", "ready_to_ship"].includes(raw)) return "ready_for_handover";
  if (["exception", "delivery_failed", "failed"].includes(raw)) return "exception";
  if (["cancelled", "canceled"].includes(raw)) return "cancelled";
  if (raw === "returned") return "returned";
  return "not_created";
}

export function UnifiedOrderCard({ order, onClick, leading, footerMeta, action, className = "", showTimelineAction = true, detailLabel = "Detayı Aç" }: Props) {
  const count = orderItemCount(order);
  const stage = orderStage(order);
  const activeStageIndex = stage === "cancelled" ? -1 : stageOrder.indexOf(stage);
  const firstItem = order.order_items?.find((item) => Boolean(item.image_url)) || order.order_items?.[0];
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!onClick || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onClick();
  };
  const stop = (event: MouseEvent<HTMLElement>) => event.stopPropagation();

  return (
    <article className={`admin-shared-order-card preview-v2-order-record preview-v2-order-record--${stage} ${className}`.trim()} data-order-stage={stage} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={handleKeyDown}>
      <div className="admin-shared-order-card__leading preview-v2-order-record__leading" onClick={stop}>
        <span className="preview-v2-order-record__media">
          {firstItem?.image_url ? <FallbackImage src={firstItem.image_url} alt={firstItem.product_name || "Sipariş ürünü"} /> : <span className="preview-v2-order-record__media-placeholder" aria-hidden="true">R</span>}
        </span>
        {leading ? <span className="preview-v2-order-record__leading-control">{leading}</span> : null}
      </div>
      <header className="preview-v2-order-record__top"><div className="preview-v2-order-record__identity"><strong>{order.order_no}</strong><span>{orderCardTimeText(order.created_at)} · {orderDateGroupLabel(order.created_at)} · {count} ürün</span></div><strong className="preview-v2-order-record__total">{formatPrice(order.total_amount, order.currency || "TRY")}</strong></header>
      <div className="preview-v2-order-record__customer-grid"><div className="preview-v2-order-record__customer"><span className="preview-v2-order-record__label">Müşteri</span><strong>{order.customer_name || "İsimsiz müşteri"}</strong><small>{order.customer_email || order.customer_phone || "İletişim bilgisi yok"}</small></div><div className="preview-v2-order-record__items"><span className="preview-v2-order-record__label">Ürün</span><strong>{count} ürün</strong><small>{[order.shipping_town, order.shipping_city].filter(Boolean).join(" / ")}</small></div></div>
      <div className={`preview-v2-order-record__stage preview-v2-order-record__stage--${stage}`}><span className="preview-v2-order-record__stage-mark" aria-hidden="true" /><span><strong>{stageTitle(stage)}</strong><small>{stageDescription(stage)}</small></span></div>
      <div className="preview-v2-order-record__badges"><div><span className="preview-v2-order-record__label">Ödeme</span><CommerceStatusBadge status={order.payment_status || "pending"} domain="payment" /></div><div className="preview-v2-order-record__primary-status"><span className="preview-v2-order-record__label">Sipariş</span><CommerceStatusBadge status={normalizeOrderStatus(order.status, order)} domain="order" /></div><div><span className="preview-v2-order-record__label">Kargo</span><CommerceStatusBadge status={shippingStatus(order)} domain="shipping" /></div></div>
      <ol className={`preview-v2-order-record__progress ${stage === "cancelled" ? "is-cancelled" : ""}`}>{stageOrder.map((step, index) => <li key={step} className={index < activeStageIndex ? "is-done" : index === activeStageIndex ? "is-active" : ""}><span aria-hidden="true" /><small>{stageTitle(step)}</small></li>)}</ol>
      <footer className="preview-v2-order-record__footer" onClick={stop}>{footerMeta ? <div className="preview-v2-order-record__footer-meta">{footerMeta}</div> : null}<div className="preview-v2-order-record__actions">{action}{showTimelineAction ? <Link className="ruth-button ruth-button--secondary ruth-button--sm preview-v2-order-record__timeline" href={`/orders/${order.id}/timeline`}>Timeline</Link> : null}{onClick ? <Button size="sm" onClick={onClick}>{detailLabel}</Button> : null}</div></footer>
    </article>
  );
}
