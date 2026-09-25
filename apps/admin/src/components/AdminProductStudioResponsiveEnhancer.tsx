"use client";

import { Filter, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";

type Group = { id: string; name: string; slug?: string };
type CatalogProduct = {
  id: string;
  name: string;
  slug?: string;
  price?: number;
  material?: string | null;
  main_image_url?: string | null;
  status?: string | null;
  stock_status?: string | null;
  is_bundle?: boolean | null;
  product_type?: string | null;
  collection_ids?: string[];
  category_ids?: string[];
  collection_list?: Group[];
  categories?: Group[];
};

type CatalogResponse = {
  products?: CatalogProduct[];
  collections?: Group[];
  categories?: Group[];
};

function idsFor(product: CatalogProduct, kind: "collection" | "category") {
  return kind === "collection"
    ? product.collection_ids || product.collection_list?.map((item) => item.id) || []
    : product.category_ids || product.categories?.map((item) => item.id) || [];
}

function money(value: number | undefined) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function statusLabel(value: string | null | undefined) {
  if (value === "active") return "Aktif";
  if (value === "archived") return "Arşiv";
  if (value === "draft") return "Taslak";
  return value || "Durum yok";
}

export function AdminProductStudioResponsiveEnhancer() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const modalOpen = pathname === "/products" && searchParams.get("productModal") === "1";
  const selectedId = searchParams.get("id") || "";

  const [mobile, setMobile] = useState(true);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [collections, setCollections] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Group[]>([]);
  const [query, setQuery] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [stock, setStock] = useState("");
  const [productType, setProductType] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!modalOpen || mobile) {
      setTarget(null);
      return;
    }

    let frame = 0;
    let attempts = 0;
    const syncTarget = () => {
      frame = 0;
      const next = document.querySelector<HTMLElement>(
        "[data-exact-workspace-modal][data-workspace-kind='product'] [data-exact-base44-page='product-studio'] > div > div:first-child",
      );
      if (next) {
        next.dataset.ruthCatalogMounted = "true";
        setTarget((current) => current === next ? current : next);
        return;
      }
      attempts += 1;
      if (attempts < 90) frame = window.requestAnimationFrame(syncTarget);
    };

    frame = window.requestAnimationFrame(syncTarget);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [modalOpen, mobile, selectedId]);

  useEffect(() => {
    if (!modalOpen || mobile) return;
    let cancelled = false;
    setLoading(true);
    void adminRequest<CatalogResponse>("/api/products?q=")
      .then((result) => {
        if (cancelled) return;
        setProducts(result.products || []);
        setCollections(result.collections || []);
        setCategories(result.categories || []);
      })
      .catch(() => {
        if (cancelled) return;
        setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [modalOpen, mobile]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return products.filter((product) => {
      if (needle) {
        const collectionsText = (product.collection_list || []).map((item) => item.name).join(" ");
        const categoriesText = (product.categories || []).map((item) => item.name).join(" ");
        const haystack = `${product.name} ${product.slug || ""} ${product.material || ""} ${collectionsText} ${categoriesText}`.toLocaleLowerCase("tr-TR");
        if (!haystack.includes(needle)) return false;
      }
      if (collectionId && !idsFor(product, "collection").includes(collectionId)) return false;
      if (categoryId && !idsFor(product, "category").includes(categoryId)) return false;
      if (status && product.status !== status) return false;
      if (stock && product.stock_status !== stock) return false;
      if (productType) {
        const bundle = Boolean(product.is_bundle || product.product_type === "bundle");
        if (productType === "bundle" && !bundle) return false;
        if (productType === "single" && bundle) return false;
      }
      return true;
    });
  }, [categories, categoryId, collectionId, productType, products, query, status, stock]);

  const hasFilters = Boolean(collectionId || categoryId || status || stock || productType);
  const clearFilters = useCallback(() => {
    setCollectionId("");
    setCategoryId("");
    setStatus("");
    setStock("");
    setProductType("");
  }, []);

  const openProduct = useCallback((productId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("productModal", "1");
    params.set("id", productId);
    params.delete("type");
    window.history.replaceState(window.history.state, "", `/products?${params.toString()}`);
  }, [searchParams]);

  const panel = target ? createPortal(
    <section className="ruth-product-catalog-panel" aria-label="Ürün kataloğu filtreleri">
      <div className="ruth-product-catalog-head">
        <label className="ruth-product-search-wrap">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ürün ara..."
            aria-label="Ürün ara"
          />
        </label>
        <button
          type="button"
          className={`ruth-product-filter-toggle ${filtersOpen || hasFilters ? "is-active" : ""}`}
          onClick={() => setFiltersOpen((value) => !value)}
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal size={16} />
          <span>Filtre</span>
          {hasFilters ? <b>•</b> : null}
        </button>
      </div>

      <div className={`ruth-product-filters ${filtersOpen ? "is-open" : ""}`}>
        <label>
          <span>Koleksiyon</span>
          <select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
            <option value="">Tümü</option>
            {collections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          <span>Kategori</span>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Tümü</option>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          <span>Yayın</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Tümü</option>
            <option value="active">Aktif</option>
            <option value="draft">Taslak</option>
            <option value="archived">Arşiv</option>
          </select>
        </label>
        <label>
          <span>Stok</span>
          <select value={stock} onChange={(event) => setStock(event.target.value)}>
            <option value="">Tümü</option>
            <option value="in_stock">Stokta</option>
            <option value="out_of_stock">Stok yok</option>
            <option value="preorder">Ön sipariş</option>
          </select>
        </label>
        <label>
          <span>Tip</span>
          <select value={productType} onChange={(event) => setProductType(event.target.value)}>
            <option value="">Tümü</option>
            <option value="single">Tekil</option>
            <option value="bundle">Paket</option>
          </select>
        </label>
        {hasFilters ? (
          <button type="button" className="ruth-product-filter-clear" onClick={clearFilters}>
            <RotateCcw size={14} /> Temizle
          </button>
        ) : null}
      </div>

      <div className="ruth-product-catalog-meta">
        <span>{filtered.length} ürün</span>
        {hasFilters ? <span>filtreli</span> : <span>tümü</span>}
      </div>

      <div className="ruth-product-catalog-results" role="list">
        {loading ? (
          <div className="ruth-product-catalog-loading">Ürünler yükleniyor…</div>
        ) : filtered.length ? filtered.map((product) => (
          <button
            key={product.id}
            type="button"
            role="listitem"
            className={`ruth-product-catalog-item ${selectedId === product.id ? "is-selected" : ""}`}
            onClick={() => openProduct(product.id)}
          >
            <span className="ruth-product-catalog-image">
              {product.main_image_url ? <img src={product.main_image_url} alt="" loading="lazy" decoding="async" fetchPriority="low" /> : null}
            </span>
            <span className="ruth-product-catalog-copy">
              <strong>{product.name}</strong>
              <small>{product.material || "Materyal yok"}</small>
              <em>{money(product.price)}</em>
            </span>
            <span className={`ruth-product-catalog-status status-${product.status || "unknown"}`}>
              {statusLabel(product.status)}
            </span>
          </button>
        )) : (
          <div className="ruth-product-catalog-empty">
            <Filter size={18} /> Bu filtrelerde ürün yok.
          </div>
        )}
      </div>
    </section>,
    target,
  ) : null;

  return (
    <>
      <style>{`
        [data-exact-workspace-modal][data-workspace-kind="product"] {
          box-sizing: border-box !important;
          max-width: calc(100vw - 32px) !important;
        }
        [data-exact-workspace-modal][data-workspace-kind="product"] > div:last-child {
          overflow-x: hidden !important;
        }
        [data-exact-workspace-modal][data-workspace-kind="product"] [data-exact-base44-page="product-studio"] {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          overflow-x: clip !important;
        }
        [data-exact-workspace-modal][data-workspace-kind="product"] [data-exact-base44-page="product-studio"] > div {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
        }
        [data-exact-workspace-modal][data-workspace-kind="product"] [data-exact-base44-page="product-studio"] > div > * {
          min-width: 0 !important;
          max-width: 100% !important;
        }
        [data-exact-workspace-modal][data-workspace-kind="product"] [data-exact-base44-page="product-studio"] > div > :last-child {
          min-width: 0 !important;
          width: 100% !important;
          overflow: hidden !important;
        }
        [data-exact-workspace-modal][data-workspace-kind="product"] [data-exact-base44-page="product-studio"] input,
        [data-exact-workspace-modal][data-workspace-kind="product"] [data-exact-base44-page="product-studio"] textarea,
        [data-exact-workspace-modal][data-workspace-kind="product"] [data-exact-base44-page="product-studio"] select,
        [data-exact-workspace-modal][data-workspace-kind="product"] [data-exact-base44-page="product-studio"] img,
        [data-exact-workspace-modal][data-workspace-kind="product"] [data-exact-base44-page="product-studio"] table {
          max-width: 100%;
          box-sizing: border-box;
        }
        [data-exact-workspace-modal][data-workspace-kind="product"] [data-product-workspace-actions] {
          max-width: 100%;
          overflow-x: auto;
          overscroll-behavior-inline: contain;
        }
        [data-exact-workspace-modal][data-workspace-kind="product"] [data-ruth-catalog-mounted="true"] > :not(.ruth-product-catalog-panel) {
          display: none !important;
        }
        .ruth-product-catalog-panel {
          width: 100%;
          min-width: 0;
          overflow: hidden;
          border: 1px solid hsl(var(--border-subtle));
          border-radius: 18px;
          background: hsl(var(--surface-primary));
          box-shadow: var(--shadow-card, 0 8px 22px rgba(17,17,17,.06));
        }
        .ruth-product-catalog-head {
          display: grid;
          grid-template-columns: minmax(0,1fr) auto;
          gap: 8px;
          padding: 10px;
          border-bottom: 1px solid hsl(var(--border-subtle));
        }
        .ruth-product-search-wrap {
          height: 38px;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 11px;
          border: 1px solid hsl(var(--border-strong) / .8);
          border-radius: 12px;
          color: hsl(var(--text-muted));
          background: hsl(var(--surface-secondary));
        }
        .ruth-product-search-wrap input {
          width: 100%;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: hsl(var(--text-main));
          font: inherit;
          font-size: 13px;
        }
        .ruth-product-filter-toggle,
        .ruth-product-filter-clear {
          border: 1px solid hsl(var(--border-strong) / .75);
          border-radius: 12px;
          background: hsl(var(--surface-primary));
          color: hsl(var(--text-main));
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
        }
        .ruth-product-filter-toggle { min-width: 82px; padding: 0 10px; }
        .ruth-product-filter-toggle.is-active {
          border-color: hsl(var(--accent) / .42);
          background: hsl(var(--accent-soft));
          color: hsl(var(--accent));
        }
        .ruth-product-filters {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 10px;
          border-bottom: 1px solid hsl(var(--border-subtle));
        }
        .ruth-product-filters label { min-width: 0; display: grid; gap: 4px; }
        .ruth-product-filters label > span {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: hsl(var(--text-muted));
        }
        .ruth-product-filters select {
          width: 100%;
          height: 34px;
          min-width: 0;
          border: 1px solid hsl(var(--border-subtle));
          border-radius: 10px;
          padding: 0 8px;
          background: hsl(var(--surface-secondary));
          color: hsl(var(--text-main));
          font-size: 11px;
          outline: none;
        }
        .ruth-product-filter-clear { min-height: 34px; padding: 0 10px; align-self: end; }
        .ruth-product-catalog-meta {
          min-height: 34px;
          padding: 0 11px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          border-bottom: 1px solid hsl(var(--border-subtle));
          color: hsl(var(--text-muted));
          font-size: 10px;
          font-weight: 650;
        }
        .ruth-product-catalog-results {
          max-height: calc(92vh - 320px);
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
        }
        .ruth-product-catalog-item {
          width: 100%;
          min-width: 0;
          display: grid;
          grid-template-columns: 44px minmax(0,1fr) auto;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border: 0;
          border-bottom: 1px solid hsl(var(--border-subtle));
          background: transparent;
          text-align: left;
          color: hsl(var(--text-main));
          cursor: pointer;
          transition: background .16s ease, transform .16s ease;
        }
        .ruth-product-catalog-item:focus-visible {
          background: hsl(var(--accent-soft));
          outline: 2px solid hsl(var(--accent));
          outline-offset: -2px;
        }
        @media (hover: hover) and (pointer: fine) {
          .ruth-product-catalog-item:hover { background: hsl(var(--surface-secondary)); }
        }
        .ruth-product-catalog-item.is-selected { background: hsl(var(--accent-soft)); }
        .ruth-product-catalog-image {
          width: 44px;
          height: 54px;
          overflow: hidden;
          border-radius: 10px;
          background: hsl(var(--surface-tertiary));
        }
        .ruth-product-catalog-image img { width: 100%; height: 100%; object-fit: cover; }
        .ruth-product-catalog-copy { min-width: 0; display: grid; gap: 2px; }
        .ruth-product-catalog-copy strong,
        .ruth-product-catalog-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ruth-product-catalog-copy strong { font-size: 12px; }
        .ruth-product-catalog-copy small { font-size: 9px; color: hsl(var(--text-muted)); }
        .ruth-product-catalog-copy em { font-style: normal; font-size: 11px; font-weight: 650; }
        .ruth-product-catalog-status {
          padding: 4px 7px;
          border-radius: 999px;
          background: hsl(var(--surface-tertiary));
          color: hsl(var(--text-muted));
          font-size: 9px;
          font-weight: 700;
          white-space: nowrap;
        }
        .ruth-product-catalog-status.status-active { background: color-mix(in srgb, var(--ruth-color-success, #1BA786) 12%, transparent); color: var(--ruth-color-success-text, #147B63); }
        .ruth-product-catalog-loading,
        .ruth-product-catalog-empty {
          min-height: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 16px;
          color: hsl(var(--text-muted));
          font-size: 12px;
          text-align: center;
        }
        @media (min-width: 1280px) {
          [data-exact-workspace-modal][data-workspace-kind="product"] [data-exact-base44-page="product-studio"] > div {
            grid-template-columns: minmax(280px,340px) minmax(0,1fr) !important;
          }
          .ruth-product-filter-toggle { display: none; }
          .ruth-product-filters { display: grid !important; }
        }
        @media (max-width: 1279px) {
          .ruth-product-filters { display: none; }
          .ruth-product-filters.is-open { display: grid; }
          .ruth-product-catalog-results {
            max-height: none;
            display: flex;
            gap: 8px;
            padding: 9px;
            overflow-x: auto;
            overflow-y: hidden;
            scroll-snap-type: x proximity;
          }
          .ruth-product-catalog-item {
            flex: 0 0 min(250px,76vw);
            grid-template-columns: 42px minmax(0,1fr);
            grid-template-areas: "image copy" "image status";
            border: 1px solid hsl(var(--border-subtle));
            border-radius: 13px;
            padding: 8px;
            scroll-snap-align: start;
          }
          .ruth-product-catalog-image { grid-area: image; width: 42px; height: 54px; }
          .ruth-product-catalog-copy { grid-area: copy; }
          .ruth-product-catalog-status { grid-area: status; justify-self: start; padding: 2px 6px; }
        }
        @media (max-width: 767px) {
          [data-exact-workspace-layer] { padding: 0 !important; }
          [data-exact-workspace-modal][data-workspace-kind="product"] {
            width: 100vw !important;
            max-width: 100vw !important;
            height: 100dvh !important;
            max-height: 100dvh !important;
            border-left: 0 !important;
            border-right: 0 !important;
            border-bottom: 0 !important;
            border-radius: 0 !important;
          }
          [data-exact-workspace-modal][data-workspace-kind="product"] header {
            min-height: 54px !important;
            padding: max(8px,env(safe-area-inset-top)) 10px 8px !important;
            gap: 8px !important;
          }
          [data-exact-workspace-modal][data-workspace-kind="product"] [data-product-workspace-toolbar] {
            min-height: 0 !important;
            padding: 7px 8px !important;
          }
          [data-exact-workspace-modal][data-workspace-kind="product"] [data-product-workspace-actions] {
            overflow: visible !important;
          }
          [data-exact-workspace-modal][data-workspace-kind="product"] [data-product-workspace-actions] > div {
            width: 100% !important;
            min-width: 0 !important;
            display: grid !important;
            grid-template-columns: repeat(2,minmax(0,1fr)) !important;
            gap: 6px !important;
          }
          [data-exact-workspace-modal][data-workspace-kind="product"] [data-product-workspace-actions] button {
            width: 100% !important;
            min-width: 0 !important;
            padding-inline: 8px !important;
            font-size: 10px !important;
            white-space: normal !important;
            line-height: 1.15 !important;
          }
          [data-exact-workspace-modal][data-workspace-kind="product"] > div:last-child {
            padding: 8px 8px max(12px,env(safe-area-inset-bottom)) !important;
            overflow-x: hidden !important;
          }
          [data-exact-workspace-modal][data-workspace-kind="product"] [data-exact-base44-page="product-studio"] > div {
            display: grid !important;
            grid-template-columns: minmax(0,1fr) !important;
            gap: 9px !important;
          }
          [data-exact-workspace-modal][data-workspace-kind="product"] [data-exact-base44-page="product-studio"] > div > :last-child {
            padding-block: 0 12px !important;
          }
          .ruth-product-catalog-panel { border-radius: 15px; }
          .ruth-product-catalog-head { padding: 8px; gap: 6px; }
          .ruth-product-search-wrap { height: 36px; }
          .ruth-product-filter-toggle { min-width: 74px; height: 36px; }
          .ruth-product-filters {
            grid-template-columns: 1fr 1fr;
            padding: 8px;
            gap: 6px;
          }
          .ruth-product-catalog-meta { min-height: 30px; }
          .ruth-product-catalog-results { padding: 7px 8px 8px; }
          .ruth-product-catalog-item { flex-basis: min(220px,78vw); }
        }
        @media (max-width: 390px) {
          [data-exact-workspace-modal][data-workspace-kind="product"] [data-product-workspace-actions] > div {
            grid-template-columns: minmax(0,1fr) !important;
          }
          .ruth-product-filters { grid-template-columns: minmax(0,1fr); }
          .ruth-product-filter-clear { width: 100%; }
        }
      `}</style>
      {panel}
    </>
  );
}
