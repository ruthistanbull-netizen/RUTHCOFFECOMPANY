import type { MetadataRoute } from "next";
import { getProducts } from "@/data/catalogReadModel";
import { getCategories, getCollections, getStoreDesignV2Published } from "@/data/site";
import { absoluteUrl, SITE_URL } from "@/lib/seo";

const staticRoutes = [
  "",
  "/about",
  "/products",
  "/categories",
  "/collections",
  "/contact",
  "/faq",
  "/shipping-returns",
  "/warranty-care",
  "/privacy-policy",
  "/terms",
  "/kvkk",
  "/commercial-communication-consent",
];

function date(value: unknown) {
  const parsed = value ? new Date(String(value)) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, collections, storeDesignV2] = await Promise.all([
    getProducts(),
    getCategories(),
    getCollections(),
    getStoreDesignV2Published(),
  ]);

  const categoryIds = new Set(products.flatMap((product) => product.category_ids || []).map(String));
  const categorySlugs = new Set(products.flatMap((product) => product.category_slugs || []).map(String));
  const collectionIds = new Set(
    products.flatMap((product) => [product.collection_id, ...(product.collection_ids || [])]).filter(Boolean).map(String),
  );
  const collectionSlugs = new Set(products.flatMap((product) => product.collection_slugs || []).map(String));

  const indexableCategories = categories.filter((category) =>
    categoryIds.has(String(category.id)) ||
    categorySlugs.has(String(category.slug)) ||
    categorySlugs.has(String(category.public_slug || "")),
  );
  const indexableCollections = collections.filter((collection) =>
    collectionIds.has(String(collection.id)) || collectionSlugs.has(String(collection.slug)),
  );

  const staticPathSet = new Set(staticRoutes.map((path) => path || "/"));
  const publishedMerchantPages = Object.values(storeDesignV2.pages)
    .filter((page) => page.kind === "merchant" && page.status === "published")
    .filter((page) => {
      const seo = storeDesignV2.seo[page.seoId];
      const robots = seo?.robots || seo?.robotsPreset || "index,follow";
      if (!robots.startsWith("index")) return false;
      if (staticPathSet.has(page.route)) return false;

      const canonical = seo?.canonical?.trim();
      if (!canonical) return true;
      if (canonical.startsWith("/")) return canonical === page.route;
      try {
        const url = new URL(canonical);
        return url.origin === SITE_URL && url.pathname.replace(/\/$/, "") === page.route.replace(/\/$/, "");
      } catch {
        return false;
      }
    });

  return [
    ...staticRoutes.map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: new Date(),
      changeFrequency: path === "" || path === "/products" ? "daily" as const : "monthly" as const,
      priority: path === "" ? 1 : path === "/products" ? 0.9 : 0.5,
    })),
    ...products.map((product) => ({
      url: `${SITE_URL}/products/${encodeURIComponent(product.slug)}`,
      lastModified: date(product.updated_at || product.created_at),
      changeFrequency: "weekly" as const,
      priority: 0.8,
      images: product.main_image_url ? [absoluteUrl(product.main_image_url)] : undefined,
    })),
    ...indexableCategories.map((category) => ({
      url: `${SITE_URL}/category/${encodeURIComponent(category.public_slug || category.slug)}`,
      lastModified: date(category.updated_at || category.created_at),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...indexableCollections.map((collection) => ({
      url: `${SITE_URL}/collections/${encodeURIComponent(collection.slug)}`,
      lastModified: date(collection.updated_at || collection.created_at),
      changeFrequency: "weekly" as const,
      priority: 0.7,
      images: collection.cover_image_url ? [absoluteUrl(collection.cover_image_url)] : undefined,
    })),
    ...publishedMerchantPages.map((page) => ({
      url: `${SITE_URL}${page.route}`,
      lastModified: date(page.updatedAt || page.publishedAt || page.createdAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
      images: (() => {
        const seo = storeDesignV2.seo[page.seoId];
        const asset = seo?.openGraphAssetId ? storeDesignV2.media[seo.openGraphAssetId] : undefined;
        return asset?.url ? [absoluteUrl(asset.url)] : undefined;
      })(),
    })),
  ];
}
