import * as React from "react";

export type CardDensity = "compact" | "standard" | "detailed";

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: "article" | "section" | "div";
  interactive?: boolean;
  density?: CardDensity;
}

export function Card({
  as: Component = "article",
  interactive = false,
  density = "standard",
  className = "",
  children,
  ...props
}: CardProps) {
  return (
    <Component
      className={`ruth-card ruth-card--${density} ${interactive ? "ruth-card--interactive" : ""} ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface MetricCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  description?: React.ReactNode;
  hint?: React.ReactNode;
  detail?: React.ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
}

export function MetricCard({
  label,
  value,
  icon,
  description,
  hint,
  detail,
  expanded = false,
  onToggle,
  className = "",
}: MetricCardProps) {
  const supportingText = description ?? hint;
  const content = (
    <>
      <span className="ruth-metric-card__header">
        <span className="ruth-metric-card__label">{label}</span>
        {icon ? <span className="ruth-metric-card__icon" aria-hidden="true">{icon}</span> : null}
      </span>
      <strong className="ruth-metric-card__value">{value}</strong>
      {supportingText ? <span className="ruth-metric-card__description">{supportingText}</span> : null}
      {detail ? <span className={`ruth-metric-card__detail ${expanded ? "is-open" : ""}`.trim()}>{detail}</span> : null}
    </>
  );

  if (onToggle) {
    return (
      <button
        type="button"
        className={`ruth-card ruth-card--compact ruth-card--interactive ruth-metric-card ruth-metric-card--button ${className}`.trim()}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {content}
      </button>
    );
  }

  return <article className={`ruth-card ruth-card--compact ruth-metric-card ${className}`.trim()}>{content}</article>;
}

export interface ProductCardProps extends React.HTMLAttributes<HTMLElement> {
  title: string;
  price: string;
  oldPrice?: string;
  material?: string;
  badge?: string;
  media?: React.ReactNode;
  href?: string;
  favoriteAction?: React.ReactNode;
  quickAction?: React.ReactNode;
  action?: React.ReactNode;
}

export function ProductCard({
  title,
  price,
  oldPrice,
  material,
  badge,
  media,
  href,
  favoriteAction,
  quickAction,
  action,
  className = "",
  ...props
}: ProductCardProps) {
  return (
    <article className={`ruth-product-card ${href ? "ruth-product-card--linked" : ""} ${className}`.trim()} {...props}>
      {href ? <a className="ruth-card-link" href={href} aria-label={`${title} ürününü görüntüle`} /> : null}
      <div className="ruth-product-card__media">
        {media ?? <div className="ruth-product-card__placeholder" aria-hidden="true" />}
        {badge ? <span className="ruth-product-card__badge">{badge}</span> : null}
        {favoriteAction ? <div className="ruth-product-card__favorite">{favoriteAction}</div> : null}
        {quickAction ? <div className="ruth-product-card__quick-action">{quickAction}</div> : null}
      </div>
      <div className="ruth-product-card__content">
        <div>
          {material ? <p className="ruth-product-card__material">{material}</p> : null}
          <h3>{title}</h3>
          <div className="ruth-product-card__price">
            <strong>{price}</strong>
            {oldPrice ? <del>{oldPrice}</del> : null}
          </div>
        </div>
        {action ? <div className="ruth-product-card__action">{action}</div> : null}
      </div>
    </article>
  );
}

export interface EditorialCardProps extends React.HTMLAttributes<HTMLElement> {
  eyebrow?: string;
  title: string;
  description?: string;
  media?: React.ReactNode;
  href?: string;
  action?: React.ReactNode;
}

export function EditorialCard({ eyebrow, title, description, media, href, action, className = "", ...props }: EditorialCardProps) {
  return (
    <article className={`ruth-editorial-card ${href ? "ruth-editorial-card--linked" : ""} ${className}`.trim()} {...props}>
      {href ? <a className="ruth-card-link" href={href} aria-label={`${title} koleksiyonunu görüntüle`} /> : null}
      <div className="ruth-editorial-card__media">
        {media ?? <div className="ruth-editorial-card__placeholder" aria-hidden="true" />}
      </div>
      <div className="ruth-editorial-card__content">
        {eyebrow ? <p>{eyebrow}</p> : null}
        <div className="ruth-editorial-card__title-row">
          <h3>{title}</h3>
          {href ? <span className="ruth-editorial-card__arrow" aria-hidden="true">→</span> : null}
        </div>
        {description ? <span>{description}</span> : null}
        {action ? <div>{action}</div> : null}
      </div>
    </article>
  );
}
