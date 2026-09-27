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
  process.env.NEXT_PUBLIC_CATALOG_REVALIDATE_SECONDS || 600,
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
