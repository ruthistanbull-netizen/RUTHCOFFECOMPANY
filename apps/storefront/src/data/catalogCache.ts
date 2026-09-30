import { unstable_cache } from "next/cache";
import { getProducts } from "@/data/catalogReadModel";
import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  categoryAliases,
  categoryDescription,
  publicCategorySlug,
} from "@/lib/catalogCategories";
import type { Category, Collection, Product, SiteSetting } from "@/types/site";

const USE_SUPABASE_CATALOG =
  process.env.NEXT_PUBLIC_USE_SUPABASE_CATALOG !== "false";
const CACHE_REVALIDATE_SECONDS = Number(
  process.env.NEXT_PUBLIC_CATALOG_REVALIDATE_SECONDS || 60,
);

function getCatalogClient() {
  try {
    return getSupabaseAdmin();
  } catch {
    return supabase;
  }
}

function sortByOrder<T extends { sort_order: number | null; name?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return (a.name || "").localeCompare(b.name || "", "tr");
  });
}

async function readCollections(): Promise<Collection[]> {
  const client = getCatalogClient();
  if (!USE_SUPABASE_CATALOG || !client) return [];
  const { data, error } = await client
    .from("collections")
    .select("id, name, slug, description, cover_image_url, sort_order, status, created_at, updated_at")
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    console.error("Koleksiyonlar alınamadı:", error.message);
    return [];
  }
  const bySlug = new Map<string, Collection>();
  for (const collection of (data || []) as Collection[]) {
    const slug = String(collection.slug || "").trim();
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, collection);
  }
  return sortByOrder([...bySlug.values()]);
}

async function readCategories(): Promise<Category[]> {
  const client = getCatalogClient();
  if (!USE_SUPABASE_CATALOG || !client) return [];
  const { data, error } = await client
    .from("categories")
    .select("id, name, slug, description, cover_image_url, sort_order, status, created_at, updated_at")
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    console.error("Kategoriler alınamadı:", error.message);
    return [];
  }
  const bySlug = new Map<string, Category>();
  for (const row of (data || []) as Category[]) {
    const slug = publicCategorySlug(row.slug || row.name);
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, {
      ...row,
      slug,
      public_slug: slug,
      description: row.description || categoryDescription(slug),
    });
  }
  return [...bySlug.values()];
}

async function readSiteSettings(): Promise<Record<string, SiteSetting["setting_value"]>> {
  const client = getCatalogClient();
  if (!USE_SUPABASE_CATALOG || !client) return {};
  const { data, error } = await client.from("site_settings").select("*").eq("is_public", true);
  if (error) {
    console.error("Site ayarları alınamadı:", error.message);
    return {};
  }
  return ((data || []) as SiteSetting[]).reduce<Record<string, SiteSetting["setting_value"]>>((acc, setting) => {
    acc[setting.setting_key] = setting.setting_value;
    return acc;
  }, {});
}

const cachedCollections = unstable_cache(readCollections, ["rosta-live-collections-v1"], {
  revalidate: CACHE_REVALIDATE_SECONDS,
  tags: ["rosta-collections"],
});
const cachedCategories = unstable_cache(readCategories, ["rosta-live-categories-v1"], {
  revalidate: CACHE_REVALIDATE_SECONDS,
  tags: ["rosta-categories"],
});
const cachedSiteSettings = unstable_cache(readSiteSettings, ["rosta-public-site-settings-v1"], {
  revalidate: CACHE_REVALIDATE_SECONDS,
  tags: ["rosta-theme"],
});

type BestSellerOrder = {
  status?: string | null;
  payment_status?: string | null;
  imported_source?: string | null;
  customer_note?: string | null;
  admin_note?: string | null;
  order_items?: Array<{
    product_id?: string | null;
    product_slug?: string | null;
    quantity?: number | string | null;
  }> | null;
};

function paidBestSellerOrder(order: BestSellerOrder) {
  const payment = String(order.payment_status || "").toLocaleLowerCase("tr-TR");
  const status = String(order.status || "").toLocaleLowerCase("tr-TR");
  return ["paid", "succeeded", "success"].includes(payment) || ["paid", "completed"].includes(status);
}

function testBestSellerOrder(order: BestSellerOrder) {
  const source = String(order.imported_source || "").trim().toLocaleLowerCase("tr-TR");
  const note = `${String(order.customer_note || "")} ${String(order.admin_note || "")}`.toLocaleLowerCase("tr-TR");
  return source === "test" || source.includes("sandbox") || source.includes("demo") || note.includes("test sipariş") || note.includes("test siparis");
}

async function readBestSellingProducts(windowDays: number, limit: number): Promise<Product[]> {
  const client = getCatalogClient();
  if (!USE_SUPABASE_CATALOG || !client) return [];

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("orders")
    .select(`
      id, status, payment_status, created_at, imported_source, customer_note, admin_note,
      order_items (product_id, product_slug, quantity)
    `)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Çok satan ürünler için sipariş verisi alınamadı:", error.message);
    return [];
  }

  const byId = new Map<string, number>();
  const bySlug = new Map<string, number>();

  for (const order of (data || []) as BestSellerOrder[]) {
    if (!paidBestSellerOrder(order) || testBestSellerOrder(order)) continue;
    for (const item of order.order_items || []) {
      const quantity = Math.max(1, Math.trunc(Number(item.quantity || 1) || 1));
      const productId = String(item.product_id || "").trim();
      const productSlug = String(item.product_slug || "").trim();
      if (productId) byId.set(productId, (byId.get(productId) || 0) + quantity);
      else if (productSlug) bySlug.set(productSlug, (bySlug.get(productSlug) || 0) + quantity);
    }
  }

  const products = await getProducts();
  return products
    .map((product) => ({
      product,
      score: (byId.get(String(product.id)) || 0) + (bySlug.get(String(product.slug)) || 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) =>
      right.score - left.score
      || (left.product.sort_order ?? Number.MAX_SAFE_INTEGER) - (right.product.sort_order ?? Number.MAX_SAFE_INTEGER)
      || left.product.name.localeCompare(right.product.name, "tr"),
    )
    .slice(0, limit)
    .map((entry) => entry.product);
}

const cachedBestSellingProducts = unstable_cache(
  readBestSellingProducts,
  ["rosta-best-selling-products-v1"],
  { revalidate: 300, tags: ["rosta-products", "rosta-orders"] },
);

export function getCachedBestSellingProducts(windowDays = 30, limit = 12) {
  const safeWindow = windowDays === 7 || windowDays === 90 ? windowDays : 30;
  const safeLimit = Math.min(24, Math.max(1, Math.round(limit || 12)));
  return cachedBestSellingProducts(safeWindow, safeLimit);
}

export function getCachedCollections() { return cachedCollections(); }
export function getCachedCategories() { return cachedCategories(); }
export function getCachedSiteSettings() { return cachedSiteSettings(); }

export async function getCachedCollectionBySlug(slug: string): Promise<Collection | null> {
  const normalized = publicCategorySlug(slug);
  const collections = await getCachedCollections();
  return collections.find((collection) => publicCategorySlug(collection.slug) === normalized) || null;
}

export async function getCachedCategoryBySlug(slug: string): Promise<Category | null> {
  const normalizedAliases = new Set(categoryAliases(slug));
  const publicSlug = publicCategorySlug(slug);
  const categories = await getCachedCategories();
  return categories.find((category) => {
    const values = [category.slug, category.public_slug, category.name].flatMap((value) => categoryAliases(value));
    return values.some((value) => normalizedAliases.has(value)) || category.public_slug === publicSlug;
  }) || null;
}

function normalizedProductCategoryValues(product: Product) {
  return [...(product.category_names || []), ...(product.category_slugs || [])]
    .flatMap((value) => categoryAliases(value))
    .filter(Boolean);
}

export async function getCachedProductsByCollectionSlug(slug: string): Promise<Product[]> {
  const [collection, products] = await Promise.all([getCachedCollectionBySlug(slug), getProducts()]);
  if (!collection) return [];
  return products.filter((product) =>
    product.collection_id === collection.id
    || product.collections?.slug === slug
    || product.collection_slugs?.includes(collection.slug)
    || product.collection_slugs?.includes(slug)
  );
}

export async function getCachedProductsByCategorySlug(slug: string): Promise<Product[]> {
  const products = await getProducts();
  const publicSlug = publicCategorySlug(slug);
  if (publicSlug === "new-arrivals") return products.filter((product) => Boolean(product.is_new));

  const category = await getCachedCategoryBySlug(slug);
  if (!category) return [];
  const acceptedIds = new Set([String(category.id)]);
  const acceptedValues = new Set([
    ...categoryAliases(slug),
    ...categoryAliases(category.slug),
    ...categoryAliases(category.public_slug),
    ...categoryAliases(category.name),
  ]);
  return products.filter((product) => {
    if ((product.category_ids || []).some((id) => acceptedIds.has(String(id)))) return true;
    return normalizedProductCategoryValues(product).some((value) => acceptedValues.has(value));
  });
}
