"use client";

import {
  BookmarkPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Columns3,
  CreditCard,
  Download,
  ListChecks,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmDialog, CopyButton } from "@ruth-commerce/ui";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dateRangeParam, type AdminDateRangeValue } from "@/components/DateRangeControl";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactButton,
  ExactDetailDrawer,
  ExactField,
  ExactFilterBar,
  ExactIconButton,
  ExactPageHeader,
  ExactSearchInput,
  ExactSegmentedControl,
  ExactSkeleton,
  ExactStatusBadge,
  exactFormInputClass,
  useExactToast,
} from "./primitives";
import {
  ExactDataTable,
  ExactEmptyState,
  ExactMetricCard,
  type ExactColumn,
  type ExactDataTableDensity,
  type ExactDataTableSortDirection,
} from "./data";

type PaymentRow = {
  id: string;
  orderNo: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  totalAmount: number;
  currency: string;
  orderStatus: string;
  paymentStatus: string;
  paymentSource: "commerce_v2" | "legacy";
  reference: string;
  installmentCount: number;
  cardType?: string | null;
  refundedAmount: number;
  refundStatus?: string | null;
  createdAt: string;
};

type PaymentSummary = {
  totalCollected: number;
  successfulCount: number;
  refundedTotal: number;
  reviewRequired: number;
};

type TimelineItem = {
  id: string;
  kind: string;
  status: string;
  title: string;
  detail?: string;
  amount_kurus?: number;
  created_at: string;
};

type PaymentDetail = {
  order: any;
  intent: any;
  paymentSource: "legacy" | "commerce_v2" | null;
  timeline: TimelineItem[];
  refunds: any[];
  refundableKurus: number;
  legacy?: {
    canProviderRefund: boolean;
    paidAmountKurus: number;
    message: string;
  };
};

type StatusFilter = "all" | "paid" | "waiting" | "failed" | "refunded";
type PendingRefund = "partial" | "full" | null;
type PaymentSelectionScope = "page" | "filtered" | "loaded";
type PaymentColumnKey = "reference" | "customerName" | "createdAt" | "totalAmount" | "paymentStatus" | "installmentCount" | "refundedAmount";
type PaymentSortKey = "reference" | "customerName" | "createdAt" | "totalAmount";
type PaymentColumnVisibility = Record<PaymentColumnKey, boolean>;
type SavedPaymentView = {
  id: string;
  name: string;
  filter: StatusFilter;
  range: AdminDateRangeValue;
  density: ExactDataTableDensity;
  columns: PaymentColumnVisibility;
  sortKey: PaymentSortKey | null;
  sortDirection: ExactDataTableSortDirection;
};
type PaymentsListContext = {
  query: string;
  filter: StatusFilter;
  range: AdminDateRangeValue;
  density: ExactDataTableDensity;
  columns: PaymentColumnVisibility;
  sortKey: PaymentSortKey | null;
  sortDirection: ExactDataTableSortDirection;
  page: number;
  scrollY: number;
};

const emptySummary: PaymentSummary = {
  totalCollected: 0,
  successfulCount: 0,
  refundedTotal: 0,
  reviewRequired: 0,
};
const PAYMENTS_PAGE_SIZE = 50;
const PAYMENTS_CONTEXT_KEY = "ruth-payments-resource-context-v1";
const PAYMENTS_SAVED_VIEWS_KEY = "ruth-payments-saved-views-v1";
const STATUS_FILTER_VALUES = new Set<StatusFilter>(["all", "paid", "waiting", "failed", "refunded"]);
const PAYMENT_SORT_KEYS = new Set<PaymentSortKey>(["reference", "customerName", "createdAt", "totalAmount"]);
const PAYMENT_RANGE_VALUES = new Set<string>(["today", "this_week", "this_month", "last_30_days", "last_90_days"]);
const DEFAULT_PAYMENT_COLUMNS: PaymentColumnVisibility = {
  reference: true,
  customerName: true,
  createdAt: true,
  totalAmount: true,
  paymentStatus: true,
  installmentCount: true,
  refundedAmount: true,
};
const DEFAULT_PAYMENT_RANGE: AdminDateRangeValue = { range: "this_month", from: "", to: "" };

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function statusMatches(row: PaymentRow, filter: StatusFilter) {
  const status = normalize(row.paymentStatus);
  if (filter === "all") return true;
  if (filter === "paid") return ["paid", "succeeded", "success"].includes(status);
  if (filter === "waiting") return ["pending", "waiting", "requires_action"].includes(status);
  if (filter === "failed") return ["failed", "rejected"].includes(status);
  return row.refundedAmount > 0 || ["refunded", "partially_refunded"].includes(status);
}

function money(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function paymentLabel(value: string) {
  const labels: Record<string, string> = {
    paid: "Ödendi",
    succeeded: "Ödendi",
    success: "Ödendi",
    pending: "Bekliyor",
    waiting: "Bekliyor",
    requires_action: "İşlem gerekli",
    failed: "Başarısız",
    rejected: "Başarısız",
    refunded: "İade",
    partially_refunded: "Kısmi iade",
  };
  return labels[normalize(value)] || value;
}

function paymentRangeLabel(value: AdminDateRangeValue["range"]) {
  const key = String(value);
  if (key === "today") return "Bugün";
  if (key === "this_week") return "Bu hafta";
  if (key === "last_30_days") return "Son 30 gün";
  if (key === "last_90_days") return "Son 90 gün";
  return "Bu ay";
}

function statusFilterValue(value: unknown): StatusFilter {
  return typeof value === "string" && STATUS_FILTER_VALUES.has(value as StatusFilter) ? value as StatusFilter : "all";
}

function paymentSortKeyValue(value: unknown): PaymentSortKey | null {
  return typeof value === "string" && PAYMENT_SORT_KEYS.has(value as PaymentSortKey) ? value as PaymentSortKey : null;
}

function sortDirectionValue(value: unknown): ExactDataTableSortDirection {
  return value === "desc" ? "desc" : "asc";
}

function normalizePaymentRange(value: unknown): AdminDateRangeValue {
  const raw = value && typeof value === "object" ? value as Partial<AdminDateRangeValue> : {};
  const range = typeof raw.range === "string" && PAYMENT_RANGE_VALUES.has(raw.range)
    ? raw.range as AdminDateRangeValue["range"]
    : "this_month";
  return { range, from: typeof raw.from === "string" ? raw.from : "", to: typeof raw.to === "string" ? raw.to : "" };
}

function normalizePaymentColumns(value: unknown): PaymentColumnVisibility {
  const raw = value && typeof value === "object" ? value as Partial<PaymentColumnVisibility> : {};
  return {
    reference: raw.reference !== false,
    customerName: raw.customerName !== false,
    createdAt: raw.createdAt !== false,
    totalAmount: raw.totalAmount !== false,
    paymentStatus: raw.paymentStatus !== false,
    installmentCount: raw.installmentCount !== false,
    refundedAmount: raw.refundedAmount !== false,
  };
}

function readPaymentsContext(): PaymentsListContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(PAYMENTS_CONTEXT_KEY) || "null") as Partial<PaymentsListContext> | null;
    if (!raw) return null;
    return {
      query: typeof raw.query === "string" ? raw.query : "",
      filter: statusFilterValue(raw.filter),
      range: normalizePaymentRange(raw.range),
      density: raw.density === "compact" ? "compact" : "normal",
      columns: normalizePaymentColumns(raw.columns),
      sortKey: paymentSortKeyValue(raw.sortKey),
      sortDirection: sortDirectionValue(raw.sortDirection),
      page: Math.max(1, Number(raw.page || 1)),
      scrollY: Math.max(0, Number(raw.scrollY || 0)),
    };
  } catch {
    return null;
  }
}

function readSavedPaymentViews(): SavedPaymentView[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PAYMENTS_SAVED_VIEWS_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === "object").slice(0, 12).map((item) => {
      const raw = item as Partial<SavedPaymentView>;
      return {
        id: typeof raw.id === "string" ? raw.id : `payments-view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: typeof raw.name === "string" ? raw.name.slice(0, 60) : "Görünüm",
        filter: statusFilterValue(raw.filter),
        range: normalizePaymentRange(raw.range),
        density: raw.density === "compact" ? "compact" : "normal",
        columns: normalizePaymentColumns(raw.columns),
        sortKey: paymentSortKeyValue(raw.sortKey),
        sortDirection: sortDirectionValue(raw.sortDirection),
      };
    });
  } catch {
    return [];
  }
}

function RangeSelect({
  value,
  onChange,
}: {
  value: AdminDateRangeValue;
  onChange: (value: AdminDateRangeValue) => void;
}) {
  return (
    <select
      value={value.range}
      onChange={(event) => onChange({ ...value, range: event.target.value as AdminDateRangeValue["range"] })}
      className="ruth-type-control h-11 px-3 radius-small bg-surface-secondary border border-border-subtle text-main md:h-8"
    >
      <option value="today">Bugün</option>
      <option value="this_week">Bu hafta</option>
      <option value="this_month">Bu ay</option>
      <option value="last_30_days">Son 30 gün</option>
      <option value="last_90_days">Son 90 gün</option>
    </select>
  );
}

export function ExactPayments() {
  const searchParams = useSearchParams();
  const toast = useExactToast();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [summary, setSummary] = useState<PaymentSummary>(emptySummary);
  const [query, setQuery] = useState(searchParams.get("q")?.trim() || "");
  const [filter, setFilter] = useState<StatusFilter>(() => statusFilterValue(searchParams.get("status")));
  const [range, setRange] = useState<AdminDateRangeValue>({ ...DEFAULT_PAYMENT_RANGE });
  const [density, setDensity] = useState<ExactDataTableDensity>("normal");
  const [columnVisibility, setColumnVisibility] = useState<PaymentColumnVisibility>({ ...DEFAULT_PAYMENT_COLUMNS });
  const [sortKey, setSortKey] = useState<PaymentSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<ExactDataTableSortDirection>("asc");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [contextReady, setContextReady] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedPaymentView[]>([]);
  const [activeSavedViewId, setActiveSavedViewId] = useState("");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionScope, setSelectionScope] = useState<PaymentSelectionScope>("page");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [providerStatus, setProviderStatus] = useState<Record<string, unknown> | null>(null);
  const [pendingRefund, setPendingRefund] = useState<PendingRefund>(null);
  const restoredScrollRef = useRef<number | null>(null);
  const previousFilterKeyRef = useRef("");
  const restoredContextOnceRef = useRef(false);

  useEffect(() => {
    const routeQuery = searchParams.get("q");
    const routeStatus = searchParams.get("status");
    if (routeQuery != null) setQuery(routeQuery.trim());
    if (routeStatus != null) setFilter(statusFilterValue(routeStatus));
  }, [searchParams]);

  useEffect(() => {
    if (restoredContextOnceRef.current) return;
    restoredContextOnceRef.current = true;
    const restored = readPaymentsContext();
    setSavedViews(readSavedPaymentViews());
    if (restored) {
      if (!searchParams.get("q")) setQuery(restored.query);
      if (!searchParams.get("status")) setFilter(restored.filter);
      setRange(restored.range);
      setDensity(restored.density);
      setColumnVisibility(restored.columns);
      setSortKey(restored.sortKey);
      setSortDirection(restored.sortDirection);
      setPage(restored.page);
      restoredScrollRef.current = restored.scrollY;
      previousFilterKeyRef.current = [restored.query, restored.filter, dateRangeParam(restored.range), restored.sortKey || "", restored.sortDirection].join("|");
    }
    setContextReady(true);
  }, [searchParams]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const result = await adminRequest<{ rows?: PaymentRow[]; summary?: PaymentSummary }>(
        `/api/payments/list?q=${encodeURIComponent(query.trim())}&limit=220&range=${encodeURIComponent(dateRangeParam(range))}`,
      );
      const nextRows = result.rows || [];
      const validIds = new Set(nextRows.map((row) => row.id));
      setRows(nextRows);
      setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))));
      setSummary(result.summary || emptySummary);
      setSelected((current) => current ? nextRows.find((row) => row.id === current.id) || current : null);
    } catch (caught) {
      if (!silent) {
        setRows([]);
        setSummary(emptySummary);
      }
      toast.error(caught instanceof Error ? caught.message : "Ödeme listesi alınamadı.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [query, range, toast]);

  useEffect(() => {
    if (!contextReady) return;
    const timer = window.setTimeout(() => void load(), query ? 240 : 0);
    return () => window.clearTimeout(timer);
  }, [contextReady, load, query]);

  const refreshPayments = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => statusMatches(row, filter));
    if (!sortKey) return filtered;
    return [...filtered].sort((left, right) => {
      let comparison = 0;
      if (sortKey === "totalAmount") comparison = Number(left.totalAmount || 0) - Number(right.totalAmount || 0);
      else if (sortKey === "createdAt") comparison = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      else if (sortKey === "customerName") comparison = String(left.customerName || "").localeCompare(String(right.customerName || ""), "tr-TR");
      else comparison = String(left.reference || "").localeCompare(String(right.reference || ""), "tr-TR", { numeric: true });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filter, rows, sortDirection, sortKey]);

  const filterKey = useMemo(() => [query, filter, dateRangeParam(range), sortKey || "", sortDirection].join("|"), [filter, query, range, sortDirection, sortKey]);
  useEffect(() => {
    if (!contextReady) return;
    if (!previousFilterKeyRef.current) previousFilterKeyRef.current = filterKey;
    else if (previousFilterKeyRef.current !== filterKey) {
      previousFilterKeyRef.current = filterKey;
      setPage(1);
      setActiveSavedViewId("");
    }
  }, [contextReady, filterKey]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAYMENTS_PAGE_SIZE));
  useEffect(() => { setPage((current) => Math.min(Math.max(1, current), pageCount)); }, [pageCount]);
  const renderedRows = useMemo(() => visibleRows.slice((page - 1) * PAYMENTS_PAGE_SIZE, page * PAYMENTS_PAGE_SIZE), [page, visibleRows]);

  useEffect(() => {
    if (!contextReady) return;
    const context: PaymentsListContext = {
      query,
      filter,
      range,
      density,
      columns: columnVisibility,
      sortKey,
      sortDirection,
      page,
      scrollY: window.scrollY,
    };
    window.sessionStorage.setItem(PAYMENTS_CONTEXT_KEY, JSON.stringify(context));
  }, [columnVisibility, contextReady, density, filter, page, query, range, sortDirection, sortKey]);

  useEffect(() => {
    if (!contextReady) return;
    let frame = 0;
    const persistScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        try {
          const current = JSON.parse(window.sessionStorage.getItem(PAYMENTS_CONTEXT_KEY) || "{}") as Partial<PaymentsListContext>;
          window.sessionStorage.setItem(PAYMENTS_CONTEXT_KEY, JSON.stringify({ ...current, scrollY: window.scrollY }));
        } catch {}
      });
    };
    window.addEventListener("scroll", persistScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", persistScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [contextReady]);

  useEffect(() => {
    if (!contextReady || loading || restoredScrollRef.current == null) return;
    const target = restoredScrollRef.current;
    restoredScrollRef.current = null;
    window.requestAnimationFrame(() => window.scrollTo({ top: target, behavior: "auto" }));
  }, [contextReady, loading]);

  const scopeIds = useMemo(() => {
    const scopeRows = selectionScope === "page" ? renderedRows : selectionScope === "filtered" ? visibleRows : rows;
    return scopeRows.map((row) => row.id);
  }, [renderedRows, rows, selectionScope, visibleRows]);
  const scopeSelectedCount = scopeIds.filter((id) => selectedIds.has(id)).length;
  const allScopeSelected = scopeIds.length > 0 && scopeSelectedCount === scopeIds.length;
  const someScopeSelected = scopeSelectedCount > 0 && !allScopeSelected;
  const togglePaymentSelection = useCallback((row: PaymentRow) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }, []);
  const toggleScopeSelection = useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const everySelected = scopeIds.length > 0 && scopeIds.every((id) => next.has(id));
      scopeIds.forEach((id) => {
        if (everySelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }, [scopeIds]);
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((current) => {
      if (current) setSelectedIds(new Set());
      return !current;
    });
  }, []);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (query.trim()) chips.push({ key: "query", label: `Ara: ${query.trim()}`, clear: () => setQuery("") });
    if (filter !== "all") chips.push({ key: "status", label: `Durum: ${filter === "paid" ? "Ödendi" : filter === "waiting" ? "Bekliyor" : filter === "failed" ? "Başarısız" : "İade"}`, clear: () => setFilter("all") });
    if (range.range !== DEFAULT_PAYMENT_RANGE.range) chips.push({ key: "range", label: `Tarih: ${paymentRangeLabel(range.range)}`, clear: () => setRange({ ...DEFAULT_PAYMENT_RANGE }) });
    return chips;
  }, [filter, query, range]);

  const clearListFilters = () => {
    setQuery("");
    setFilter("all");
    setRange({ ...DEFAULT_PAYMENT_RANGE });
  };

  const saveCurrentView = () => {
    const name = viewName.trim();
    if (!name) {
      toast.error("Görünüm için bir ad yaz.");
      return;
    }
    const nextView: SavedPaymentView = {
      id: `payments-view-${Date.now()}`,
      name: name.slice(0, 60),
      filter,
      range: { ...range },
      density,
      columns: { ...columnVisibility },
      sortKey,
      sortDirection,
    };
    const next = [nextView, ...savedViews].slice(0, 12);
    setSavedViews(next);
    setActiveSavedViewId(nextView.id);
    window.localStorage.setItem(PAYMENTS_SAVED_VIEWS_KEY, JSON.stringify(next));
    setViewName("");
    setSaveViewOpen(false);
    toast.success(`“${nextView.name}” görünümü kaydedildi.`);
  };

  const applySavedView = (id: string) => {
    setActiveSavedViewId(id);
    const next = savedViews.find((item) => item.id === id);
    if (!next) return;
    setFilter(next.filter);
    setRange(next.range);
    setDensity(next.density);
    setColumnVisibility(next.columns);
    setSortKey(next.sortKey);
    setSortDirection(next.sortDirection);
    setPage(1);
  };

  const deleteSavedView = () => {
    if (!activeSavedViewId) return;
    const next = savedViews.filter((item) => item.id !== activeSavedViewId);
    setSavedViews(next);
    setActiveSavedViewId("");
    window.localStorage.setItem(PAYMENTS_SAVED_VIEWS_KEY, JSON.stringify(next));
  };

  const toggleColumn = (key: PaymentColumnKey) => {
    setColumnVisibility((current) => {
      const next = { ...current, [key]: !current[key] };
      return Object.values(next).some(Boolean) ? next : current;
    });
  };

  const openDetail = async (row: PaymentRow) => {
    setSelected(row);
    setDetail(null);
    setProviderStatus(null);
    setRefundReason("");
    setPendingRefund(null);
    setBusy(`detail:${row.id}`);
    try {
      const result = await adminRequest<PaymentDetail>(`/api/payments?q=${encodeURIComponent(row.id)}`);
      setDetail(result);
      setRefundAmount(result.refundableKurus > 0 ? (result.refundableKurus / 100).toFixed(2) : "");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Ödeme detayı alınamadı.");
    } finally {
      setBusy(null);
    }
  };

  const closeDetail = () => {
    if (busy) return;
    setPendingRefund(null);
    setSelected(null);
    setDetail(null);
    setProviderStatus(null);
  };

  const queryProvider = async () => {
    const merchantOid = String(detail?.intent?.merchant_oid || "").trim();
    if (!merchantOid) {
      toast.error("PayTR işlem referansı bulunamadı.");
      return;
    }
    setBusy("provider");
    try {
      const result = await adminRequest<{ result?: Record<string, unknown> }>(
        `/api/paytr/status?merchant_oid=${encodeURIComponent(merchantOid)}`,
      );
      setProviderStatus(result.result || {});
      toast.success("PayTR işlem durumu doğrulandı.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "PayTR durumu sorgulanamadı.");
    } finally {
      setBusy(null);
    }
  };

  const requestedRefundAmount = (full: boolean) => {
    if (!detail) return Number.NaN;
    return full
      ? detail.refundableKurus / 100
      : Number(refundAmount.replace(",", "."));
  };

  const requestRefund = (mode: Exclude<PendingRefund, null>) => {
    const amount = requestedRefundAmount(mode === "full");
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Geçerli bir iade tutarı gir.");
      return;
    }
    setPendingRefund(mode);
  };

  const refund = async (full: boolean) => {
    if (!detail?.order || !detail.intent || !selected || busy === "refund") return;
    const amount = requestedRefundAmount(full);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Geçerli bir iade tutarı gir.");
      return;
    }
    setBusy("refund");
    try {
      const result = await adminRequest<{ message?: string }>("/api/payments", {
        method: "POST",
        body: JSON.stringify({ orderId: detail.order.id, amount, reason: refundReason }),
      });
      toast.success(result.message || "İade PayTR tarafından kabul edildi.");
      setPendingRefund(null);
      await load();
      await openDetail(selected);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "İade işlemi tamamlanamadı.");
    } finally {
      setBusy(null);
    }
  };

  const exportCsv = () => {
    const rowsCsv = [
      ["Referans", "Sipariş", "Müşteri", "Tutar", "Ödeme", "Taksit", "İade", "Tarih"],
      ...visibleRows.map((row) => [
        row.reference,
        row.orderNo,
        row.customerName,
        String(row.totalAmount),
        paymentLabel(row.paymentStatus),
        String(row.installmentCount || 1),
        String(row.refundedAmount),
        row.createdAt,
      ]),
    ];
    const csv = rowsCsv
      .map((line) => line.map((value) => `"${String(value || "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ruth-odemeler-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const allColumns: ExactColumn<PaymentRow>[] = [
    {
      key: "reference",
      label: "Referans",
      sortable: true,
      render: (row) => <div><p className="ruth-type-table font-semibold text-main">{row.reference}</p><p className="ruth-type-code text-subtle">#{row.orderNo}</p></div>,
    },
    {
      key: "customerName",
      label: "Müşteri",
      sortable: true,
      render: (row) => <div><p className="ruth-type-table font-medium text-main">{row.customerName}</p><p className="ruth-type-caption text-subtle">{row.customerEmail || row.customerPhone || "İletişim yok"}</p></div>,
    },
    {
      key: "createdAt",
      label: "Tarih",
      sortable: true,
      render: (row) => <span className="ruth-type-code text-muted">{dateTime(row.createdAt)}</span>,
    },
    {
      key: "totalAmount",
      label: "Tutar",
      sortable: true,
      align: "right",
      render: (row) => <span className="ruth-type-price text-main">{money(row.totalAmount, row.currency)}</span>,
    },
    {
      key: "paymentStatus",
      label: "Durum",
      align: "center",
      render: (row) => <ExactStatusBadge status={row.paymentStatus} label={paymentLabel(row.paymentStatus)} size="sm" />,
    },
    {
      key: "installmentCount",
      label: "Taksit",
      align: "center",
      render: (row) => <span className="ruth-type-caption text-muted">{row.installmentCount > 1 ? `${row.installmentCount} taksit` : "Tek çekim"}</span>,
    },
    {
      key: "refundedAmount",
      label: "İade",
      align: "right",
      render: (row) => <span className="ruth-type-table tabular-nums text-muted">{money(row.refundedAmount, row.currency)}</span>,
    },
  ];
  const columns = allColumns.filter((column) => columnVisibility[String(column.key) as PaymentColumnKey]);

  const merchantOid = String(detail?.intent?.merchant_oid || selected?.reference || "").trim();
  const confirmationAmount = pendingRefund
    ? requestedRefundAmount(pendingRefund === "full")
    : 0;

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="payments">
      <ExactPageHeader
        title="Ödemeler ve İadeler"
        subtitle={`${visibleRows.length} ödeme · ${rows.length} yüklenen kayıt`}
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ExactButton variant="secondary" size="sm" onClick={toggleSelectionMode}>{selectionMode ? <X className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}{selectionMode ? "Seçimi Kapat" : "Toplu Seçim"}</ExactButton>
            <RangeSelect value={range} onChange={setRange} />
            <ExactButton variant="secondary" size="sm" onClick={exportCsv}><Download className="h-4 w-4" /> Rapor al</ExactButton>
            <ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void refreshPayments()} loading={refreshing} disabled={loading} />
          </div>
        )}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button type="button" onClick={() => setFilter(filter === "paid" ? "all" : "paid")}><ExactMetricCard label="Tahsil Edilen" value={summary.totalCollected} format="currency" icon={CircleDollarSign} className={filter === "paid" ? "ring-2 ring-accent" : ""} /></button>
        <button type="button" onClick={() => setFilter(filter === "refunded" ? "all" : "refunded")}><ExactMetricCard label="İade Toplamı" value={summary.refundedTotal} format="currency" icon={RotateCcw} className={filter === "refunded" ? "ring-2 ring-accent" : ""} /></button>
        <button type="button" onClick={() => setFilter(filter === "waiting" ? "all" : "waiting")}><ExactMetricCard label="Kontrol Gereken" value={summary.reviewRequired} icon={ShieldCheck} className={filter === "waiting" ? "ring-2 ring-accent" : ""} /></button>
        <ExactMetricCard label="Başarılı İşlem" value={summary.successfulCount} icon={CreditCard} />
      </div>

      <section className="space-y-3 rounded-[var(--radius-card)] bg-surface-primary p-3 shadow-card md:p-4">
        <ExactSearchInput value={query} onChange={setQuery} placeholder="Sipariş, müşteri, e-posta veya PayTR referansı..." />
        <ExactFilterBar
          chips={[{
            key: "status",
            label: "Tüm Durumlar",
            value: filter === "all" ? null : filter,
            options: [
              { label: "Ödendi", value: "paid" },
              { label: "Bekliyor", value: "waiting" },
              { label: "Başarısız", value: "failed" },
              { label: "İade", value: "refunded" },
            ],
          }]}
          onChipChange={(_, value) => setFilter(statusFilterValue(value))}
        />
        {activeFilterChips.length ? <div className="flex flex-wrap items-center gap-2" aria-label="Aktif ödeme filtreleri">{activeFilterChips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-secondary px-3 text-[11px] font-medium text-main"><span>{chip.label}</span><X className="h-3.5 w-3.5 text-muted" /></button>)}<button type="button" onClick={clearListFilters} className="min-h-9 px-2 text-[11px] font-semibold text-accent">Tümünü temizle</button></div> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
          <div className="flex flex-wrap items-center gap-2"><select value={activeSavedViewId} onChange={(event) => applySavedView(event.target.value)} className="h-10 min-w-[180px] rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs text-main" aria-label="Kaydedilmiş ödeme görünümü"><option value="">Kaydedilmiş görünümler</option>{savedViews.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{activeSavedViewId ? <ExactIconButton icon={Trash2} label="Görünümü sil" variant="ghost" size="icon-sm" onClick={deleteSavedView} /> : null}{!saveViewOpen ? <ExactButton variant="secondary" size="sm" onClick={() => setSaveViewOpen(true)}><BookmarkPlus className="h-4 w-4" /> Görünümü Kaydet</ExactButton> : <div className="flex flex-wrap items-center gap-2"><input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="Görünüm adı" className="h-10 min-w-[170px] rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs text-main outline-none" autoFocus /><ExactButton size="sm" onClick={saveCurrentView}>Kaydet</ExactButton><ExactButton variant="secondary" size="sm" onClick={() => { setSaveViewOpen(false); setViewName(""); }}>Vazgeç</ExactButton></div>}</div>
          <div className="flex flex-wrap items-center gap-2"><ExactSegmentedControl value={density} onChange={(value) => setDensity(value as ExactDataTableDensity)} options={[{ value: "normal", label: "Normal" }, { value: "compact", label: "Kompakt" }]} size="sm" /><ExactButton variant="secondary" size="sm" onClick={() => setColumnsOpen((current) => !current)}><Columns3 className="h-4 w-4" /> Sütunlar</ExactButton><span className="text-[11px] text-muted">{visibleRows.length} sonuç · {rows.length} yüklenen</span></div>
        </div>
        {columnsOpen ? <div className="flex flex-wrap gap-2 rounded-xl bg-surface-secondary p-2.5">{(Object.keys(DEFAULT_PAYMENT_COLUMNS) as PaymentColumnKey[]).map((key) => { const labels: Record<PaymentColumnKey, string> = { reference: "Referans", customerName: "Müşteri", createdAt: "Tarih", totalAmount: "Tutar", paymentStatus: "Durum", installmentCount: "Taksit", refundedAmount: "İade" }; return <button key={key} type="button" aria-pressed={columnVisibility[key]} onClick={() => toggleColumn(key)} className={`min-h-9 rounded-lg border px-3 text-xs font-medium ${columnVisibility[key] ? "border-accent bg-accent-soft text-accent" : "border-border-subtle bg-surface-primary text-muted"}`}><Check className={`mr-1 inline h-3.5 w-3.5 ${columnVisibility[key] ? "opacity-100" : "opacity-0"}`} />{labels[key]}</button>; })}</div> : null}
      </section>

      {selectionMode ? <section className="sticky top-16 z-20 rounded-[var(--radius-card)] border border-accent/30 bg-surface-primary p-3 shadow-floating"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><select value={selectionScope} onChange={(event) => setSelectionScope(event.target.value as PaymentSelectionScope)} className="h-11 rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs font-medium text-main" aria-label="Ödeme seçim kapsamı"><option value="page">Görünen ödemeler ({renderedRows.length})</option><option value="filtered">Filtre sonucu ({visibleRows.length})</option><option value="loaded">Tüm yüklenen ödemeler ({rows.length})</option></select><span className="text-xs font-semibold text-main">{selectedIds.size} ödeme seçili</span><span className="text-[11px] text-muted">Seçim yalnız liste düzenidir; PayTR iadesi tetiklemez.</span></div>{selectedIds.size ? <ExactButton variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>Seçimi Temizle</ExactButton> : null}</div></section> : null}

      {loading ? (
        <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div>
      ) : (
        <ExactDataTable
          columns={columns}
          data={renderedRows}
          density={density}
          sortState={{ key: sortKey, direction: sortDirection, dataIsPreSorted: true, onChange: (key, direction) => { const nextKey = paymentSortKeyValue(key); if (!nextKey) return; setSortKey(nextKey); setSortDirection(direction); setPage(1); } }}
          selection={selectionMode ? { selectedIds, onToggleRow: togglePaymentSelection, onToggleAll: toggleScopeSelection, allSelected: allScopeSelected, someSelected: someScopeSelected, label: "Seçim kapsamındaki ödemeleri seç" } : undefined}
          onRowClick={(row) => void openDetail(row)}
          emptyState={<ExactEmptyState icon={CreditCard} title="Bu filtrede ödeme yok" description="Arama veya durum filtresini değiştir." />}
        />
      )}

      {!loading && pageCount > 1 ? <nav className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-primary p-3 shadow-card" aria-label="Ödeme sayfaları"><span className="text-xs text-muted">Sayfa {page} / {pageCount} · {visibleRows.length} ödeme</span><div className="flex gap-2"><ExactButton variant="secondary" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /> Önceki</ExactButton><ExactButton variant="secondary" size="sm" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Sonraki <ChevronRight className="h-4 w-4" /></ExactButton></div></nav> : null}

      <ExactDetailDrawer
        open={Boolean(selected)}
        onClose={closeDetail}
        dismissalPolicy="explicit-dismiss"
        title={selected ? `Ödeme #${selected.orderNo}` : "Ödeme"}
        subtitle={selected ? `${selected.customerName} · ${selected.reference}` : undefined}
        width={680}
        footer={<ExactButton variant="secondary" size="sm" className="w-full" onClick={closeDetail}>Kapat</ExactButton>}
      >
        {selected ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle uppercase">Tutar</p><p className="ruth-type-metric text-main">{money(selected.totalAmount, selected.currency)}</p></div>
              <div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle uppercase">Ödeme</p><ExactStatusBadge status={selected.paymentStatus} label={paymentLabel(selected.paymentStatus)} size="sm" /></div>
              <div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle uppercase">İade</p><p className="ruth-type-metric text-main">{money(selected.refundedAmount, selected.currency)}</p></div>
            </div>

            {busy === `detail:${selected.id}` ? (
              <ExactSkeleton className="h-48" />
            ) : detail ? (
              <>
                <section>
                  <div className="mb-2 flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-subtle" /><h4 className="ruth-type-label font-semibold uppercase tracking-wide text-muted">PayTR ve işlem bilgisi</h4></div>
                  <dl className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 radius-small bg-surface-secondary">
                      <dt className="ruth-type-label text-subtle">Merchant OID</dt>
                      <dd className="mt-1">
                        <CopyButton
                          value={merchantOid}
                          label="Merchant OID kopyala"
                          copiedLabel="Kopyalandı"
                          errorLabel="Kopyalanamadı"
                          onCopyError={(error) => toast.error(error.message)}
                          className="ruth-type-code flex min-h-11 w-full items-center rounded-[var(--radius-small)] text-left font-medium text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:min-h-7"
                        >
                          {(state) => state === "copied" ? "Kopyalandı" : merchantOid}
                        </CopyButton>
                      </dd>
                    </div>
                    <div className="p-2.5 radius-small bg-surface-secondary"><dt className="ruth-type-label text-subtle">Kaynak</dt><dd className="ruth-type-body-strong mt-0.5 text-main">{detail.paymentSource === "commerce_v2" ? "Commerce V2" : "Legacy"}</dd></div>
                    <div className="p-2.5 radius-small bg-surface-secondary"><dt className="ruth-type-label text-subtle">İade edilebilir</dt><dd className="ruth-type-body-strong mt-0.5 text-main">{money(detail.refundableKurus / 100, selected.currency)}</dd></div>
                    <div className="p-2.5 radius-small bg-surface-secondary"><dt className="ruth-type-label text-subtle">Taksit</dt><dd className="ruth-type-body-strong mt-0.5 text-main">{selected.installmentCount || 1}</dd></div>
                  </dl>
                  <ExactButton variant="secondary" size="sm" className="mt-3" onClick={() => void queryProvider()} loading={busy === "provider"}><ShieldCheck className="h-4 w-4" /> PayTR durumunu doğrula</ExactButton>
                  {providerStatus ? <pre className="ruth-type-code mt-3 max-h-40 overflow-auto p-3 radius-small bg-surface-secondary text-muted">{JSON.stringify(providerStatus, null, 2)}</pre> : null}
                </section>

                <section>
                  <div className="mb-2 flex items-center gap-2"><RotateCcw className="h-3.5 w-3.5 text-subtle" /><h4 className="ruth-type-label font-semibold uppercase tracking-wide text-muted">İade işlemi</h4></div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <ExactField label="İade tutarı"><input value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} className={exactFormInputClass} inputMode="decimal" /></ExactField>
                    <ExactField label="İade sebebi"><input value={refundReason} onChange={(event) => setRefundReason(event.target.value)} className={exactFormInputClass} placeholder="Müşteri talebi, ürün sorunu..." /></ExactField>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <ExactButton variant="secondary" size="sm" onClick={() => requestRefund("partial")} disabled={busy === "refund"}>Kısmi iade</ExactButton>
                    <ExactButton variant="destructive" size="sm" onClick={() => requestRefund("full")} disabled={busy === "refund"}>Kalanın tamamını iade et</ExactButton>
                  </div>
                </section>

                <section>
                  <div className="mb-2 flex items-center gap-2"><CreditCard className="h-3.5 w-3.5 text-subtle" /><h4 className="ruth-type-label font-semibold uppercase tracking-wide text-muted">İşlem zaman çizelgesi</h4></div>
                  <div className="space-y-2">
                    {detail.timeline?.map((item) => (
                      <div key={item.id} className="flex items-start gap-3 p-2.5 radius-small bg-surface-secondary">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                        <div className="flex-1"><p className="ruth-type-table font-medium text-main">{item.title}</p><p className="ruth-type-code text-muted">{item.detail || item.status} · {dateTime(item.created_at)}</p></div>
                        {item.amount_kurus ? <span className="ruth-type-price text-main">{money(item.amount_kurus / 100, selected.currency)}</span> : null}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </div>
        ) : null}
      </ExactDetailDrawer>

      <ConfirmDialog
        open={Boolean(pendingRefund && selected && detail)}
        title={pendingRefund === "full" ? "Kalan tutarın tamamını iade et" : "Kısmi iadeyi onayla"}
        description={selected && Number.isFinite(confirmationAmount)
          ? `#${selected.orderNo} için ${money(confirmationAmount, selected.currency)} PayTR üzerinden iade edilecek. Sağlayıcı sonucu gelmeden işlem başarılı sayılmayacak.`
          : "PayTR iade işlemini onayla."}
        confirmLabel="İadeyi gönder"
        cancelLabel="Vazgeç"
        tone="danger"
        loading={busy === "refund"}
        disabled={!pendingRefund || !Number.isFinite(confirmationAmount) || confirmationAmount <= 0}
        onConfirm={() => {
          if (pendingRefund) void refund(pendingRefund === "full");
        }}
        onClose={() => {
          if (busy !== "refund") setPendingRefund(null);
        }}
      />
    </div>
  );
}
