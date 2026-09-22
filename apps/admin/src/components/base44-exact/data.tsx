"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { Pressable, isInteractiveActivationTarget, usePressable } from "@ruth-commerce/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactCartActivityPopup } from "./ExactCartActivityPopup";
import { ExactNetSalesPopup } from "./ExactNetSalesPopup";
import { exactCx } from "./primitives";

export function ExactDataCard({
  title,
  action,
  children,
  className,
  bodyClassName,
  noPadding = false,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  noPadding?: boolean;
}) {
  return (
    <section className={exactCx("bg-surface-primary radius-card shadow-card overflow-hidden", className)}>
      {title || action ? (
        <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-subtle">
          {title ? <h3 className="ruth-type-card-title text-main">{title}</h3> : <span />}
          {action ? <div className="ruth-type-control shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={exactCx(noPadding ? "" : "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
}

function fullCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function MetricCardPressSurface({
  ariaLabel,
  onActivate,
  children,
}: {
  ariaLabel: string;
  onActivate: () => void;
  children: ReactNode;
}) {
  const { pressableProps } = usePressable<HTMLDivElement>();
  const { onKeyDown: onPressKeyDown, ...pressProps } = pressableProps;

  return (
    <div
      {...pressProps}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      data-ruth-press-strength="subtle"
      data-ruth-hover-lift="false"
      onClick={onActivate}
      onKeyDown={(event) => {
        onPressKeyDown?.(event);
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      className="ruth-pressable cursor-pointer rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
    </div>
  );
}

export function ExactMetricCard({
  label,
  value,
  change,
  trend,
  icon: Icon,
  format = "number",
  suffix,
  className,
  accent = false,
}: {
  label: string;
  value: number;
  change?: number | null;
  trend?: "up" | "down";
  icon?: LucideIcon;
  format?: "number" | "currency" | "percent";
  suffix?: string;
  className?: string;
  accent?: boolean;
}) {
  const [cartPopupOpen, setCartPopupOpen] = useState(false);
  const [netSalesPopupOpen, setNetSalesPopupOpen] = useState(false);
  const [activeVisitors, setActiveVisitors] = useState(0);
  const displayValue = format === "currency"
    ? label === "Net Satış" ? fullCurrency(value) : compactCurrency(value)
    : format === "percent"
      ? `${Number(value || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}%`
      : compactNumber(value);

  useEffect(() => {
    if (label !== "Oturum") return;
    let mounted = true;
    let requestSequence = 0;

    const loadLiveVisitors = async () => {
      const requestId = ++requestSequence;
      try {
        const payload = await adminRequest<{ activeVisitors?: number }>("/api/dashboard/live-visitors", {
          hardRefresh: true,
          ttlMs: 0,
          staleMs: 0,
        });
        if (!mounted || requestId !== requestSequence) return;
        setActiveVisitors(Math.max(0, Number(payload.activeVisitors || 0)));
      } catch {
        // Keep the last confirmed value if a single heartbeat request fails.
      }
    };

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void loadLiveVisitors();
    };

    void loadLiveVisitors();
    const interval = window.setInterval(refreshIfVisible, 15_000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      mounted = false;
      requestSequence += 1;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [label]);

  const card = (
    <article className={exactCx(
      "relative overflow-hidden radius-card p-4 transition-all duration-200 hover:shadow-card",
      accent
        ? "bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent-hover))] text-white shadow-floating"
        : "bg-surface-primary shadow-card",
      className,
    )}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className={exactCx("ruth-type-label", accent ? "text-white/80" : "text-muted")}>{label}</span>
        {Icon ? (
          <div className={exactCx("flex items-center justify-center h-7 w-7 radius-small shrink-0", accent ? "bg-white/20" : "bg-accent-soft text-accent")}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        ) : null}
      </div>
      <div className={exactCx("ruth-type-metric", accent ? "text-white" : "text-main")}>{displayValue}{suffix}</div>
      {label === "Oturum" ? (
        <div className={exactCx("mt-2 flex items-center gap-2 text-[11px] font-medium", accent ? "text-white/90" : "text-success-foreground")}>
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className={exactCx("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", accent ? "bg-white" : "bg-success")} />
            <span className={exactCx("relative inline-flex h-2.5 w-2.5 rounded-full", accent ? "bg-white" : "bg-success")} />
          </span>
          <span>{activeVisitors.toLocaleString("tr-TR")} kişi şu anda sitede</span>
        </div>
      ) : change != null ? (
        <div className="flex items-center gap-1 mt-2">
          <span className={exactCx("ruth-type-caption font-medium", accent ? "text-white/90" : trend === "up" ? "text-success-foreground" : "text-danger-foreground")}>{trend === "up" ? "↑" : "↓"} {Math.abs(change)}%</span>
          <span className={exactCx("ruth-type-caption", accent ? "text-white/60" : "text-subtle")}>önceki döneme göre</span>
        </div>
      ) : null}
    </article>
  );

  if (label === "Sepet") {
    return (
      <>
        <MetricCardPressSurface ariaLabel="Sepete eklenen ürünleri aç" onActivate={() => setCartPopupOpen(true)}>
          {card}
        </MetricCardPressSurface>
        <ExactCartActivityPopup open={cartPopupOpen} onClose={() => setCartPopupOpen(false)} />
      </>
    );
  }

  if (label === "Net Satış") {
    return (
      <>
        <MetricCardPressSurface ariaLabel="Net satışı oluşturan siparişleri aç" onActivate={() => setNetSalesPopupOpen(true)}>
          {card}
        </MetricCardPressSurface>
        <ExactNetSalesPopup open={netSalesPopupOpen} onClose={() => setNetSalesPopupOpen(false)} />
      </>
    );
  }

  return card;
}

const avatarColors = [
  "bg-accent-soft text-accent",
  "bg-success-soft text-success-foreground",
  "bg-warning-soft text-warning-foreground",
  "bg-info-soft text-info-foreground",
  "bg-danger-soft text-danger-foreground",
  "bg-neutral-soft text-neutral-foreground",
];

function initials(name: string) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toLocaleUpperCase("tr-TR") || "?";
}

export function ExactAvatar({ name, src, size = "md", className }: { name: string; src?: string | null; size?: "xs" | "sm" | "md" | "lg" | "xl"; className?: string }) {
  const sizes = { xs: "h-6 w-6 ruth-type-caption", sm: "h-8 w-8 text-xs", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm", xl: "h-16 w-16 text-lg" };
  const colorIndex = name ? name.charCodeAt(0) % avatarColors.length : 0;
  if (src) return <img src={src} alt={name} className={exactCx("rounded-full object-cover shrink-0", sizes[size], className)} />;
  return <div className={exactCx("flex items-center justify-center rounded-full font-semibold shrink-0", sizes[size], avatarColors[colorIndex], className)}>{initials(name)}</div>;
}

export function ExactEmptyState({ icon: Icon, title, description, action, compact = false }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={exactCx("flex flex-col items-center justify-center text-center", compact ? "py-8 px-4" : "py-12 px-6")}>
      {Icon ? <div className={exactCx("flex items-center justify-center rounded-full bg-surface-tertiary text-subtle mb-3", compact ? "h-10 w-10" : "h-14 w-14")}><Icon className={compact ? "h-5 w-5" : "h-6 w-6"} /></div> : null}
      <p className="ruth-type-card-title text-main">{title}</p>
      {description ? <p className="ruth-type-caption text-muted mt-1 max-w-xs">{description}</p> : null}
      {action ? <div className="ruth-type-control mt-4">{action}</div> : null}
    </div>
  );
}

export type ExactColumn<Row extends { id?: string }> = {
  key: keyof Row | string;
  label: string;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  render?: (row: Row) => ReactNode;
  cellClassName?: string;
};

export type ExactDataTableDensity = "normal" | "compact";
export type ExactDataTableSortDirection = "asc" | "desc";

export type ExactDataTableSelection<Row extends { id?: string }> = {
  selectedIds: ReadonlySet<string>;
  onToggleRow: (row: Row) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  someSelected?: boolean;
  disabled?: boolean;
  label?: string;
};

export type ExactDataTableSortState = {
  key: string | null;
  direction: ExactDataTableSortDirection;
  onChange: (key: string, direction: ExactDataTableSortDirection) => void;
  dataIsPreSorted?: boolean;
};

export function ExactDataTable<Row extends { id?: string }>({
  columns,
  data,
  onRowClick,
  mobileCard,
  emptyState,
  loading,
  density = "normal",
  selection,
  sortState,
}: {
  columns: ExactColumn<Row>[];
  data: Row[];
  onRowClick?: (row: Row) => void;
  mobileCard?: (row: Row, index: number) => ReactNode;
  emptyState?: ReactNode;
  loading?: boolean;
  density?: ExactDataTableDensity;
  selection?: ExactDataTableSelection<Row>;
  sortState?: ExactDataTableSortState;
}) {
  const [internalSortKey, setInternalSortKey] = useState<string | null>(null);
  const [internalSortDir, setInternalSortDir] = useState<ExactDataTableSortDirection>("asc");
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const sortKey = sortState?.key ?? internalSortKey;
  const sortDir = sortState?.direction ?? internalSortDir;
  const sorted = useMemo(() => {
    if (sortState?.dataIsPreSorted || !sortKey) return data;
    return [...data].sort((a, b) => {
      const aValue = (a as Record<string, unknown>)[sortKey];
      const bValue = (b as Record<string, unknown>)[sortKey];
      if (aValue == null) return 1;
      if (bValue == null) return -1;
      if (typeof aValue === "number" && typeof bValue === "number") return sortDir === "asc" ? aValue - bValue : bValue - aValue;
      const comparison = String(aValue).localeCompare(String(bValue), "tr-TR");
      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [data, sortDir, sortKey, sortState?.dataIsPreSorted]);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = Boolean(selection?.someSelected && !selection.allSelected);
  }, [selection?.allSelected, selection?.someSelected]);

  if (loading) return null;
  if (!data.length) return <div className="bg-surface-primary radius-card shadow-card">{emptyState || <ExactEmptyState title="Veri bulunamadı" description="Filtreleri değiştirmeyi dene." />}</div>;

  const headerPadding = density === "compact" ? "py-2" : "py-2.5";
  const cellPadding = density === "compact" ? "py-2" : "py-3";

  const requestSort = (key: string) => {
    const nextDirection: ExactDataTableSortDirection = sortKey === key && sortDir === "asc" ? "desc" : "asc";
    if (sortState) {
      sortState.onChange(key, nextDirection);
      return;
    }
    setInternalSortKey(key);
    setInternalSortDir(nextDirection);
  };

  return (
    <>
      <div className="hidden md:block bg-surface-primary radius-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                {selection ? (
                  <th className={exactCx("w-12 px-3 text-center", headerPadding)}>
                    <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[var(--radius-small)]" aria-label={selection.label || "Bu kapsamdaki satırları seç"}>
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={selection.allSelected}
                        onChange={selection.onToggleAll}
                        disabled={selection.disabled}
                        className="h-4 w-4"
                      />
                    </label>
                  </th>
                ) : null}
                {columns.map((column) => (
                  <th
                    key={String(column.key)}
                    onClick={() => {
                      if (!column.sortable) return;
                      requestSort(String(column.key));
                    }}
                    className={exactCx(
                      "ruth-type-table text-left px-4 uppercase tracking-wide text-subtle whitespace-nowrap",
                      headerPadding,
                      column.sortable && "cursor-pointer hover:text-muted transition-colors",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                    )}
                  >
                    <span className={exactCx("inline-flex items-center gap-1", column.align === "right" && "flex-row-reverse")}>
                      {column.label}
                      {column.sortable && sortKey === String(column.key) ? <ChevronDown className={exactCx("h-3 w-3 transition-transform", sortDir === "desc" && "rotate-180")} /> : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, index) => {
                const rowId = String(row.id || "");
                const selected = Boolean(selection && rowId && selection.selectedIds.has(rowId));
                return (
                  <tr
                    key={row.id || index}
                    tabIndex={onRowClick ? 0 : undefined}
                    aria-selected={selection ? selected : undefined}
                    onClick={onRowClick ? (event) => {
                      if (!isInteractiveActivationTarget(event.target)) onRowClick(row);
                    } : undefined}
                    onKeyDown={onRowClick ? (event) => {
                      if ((event.key === "Enter" || event.key === " ") && !isInteractiveActivationTarget(event.target)) {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    } : undefined}
                    className={exactCx(
                      "border-b border-border-subtle last:border-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                      selected && "bg-accent-soft/60",
                      onRowClick && "cursor-pointer hover:bg-surface-secondary",
                    )}
                  >
                    {selection ? (
                      <td className={exactCx("w-12 px-3 text-center", cellPadding)}>
                        <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[var(--radius-small)]" aria-label={`${rowId || index + 1}. satırı seç`}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => selection.onToggleRow(row)}
                            disabled={selection.disabled || !rowId}
                            className="h-4 w-4"
                          />
                        </label>
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td key={String(column.key)} className={exactCx("ruth-type-table px-4 text-main whitespace-nowrap", cellPadding, column.align === "right" && "text-right", column.align === "center" && "text-center", column.cellClassName)}>
                        {column.render ? column.render(row) : String((row as Record<string, unknown>)[String(column.key)] ?? "")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="md:hidden space-y-2">
        {sorted.map((row, index) => {
          const rowId = String(row.id || "");
          const selected = Boolean(selection && rowId && selection.selectedIds.has(rowId));
          const card = mobileCard ? mobileCard(row, index) : (
            <Pressable type="button" pressStrength="subtle" onClick={() => onRowClick?.(row)} className={exactCx("w-full min-h-11 text-left bg-surface-primary radius-card shadow-card", density === "compact" ? "p-2.5" : "p-3.5")}>
              <div className="flex items-center justify-between mb-2"><span className="ruth-type-card-title text-main">{columns[0]?.render ? columns[0].render(row) : String((row as Record<string, unknown>)[String(columns[0]?.key)] ?? "")}</span></div>
              <div className="space-y-1">{columns.slice(1).map((column) => <div key={String(column.key)} className="ruth-type-caption flex items-center justify-between gap-3"><span className="text-subtle">{column.label}</span><span className="text-muted font-medium text-right">{column.render ? column.render(row) : String((row as Record<string, unknown>)[String(column.key)] ?? "")}</span></div>)}</div>
            </Pressable>
          );

          if (!selection) return <div key={row.id || index}>{card}</div>;
          return (
            <div key={row.id || index} className={exactCx("flex items-stretch gap-2 rounded-[var(--radius-card)]", selected && "ring-2 ring-accent ring-offset-1")}>
              <label className="flex min-h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-card)] bg-surface-primary shadow-card" aria-label={`${rowId || index + 1}. satırı seç`}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => selection.onToggleRow(row)}
                  disabled={selection.disabled || !rowId}
                  className="h-4 w-4"
                />
              </label>
              <div className="min-w-0 flex-1">{card}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
