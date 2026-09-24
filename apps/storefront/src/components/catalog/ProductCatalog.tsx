"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, SlidersHorizontal, X } from "lucide-react";
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
      className="flex w-full items-center gap-3 text-left text-sm"
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition ${
          checked ? "border-ink bg-ink text-cream" : "border-gold/35"
        }`}
      >
        {checked && <Check size={11} />}
      </span>
      <span className={checked ? "text-ink" : "text-muted-ruth"}>{label}</span>
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
      <div className="mb-5">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Ürünlerde ara..."
          className="w-full rounded-full border border-gold/20 bg-cream px-5 py-3 text-sm outline-none transition focus:border-gold-dark"
        />
      </div>

      {searchTerm && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-gold/15 bg-cream px-4 py-3 text-sm text-muted-ruth">
          <span>
            Arama: <span className="text-ink">{searchTerm}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              window.history.replaceState(null, "", window.location.pathname);
              setSearchTerm("");
            }}
            className="text-xs uppercase tracking-wide-luxe text-gold-dark"
          >
            Temizle
          </button>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between gap-4 border-b border-gold/15 pb-4">
        <button
          type="button"
          onClick={() => setMobileFiltersOpen(true)}
          className="flex items-center gap-2 text-sm lg:hidden"
        >
          <SlidersHorizontal size={16} />
          Filtrele {activeCount > 0 && `(${activeCount})`}
        </button>
        <p className="hidden text-sm text-muted-ruth lg:block">
          {filteredProducts.length} ürün
        </p>

        <label className="ml-auto flex items-center gap-3">
          <span className="hidden text-[10px] uppercase tracking-wide-luxe text-muted-ruth sm:block">
            Sırala
          </span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="cursor-pointer border-b border-gold/35 bg-transparent pb-1 text-sm outline-none"
            aria-label="Ürünleri sırala"
          >
            <option value="featured">Öne çıkanlar</option>
            <option value="newest">En yeniler</option>
            <option value="price-low">Fiyat: Artan</option>
            <option value="price-high">Fiyat: Azalan</option>
            <option value="name">İsme göre</option>
          </select>
        </label>
      </div>

      <div className="flex gap-10">
        <aside className="hidden w-56 shrink-0 lg:block">{filterContent}</aside>

        <div className="min-w-0 flex-1">
          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-5 sm:gap-y-12 xl:grid-cols-3">
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
            <div className="rounded-lg border border-gold/15 bg-cream px-6 py-20 text-center">
              <p className="font-heading text-xl">{emptyMessage}</p>
              <button
                type="button"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="mt-5 text-xs uppercase tracking-wide-luxe text-gold-dark"
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
            className="fixed inset-0 z-[85] bg-ink/45 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileFiltersOpen(false)}
          >
            <motion.aside
              className="absolute bottom-0 left-0 right-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-cream"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gold/15 bg-cream px-6 py-4">
                <h2 className="font-heading text-sm uppercase tracking-wide-luxe">
                  Filtreler {activeCount > 0 && `(${activeCount})`}
                </h2>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="flex h-9 w-9 items-center justify-center"
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
                    className="border border-gold/30 py-3 text-xs uppercase tracking-wide-luxe"
                  >
                    Temizle
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="bg-ink py-3 text-xs uppercase tracking-wide-luxe text-cream"
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
