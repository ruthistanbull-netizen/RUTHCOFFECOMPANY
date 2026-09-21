import {
  getCachedProductsByCategorySlug,
  getCachedProductsByCollectionSlug,
} from "@/data/catalogCache";
import { getProductPageWindow, type ProductPageWindow } from "@/data/productPageData";
import type { Product } from "@/types/site";

type CatalogSource =
  | { type: "collection"; slug: string }
  | { type: "category"; slug: string };

function decodeSource(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function parseCatalogSource(value: string | null | undefined): CatalogSource | null {
  const source = decodeSource(value).replace(/\/+$/, "");
  const collection = source.match(/^\/collections\/([^/]+)$/i);
  if (collection?.[1]) return { type: "collection", slug: collection[1] };
  const category = source.match(/^\/(?:category|categories)\/([^/]+)$/i);
  if (category?.[1]) return { type: "category", slug: category[1] };
  return null;
}

function hasProductImage(product: Product) {
  return Boolean(product.main_image_url || product.image_urls?.some(Boolean));
}

function compareCatalogProducts(left: Product, right: Product) {
  const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  const nameOrder = String(left.name || "").localeCompare(String(right.name || ""), "tr", { sensitivity: "base" });
  if (nameOrder !== 0) return nameOrder;
  return String(left.slug || "").localeCompare(String(right.slug || ""), "tr");
}

function stableCatalogProducts(products: Product[]) {
  const unique = new Map<string, Product>();
  for (const product of products) {
    if (product.status !== "active" || !hasProductImage(product) || !product.slug || unique.has(product.slug)) continue;
    unique.set(product.slug, product);
  }
  return [...unique.values()].sort(compareCatalogProducts);
}

function contextualWindow(products: Product[], slug: string, fallback: ProductPageWindow): ProductPageWindow | null {
  const ordered = stableCatalogProducts(products);
  const index = ordered.findIndex((product) => product.slug === slug);
  if (index < 0) return null;
  const current = fallback.current || ordered[index] || null;
  if (!current) return null;
  if (ordered.length === 1) return { previous: null, current, next: null, source: fallback.source };
  return {
    previous: ordered[(index - 1 + ordered.length) % ordered.length] || null,
    current,
    next: ordered[(index + 1) % ordered.length] || null,
    source: fallback.source,
  };
}

export async function getProductPageWindowForSource(
  slug: string,
  sourceValue?: string | null,
): Promise<ProductPageWindow> {
  const fallback = await getProductPageWindow(slug);
  if (!fallback.current) return fallback;
  const source = parseCatalogSource(sourceValue);
  if (!source) return fallback;

  try {
    const products = source.type === "collection"
      ? await getCachedProductsByCollectionSlug(source.slug)
      : await getCachedProductsByCategorySlug(source.slug);
    return contextualWindow(products, fallback.current.slug, fallback) || fallback;
  } catch (error) {
    console.error("Ürün gezinme kaynağı çözümlenemedi:", error);
    return fallback;
  }
}
