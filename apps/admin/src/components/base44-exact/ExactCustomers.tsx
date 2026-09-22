"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Check,
  Coins,
  Columns3,
  ListChecks,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Star,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { Pressable } from "@ruth-commerce/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { hardRefreshAdminResource } from "@/lib/adminFreshnessActions";
import { ExactBulkEmailComposer } from "./ExactBulkEmailComposer";
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
  ExactAvatar,
  ExactDataTable,
  ExactEmptyState,
  ExactMetricCard,
  type ExactColumn,
  type ExactDataTableDensity,
} from "./data";

type Customer = {
  id: string;
  profile_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_member: boolean;
  membership_source: "new_site" | "ikas" | null;
  ikas_account_status: string | null;
  reward_points_balance: number;
  birthday_reward_points: number;
  terms_accepted: boolean;
  marketing_email_consent: boolean;
  service_email_allowed?: boolean;
  marketing_email_consent_at: string | null;
  consent_source: string | null;
  created_at: string | null;
  order_count: number;
  paid_order_count: number;
  total_spent: number;
  last_order_id: string | null;
  last_order_no: string | null;
  last_order_at: string | null;
  last_payment_status: string | null;
  city: string | null;
  district: string | null;
};
type Summary = { customerCount: number; memberCount: number; nonMemberCount: number; customersWithOrders: number; totalPaidRevenue: number };
type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
type MembershipFilter = "all" | "member" | "non_member";
type SortOption = "recent" | "spent" | "orders" | "name";
type PointsOperation = "add" | "remove";
type CustomerColumnKey = "full_name" | "is_member" | "total_spent" | "order_count" | "reward_points_balance" | "last_order_at" | "city";
type CustomerColumnVisibility = Record<CustomerColumnKey, boolean>;
type SavedCustomerView = {
  id: string;
  name: string;
  membership: MembershipFilter;
  sort: SortOption;
  density: ExactDataTableDensity;
  columns: CustomerColumnVisibility;
};
type CustomersListContext = {
  query: string;
  membership: MembershipFilter;
  sort: SortOption;
  density: ExactDataTableDensity;
  columns: CustomerColumnVisibility;
  page: number;
  scrollY: number;
};

type CustomersResponse = { customers?: Customer[]; summary?: Summary; pagination?: Pagination };

const emptySummary: Summary = { customerCount: 0, memberCount: 0, nonMemberCount: 0, customersWithOrders: 0, totalPaidRevenue: 0 };
const emptyPagination: Pagination = { page: 1, pageSize: 25, total: 0, totalPages: 1 };
const CUSTOMERS_CONTEXT_KEY = "ruth-customers-resource-context-v1";
const CUSTOMERS_SAVED_VIEWS_KEY = "ruth-customers-saved-views-v1";
const MEMBERSHIP_VALUES = new Set<MembershipFilter>(["all", "member", "non_member"]);
const SORT_VALUES = new Set<SortOption>(["recent", "spent", "orders", "name"]);
const DEFAULT_CUSTOMER_COLUMNS: CustomerColumnVisibility = {
  full_name: true,
  is_member: true,
  total_spent: true,
  order_count: true,
  reward_points_balance: true,
  last_order_at: true,
  city: true,
};

function nameOf(customer: Customer) { return customer.full_name || customer.email || customer.phone || "İsimsiz müşteri"; }
function membershipLabel(customer: Customer) { return customer.is_member ? "Üye" : "Üye değil"; }
function money(value: number) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(value || 0)); }
function dateTime(value?: string | null) { const date = new Date(value || ""); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
function location(customer: Customer) { return [customer.district, customer.city].filter(Boolean).join(" / ") || "Konum bilgisi yok"; }

function customersPath(targetPage: number, membership: MembershipFilter, sort: SortOption, query: string) {
  const params = new URLSearchParams({ page: String(targetPage), pageSize: "25", membership, sort });
  if (query.trim()) params.set("q", query.trim());
  return `/api/customers/list?${params.toString()}`;
}

function membershipValue(value: unknown): MembershipFilter {
  return typeof value === "string" && MEMBERSHIP_VALUES.has(value as MembershipFilter) ? value as MembershipFilter : "all";
}

function sortValue(value: unknown): SortOption {
  return typeof value === "string" && SORT_VALUES.has(value as SortOption) ? value as SortOption : "recent";
}

function normalizeCustomerColumns(value: unknown): CustomerColumnVisibility {
  const raw = value && typeof value === "object" ? value as Partial<CustomerColumnVisibility> : {};
  return {
    full_name: raw.full_name !== false,
    is_member: raw.is_member !== false,
    total_spent: raw.total_spent !== false,
    order_count: raw.order_count !== false,
    reward_points_balance: raw.reward_points_balance !== false,
    last_order_at: raw.last_order_at !== false,
    city: raw.city !== false,
  };
}

function readCustomersContext(): CustomersListContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(CUSTOMERS_CONTEXT_KEY) || "null") as Partial<CustomersListContext> | null;
    if (!raw) return null;
    return {
      query: typeof raw.query === "string" ? raw.query : "",
      membership: membershipValue(raw.membership),
      sort: sortValue(raw.sort),
      density: raw.density === "compact" ? "compact" : "normal",
      columns: normalizeCustomerColumns(raw.columns),
      page: Math.max(1, Number(raw.page || 1)),
      scrollY: Math.max(0, Number(raw.scrollY || 0)),
    };
  } catch {
    return null;
  }
}

function readSavedCustomerViews(): SavedCustomerView[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOMERS_SAVED_VIEWS_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === "object").slice(0, 12).map((item) => {
      const raw = item as Partial<SavedCustomerView>;
      return {
        id: typeof raw.id === "string" ? raw.id : `customers-view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: typeof raw.name === "string" ? raw.name.slice(0, 60) : "Görünüm",
        membership: membershipValue(raw.membership),
        sort: sortValue(raw.sort),
        density: raw.density === "compact" ? "compact" : "normal",
        columns: normalizeCustomerColumns(raw.columns),
      };
    });
  } catch {
    return [];
  }
}

export function ExactCustomers() {
  const searchParams = useSearchParams();
  const toast = useExactToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [pagination, setPagination] = useState<Pagination>(emptyPagination);
  const [query, setQuery] = useState(searchParams.get("q")?.trim() || "");
  const [membership, setMembership] = useState<MembershipFilter>("all");
  const [sort, setSort] = useState<SortOption>("recent");
  const [density, setDensity] = useState<ExactDataTableDensity>("normal");
  const [columnVisibility, setColumnVisibility] = useState<CustomerColumnVisibility>({ ...DEFAULT_CUSTOMER_COLUMNS });
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [contextReady, setContextReady] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedCustomerView[]>([]);
  const [activeSavedViewId, setActiveSavedViewId] = useState("");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkEmailOpen, setBulkEmailOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [pointsOperation, setPointsOperation] = useState<PointsOperation>("add");
  const [pointsAmount, setPointsAmount] = useState("");
  const [pointsReason, setPointsReason] = useState("");
  const restoredScrollRef = useRef<number | null>(null);
  const initialPageRef = useRef<number | null>(null);
  const restoredContextOnceRef = useRef(false);

  useEffect(() => {
    const routeQuery = searchParams.get("q");
    if (routeQuery != null) setQuery(routeQuery.trim());
  }, [searchParams]);

  useEffect(() => {
    if (restoredContextOnceRef.current) return;
    restoredContextOnceRef.current = true;
    const restored = readCustomersContext();
    setSavedViews(readSavedCustomerViews());
    if (restored) {
      if (!searchParams.get("q")) setQuery(restored.query);
      setMembership(restored.membership);
      setSort(restored.sort);
      setDensity(restored.density);
      setColumnVisibility(restored.columns);
      setPage(restored.page);
      initialPageRef.current = restored.page;
      restoredScrollRef.current = restored.scrollY;
    }
    setContextReady(true);
  }, [searchParams]);

  const load = useCallback(async (targetPage: number, silent = false, authoritative = false) => {
    if (!silent) setLoading(true);
    try {
      const path = customersPath(targetPage, membership, sort, query);
      const result = authoritative
        ? (await hardRefreshAdminResource<CustomersResponse>(path)).value
        : await adminRequest<CustomersResponse>(path);
      const next = result.customers || [];
      const validIds = new Set(next.map((customer) => customer.id));
      setCustomers(next);
      setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))));
      setSummary(result.summary || emptySummary);
      setPagination(result.pagination || { ...emptyPagination, page: targetPage });
      setPage(result.pagination?.page || targetPage);
      setSelected((current) => current ? next.find((item) => item.id === current.id) || current : null);
    } catch (caught) {
      // Never turn a transport/provider failure into a successful empty customer list.
      // Keep the last visible verified data and let the next live reconcile replace it.
      toast.error(caught instanceof Error ? caught.message : "Müşteriler alınamadı.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [membership, query, sort, toast]);

  useEffect(() => {
    if (!contextReady) return;
    const targetPage = initialPageRef.current || 1;
    initialPageRef.current = null;
    const timer = window.setTimeout(() => void load(targetPage), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [contextReady, load, membership, query, sort]);

  const refreshCustomers = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(page, true, true);
    } finally {
      setRefreshing(false);
    }
  }, [load, page]);

  useEffect(() => {
    if (!contextReady) return;
    const context: CustomersListContext = {
      query,
      membership,
      sort,
      density,
      columns: columnVisibility,
      page,
      scrollY: window.scrollY,
    };
    window.sessionStorage.setItem(CUSTOMERS_CONTEXT_KEY, JSON.stringify(context));
  }, [columnVisibility, contextReady, density, membership, page, query, sort]);

  useEffect(() => {
    if (!contextReady) return;
    let frame = 0;
    const persistScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        try {
          const current = JSON.parse(window.sessionStorage.getItem(CUSTOMERS_CONTEXT_KEY) || "{}") as Partial<CustomersListContext>;
          window.sessionStorage.setItem(CUSTOMERS_CONTEXT_KEY, JSON.stringify({ ...current, scrollY: window.scrollY }));
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

  const toggleCustomerSelection = useCallback((customer: Customer) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(customer.id)) next.delete(customer.id);
      else next.add(customer.id);
      return next;
    });
  }, []);
  const currentPageIds = useMemo(() => customers.map((customer) => customer.id), [customers]);
  const selectedCustomers = useMemo(() => customers.filter((customer) => selectedIds.has(customer.id)), [customers, selectedIds]);
  const pageSelectedCount = currentPageIds.filter((id) => selectedIds.has(id)).length;
  const allPageSelected = currentPageIds.length > 0 && pageSelectedCount === currentPageIds.length;
  const somePageSelected = pageSelectedCount > 0 && !allPageSelected;
  const togglePageSelection = useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const everySelected = currentPageIds.length > 0 && currentPageIds.every((id) => next.has(id));
      currentPageIds.forEach((id) => {
        if (everySelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }, [currentPageIds]);
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((current) => {
      if (current) {
        setSelectedIds(new Set());
        setBulkEmailOpen(false);
      }
      return !current;
    });
  }, []);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (query.trim()) chips.push({ key: "query", label: `Ara: ${query.trim()}`, clear: () => setQuery("") });
    if (membership !== "all") chips.push({ key: "membership", label: membership === "member" ? "Üyeler" : "Üye olmayanlar", clear: () => setMembership("all") });
    if (sort !== "recent") chips.push({ key: "sort", label: `Sıra: ${sort === "spent" ? "En çok harcayan" : sort === "orders" ? "En çok sipariş" : "İsme göre"}`, clear: () => setSort("recent") });
    return chips;
  }, [membership, query, sort]);

  const clearListFilters = () => {
    setQuery("");
    setMembership("all");
    setSort("recent");
  };

  const saveCurrentView = () => {
    const name = viewName.trim();
    if (!name) {
      toast.error("Görünüm için bir ad yaz.");
      return;
    }
    const nextView: SavedCustomerView = {
      id: `customers-view-${Date.now()}`,
      name: name.slice(0, 60),
      membership,
      sort,
      density,
      columns: { ...columnVisibility },
    };
    const next = [nextView, ...savedViews].slice(0, 12);
    setSavedViews(next);
    setActiveSavedViewId(nextView.id);
    window.localStorage.setItem(CUSTOMERS_SAVED_VIEWS_KEY, JSON.stringify(next));
    setViewName("");
    setSaveViewOpen(false);
    toast.success(`“${nextView.name}” görünümü kaydedildi.`);
  };

  const applySavedView = (id: string) => {
    setActiveSavedViewId(id);
    const next = savedViews.find((item) => item.id === id);
    if (!next) return;
    setMembership(next.membership);
    setSort(next.sort);
    setDensity(next.density);
    setColumnVisibility(next.columns);
    setPage(1);
  };

  const deleteSavedView = () => {
    if (!activeSavedViewId) return;
    const next = savedViews.filter((item) => item.id !== activeSavedViewId);
    setSavedViews(next);
    setActiveSavedViewId("");
    window.localStorage.setItem(CUSTOMERS_SAVED_VIEWS_KEY, JSON.stringify(next));
  };

  const toggleColumn = (key: CustomerColumnKey) => {
    setColumnVisibility((current) => {
      const next = { ...current, [key]: !current[key] };
      return Object.values(next).some(Boolean) ? next : current;
    });
  };

  const adjustPoints = async () => {
    if (!selected || busy) return;
    const amount = Math.floor(Number(pointsAmount));
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Geçerli bir Ruthie Points miktarı gir."); return; }
    setBusy(true);
    try {
      const result = await adminRequest<{ appliedAmount?: number; balance?: number }>("/api/ruthie-points", { method: "POST", body: JSON.stringify({ profileId: selected.profile_id || selected.id, operation: pointsOperation, points: amount, reason: pointsReason }) });
      const applied = Number(result.appliedAmount || (pointsOperation === "add" ? amount : -amount));
      const balance = Number(result.balance ?? Math.max(0, selected.reward_points_balance + applied));
      setSelected((current) => current ? { ...current, reward_points_balance: balance } : current);
      setCustomers((current) => current.map((customer) => customer.id === selected.id ? { ...customer, reward_points_balance: balance } : customer));
      setPointsAmount("");
      setPointsReason("");
      toast.success(`${nameOf(selected)} için ${Math.abs(applied).toLocaleString("tr-TR")} puan ${applied >= 0 ? "eklendi" : "çıkarıldı"}.`);
      void load(page, true, true);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Puan güncellenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const allColumns: ExactColumn<Customer>[] = [
    { key: "full_name", label: "Müşteri", render: (customer) => <div className="flex items-center gap-2.5"><ExactAvatar name={nameOf(customer)} size="sm" /><div className="min-w-0"><p className="ruth-type-table truncate font-medium text-main">{nameOf(customer)}</p><p className="ruth-type-caption truncate text-subtle">{customer.email || customer.phone || "İletişim yok"}</p></div></div> },
    { key: "is_member", label: "Üyelik", align: "center", render: (customer) => <ExactStatusBadge status={customer.is_member ? "active" : "archived"} label={membershipLabel(customer)} size="sm" /> },
    { key: "total_spent", label: "Toplam değer", align: "right", render: (customer) => <span className="ruth-type-table font-semibold text-main">{money(customer.total_spent)}</span> },
    { key: "order_count", label: "Sipariş", align: "right", render: (customer) => <span className="ruth-type-table text-muted">{customer.order_count}</span> },
    { key: "reward_points_balance", label: "Puan", align: "right", render: (customer) => <span className="ruth-type-table inline-flex items-center gap-1 font-medium text-accent"><Star className="h-3 w-3" /> {Math.max(0, Number(customer.reward_points_balance || 0)).toLocaleString("tr-TR")}</span> },
    { key: "last_order_at", label: "Son sipariş", render: (customer) => <span className="ruth-type-caption text-muted">{dateTime(customer.last_order_at)}</span> },
    { key: "city", label: "Konum", render: (customer) => <span className="ruth-type-caption text-muted">{location(customer)}</span> },
  ];
  const columns = allColumns.filter((column) => columnVisibility[String(column.key) as CustomerColumnKey]);

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="customers">
      <ExactPageHeader title="Müşteriler" subtitle={`${pagination.total} müşteri · ${customers.length} kayıt bu sayfada yüklü`} actions={<div className="flex flex-wrap items-center justify-end gap-2"><ExactButton variant="secondary" size="sm" onClick={toggleSelectionMode}>{selectionMode ? <X className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}{selectionMode ? "Seçimi Kapat" : "Toplu Seçim"}</ExactButton><Link href="/crm"><ExactButton variant="secondary" size="sm"><UserRound className="h-4 w-4" /> CRM</ExactButton></Link><Link href="/ruthie-points"><ExactButton variant="secondary" size="sm"><Coins className="h-4 w-4" /> Ruthie Points</ExactButton></Link><ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void refreshCustomers()} loading={refreshing} disabled={loading} /></div>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ExactMetricCard label="Toplam Müşteri" value={summary.customerCount} icon={UsersRound} />
        <ExactMetricCard label="Üyeler" value={summary.memberCount} icon={UserRound} />
        <ExactMetricCard label="Sipariş Veren" value={summary.customersWithOrders} icon={Coins} />
        <ExactMetricCard label="Müşteri Cirosu" value={summary.totalPaidRevenue} format="currency" icon={Star} />
      </div>

      <section className="space-y-3 rounded-[var(--radius-card)] bg-surface-primary p-3 shadow-card md:p-4">
        <ExactSearchInput value={query} onChange={setQuery} placeholder="İsim, e-posta, telefon veya şehir ara..." />
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <ExactSegmentedControl size="sm" value={membership} onChange={(value) => { setMembership(value as MembershipFilter); setPage(1); }} options={[{ value: "all", label: "Tümü" }, { value: "member", label: "Üyeler" }, { value: "non_member", label: "Üye olmayan" }]} />
          <ExactFilterBar className="sm:ml-auto" chips={[{ key: "sort", label: "Sırala", value: sort === "recent" ? null : sort, options: [{ label: "En yeni", value: "recent" }, { label: "En çok harcayan", value: "spent" }, { label: "En çok sipariş", value: "orders" }, { label: "İsme göre", value: "name" }] }]} onChipChange={(_, value) => { setSort(sortValue(value)); setPage(1); }} />
        </div>
        {activeFilterChips.length ? <div className="flex flex-wrap items-center gap-2" aria-label="Aktif müşteri filtreleri">{activeFilterChips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-secondary px-3 text-[11px] font-medium text-main"><span>{chip.label}</span><X className="h-3.5 w-3.5 text-muted" /></button>)}<button type="button" onClick={clearListFilters} className="min-h-9 px-2 text-[11px] font-semibold text-accent">Tümünü temizle</button></div> : null}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3"><div className="flex flex-wrap items-center gap-2"><select value={activeSavedViewId} onChange={(event) => applySavedView(event.target.value)} className="h-10 min-w-[180px] rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs text-main" aria-label="Kaydedilmiş müşteri görünümü"><option value="">Kaydedilmiş görünümler</option>{savedViews.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{activeSavedViewId ? <ExactIconButton icon={Trash2} label="Görünümü sil" variant="ghost" size="icon-sm" onClick={deleteSavedView} /> : null}{!saveViewOpen ? <ExactButton variant="secondary" size="sm" onClick={() => setSaveViewOpen(true)}><BookmarkPlus className="h-4 w-4" /> Görünümü Kaydet</ExactButton> : <div className="flex flex-wrap items-center gap-2"><input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="Görünüm adı" className="h-10 min-w-[170px] rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs text-main outline-none" autoFocus /><ExactButton size="sm" onClick={saveCurrentView}>Kaydet</ExactButton><ExactButton variant="secondary" size="sm" onClick={() => { setSaveViewOpen(false); setViewName(""); }}>Vazgeç</ExactButton></div>}</div><div className="flex flex-wrap items-center gap-2"><ExactSegmentedControl value={density} onChange={(value) => setDensity(value as ExactDataTableDensity)} options={[{ value: "normal", label: "Normal" }, { value: "compact", label: "Kompakt" }]} size="sm" /><ExactButton variant="secondary" size="sm" onClick={() => setColumnsOpen((current) => !current)}><Columns3 className="h-4 w-4" /> Sütunlar</ExactButton></div></div>
        {columnsOpen ? <div className="flex flex-wrap gap-2 rounded-xl bg-surface-secondary p-2.5">{(Object.keys(DEFAULT_CUSTOMER_COLUMNS) as CustomerColumnKey[]).map((key) => { const labels: Record<CustomerColumnKey, string> = { full_name: "Müşteri", is_member: "Üyelik", total_spent: "Toplam değer", order_count: "Sipariş", reward_points_balance: "Puan", last_order_at: "Son sipariş", city: "Konum" }; return <button key={key} type="button" aria-pressed={columnVisibility[key]} onClick={() => toggleColumn(key)} className={`min-h-9 rounded-lg border px-3 text-xs font-medium ${columnVisibility[key] ? "border-accent bg-accent-soft text-accent" : "border-border-subtle bg-surface-primary text-muted"}`}><Check className={`mr-1 inline h-3.5 w-3.5 ${columnVisibility[key] ? "opacity-100" : "opacity-0"}`} />{labels[key]}</button>; })}</div> : null}
      </section>

      {selectionMode ? <section className="sticky top-16 z-20 rounded-[var(--radius-card)] border border-accent/30 bg-surface-primary p-3 shadow-floating"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-main">{selectedIds.size} müşteri seçili · bu ekranda yüklü kayıtlar</p><p className="mt-1 text-[11px] text-muted">Seçili müşterilere Şablonlar sayfasındaki güncel tasarımlardan biriyle veya gönderim öncesi kendi metnini düzenleyerek mail gönderebilirsin.</p></div>{selectedIds.size ? <div className="flex flex-wrap gap-2"><ExactButton size="sm" onClick={() => setBulkEmailOpen(true)}><Mail className="h-4 w-4" /> E-posta Gönder</ExactButton><ExactButton variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>Seçimi Temizle</ExactButton></div> : null}</div></section> : null}

      {loading ? <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div> : <ExactDataTable columns={columns} data={customers} density={density} selection={selectionMode ? { selectedIds, onToggleRow: toggleCustomerSelection, onToggleAll: togglePageSelection, allSelected: allPageSelected, someSelected: somePageSelected, label: "Bu yüklü müşteri sayfasını seç" } : undefined} onRowClick={setSelected} emptyState={<ExactEmptyState icon={UsersRound} title="Bu filtrede müşteri yok" description="Arama veya üyelik filtresini değiştir." />} mobileCard={(customer) => <Pressable type="button" pressStrength="subtle" onClick={() => setSelected(customer)} className="w-full text-left bg-surface-primary radius-card shadow-card p-3.5"><div className="flex items-center gap-2.5 mb-2"><ExactAvatar name={nameOf(customer)} size="sm" /><div className="flex-1 min-w-0"><p className="ruth-type-card-title truncate text-main">{nameOf(customer)}</p><p className="ruth-type-caption truncate text-subtle">{customer.email || customer.phone}</p></div><ExactStatusBadge status={customer.is_member ? "active" : "archived"} label={membershipLabel(customer)} size="sm" /></div><div className="grid grid-cols-3 gap-2 text-center"><div><p className="ruth-type-metric text-main">{customer.order_count}</p><p className="ruth-type-label text-subtle">Sipariş</p></div><div><p className="ruth-type-metric text-main">{money(customer.total_spent)}</p><p className="ruth-type-label text-subtle">Harcama</p></div><div><p className="ruth-type-metric text-accent">{customer.reward_points_balance}</p><p className="ruth-type-label text-subtle">Puan</p></div></div></Pressable>} />}

      {!loading && pagination.totalPages > 1 ? <div className="flex items-center justify-center gap-3"><ExactButton variant="secondary" size="sm" disabled={pagination.page <= 1} onClick={() => void load(pagination.page - 1)}><ArrowLeft className="h-4 w-4" /> Önceki</ExactButton><span className="ruth-type-caption text-muted">Sayfa {pagination.page} / {pagination.totalPages}</span><ExactButton variant="secondary" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => void load(pagination.page + 1)}>Sonraki <ArrowRight className="h-4 w-4" /></ExactButton></div> : null}

      <ExactBulkEmailComposer open={bulkEmailOpen} customers={selectedCustomers} onClose={() => setBulkEmailOpen(false)} />

      <ExactDetailDrawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? nameOf(selected) : "Müşteri"} subtitle={selected ? `${membershipLabel(selected)} · ${selected.created_at ? dateTime(selected.created_at) : "Kayıt tarihi yok"}` : undefined} width={620} footer={selected ? <div className="flex gap-2"><Link href={`/crm?customer=${selected.id}`} className="flex-1"><ExactButton variant="secondary" size="sm" className="w-full">CRM kaydını aç <ArrowRight className="h-3.5 w-3.5" /></ExactButton></Link><Link href={selected.last_order_id ? `/orders?order=${selected.last_order_id}` : "/orders"} className="flex-1"><ExactButton size="sm" className="w-full">Siparişleri gör <ArrowRight className="h-3.5 w-3.5" /></ExactButton></Link></div> : null}>
        {selected ? <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2"><div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label uppercase text-subtle">Sipariş</p><p className="ruth-type-metric text-main">{selected.order_count}</p></div><div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label uppercase text-subtle">Harcama</p><p className="ruth-type-metric text-main">{money(selected.total_spent)}</p></div><div className="p-3 radius-small bg-accent-soft"><p className="ruth-type-label uppercase text-accent">Ruthie Points</p><p className="ruth-type-metric text-accent">{Math.max(0, selected.reward_points_balance).toLocaleString("tr-TR")}</p></div></div>
          <section><div className="flex items-center gap-2 mb-2"><UserRound className="h-3.5 w-3.5 text-subtle" /><h4 className="ruth-type-label uppercase tracking-wide text-muted">Profil</h4></div><div className="flex items-center gap-3"><ExactAvatar name={nameOf(selected)} size="lg" /><div className="min-w-0"><p className="ruth-type-card-title text-main">{nameOf(selected)}</p>{selected.phone ? <a href={`tel:${selected.phone}`} className="ruth-type-caption flex items-center gap-1 text-muted hover:text-accent"><Phone className="h-3 w-3" /> {selected.phone}</a> : null}{selected.email ? <a href={`mailto:${selected.email}`} className="ruth-type-caption flex items-center gap-1 text-muted hover:text-accent"><Mail className="h-3 w-3" /> {selected.email}</a> : null}<p className="ruth-type-caption flex items-center gap-1 text-muted"><MapPin className="h-3 w-3" /> {location(selected)}</p></div></div><dl className="grid grid-cols-2 gap-2 mt-3"><div className="p-2.5 radius-small bg-surface-secondary"><dt className="ruth-type-caption text-subtle">Üyelik</dt><dd className="ruth-type-body-strong mt-0.5 text-main">{membershipLabel(selected)}</dd></div><div className="p-2.5 radius-small bg-surface-secondary"><dt className="ruth-type-caption text-subtle">E-posta izni</dt><dd className="ruth-type-body-strong mt-0.5 text-main">{selected.marketing_email_consent ? "Var" : "Yok"}</dd></div><div className="p-2.5 radius-small bg-surface-secondary"><dt className="ruth-type-caption text-subtle">Şartlar</dt><dd className="ruth-type-body-strong mt-0.5 text-main">{selected.terms_accepted ? "Kabul edildi" : "Kayıt yok"}</dd></div><div className="p-2.5 radius-small bg-surface-secondary"><dt className="ruth-type-caption text-subtle">Eski sistem durumu</dt><dd className="ruth-type-body-strong mt-0.5 text-main">{selected.ikas_account_status || "—"}</dd></div></dl></section>
          <section><div className="flex items-center gap-2 mb-2"><Coins className="h-3.5 w-3.5 text-subtle" /><h4 className="ruth-type-label uppercase tracking-wide text-muted">Puan düzenleme</h4></div><ExactSegmentedControl size="sm" value={pointsOperation} onChange={(value) => setPointsOperation(value as PointsOperation)} options={[{ value: "add", label: "Puan ekle" }, { value: "remove", label: "Puan çıkar" }]} /><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3"><ExactField label="Puan miktarı"><input type="number" min="1" value={pointsAmount} onChange={(event) => setPointsAmount(event.target.value)} className={exactFormInputClass} /></ExactField><ExactField label="Sebep"><input value={pointsReason} onChange={(event) => setPointsReason(event.target.value)} className={exactFormInputClass} placeholder="Kampanya, telafi, düzeltme..." /></ExactField></div><ExactButton className="w-full mt-3" size="sm" onClick={() => void adjustPoints()} loading={busy}>{pointsOperation === "add" ? "Puan ekle" : "Puan çıkar"}</ExactButton></section>
        </div> : null}
      </ExactDetailDrawer>
    </div>
  );
}
