"use client";

import * as React from "react";
import { LoadingIndicator } from "./feedback";

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action, className = "", ...props }: EmptyStateProps) {
  return (
    <div className={`ruth-empty-state ${className}`.trim()} {...props}>
      {icon ? <div className="ruth-empty-state__icon" aria-hidden="true">{icon}</div> : null}
      <div className="ruth-empty-state__copy">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="ruth-empty-state__action">{action}</div> : null}
    </div>
  );
}

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
}

export function Skeleton({ width, height, rounded = false, className = "", style, ...props }: SkeletonProps) {
  return (
    <div
      className={`ruth-skeleton ${rounded ? "ruth-skeleton--rounded" : ""} ${className}`.trim()}
      style={{ width, height, ...style }}
      aria-hidden="true"
      {...props}
    />
  );
}

export interface TabItem {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  ariaLabel?: string;
}

export function Tabs({ items, value, defaultValue, onValueChange, ariaLabel = "Sekmeler", className = "", ...props }: TabsProps) {
  const firstEnabled = items.find((item) => !item.disabled)?.value ?? "";
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? firstEnabled);
  const activeValue = value ?? internalValue;
  const triggerRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  function select(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  function moveFocus(currentIndex: number, direction: 1 | -1) {
    if (items.length === 0) return;
    let nextIndex = currentIndex;
    for (let step = 0; step < items.length; step += 1) {
      nextIndex = (nextIndex + direction + items.length) % items.length;
      if (!items[nextIndex]?.disabled) {
        triggerRefs.current[nextIndex]?.focus();
        select(items[nextIndex].value);
        return;
      }
    }
  }

  return (
    <div className={`ruth-tabs ${className}`.trim()} {...props}>
      <div className="ruth-tabs__list" role="tablist" aria-label={ariaLabel}>
        {items.map((item, index) => {
          const active = item.value === activeValue;
          return (
            <button
              key={item.value}
              ref={(node) => { triggerRefs.current[index] = node; }}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              disabled={item.disabled}
              className={`ruth-tabs__trigger ${active ? "ruth-tabs__trigger--active" : ""}`.trim()}
              onClick={() => select(item.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  moveFocus(index, 1);
                }
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  moveFocus(index, -1);
                }
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type DataTableDensity = "compact" | "standard";

export interface DataTableColumn<Row> {
  key: string;
  header: React.ReactNode;
  cell: (row: Row) => React.ReactNode;
  align?: "left" | "center" | "right";
  width?: string | number;
  mobileLabel?: string;
  hideOnMobile?: boolean;
}

export interface DataTableProps<Row> extends Omit<React.TableHTMLAttributes<HTMLTableElement>, "children"> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row, index: number) => React.Key;
  caption?: string;
  emptyState?: React.ReactNode;
  density?: DataTableDensity;
  loading?: boolean;
  loadingLabel?: string;
  onRowActivate?: (row: Row, index: number) => void;
  getRowLabel?: (row: Row, index: number) => string;
}

export function isInteractiveActivationTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("a, button, input, select, textarea, label, [role='button'], [role='link'], [role='checkbox'], [role='menuitem']"));
}

export function DataTable<Row>({
  columns,
  rows,
  getRowKey,
  caption,
  emptyState,
  density = "standard",
  loading = false,
  loadingLabel = "Veriler yükleniyor",
  onRowActivate,
  getRowLabel,
  className = "",
  ...props
}: DataTableProps<Row>) {
  if (!loading && rows.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div
      className={`ruth-data-table-wrap ruth-data-table-wrap--${density}`}
      role="region"
      aria-label={caption || "Veri tablosu"}
      tabIndex={0}
    >
      <table className={`ruth-data-table ruth-data-table--${density} ${className}`.trim()} {...props}>
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.hideOnMobile ? "ruth-data-table__mobile-hidden" : undefined}
                style={{ textAlign: column.align, width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="ruth-data-table__loading" role="status" aria-busy="true">
                <LoadingIndicator size="sm" /> {loadingLabel}
              </td>
            </tr>
          ) : rows.map((row, index) => {
            const interactive = Boolean(onRowActivate);
            return (
              <tr
                key={getRowKey(row, index)}
                className={interactive ? "ruth-data-table__row--interactive" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={interactive ? getRowLabel?.(row, index) : undefined}
                onClick={interactive ? (event) => {
                  if (!isInteractiveActivationTarget(event.target)) onRowActivate?.(row, index);
                } : undefined}
                onKeyDown={interactive ? (event) => {
                  if ((event.key === "Enter" || event.key === " ") && !isInteractiveActivationTarget(event.target)) {
                    event.preventDefault();
                    onRowActivate?.(row, index);
                  }
                } : undefined}
              >
                {columns.map((column) => {
                  const mobileLabel = column.mobileLabel ?? (typeof column.header === "string" ? column.header : undefined);
                  return (
                    <td
                      key={column.key}
                      data-label={mobileLabel}
                      className={column.hideOnMobile ? "ruth-data-table__mobile-hidden" : undefined}
                      style={{ textAlign: column.align }}
                    >
                      {column.cell(row)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface SegmentedControlItem<Value extends string = string> {
  value: Value;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<Value extends string = string>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  items: Array<SegmentedControlItem<Value>>;
  value: Value;
  onValueChange: (value: Value) => void;
  ariaLabel?: string;
  density?: "compact" | "standard";
}

export function SegmentedControl<Value extends string = string>({
  items,
  value,
  onValueChange,
  ariaLabel = "Seçenekler",
  density = "standard",
  className = "",
  ...props
}: SegmentedControlProps<Value>) {
  return (
    <div
      className={`ruth-segmented ruth-segmented--${density} ${className}`.trim()}
      role="group"
      aria-label={ariaLabel}
      {...props}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={item.value === value ? "is-active" : ""}
          aria-pressed={item.value === value}
          disabled={item.disabled}
          onClick={() => onValueChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
