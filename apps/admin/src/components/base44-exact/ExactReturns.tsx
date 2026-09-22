"use client";

import {
  BookmarkPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  ListChecks,
  PackageSearch,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Truck,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@ruth-commerce/ui";
import { useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactButton,
  ExactDetailDrawer,
  ExactField,
  ExactFilterBar,
  ExactFormModal,
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

type OrderItem = {
  id?: string;
  product_id?: string | null;
  variant_id?: string | null;
  product_slug?: string | null;
  product_name: string;
  variant_name?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url?: string | null;
};

type ReturnCase = {
  id: string;
  type: string;
  status: string;
  reason?: string | null;
  amount?: number | null;
  refund_status?: string | null;
  created_at?: string | null;
};

type PaidOrder = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  total_amount: number;
  currency: string;
  status: string;
  payment_status: string;
  cargo_company?: string | null;
  cargo_tracking_no?: string | null;
  created_at: string;
  order_items?: OrderItem[];
  return_cases: ReturnCase[];
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  price: number;
  currency?: string;
  main_image_url?: string | null;
  product_variants?: Array<{
    id: string;
    option_summary: string;
    price: number;
    image_url?: string | null;
  }>;
};

type ReverseCase = {
  id: string;
  reverse_shipment_barcode?: string | null;
  reverse_shipment_tracking_no?: string | null;
  reverse_shipment_status?: string | null;
};

type CaseFilter = "all" | "open" | "approved" | "completed" | "rejected" | "none";
type CaseForm = {
  type: "return" | "exchange";
  return_mode: "amount" | "items";
  reason: string;
  amount: string;
  notes: string;
};
type PendingCaseAction = {
  item: ReturnCase;
  status: "rejected" | "completed";
} | null;
type ReturnSelectionScope = "page" | "filtered" | "all";
type ReturnColumnKey = "order_no" | "customer_name" | "total_amount" | "return_cases" | "cargo_tracking_no";
type ReturnSortKey = "order_no" | "customer_name" | "total_amount";
type ReturnColumnVisibility = Record<ReturnColumnKey, boolean>;
type SavedReturnView = {
  id: string;
  name: string;
  filter: CaseFilter;
  density: ExactDataTableDensity;
  columns: ReturnColumnVisibility;
  sortKey: ReturnSortKey | null;
  sortDirection: ExactDataTableSortDirection;
};
type ReturnsListContext = {
  query: string;
  filter: CaseFilter;
  density: ExactDataTableDensity;
  columns: ReturnColumnVisibility;
  sortKey: ReturnSortKey | null;
  sortDirection: ExactDataTableSortDirection;
  page: number;
  scrollY: number;
};

const RETURNS_PAGE_SIZE = 50;
const RETURNS_CONTEXT_KEY = "ruth-returns-resource-context-v1";
const RETURNS_SAVED_VIEWS_KEY = "ruth-returns-saved-views-v1";
const CASE_FILTER_VALUES = new Set<CaseFilter>(["all", "open", "approved", "completed", "rejected", "none"]);
const RETURN_SORT_KEYS = new Set<ReturnSortKey>(["order_no", "customer_name", "total_amount"]);
const DEFAULT_RETURN_COLUMNS: ReturnColumnVisibility = {
  order_no: true,
  customer_name: true,
  total_amount: true,
  return_cases: true,
  cargo_tracking_no: true,
};

function norm(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function money(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function dateTime(value?: string | null) {
  const date = new Date(value || "");
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

function caseLabel(status?: string | null) {
  const key = norm(status);
  if (key === "open") return "Talep açıldı";
  if (key === "approved") return "Onaylandı";
  if (key === "completed") return "Tamamlandı";
  if (key === "rejected") return "Reddedildi";
  return status || "Bekliyor";
}

function normalizedItem(item: OrderItem): OrderItem {
  const quantity = Math.max(1, Number(item.quantity || 1));
  const unitPrice = Number(item.unit_price || 0);
  return { ...item, quantity, unit_price: unitPrice, total_price: quantity * unitPrice };
}

function caseFilterValue(value: unknown): CaseFilter {
  return typeof value === "string" && CASE_FILTER_VALUES.has(value as CaseFilter) ? value as CaseFilter : "all";
}

function returnSortKeyValue(value: unknown): ReturnSortKey | null {
  return typeof value === "string" && RETURN_SORT_KEYS.has(value as ReturnSortKey) ? value as ReturnSortKey : null;
}

function sortDirectionValue(value: unknown): ExactDataTableSortDirection {
  return value === "desc" ? "desc" : "asc";
}

function normalizeReturnColumns(value: unknown): ReturnColumnVisibility {
  const raw = value && typeof value === "object" ? value as Partial<ReturnColumnVisibility> : {};
  return {
    order_no: raw.order_no !== false,
    customer_name: raw.customer_name !== false,
    total_amount: raw.total_amount !== false,
    return_cases: raw.return_cases !== false,
    cargo_tracking_no: raw.cargo_tracking_no !== false,
  };
}

function readReturnsContext(): ReturnsListContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(RETURNS_CONTEXT_KEY) || "null") as Partial<ReturnsListContext> | null;
    if (!raw) return null;
    return {
      query: typeof raw.query === "string" ? raw.query : "",
      filter: caseFilterValue(raw.filter),
      density: raw.density === "compact" ? "compact" : "normal",
      columns: normalizeReturnColumns(raw.columns),
      sortKey: returnSortKeyValue(raw.sortKey),
      sortDirection: sortDirectionValue(raw.sortDirection),
      page: Math.max(1, Number(raw.page || 1)),
      scrollY: Math.max(0, Number(raw.scrollY || 0)),
    };
  } catch {
    return null;
  }
}

function readSavedReturnViews(): SavedReturnView[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RETURNS_SAVED_VIEWS_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === "object").slice(0, 12).map((item) => {
      const raw = item as Partial<SavedReturnView>;
      return {
        id: typeof raw.id === "string" ? raw.id : `returns-view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: typeof raw.name === "string" ? raw.name.slice(0, 60) : "Görünüm",
        filter: caseFilterValue(raw.filter),
        density: raw.density === "compact" ? "compact" : "normal",
        columns: normalizeReturnColumns(raw.columns),
        sortKey: returnSortKeyValue(raw.sortKey),
        sortDirection: sortDirectionValue(raw.sortDirection),
      };
    });
  } catch {
    return [];
  }
}

export function ExactReturns() {
  const searchParams = useSearchParams();
  const toast = useExactToast();
  const [orders, setOrders] = useState<PaidOrder[]>([]);
  const [reverseCases, setReverseCases] = useState<Record<string, ReverseCase>>({});
  const [query, setQuery] = useState(searchParams.get("q")?.trim() || "");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<CaseFilter>(() => caseFilterValue(searchParams.get("status")));
  const [density, setDensity] = useState<ExactDataTableDensity>("normal");
  const [columnVisibility, setColumnVisibility] = useState<ReturnColumnVisibility>({ ...DEFAULT_RETURN_COLUMNS });
  const [sortKey, setSortKey] = useState<ReturnSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<ExactDataTableSortDirection>("asc");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [contextReady, setContextReady] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedReturnView[]>([]);
  const [activeSavedViewId, setActiveSavedViewId] = useState("");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionScope, setSelectionScope] = useState<ReturnSelectionScope>("page");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<PaidOrder | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [form, setForm] = useState<CaseForm>({
    type: "return",
    return_mode: "amount",
    reason: "",
    amount: "",
    notes: "",
  });
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>([]);
  const [exchangeItems, setExchangeItems] = useState<OrderItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductRow[]>([]);
  const [refundReference, setRefundReference] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingCaseAction, setPendingCaseAction] = useState<PendingCaseAction>(null);
  const restoredScrollRef = useRef<number | null>(null);
  const previousFilterKeyRef = useRef("");
  const restoredContextOnceRef = useRef(false);

  useEffect(() => {
    const routeQuery = searchParams.get("q");
    const routeStatus = searchParams.get("status");
    if (routeQuery != null) setQuery(routeQuery.trim());
    if (routeStatus != null) setFilter(caseFilterValue(routeStatus));
  }, [searchParams]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [returnsData, shippingData] = await Promise.all([
        adminRequest<{ orders?: PaidOrder[] }>("/api/returns?range=all"),
        adminRequest<{ cases?: ReverseCase[] }>("/api/returns/shipping?q=")
          .catch(() => ({ cases: [] })),
      ]);
      const next = returnsData.orders || [];
      const validIds = new Set(next.map((order) => order.id));
      setOrders(next);
      setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))));
      setReverseCases(Object.fromEntries((shippingData.cases || []).map((item) => [item.id, item])));
      setSelected((current) => current ? next.find((order) => order.id === current.id) || current : null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "İade ve değişim kayıtları alınamadı.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const refreshReturns = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    if (restoredContextOnceRef.current) return;
    restoredContextOnceRef.current = true;
    const restored = readReturnsContext();
    setSavedViews(readSavedReturnViews());
    if (restored) {
      if (!searchParams.get("q")) setQuery(restored.query);
      if (!searchParams.get("status")) setFilter(restored.filter);
      setDensity(restored.density);
      setColumnVisibility(restored.columns);
      setSortKey(restored.sortKey);
      setSortDirection(restored.sortDirection);
      setPage(restored.page);
      restoredScrollRef.current = restored.scrollY;
      previousFilterKeyRef.current = [restored.query, restored.filter, restored.sortKey || "", restored.sortDirection].join("|");
    }
    setContextReady(true);
  }, [searchParams]);

  const metrics = useMemo(() => {
    const cases = orders.flatMap((order) => order.return_cases || []);
    return {
      open: cases.filter((item) => norm(item.status) === "open").length,
      approved: cases.filter((item) => norm(item.status) === "approved").length,
      completed: cases.filter((item) => norm(item.status) === "completed").length,
      amount: cases
        .filter((item) => norm(item.status) === "completed" && norm(item.type) === "return")
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    };
  }, [orders]);

  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase("tr-TR");
    const filtered = orders.filter((order) => {
      if (
        needle
        && ![order.order_no, order.customer_name, order.customer_email, order.customer_phone, order.cargo_tracking_no]
          .some((value) => String(value || "").toLocaleLowerCase("tr-TR").includes(needle))
      ) return false;
      const cases = order.return_cases || [];
      if (filter === "none" && cases.length) return false;
      if (filter !== "all" && filter !== "none" && !cases.some((item) => norm(item.status) === filter)) return false;
      return true;
    });
    if (!sortKey) return filtered;
    return [...filtered].sort((left, right) => {
      let comparison = 0;
      if (sortKey === "total_amount") comparison = Number(left.total_amount || 0) - Number(right.total_amount || 0);
      else if (sortKey === "customer_name") comparison = String(left.customer_name || "").localeCompare(String(right.customer_name || ""), "tr-TR");
      else comparison = String(left.order_no || "").localeCompare(String(right.order_no || ""), "tr-TR", { numeric: true });
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [deferredQuery, filter, orders, sortDirection, sortKey]);

  const filterKey = useMemo(() => [query, filter, sortKey || "", sortDirection].join("|"), [filter, query, sortDirection, sortKey]);
  useEffect(() => {
    if (!contextReady) return;
    if (!previousFilterKeyRef.current) previousFilterKeyRef.current = filterKey;
    else if (previousFilterKeyRef.current !== filterKey) {
      previousFilterKeyRef.current = filterKey;
      setPage(1);
      setActiveSavedViewId("");
    }
  }, [contextReady, filterKey]);

  const pageCount = Math.max(1, Math.ceil(visible.length / RETURNS_PAGE_SIZE));
  useEffect(() => { setPage((current) => Math.min(Math.max(1, current), pageCount)); }, [pageCount]);
  const renderedOrders = useMemo(() => visible.slice((page - 1) * RETURNS_PAGE_SIZE, page * RETURNS_PAGE_SIZE), [page, visible]);

  useEffect(() => {
    if (!contextReady) return;
    const context: ReturnsListContext = {
      query,
      filter,
      density,
      columns: columnVisibility,
      sortKey,
      sortDirection,
      page,
      scrollY: window.scrollY,
    };
    window.sessionStorage.setItem(RETURNS_CONTEXT_KEY, JSON.stringify(context));
  }, [columnVisibility, contextReady, density, filter, page, query, sortDirection, sortKey]);

  useEffect(() => {
    if (!contextReady) return;
    let frame = 0;
    const persistScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        try {
          const current = JSON.parse(window.sessionStorage.getItem(RETURNS_CONTEXT_KEY) || "{}") as Partial<ReturnsListContext>;
          window.sessionStorage.setItem(RETURNS_CONTEXT_KEY, JSON.stringify({ ...current, scrollY: window.scrollY }));
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
    const scopeOrders = selectionScope === "page" ? renderedOrders : selectionScope === "filtered" ? visible : orders;
    return scopeOrders.map((order) => order.id);
  }, [orders, renderedOrders, selectionScope, visible]);
  const scopeSelectedCount = scopeIds.filter((id) => selectedIds.has(id)).length;
  const allScopeSelected = scopeIds.length > 0 && scopeSelectedCount === scopeIds.length;
  const someScopeSelected = scopeSelectedCount > 0 && !allScopeSelected;
  const toggleReturnSelection = useCallback((order: PaidOrder) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(order.id)) next.delete(order.id);
      else next.add(order.id);
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
    if (filter !== "all") chips.push({ key: "case", label: `Vaka: ${filter === "open" ? "Açık" : filter === "approved" ? "Onaylı" : filter === "completed" ? "Tamamlandı" : filter === "rejected" ? "Reddedildi" : "Vaka yok"}`, clear: () => setFilter("all") });
    return chips;
  }, [filter, query]);

  const clearListFilters = () => {
    setQuery("");
    setFilter("all");
  };

  const saveCurrentView = () => {
    const name = viewName.trim();
    if (!name) {
      toast.error("Görünüm için bir ad yaz.");
      return;
    }
    const nextView: SavedReturnView = {
      id: `returns-view-${Date.now()}`,
      name: name.slice(0, 60),
      filter,
      density,
      columns: { ...columnVisibility },
      sortKey,
      sortDirection,
    };
    const next = [nextView, ...savedViews].slice(0, 12);
    setSavedViews(next);
    setActiveSavedViewId(nextView.id);
    window.localStorage.setItem(RETURNS_SAVED_VIEWS_KEY, JSON.stringify(next));
    setViewName("");
    setSaveViewOpen(false);
    toast.success(`“${nextView.name}” görünümü kaydedildi.`);
  };

  const applySavedView = (id: string) => {
    setActiveSavedViewId(id);
    const next = savedViews.find((item) => item.id === id);
    if (!next) return;
    setFilter(next.filter);
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
    window.localStorage.setItem(RETURNS_SAVED_VIEWS_KEY, JSON.stringify(next));
  };

  const toggleColumn = (key: ReturnColumnKey) => {
    setColumnVisibility((current) => {
      const next = { ...current, [key]: !current[key] };
      return Object.values(next).some(Boolean) ? next : current;
    });
  };

  const pickerOrders = useMemo(() => {
    const needle = pickerQuery.trim().toLocaleLowerCase("tr-TR");
    return orders
      .filter((order) => !needle || [order.order_no, order.customer_name, order.customer_email, order.customer_phone]
        .some((value) => String(value || "").toLocaleLowerCase("tr-TR").includes(needle)))
      .slice(0, 40);
  }, [orders, pickerQuery]);

  const openOrder = (order: PaidOrder) => {
    setSelected(order);
    setPickerOpen(false);
    setPickerQuery("");
    setForm({
      type: "return",
      return_mode: "amount",
      reason: "",
      amount: String(order.total_amount || ""),
      notes: "",
    });
    setSelectedItems([]);
    setExchangeItems([]);
    setProductSearch("");
    setProductResults([]);
    setRefundReference("");
    setDiscardOpen(false);
    setPendingCaseAction(null);
  };

  const searchProducts = async (value: string) => {
    setProductSearch(value);
    if (value.trim().length < 2) {
      setProductResults([]);
      return;
    }
    try {
      const result = await adminRequest<{ products?: ProductRow[] }>(
        `/api/products?q=${encodeURIComponent(value.trim())}`,
      );
      setProductResults((result.products || []).slice(0, 12));
    } catch {
      setProductResults([]);
    }
  };

  const toggleReturnItem = (item: OrderItem) => {
    const keyOf = (entry: OrderItem) => entry.id || `${entry.product_id}-${entry.variant_id}-${entry.product_name}`;
    setSelectedItems((current) => current.some((entry) => keyOf(entry) === keyOf(item))
      ? current.filter((entry) => keyOf(entry) !== keyOf(item))
      : [...current, normalizedItem(item)]);
  };

  const addExchangeProduct = (
    product: ProductRow,
    variant?: NonNullable<ProductRow["product_variants"]>[number],
  ) => {
    const price = Number(variant?.price || product.price || 0);
    setExchangeItems((current) => [
      ...current,
      {
        product_id: product.id,
        variant_id: variant?.id || null,
        product_slug: product.slug,
        product_name: product.name,
        variant_name: variant?.option_summary || null,
        quantity: 1,
        unit_price: price,
        total_price: price,
        image_url: variant?.image_url || product.main_image_url,
      },
    ]);
    setProductSearch("");
    setProductResults([]);
  };

  const updateExchangeItem = (index: number, patch: Partial<OrderItem>) => {
    setExchangeItems((current) => current.map((item, itemIndex) => (
      itemIndex === index ? normalizedItem({ ...item, ...patch }) : item
    )));
  };

  const returnItemsTotal = selectedItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  const exchangeTotal = exchangeItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  const caseAmount = form.type === "exchange"
    ? Math.abs(exchangeTotal - Number(selected?.total_amount || 0))
    : form.return_mode === "items"
      ? returnItemsTotal
      : Number(form.amount || 0);

  const draftDirty = useMemo(() => {
    if (!selected) return false;
    return form.type !== "return"
      || form.return_mode !== "amount"
      || form.reason.trim() !== ""
      || form.notes.trim() !== ""
      || form.amount !== String(selected.total_amount || "")
      || selectedItems.length > 0
      || exchangeItems.length > 0
      || refundReference.trim() !== "";
  }, [exchangeItems.length, form, refundReference, selected, selectedItems.length]);

  const closeSelected = () => {
    if (busy) return;
    if (draftDirty) {
      setDiscardOpen(true);
      return;
    }
    setSelected(null);
  };

  const discardSelected = () => {
    setDiscardOpen(false);
    setPendingCaseAction(null);
    setSelected(null);
  };

  const createCase = async () => {
    if (!selected || busy === "create") return;
    if (!form.reason.trim()) {
      toast.error("İade veya değişim sebebi zorunlu.");
      return;
    }
    if (form.type === "return" && form.return_mode === "items" && !selectedItems.length) {
      toast.error("İade edilecek en az bir ürün seç.");
      return;
    }
    if (form.type === "exchange" && !exchangeItems.length) {
      toast.error("Değişim için gönderilecek en az bir ürün seç.");
      return;
    }

    setBusy("create");
    try {
      await adminRequest("/api/returns", {
        method: "POST",
        body: JSON.stringify({
          order_id: selected.id,
          ...form,
          amount: caseAmount || Number(form.amount || selected.total_amount),
          selected_items: selectedItems,
          exchange_items: exchangeItems,
        }),
      });
      toast.success(`${selected.order_no} için ${form.type === "exchange" ? "değişim" : "iade"} vakası açıldı.`);
      await load();
      setSelected(null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "İade/değişim vakası açılamadı.");
    } finally {
      setBusy(null);
    }
  };

  const updateCase = async (
    item: ReturnCase,
    status: "approved" | "rejected" | "completed",
  ) => {
    if (busy === `case:${item.id}`) return;
    setBusy(`case:${item.id}`);
    try {
      await adminRequest("/api/returns", {
        method: "PATCH",
        body: JSON.stringify({
          case_id: item.id,
          status,
          refund_confirmed: status === "completed" && norm(item.type) === "return",
          refund_provider: norm(item.type) === "return" ? "paytr" : null,
          refund_reference: refundReference.trim() || null,
        }),
      });
      toast.success(`Vaka ${caseLabel(status).toLocaleLowerCase("tr-TR")} olarak güncellendi.`);
      setRefundReference("");
      setPendingCaseAction(null);
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Vaka güncellenemedi.");
    } finally {
      setBusy(null);
    }
  };

  const requestCaseAction = (item: ReturnCase, status: "rejected" | "completed") => {
    if (status === "completed" && norm(item.type) === "return" && !refundReference.trim()) {
      toast.error("İade vakasını tamamlamadan önce PayTR iade referansını gir.");
      return;
    }
    setPendingCaseAction({ item, status });
  };

  const createReverseShipping = async (item: ReturnCase) => {
    if (busy === `reverse:${item.id}`) return;
    setBusy(`reverse:${item.id}`);
    try {
      const result = await adminRequest<{ idempotent?: boolean }>("/api/returns/shipping", {
        method: "POST",
        body: JSON.stringify({ case_id: item.id }),
      });
      toast.success(result.idempotent ? "Mevcut iade kargo kodu getirildi." : "İade kargo kodu oluşturuldu.");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "İade kargo kodu oluşturulamadı.");
    } finally {
      setBusy(null);
    }
  };

  const allColumns: ExactColumn<PaidOrder>[] = [
    {
      key: "order_no",
      label: "Sipariş",
      sortable: true,
      render: (order) => <div><p className="ruth-type-table font-semibold text-main">#{order.order_no}</p><p className="ruth-type-code text-subtle">{dateTime(order.created_at)}</p></div>,
    },
    {
      key: "customer_name",
      label: "Müşteri",
      sortable: true,
      render: (order) => <div><p className="ruth-type-table font-medium text-main">{order.customer_name}</p><p className="ruth-type-caption text-subtle">{order.customer_email || order.customer_phone || "İletişim yok"}</p></div>,
    },
    {
      key: "total_amount",
      label: "Sipariş toplamı",
      sortable: true,
      align: "right",
      render: (order) => <span className="ruth-type-price text-main">{money(order.total_amount, order.currency)}</span>,
    },
    {
      key: "return_cases",
      label: "Vaka",
      align: "center",
      render: (order) => order.return_cases?.length
        ? <div className="flex flex-wrap justify-center gap-1">{order.return_cases.slice(0, 2).map((item) => <ExactStatusBadge key={item.id} status={item.status} label={`${norm(item.type) === "exchange" ? "Değişim" : "İade"} · ${caseLabel(item.status)}`} size="sm" />)}</div>
        : <ExactStatusBadge status="archived" label="Vaka yok" size="sm" />,
    },
    {
      key: "cargo_tracking_no",
      label: "Kargo",
      render: (order) => <span className="ruth-type-code text-muted">{order.cargo_tracking_no || order.cargo_company || "—"}</span>,
    },
  ];
  const columns = allColumns.filter((column) => columnVisibility[String(column.key) as ReturnColumnKey]);

  const pendingCaseIsReturnCompletion = pendingCaseAction?.status === "completed"
    && norm(pendingCaseAction.item.type) === "return";

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="returns">
      <ExactPageHeader
        title="İade ve Değişim"
        subtitle={`${visible.length} sipariş · iade, değişim, ters kargo ve geri ödeme işlemleri`}
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ExactButton variant="secondary" size="sm" onClick={toggleSelectionMode}>{selectionMode ? <X className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}{selectionMode ? "Seçimi Kapat" : "Toplu Seçim"}</ExactButton>
            <ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void refreshReturns()} loading={refreshing} disabled={loading} />
            <ExactButton size="sm" onClick={() => setPickerOpen(true)}><Plus className="h-4 w-4" /> Yeni İade / Değişim</ExactButton>
          </div>
        )}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button type="button" onClick={() => setFilter(filter === "open" ? "all" : "open")}><ExactMetricCard label="Açık Talep" value={metrics.open} icon={RotateCcw} className={filter === "open" ? "ring-2 ring-accent" : ""} /></button>
        <button type="button" onClick={() => setFilter(filter === "approved" ? "all" : "approved")}><ExactMetricCard label="Onaylanan" value={metrics.approved} icon={CheckCircle2} className={filter === "approved" ? "ring-2 ring-accent" : ""} /></button>
        <button type="button" onClick={() => setFilter(filter === "completed" ? "all" : "completed")}><ExactMetricCard label="Tamamlanan" value={metrics.completed} icon={PackageSearch} className={filter === "completed" ? "ring-2 ring-accent" : ""} /></button>
        <ExactMetricCard label="İade Toplamı" value={metrics.amount} format="currency" icon={RotateCcw} />
      </div>

      <section className="space-y-3 rounded-[var(--radius-card)] bg-surface-primary p-3 shadow-card md:p-4">
        <ExactSearchInput value={query} onChange={setQuery} placeholder="Sipariş, müşteri, telefon veya takip no ara..." />
        <ExactFilterBar
          chips={[{
            key: "case",
            label: "Tüm Vakalar",
            value: filter === "all" ? null : filter,
            options: [
              { label: "Açık", value: "open" },
              { label: "Onaylı", value: "approved" },
              { label: "Tamamlandı", value: "completed" },
              { label: "Reddedildi", value: "rejected" },
              { label: "Vaka yok", value: "none" },
            ],
          }]}
          onChipChange={(_, value) => setFilter(caseFilterValue(value))}
        />
        {activeFilterChips.length ? <div className="flex flex-wrap items-center gap-2" aria-label="Aktif iade filtreleri">{activeFilterChips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-secondary px-3 text-[11px] font-medium text-main"><span>{chip.label}</span><X className="h-3.5 w-3.5 text-muted" /></button>)}<button type="button" onClick={clearListFilters} className="min-h-9 px-2 text-[11px] font-semibold text-accent">Tümünü temizle</button></div> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <select value={activeSavedViewId} onChange={(event) => applySavedView(event.target.value)} className="h-10 min-w-[180px] rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs text-main" aria-label="Kaydedilmiş iade görünümü"><option value="">Kaydedilmiş görünümler</option>{savedViews.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            {activeSavedViewId ? <ExactIconButton icon={X} label="Görünümü sil" variant="ghost" size="icon-sm" onClick={deleteSavedView} /> : null}
            {!saveViewOpen ? <ExactButton variant="secondary" size="sm" onClick={() => setSaveViewOpen(true)}><BookmarkPlus className="h-4 w-4" /> Görünümü Kaydet</ExactButton> : <div className="flex flex-wrap items-center gap-2"><input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="Görünüm adı" className="h-10 min-w-[170px] rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs text-main outline-none" autoFocus /><ExactButton size="sm" onClick={saveCurrentView}>Kaydet</ExactButton><ExactButton variant="secondary" size="sm" onClick={() => { setSaveViewOpen(false); setViewName(""); }}>Vazgeç</ExactButton></div>}
          </div>
          <div className="flex flex-wrap items-center gap-2"><ExactSegmentedControl value={density} onChange={(value) => setDensity(value as ExactDataTableDensity)} options={[{ value: "normal", label: "Normal" }, { value: "compact", label: "Kompakt" }]} size="sm" /><ExactButton variant="secondary" size="sm" onClick={() => setColumnsOpen((current) => !current)}><Columns3 className="h-4 w-4" /> Sütunlar</ExactButton><span className="text-[11px] text-muted">{visible.length} sonuç · {orders.length} toplam</span></div>
        </div>
        {columnsOpen ? <div className="flex flex-wrap gap-2 rounded-xl bg-surface-secondary p-2.5">{(Object.keys(DEFAULT_RETURN_COLUMNS) as ReturnColumnKey[]).map((key) => { const labels: Record<ReturnColumnKey, string> = { order_no: "Sipariş", customer_name: "Müşteri", total_amount: "Sipariş toplamı", return_cases: "Vaka", cargo_tracking_no: "Kargo" }; return <button key={key} type="button" aria-pressed={columnVisibility[key]} onClick={() => toggleColumn(key)} className={`min-h-9 rounded-lg border px-3 text-xs font-medium ${columnVisibility[key] ? "border-accent bg-accent-soft text-accent" : "border-border-subtle bg-surface-primary text-muted"}`}><CheckCircle2 className={`mr-1 inline h-3.5 w-3.5 ${columnVisibility[key] ? "opacity-100" : "opacity-0"}`} />{labels[key]}</button>; })}</div> : null}
      </section>

      {selectionMode ? <section className="sticky top-16 z-20 rounded-[var(--radius-card)] border border-accent/30 bg-surface-primary p-3 shadow-floating"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><select value={selectionScope} onChange={(event) => setSelectionScope(event.target.value as ReturnSelectionScope)} className="h-11 rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs font-medium text-main" aria-label="İade seçim kapsamı"><option value="page">Görünen siparişler ({renderedOrders.length})</option><option value="filtered">Filtre sonucu ({visible.length})</option><option value="all">Tüm siparişler ({orders.length})</option></select><span className="text-xs font-semibold text-main">{selectedIds.size} sipariş seçili</span><span className="text-[11px] text-muted">Seçim yalnız liste düzenidir; para iadesi veya vaka işlemi tetiklemez.</span></div>{selectedIds.size ? <ExactButton variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>Seçimi Temizle</ExactButton> : null}</div></section> : null}

      {loading ? (
        <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div>
      ) : (
        <ExactDataTable
          columns={columns}
          data={renderedOrders}
          density={density}
          sortState={{ key: sortKey, direction: sortDirection, dataIsPreSorted: true, onChange: (key, direction) => { const nextKey = returnSortKeyValue(key); if (!nextKey) return; setSortKey(nextKey); setSortDirection(direction); setPage(1); } }}
          selection={selectionMode ? { selectedIds, onToggleRow: toggleReturnSelection, onToggleAll: toggleScopeSelection, allSelected: allScopeSelected, someSelected: someScopeSelected, label: "Seçim kapsamındaki iade siparişlerini seç" } : undefined}
          onRowClick={openOrder}
          emptyState={<ExactEmptyState icon={RotateCcw} title="Bu filtrede kayıt yok" description="Arama veya vaka filtresini değiştir." />}
        />
      )}

      {!loading && pageCount > 1 ? <nav className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-primary p-3 shadow-card" aria-label="İade sayfaları"><span className="text-xs text-muted">Sayfa {page} / {pageCount} · {visible.length} sipariş</span><div className="flex gap-2"><ExactButton variant="secondary" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /> Önceki</ExactButton><ExactButton variant="secondary" size="sm" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Sonraki <ChevronRight className="h-4 w-4" /></ExactButton></div></nav> : null}

      <ExactFormModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        dismissalPolicy="light-dismiss"
        title="Yeni İade veya Değişim"
        subtitle="İşlem yapılacak siparişi seç"
        size="lg"
        footer={<ExactButton variant="secondary" size="sm" onClick={() => setPickerOpen(false)}>Kapat</ExactButton>}
      >
        <div className="space-y-3">
          <ExactSearchInput value={pickerQuery} onChange={setPickerQuery} placeholder="Sipariş no, müşteri, e-posta veya telefon ara..." autoFocus />
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {pickerOrders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => openOrder(order)}
                className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] border border-border-subtle bg-surface-primary p-3 text-left transition-all hover:border-accent hover:bg-accent-soft"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center radius-small bg-accent-soft text-accent"><RotateCcw className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1"><p className="ruth-type-table font-semibold text-main">#{order.order_no} · {order.customer_name}</p><p className="ruth-type-caption truncate text-muted">{order.customer_email || order.customer_phone || "İletişim yok"} · {dateTime(order.created_at)}</p></div>
                <div className="text-right"><p className="ruth-type-price text-main">{money(order.total_amount, order.currency)}</p><p className="ruth-type-control text-accent">İşlem oluştur</p></div>
              </button>
            ))}
            {!pickerOrders.length ? <ExactEmptyState compact icon={Search} title="Sipariş bulunamadı" description="Arama kelimesini değiştir." /> : null}
          </div>
        </div>
      </ExactFormModal>

      <ExactDetailDrawer
        open={Boolean(selected)}
        onClose={closeSelected}
        dismissalPolicy={draftDirty ? "protected-action" : "light-dismiss"}
        title={selected ? `#${selected.order_no} · İade/Değişim` : "Satış sonrası"}
        subtitle={selected ? `${selected.customer_name} · ${money(selected.total_amount, selected.currency)}` : undefined}
        width={760}
        footer={selected ? (
          <div className="flex gap-2">
            <ExactButton variant="secondary" size="sm" className="flex-1" onClick={closeSelected}>Kapat</ExactButton>
            <ExactButton size="sm" className="flex-1" onClick={() => void createCase()} loading={busy === "create"}><Plus className="h-4 w-4" /> Vaka aç</ExactButton>
          </div>
        ) : null}
      >
        {selected ? (
          <div className="space-y-5">
            <section>
              <div className="mb-2 flex items-center gap-2"><RotateCcw className="h-3.5 w-3.5 text-subtle" /><h4 className="ruth-type-label font-semibold uppercase tracking-wide text-muted">Yeni vaka</h4></div>
              <ExactSegmentedControl
                size="sm"
                value={form.type}
                onChange={(value) => setForm((current) => ({ ...current, type: value as CaseForm["type"] }))}
                options={[{ value: "return", label: "İade" }, { value: "exchange", label: "Değişim" }]}
              />
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ExactField label="Sebep" required><input value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className={exactFormInputClass} /></ExactField>
                <ExactField label="Operasyon notu"><input value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className={exactFormInputClass} /></ExactField>
              </div>

              {form.type === "return" ? (
                <>
                  <div className="mt-3"><ExactSegmentedControl size="sm" value={form.return_mode} onChange={(value) => setForm((current) => ({ ...current, return_mode: value as CaseForm["return_mode"] }))} options={[{ value: "amount", label: "Tutar gir" }, { value: "items", label: "Ürün seç" }]} /></div>
                  {form.return_mode === "amount" ? (
                    <ExactField label="İade tutarı" className="mt-3"><input value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} className={exactFormInputClass} inputMode="decimal" /></ExactField>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {(selected.order_items || []).map((item) => {
                        const active = selectedItems.some((entry) => (entry.id || entry.product_name) === (item.id || item.product_name));
                        return (
                          <button key={item.id || item.product_name} type="button" onClick={() => toggleReturnItem(item)} className={`flex min-h-11 w-full items-center gap-3 border p-2.5 radius-small transition-all ${active ? "border-accent bg-accent-soft" : "border-border-subtle bg-surface-secondary"}`}>
                            <div className="flex-1 text-left"><p className="ruth-type-table font-medium text-main">{item.product_name}</p><p className="ruth-type-caption text-muted">{item.variant_name || "Standart"} · {item.quantity} adet</p></div>
                            <span className="ruth-type-price text-main">{money(item.total_price, selected.currency)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="relative mt-3">
                  <ExactSearchInput value={productSearch} onChange={(value) => void searchProducts(value)} placeholder="Değişim ürünü ara..." />
                  {productResults.length ? (
                    <div className="absolute inset-x-0 z-20 mt-1 max-h-72 overflow-y-auto overflow-hidden border border-border-subtle bg-surface-primary radius-control shadow-floating">
                      {productResults.map((product) => (
                        <div key={product.id} className="border-b border-border-subtle last:border-0">
                          <button type="button" onClick={() => product.product_variants?.length ? undefined : addExchangeProduct(product)} className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-secondary"><span className="ruth-type-table flex-1 font-medium text-main">{product.name}</span><span className="ruth-type-price text-muted">{money(product.price, product.currency)}</span>{!product.product_variants?.length ? <Plus className="h-4 w-4 text-accent" /> : null}</button>
                          {product.product_variants?.map((variant) => <button key={variant.id} type="button" onClick={() => addExchangeProduct(product, variant)} className="flex min-h-11 w-full items-center gap-3 py-2 pl-7 pr-3 hover:bg-accent-soft"><span className="ruth-type-caption flex-1 text-left text-muted">{variant.option_summary}</span><span className="ruth-type-price text-main">{money(variant.price, product.currency)}</span><Plus className="h-3.5 w-3.5 text-accent" /></button>)}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 space-y-2">
                    {exchangeItems.map((item, index) => (
                      <div key={`${item.product_id}-${item.variant_id}-${index}`} className="flex items-center gap-2 bg-surface-secondary p-2.5 radius-small">
                        <div className="min-w-0 flex-1"><p className="ruth-type-table truncate font-medium text-main">{item.product_name}</p><p className="ruth-type-caption text-muted">{item.variant_name || "Standart"}</p></div>
                        <input type="number" min="1" value={item.quantity} onChange={(event) => updateExchangeItem(index, { quantity: Number(event.target.value) })} className={`${exactFormInputClass} w-16`} />
                        <span className="ruth-type-price text-main">{money(item.total_price, selected.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between bg-accent-soft p-3 radius-small"><span className="ruth-type-label text-accent">İşlem tutarı / farkı</span><strong className="ruth-type-metric text-accent">{money(caseAmount, selected.currency)}</strong></div>
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2"><PackageSearch className="h-3.5 w-3.5 text-subtle" /><h4 className="ruth-type-label font-semibold uppercase tracking-wide text-muted">Mevcut vakalar</h4></div>
              <div className="space-y-2">
                {(selected.return_cases || []).map((item) => {
                  const reverse = reverseCases[item.id];
                  return (
                    <div key={item.id} className="bg-surface-secondary p-3 radius-small">
                      <div className="flex items-start justify-between gap-2">
                        <div><p className="ruth-type-card-title text-main">{norm(item.type) === "exchange" ? "Değişim" : "İade"} · {money(Number(item.amount || 0), selected.currency)}</p><p className="ruth-type-caption text-muted">{item.reason || "Sebep yok"} · {dateTime(item.created_at)}</p></div>
                        <ExactStatusBadge status={item.status} label={caseLabel(item.status)} size="sm" />
                      </div>
                      {reverse ? <p className="ruth-type-code mt-2 text-muted">Ters kargo: {reverse.reverse_shipment_barcode || reverse.reverse_shipment_tracking_no || reverse.reverse_shipment_status || "oluşturuldu"}</p> : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {norm(item.status) === "open" ? (
                          <>
                            <ExactButton size="sm" onClick={() => void updateCase(item, "approved")} loading={busy === `case:${item.id}`}>Onayla</ExactButton>
                            <ExactButton variant="destructive" size="sm" onClick={() => requestCaseAction(item, "rejected")} disabled={busy === `case:${item.id}`}>Reddet</ExactButton>
                          </>
                        ) : null}
                        {["open", "approved"].includes(norm(item.status)) ? <ExactButton variant="secondary" size="sm" onClick={() => void createReverseShipping(item)} loading={busy === `reverse:${item.id}`}><Truck className="h-4 w-4" /> İade kargo kodu</ExactButton> : null}
                        {norm(item.status) === "approved" ? (
                          <>
                            <input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} className={`${exactFormInputClass} min-w-40`} placeholder="PayTR iade referansı" />
                            <ExactButton size="sm" onClick={() => requestCaseAction(item, "completed")} disabled={busy === `case:${item.id}`}>Tamamla</ExactButton>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {!selected.return_cases?.length ? <ExactEmptyState compact icon={RotateCcw} title="Henüz vaka yok" /> : null}
              </div>
            </section>
          </div>
        ) : null}
      </ExactDetailDrawer>

      <ConfirmDialog
        open={discardOpen}
        title="Kaydedilmemiş değişiklikleri sil"
        description="Bu iade/değişim taslağındaki kaydedilmemiş alanlar ve ürün seçimleri silinecek."
        confirmLabel="Değişiklikleri sil"
        cancelLabel="Düzenlemeye devam et"
        tone="danger"
        onConfirm={discardSelected}
        onClose={() => setDiscardOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(pendingCaseAction && selected)}
        title={pendingCaseAction?.status === "rejected" ? "Vakayı reddet" : pendingCaseIsReturnCompletion ? "İade vakasını tamamla" : "Değişim vakasını tamamla"}
        description={pendingCaseAction?.status === "rejected"
          ? "Bu vaka reddedildi olarak kaydedilecek. İşlemi devam ettirmek istediğini onayla."
          : pendingCaseIsReturnCompletion
            ? `Bu iade vakası tamamlandı ve refund evidence olarak PayTR referansı “${refundReference.trim()}” kaydedilecek. Sağlayıcı kanıtı olmadan tamamlanmış sayılmamalıdır.`
            : "Bu değişim vakası tamamlandı olarak kaydedilecek."}
        confirmLabel={pendingCaseAction?.status === "rejected" ? "Reddet" : "Tamamla"}
        cancelLabel="Vazgeç"
        tone="danger"
        loading={Boolean(pendingCaseAction && busy === `case:${pendingCaseAction.item.id}`)}
        onConfirm={() => {
          if (pendingCaseAction) void updateCase(pendingCaseAction.item, pendingCaseAction.status);
        }}
        onClose={() => {
          if (!pendingCaseAction || busy !== `case:${pendingCaseAction.item.id}`) setPendingCaseAction(null);
        }}
      />
    </div>
  );
}
