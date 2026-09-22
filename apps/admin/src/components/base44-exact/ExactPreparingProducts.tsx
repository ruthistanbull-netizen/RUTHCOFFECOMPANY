"use client";

import Link from "next/link";
import { PackageCheck, RefreshCw, Search, ShoppingBag, UsersRound, X } from "lucide-react";
import { Picker } from "@ruth-commerce/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactIconButton, ExactPageHeader, ExactSkeleton } from "./primitives";
import { ExactEmptyState, ExactMetricCard } from "./data";

type CustomerRef = {
  orderId: string;
  orderNo: string;
  name: string;
  email?: string | null;
  quantity: number;
};

type VariantRow = {
  id: string;
  name: string;
  quantity: number;
  orderCount: number;
  customers: CustomerRef[];
};

type ProductRow = {
  id: string;
  name: string;
  slug?: string;
  imageUrl?: string | null;
  totalQuantity: number;
  orderCount: number;
  customers: CustomerRef[];
  variants: VariantRow[];
};

type Payload = {
  products?: ProductRow[];
  stats?: {
    preparingOrders?: number;
    distinctProducts?: number;
    totalQuantity?: number;
  };
};

type VariantFilter = "all" | "single" | "multi";
type SortKey = "quantity" | "orders" | "name";

const filterClass = "ruth-type-control h-10 min-w-0 rounded-[var(--radius-control)] border border-border-subtle bg-surface-primary px-3 text-main outline-none focus:ring-2 focus:ring-accent";

function initials(value: string) {
  return value.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toLocaleUpperCase("tr-TR") || "?";
}

function ProductImagePreview({ product }: { product: ProductRow }) {
  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  const scheduleDesktopPreview = useCallback(() => {
    if (!product.imageUrl) return;
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => {
      setOpen(true);
      hoverTimer.current = null;
    }, 2_000);
  }, [clearHoverTimer, product.imageUrl]);

  useEffect(() => {
    setPortalReady(true);
    return clearHoverTimer;
  }, [clearHoverTimer]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!product.imageUrl) {
    return (
      <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[13px] bg-surface-secondary sm:h-[96px] sm:w-[96px]">
        <PackageCheck className="h-8 w-8 text-subtle" />
      </div>
    );
  }

  const preview = open && portalReady ? createPortal(
    <div
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[3px] sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`${product.name} büyük ürün görseli`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        className="relative grid max-h-[calc(100dvh-24px)] w-[min(96vw,1100px)] min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-[20px] border border-border-subtle bg-surface-primary shadow-overlay md:max-h-[88vh] md:grid-cols-[minmax(0,1fr)_330px] md:grid-rows-1"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Büyük görseli kapat"
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-surface-primary/95 text-main shadow-card backdrop-blur transition-transform hover:scale-105 active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex min-h-0 items-center justify-center bg-surface-secondary/60 p-2 sm:p-4 md:p-5">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="max-h-[58dvh] max-w-full rounded-[14px] object-contain md:max-h-[82vh]"
            decoding="async"
          />
        </div>

        <aside className="min-h-0 overflow-y-auto border-t border-border-subtle bg-surface-primary p-4 md:border-l md:border-t-0 md:p-5">
          <div className="pr-10">
            <p className="ruth-type-card-title break-words text-main">{product.name}</p>
            <p className="ruth-type-caption mt-1 text-subtle">{product.orderCount} siparişte bulunuyor</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-[12px] bg-surface-secondary px-3 py-2.5">
              <p className="ruth-type-label uppercase tracking-wide text-subtle">Toplam adet</p>
              <p className="ruth-type-metric mt-1 text-main">{product.totalQuantity}</p>
            </div>
            <div className="rounded-[12px] bg-surface-secondary px-3 py-2.5">
              <p className="ruth-type-label uppercase tracking-wide text-subtle">Varyant</p>
              <p className="ruth-type-metric mt-1 text-main">{product.variants.length}</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="ruth-type-label uppercase tracking-wide text-subtle">Hazırlanacak varyantlar</p>
            <div className="mt-2 space-y-2">
              {product.variants.map((variant) => (
                <div key={variant.id} className="rounded-[12px] border border-border-subtle bg-surface-secondary px-3 py-2.5">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="ruth-type-card-title break-words text-main">{variant.name}</p>
                      <p className="ruth-type-caption mt-1 text-subtle">{variant.orderCount} sipariş</p>
                    </div>
                    <span className="ruth-type-control shrink-0 whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-accent">{variant.quantity} adet</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${product.name} ürün görselini büyüt`}
        className="flex h-[76px] w-[76px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-[13px] bg-surface-secondary outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent sm:h-[96px] sm:w-[96px]"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") scheduleDesktopPreview();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") clearHoverTimer();
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          touchStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        }}
        onPointerCancel={() => {
          touchStart.current = null;
        }}
        onPointerUp={(event) => {
          if (event.pointerType === "mouse") return;
          const start = touchStart.current;
          touchStart.current = null;
          if (!start || start.pointerId !== event.pointerId) return;
          const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
          if (moved > 10) return;
          event.stopPropagation();
          clearHoverTimer();
          setOpen(true);
        }}
        onClick={(event) => {
          if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
          event.stopPropagation();
          clearHoverTimer();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          clearHoverTimer();
          setOpen(true);
        }}
      >
        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" loading="lazy" decoding="async" />
      </div>
      {preview}
    </>
  );
}

function ProductCustomersPopover({ product, open, onToggle }: { product: ProductRow; open: boolean; onToggle: () => void }) {
  return (
    <div className="relative min-w-0" onMouseEnter={() => { if (!open) onToggle(); }} onMouseLeave={() => { if (open) onToggle(); }}>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); onToggle(); }}
        className="ruth-type-card-title max-w-full text-left text-main underline decoration-transparent underline-offset-4 transition-colors hover:text-accent hover:decoration-current"
        aria-expanded={open}
      >
        <span className="block truncate">{product.name}</span>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+7px)] z-[300] w-[min(300px,calc(100vw-32px))] overflow-hidden rounded-[14px] border border-border-subtle bg-surface-primary shadow-overlay sm:left-0 sm:right-auto">
          <div className="border-b border-border-subtle px-3 py-2">
            <p className="ruth-type-label uppercase tracking-wide text-subtle">Bu ürünü bekleyen müşteriler</p>
            <p className="ruth-type-caption mt-0.5 text-muted">{product.orderCount} sipariş</p>
          </div>
          <div className="max-h-56 overflow-y-auto p-1.5">
            {product.customers.map((customer) => (
              <Link key={`${customer.orderId}:${customer.orderNo}`} href={`/orders?order=${encodeURIComponent(customer.orderId)}`} className="flex items-center gap-2 rounded-[10px] px-2 py-2 transition-colors hover:bg-surface-secondary">
                <span className="ruth-type-caption flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-accent">{initials(customer.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="ruth-type-card-title block truncate text-main">{customer.name}</span>
                  <span className="ruth-type-code block truncate text-subtle">#{customer.orderNo}</span>
                </span>
                <span className="ruth-type-control text-main">{customer.quantity} adet</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ExactPreparingProducts() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [stats, setStats] = useState({ preparingOrders: 0, distinctProducts: 0, totalQuantity: 0 });
  const [query, setQuery] = useState("");
  const [variantFilter, setVariantFilter] = useState<VariantFilter>("all");
  const [sort, setSort] = useState<SortKey>("quantity");
  const [minQuantity, setMinQuantity] = useState("1");
  const [loading, setLoading] = useState(true);
  const [openProduct, setOpenProduct] = useState<string | null>(null);

  const load = useCallback(async ({ silent = false, hardRefresh = false }: { silent?: boolean; hardRefresh?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const result = await adminRequest<Payload>("/api/preparing-products", {
        force: true,
        hardRefresh,
        ttlMs: 0,
        staleMs: 1_000,
      });
      setProducts(result.products || []);
      setStats({
        preparingOrders: Number(result.stats?.preparingOrders || 0),
        distinctProducts: Number(result.stats?.distinctProducts || 0),
        totalQuantity: Number(result.stats?.totalQuantity || 0),
      });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial navigation paints the retained/read-model snapshot immediately. A
    // focus/manual refresh may wait for live data because content is already visible.
    void load();
    const refreshOnFocus = () => { void load({ silent: true, hardRefresh: true }); };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    const minimum = Math.max(1, Number(minQuantity || 1));
    const next = products.filter((product) => {
      const haystack = [product.name, ...product.variants.map((variant) => variant.name)].join(" ").toLocaleLowerCase("tr-TR");
      if (needle && !haystack.includes(needle)) return false;
      if (variantFilter === "single" && product.variants.length > 1) return false;
      if (variantFilter === "multi" && product.variants.length <= 1) return false;
      if (product.totalQuantity < minimum) return false;
      return true;
    });

    return [...next].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "tr");
      if (sort === "orders") return b.orderCount - a.orderCount || b.totalQuantity - a.totalQuantity;
      return b.totalQuantity - a.totalQuantity || b.orderCount - a.orderCount;
    });
  }, [minQuantity, products, query, sort, variantFilter]);

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="preparing-products">
      <ExactPageHeader
        title="Hazırlanacak Ürünler"
        subtitle="Hazırlanıyor durumundaki siparişlerden satın alman gereken gerçek ürün ve varyant adetleri"
        actions={(
          <>
            <Link href="/orders"><ExactButton variant="secondary" size="sm"><ShoppingBag className="h-4 w-4" /> Siparişler</ExactButton></Link>
            <ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load({ hardRefresh: true })} loading={loading} />
          </>
        )}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <ExactMetricCard label="Hazırlanan Sipariş" value={stats.preparingOrders} icon={ShoppingBag} />
        <ExactMetricCard label="Ürün Çeşidi" value={stats.distinctProducts} icon={PackageCheck} />
        <ExactMetricCard label="Toplam Gerekli Adet" value={stats.totalQuantity} icon={UsersRound} className="col-span-2 lg:col-span-1" />
      </div>

      <section className="rounded-[var(--radius-card)] bg-surface-primary p-3 shadow-card" aria-label="Hazırlanacak ürün filtreleri">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="ruth-type-card-title text-main">Filtreler</p>
          <p className="ruth-type-caption text-subtle">{visible.length} ürün gösteriliyor</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_170px_170px_150px]">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ürün veya varyant ara..." className="ruth-type-control h-10 w-full rounded-[var(--radius-control)] border border-border-subtle bg-surface-primary pl-9 pr-3 text-main outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-accent" />
          </div>
          <Picker
            value={variantFilter}
            onValueChange={(value) => setVariantFilter(value as VariantFilter)}
            label="Varyant filtresi"
            className={filterClass}
            options={[
              { value: "all", label: "Tüm varyantlar" },
              { value: "single", label: "Tek varyantlı" },
              { value: "multi", label: "Çok varyantlı" },
            ]}
          />
          <Picker
            value={minQuantity}
            onValueChange={setMinQuantity}
            label="Minimum adet"
            className={filterClass}
            options={[
              { value: "1", label: "En az 1 adet" },
              { value: "2", label: "En az 2 adet" },
              { value: "5", label: "En az 5 adet" },
              { value: "10", label: "En az 10 adet" },
            ]}
          />
          <Picker
            value={sort}
            onValueChange={(value) => setSort(value as SortKey)}
            label="Sıralama"
            className={`${filterClass} col-span-2 sm:col-span-1`}
            options={[
              { value: "quantity", label: "Adede göre" },
              { value: "orders", label: "Sipariş sayısına göre" },
              { value: "name", label: "İsme göre" },
            ]}
          />
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3 lg:grid-cols-2"><ExactSkeleton className="h-40" /><ExactSkeleton className="h-40" /><ExactSkeleton className="h-40" /><ExactSkeleton className="h-40" /></div>
      ) : visible.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((product) => {
            const isOpen = openProduct === product.id;
            return (
              <article key={product.id} className={`relative overflow-visible rounded-[var(--radius-card)] bg-surface-primary p-3 shadow-card transition-[z-index] ${isOpen ? "z-[200]" : "z-0"}`}>
                <div className="flex min-w-0 items-start gap-3">
                  <ProductImagePreview product={product} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <ProductCustomersPopover product={product} open={isOpen} onToggle={() => setOpenProduct((current) => current === product.id ? null : product.id)} />
                        <p className="ruth-type-caption mt-1 text-subtle">{product.orderCount} siparişte bulunuyor</p>
                      </div>
                      <div className="shrink-0 text-right"><p className="ruth-type-metric text-main">{product.totalQuantity}</p><p className="ruth-type-label uppercase tracking-wide text-subtle">toplam adet</p></div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {product.variants.map((variant) => (
                    <div key={variant.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-[11px] bg-surface-secondary px-2.5 py-2">
                      <div className="min-w-0"><p className="ruth-type-card-title break-words text-main">{variant.name}</p><p className="ruth-type-caption mt-0.5 text-subtle">{variant.orderCount} sipariş</p></div>
                      <span className="ruth-type-control shrink-0 whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-accent">{variant.quantity} adet</span>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <ExactEmptyState icon={PackageCheck} title="Hazırlanacak ürün yok" description={query || variantFilter !== "all" || Number(minQuantity) > 1 ? "Seçtiğin filtrelere uyan ürün bulunamadı." : "Hazırlanıyor durumundaki siparişlerde ürün bulunmuyor."} />
      )}
    </div>
  );
}
