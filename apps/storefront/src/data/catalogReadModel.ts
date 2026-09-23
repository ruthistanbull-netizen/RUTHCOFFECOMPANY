import { unstable_cache } from "next/cache";
import {
  automaticDiscountForItem,
  loadDiscountCampaignSettings,
  type DiscountCampaignSettings,
} from "@/lib/discountCampaigns";
import {
  isNecklaceProduct,
  isRingProduct,
  isRuthAtelierProduct,
  productHasImage,
} from "@/lib/productDisplay";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Product } from "@/types/site";

const READ_MODEL_TIMEOUT_MS = 1_800;
const PROJECTION_TABLE_TIMEOUT_MS = 2_500;
const DIRECT_LIVE_TIMEOUT_MS = 6_000;
const CACHE_REVALIDATE_SECONDS = 600;
const EMPTY_DISCOUNTS: DiscountCampaignSettings = { discounts: [], coupons: [], campaigns: [] };
let liveCatalogPromise: Promise<Product[]> | null = null;
let lastKnownGoodCatalog: Product[] | null = null;

function withTimeout<T>(value: PromiseLike<T> | Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} ${timeoutMs}ms içinde tamamlanmadı.`)), timeoutMs);
    Promise.resolve(value).then(
      (result) => { clearTimeout(timer); resolve(result); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function sortProducts(products: Product[]) {
  return [...products].sort((left, right) => {
    const order = (left.sort_order ?? Number.MAX_SAFE_INTEGER) - (right.sort_order ?? Number.MAX_SAFE_INTEGER);
    return order || String(left.name || "").localeCompare(String(right.name || ""), "tr");
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
  async () => withTimeout(loadDiscountCampaignSettings(), 900, "İndirim read-model sorgusu").catch(() => EMPTY_DISCOUNTS),
  ["ruth-storefront-discount-settings-v2"],
  { revalidate: 300, tags: ["rosta-discounts"] },
);

async function applyAutomaticDiscounts(products: Product[]) {
  const settings = await getCachedDiscountSettings();
  return products.map((product) => {
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
  });
}

async function fetchCatalogReadModel(): Promise<Product[]> {
  const supabase = getSupabaseAdmin();
  const result = await withTimeout(
    supabase.rpc("get_storefront_catalog"),
    READ_MODEL_TIMEOUT_MS,
    "Storefront katalog read-model sorgusu",
  );
  if (result.error) throw result.error;
  const values = Array.isArray(result.data) ? result.data : [];
  const products = values
    .map(normalizeProduct)
    .filter((product): product is Product => Boolean(product && product.status === "active"));
  return applyAutomaticDiscounts(sortProducts(products));
}

async function fetchProjectionTableFallback(): Promise<Product[]> {
  const supabase = getSupabaseAdmin();
  const result = await withTimeout(
    supabase
      .from("storefront_product_read_models")
      .select("payload,sort_order,name,product_id")
      .eq("status", "active")
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true }),
    PROJECTION_TABLE_TIMEOUT_MS,
    "Storefront projection tablosu sorgusu",
  );
  if (result.error) throw result.error;
  const products = (result.data || [])
    .map((row: any) => normalizeProduct(row?.payload))
    .filter((product): product is Product => Boolean(product && product.status === "active"));
  return applyAutomaticDiscounts(sortProducts(products));
}

async function fetchCanonicalLiveFallback(): Promise<Product[]> {
  // This is deliberately loaded only on read-model failure. site.ts is the
  // canonical direct DB reader used before the projection existed and does not
  // depend on catalogReadModel, so it gives us a panel-consistent emergency path
  // without mixing old generated-products into live commerce data.
  const { getProducts: getDirectProducts } = await import("@/data/site");
  const products = await withTimeout(
    getDirectProducts(),
    DIRECT_LIVE_TIMEOUT_MS,
    "Canonical canlı katalog sorgusu",
  );
  return sortProducts(
    products
      .map((product) => normalizeProduct(product))
      .filter((product): product is Product => Boolean(product && product.status === "active")),
  );
}

async function fetchCatalogCacheValue(): Promise<Product[]> {
  try {
    return await fetchCatalogReadModel();
  } catch (readModelError) {
    console.warn("Storefront katalog RPC yenilemesi gecikti; projection tablo fallback kullanılıyor.", {
      error: readModelError instanceof Error ? readModelError.message : String(readModelError),
    });
  }

  try {
    return await fetchProjectionTableFallback();
  } catch (projectionError) {
    console.warn("Storefront projection yenilemesi gecikti; canonical canlı DB fallback kullanılıyor.", {
      error: projectionError instanceof Error ? projectionError.message : String(projectionError),
    });
  }

  // Let a total data-source outage reject the cache refresh. Next then keeps the
  // previously cached value instead of replacing a healthy catalog with [] while
  // Supabase recovers.
  return fetchCanonicalLiveFallback();
}

const getCachedCatalogReadModel = unstable_cache(
  fetchCatalogCacheValue,
  ["ruth-storefront-catalog-read-model-v1"],
  {
    revalidate: CACHE_REVALIDATE_SECONDS,
    tags: ["rosta-products"],
  },
);

export async function getProducts(): Promise<Product[]> {
  if (liveCatalogPromise) return liveCatalogPromise;

  const promise = getCachedCatalogReadModel()
    .then((products) => {
      lastKnownGoodCatalog = products;
      return products;
    })
    .catch(async (readModelError) => {
      console.warn("Storefront katalog cache kullanılamadı; projection tablo fallback deneniyor.", readModelError);

      try {
        const projected = await fetchProjectionTableFallback();
        lastKnownGoodCatalog = projected;
        return projected;
      } catch (projectionError) {
        console.warn("Storefront projection tablosu kullanılamadı; canonical canlı DB fallback deneniyor.", projectionError);
      }

      try {
        const live = await fetchCanonicalLiveFallback();
        lastKnownGoodCatalog = live;
        return live;
      } catch (liveError) {
        console.error("Storefront canlı katalog kaynaklarının tamamı kullanılamadı.", liveError);
      }

      // Never resurrect generated/static products that may have been archived or
      // changed in the panel. A process-local last-known-good snapshot is safer;
      // on a cold start with a full DB outage we prefer an empty catalog over
      // selling stale/wrong inventory.
      return lastKnownGoodCatalog || [];
    })
    .finally(() => {
      liveCatalogPromise = null;
    });

  liveCatalogPromise = promise;
  return promise;
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const products = await getProducts();
  return products.find((product) => product.slug === slug) || null;
}

export async function getFeaturedProducts(): Promise<Product[]> {
  const products = await getProducts();
  const atelierPieces = products
    .filter((product) => isRuthAtelierProduct(product) && (isRingProduct(product) || isNecklaceProduct(product)))
    .sort((a, b) => {
      const newScore = Number(Boolean(b.is_new)) - Number(Boolean(a.is_new));
      if (newScore !== 0) return newScore;
      const featuredScore = Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured));
      if (featuredScore !== 0) return featuredScore;
      return (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER);
    });
  const featured = products
    .filter((product) => product.is_featured)
    .sort((a, b) => (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER));
  const rest = products
    .filter(productHasImage)
    .sort((a, b) => {
      const newScore = Number(Boolean(b.is_new)) - Number(Boolean(a.is_new));
      return newScore || (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER);
    });

  const bySlug = new Map<string, Product>();
  for (const product of [...atelierPieces, ...featured, ...rest]) {
    if (!productHasImage(product)) continue;
    if (!bySlug.has(product.slug)) bySlug.set(product.slug, product);
    if (bySlug.size >= 12) break;
  }
  return [...bySlug.values()];
}

export function toCatalogProduct(product: Product): Product {
  return {
    ...product,
    description: null,
    material_note: null,
    seo_title: null,
    seo_description: null,
    created_at: null,
    updated_at: null,
    image_urls: product.image_urls?.slice(0, 6) || null,
    variants: product.variants?.map((variant) => ({
      id: variant.id,
      sku: null,
      barcode: null,
      price: variant.price,
      compare_at_price: null,
      stock: null,
      stock_status: variant.stock_status,
      is_active: variant.is_active,
      options: variant.options || {},
      option_summary: variant.option_summary,
      ikas_url: variant.ikas_url,
      image_url: variant.image_url || null,
    })) || null,
  };
}

export function toCatalogProducts(products: Product[]) {
  return products.map(toCatalogProduct);
}
