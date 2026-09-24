"use client";

import Link from "next/link";
import {
  BookmarkPlus,
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Edit3,
  LayoutGrid,
  List,
  ListChecks,
  MoreHorizontal,
  Package,
  PackagePlus,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { adminRequest, seedAdminApiCache } from "@/lib/adminApi";
import {
  ExactButton,
  ExactFilterBar,
  ExactIconButton,
  ExactPageHeader,
  ExactSearchInput,
  ExactSegmentedControl,
  ExactSkeleton,
  ExactStatusBadge,
  useExactToast,
} from "./primitives";

type Group = { id: string; name: string; slug: string };
type Variant = {
  id?: string;
  option_summary?: string;
  price?: string | number;
  stock?: string | number;
  stock_status?: string;
  image_url?: string | null;
  image_urls?: string[];
};
type DiscountPricing = {
  productId: string;
  originalPrice: number;
  discountedPrice: number;
  discountAmount: number;
  discountPercentage: number;
  hasDiscount: boolean;
  rules: Array<{ id: string; name: string }>;
};
type Product = {
  id: string;
  name: string;
  slug: string;
  price: number;
  currency?: string;
  material?: string | null;
  finish_color?: string | null;
  size_usage?: string | null;
  care_advice?: string | null;
  is_featured?: boolean | null;
  is_new?: boolean | null;
  main_image_url?: string | null;
  image_urls?: string[];
  stock_status?: string;
  status: string;
  is_bundle?: boolean | null;
  product_type?: string | null;
  product_variants?: Variant[];
  collection_list?: Group[];
  discount_pricing?: DiscountPricing | null;
};
type ProductPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};
type ProductsResponse = {
  products?: Product[];
  collections?: Group[];
  categories?: Group[];
  materials?: string[];
  pricing?: DiscountPricing[];
  pagination?: ProductPagination | null;
};
type BulkField =
  | "finish_color"
  | "size_usage"
  | "care_advice"
  | "material"
  | "stock_status"
  | "status"
  | "is_featured"
  | "is_new"
  | "price_set"
  | "price_increase_percent"
  | "price_decrease_percent"
  | "price_increase_amount"
  | "price_decrease_amount"
  | "discount_percent"
  | "discount_remove"
  | "stock_set_total"
  | "stock_increase_total"
  | "stock_decrease_total"
  | "stock_set_each_variant"
  | "stock_increase_each_variant"
  | "stock_decrease_each_variant"
  | "category_add"
  | "category_remove"
  | "collection_add"
  | "collection_remove";
type BulkAction = { id: string; field: BulkField; value: string };
type BulkProgress = {
  total: number;
  processed: number;
  percent: number;
  state: "queued" | "running" | "succeeded" | "failed";
};
type BulkUpdateResponse = {
  updated?: number;
  warning?: string | null;
  queued?: boolean;
  jobId?: string;
  status?: string;
  progress?: BulkProgress;
  lastError?: string | null;
};
type ProductDensity = "normal" | "compact";
type SelectionScope = "page" | "filtered" | "all";
type ProductSort = "default" | "name-asc" | "name-desc" | "price-asc" | "price-desc" | "stock-asc" | "stock-desc";
type ProductColumn = "material" | "collections" | "status" | "stock" | "price";
type ColumnVisibility = Record<ProductColumn, boolean>;
type SavedProductView = {
  id: string;
  name: string;
  search: string;
  collection: string | null;
  material: string | null;
  status: string | null;
  sort: ProductSort;
  view: "grid" | "list";
  density: ProductDensity;
  columns: ColumnVisibility;
};
type ProductListContext = Omit<SavedProductView, "id" | "name"> & {
  page: number;
  scrollY: number;
};

const MOBILE_PRODUCT_BATCH = 24;
const DESKTOP_PAGE_SIZE = 48;
const PRODUCT_API_PAGE_SIZE = 25;
const PRODUCTS_CONTEXT_KEY = "rosta-products-resource-context-v1";
const PRODUCTS_SAVED_VIEWS_KEY = "rosta-products-saved-views-v1";
const DEFAULT_FINISHES = ["Açık Kavrum", "Orta Kavrum", "Koyu Kavrum", "Espresso Kavrum"];
const STANDARD_CARE_VALUE = "Serin, kuru ve güneş almayan bir yerde; paketi hava almayacak şekilde kapalı saklayın.";
const ADJUSTABLE_RING_VALUE = "250 g paket";
const NECKLACE_SIZE_GUIDE_VALUE = "500 g paket";
const DEFAULT_COLUMNS: ColumnVisibility = {
  material: true,
  collections: true,
  status: true,
  stock: true,
  price: true,
};
const BULK_FIELDS: Array<{ value: BulkField; label: string }> = [
  { value: "finish_color", label: "Kavrum Profili" },
  { value: "size_usage", label: "Paket / Gramaj" },
  { value: "care_advice", label: "Saklama / Demleme" },
  { value: "material", label: "Kahve Türü" },
  { value: "stock_status", label: "Stok Durumu" },
  { value: "status", label: "Yayın Durumu" },
  { value: "is_featured", label: "Öne Çıkarılan Ürün" },
  { value: "is_new", label: "Yeni Ürün Etiketi" },
  { value: "price_set", label: "Fiyatı Belirle" },
  { value: "price_increase_percent", label: "Fiyatı % Artır" },
  { value: "price_decrease_percent", label: "Fiyatı % Azalt" },
  { value: "price_increase_amount", label: "Fiyata Tutar Ekle" },
  { value: "price_decrease_amount", label: "Fiyattan Tutar Çıkar" },
  { value: "discount_percent", label: "Yüzde İndirim Uygula" },
  { value: "discount_remove", label: "İndirimi Kaldır" },
  { value: "stock_set_total", label: "Toplam Stoğu Belirle" },
  { value: "stock_increase_total", label: "Toplam Stoğu Artır" },
  { value: "stock_decrease_total", label: "Toplam Stoğu Azalt" },
  { value: "stock_set_each_variant", label: "Her Varyant Stoğunu Belirle" },
  { value: "stock_increase_each_variant", label: "Her Varyant Stoğunu Artır" },
  { value: "stock_decrease_each_variant", label: "Her Varyant Stoğunu Azalt" },
  { value: "category_add", label: "Kategori Ekle" },
  { value: "category_remove", label: "Kategori Kaldır" },
  { value: "collection_add", label: "Koleksiyon Ekle" },
  { value: "collection_remove", label: "Koleksiyon Kaldır" },
];
const NUMERIC_BULK_FIELDS = new Set<BulkField>([
  "price_set",
  "price_increase_percent",
  "price_decrease_percent",
  "price_increase_amount",
  "price_decrease_amount",
  "discount_percent",
  "stock_set_total",
  "stock_increase_total",
  "stock_decrease_total",
  "stock_set_each_variant",
  "stock_increase_each_variant",
  "stock_decrease_each_variant",
]);
const INTEGER_BULK_FIELDS = new Set<BulkField>([
  "stock_set_total",
  "stock_increase_total",
  "stock_decrease_total",
  "stock_set_each_variant",
  "stock_increase_each_variant",
  "stock_decrease_each_variant",
]);
const STATUS_LABELS: Record<string, string> = {
  active: "Aktif",
  draft: "Taslak",
  archived: "Arşiv",
};
const SORT_LABELS: Record<ProductSort, string> = {
  default: "Varsayılan sıra",
  "name-asc": "İsim A–Z",
  "name-desc": "İsim Z–A",
  "price-asc": "Fiyat artan",
  "price-desc": "Fiyat azalan",
  "stock-asc": "Stok artan",
  "stock-desc": "Stok azalan",
};

function money(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function stockCount(product: Product) {
  const variants = product.product_variants || [];
  if (!variants.length) return product.stock_status === "in_stock" ? 1 : 0;
  return variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock || 0)), 0);
}

function productImage(product: Product) {
  return product.main_image_url
    || product.image_urls?.[0]
    || product.product_variants?.find((variant) => variant.image_url)?.image_url
    || "";
}

function mergeProductPages(current: Product[], incoming: Product[]) {
  const incomingById = new Map(incoming.map((product) => [String(product.id), product] as const));
  const merged = current.map((product) => incomingById.get(String(product.id)) || product);
  const knownIds = new Set(current.map((product) => String(product.id)));
  for (const product of incoming) {
    if (!knownIds.has(String(product.id))) merged.push(product);
  }
  return merged;
}

function seedProgressiveProductCache(catalog: ProductsResponse, products: Product[], pagination: ProductPagination | null | undefined) {
  seedAdminApiCache("/api/products?q=", {
    ok: true,
    products,
    categories: catalog.categories || [],
    collections: catalog.collections || [],
    pagination: pagination || null,
  }, { ttlMs: 60_000, staleMs: 2 * 60 * 60_000 });
  seedAdminApiCache("/api/products/discount-pricing", {
    ok: true,
    pricing: products.map((product) => product.discount_pricing).filter(Boolean),
  }, { ttlMs: 60_000, staleMs: 2 * 60 * 60_000 });
}
function collectionNames(product: Product) {
  return (product.collection_list || []).map((group) => group.name);
}

function isBundle(product: Product) {
  return Boolean(product.is_bundle || product.product_type === "bundle");
}

function normalizeColumns(value: unknown): ColumnVisibility {
  const raw = value && typeof value === "object" ? value as Partial<ColumnVisibility> : {};
  return {
    material: raw.material !== false,
    collections: raw.collections !== false,
    status: raw.status !== false,
    stock: raw.stock !== false,
    price: raw.price !== false,
  };
}

function readProductContext(): ProductListContext | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(PRODUCTS_CONTEXT_KEY) || "null") as Partial<ProductListContext> | null;
    if (!parsed) return null;
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      collection: typeof parsed.collection === "string" ? parsed.collection : null,
      material: typeof parsed.material === "string" ? parsed.material : null,
      status: typeof parsed.status === "string" ? parsed.status : null,
      sort: typeof parsed.sort === "string" && Object.prototype.hasOwnProperty.call(SORT_LABELS, parsed.sort) ? parsed.sort as ProductSort : "default",
      view: parsed.view === "list" ? "list" : "grid",
      density: parsed.density === "compact" ? "compact" : "normal",
      columns: normalizeColumns(parsed.columns),
      page: Math.max(1, Number(parsed.page || 1)),
      scrollY: Math.max(0, Number(parsed.scrollY || 0)),
    };
  } catch {
    return null;
  }
}

function readSavedViews(): SavedProductView[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRODUCTS_SAVED_VIEWS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === "object" && typeof item.id === "string" && typeof item.name === "string")
      .slice(0, 12)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name).slice(0, 60),
        search: typeof item.search === "string" ? item.search : "",
        collection: typeof item.collection === "string" ? item.collection : null,
        material: typeof item.material === "string" ? item.material : null,
        status: typeof item.status === "string" ? item.status : null,
        sort: typeof item.sort === "string" && Object.prototype.hasOwnProperty.call(SORT_LABELS, item.sort) ? item.sort as ProductSort : "default",
        view: item.view === "list" ? "list" : "grid",
        density: item.density === "compact" ? "compact" : "normal",
        columns: normalizeColumns(item.columns),
      }));
  } catch {
    return [];
  }
}

function bulkFieldFamily(field: BulkField) {
  if (field.startsWith("price_")) return "price";
  if (field.startsWith("discount_")) return "discount";
  if (field.startsWith("stock_") && field !== "stock_status") return "stock-quantity";
  if (field.startsWith("category_")) return "category";
  if (field.startsWith("collection_")) return "collection";
  return field;
}

function isNumericBulkField(field: BulkField) {
  return NUMERIC_BULK_FIELDS.has(field);
}

function defaultBulkValue(field: BulkField, materials: string[], categories: Group[], collections: Group[]) {
  if (field === "finish_color") return DEFAULT_FINISHES[0];
  if (field === "size_usage") return NECKLACE_SIZE_GUIDE_VALUE;
  if (field === "care_advice") return STANDARD_CARE_VALUE;
  if (field === "material") return materials[0] || "Arabica";
  if (field === "stock_status") return "in_stock";
  if (field === "status") return "active";
  if (field === "discount_remove") return "remove";
  if (field.startsWith("category_")) return categories[0]?.id || "";
  if (field.startsWith("collection_")) return collections[0]?.id || "";
  if (INTEGER_BULK_FIELDS.has(field)) return "0";
  if (field === "price_set") return "0";
  if (field.includes("percent") || field === "discount_percent") return "10";
  if (field.includes("amount")) return "100";
  return "true";
}

function bulkValueOptions(field: BulkField, materials: string[], categories: Group[], collections: Group[]) {
  if (field === "finish_color") {
    return [
      ...DEFAULT_FINISHES.map((value) => ({ value, label: value })),
      { value: "", label: "Kavrum profilini kaldır" },
    ];
  }
  if (field === "size_usage") {
    return [
      { value: NECKLACE_SIZE_GUIDE_VALUE, label: "500 g paket" },
      { value: ADJUSTABLE_RING_VALUE, label: "250 g paket" },
      { value: "", label: "Paket bilgisini kaldır" },
    ];
  }
  if (field === "care_advice") {
    return [
      { value: STANDARD_CARE_VALUE, label: "Standart kahve saklama önerisi" },
      { value: "", label: "Saklama / demleme önerisini kaldır" },
    ];
  }
  if (field === "material") return materials.map((value) => ({ value, label: value }));
  if (field === "stock_status") {
    return [
      { value: "in_stock", label: "Stokta" },
      { value: "out_of_stock", label: "Stok yok" },
      { value: "preorder", label: "Ön sipariş" },
    ];
  }
  if (field === "status") {
    return [
      { value: "active", label: "Aktif" },
      { value: "draft", label: "Taslak" },
    ];
  }
  if (field.startsWith("category_")) return categories.map((item) => ({ value: item.id, label: item.name }));
  if (field.startsWith("collection_")) return collections.map((item) => ({ value: item.id, label: item.name }));
  return [
    { value: "true", label: "Açık" },
    { value: "false", label: "Kapalı" },
  ];
}

function nextBulkAction(actions: BulkAction[], materials: string[], categories: Group[], collections: Group[]): BulkAction | null {
  const usedFamilies = new Set(actions.map((action) => bulkFieldFamily(action.field)));
  const field = BULK_FIELDS.find((option) => !usedFamilies.has(bulkFieldFamily(option.value)))?.value;
  if (!field) return null;
  return {
    id: `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    field,
    value: defaultBulkValue(field, materials, categories, collections),
  };
}

function ProductPhoto({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false);
  const image = productImage(product);
  if (!image || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-tertiary text-subtle">
        <Package className="h-12 w-12 opacity-30" />
      </div>
    );
  }
  return (
    <img
      src={image}
      alt={product.name}
      className="h-full w-full object-cover"
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      onError={() => setFailed(true)}
    />
  );
}

function ProductPrice({ product, align = "left" }: { product: Product; align?: "left" | "right" }) {
  const pricing = product.discount_pricing;
  if (!pricing?.hasDiscount) {
    return <span className="text-sm font-bold text-main">{money(product.price, product.currency)}</span>;
  }
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${align === "right" ? "justify-end" : ""}`}>
      <span className="text-[10px] text-subtle line-through">{money(pricing.originalPrice, product.currency)}</span>
      <span className="inline-flex items-center gap-1 rounded-sm bg-danger-foreground px-1.5 py-1 text-[11px] font-bold text-white">
        {money(pricing.discountedPrice, product.currency)}
        <span className="text-[9px] font-medium">-%{pricing.discountPercentage}</span>
      </span>
    </div>
  );
}

export function ExactProducts() {
  const toast = useExactToast();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [density, setDensity] = useState<ProductDensity>("normal");
  const [columns, setColumns] = useState<ColumnVisibility>({ ...DEFAULT_COLUMNS });
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [collection, setCollection] = useState<string | null>(null);
  const [material, setMaterial] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sort, setSort] = useState<ProductSort>("default");
  const [products, setProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Group[]>([]);
  const [materials, setMaterials] = useState<string[]>(["Arabica", "Robusta", "Arabica + Robusta Blend", "Kafeinsiz"]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mobile, setMobile] = useState(true);
  const [visibleCount, setVisibleCount] = useState(MOBILE_PRODUCT_BATCH);
  const [page, setPage] = useState(1);
  const [contextReady, setContextReady] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedProductView[]>([]);
  const [activeSavedViewId, setActiveSavedViewId] = useState("");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkJob, setBulkJob] = useState<BulkUpdateResponse | null>(null);
  const [selectionScope, setSelectionScope] = useState<SelectionScope>("page");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkActions, setBulkActions] = useState<BulkAction[]>([
    { id: "bulk-initial", field: "finish_color", value: DEFAULT_FINISHES[0] },
  ]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);
  const restoredScrollRef = useRef<number | null>(null);
  const previousFilterKeyRef = useRef("");
  const bulkJobAbortRef = useRef<AbortController | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadSequenceRef = useRef(0);

  const loadRemainingPages = useCallback(async (
    firstCatalog: ProductsResponse,
    sequence: number,
    signal: AbortSignal,
  ) => {
    const firstPagination = firstCatalog.pagination;
    if (!firstPagination?.hasMore) return;

    let accumulated = firstCatalog.products || [];
    let nextPage = firstPagination.page + 1;
    const totalPages = firstPagination.totalPages;

    try {
      while (nextPage <= totalPages && !signal.aborted) {
        const nextCatalog = await adminRequest<ProductsResponse>(
          `/api/products/list?page=${nextPage}&pageSize=${PRODUCT_API_PAGE_SIZE}&q=`,
          {
            hardRefresh: true,
            force: true,
            ttlMs: 0,
            staleMs: 0,
            timeoutMs: 8_000,
            signal,
          },
        );
        if (signal.aborted || loadSequenceRef.current !== sequence) return;

        accumulated = mergeProductPages(accumulated, nextCatalog.products || []);
        const mergedPagination: ProductPagination = {
          page: nextCatalog.pagination?.page || nextPage,
          pageSize: nextCatalog.pagination?.pageSize || PRODUCT_API_PAGE_SIZE,
          total: nextCatalog.pagination?.total || firstPagination.total,
          totalPages: nextCatalog.pagination?.totalPages || totalPages,
          hasMore: Boolean(nextCatalog.pagination?.hasMore),
        };
        const mergedCatalog: ProductsResponse = {
          ...firstCatalog,
          categories: firstCatalog.categories?.length ? firstCatalog.categories : nextCatalog.categories,
          collections: firstCatalog.collections?.length ? firstCatalog.collections : nextCatalog.collections,
        };

        startTransition(() => setProducts(accumulated));
        seedProgressiveProductCache(mergedCatalog, accumulated, mergedPagination);
        nextPage += 1;
      }

      if (loadSequenceRef.current === sequence) {
        const validIds = new Set(accumulated.map((product) => product.id));
        setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))));
      }
    } catch (caught) {
      if (signal.aborted || loadSequenceRef.current !== sequence) return;
      toast.error(caught instanceof Error
        ? `Kalan ürünler arka planda yüklenemedi: ${caught.message}`
        : "Kalan ürünler arka planda yüklenemedi.");
    }
  }, [toast]);

  const load = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const sequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = sequence;

    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const catalogPath = mode === "initial"
        ? "/api/products?q="
        : `/api/products/list?page=1&pageSize=${PRODUCT_API_PAGE_SIZE}&q=`;
      const catalogOptions = mode === "initial"
        ? { signal: controller.signal }
        : {
            hardRefresh: true,
            force: true,
            ttlMs: 0,
            staleMs: 0,
            timeoutMs: 8_000,
            signal: controller.signal,
          };

      const [catalog, materialResult] = await Promise.all([
        adminRequest<ProductsResponse>(catalogPath, catalogOptions),
        adminRequest<{ options?: string[] }>("/api/product-settings/materials", { signal: controller.signal })
          .catch(() => ({ options: ["Arabica", "Robusta", "Arabica + Robusta Blend", "Kafeinsiz"] })),
      ]);
      if (controller.signal.aborted || loadSequenceRef.current !== sequence) return;

      const firstProducts = catalog.products || [];
      setProducts(firstProducts);
      setCollections(catalog.collections || []);
      setCategories(catalog.categories || []);
      setMaterials([...new Set([...(materialResult.options || []), "Arabica", "Robusta", "Arabica + Robusta Blend", "Kafeinsiz"].filter(Boolean))]);
      seedProgressiveProductCache(catalog, firstProducts, catalog.pagination);

      if (mode === "initial") setLoading(false);
      else setRefreshing(false);

      void loadRemainingPages(catalog, sequence, controller.signal);
    } catch (caught) {
      if (controller.signal.aborted || loadSequenceRef.current !== sequence) return;
      toast.error(caught instanceof Error ? caught.message : "Ürünler alınamadı.");
    } finally {
      if (loadAbortRef.current === controller && (controller.signal.aborted || loadSequenceRef.current !== sequence)) {
        loadAbortRef.current = null;
      }
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [loadRemainingPages, toast]);

  useEffect(() => {
    void load("initial");
    return () => loadAbortRef.current?.abort();
  }, [load]);
  useEffect(() => () => bulkJobAbortRef.current?.abort(), []);

  useEffect(() => {
    const restored = readProductContext();
    const views = readSavedViews();
    setSavedViews(views);
    if (restored) {
      setSearch(restored.search);
      setCollection(restored.collection);
      setMaterial(restored.material);
      setStatus(restored.status);
      setSort(restored.sort);
      setView(restored.view);
      setDensity(restored.density);
      setColumns(restored.columns);
      setPage(restored.page);
      restoredScrollRef.current = restored.scrollY;
      previousFilterKeyRef.current = [restored.search, restored.collection || "", restored.material || "", restored.status || "", restored.sort].join("|");
    }
    setContextReady(true);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const filtered = useMemo(() => {
    const needle = deferredSearch.trim().toLocaleLowerCase("tr-TR");
    const next = products.filter((product) => {
      const searchable = [product.name, product.slug, product.material, product.finish_color, ...collectionNames(product)].join(" ").toLocaleLowerCase("tr-TR");
      if (needle && !searchable.includes(needle)) return false;
      if (collection && !collectionNames(product).includes(collection)) return false;
      if (material && product.material !== material) return false;
      if (status && product.status !== status) return false;
      return true;
    });
    if (sort === "default") return next;
    return [...next].sort((left, right) => {
      if (sort === "name-asc") return left.name.localeCompare(right.name, "tr");
      if (sort === "name-desc") return right.name.localeCompare(left.name, "tr");
      if (sort === "price-asc") return Number(left.price || 0) - Number(right.price || 0);
      if (sort === "price-desc") return Number(right.price || 0) - Number(left.price || 0);
      if (sort === "stock-asc") return stockCount(left) - stockCount(right);
      return stockCount(right) - stockCount(left);
    });
  }, [collection, deferredSearch, material, products, sort, status]);

  const filterKey = useMemo(
    () => [search, collection || "", material || "", status || "", sort].join("|"),
    [collection, material, search, sort, status],
  );

  useEffect(() => {
    if (!contextReady) return;
    if (!previousFilterKeyRef.current) previousFilterKeyRef.current = filterKey;
    else if (previousFilterKeyRef.current !== filterKey) {
      previousFilterKeyRef.current = filterKey;
      setPage(1);
      setVisibleCount(MOBILE_PRODUCT_BATCH);
      setActiveSavedViewId("");
    }
  }, [contextReady, filterKey]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / DESKTOP_PAGE_SIZE));
  useEffect(() => { setPage((current) => Math.min(Math.max(1, current), pageCount)); }, [pageCount]);

  const renderedProducts = useMemo(() => {
    if (mobile) return filtered.slice(0, visibleCount);
    const start = (page - 1) * DESKTOP_PAGE_SIZE;
    return filtered.slice(start, start + DESKTOP_PAGE_SIZE);
  }, [filtered, mobile, page, visibleCount]);

  useEffect(() => {
    if (!mobile || visibleCount >= filtered.length) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisibleCount((current) => Math.min(current + MOBILE_PRODUCT_BATCH, filtered.length));
    }, { rootMargin: "700px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [filtered.length, mobile, visibleCount]);

  useEffect(() => {
    if (!contextReady) return;
    const context: ProductListContext = {
      search,
      collection,
      material,
      status,
      sort,
      view,
      density,
      columns,
      page,
      scrollY: window.scrollY,
    };
    window.sessionStorage.setItem(PRODUCTS_CONTEXT_KEY, JSON.stringify(context));
  }, [collection, columns, contextReady, density, material, page, search, sort, status, view]);

  useEffect(() => {
    if (!contextReady) return;
    let frame = 0;
    const persistScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        try {
          const current = JSON.parse(window.sessionStorage.getItem(PRODUCTS_CONTEXT_KEY) || "{}") as Partial<ProductListContext>;
          window.sessionStorage.setItem(PRODUCTS_CONTEXT_KEY, JSON.stringify({ ...current, scrollY: window.scrollY }));
        } catch {
          // Ignore malformed local navigation context; the next state write replaces it.
        }
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

  const toggleBulkMode = useCallback(() => {
    setBulkMode((current) => {
      if (current) {
        setSelectedIds(new Set());
        bulkJobAbortRef.current?.abort();
        setBulkJob(null);
      }
      return !current;
    });
  }, []);

  const toggleProduct = useCallback((productId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const scopeProducts = selectionScope === "page" ? renderedProducts : selectionScope === "filtered" ? filtered : products;
  const scopeIds = useMemo(() => scopeProducts.map((product) => product.id), [scopeProducts]);
  const scopeSelectedCount = scopeIds.filter((id) => selectedIds.has(id)).length;
  const allScopeSelected = scopeIds.length > 0 && scopeSelectedCount === scopeIds.length;
  const someScopeSelected = scopeSelectedCount > 0 && !allScopeSelected;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someScopeSelected;
  }, [someScopeSelected]);

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

  const addBulkAction = useCallback(() => {
    setBulkActions((current) => {
      const next = nextBulkAction(current, materials, categories, collections);
      return next ? [...current, next] : current;
    });
  }, [categories, collections, materials]);

  const updateBulkActionField = useCallback((actionId: string, field: BulkField) => {
    setBulkActions((current) => current.map((action) => action.id === actionId
      ? { ...action, field, value: defaultBulkValue(field, materials, categories, collections) }
      : action));
  }, [categories, collections, materials]);

  const updateBulkActionValue = useCallback((actionId: string, value: string) => {
    setBulkActions((current) => current.map((action) => action.id === actionId ? { ...action, value } : action));
  }, []);

  const removeBulkAction = useCallback((actionId: string) => {
    setBulkActions((current) => current.filter((action) => action.id !== actionId));
  }, []);

  const pollBulkJob = useCallback(async (jobId: string, signal: AbortSignal) => {
    while (!signal.aborted) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1200));
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const state = await adminRequest<BulkUpdateResponse>(`/api/products/bulk-update?jobId=${encodeURIComponent(jobId)}`, {
        hardRefresh: true,
        ttlMs: 0,
        staleMs: 0,
        signal,
      });
      setBulkJob(state);
      const progressState = state.progress?.state || state.status || "queued";
      if (progressState === "succeeded") return state;
      if (["failed", "dead_letter", "cancelled"].includes(progressState)) {
        throw new Error(state.lastError || "Toplu ürün işlemi tamamlanamadı.");
      }
    }
    throw new DOMException("Aborted", "AbortError");
  }, []);

  const applyBulkActions = useCallback(async () => {
    if (!selectedIds.size) {
      toast.error("Önce en az bir ürün seç.");
      return;
    }
    if (!bulkActions.length) {
      toast.error("En az bir toplu işlem ekle.");
      return;
    }

    const changes: Record<string, string | boolean | null> = {};
    const payload: Record<string, unknown> = { ids: [...selectedIds], changes };

    for (const action of bulkActions) {
      if (isNumericBulkField(action.field)) {
        const numeric = Number(action.value);
        if (!Number.isFinite(numeric) || numeric < 0) {
          toast.error("Fiyat, indirim ve stok değerleri geçerli bir sayı olmalı.");
          return;
        }
        if (action.field === "price_set" && numeric <= 0) {
          toast.error("Yeni ürün fiyatı 0'dan büyük olmalı.");
          return;
        }
        if (action.field === "discount_percent" && (numeric <= 0 || numeric > 100)) {
          toast.error("İndirim yüzdesi 0 ile 100 arasında olmalı.");
          return;
        }
        if (action.field === "price_set") { payload.price_mode = "set"; payload.price_value = numeric; }
        if (action.field === "price_increase_percent") { payload.price_mode = "increase_percent"; payload.price_value = numeric; }
        if (action.field === "price_decrease_percent") { payload.price_mode = "decrease_percent"; payload.price_value = numeric; }
        if (action.field === "price_increase_amount") { payload.price_mode = "increase_amount"; payload.price_value = numeric; }
        if (action.field === "price_decrease_amount") { payload.price_mode = "decrease_amount"; payload.price_value = numeric; }
        if (action.field === "discount_percent") { payload.discount_action = "apply"; payload.discount_percent = numeric; }
        if (action.field === "stock_set_total") { payload.stock_mode = "set"; payload.stock_scope = "total"; payload.stock_value = Math.trunc(numeric); }
        if (action.field === "stock_increase_total") { payload.stock_mode = "increase"; payload.stock_scope = "total"; payload.stock_value = Math.trunc(numeric); }
        if (action.field === "stock_decrease_total") { payload.stock_mode = "decrease"; payload.stock_scope = "total"; payload.stock_value = Math.trunc(numeric); }
        if (action.field === "stock_set_each_variant") { payload.stock_mode = "set"; payload.stock_scope = "each_variant"; payload.stock_value = Math.trunc(numeric); }
        if (action.field === "stock_increase_each_variant") { payload.stock_mode = "increase"; payload.stock_scope = "each_variant"; payload.stock_value = Math.trunc(numeric); }
        if (action.field === "stock_decrease_each_variant") { payload.stock_mode = "decrease"; payload.stock_scope = "each_variant"; payload.stock_value = Math.trunc(numeric); }
        continue;
      }
      if (action.field === "discount_remove") { payload.discount_action = "remove"; continue; }
      if (action.field === "category_add" || action.field === "category_remove") {
        if (!action.value) { toast.error("Kategori seç."); return; }
        payload.category_action = action.field === "category_add" ? "add" : "remove";
        payload.category_ids = [action.value];
        continue;
      }
      if (action.field === "collection_add" || action.field === "collection_remove") {
        if (!action.value) { toast.error("Koleksiyon seç."); return; }
        payload.collection_action = action.field === "collection_add" ? "add" : "remove";
        payload.collection_ids = [action.value];
        continue;
      }
      if (action.field === "is_featured" || action.field === "is_new") changes[action.field] = action.value === "true";
      else changes[action.field] = action.value === "" ? null : action.value;
    }

    bulkJobAbortRef.current?.abort();
    const controller = new AbortController();
    bulkJobAbortRef.current = controller;
    setBulkJob(null);
    setBulkSaving(true);
    try {
      let result = await adminRequest<BulkUpdateResponse>("/api/products/bulk-update", {
        method: "PATCH",
        body: JSON.stringify(payload),
        force: true,
        ttlMs: 0,
        staleMs: 0,
        signal: controller.signal,
      });
      setBulkJob(result);
      if (result.queued && result.jobId) result = await pollBulkJob(result.jobId, controller.signal);
      await load("refresh");
      const updatedCount = result.updated || result.progress?.processed || selectedIds.size;
      setSelectedIds(new Set());
      toast.success(`${updatedCount} ürün toplu olarak güncellendi.${result.warning ? ` ${result.warning}` : ""}`);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      toast.error(caught instanceof Error ? caught.message : "Toplu işlem uygulanamadı.");
    } finally {
      if (bulkJobAbortRef.current === controller) bulkJobAbortRef.current = null;
      setBulkSaving(false);
    }
  }, [bulkActions, load, pollBulkJob, selectedIds, toast]);

  const clearFilters = () => {
    setSearch("");
    setCollection(null);
    setMaterial(null);
    setStatus(null);
    setSort("default");
  };

  const saveCurrentView = () => {
    const name = viewName.trim();
    if (!name) {
      toast.error("Görünüm için bir ad yaz.");
      return;
    }
    const nextView: SavedProductView = {
      id: `products-view-${Date.now()}`,
      name: name.slice(0, 60),
      search,
      collection,
      material,
      status,
      sort,
      view,
      density,
      columns: { ...columns },
    };
    const next = [nextView, ...savedViews].slice(0, 12);
    setSavedViews(next);
    setActiveSavedViewId(nextView.id);
    window.localStorage.setItem(PRODUCTS_SAVED_VIEWS_KEY, JSON.stringify(next));
    setViewName("");
    setSaveViewOpen(false);
    toast.success(`“${nextView.name}” görünümü kaydedildi.`);
  };

  const applySavedView = (id: string) => {
    setActiveSavedViewId(id);
    const selected = savedViews.find((item) => item.id === id);
    if (!selected) return;
    setSearch(selected.search);
    setCollection(selected.collection);
    setMaterial(selected.material);
    setStatus(selected.status);
    setSort(selected.sort);
    setView(selected.view);
    setDensity(selected.density);
    setColumns(selected.columns);
    setPage(1);
  };

  const deleteSavedView = () => {
    if (!activeSavedViewId) return;
    const next = savedViews.filter((item) => item.id !== activeSavedViewId);
    setSavedViews(next);
    setActiveSavedViewId("");
    window.localStorage.setItem(PRODUCTS_SAVED_VIEWS_KEY, JSON.stringify(next));
  };

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (search.trim()) chips.push({ key: "search", label: `Ara: ${search.trim()}`, clear: () => setSearch("") });
    if (collection) chips.push({ key: "collection", label: `Koleksiyon: ${collection}`, clear: () => setCollection(null) });
    if (material) chips.push({ key: "material", label: `Kahve türü: ${material}`, clear: () => setMaterial(null) });
    if (status) chips.push({ key: "status", label: `Durum: ${STATUS_LABELS[status] || status}`, clear: () => setStatus(null) });
    if (sort !== "default") chips.push({ key: "sort", label: `Sıra: ${SORT_LABELS[sort]}`, clear: () => setSort("default") });
    return chips;
  }, [collection, material, search, sort, status]);

  const gridCardBody = (product: Product) => (
    <>
      <div className="relative aspect-square overflow-hidden bg-surface-tertiary">
        <ProductPhoto product={product} />
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
          <ExactStatusBadge status={product.status} size="sm" />
          {isBundle(product) ? <ExactStatusBadge status="bundle" label="Paket ürün" tone="accent" size="sm" /> : null}
        </div>
      </div>
      <div className={density === "compact" ? "p-2.5" : "p-3"}>
        <p className="truncate text-sm font-semibold text-main">{product.name}</p>
        <p className="truncate text-[11px] text-subtle">{product.material || "Kahve türü yok"} · {product.product_variants?.length || 0} varyant</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <ProductPrice product={product} />
          <span className={stockCount(product) === 0 ? "text-[11px] font-medium text-danger-foreground" : stockCount(product) < 10 ? "text-[11px] font-medium text-warning-foreground" : "text-[11px] font-medium text-muted"}>{stockCount(product)} stokta</span>
        </div>
        <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-accent"><Edit3 className="h-3.5 w-3.5" /> Tüm özelliklerle düzenle</div>
      </div>
    </>
  );

  const mobileListCardBody = (product: Product) => (
    <>
      <div className="h-14 w-14 shrink-0 overflow-hidden bg-surface-tertiary radius-small"><ProductPhoto product={product} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><p className="truncate text-sm font-semibold text-main">{product.name}</p><ExactStatusBadge status={product.status} size="sm" />{isBundle(product) ? <ExactStatusBadge status="bundle" label="Paket" tone="accent" size="sm" /> : null}</div>
        <p className="truncate text-[11px] text-muted">{product.slug} · {product.material || "Kahve türü yok"} · {collectionNames(product).join(", ") || "Koleksiyon yok"}</p>
      </div>
      <div className="shrink-0 text-right"><ProductPrice product={product} align="right" /><p className="mt-1 text-[11px] text-muted">{stockCount(product)} stokta</p></div>
    </>
  );

  return (
    <div className="space-y-4 animate-fade-in" data-base44-exact-page="products">
      <ExactPageHeader
        title="Ürünler"
        subtitle={bulkMode ? `${selectedIds.size} ürün seçili · seçim kapsamı açık` : `${filtered.length} ürün · hızlı kaynak görünümü`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ExactButton variant="secondary" size="sm" onClick={toggleBulkMode}>
              {bulkMode ? <X className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
              {bulkMode ? "Seçimi Kapat" : "Toplu İşlem"}
            </ExactButton>
            <ExactSegmentedControl
              value={view}
              onChange={(value) => setView(value as "grid" | "list")}
              options={[{ value: "grid", label: "Grid", icon: LayoutGrid }, { value: "list", label: "Liste", icon: List }]}
              size="sm"
            />
            {!bulkMode ? (
              <>
                <Link href="/products/studio?type=bundle"><ExactButton variant="secondary" size="sm"><Boxes className="h-4 w-4" /> Paket Ürün</ExactButton></Link>
                <Link href="/products/studio?type=single"><ExactButton size="sm"><PackagePlus className="h-4 w-4" /> Yeni Ürün</ExactButton></Link>
              </>
            ) : null}
          </div>
        }
      />

      {!bulkMode ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Link href="/products/studio?type=single" className="group rounded-[var(--radius-card)] bg-surface-primary p-4 shadow-card transition-all hover:shadow-floating">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center radius-small bg-accent-soft text-accent"><PackagePlus className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-main">Ürün oluştur</p><p className="text-[11px] text-muted">Görseller, açıklamalar, kategori, koleksiyon ve varyantlar</p></div></div>
          </Link>
          <Link href="/products/studio?type=bundle" className="group rounded-[var(--radius-card)] bg-surface-primary p-4 shadow-card transition-all hover:shadow-floating">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center radius-small bg-accent-soft text-accent"><Boxes className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-main">Paket ürün oluştur</p><p className="text-[11px] text-muted">Birden fazla ürünü set olarak birleştir ve fiyatlandır</p></div></div>
          </Link>
          <Link href="/products/studio" className="group rounded-[var(--radius-card)] bg-surface-primary p-4 shadow-card transition-all hover:shadow-floating">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center radius-small bg-accent-soft text-accent"><Edit3 className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-main">Gelişmiş ürün düzenleme</p><p className="text-[11px] text-muted">Varyant, medya, stok ve storefront bilgilerini birlikte düzenle</p></div></div>
          </Link>
        </div>
      ) : null}

      <section className="space-y-3 rounded-[var(--radius-card)] bg-surface-primary p-3 shadow-card md:p-4">
        <div className="grid gap-2 lg:grid-cols-[minmax(260px,1fr)_auto]">
          <ExactSearchInput value={search} onChange={setSearch} placeholder="Ürün, slug, kahve türü veya koleksiyon ara..." />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <select value={sort} onChange={(event) => setSort(event.target.value as ProductSort)} className="h-11 min-w-[150px] rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs font-medium text-main" aria-label="Ürünleri sırala">
              {Object.entries(SORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <ExactSegmentedControl value={density} onChange={(value) => setDensity(value as ProductDensity)} options={[{ value: "normal", label: "Normal" }, { value: "compact", label: "Kompakt" }]} size="sm" />
            {view === "list" ? <ExactButton variant="secondary" size="sm" onClick={() => setColumnsOpen((current) => !current)}><Columns3 className="h-4 w-4" /> Sütunlar</ExactButton> : null}
            <ExactIconButton icon={RefreshCw} label="Yenile" variant="ghost" size="icon-sm" onClick={() => void load("refresh")} loading={refreshing} disabled={loading || bulkSaving} />
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-hidden">
          <ExactFilterBar
            chips={[
              { key: "collection", label: "Tüm Koleksiyonlar", options: collections.map((item) => item.name), value: collection },
              { key: "material", label: "Tüm Kahve Türleri", options: materials, value: material },
              { key: "status", label: "Tüm Durumlar", options: [{ label: "Aktif", value: "active" }, { label: "Taslak", value: "draft" }, { label: "Arşiv", value: "archived" }], value: status },
            ]}
            onChipChange={(key, value) => {
              if (key === "collection") setCollection(value);
              if (key === "material") setMaterial(value);
              if (key === "status") setStatus(value);
            }}
            className="min-w-0 flex-1 overflow-hidden"
          />
        </div>

        {activeFilterChips.length ? (
          <div className="flex flex-wrap items-center gap-2" aria-label="Aktif ürün filtreleri">
            {activeFilterChips.map((chip) => <button key={chip.key} type="button" onClick={chip.clear} className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-secondary px-3 text-[11px] font-medium text-main"><span>{chip.label}</span><X className="h-3.5 w-3.5 text-muted" /></button>)}
            <button type="button" onClick={clearFilters} className="min-h-9 px-2 text-[11px] font-semibold text-accent">Tümünü temizle</button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <select value={activeSavedViewId} onChange={(event) => applySavedView(event.target.value)} className="h-10 min-w-[180px] rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs text-main" aria-label="Kaydedilmiş ürün görünümü">
              <option value="">Kaydedilmiş görünümler</option>
              {savedViews.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            {activeSavedViewId ? <ExactIconButton icon={Trash2} label="Görünümü sil" variant="ghost" size="icon-sm" onClick={deleteSavedView} /> : null}
            {!saveViewOpen ? <ExactButton variant="secondary" size="sm" onClick={() => setSaveViewOpen(true)}><BookmarkPlus className="h-4 w-4" /> Görünümü Kaydet</ExactButton> : (
              <div className="flex flex-wrap items-center gap-2">
                <input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="Görünüm adı" className="h-10 min-w-[170px] rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs text-main outline-none" autoFocus />
                <ExactButton size="sm" onClick={saveCurrentView}>Kaydet</ExactButton>
                <ExactButton variant="secondary" size="sm" onClick={() => { setSaveViewOpen(false); setViewName(""); }}>Vazgeç</ExactButton>
              </div>
            )}
          </div>
          <span className="text-[11px] text-muted">{filtered.length} sonuç · {products.length} toplam ürün</span>
        </div>

        {columnsOpen && view === "list" ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-secondary p-2.5" aria-label="Ürün listesi sütunları">
            {(Object.keys(DEFAULT_COLUMNS) as ProductColumn[]).map((key) => {
              const labels: Record<ProductColumn, string> = { material: "Kahve Türü", collections: "Koleksiyon", status: "Durum", stock: "Stok", price: "Fiyat" };
              return <button key={key} type="button" aria-pressed={columns[key]} onClick={() => setColumns((current) => ({ ...current, [key]: !current[key] }))} className={`min-h-9 rounded-lg border px-3 text-xs font-medium ${columns[key] ? "border-accent bg-accent-soft text-accent" : "border-border-subtle bg-surface-primary text-muted"}`}><Check className={`mr-1 inline h-3.5 w-3.5 ${columns[key] ? "opacity-100" : "opacity-0"}`} />{labels[key]}</button>;
            })}
          </div>
        ) : null}
      </section>

      {bulkMode ? (
        <>
          <section className="sticky top-16 z-20 rounded-[var(--radius-card)] border border-accent/30 bg-surface-primary p-3 shadow-floating">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex min-h-11 items-center gap-2 rounded-lg bg-surface-secondary px-3 text-xs font-semibold text-main">
                  <input ref={selectAllRef} type="checkbox" checked={allScopeSelected} onChange={toggleScopeSelection} disabled={!scopeIds.length || bulkSaving} className="h-4 w-4" />
                  {someScopeSelected ? `${scopeSelectedCount}/${scopeIds.length}` : allScopeSelected ? `${scopeIds.length} seçili` : "Kapsamı seç"}
                </label>
                <select value={selectionScope} onChange={(event) => setSelectionScope(event.target.value as SelectionScope)} className="h-11 rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-3 text-xs font-medium text-main" aria-label="Toplu seçim kapsamı">
                  <option value="page">Görünen ürünler ({renderedProducts.length})</option>
                  <option value="filtered">Filtre sonucu ({filtered.length})</option>
                  <option value="all">Tüm ürünler ({products.length})</option>
                </select>
                <span className="text-xs font-semibold text-main">Toplam {selectedIds.size} ürün seçili</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedIds.size ? <ExactButton variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())} disabled={bulkSaving}>Seçimi Temizle</ExactButton> : null}
                <ExactButton size="sm" onClick={() => void applyBulkActions()} loading={bulkSaving} disabled={!selectedIds.size || !bulkActions.length}><ListChecks className="h-4 w-4" /> Uygula ({selectedIds.size})</ExactButton>
              </div>
            </div>
            {bulkJob?.jobId ? (
              <div className="mt-3 rounded-xl bg-surface-secondary p-3" data-phase9-bulk-progress="true">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-main">Toplu işlem ilerlemesi</span>
                  <span className="font-semibold text-accent">%{bulkJob.progress?.percent ?? 0}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-tertiary" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bulkJob.progress?.percent ?? 0}>
                  <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, bulkJob.progress?.percent ?? 0))}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                  <span>{bulkJob.progress?.processed ?? 0} / {bulkJob.progress?.total ?? selectedIds.size} ürün işlendi</span>
                  <span>{bulkJob.progress?.state === "running" ? "İşleniyor" : bulkJob.progress?.state === "queued" ? "Sırada" : bulkJob.progress?.state === "succeeded" ? "Tamamlandı" : "Hata"}</span>
                </div>
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-3 py-3 md:px-4"><div><p className="text-sm font-semibold text-main">Toplu işlem ayarları</p><p className="mt-0.5 text-[11px] text-muted">Checkbox seçimi kartı açmaktan bağımsızdır; her işlem satırı aynı canonical bulk servisine gider.</p></div><SlidersHorizontal className="h-4 w-4 text-muted" /></div>
            <div className="space-y-2 p-3 md:p-4">
              {bulkActions.map((action) => {
                const usedFamiliesByOthers = new Set(bulkActions.filter((item) => item.id !== action.id).map((item) => bulkFieldFamily(item.field)));
                const valueOptions = bulkValueOptions(action.field, materials, categories, collections);
                return (
                  <div key={action.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_44px] gap-2 rounded-xl bg-surface-secondary p-2 sm:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)_40px]">
                    <select value={action.field} onChange={(event) => updateBulkActionField(action.id, event.target.value as BulkField)} className="h-10 min-w-0 rounded-lg border border-border-subtle bg-surface-primary px-2 text-xs text-main outline-none" aria-label="Toplu işlem alanı" disabled={bulkSaving}>
                      {BULK_FIELDS.map((option) => <option key={option.value} value={option.value} disabled={usedFamiliesByOthers.has(bulkFieldFamily(option.value))}>{option.label}</option>)}
                    </select>
                    {isNumericBulkField(action.field) ? (
                      <input
                        type="number"
                        min="0"
                        max={action.field === "discount_percent" ? 100 : undefined}
                        step={INTEGER_BULK_FIELDS.has(action.field) ? 1 : 0.01}
                        value={action.value}
                        onChange={(event) => updateBulkActionValue(action.id, event.target.value)}
                        className="col-start-1 row-start-2 h-10 min-w-0 rounded-lg border border-border-subtle bg-surface-primary px-2 text-xs text-main outline-none sm:col-start-2 sm:row-start-1"
                        aria-label="Toplu işlem sayısal değeri"
                        disabled={bulkSaving}
                      />
                    ) : action.field === "discount_remove" ? (
                      <div className="col-start-1 row-start-2 flex h-10 min-w-0 items-center rounded-lg border border-border-subtle bg-surface-primary px-3 text-xs font-medium text-main sm:col-start-2 sm:row-start-1">Aktif indirimi kaldır</div>
                    ) : (
                      <select value={action.value} onChange={(event) => updateBulkActionValue(action.id, event.target.value)} className="col-start-1 row-start-2 h-10 min-w-0 rounded-lg border border-border-subtle bg-surface-primary px-2 text-xs text-main outline-none sm:col-start-2 sm:row-start-1" aria-label="Toplu işlem değeri" disabled={bulkSaving}>
                        {!valueOptions.length ? <option value="">Seçenek yok</option> : null}
                        {valueOptions.map((option) => <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>)}
                      </select>
                    )}
                    <button type="button" onClick={() => removeBulkAction(action.id)} className="col-start-2 row-span-2 row-start-1 flex h-10 w-10 items-center justify-center justify-self-end rounded-lg border border-border-subtle bg-surface-primary text-muted transition-colors hover:text-danger-foreground sm:col-start-3 sm:row-span-1" aria-label="Toplu işlemi kaldır" disabled={bulkSaving}><X className="h-4 w-4" /></button>
                  </div>
                );
              })}
              <ExactButton variant="secondary" size="sm" onClick={addBulkAction} disabled={bulkSaving || new Set(bulkActions.map((action) => bulkFieldFamily(action.field))).size >= new Set(BULK_FIELDS.map((option) => bulkFieldFamily(option.value))).size}><Plus className="h-4 w-4" /> İşlem Ekle</ExactButton>
            </div>
          </section>
        </>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <ExactSkeleton key={index} className="aspect-[1/1.28] radius-card" />)}</div>
      ) : null}

      {!loading && view === "grid" ? (
        <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 ${density === "compact" ? "gap-2" : "gap-3"}`}>
          {renderedProducts.map((product) => (
            <div key={product.id} className={`group relative overflow-hidden bg-surface-primary radius-card shadow-card transition-all duration-200 ${selectedIds.has(product.id) ? "ring-2 ring-accent ring-offset-1" : "hover:shadow-floating"}`}>
              {bulkMode ? <label className="absolute left-1.5 top-1.5 z-20 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full" aria-label={`${product.name} seç`}><span className={`flex h-7 w-7 items-center justify-center rounded-full border shadow-sm ${selectedIds.has(product.id) ? "border-accent bg-accent text-white" : "border-white/90 bg-white/90 text-transparent"}`}><input type="checkbox" checked={selectedIds.has(product.id)} onChange={() => toggleProduct(product.id)} className="sr-only" /><Check className="h-4 w-4" /></span></label> : null}
              <Link href={`/products/studio?id=${encodeURIComponent(product.id)}`} className="block text-left">{gridCardBody(product)}</Link>
              {!bulkMode ? <Link href={`/products/studio?id=${encodeURIComponent(product.id)}`} className="absolute bottom-2 right-2 hidden min-h-9 items-center gap-1 rounded-lg border border-border-subtle bg-surface-primary/95 px-2.5 text-[11px] font-semibold text-main opacity-0 shadow-sm transition-opacity group-hover:opacity-100 md:flex"><Edit3 className="h-3.5 w-3.5" /> Düzenle</Link> : null}
              {!bulkMode ? <details className="absolute bottom-2 right-2 z-20 md:hidden"><summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-border-subtle bg-surface-primary/95 text-main shadow-sm" aria-label={`${product.name} işlemleri`}><MoreHorizontal className="h-4 w-4" /></summary><div className="absolute bottom-12 right-0 min-w-32 rounded-lg border border-border-subtle bg-surface-primary p-1 shadow-floating"><Link href={`/products/studio?id=${encodeURIComponent(product.id)}`} className="flex min-h-10 items-center gap-2 rounded-md px-3 text-xs font-medium text-main"><Edit3 className="h-3.5 w-3.5" /> Düzenle</Link></div></details> : null}
            </div>
          ))}
        </div>
      ) : null}

      {!loading && view === "list" ? (
        <div className="space-y-2">
          <div className="hidden items-center gap-3 rounded-lg bg-surface-secondary px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-subtle md:flex">
            {bulkMode ? <span className="w-11 shrink-0" /> : null}
            <span className="min-w-0 flex-1">Ürün</span>
            {columns.material ? <span className="w-32 shrink-0">Kahve Türü</span> : null}
            {columns.collections ? <span className="w-40 shrink-0">Koleksiyon</span> : null}
            {columns.status ? <span className="w-24 shrink-0">Durum</span> : null}
            {columns.stock ? <span className="w-20 shrink-0 text-right">Stok</span> : null}
            {columns.price ? <span className="w-28 shrink-0 text-right">Fiyat</span> : null}
            <span className="w-20 shrink-0" />
          </div>
          {renderedProducts.map((product) => (
            <div key={product.id} className={`group relative flex items-center gap-2 bg-surface-primary radius-card shadow-card transition-all ${density === "compact" ? "p-2" : "p-3"} ${selectedIds.has(product.id) ? "ring-2 ring-accent ring-offset-1" : "hover:shadow-floating"}`}>
              {bulkMode ? <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center" aria-label={`${product.name} seç`}><span className={`flex h-7 w-7 items-center justify-center rounded-full border ${selectedIds.has(product.id) ? "border-accent bg-accent text-white" : "border-border-subtle bg-surface-primary text-transparent"}`}><input type="checkbox" checked={selectedIds.has(product.id)} onChange={() => toggleProduct(product.id)} className="sr-only" /><Check className="h-4 w-4" /></span></label> : null}
              <Link href={`/products/studio?id=${encodeURIComponent(product.id)}`} className="flex min-w-0 flex-1 items-center gap-3 md:hidden">{mobileListCardBody(product)}</Link>
              <Link href={`/products/studio?id=${encodeURIComponent(product.id)}`} className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
                <div className={`${density === "compact" ? "h-10 w-10" : "h-12 w-12"} shrink-0 overflow-hidden bg-surface-tertiary radius-small`}><ProductPhoto product={product} /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-main">{product.name}</p><p className="truncate text-[10px] text-muted">{product.slug}{isBundle(product) ? " · Paket" : ""}</p></div>
                {columns.material ? <span className="w-32 shrink-0 truncate text-xs text-muted">{product.material || "—"}</span> : null}
                {columns.collections ? <span className="w-40 shrink-0 truncate text-xs text-muted">{collectionNames(product).join(", ") || "—"}</span> : null}
                {columns.status ? <span className="w-24 shrink-0"><ExactStatusBadge status={product.status} size="sm" /></span> : null}
                {columns.stock ? <span className={`w-20 shrink-0 text-right text-xs font-medium ${stockCount(product) === 0 ? "text-danger-foreground" : stockCount(product) < 10 ? "text-warning-foreground" : "text-muted"}`}>{stockCount(product)}</span> : null}
                {columns.price ? <span className="w-28 shrink-0 text-right"><ProductPrice product={product} align="right" /></span> : null}
              </Link>
              <Link href={`/products/studio?id=${encodeURIComponent(product.id)}`} className="hidden min-h-9 w-20 shrink-0 items-center justify-center gap-1 rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[11px] font-semibold text-main opacity-0 transition-opacity group-hover:opacity-100 md:flex"><Edit3 className="h-3.5 w-3.5" /> Aç</Link>
              <details className="relative md:hidden"><summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full text-muted" aria-label={`${product.name} işlemleri`}><MoreHorizontal className="h-4 w-4" /></summary><div className="absolute right-0 top-11 z-20 min-w-32 rounded-lg border border-border-subtle bg-surface-primary p-1 shadow-floating"><Link href={`/products/studio?id=${encodeURIComponent(product.id)}`} className="flex min-h-10 items-center gap-2 rounded-md px-3 text-xs font-medium text-main"><Edit3 className="h-3.5 w-3.5" /> Düzenle</Link></div></details>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && mobile && renderedProducts.length < filtered.length ? <div ref={loadMoreRef} aria-hidden="true" className="h-1 w-full" /> : null}

      {!loading && !mobile && pageCount > 1 ? (
        <nav className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-surface-primary p-3 shadow-card" aria-label="Ürün sayfaları">
          <span className="text-xs text-muted">Sayfa {page} / {pageCount} · {filtered.length} ürün</span>
          <div className="flex items-center gap-2">
            <ExactButton variant="secondary" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /> Önceki</ExactButton>
            <ExactButton variant="secondary" size="sm" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Sonraki <ChevronRight className="h-4 w-4" /></ExactButton>
          </div>
        </nav>
      ) : null}

      {!loading && filtered.length === 0 ? (
        <div className="bg-surface-primary p-10 text-center radius-card shadow-card"><Package className="mx-auto mb-3 h-9 w-9 text-subtle" /><p className="text-sm font-semibold text-main">Ürün bulunamadı</p><p className="mt-1 text-xs text-muted">Aramayı veya filtreleri değiştir.</p>{activeFilterChips.length ? <ExactButton variant="secondary" size="sm" className="mt-4" onClick={clearFilters}>Filtreleri temizle</ExactButton> : null}</div>
      ) : null}
    </div>
  );
}
