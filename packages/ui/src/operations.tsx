import * as React from "react";

export interface KeyValueItem {
  key: React.Key;
  label: React.ReactNode;
  value: React.ReactNode;
  emphasis?: boolean;
}

export interface KeyValueListProps extends React.HTMLAttributes<HTMLDListElement> {
  items: KeyValueItem[];
  density?: "compact" | "standard";
}

export function KeyValueList({ items, density = "standard", className = "", ...props }: KeyValueListProps) {
  return (
    <dl className={`ruth-key-value-list ruth-key-value-list--${density} ${className}`.trim()} {...props}>
      {items.map((item) => (
        <div key={item.key} className={item.emphasis ? "ruth-key-value-list__emphasis" : undefined}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface StatusTimelineItem {
  id: React.Key;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  status?: React.ReactNode;
  value?: React.ReactNode;
  content?: React.ReactNode;
}

export interface StatusTimelineProps extends React.HTMLAttributes<HTMLOListElement> {
  items: StatusTimelineItem[];
  emptyState?: React.ReactNode;
}

export function StatusTimeline({ items, emptyState, className = "", ...props }: StatusTimelineProps) {
  if (items.length === 0) return <>{emptyState ?? null}</>;

  return (
    <ol className={`ruth-status-timeline ${className}`.trim()} {...props}>
      {items.map((item) => (
        <li key={item.id} className="ruth-status-timeline__item">
          <span className="ruth-status-timeline__rail" aria-hidden="true">
            <span className="ruth-status-timeline__icon">{item.icon}</span>
          </span>
          <span className="ruth-status-timeline__copy">
            <strong>{item.title}</strong>
            {item.description ? <span>{item.description}</span> : null}
            {item.meta ? <small>{item.meta}</small> : null}
          </span>
          {(item.status || item.value) ? (
            <span className="ruth-status-timeline__aside">
              {item.status}
              {item.value ? <strong>{item.value}</strong> : null}
            </span>
          ) : null}
          {item.content ? <div className="ruth-status-timeline__content">{item.content}</div> : null}
        </li>
      ))}
    </ol>
  );
}
