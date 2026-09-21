import { unstable_cache } from "next/cache";
import { getProducts } from "@/data/catalogReadModel";
import {
  automaticDiscountForItem,
  loadDiscountCampaignSettings,
  type DiscountCampaignSettings,
} from "@/lib/discountCampaigns";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Product } from "@/types/site";

const READ_MODEL_TIMEOUT_MS = 1_500;
const WINDOW_BUDGET_MS = 1_900;
const CACHE_REVALIDATE_SECONDS = 600;
const EMPTY_DISCOUNTS: DiscountCampaignSettings = { discounts: [], coupons: [], campaigns: [] };

export type ProductPageWindow = {
  previous: Product | null;
  current: Product | null;
  next: Product | null;
  source: "live" | "static";
};

function withTimeout<T>(value: PromiseLike<T> | Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} ${timeoutMs}ms içinde tamamlanmadı.`)), timeoutMs);
    Promise.resolve(value).then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function normalizeProduct(value: unknown): Product | null {
  if (!value || typeof value !== "object") return null;
  const product = value as Product;
  if (!product.id || !product.slug) return null;
  return {
    ...product,
    image_urls: Array.isArray(product.image_urls) ? product.image_urls.filter(Boolean) : [],
    variants: Array.isArray(product.variants) ? product.variants : [],
    category_ids: Array.isArray(product.category_ids) ? product.category_ids : [],
    category_names: Array.isArray(product.category_names) ? product.category_names : [],
    category_slugs: Array.isArray(product.category_slugs) ? product.category_slugs : [],
    collection_ids: Array.isArray(product.collection_ids) ? product.collection_ids : [],
    collection_slugs: Array.isArray(product.collection_slugs) ? product.collection_slugs : [],
  };
}

const getCachedDiscountSettings = unstable_cache(
  async () => withTimeout(loadDiscountCampaignSettings(), 900, "Ürün indirimi read-model sorgusu").catch(() => EMPTY_DISCOUNTS),
  ["ruth-storefront-product-window-discounts-v2"],
  { revalidate: 300, tags: ["ruth-discounts"] },
);

function applyDiscount(product: Product | null, settings: DiscountCampaignSettings): Product | null {
  if (!product) return null;
  const categoryIds = (product.category_ids || []).map(String);
  const collectionIds = (product.collection_ids || []).map(String);
  const originalProductPrice = Number(product.price || 0);
  const productDiscount = automaticDiscountForItem({
    productId: product.id,
    categoryIds,
    collectionIds,
    quantity: 1,
    unitPrice: originalProductPrice,
  }, settings).discount;

  const variants = (product.variants || []).map((variant) => {
    const originalVariantPrice = Number(variant.price ?? originalProductPrice);
    const variantDiscount = automaticDiscountForItem({
      productId: product.id,
      categoryIds,
      collectionIds,
      quantity: 1,
      unitPrice: originalVariantPrice,
    }, settings).discount;
    if (variantDiscount <= 0) return variant;
    return {
      ...variant,
      compare_at_price: Math.max(Number(variant.compare_at_price || 0), originalVariantPrice),
      price: Number(Math.max(0.01, originalVariantPrice - variantDiscount).toFixed(2)),
    };
  });

  if (productDiscount <= 0) return { ...product, variants };
  return {
    ...product,
    compare_at_price: Math.max(Number(product.compare_at_price || 0), originalProductPrice),
    price: Number(Math.max(0.01, originalProductPrice - productDiscount).toFixed(2)),
    variants,
  };
}

async function fetchProductWindowReadModel(slug: string): Promise<ProductPageWindow> {
  const supabase = getSupabaseAdmin();
  const result = await withTimeout(
    supabase.rpc("get_storefront_product_window", { p_slug: slug }),
    READ_MODEL_TIMEOUT_MS,
    "Ürün sayfası read-model sorgusu",
  );
  if (result.error) throw result.error;

  const value = result.data && typeof result.data === "object"
    ? result.data as Record<string, unknown>
    : {};
  return {
    previous: normalizeProduct(value.previous),
    current: normalizeProduct(value.current),
    next: normalizeProduct(value.next),
    source: "live",
  };
}

async function lastKnownGoodWindow(slug: string): Promise<ProductPageWindow> {
  const products = (await getProducts())
    .filter((product) => product.status === "active" && product.slug)
    .sort((left, right) => {
      const order = (left.sort_order ?? Number.MAX_SAFE_INTEGER) - (right.sort_order ?? Number.MAX_SAFE_INTEGER);
      return order || String(left.name || "").localeCompare(String(right.name || ""), "tr");
    });
  const index = products.findIndex((product) => product.slug === slug);
  if (index < 0) return { previous: null, current: null, next: null, source: "static" };
  if (products.length === 1) return { previous: null, current: products[index], next: null, source: "static" };
  return {
    previous: products[(index - 1 + products.length) % products.length] || null,
    current: products[index] || null,
    next: products[(index + 1) % products.length] || null,
    source: "static",
  };
}

async function fetchProductWindowCacheValue(slug: string): Promise<ProductPageWindow> {
  try {
    return await fetchProductWindowReadModel(slug);
  } catch (readModelError) {
    console.warn("Ürün sayfası read-model cache yenilemesi gecikti; canlı katalog snapshot fallback kullanılıyor.", {
      slug,
      error: readModelError instanceof Error ? readModelError.message : String(readModelError),
    });

    const fallback = await lastKnownGoodWindow(slug);
    // If the fallback cannot prove that the product still exists, reject this
    // refresh so Next preserves any previously healthy cached window instead of
    // replacing it with a transient false 404 during a database slowdown.
    if (!fallback.current) throw readModelError;
    return fallback;
  }
}

function cachedProductWindow(slug: string) {
  return unstable_cache(
    () => fetchProductWindowCacheValue(slug),
    [`ruth-product-window-read-model-v2:${slug}`],
    {
      revalidate: CACHE_REVALIDATE_SECONDS,
      tags: ["ruth-product-windows", `ruth-product-window:${slug}`],
    },
  )();
}

export async function getProductPageWindow(slug: string): Promise<ProductPageWindow> {
  const normalizedSlug = decodeURIComponent(String(slug || "")).trim();
  if (!normalizedSlug) return { previous: null, current: null, next: null, source: "static" };

  try {
    const rawWindow = await withTimeout(
      cachedProductWindow(normalizedSlug),
      WINDOW_BUDGET_MS,
      "Ürün sayfası cache/read-model penceresi",
    );
    const settings = await getCachedDiscountSettings();
    return {
      previous: applyDiscount(rawWindow.previous, settings),
      current: applyDiscount(rawWindow.current, settings),
      next: applyDiscount(rawWindow.next, settings),
      source: rawWindow.source,
    };
  } catch (error) {
    console.warn("Ürün sayfası read-model yenilemesi gecikti; last-known-good katalog kullanılıyor.", {
      slug: normalizedSlug,
      error: error instanceof Error ? error.message : String(error),
    });
    return lastKnownGoodWindow(normalizedSlug);
  }
}
