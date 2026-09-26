"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import type { Product } from "@/types/site";
import {
  materialFilterValue,
  productCategoryValues,
  productCollectionFilterValue,
  productColorValues,
  productSearchText,
  productStoneValues,
  uniqueClean,
} from "@/lib/productDisplay";

type FilterKey = "materials" | "colors" | "stones" | "categories" | "collections" | "prices";

type Filters = {
  materials: string[];
  colors: string[];
  stones: string[];
  categories: string[];
  collections: string[];
  prices: string[];
};

const EMPTY_FILTERS: Filters = {
  materials: [],
  colors: [],
  stones: [],
  categories: [],
  collections: [],
  prices: [],
};

const PRICE_RANGES = [
  { id: "under-1000", label: "1000.00 TL altı", min: 0, max: 1000 },
  { id: "1000-2000", label: "1000.00 TL – 2000.00 TL", min: 1000, max: 2000 },
  { id: "over-2000", label: "2000.00 TL üzeri", min: 2000, max: Number.POSITIVE_INFINITY },
];

const SORT_OPTIONS = [
  { value: "featured", label: "Öne çıkanlar" },
  { value: "newest", label: "En yeniler" },
  { value: "price-low", label: "Fiyat: Artan" },
  { value: "price-high", label: "Fiyat: Azalan" },
  { value: "name", label: "İsme göre" },
] as const;

function numericPrice(product: Product) {
  const value = Number(product.price);
  return Number.isFinite(value) ? value : 0;
}

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/û/g, "u")
    .replace(/ê/g, "e")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function searchMatches(text: string, query: string) {
  const normalizedText = normalizeSearch(text);
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  return normalizedQuery.split(/\s+/).every((token) => normalizedText.includes(token));
}

function hasAny(values: string[], selected: string[]) {
  return selected.some((item) => values.includes(item));
}

function FilterOption({
  checked,
  label,
  onClick,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition ${
          checked ? "border-brick bg-brick text-[var(--rosta-action-text)]" : "border-kraft/45 bg-carbon-soft"
        }`}
      >
        {checked && <Check size={11} />}
      </span>
      <span className={checked ? "text-cream" : "text-cream/70"}>{label}</span>
    </button>
  );
}

export function ProductCatalog({
  products,
  emptyMessage = "Bu seçimlerle eşleşen ürün bulunamadı.",
  showProductDescriptions = false,
}: {
  products: Product[];
  emptyMessage?: string;
  showProductDescriptions?: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState("featured");
  const [sortOpen, setSortOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSearchTerm((params.get("search") || "").trim());
  }, []);

  const searchableProducts = useMemo(
    () => products.filter((product) => product.main_image_url || product.image_urls?.length),
    [products]
  );

  const materials = useMemo(
    () => uniqueClean(searchableProducts.map((product) => materialFilterValue(product))).sort((a, b) => a.localeCompare(b, "tr")),
    [searchableProducts]
  );
  const colors = useMemo(
    () => uniqueClean(searchableProducts.flatMap((product) => productColorValues(product))).sort((a, b) => a.localeCompare(b, "tr")),
    [searchableProducts]
  );
  const stones = useMemo(
    () => uniqueClean(searchableProducts.flatMap((product) => productStoneValues(product))).sort((a, b) => a.localeCompare(b, "tr")),
    [searchableProducts]
  );
  const categories = useMemo(
    () => uniqueClean(searchableProducts.flatMap((product) => productCategoryValues(product))).sort((a, b) => a.localeCompare(b, "tr")),
    [searchableProducts]
  );
  const collections = useMemo(
    () => uniqueClean(searchableProducts.map((product) => productCollectionFilterValue(product))).sort((a, b) => a.localeCompare(b, "tr")),
    [searchableProducts]
  );
  const availablePriceRanges = useMemo(
    () =>
      PRICE_RANGES.filter((range) =>
        searchableProducts.some((product) => {
          const price = numericPrice(product);
          return price >= range.min && price < range.max;
        })
      ),
    [searchableProducts]
  );

  const filteredProducts = useMemo(() => {
    let result = [...searchableProducts];
    const query = searchTerm.trim();

    if (query) {
      result = result.filter((product) => searchMatches(productSearchText(product), query));
    }

    if (filters.materials.length) {
      result = result.filter((product) => {
        const material = materialFilterValue(product);
        return Boolean(material && filters.materials.includes(material));
      });
    }
    if (filters.colors.length) {
      result = result.filter((product) => hasAny(productColorValues(product), filters.colors));
    }
    if (filters.stones.length) {
      result = result.filter((product) => hasAny(productStoneValues(product), filters.stones));
    }
    if (filters.categories.length) {
      result = result.filter((product) => hasAny(productCategoryValues(product), filters.categories));
    }
    if (filters.collections.length) {
      result = result.filter((product) => {
        const collection = productCollectionFilterValue(product);
        return Boolean(collection && filters.collections.includes(collection));
      });
    }
    if (filters.prices.length) {
      result = result.filter((product) => {
        const price = numericPrice(product);
        return PRICE_RANGES.some(
          (range) =>
            filters.prices.includes(range.id) && price >= range.min && price < range.max
        );
      });
    }

    if (sort === "price-low") {
      result.sort((a, b) => numericPrice(a) - numericPrice(b));
    } else if (sort === "price-high") {
      result.sort((a, b) => numericPrice(b) - numericPrice(a));
    } else if (sort === "newest") {
      result.sort((a, b) => Number(Boolean(b.is_new)) - Number(Boolean(a.is_new)));
    } else if (sort === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    } else {
      result.sort(
        (a, b) => (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER)
      );
    }

    return result;
  }, [filters, searchableProducts, searchTerm, sort]);

  useEffect(() => {
    if (!mobileFiltersOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileFiltersOpen]);

  const toggleFilter = (key: FilterKey, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  };

  const activeCount = Object.values(filters).reduce(
    (total, values) => total + values.length,
    0
  );

  const filterContent = (
    <div className="space-y-8">
      {materials.length > 0 && (
        <div>
          <h3 className="mb-4 font-heading text-xs uppercase tracking-wide-luxe">
            Materyal
          </h3>
          <div className="space-y-3">
            {materials.map((material) => (
              <FilterOption
                key={material}
                label={material}
                checked={filters.materials.includes(material)}
                onClick={() => toggleFilter("materials", material)}
              />
            ))}
          </div>
        </div>
      )}

      {colors.length > 0 && (
        <div>
          <h3 className="mb-4 font-heading text-xs uppercase tracking-wide-luxe">
            Renk / Kaplama
          </h3>
          <div className="space-y-3">
            {colors.map((color) => (
              <FilterOption
                key={color}
                label={color}
                checked={filters.colors.includes(color)}
                onClick={() => toggleFilter("colors", color)}
              />
            ))}
          </div>
        </div>
      )}

      {stones.length > 0 && (
        <div>
          <h3 className="mb-4 font-heading text-xs uppercase tracking-wide-luxe">
            Taş / Seçenek
          </h3>
          <div className="space-y-3">
            {stones.map((stone) => (
              <FilterOption
                key={stone}
                label={stone}
                checked={filters.stones.includes(stone)}
                onClick={() => toggleFilter("stones", stone)}
              />
            ))}
          </div>
        </div>
      )}

      {categories.length > 0 && (
        <div>
          <h3 className="mb-4 font-heading text-xs uppercase tracking-wide-luxe">
            Kategori
          </h3>
          <div className="space-y-3">
            {categories.map((category) => (
              <FilterOption
                key={category}
                label={category}
                checked={filters.categories.includes(category)}
                onClick={() => toggleFilter("categories", category)}
              />
            ))}
          </div>
        </div>
      )}

      {availablePriceRanges.length > 0 && (
        <div>
          <h3 className="mb-4 font-heading text-xs uppercase tracking-wide-luxe">
            Fiyat
          </h3>
          <div className="space-y-3">
            {availablePriceRanges.map((range) => (
              <FilterOption
                key={range.id}
                label={range.label}
                checked={filters.prices.includes(range.id)}
                onClick={() => toggleFilter("prices", range.id)}
              />
            ))}
          </div>
        </div>
      )}

      {collections.length > 1 && (
        <div>
          <h3 className="mb-4 font-heading text-xs uppercase tracking-wide-luxe">
            Koleksiyon
          </h3>
          <div className="space-y-3">
            {collections.map((collection) => (
              <FilterOption
                key={collection}
                label={collection}
                checked={filters.collections.includes(collection)}
                onClick={() => toggleFilter("collections", collection)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <style>{`.theme-product-grid{display:grid;width:100%;max-width:var(--theme-product-grid-max-width,none);margin-inline:auto;grid-template-columns:repeat(var(--theme-product-grid-columns,2),minmax(0,1fr));column-gap:var(--theme-product-grid-gap-x,16px);row-gap:var(--theme-product-grid-gap-y,32px)}@media(min-width:640px){.theme-product-grid{column-gap:var(--theme-product-grid-gap-x,20px);row-gap:var(--theme-product-grid-gap-y,48px)}}@media(min-width:1280px){.theme-product-grid{grid-template-columns:repeat(var(--theme-product-grid-columns,3),minmax(0,1fr))}}`}</style>
      <div
        data-editor-id="catalog-search"
        data-editor-type="filter-controls"
        data-editor-label="Katalog Arama"
        className="mb-5"
      >
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Ürünlerde ara..."
          className="w-full rounded-full border border-kraft/40 bg-carbon-soft px-5 py-3 text-sm text-cream outline-none transition placeholder:text-cream/45 focus:border-brick focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-brick"
        />
      </div>

      {searchTerm && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-kraft/35 bg-carbon-soft px-4 py-3 text-sm text-cream/70">
          <span>
            Arama: <span className="text-cream">{searchTerm}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              window.history.replaceState(null, "", window.location.pathname);
              setSearchTerm("");
            }}
            className="text-xs uppercase tracking-wide-luxe text-brick focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
          >
            Temizle
          </button>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between gap-4 border-b border-kraft/35 pb-4">
        <button
          data-editor-id="catalog-filter-trigger"
          data-editor-type="filter-controls"
          data-editor-label="Filtre Butonu"
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="flex items-center gap-2 text-sm text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick lg:hidden"
        >
          <SlidersHorizontal size={16} />
          Filtrele {activeCount > 0 && `(${activeCount})`}
        </button>
        <p className="hidden text-sm text-cream/70 lg:block">
          {filteredProducts.length} ürün
        </p>

        <div
          data-editor-id="catalog-sort-control"
          data-editor-type="sort-control"
          data-editor-label="Sıralama Kontrolü"
          className="relative ml-auto flex items-center gap-3"
        >
          <span className="hidden text-[10px] uppercase tracking-wide-luxe text-cream/60 sm:block">
            Sırala
          </span>
          <button
            type="button"
            onClick={() => setSortOpen((current) => !current)}
            className="flex min-w-[168px] items-center justify-between gap-4 rounded-full border border-kraft/40 bg-carbon-soft px-4 py-2.5 text-sm text-cream shadow-[0_8px_24px_color-mix(in_srgb,var(--rosta-carbon)_26%,transparent)] transition-colors active:border-brick/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
            aria-label="Ürünleri sırala"
            aria-haspopup="listbox"
            aria-expanded={sortOpen}
          >
            <span>{SORT_OPTIONS.find((option) => option.value === sort)?.label || "Öne çıkanlar"}</span>
            <ChevronDown
              size={16}
              strokeWidth={1.4}
              className={`shrink-0 transition-transform duration-200 ${sortOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>

          <AnimatePresence>
            {sortOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-[68] cursor-default"
                  aria-label="Sıralama listesini kapat"
                  onClick={() => setSortOpen(false)}
                />
                <motion.div
                  role="listbox"
                  aria-label="Ürün sıralaması"
                  className="absolute right-0 top-full z-[69] mt-2 w-[220px] overflow-hidden rounded-[24px] border border-kraft/40 bg-carbon-soft p-2 text-cream shadow-[0_18px_50px_color-mix(in_srgb,var(--rosta-carbon)_52%,transparent)]"
                  initial={{ opacity: 0, y: 6, scale: 0.985 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.985 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  {SORT_OPTIONS.map((option) => {
                    const selected = option.value === sort;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setSort(option.value);
                          setSortOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-[16px] px-4 py-3 text-left text-[11px] uppercase tracking-[0.16em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brick ${selected ? "bg-cream/[0.07] text-brick" : "text-cream hover:bg-cream/[0.05]"}`}
                      >
                        <span>{option.label}</span>
                        {selected ? <Check size={14} strokeWidth={1.5} aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </motion.div>
              </>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <div
        data-editor-id="catalog-shell"
        data-editor-type="catalog-shell"
        data-editor-label="Katalog Sayfası"
        className="flex gap-10"
      >
        <aside
          data-editor-id="catalog-filter-panel"
          data-editor-type="filter-controls"
          data-editor-label="Filtreler"
          className="hidden w-56 shrink-0 lg:block"
        >{filterContent}</aside>

        <div className="min-w-0 flex-1">
          {filteredProducts.length > 0 ? (
            <div
              data-editor-id="catalog-product-grid"
              data-editor-type="product-grid"
              data-editor-label="Ürün Grid'i"
              className="theme-product-grid"
            >
              {filteredProducts.map((product, index) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  index={index}
                  showShortDescription={showProductDescriptions}
                />
              ))}
            </div>
          ) : (
            <div data-editor-id="catalog-empty-state" data-editor-type="empty-state" data-editor-label="Boş Katalog Durumu" className="rounded-lg border border-kraft/35 bg-carbon-soft px-6 py-20 text-center text-cream">
              <p className="font-heading text-xl">{emptyMessage}</p>
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="mt-5 text-xs uppercase tracking-wide-luxe text-brick focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
              >
                Filtreleri Temizle
              </button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {mobileFiltersOpen && (
          <motion.div
            className="fixed inset-0 z-[85] bg-carbon/75 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileFiltersOpen(false)}
          >
            <motion.aside
              data-editor-id="catalog-mobile-filter-panel"
              data-editor-type="filter-controls"
              data-editor-label="Mobil Filtreler"
              className="absolute bottom-0 left-0 right-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-kraft/35 bg-carbon-soft text-cream"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-kraft/35 bg-carbon-soft px-6 py-4">
                <h2 className="font-heading text-sm uppercase tracking-wide-luxe">
                  Filtreler {activeCount > 0 && `(${activeCount})`}
                </h2>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="flex h-9 w-9 items-center justify-center text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
                  aria-label="Filtreleri kapat"
                >
                  <X size={19} />
                </button>
              </div>
              <div className="px-6 py-6">
                {filterContent}
                <div className="mt-8 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="border border-kraft/45 py-3 text-xs uppercase tracking-wide-luxe text-cream active:border-espresso active:bg-espresso focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
                  >
                    Temizle
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="bg-brick py-3 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)] active:bg-espresso focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick"
                  >
                    Göster ({filteredProducts.length})
                  </button>
                </div>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
