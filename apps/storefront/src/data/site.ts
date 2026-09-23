import { unstable_cache, unstable_noStore as noStore } from "next/cache";
import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { automaticDiscountForItem, loadDiscountCampaignSettings } from "@/lib/discountCampaigns";
import { productHasImage } from "@/lib/productDisplay";
import { getCollectionCover } from "@/lib/collectionDisplay";
import {
  categoryAliases,
  categoryDescription,
  publicCategorySlug,
} from "@/lib/catalogCategories";
export { getCollectionCover } from "@/lib/collectionDisplay";
export { formatPrice } from "@/lib/formatPrice";
import type {
  Category,
  Collection,
  HomepageSection,
  Product,
  SiteSetting,
} from "@/types/site";
import {
  defaultThemeCustomizerSettings,
  normalizeThemeCustomizerSettings,
  type ThemeCustomizerSettings,
} from "@/lib/themeCustomizer";
import { applyRostaStorefrontDesignSystem } from "@/lib/rostaDesignSystem";
// ROSTA never falls back to any copied legacy static catalog.
// If ROSTA Supabase is unavailable, serving an empty/last-known-good catalog
// is safer than exposing stale products from another brand.
const fallbackProducts: Product[] = [];
const USE_SUPABASE_CATALOG =
  process.env.NEXT_PUBLIC_USE_SUPABASE_CATALOG !== "false";
let staticProductsCache: Product[] | null = null;

const FAST_NAVIGATION_MODE = process.env.NEXT_PUBLIC_FAST_NAVIGATION_MODE !== "false";
const FORCE_LIVE_SUPABASE_READS =
  process.env.NEXT_PUBLIC_FORCE_LIVE_SUPABASE_READS === "true" && !FAST_NAVIGATION_MODE;
const FORCE_LIVE_THEME_READS =
  process.env.NEXT_PUBLIC_FORCE_LIVE_THEME_READS === "true" && !FAST_NAVIGATION_MODE;
const NEXT_CACHE_REVALIDATE_SECONDS = Number(process.env.NEXT_PUBLIC_CATALOG_REVALIDATE_SECONDS || 600);
const THEME_CACHE_REVALIDATE_SECONDS = 10;

function getCatalogClient() {
  try {
    return getSupabaseAdmin();
  } catch {
    return supabase;
  }
}

let liveProductsPromise: Promise<Product[]> | null = null;
let liveCollectionsPromise: Promise<Collection[]> | null = null;
let liveCategoriesPromise: Promise<Category[]> | null = null;
let liveThemePromise: Promise<ThemeCustomizerSettings> | null = null;

const LOCAL_PRODUCT_IMAGES: Record<string, string> = {};
const PRODUCT_PLACEHOLDER_IMAGE = "/product-placeholder.svg";

type SupabaseProductImage = {
  variant_id?: string | null;
  image_url: string | null;
  alt_text?: string | null;
  sort_order?: number | null;
  is_main?: boolean | null;
};

type SupabaseProductVariant = {
  id: string;
  sku: string | null;
  barcode: string | null;
  price: number | string | null;
  compare_at_price: number | string | null;
  stock: number | null;
  stock_status: "in_stock" | "out_of_stock" | "preorder";
  is_active: boolean | null;
  options: Record<string, string> | null;
  option_summary: string | null;
  ikas_url: string | null;
  image_url?: string | null;
};

type SupabaseProductCategoryRelation = {
  categories?: { id: string; name: string | null; slug: string | null } | null;
};

type SupabaseProductCollectionRelation = {
  collections?: { id: string; name: string | null; slug: string | null } | null;
};

type SupabaseProductRow = Product & {
  product_images?: SupabaseProductImage[] | null;
  product_variants?: SupabaseProductVariant[] | null;
  product_categories?: SupabaseProductCategoryRelation[] | null;
  product_collections?: SupabaseProductCollectionRelation[] | null;
};

function normalizeSupabaseProduct(row: SupabaseProductRow): Product {
  const imageRows = [...(row.product_images || [])].sort((a, b) => {
    const mainScore = Number(Boolean(b.is_main)) - Number(Boolean(a.is_main));
    if (mainScore !== 0) return mainScore;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const imageUrls = imageRows
    .map((image) => image.image_url)
    .filter((value): value is string => Boolean(value));

  const imageByVariant = new Map<string, string>();
  for (const image of imageRows) {
    if (
      image.variant_id &&
      image.image_url &&
      !imageByVariant.has(image.variant_id)
    ) {
      imageByVariant.set(image.variant_id, image.image_url);
    }
  }

  const variants = [...(row.product_variants || [])]
    .filter((variant) => variant.is_active !== false)
    .sort((a, b) =>
      (a.option_summary || "").localeCompare(b.option_summary || "", "tr"),
    )
    .map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      barcode: variant.barcode,
      price: variant.price,
      compare_at_price: variant.compare_at_price,
      stock: variant.stock,
      stock_status:
        Number(variant.stock || 0) > 0 ? "in_stock" : variant.stock_status,
      is_active: variant.is_active,
      options: variant.options || {},
      option_summary: variant.option_summary || "",
      ikas_url: variant.ikas_url,
      image_url: variant.image_url || imageByVariant.get(variant.id) || null,
    }));

  const categoryRows = (row.product_categories || [])
    .map((item) => item.categories)
    .filter(
      (
        item,
      ): item is { id: string; name: string | null; slug: string | null } =>
        Boolean(item?.id),
    );

  const collectionRows = (row.product_collections || [])
    .map((item) => item.collections)
    .filter(
      (
        item,
      ): item is { id: string; name: string | null; slug: string | null } =>
        Boolean(item?.id),
    );

  const hasVariantStock = variants.some(
    (variant) =>
      variant.stock_status !== "out_of_stock" && Number(variant.stock || 0) > 0,
  );
  const allVariantsEmpty = variants.length > 0 && !hasVariantStock;

  const {
    product_images: _images,
    product_variants: _variants,
    product_categories: _categories,
    product_collections: _collections,
    ...product
  } = row;

  return {
    ...product,
    stock_status: variants.length
      ? hasVariantStock
        ? "in_stock"
        : allVariantsEmpty
          ? "out_of_stock"
          : product.stock_status
      : product.stock_status,
    main_image_url: product.main_image_url || imageUrls[0] || null,
    image_urls: imageUrls.length ? imageUrls : product.image_urls || null,
    variants: variants.length ? variants : product.variants || null,
    collection_id: product.collection_id || collectionRows[0]?.id || null,
    collections: product.collections || (collectionRows[0] ? {
      id: collectionRows[0].id,
      name: collectionRows[0].name || "Koleksiyon",
      slug: collectionRows[0].slug || "",
      description: null,
      cover_image_url: null,
    } : null),
    category_ids: [...new Set(categoryRows.map((item) => item.id).filter(Boolean))],
    collection_ids: [...new Set(collectionRows.map((item) => item.id).filter(Boolean))],
    category_names: [
      ...new Set([
        ...(product.category_names || []),
        ...categoryRows
          .map((item) => item.name)
          .filter((value): value is string => Boolean(value)),
      ]),
    ],
    category_slugs: [
      ...new Set([
        ...(product.category_slugs || []),
        ...categoryRows
          .map((item) => item.slug)
          .filter((value): value is string => Boolean(value)),
      ]),
    ],
    collection_slugs: [
      ...new Set([
        ...(product.collection_slugs || []),
        ...collectionRows
          .map((item) => item.slug)
          .filter((value): value is string => Boolean(value)),
      ]),
    ],
  };
}

function sortByOrder<T extends { sort_order: number | null; name?: string }>(
  items: T[],
) {
  return [...items].sort((a, b) => {
    const orderA = a.sort_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.sort_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return (a.name || "").localeCompare(b.name || "", "tr");
  });
}

function applyLocalCollectionCover<
  T extends Pick<Collection, "slug" | "name" | "cover_image_url">,
>(collection: T): T {
  return collection;
}

function withLocalCollections(collections: Collection[]) {
  const bySlug = new Map<string, Collection>();
  for (const collection of collections) {
    const slug = String(collection.slug || "").trim();
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, collection);
  }
  return sortByOrder([...bySlug.values()]);
}

function withLocalProductDefaults(product: Product): Product {
  const fallback = fallbackProducts.find((item) => item.slug === product.slug);
  const image =
    product.main_image_url ||
    LOCAL_PRODUCT_IMAGES[product.slug] ||
    fallback?.main_image_url ||
    PRODUCT_PLACEHOLDER_IMAGE;
  const imageUrls = product.image_urls?.length
    ? product.image_urls
    : fallback?.image_urls?.length
      ? fallback.image_urls
      : image
        ? [image]
        : null;

  return {
    ...fallback,
    ...product,
    main_image_url: image || null,
    image_urls: imageUrls,
    variants: product.variants?.length
      ? product.variants
      : fallback?.variants || product.variants,
    stock_status: product.variants?.some(
      (variant) =>
        variant.stock_status !== "out_of_stock" &&
        Number(variant.stock || 0) > 0,
    )
      ? "in_stock"
      : product.variants?.length
        ? "out_of_stock"
        : product.stock_status || fallback?.stock_status,
    collections: product.collections
      ? applyLocalCollectionCover(product.collections)
      : null,
  };
}

function withLocalProducts(
  products: Product[],
  includeMissingFallbacks = false,
) {
  const bySlug = new Map<string, Product>();

  for (const product of products) {
    bySlug.set(product.slug, withLocalProductDefaults(product));
  }

  // Canlı Supabase katalog kullanılırken eski statik ürünleri karıştırma.
  // Yoksa panelde olmayan ürünler özellikle Set kategorisinde görünür ve stok panelle uyuşmaz.
  if (includeMissingFallbacks) {
    for (const product of fallbackProducts) {
      if (!bySlug.has(product.slug)) {
        bySlug.set(product.slug, withLocalProductDefaults(product));
      }
    }
  }

  return sortByOrder([...bySlug.values()]);
}

function getStaticProducts() {
  if (!staticProductsCache)
    staticProductsCache = withLocalProducts(fallbackProducts, true);
  return staticProductsCache;
}

function getStaticCollections(): Collection[] {
  return [];
}

function getStaticCategories(): Category[] {
  return [];
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
    variants:
      product.variants?.map((variant) => ({
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

export function toCatalogProducts(products: Product[]): Product[] {
  return products.map(toCatalogProduct);
}

export async function getRelatedProducts(slug: string): Promise<Product[]> {
  const products = await getProducts();
  const current = products.find((product) => product.slug === slug);
  const related = products
    .filter((product) => product.slug !== slug && productHasImage(product))
    .sort((a, b) => {
      const sameCollectionA = Number(
        Boolean(
          current &&
          (a.collection_id === current.collection_id ||
            a.collections?.slug === current.collections?.slug ||
            a.collection_slugs?.some((item) =>
              current.collection_slugs?.includes(item),
            )),
        ),
      );
      const sameCollectionB = Number(
        Boolean(
          current &&
          (b.collection_id === current.collection_id ||
            b.collections?.slug === current.collections?.slug ||
            b.collection_slugs?.some((item) =>
              current.collection_slugs?.includes(item),
            )),
        ),
      );
      if (sameCollectionA !== sameCollectionB)
        return sameCollectionB - sameCollectionA;
      return (
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
        (b.sort_order ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .slice(0, 4)
    .map((product) => toCatalogProduct(withLocalProductDefaults(product)));

  return related;
}

function byProductId<T extends { product_id?: string | null }>(
  rows: T[] | null | undefined,
) {
  const map = new Map<string, T[]>();
  for (const row of rows || []) {
    const productId = String(row.product_id || "");
    if (!productId) continue;
    const list = map.get(productId) || [];
    list.push(row);
    map.set(productId, list);
  }
  return map;
}

async function attachProductRelations(
  products: Product[],
): Promise<SupabaseProductRow[]> {
  const client = getCatalogClient();
  if (!client || products.length === 0)
    return products as SupabaseProductRow[];

  const productIds = products
    .map((product) => String(product.id))
    .filter(Boolean);
  if (!productIds.length) return products as SupabaseProductRow[];

  const [
    imagesResult,
    variantsResult,
    categoryLinksResult,
    collectionLinksResult,
  ] = await Promise.all([
    client
      .from("product_images")
      .select(
        "product_id, variant_id, image_url, alt_text, sort_order, is_main",
      )
      .in("product_id", productIds),
    client
      .from("product_variants")
      .select(
        "id, product_id, sku, barcode, price, compare_at_price, stock, stock_status, is_active, options, option_summary, ikas_url, image_url",
      )
      .in("product_id", productIds),
    client
      .from("product_categories")
      .select("product_id, category_id")
      .in("product_id", productIds),
    client
      .from("product_collections")
      .select("product_id, collection_id")
      .in("product_id", productIds),
  ]);

  if (imagesResult.error)
    console.error(
      "Ürün fotoğraf ilişkileri alınamadı:",
      imagesResult.error.message,
    );
  if (variantsResult.error)
    console.error("Ürün varyantları alınamadı:", variantsResult.error.message);
  if (categoryLinksResult.error)
    console.error(
      "Ürün kategori ilişkileri alınamadı:",
      categoryLinksResult.error.message,
    );
  if (collectionLinksResult.error)
    console.error(
      "Ürün koleksiyon ilişkileri alınamadı:",
      collectionLinksResult.error.message,
    );

  const categoryLinks = (categoryLinksResult.data || []) as Array<{
    product_id: string;
    category_id: string;
  }>;
  const collectionLinks = (collectionLinksResult.data || []) as Array<{
    product_id: string;
    collection_id: string;
  }>;
  const categoryIds = [
    ...new Set(
      categoryLinks.map((item) => String(item.category_id)).filter(Boolean),
    ),
  ];
  const collectionIds = [
    ...new Set([
      ...collectionLinks.map((item) => String(item.collection_id)).filter(Boolean),
      ...products.map((product) => String(product.collection_id || "")).filter(Boolean),
    ]),
  ];

  const [categoriesResult, collectionsResult] = await Promise.all([
    categoryIds.length
      ? client
          .from("categories")
          .select("id, name, slug")
          .in("id", categoryIds)
      : Promise.resolve({ data: [], error: null }),
    collectionIds.length
      ? client
          .from("collections")
          .select("id, name, slug")
          .in("id", collectionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (categoriesResult.error)
    console.error(
      "Kategori detayları alınamadı:",
      categoriesResult.error.message,
    );
  if (collectionsResult.error)
    console.error(
      "Koleksiyon detayları alınamadı:",
      collectionsResult.error.message,
    );

  const imagesByProduct = byProductId(
    (imagesResult.data || []) as Array<
      SupabaseProductImage & { product_id: string }
    >,
  );
  const variantsByProduct = byProductId(
    (variantsResult.data || []) as Array<
      SupabaseProductVariant & { product_id: string }
    >,
  );
  const categoryLinksByProduct = byProductId(categoryLinks);
  const collectionLinksByProduct = byProductId(collectionLinks);
  const categoriesById = new Map(
    (categoriesResult.data || []).map((item: any) => [String(item.id), item]),
  );
  const collectionsById = new Map(
    (collectionsResult.data || []).map((item: any) => [String(item.id), item]),
  );

  return products.map((product) => {
    const productId = String(product.id);

    return {
      ...product,
      product_images: imagesByProduct.get(productId) || [],
      product_variants: variantsByProduct.get(productId) || [],
      product_categories: (categoryLinksByProduct.get(productId) || []).map(
        (item: any) => ({
          categories: categoriesById.get(String(item.category_id)) || null,
        }),
      ),
      product_collections: [
        ...(collectionLinksByProduct.get(productId) || []).map((item: any) => ({
          collections: collectionsById.get(String(item.collection_id)) || null,
        })),
        ...(product.collection_id && !(collectionLinksByProduct.get(productId) || []).some(
          (item: any) => String(item.collection_id) === String(product.collection_id),
        )
          ? [{ collections: collectionsById.get(String(product.collection_id)) || null }]
          : []),
      ],
    } as SupabaseProductRow;
  });
}

async function fetchLiveProducts(): Promise<Product[]> {
  const client = getCatalogClient();
  if (!client) return getStaticProducts();

  const { data, error } = await client
    .from("products")
    .select("*")
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(
      "Ürünler alınamadı. Site statik ürünlere düşürülmedi; panel senkronu için Supabase hatası çözülmeli:",
      error.message,
    );
    return [];
  }

  const productRows = (data || []) as Product[];
  const rowsWithRelations = await attachProductRelations(productRows);
  const liveProducts = rowsWithRelations.map(normalizeSupabaseProduct);
  const discountSettings = await loadDiscountCampaignSettings();
  const discountedProducts = liveProducts.map((product) => {
    const categoryIds = (product.category_ids || []).map(String);
    const collectionIds = (product.collection_ids || []).map(String);
    const originalProductPrice = Number(product.price || 0);
    const productDiscount = automaticDiscountForItem({
      productId: product.id,
      categoryIds,
      collectionIds,
      quantity: 1,
      unitPrice: originalProductPrice,
    }, discountSettings).discount;

    const variants = (product.variants || []).map((variant) => {
      const originalVariantPrice = Number(variant.price ?? originalProductPrice);
      const variantDiscount = automaticDiscountForItem({
        productId: product.id,
        categoryIds,
        collectionIds,
        quantity: 1,
        unitPrice: originalVariantPrice,
      }, discountSettings).discount;
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
  return withLocalProducts(discountedProducts, false);
}

const getCachedLiveProducts = unstable_cache(
  fetchLiveProducts,
  ["rosta-live-products-v5"],
  { revalidate: NEXT_CACHE_REVALIDATE_SECONDS, tags: ["rosta-products"] },
);

export async function getProducts(): Promise<Product[]> {
  if (!USE_SUPABASE_CATALOG || !getCatalogClient()) return getStaticProducts();
  if (liveProductsPromise) return liveProductsPromise;

  const promise = (FORCE_LIVE_SUPABASE_READS
    ? (noStore(), fetchLiveProducts())
    : getCachedLiveProducts()
  ).finally(() => {
    liveProductsPromise = null;
  });

  liveProductsPromise = promise;
  return promise;
}

export async function getFeaturedProducts(): Promise<Product[]> {
  const products = await getProducts();

  const featured = products
    .filter((product) => product.is_featured)
    .sort(
      (a, b) =>
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
        (b.sort_order ?? Number.MAX_SAFE_INTEGER),
    );

  const rest = products
    .filter((product) => productHasImage(product))
    .sort((a, b) => {
      const newScore = Number(Boolean(b.is_new)) - Number(Boolean(a.is_new));
      if (newScore !== 0) return newScore;
      return (
        (a.sort_order ?? Number.MAX_SAFE_INTEGER) -
        (b.sort_order ?? Number.MAX_SAFE_INTEGER)
      );
    });

  const bySlug = new Map<string, Product>();
  for (const product of [...featured, ...rest]) {
    if (!productHasImage(product)) continue;
    if (!bySlug.has(product.slug)) bySlug.set(product.slug, product);
    if (bySlug.size >= 12) break;
  }

  return [...bySlug.values()];
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const products = await getProducts();
  const product = products.find((item) => item.slug === slug) || null;
  if (product) return product;

  // Supabase katalog açıksa panelde arşivlenen/silinen bir ürünü statik veriyle geri getirme.
  if (USE_SUPABASE_CATALOG && getCatalogClient()) return null;
  return getStaticProducts().find((item) => item.slug === slug) || null;
}

async function fetchLiveCollections(): Promise<Collection[]> {
  const client = getCatalogClient();
  if (!client) return [];

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

  return withLocalCollections((data || []) as Collection[]);
}

export async function getCollections(): Promise<Collection[]> {
  if (!USE_SUPABASE_CATALOG || !getCatalogClient()) return [];
  if (liveCollectionsPromise) return liveCollectionsPromise;

  noStore();
  const promise = fetchLiveCollections().finally(() => {
    liveCollectionsPromise = null;
  });

  liveCollectionsPromise = promise;
  return promise;
}

async function fetchLiveCategories(): Promise<Category[]> {
  const client = getCatalogClient();
  if (!client) return [];

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
      name: row.name,
      description: row.description || categoryDescription(slug),
    });
  }
  return [...bySlug.values()];
}

export async function getCategories(): Promise<Category[]> {
  if (!USE_SUPABASE_CATALOG || !getCatalogClient()) return [];
  if (liveCategoriesPromise) return liveCategoriesPromise;

  noStore();
  const promise = fetchLiveCategories().finally(() => {
    liveCategoriesPromise = null;
  });

  liveCategoriesPromise = promise;
  return promise;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const normalizedAliases = new Set(categoryAliases(slug));
  const publicSlug = publicCategorySlug(slug);
  const categories = await getCategories();
  return categories.find((category) => {
    const values = [category.slug, category.public_slug, category.name]
      .flatMap((value) => categoryAliases(value));
    return values.some((value) => normalizedAliases.has(value)) || category.public_slug === publicSlug;
  }) || null;
}

export async function getCollectionBySlug(
  slug: string,
): Promise<Collection | null> {
  const normalized = publicCategorySlug(slug);
  const collections = await getCollections();
  return collections.find((collection) => publicCategorySlug(collection.slug) === normalized) || null;
}

export async function getProductsByCollectionSlug(
  slug: string,
): Promise<Product[]> {
  const collection = await getCollectionBySlug(slug);
  if (!collection) return [];

  const products = await getProducts();

  return products.filter(
    (product) =>
      product.collection_id === collection.id ||
      product.collections?.slug === slug ||
      product.collection_slugs?.includes(collection.slug) ||
      product.collection_slugs?.includes(slug),
  );
}

function normalizedProductCategoryValues(product: Product) {
  return [
    ...(product.category_names || []),
    ...(product.category_slugs || []),
  ]
    .flatMap((value) => categoryAliases(value))
    .filter(Boolean);
}

export async function getProductsByCategorySlug(
  slug: string,
): Promise<Product[]> {
  const products = await getProducts();
  const publicSlug = publicCategorySlug(slug);

  if (publicSlug === "new-arrivals") {
    return products.filter((product) => Boolean(product.is_new));
  }

  const category = await getCategoryBySlug(slug);
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

function bundleItemIds(product: Product) {
  const items = Array.isArray(product.bundle_items) ? product.bundle_items : [];
  return items.map((item) => item.product_id || item.id || "").filter(Boolean);
}

function bundleItemSlugs(product: Product) {
  const items = Array.isArray(product.bundle_items) ? product.bundle_items : [];
  return items.map((item) => item.slug || "").filter(Boolean);
}

function inferBundleItemsFromName(product: Product, products: Product[]) {
  const name = product.name || "";
  const lowerName = name.toLocaleLowerCase("tr-TR");
  if (!/(^|\s)(set|seti|paket|paketi|bundle)(\s|$)/i.test(lowerName)) return [];

  const base = name
    .replace(/\s+(?:seti?|paketi?|bundle)$/i, "")
    .trim();

  if (!base || base === name) return [];

  const lowerBase = base.toLocaleLowerCase("tr-TR");
  return products
    .filter((item) => item.slug !== product.slug)
    .filter((item) => !/(^|\s)(set|seti|paket|paketi|bundle)(\s|$)/i.test(item.name.toLocaleLowerCase("tr-TR")))
    .filter((item) =>
      item.name.toLocaleLowerCase("tr-TR").startsWith(lowerBase),
    )
    .sort((a, b) => {
      const packageWeightGrams = (value: Product) => {
        const match = value.name.toLocaleLowerCase("tr-TR").match(/(\d+(?:[.,]\d+)?)\s*(kg|gr|g)\b/i);
        if (!match) return Number.MAX_SAFE_INTEGER;
        const amount = Number(match[1].replace(",", "."));
        if (!Number.isFinite(amount)) return Number.MAX_SAFE_INTEGER;
        return match[2].toLowerCase() === "kg" ? amount * 1000 : amount;
      };
      return packageWeightGrams(a) - packageWeightGrams(b) || a.name.localeCompare(b.name, "tr");
    });
}

export async function getBundleItemProducts(
  product: Product,
): Promise<Product[]> {
  const products = await getProducts();
  const ids = bundleItemIds(product);
  const slugs = bundleItemSlugs(product);

  if (ids.length || slugs.length) {
    const matched = products.filter(
      (item) => ids.includes(item.id) || slugs.includes(item.slug),
    );
    return matched.sort((a, b) => {
      const aIndex = ids.includes(a.id)
        ? ids.indexOf(a.id)
        : slugs.indexOf(a.slug);
      const bIndex = ids.includes(b.id)
        ? ids.indexOf(b.id)
        : slugs.indexOf(b.slug);
      return aIndex - bIndex;
    });
  }

  return inferBundleItemsFromName(product, products);
}

export async function getHomepageSections(): Promise<HomepageSection[]> {
  const client = getCatalogClient();
  if (!USE_SUPABASE_CATALOG || !client) return [];

  const { data, error } = await client
    .from("homepage_sections")
    .select("*")
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Anasayfa bölümleri alınamadı:", error.message);
    return [];
  }

  return (data || []) as HomepageSection[];
}

export async function getSiteSettings(): Promise<
  Record<string, SiteSetting["setting_value"]>
> {
  const client = getCatalogClient();
  if (!USE_SUPABASE_CATALOG || !client) return {};

  const { data, error } = await client
    .from("site_settings")
    .select("*")
    .eq("is_public", true);

  if (error) {
    console.error("Site ayarları alınamadı:", error.message);
    return {};
  }

  return ((data || []) as SiteSetting[]).reduce<
    Record<string, SiteSetting["setting_value"]>
  >((acc, setting) => {
    acc[setting.setting_key] = setting.setting_value;
    return acc;
  }, {});
}

async function fetchThemeCustomizerSettings(): Promise<ThemeCustomizerSettings> {
  const client = getCatalogClient();
  if (!client) return applyRostaStorefrontDesignSystem(defaultThemeCustomizerSettings);

  const { data, error } = await client
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", "theme_customizer")
    .eq("is_public", true)
    .maybeSingle();

  if (error) {
    console.error("Tema ayarları alınamadı:", error.message);
    return applyRostaStorefrontDesignSystem(defaultThemeCustomizerSettings);
  }

  return applyRostaStorefrontDesignSystem(
    normalizeThemeCustomizerSettings(
      data?.setting_value || defaultThemeCustomizerSettings,
    ),
  );
}

const getCachedThemeCustomizerSettings = unstable_cache(
  fetchThemeCustomizerSettings,
  ["rosta-theme-customizer-v1"],
  { revalidate: THEME_CACHE_REVALIDATE_SECONDS, tags: ["rosta-theme"] },
);

export async function getThemeCustomizerSettings(): Promise<ThemeCustomizerSettings> {
  if (!USE_SUPABASE_CATALOG || !getCatalogClient()) {
    return applyRostaStorefrontDesignSystem(defaultThemeCustomizerSettings);
  }
  if (liveThemePromise) return liveThemePromise;

  const promise = (FORCE_LIVE_THEME_READS ? (noStore(), fetchThemeCustomizerSettings()) : getCachedThemeCustomizerSettings())
    .catch((error) => {
      console.error("Tema ayarları okunamadı:", error);
      return applyRostaStorefrontDesignSystem(defaultThemeCustomizerSettings);
    })
    .finally(() => {
      liveThemePromise = null;
    });

  liveThemePromise = promise;
  return promise;
}
