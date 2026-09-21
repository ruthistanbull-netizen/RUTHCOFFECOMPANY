import * as React from "react";
import { CommerceStatusBadge } from "./commerce-status";
import type { CommerceStatusKey } from "./status-presentation";

export type UnifiedOrderCardDensity = "compact" | "standard" | "detailed";

export interface UnifiedOrderCardItem {
  id: string;
  title: string;
  subtitle?: string;
  quantity: number;
  price?: string;
  media?: React.ReactNode;
}

export interface UnifiedOrderCardProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  orderNumber: string;
  customerName: string;
  customerMeta?: React.ReactNode;
  createdAt: React.ReactNode;
  total: React.ReactNode;
  orderStatus: CommerceStatusKey | string;
  paymentStatus: CommerceStatusKey | string;
  fulfillmentStatus: CommerceStatusKey | string;
  shippingStatus: CommerceStatusKey | string;
  items?: UnifiedOrderCardItem[];
  itemSummary?: React.ReactNode;
  alert?: React.ReactNode;
  actions?: React.ReactNode;
  href?: string;
  density?: UnifiedOrderCardDensity;
}

export function UnifiedOrderCard({
  orderNumber,
  customerName,
  customerMeta,
  createdAt,
  total,
  orderStatus,
  paymentStatus,
  fulfillmentStatus,
  shippingStatus,
  items = [],
  itemSummary,
  alert,
  actions,
  href,
  density = "compact",
  className = "",
  ...props
}: UnifiedOrderCardProps) {
  const headingId = React.useId();

  return (
    <article
      className={`ruth-order-card ruth-order-card--${density} ${href ? "ruth-order-card--linked" : ""} ${className}`.trim()}
      aria-labelledby={headingId}
      {...props}
    >
      {href ? <a className="ruth-card-link" href={href} aria-label={`${orderNumber} siparişini görüntüle`} /> : null}

      <header className="ruth-order-card__header">
        <div className="ruth-order-card__identity">
          <p className="ruth-order-card__eyebrow">Sipariş</p>
          <h3 id={headingId}>{orderNumber}</h3>
          <p className="ruth-order-card__customer">
            <strong>{customerName}</strong>
            {customerMeta ? <span>{customerMeta}</span> : null}
          </p>
        </div>
        <div className="ruth-order-card__summary">
          <span>{createdAt}</span>
          <strong>{total}</strong>
        </div>
      </header>

      {alert ? <div className="ruth-order-card__alert">{alert}</div> : null}

      <dl className="ruth-order-card__statuses">
        <div>
          <dt>Sipariş</dt>
          <dd><CommerceStatusBadge status={orderStatus} domain="order" /></dd>
        </div>
        <div>
          <dt>Ödeme</dt>
          <dd><CommerceStatusBadge status={paymentStatus} domain="payment" /></dd>
        </div>
        <div>
          <dt>Hazırlama</dt>
          <dd><CommerceStatusBadge status={fulfillmentStatus} domain="fulfillment" /></dd>
        </div>
        <div>
          <dt>Kargo</dt>
          <dd><CommerceStatusBadge status={shippingStatus} domain="shipping" /></dd>
        </div>
      </dl>

      {items.length > 0 ? (
        <ul className="ruth-order-card__items" aria-label="Sipariş ürünleri">
          {items.map((item) => (
            <li key={item.id}>
              <div className="ruth-order-card__media">{item.media ?? <span aria-hidden="true" />}</div>
              <div className="ruth-order-card__item-copy">
                <strong>{item.title}</strong>
                {item.subtitle ? <span>{item.subtitle}</span> : null}
                <small>Adet: {item.quantity}</small>
              </div>
              {item.price ? <strong className="ruth-order-card__item-price">{item.price}</strong> : null}
            </li>
          ))}
        </ul>
      ) : itemSummary ? <div className="ruth-order-card__item-summary">{itemSummary}</div> : null}

      {actions ? <footer className="ruth-order-card__actions">{actions}</footer> : null}
    </article>
  );
}
