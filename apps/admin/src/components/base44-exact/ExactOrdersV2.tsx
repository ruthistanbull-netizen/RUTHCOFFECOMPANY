"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  BookmarkPlus,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Columns3,
  Copy,
  ExternalLink,
  ImageIcon,
  ListChecks,
  Mail,
  MapPin,
  PackageCheck,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShoppingBag,
  Trash2,
  Truck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { CopyButton } from "@ruth-commerce/ui";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { adminAuthHeaders, adminRequest, apiUrl } from "@/lib/adminApi";
import { hardRefreshAdminResource } from "@/lib/adminFreshnessActions";
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
import { ExactAvatar, ExactDataCard, ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn, type ExactDataTableDensity, type ExactDataTableSortDirection } from "./data";

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
type ProductVariant = { id: string; option_summary: string; price: number; image_url?: string | null; is_active?: boolean };
type Product = { id: string; name: string; slug: string; price: number; currency?: string; main_image_url?: string | null; product_variants?: ProductVariant[] };
type MoneyPart = { amountMinor?: number; currency?: string };
type Pricing = { subtotal?: MoneyPart; discount?: MoneyPart; pointsDiscount?: MoneyPart; shipping?: MoneyPart; tax?: MoneyPart; total?: MoneyPart; calculationId?: string };
type PaymentSummary = {
  source?: string;
  provider?: string;
  method?: string;
  status?: string;
  orderAmountMinor?: number;
  chargedAmountMinor?: number;
  installmentFeeMinor?: number | null;
  installmentCount?: number;
  installmentRateBps?: number;
  cardProgram?: string | null;
  quoteId?: string | null;
  providerReference?: string | null;
  paidAt?: string | null;
  fallbackReason?: string | null;
};
type Order = {
  id: string;
  order_no: string;
  profile_id?: string | null;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  total_amount: number;
  subtotal?: number | null;
  shipping_fee?: number | null;
  discount_total?: number | null;
  reward_discount_total?: number | null;
  tax_total?: number | null;
  currency: string;
  status: string;
  payment_status: string;
  fulfillment_status?: string | null;
  state_version?: number | null;
  created_at: string;
  cancelled_at?: string | null;
  delivered_at?: string | null;
  cargo_company?: string | null;
  cargo_tracking_no?: string | null;
  cargo_tracking_url?: string | null;
  shipping_provider?: string | null;
  shipping_status?: string | null;
  shipping_price?: number | null;
  shipping_error?: string | null;
  basit_kargo_order_id?: string | null;
  basit_kargo_barcode?: string | null;
  basit_kargo_handler_code?: string | null;
  basit_kargo_return_barcode?: string | null;
  shipping_address_id?: string | null;
  shipping_address_text?: unknown;
  shipping_city?: string | null;
  shipping_town?: string | null;
  shipping_neighborhood?: string | null;
  shipping_address_line?: string | null;
  shipping_postal_code?: string | null;
  shipping_recipient?: unknown;
  customer_note?: string | null;
  admin_note?: string | null;
  reminder_note?: string | null;
  reminder_at?: string | null;
  review_email_status?: string | null;
  review_email_sent_at?: string | null;
  review_email_error_message?: string | null;
  imported_source?: string | null;
  traffic_source?: string | null;
  traffic_medium?: string | null;
  traffic_campaign?: string | null;
  traffic_referrer?: string | null;
  visitor_id?: string | null;
  purchase_session_id?: string | null;
  session_count_before_purchase?: number | null;
  purchase_session_number?: number | null;
  total_session_duration_seconds?: number | null;
  purchase_session_duration_seconds?: number | null;
  attribution_data?: Record<string, unknown> | null;
  pricing?: Pricing | null;
  paymentSummary?: PaymentSummary | null;
  order_items?: OrderItem[];
};
type StatusFilter = "all" | "new" | "preparing" | "ready" | "shipped" | "delivered" | "attention";
type PaymentFilter = "all" | "paid" | "waiting" | "failed";
type DirtyCloseOrigin = "explicit" | "back" | null;
type OrderSelectionScope = "page" | "filtered" | "all";
type OrderColumnKey = "order_no" | "customer_name" | "total_amount" | "payment_status" | "status" | "cargo_tracking_no";
type OrderSortKey = "order_no" | "customer_name" | "total_amount";
type OrderColumnVisibility = Record<OrderColumnKey, boolean>;
type SavedOrderView = {
  id: string;
  name: string;
  statusFilter: StatusFilter;
  paymentFilter: PaymentFilter;
  density: ExactDataTableDensity;
  columns: OrderColumnVisibility;
  sortKey: OrderSortKey | null;
  sortDirection: ExactDataTableSortDirection;
};
type OrdersListContext = {
  query: string;
  statusFilter: StatusFilter;
  paymentFilter: PaymentFilter;
  density: ExactDataTableDensity;
  columns: OrderColumnVisibility;
  sortKey: OrderSortKey | null;
  sortDirection: ExactDataTableSortDirection;
  page: number;
  scrollY: number;
};
type OrdersResponse = { orders?: Order[] };

const statusOptions = [
  { value: "awaiting_payment", label: "Ödeme bekleniyor" },
  { value: "paid", label: "Yeni sipariş" },
  { value: "in_production", label: "Hazırlanıyor" },
  { value: "ready_to_ship", label: "Kargoya hazır" },
  { value: "shipped", label: "Gönderildi" },
  { value: "delivered", label: "Teslim edildi" },
  { value: "cancelled", label: "İptal edildi" },
];
const paymentOptions = ["pending", "waiting", "paid", "failed", "cancelled", "refunded"];
const ORDERS_PAGE_SIZE = 50;
const ORDERS_RESOURCE_PATH = "/api/orders?range=all&payment=all&q=";
const ORDERS_CONTEXT_KEY = "ruth-orders-resource-context-v1";
const ORDERS_SAVED_VIEWS_KEY = "ruth-orders-saved-views-v1";
const DEFAULT_ORDER_COLUMNS: OrderColumnVisibility = {
  order_no: true,
  customer_name: true,
  total_amount: true,
  payment_status: true,
  status: true,
  cargo_tracking_no: true,
};
const STATUS_FILTER_VALUES = new Set<StatusFilter>(["all", "new", "preparing", "ready", "shipped", "delivered", "attention"]);
const PAYMENT_FILTER_VALUES = new Set<PaymentFilter>(["all", "paid", "waiting", "failed"]);
const ORDER_SORT_KEYS = new Set<OrderSortKey>(["order_no", "customer_name", "total_amount"]);

function norm(value: unknown) { return String(value || "").trim().toLocaleLowerCase("tr-TR"); }
function paid(order: Order) { return ["paid", "succeeded", "success"].includes(norm(order.payment_status)); }
function manualOrder(order: Order) { return norm(order.imported_source) === "manual" || String(order.order_no || "").toUpperCase().startsWith("MAN"); }
function shipmentExists(order: Order) { return Boolean(order.basit_kargo_order_id || order.basit_kargo_barcode || order.cargo_tracking_no); }
function attention(order: Order) { return Boolean(order.shipping_error) || ["failed", "rejected", "requires_action"].includes(norm(order.payment_status)); }
function stateGroup(order: Order) {
  const value = norm(order.status);
  if (["created", "new", "paid", "confirmed"].includes(value)) return "new";
  if (["preparing", "queued", "in_production", "quality_control", "processing"].includes(value)) return "preparing";
  if (["prepared", "ready", "ready_to_ship", "label_created", "ready_for_handover"].includes(value)) return "ready";
  if (["shipped", "in_transit", "out_for_delivery"].includes(value)) return "shipped";
  if (["delivered", "completed", "fulfilled"].includes(value)) return "delivered";
  return value;
}
function statusEditor(order: Order) {
  const value = norm(order.status);
  if (["awaiting_payment", "pending", "waiting"].includes(value)) return "awaiting_payment";
  if (["created", "new", "paid", "confirmed"].includes(value)) return paid(order) ? "paid" : "awaiting_payment";
  if (["preparing", "queued", "in_production", "quality_control", "processing"].includes(value)) return "in_production";
  if (["prepared", "ready", "ready_to_ship", "label_created", "ready_for_handover"].includes(value)) return "ready_to_ship";
  if (["shipped", "in_transit", "out_for_delivery"].includes(value)) return "shipped";
  if (["delivered", "completed", "fulfilled"].includes(value)) return "delivered";
  if (["cancelled", "canceled"].includes(value)) return "cancelled";
  return paid(order) ? "paid" : "awaiting_payment";
}
function money(value: number, currency = "TRY") { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY", maximumFractionDigits: 2 }).format(Number(value || 0)); }
function minorMoney(value?: number | null, currency = "TRY") { return money(Number(value || 0) / 100, currency); }
function dateTime(value?: string | null) { const date = new Date(value || ""); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date); }
function relative(value?: string | null) { const time = new Date(value || "").getTime(); if (!Number.isFinite(time)) return "—"; const minutes = Math.round((Date.now() - time) / 60_000); if (minutes < 60) return `${Math.max(0, minutes)} dk önce`; const hours = Math.round(minutes / 60); if (hours < 24) return `${hours} sa önce`; return `${Math.round(hours / 24)} gün önce`; }
function itemCount(order: Order) { return (order.order_items || []).reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0); }
function normalizeItem(item: OrderItem): OrderItem { const quantity = Math.max(1, Math.trunc(Number(item.quantity || 1))); const unitPrice = Math.max(0, Number(item.unit_price || 0)); return { ...item, quantity, unit_price: unitPrice, total_price: quantity * unitPrice }; }
function orderItemsEqual(left: OrderItem[], right: OrderItem[]) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const a = normalizeItem(item);
    const b = normalizeItem(right[index]);
    return String(a.id || "") === String(b.id || "")
      && String(a.product_id || "") === String(b.product_id || "")
      && String(a.variant_id || "") === String(b.variant_id || "")
      && String(a.product_name || "") === String(b.product_name || "")
      && String(a.variant_name || "") === String(b.variant_name || "")
      && a.quantity === b.quantity
      && a.unit_price === b.unit_price;
  });
}
function datetimeLocal(value?: string | null) { if (!value) return ""; const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function textValue(value: unknown) { if (typeof value === "string") return value.trim(); if (typeof value === "number" && Number.isFinite(value)) return String(value); return ""; }
function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function firstText(...values: unknown[]) { for (const value of values) { const text = textValue(value); if (text) return text; } return ""; }
function shippingRecord(order: Order) { return { ...objectValue(order.shipping_address_text), ...objectValue(order.shipping_recipient) }; }
function recipientName(order: Order) { const shipment = shippingRecord(order); return firstText(shipment.name, shipment.full_name, shipment.fullName, order.shipping_recipient, order.customer_name) || "—"; }
function shipmentAddressLine(order: Order) { const shipment = shippingRecord(order); return firstText(order.shipping_address_line, shipment.addressLine, shipment.address, order.shipping_address_text); }
function address(order: Order) { const shipment = shippingRecord(order); const neighborhood = firstText(order.shipping_neighborhood, shipment.neighborhood); const line = shipmentAddressLine(order); const postalCode = firstText(order.shipping_postal_code, shipment.postalCode, shipment.postal_code); const town = firstText(order.shipping_town, shipment.town, shipment.district); const city = firstText(order.shipping_city, shipment.city); return [recipientName(order), neighborhood, line, postalCode, [town, city].filter(Boolean).join(" / ")].filter(Boolean).join(", ") || "Adres bilgisi yok"; }
function statusLabel(value: string) { return statusOptions.find((item) => item.value === statusEditor({ status: value, payment_status: "paid" } as Order))?.label || value || "Bilinmiyor"; }
function paymentLabel(value?: string | null) { const key = norm(value); if (key === "paid" || key === "succeeded") return "Ödendi"; if (key === "failed") return "Başarısız"; if (key === "refunded") return "İade edildi"; if (key === "cancelled") return "İptal"; return "Bekliyor"; }
function duration(seconds?: number | null) { const value = Math.max(0, Number(seconds || 0)); if (!value) return "—"; const minutes = Math.floor(value / 60); const rest = Math.round(value % 60); return minutes ? `${minutes} dk ${rest} sn` : `${rest} sn`; }
function sourceLabel(value?: string | null) { const key = norm(value); if (key === "instagram") return "Instagram"; if (key === "facebook") return "Facebook"; if (key === "google") return "Google"; if (key === "direct") return "Doğrudan"; if (key === "manual") return "Manuel"; return value || "Bilinmiyor"; }
function normalizeOrderColumns(value: unknown): OrderColumnVisibility {
  const raw = value && typeof value === "object" ? value as Partial<OrderColumnVisibility> : {};
  return {
    order_no: raw.order_no !== false,
    customer_name: raw.customer_name !== false,
    total_amount: raw.total_amount !== false,
    payment_status: raw.payment_status !== false,
    status: raw.status !== false,
    cargo_tracking_no: raw.cargo_tracking_no !== false,
  };
}
function statusFilterValue(value: unknown): StatusFilter { return typeof value === "string" && STATUS_FILTER_VALUES.has(value as StatusFilter) ? value as StatusFilter : "all"; }
function paymentFilterValue(value: unknown): PaymentFilter { return typeof value === "string" && PAYMENT_FILTER_VALUES.has(value as PaymentFilter) ? value as PaymentFilter : "all"; }
function orderSortKeyValue(value: unknown): OrderSortKey | null { return typeof value === "string" && ORDER_SORT_KEYS.has(value as OrderSortKey) ? value as OrderSortKey : null; }
function sortDirectionValue(value: unknown): ExactDataTableSortDirection { return value === "desc" ? "desc" : "asc"; }
function readOrdersContext(): OrdersListContext | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(ORDERS_CONTEXT_KEY) || "null") as Partial<OrdersListContext> | null;
    if (!parsed) return null;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      statusFilter: statusFilterValue(parsed.statusFilter),
      paymentFilter: paymentFilterValue(parsed.paymentFilter),
      density: parsed.density === "compact" ? "compact" : "normal",
      columns: normalizeOrderColumns(parsed.columns),
      sortKey: orderSortKeyValue(parsed.sortKey),
      sortDirection: sortDirectionValue(parsed.sortDirection),
      page: Math.max(1, Number(parsed.page || 1)),
      scrollY: Math.max(0, Number(parsed.scrollY || 0)),
    };
  } catch { return null; }
}
function readSavedOrderViews(): SavedOrderView[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ORDERS_SAVED_VIEWS_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === "object").slice(0, 12).map((item) => {
      const raw = item as Partial<SavedOrderView>;
      return {
        id: typeof raw.id === "string" ? raw.id : `orders-view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: typeof raw.name === "string" ? raw.name.slice(0, 60) : "Görünüm",
        statusFilter: statusFilterValue(raw.statusFilter),
        paymentFilter: paymentFilterValue(raw.paymentFilter),
        density: raw.density === "compact" ? "compact" : "normal",
        columns: normalizeOrderColumns(raw.columns),
        sortKey: orderSortKeyValue(raw.sortKey),
        sortDirection: sortDirectionValue(raw.sortDirection),
      };
    });
  } catch { return []; }
}

function KeyValue({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3"><p className="text-[9px] font-semibold uppercase tracking-wide text-subtle">{label}</p><div className={mono ? "mt-1 break-all font-mono text-[10px] text-main" : "mt-1 text-xs font-medium text-main"}>{value || "—"}</div></div>;
}

function CopyKeyValue({ label, value, mono = false }: { label: string; value: unknown; mono?: boolean }) {
  const text = textValue(value);
  return (
    <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-subtle">{label}</p>
      {text ? (
        <CopyButton
          value={text}
          label={`${label} kopyala`}
          copiedLabel="Kopyalandı"
          className="mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-small)] text-left text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:min-h-7"
        >
          {(state) => (
            <>
              <span className={mono ? "min-w-0 break-all font-mono text-[10px]" : "min-w-0 truncate text-xs font-medium"}>
                {state === "copied" ? "Kopyalandı" : text}
              </span>
              {state === "copied" ? <Check className="h-3.5 w-3.5 shrink-0 text-success" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-muted" />}
            </>
          )}
        </CopyButton>
      ) : <div className={mono ? "mt-1 font-mono text-[10px] text-main" : "mt-1 text-xs font-medium text-main"}>—</div>}
    </div>
  );
}

export function ExactOrdersV2() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useExactToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [density, setDensity] = useState<ExactDataTableDensity>("normal");
  const [columnVisibility, setColumnVisibility] = useState<OrderColumnVisibility>({ ...DEFAULT_ORDER_COLUMNS });
  const [sortKey, setSortKey] = useState<OrderSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<ExactDataTableSortDirection>("asc");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [contextReady, setContextReady] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedOrderView[]>([]);
  const [activeSavedViewId, setActiveSavedViewId] = useState("");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionScope, setSelectionScope] = useState<OrderSelectionScope>("page");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Order | null>(null);
  const [detailStatus, setDetailStatus] = useState("paid");
  const [detailPayment, setDetailPayment] = useState("pending");
  const [adminNote, setAdminNote] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [editingItems, setEditingItems] = useState(false);
  const [draftItems, setDraftItems] = useState<OrderItem[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; name: string } | null>(null);
  const [dirtyCloseOrigin, setDirtyCloseOrigin] = useState<DirtyCloseOrigin>(null);
  const allowNextRouteCloseRef = useRef(false);
  const restoredScrollRef = useRef<number | null>(null);
  const previousFilterKeyRef = useRef("");
  const restoredContextOnceRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const itemsDirty = useMemo(() => {
    if (!selected) return false;
    return !orderItemsEqual(draftItems, selected.order_items || []);
  }, [draftItems, selected]);

  const detailDirty = useMemo(() => {
    if (!selected) return false;
    return detailStatus !== statusEditor(selected)
      || (manualOrder(selected) && detailPayment !== (norm(selected.payment_status) || "pending"))
      || adminNote !== (selected.admin_note || "")
      || reminderNote !== (selected.reminder_note || "")
      || reminderAt !== datetimeLocal(selected.reminder_at)
      || notifyCustomer
      || itemsDirty;
  }, [adminNote, detailPayment, detailStatus, itemsDirty, notifyCustomer, reminderAt, reminderNote, selected]);

  const load = useCallback(async (silent = false, authoritative = false) => {
    if (!silent) setLoading(true);
    try {
      const result = authoritative
        ? (await hardRefreshAdminResource<OrdersResponse>(ORDERS_RESOURCE_PATH)).value
        : await adminRequest<OrdersResponse>(ORDERS_RESOURCE_PATH);
      const next = result.orders || [];
      const validIds = new Set(next.map((order) => order.id));
      setOrders(next);
      setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))));
      setSelected((current) => current ? next.find((order) => order.id === current.id) || current : null);
      return next;
    } catch (caught) {
      // A transport/provider failure is not an empty order book. Preserve the last
      // visible verified list and let the next authoritative reconcile replace it.
      if (!silent) toast.error(caught instanceof Error ? caught.message : "Siparişler alınamadı.");
      return null;
    } finally { if (!silent) setLoading(false); }
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const refreshOrders = useCallback(async () => {
    setRefreshing(true);
    try { await load(true, true); }
    finally { setRefreshing(false); }
  }, [load]);

  useEffect(() => {
    if (restoredContextOnceRef.current) return;
    restoredContextOnceRef.current = true;
    const restored = readOrdersContext();
    setSavedViews(readSavedOrderViews());
    if (restored) {
      if (!searchParams.get("q")) setQuery(restored.query);
      setStatusFilter(restored.statusFilter);
      setPaymentFilter(restored.paymentFilter);
      setDensity(restored.density);
      setColumnVisibility(restored.columns);
      setSortKey(restored.sortKey);
      setSortDirection(restored.sortDirection);
      setPage(restored.page);
      restoredScrollRef.current = restored.scrollY;
      previousFilterKeyRef.current = [restored.query, restored.statusFilter, restored.paymentFilter, restored.sortKey || "", restored.sortDirection].join("|");
    }
    setContextReady(true);
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    let running = false;
    const reconcile = async () => {
      if (!active || running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const result = await adminRequest<{ removed?: number }>("/api/shipping/basit-kargo/reconcile", { method: "POST", body: "{}" });
        if (active && Number(result.removed || 0) > 0) await load(true, true);
      } catch {
        // Dakikalık arka plan kontrolünde geçici ağ/API hataları kullanıcıyı toast ile rahatsız etmez.
      } finally { running = false; }
    };
    void reconcile();
    const timer = window.setInterval(() => { void reconcile(); }, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [load]);

  const setFields = (order: Order) => {
    setDetailStatus(statusEditor(order));
    setDetailPayment(norm(order.payment_status) || "pending");
    setAdminNote(order.admin_note || "");
    setReminderNote(order.reminder_note || "");
    setReminderAt(datetimeLocal(order.reminder_at));
    setNotifyCustomer(false);
    setEditingItems(false);
    setDraftItems((order.order_items || []).map((item) => normalizeItem({ ...item })));
    setProductQuery("");
    setProducts([]);
    setDirtyCloseOrigin(null);
  };
  const clearDetailState = useCallback(() => {
    setSelected(null);
    setNotifyCustomer(false);
    setEditingItems(false);
    setProductQuery("");
    setProducts([]);
    setDirtyCloseOrigin(null);
  }, []);
  const openDetail = useCallback((order: Order) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("order", order.id);
    router.push(`/orders?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);
  const closeDetail = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("order");
    router.replace(params.toString() ? `/orders?${params.toString()}` : "/orders", { scroll: false });
  }, [router, searchParams]);
  const requestCloseDetail = useCallback(() => {
    if (detailDirty) {
      setDirtyCloseOrigin("explicit");
      return;
    }
    closeDetail();
  }, [closeDetail, detailDirty]);
  const discardAndClose = useCallback(() => {
    const origin = dirtyCloseOrigin;
    allowNextRouteCloseRef.current = true;
    setDirtyCloseOrigin(null);
    if (origin === "back") {
      router.back();
      return;
    }
    closeDetail();
  }, [closeDetail, dirtyCloseOrigin, router]);

  useEffect(() => {
    const id = searchParams.get("order");
    if (!id) {
      if (allowNextRouteCloseRef.current) {
        allowNextRouteCloseRef.current = false;
        if (selected) clearDetailState();
        return;
      }
      if (selected && detailDirty) {
        setDirtyCloseOrigin("back");
        const params = new URLSearchParams(searchParams.toString());
        params.set("order", selected.id);
        router.push(`/orders?${params.toString()}`, { scroll: false });
        return;
      }
      if (selected) clearDetailState();
      return;
    }
    if (!orders.length || selected?.id === id) return;
    const found = orders.find((order) => order.id === id);
    if (found) {
      setSelected(found);
      setFields(found);
    } else if (selected) {
      clearDetailState();
    }
  }, [clearDetailState, detailDirty, orders, router, searchParams, selected]);

  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase("tr-TR");
    const filtered = orders.filter((order) => {
      const haystack = [order.order_no, order.customer_name, order.customer_email, order.customer_phone, order.cargo_tracking_no, order.basit_kargo_barcode].join(" ").toLocaleLowerCase("tr-TR");
      if (needle && !haystack.includes(needle)) return false;
      if (statusFilter === "attention" && !attention(order)) return false;
      if (statusFilter !== "all" && statusFilter !== "attention" && stateGroup(order) !== statusFilter) return false;
      if (paymentFilter === "paid" && !paid(order)) return false;
      if (paymentFilter === "waiting" && !["pending", "waiting", "requires_action"].includes(norm(order.payment_status))) return false;
      if (paymentFilter === "failed" && !["failed", "rejected"].includes(norm(order.payment_status))) return false;
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
  }, [deferredQuery, orders, paymentFilter, sortDirection, sortKey, statusFilter]);
  const metrics = useMemo(() => ({ newOrders: orders.filter((order) => stateGroup(order) === "new" && paid(order)).length, preparing: orders.filter((order) => stateGroup(order) === "preparing").length, ready: orders.filter((order) => stateGroup(order) === "ready").length, attention: orders.filter(attention).length }), [orders]);
  const filterKey = useMemo(() => [query, statusFilter, paymentFilter, sortKey || "", sortDirection].join("|"), [paymentFilter, query, sortDirection, sortKey, statusFilter]);
  useEffect(() => {
    if (!contextReady) return;
    if (!previousFilterKeyRef.current) previousFilterKeyRef.current = filterKey;
    else if (previousFilterKeyRef.current !== filterKey) {
      previousFilterKeyRef.current = filterKey;
      setPage(1);
      setActiveSavedViewId("");
    }
  }, [contextReady, filterKey]);
  const pageCount = Math.max(1, Math.ceil(visible.length / ORDERS_PAGE_SIZE));
  useEffect(() => { setPage((current) => Math.min(Math.max(1, current), pageCount)); }, [pageCount]);
  const renderedOrders = useMemo(() => visible.slice((page - 1) * ORDERS_PAGE_SIZE, page * ORDERS_PAGE_SIZE), [page, visible]);

  useEffect(() => {
    if (!contextReady) return;
    const context: OrdersListContext = { query, statusFilter, paymentFilter, density, columns: columnVisibility, sortKey, sortDirection, page, scrollY: window.scrollY };
    window.sessionStorage.setItem(ORDERS_CONTEXT_KEY, JSON.stringify(context));
  }, [columnVisibility, contextReady, density, page, paymentFilter, query, sortDirection, sortKey, statusFilter]);
  useEffect(() => {
    if (!contextReady) return;
    let frame = 0;
    const persistScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        try {
          const current = JSON.parse(window.sessionStorage.getItem(ORDERS_CONTEXT_KEY) || "{}") as Partial<OrdersListContext>;
          window.sessionStorage.setItem(ORDERS_CONTEXT_KEY, JSON.stringify({ ...current, scrollY: window.scrollY }));
        } catch {}
      });
    };
    window.addEventListener("scroll", persistScroll, { passive: true });
    return () => { window.removeEventListener("scroll", persistScroll); if (frame) window.cancelAnimationFrame(frame); };
  }, [contextReady]);
  useEffect(() => {
    if (!contextReady || loading || restoredScrollRef.current == null) return;
    const target = restoredScrollRef.current;
    restoredScrollRef.current = null;
    window.requestAnimationFrame(() => window.scrollTo({ top: target, behavior: "auto" }));
  }, [contextReady, loading]);

  const scopeOrders = selectionScope === "page" ? renderedOrders : selectionScope === "filtered" ? visible : orders;
  const scopeIds = useMemo(() => scopeOrders.map((order) => order.id), [scopeOrders]);
  const scopeSelectedCount = scopeIds.filter((id) => selectedIds.has(id)).length;
  const allScopeSelected = scopeIds.length > 0 && scopeSelectedCount === scopeIds.length;
  const someScopeSelected = scopeSelectedCount > 0 && !allScopeSelected;
  const toggleOrderSelection = useCallback((order: Order) => {
    setSelectedIds((current) => { const next = new Set(current); if (next.has(order.id)) next.delete(order.id); else next.add(order.id); return next; });
  }, []);
  const toggleScopeSelection = useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const everySelected = scopeIds.length > 0 && scopeIds.every((id) => next.has(id));
      scopeIds.forEach((id) => { if (everySelected) next.delete(id); else next.add(id); });
      return next;
    });
  }, [scopeIds]);
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((current) => { if (current) setSelectedIds(new Set()); return !current; });
  }, []);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (query.trim()) chips.push({ key: "query", label: `Ara: ${query.trim()}`, clear: () => setQuery("") });
    if (statusFilter !== "all") chips.push({ key: "status", label: `Durum: ${statusFilter === "new" ? "Yeni" : statusFilter === "preparing" ? "Hazırlanıyor" : statusFilter === "ready" ? "Kargoya hazır" : statusFilter === "shipped" ? "Gönderildi" : statusFilter === "delivered" ? "Teslim edildi" : "İşlem gerekli"}`, clear: () => setStatusFilter("all") });
    if (paymentFilter !== "all") chips.push({ key: "payment", label: `Ödeme: ${paymentFilter === "paid" ? "Ödendi" : paymentFilter === "waiting" ? "Bekliyor" : "Başarısız"}`, clear: () => setPaymentFilter("all") });
    return chips;
  }, [paymentFilter, query, statusFilter]);
  const clearListFilters = () => { setQuery(""); setStatusFilter("all"); setPaymentFilter("all"); };
  const saveCurrentView = () => {
    const name = viewName.trim();
    if (!name) { toast.error("Görünüm için bir ad yaz."); return; }
    const nextView: SavedOrderView = { id: `orders-view-${Date.now()}`, name: name.slice(0, 60), statusFilter, paymentFilter, density, columns: { ...columnVisibility }, sortKey, sortDirection };
    const next = [nextView, ...savedViews].slice(0, 12);
    setSavedViews(next);
    setActiveSavedViewId(nextView.id);
    window.localStorage.setItem(ORDERS_SAVED_VIEWS_KEY, JSON.stringify(next));
    setViewName("");
    setSaveViewOpen(false);
    toast.success(`“${nextView.name}” görünümü kaydedildi.`);
  };
  const applySavedView = (id: string) => {
    setActiveSavedViewId(id);
    const next = savedViews.find((item) => item.id === id);
    if (!next) return;
    setStatusFilter(next.statusFilter);
    setPaymentFilter(next.paymentFilter);
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
    window.localStorage.setItem(ORDERS_SAVED_VIEWS_KEY, JSON.stringify(next));
  };

  const searchProducts = async (value: string) => { setProductQuery(value); if (value.trim().length < 2) { setProducts([]); return; } setSearchingProducts(true); try { const result = await adminRequest<{ products?: Product[] }>(`/api/products?q=${encodeURIComponent(value.trim())}`); setProducts((result.products || []).slice(0, 12)); } catch { setProducts([]); } finally { setSearchingProducts(false); } };
  const addProduct = (product: Product, variant?: ProductVariant) => { const key = `${product.id}:${variant?.id || "standard"}`; const price = Number(variant?.price ?? product.price ?? 0); setDraftItems((current) => { const found = current.findIndex((item) => `${item.product_id}:${item.variant_id || "standard"}` === key); if (found >= 0) return current.map((item, index) => index === found ? normalizeItem({ ...item, quantity: item.quantity + 1 }) : item); return [...current, normalizeItem({ product_id: product.id, product_slug: product.slug, variant_id: variant?.id || null, product_name: product.name, variant_name: variant?.option_summary || null, quantity: 1, unit_price: price, total_price: price, image_url: variant?.image_url || product.main_image_url || null })]; }); setProductQuery(""); setProducts([]); };

  const saveOrder = async () => {
    if (!selected) return;
    if (reminderAt && new Date(reminderAt).getTime() <= Date.now()) { toast.error("Hatırlatma zamanı geçmiş olamaz."); return; }
    if (itemsDirty && !draftItems.length) { toast.error("Siparişte en az bir ürün olmalı."); return; }
    setBusy(`order:${selected.id}`);
    try {
      const patch: Record<string, unknown> = { id: selected.id, status: detailStatus, admin_override: true, notify_customer: notifyCustomer, status_reason: "Base44 sipariş detayından yönetici güncellemesi", admin_note: adminNote, reminder_note: reminderNote, reminder_at: reminderAt ? new Date(reminderAt).toISOString() : null };
      if (manualOrder(selected)) patch.payment_status = detailPayment;
      if (itemsDirty) patch.order_items = draftItems.map(normalizeItem);
      await adminRequest("/api/orders/manual-update", { method: "PATCH", body: JSON.stringify(patch) });
      const next = await load(true, true); const refreshed = next?.find((order) => order.id === selected.id); if (refreshed) { setSelected(refreshed); setFields(refreshed); }
      toast.success("Siparişin bütün operasyon bilgileri güncellendi.");
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Sipariş güncellenemedi."); }
    finally { setBusy(null); }
  };

  const createShipment = async (order: Order) => { setBusy(`shipping:${order.id}`); try { await adminRequest("/api/shipping/basit-kargo/shipments", { method: "POST", body: JSON.stringify({ orderId: order.id, handlerCode: "ECONOMIC", handlerName: "En Ekonomik (Otomatik)", quotedPrice: null, packages: [{ height: 1, width: 1, depth: 1, weight: 1 }], recipient: { city: order.shipping_city || "", town: order.shipping_town || "", address: shipmentAddressLine(order) } }) }); await load(true, true); toast.success("Kargo kodu oluşturuldu."); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Kargo oluşturulamadı."); } finally { setBusy(null); } };
  const openLabel = async (order: Order) => { setBusy(`label:${order.id}`); try { const headers = await adminAuthHeaders(); const response = await fetch(apiUrl(`/api/shipping/basit-kargo/shipments/${order.id}/label`), { headers }); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Etiket alınamadı."); const url = URL.createObjectURL(await response.blob()); window.open(url, "_blank", "noopener,noreferrer"); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Etiket alınamadı."); } finally { setBusy(null); } };
  const syncShipment = async (order: Order) => { setBusy(`sync:${order.id}`); try { await adminRequest(`/api/shipping/basit-kargo/shipments/${order.id}/sync`, { method: "POST", body: "{}" }); await load(true, true); toast.success("Kargo durumu güncellendi."); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Kargo güncellenemedi."); } finally { setBusy(null); } };
  const sendReview = async (order: Order) => { setBusy(`review:${order.id}`); try { await adminRequest("/api/review-automation/send", { method: "POST", body: JSON.stringify({ orderId: order.id, force: true }) }); await load(true, true); toast.success("Değerlendirme e-postası gönderildi."); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "E-posta gönderilemedi."); } finally { setBusy(null); } };

  const allColumns: ExactColumn<Order>[] = [
    { key: "order_no", label: "Sipariş", sortable: true, render: (order) => <div><p className="font-semibold text-main">#{order.order_no}</p><p className="text-[10px] text-subtle">{relative(order.created_at)}</p></div> },
    { key: "customer_name", label: "Müşteri", sortable: true, render: (order) => <div className="flex items-center gap-2"><ExactAvatar name={order.customer_name || "?"} size="xs" /><div><p className="text-sm font-medium text-main">{order.customer_name}</p><p className="text-[10px] text-subtle">{order.customer_email || order.customer_phone || "—"}</p></div></div> },
    { key: "total_amount", label: "Toplam", sortable: true, align: "right", render: (order) => <span className="font-semibold text-main">{money(order.total_amount, order.currency)}</span> },
    { key: "payment_status", label: "Ödeme", render: (order) => <ExactStatusBadge status={order.payment_status} label={paymentLabel(order.payment_status)} size="sm" /> },
    { key: "status", label: "Durum", render: (order) => <ExactStatusBadge status={order.status} label={statusLabel(order.status)} size="sm" /> },
    { key: "cargo_tracking_no", label: "Kargo", render: (order) => <span className="text-xs text-muted">{order.cargo_tracking_no || order.basit_kargo_barcode || "—"}</span> },
  ];
  const columns = allColumns.filter((column) => columnVisibility[String(column.key) as OrderColumnKey]);

  const payment = selected?.paymentSummary || null;
  const pricing = selected?.pricing || null;

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="orders-v2">
    <ExactPageHeader title="Siparişler" subtitle={`${visible.length} sipariş · bütün ödeme, müşteri, kargo ve operasyon ayrıntıları`} actions={<div className="flex flex-wrap items-center justify-end gap-2"><ExactButton variant="secondary" size="sm" onClick={toggleSelectionMode}>{selectionMode ? <X className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}{selectionMode ? "Seçimi Kapat" : "Toplu Seçim"}</ExactButton><Link href="/orders/new"><ExactButton size="sm"><Plus className="h-4 w-4" /> Manuel Sipariş</ExactButton></Link><ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void refreshOrders()} loading={refreshing} disabled={loading} /></div>} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><button type="button" onClick={() => setStatusFilter(statusFilter === "new" ? "all" : "new")}><ExactMetricCard label="Yeni Sipariş" value={metrics.newOrders} icon={ShoppingBag} className={statusFilter === "new" ? "ring-2 ring-accent" : ""} /></button><button type="button" onClick={() => setStatusFilter(statusFilter === "preparing" ? "all" : "preparing")}><ExactMetricCard label="Hazırlanıyor" value={metrics.preparing} icon={PackageCheck} className={statusFilter === "preparing" ? "ring-2 ring-accent" : ""} /></button><button type="button" onClick={() => setStatusFilter(statusFilter === "ready" ? "all" : "ready")}><ExactMetricCard label="Kargoya Hazır" value={metrics.ready} icon={Truck} className={statusFilter === "ready" ? "ring-2 ring-accent" : ""} /></button><button type="button" onClick={() => setStatusFilter(statusFilter === "attention" ? "all" : "attention")}><ExactMetricCard label="Kontrol Gerekli" value={metrics.attention} icon={AlertTriangle} className={statusFilter === "attention" ? "ring-2 ring-accent" : ""} /></button></div>
    <section className="space-y-3 rounded-[var(--radius-card)] bg-surface-primary p-3 shadow-card md:p-4">
      <ExactSearchInput value={query} onChange={setQuery} placeholder="Sipariş no, müşteri, telefon, takip no veya barkod..." />
      <ExactFilterBar chips={[{ key: "status", label: "Tüm Durumlar", value: statusFilter === "all" ? null : statusFilter, options: [{ label: "Yeni", value: "new" }, { label: "Hazırlanıyor", value: "preparing" }, { label: "Kargoya hazır", value: "ready" }, { label: "Gönderildi", value: "shipped" }, { label: "Teslim edildi", value: "delivered" }, { label: "İşlem gerekli", value: "attention" }] }, { key: "payment", label: "Tüm Ödemeler", value: paymentFilter === "all" ? null : paymentFilter, options: [{ label: "Ödendi", value: "paid" }, { label: "Bekliyor", value: "waiting" }, { label: "Başarısız", value: "failed" }] }]} onChipChange={(key, value) => key === "status" ? setStatusFilter((value || "all") as StatusFilter) : setPaymentFilter((value || "all") as PaymentFilter)} />
      {activeFilterChips.length ? <div className="flex flex-wrap items-center gap-2" aria-label="Aktif sipariş filtreleri">{activeFilterChips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-secondary px-3 text-[11px] font-medium text-main"><span>{chip.label}</span><X className="h-3.5 w-3.5 text-muted" /></button>)}<button type="button" onClick={clearListFilters} className="min-h-9 px-2 text-[11px] font-semibold text-accent">Tümünü temizle</button></div> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <div className="flex flex-wrap items-center gap-2"><select value={activeSavedViewId} onChange={(event) => applySavedView(event.target.value)} className="h-10 min-w-[180px] rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs text-main" aria-label="Kaydedilmiş sipariş görünümü"><option value="">Kaydedilmiş görünümler</option>{savedViews.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{activeSavedViewId ? <ExactIconButton icon={Trash2} label="Görünümü sil" variant="ghost" size="icon-sm" onClick={deleteSavedView} /> : null}{!saveViewOpen ? <ExactButton variant="secondary" size="sm" onClick={() => setSaveViewOpen(true)}><BookmarkPlus className="h-4 w-4" /> Görünümü Kaydet</ExactButton> : <div className="flex flex-wrap items-center gap-2"><input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="Görünüm adı" className="h-10 min-w-[170px] rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs text-main outline-none" autoFocus /><ExactButton size="sm" onClick={saveCurrentView}>Kaydet</ExactButton><ExactButton variant="secondary" size="sm" onClick={() => { setSaveViewOpen(false); setViewName(""); }}>Vazgeç</ExactButton></div>}</div>
        <div className="flex flex-wrap items-center gap-2"><ExactSegmentedControl value={density} onChange={(value) => setDensity(value as ExactDataTableDensity)} options={[{ value: "normal", label: "Normal" }, { value: "compact", label: "Kompakt" }]} size="sm" /><ExactButton variant="secondary" size="sm" onClick={() => setColumnsOpen((current) => !current)}><Columns3 className="h-4 w-4" /> Sütunlar</ExactButton><span className="text-[11px] text-muted">{visible.length} sonuç · {orders.length} toplam</span></div>
      </div>
      {columnsOpen ? <div className="flex flex-wrap gap-2 rounded-xl bg-surface-secondary p-2.5">{(Object.keys(DEFAULT_ORDER_COLUMNS) as OrderColumnKey[]).map((key) => { const labels: Record<OrderColumnKey, string> = { order_no: "Sipariş", customer_name: "Müşteri", total_amount: "Toplam", payment_status: "Ödeme", status: "Durum", cargo_tracking_no: "Kargo" }; return <button key={key} type="button" aria-pressed={columnVisibility[key]} onClick={() => setColumnVisibility((current) => ({ ...current, [key]: !current[key] }))} className={`min-h-9 rounded-lg border px-3 text-xs font-medium ${columnVisibility[key] ? "border-accent bg-accent-soft text-accent" : "border-border-subtle bg-surface-primary text-muted"}`}><Check className={`mr-1 inline h-3.5 w-3.5 ${columnVisibility[key] ? "opacity-100" : "opacity-0"}`} />{labels[key]}</button>; })}</div> : null}
    </section>
    {selectionMode ? <section className="sticky top-16 z-20 rounded-[var(--radius-card)] border border-accent/30 bg-surface-primary p-3 shadow-floating"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><select value={selectionScope} onChange={(event) => setSelectionScope(event.target.value as OrderSelectionScope)} className="h-11 rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs font-medium text-main" aria-label="Sipariş seçim kapsamı"><option value="page">Görünen siparişler ({renderedOrders.length})</option><option value="filtered">Filtre sonucu ({visible.length})</option><option value="all">Tüm siparişler ({orders.length})</option></select><span className="text-xs font-semibold text-main">{selectedIds.size} sipariş seçili</span><span className="text-[11px] text-muted">Checkbox seçimi satırı açmaktan bağımsızdır.</span></div>{selectedIds.size ? <ExactButton variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>Seçimi Temizle</ExactButton> : null}</div></section> : null}
    {loading ? <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div> : <ExactDataTable columns={columns} data={renderedOrders} density={density} sortState={{ key: sortKey, direction: sortDirection, dataIsPreSorted: true, onChange: (key, direction) => { const nextKey = orderSortKeyValue(key); if (!nextKey) return; setSortKey(nextKey); setSortDirection(direction); setPage(1); } }} selection={selectionMode ? { selectedIds, onToggleRow: toggleOrderSelection, onToggleAll: toggleScopeSelection, allSelected: allScopeSelected, someSelected: someScopeSelected, label: "Seçim kapsamındaki siparişleri seç" } : undefined} onRowClick={openDetail} emptyState={<ExactEmptyState icon={ShoppingBag} title="Bu filtrede sipariş yok" />} mobileCard={(order) => <button type="button" onClick={() => openDetail(order)} className="w-full min-h-11 bg-surface-primary p-3.5 text-left radius-card shadow-card"><div className="mb-2 flex items-center justify-between"><div><p className="text-sm font-semibold text-main">#{order.order_no}</p><p className="text-[11px] text-muted">{order.customer_name}</p></div><strong className="text-sm text-main">{money(order.total_amount, order.currency)}</strong></div><div className="flex flex-wrap gap-1.5"><ExactStatusBadge status={order.payment_status} label={paymentLabel(order.payment_status)} size="sm" /><ExactStatusBadge status={order.status} label={statusLabel(order.status)} size="sm" /></div><p className="mt-2 text-[10px] text-subtle">{relative(order.created_at)} · {itemCount(order)} ürün</p></button>} />}
    {!loading && pageCount > 1 ? <nav className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-primary p-3 shadow-card" aria-label="Sipariş sayfaları"><span className="text-xs text-muted">Sayfa {page} / {pageCount} · {visible.length} sipariş</span><div className="flex gap-2"><ExactButton variant="secondary" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /> Önceki</ExactButton><ExactButton variant="secondary" size="sm" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Sonraki <ChevronRight className="h-4 w-4" /></ExactButton></div></nav> : null}

    <ExactDetailDrawer open={Boolean(selected)} onClose={requestCloseDetail} dismissalPolicy={detailDirty ? "protected-action" : "light-dismiss"} title={selected ? `Sipariş #${selected.order_no}` : "Sipariş"} subtitle={selected ? `${selected.customer_name} · ${dateTime(selected.created_at)}` : undefined} width={860} footer={selected ? <div className="flex gap-2"><ExactButton variant="secondary" size="sm" className="flex-1" onClick={requestCloseDetail}>Kapat</ExactButton><ExactButton size="sm" className="flex-1" onClick={() => void saveOrder()} loading={busy === `order:${selected.id}`}><Save className="h-4 w-4" /> Değişiklikleri Kaydet</ExactButton></div> : null}>
      {selected ? <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5"><CopyKeyValue label="Sipariş No" value={selected.order_no} mono /><KeyValue label="Sipariş Toplamı" value={money(selected.total_amount, selected.currency)} /><KeyValue label="Ödeme" value={<ExactStatusBadge status={selected.payment_status} label={paymentLabel(selected.payment_status)} size="sm" />} /><KeyValue label="Sipariş Durumu" value={<ExactStatusBadge status={selected.status} label={statusLabel(selected.status)} size="sm" />} /><KeyValue label="Ürün Adedi" value={itemCount(selected)} /></div>

        <ExactDataCard title="Operasyon Durumu" action={<PackageCheck className="h-4 w-4 text-accent" />}><div className="grid gap-3 sm:grid-cols-2"><ExactField label="Sipariş durumu"><select value={detailStatus} onChange={(event) => setDetailStatus(event.target.value)} className={exactFormInputClass}>{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></ExactField>{manualOrder(selected) ? <ExactField label="Manuel ödeme durumu"><select value={detailPayment} onChange={(event) => setDetailPayment(event.target.value)} className={exactFormInputClass}>{paymentOptions.map((value) => <option key={value} value={value}>{paymentLabel(value)}</option>)}</select></ExactField> : <KeyValue label="Fulfillment" value={selected.fulfillment_status || "—"} />}</div><label className="mt-3 flex min-h-11 items-center gap-2 text-xs text-muted"><input type="checkbox" checked={notifyCustomer} onChange={(event) => setNotifyCustomer(event.target.checked)} /> Durum değişikliğini müşteriye e-posta ile bildir</label></ExactDataCard>

        <ExactDataCard title="Fiyat ve İndirim Kırılımı" action={<BadgeDollarSign className="h-4 w-4 text-accent" />}><div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><KeyValue label="Ara Toplam" value={pricing?.subtotal ? minorMoney(pricing.subtotal.amountMinor, pricing.subtotal.currency || selected.currency) : money(Number(selected.subtotal || 0), selected.currency)} /><KeyValue label="İndirim" value={pricing?.discount ? minorMoney(pricing.discount.amountMinor, pricing.discount.currency || selected.currency) : money(Number(selected.discount_total || 0), selected.currency)} /><KeyValue label="Ruthie Points" value={pricing?.pointsDiscount ? minorMoney(pricing.pointsDiscount.amountMinor, pricing.pointsDiscount.currency || selected.currency) : money(Number(selected.reward_discount_total || 0), selected.currency)} /><KeyValue label="Kargo" value={pricing?.shipping ? minorMoney(pricing.shipping.amountMinor, pricing.shipping.currency || selected.currency) : money(Number(selected.shipping_fee || 0), selected.currency)} /><KeyValue label="Vergi" value={pricing?.tax ? minorMoney(pricing.tax.amountMinor, pricing.tax.currency || selected.currency) : money(Number(selected.tax_total || 0), selected.currency)} /><KeyValue label="Genel Toplam" value={pricing?.total ? minorMoney(pricing.total.amountMinor, pricing.total.currency || selected.currency) : money(selected.total_amount, selected.currency)} /></div>{pricing?.calculationId ? <p className="mt-3 break-all font-mono text-[9px] text-subtle">Hesaplama: {pricing.calculationId}</p> : null}</ExactDataCard>

        <ExactDataCard title="Ödeme Detayları" action={<WalletCards className="h-4 w-4 text-accent" />}><div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><KeyValue label="Sağlayıcı" value={payment?.provider || "legacy"} /><KeyValue label="Yöntem" value={payment?.method || (manualOrder(selected) ? "Manuel" : "Kart")} /><KeyValue label="Tahsil Edilen" value={payment?.chargedAmountMinor != null ? minorMoney(payment.chargedAmountMinor, selected.currency) : money(selected.total_amount, selected.currency)} /><KeyValue label="Taksit" value={Number(payment?.installmentCount || 0) > 1 ? `${payment?.installmentCount} taksit` : "Tek çekim"} /><KeyValue label="Taksit Farkı" value={payment?.installmentFeeMinor ? minorMoney(payment.installmentFeeMinor, selected.currency) : money(0, selected.currency)} /><KeyValue label="Kart Programı" value={payment?.cardProgram || "—"} /><CopyKeyValue label="Sağlayıcı Referansı" value={payment?.providerReference} mono /><CopyKeyValue label="Quote ID" value={payment?.quoteId} mono /><KeyValue label="Ödeme Zamanı" value={dateTime(payment?.paidAt)} /></div>{payment?.fallbackReason ? <div className="mt-3 rounded-[var(--radius-small)] bg-warning-soft p-3 text-[10px] text-warning-foreground">Ödeme özeti fallback nedeni: {payment.fallbackReason}</div> : null}</ExactDataCard>

        <ExactDataCard title="Sipariş Ürünleri" action={<ExactButton variant="tertiary" size="sm" onClick={() => setEditingItems((value) => !value)}><Pencil className="h-3.5 w-3.5" /> {editingItems ? "Düzenlemeyi kapat" : "İçeriği düzenle"}</ExactButton>}><div className="space-y-2">{(editingItems ? draftItems : selected.order_items || []).map((item, index) => <div key={`${item.id || item.product_id}-${index}`} className="flex items-center gap-3 rounded-[var(--radius-small)] bg-surface-secondary p-2.5"><button type="button" onClick={() => item.image_url && setLightbox({ src: item.image_url, name: item.product_name })} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden bg-surface-tertiary radius-small md:h-12 md:w-12">{item.image_url ? <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-subtle" />}</button><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-main">{item.product_name}</p><p className="text-[10px] text-muted">{item.variant_name || "Standart"}</p></div>{editingItems ? <><input type="number" min="1" value={item.quantity} onChange={(event) => setDraftItems((current) => current.map((entry, itemIndex) => itemIndex === index ? normalizeItem({ ...entry, quantity: Number(event.target.value) }) : entry))} className="form-input w-16" /><input type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => setDraftItems((current) => current.map((entry, itemIndex) => itemIndex === index ? normalizeItem({ ...entry, unit_price: Number(event.target.value) }) : entry))} className="form-input w-24" /><ExactIconButton icon={Trash2} label="Ürünü sil" variant="ghost" size="icon-sm" onClick={() => setDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} /></> : <div className="text-right"><p className="text-sm font-semibold text-main">{money(item.total_price, selected.currency)}</p><p className="text-[10px] text-muted">{item.quantity} adet · {money(item.unit_price, selected.currency)}</p></div>}</div>)}</div>{editingItems ? <div className="relative mt-3"><ExactSearchInput value={productQuery} onChange={(value) => void searchProducts(value)} placeholder="Ürün veya varyant ekle..." />{searchingProducts ? <ExactSkeleton className="mt-2 h-10" /> : null}{products.length ? <div className="absolute inset-x-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-control)] border border-border-subtle bg-surface-primary shadow-floating">{products.map((product) => <div key={product.id} className="border-b border-border-subtle last:border-0"><button type="button" onClick={() => product.product_variants?.length ? undefined : addProduct(product)} className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-secondary"><span className="flex-1 text-sm font-medium text-main">{product.name}</span><span className="text-xs text-muted">{money(product.price, product.currency)}</span>{!product.product_variants?.length ? <Plus className="h-4 w-4 text-accent" /> : null}</button>{product.product_variants?.filter((variant) => variant.is_active !== false).map((variant) => <button key={variant.id} type="button" onClick={() => addProduct(product, variant)} className="flex min-h-11 w-full items-center gap-3 py-2 pl-7 pr-3 text-left hover:bg-accent-soft"><span className="flex-1 text-xs text-muted">{variant.option_summary}</span><span className="text-xs text-main">{money(variant.price, product.currency)}</span><Plus className="h-3.5 w-3.5 text-accent" /></button>)}</div>)}</div> : null}</div> : null}</ExactDataCard>

        <div className="grid gap-3 lg:grid-cols-2"><ExactDataCard title="Müşteri" action={<UserRound className="h-4 w-4 text-accent" />}><div className="flex items-center gap-3"><ExactAvatar name={selected.customer_name || "?"} size="md" /><div className="min-w-0"><p className="text-sm font-semibold text-main">{selected.customer_name}</p><p className="text-[11px] text-muted">{selected.customer_email || "E-posta yok"}</p><p className="text-[11px] text-muted">{selected.customer_phone || "Telefon yok"}</p></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><CopyKeyValue label="E-posta" value={selected.customer_email} /><CopyKeyValue label="Telefon" value={selected.customer_phone} /><CopyKeyValue label="Profile ID" value={selected.profile_id} mono /><KeyValue label="Müşteri Notu" value={selected.customer_note || "—"} /></div></ExactDataCard><ExactDataCard title="Teslimat Adresi" action={<MapPin className="h-4 w-4 text-accent" />}><p className="text-sm leading-relaxed text-main">{address(selected)}</p><div className="mt-3 grid grid-cols-2 gap-2"><KeyValue label="Alıcı" value={recipientName(selected)} /><CopyKeyValue label="Adres ID" value={selected.shipping_address_id} mono /></div></ExactDataCard></div>

        <ExactDataCard title="Kargo ve Teslimat" action={<Truck className="h-4 w-4 text-accent" />}><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><KeyValue label="Sağlayıcı" value={selected.shipping_provider || selected.cargo_company || "—"} /><KeyValue label="Kargo Durumu" value={selected.shipping_status || "—"} /><KeyValue label="Handler" value={selected.basit_kargo_handler_code || "—"} /><KeyValue label="Kargo Ücreti" value={money(Number(selected.shipping_price || selected.shipping_fee || 0), selected.currency)} /><CopyKeyValue label="Takip No" value={selected.cargo_tracking_no} mono /><CopyKeyValue label="Barkod" value={selected.basit_kargo_barcode} mono /><CopyKeyValue label="Ters Kargo" value={selected.basit_kargo_return_barcode} mono /><KeyValue label="Teslim Zamanı" value={dateTime(selected.delivered_at)} /></div>{selected.shipping_error ? <div className="mt-3 rounded-[var(--radius-small)] bg-danger-soft p-3 text-xs text-danger-foreground">{selected.shipping_error}</div> : null}<div className="mt-3 flex flex-wrap gap-2">{!shipmentExists(selected) ? <ExactButton size="sm" onClick={() => void createShipment(selected)} loading={busy === `shipping:${selected.id}`}><Truck className="h-4 w-4" /> Kargo Kodu Oluştur</ExactButton> : <><ExactButton variant="secondary" size="sm" onClick={() => void openLabel(selected)} loading={busy === `label:${selected.id}`}><Printer className="h-4 w-4" /> Etiket</ExactButton><ExactButton variant="secondary" size="sm" onClick={() => void syncShipment(selected)} loading={busy === `sync:${selected.id}`}><RefreshCw className="h-4 w-4" /> Kargoyu Güncelle</ExactButton></>}{selected.cargo_tracking_url ? <a href={selected.cargo_tracking_url} target="_blank" rel="noreferrer"><ExactButton variant="tertiary" size="sm"><ExternalLink className="h-4 w-4" /> Kargoyu Aç</ExactButton></a> : null}</div></ExactDataCard>

        <ExactDataCard title="Trafik ve Satın Alma Yolculuğu" action={<Activity className="h-4 w-4 text-accent" />}><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><KeyValue label="Kaynak" value={sourceLabel(selected.traffic_source)} /><KeyValue label="Medium" value={selected.traffic_medium || "—"} /><KeyValue label="Kampanya" value={selected.traffic_campaign || "—"} /><KeyValue label="Referrer" value={selected.traffic_referrer || "—"} /><KeyValue label="Satın Alma Oturumu" value={selected.purchase_session_number || selected.session_count_before_purchase || "—"} /><KeyValue label="Toplam Oturum" value={selected.session_count_before_purchase || "—"} /><KeyValue label="Toplam Süre" value={duration(selected.total_session_duration_seconds)} /><KeyValue label="Satın Alma Süresi" value={duration(selected.purchase_session_duration_seconds)} /><CopyKeyValue label="Visitor ID" value={selected.visitor_id} mono /><CopyKeyValue label="Session ID" value={selected.purchase_session_id} mono /></div>{selected.attribution_data && Object.keys(selected.attribution_data).length ? <details className="mt-3 rounded-[var(--radius-small)] bg-surface-secondary p-3"><summary className="cursor-pointer text-xs font-semibold text-main">Ham attribution verisi</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[9px] text-muted">{JSON.stringify(selected.attribution_data, null, 2)}</pre></details> : null}</ExactDataCard>

        <div className="grid gap-3 lg:grid-cols-2"><ExactDataCard title="Not ve Hatırlatma" action={<ClipboardList className="h-4 w-4 text-accent" />}><div className="space-y-3"><ExactField label="Admin notu"><textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} className={`${exactFormInputClass} min-h-24`} /></ExactField><ExactField label="Hatırlatma notu"><input value={reminderNote} onChange={(event) => setReminderNote(event.target.value)} className={exactFormInputClass} /></ExactField><ExactField label="Hatırlatma zamanı"><input type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} className={exactFormInputClass} /></ExactField></div></ExactDataCard><ExactDataCard title="E-posta ve Sistem Kayıtları" action={<Mail className="h-4 w-4 text-accent" />}><div className="grid grid-cols-2 gap-2"><KeyValue label="Değerlendirme Maili" value={selected.review_email_status || "Gönderilmedi"} /><KeyValue label="Gönderim Zamanı" value={dateTime(selected.review_email_sent_at)} /><KeyValue label="Kaynak Sistem" value={selected.imported_source || "commerce-v2"} /><KeyValue label="State Version" value={selected.state_version ?? "—"} /><KeyValue label="İptal Zamanı" value={dateTime(selected.cancelled_at)} /><KeyValue label="Oluşturma" value={dateTime(selected.created_at)} /></div>{selected.review_email_error_message ? <p className="mt-3 rounded-[var(--radius-small)] bg-danger-soft p-3 text-[10px] text-danger-foreground">{selected.review_email_error_message}</p> : null}<ExactButton className="mt-3 w-full" variant="secondary" size="sm" onClick={() => void sendReview(selected)} loading={busy === `review:${selected.id}`}><Send className="h-4 w-4" /> Değerlendirme Maili Gönder</ExactButton></ExactDataCard></div>

        <ExactDataCard title="Hızlı Operasyonlar" action={<CalendarClock className="h-4 w-4 text-accent" />}><div className="grid grid-cols-2 gap-2"><Link href={`/production?order=${selected.id}`}><ExactButton variant="secondary" size="sm" className="w-full">Üretime Git <ArrowRight className="h-3.5 w-3.5" /></ExactButton></Link><Link href={`/packaging?order=${selected.id}`}><ExactButton variant="secondary" size="sm" className="w-full">Paketlemeye Git <ArrowRight className="h-3.5 w-3.5" /></ExactButton></Link><Link href={`/shipping?order=${selected.id}`}><ExactButton variant="secondary" size="sm" className="w-full">Kargoya Git <ArrowRight className="h-3.5 w-3.5" /></ExactButton></Link><Link href={`/returns?order=${selected.id}`}><ExactButton variant="secondary" size="sm" className="w-full">İade / Değişim <RotateCcw className="h-3.5 w-3.5" /></ExactButton></Link><Link href={`/orders/${selected.id}/timeline`} className="col-span-2"><ExactButton variant="secondary" size="sm" className="w-full">Kayıt Zincirini Aç <ExternalLink className="h-3.5 w-3.5" /></ExactButton></Link></div></ExactDataCard>
      </div> : null}
    </ExactDetailDrawer>

    <ExactFormModal
      open={Boolean(dirtyCloseOrigin && selected)}
      onClose={() => setDirtyCloseOrigin(null)}
      dismissalPolicy="protected-action"
      title="Kaydedilmemiş değişiklikler"
      subtitle={selected ? `Sipariş #${selected.order_no}` : undefined}
      size="sm"
      footer={<div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2"><ExactButton variant="secondary" size="sm" className="w-full" onClick={() => setDirtyCloseOrigin(null)}>Düzenlemeye devam et</ExactButton><ExactButton variant="destructive" size="sm" className="w-full" onClick={discardAndClose}>Değişiklikleri sil</ExactButton></div>}
    >
      <div className="rounded-[var(--radius-small)] border border-warning/25 bg-warning-soft p-4"><p className="text-sm font-semibold text-main">Bu siparişte kaydedilmemiş değişiklikler var.</p><p className="mt-1 text-xs leading-5 text-muted">Değişiklikleri silersen bu ekrandaki düzenlemeler kaydedilmeden kapanır. Düzenlemeye devam edip “Değişiklikleri Kaydet” seçeneğini kullanabilirsin.</p></div>
    </ExactFormModal>

    <ExactFormModal open={Boolean(lightbox)} onClose={() => setLightbox(null)} dismissalPolicy="light-dismiss" title={lightbox?.name || "Ürün Görseli"} size="lg" footer={<ExactButton variant="secondary" size="sm" onClick={() => setLightbox(null)}>Kapat</ExactButton>}>{lightbox ? <img src={lightbox.src} alt={lightbox.name} className="mx-auto max-h-[70vh] max-w-full rounded-[var(--radius-card)] object-contain" /> : null}</ExactFormModal>
  </div>;
}