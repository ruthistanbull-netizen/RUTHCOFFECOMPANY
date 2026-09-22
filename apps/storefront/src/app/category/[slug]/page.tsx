import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/PageIntro";
import { ProductCatalog } from "@/components/catalog/ProductCatalog";
import {
  getCachedCategoryBySlug,
  getCachedProductsByCategorySlug,
} from "@/data/catalogCache";
import { toCatalogProducts } from "@/data/catalogReadModel";
import {
  categoryDescription,
  categoryDisplayName,
  publicCategorySlug,
} from "@/lib/catalogCategories";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const normalized = publicCategorySlug(slug);
  const isNewArrivals = normalized === "new-arrivals";
  const [category, products] = await Promise.all([
    isNewArrivals ? Promise.resolve(null) : getCachedCategoryBySlug(slug),
    getCachedProductsByCategorySlug(slug),
  ]);
  if (!isNewArrivals && !category) return { title: "Kategori bulunamadı", robots: { index: false, follow: false } };

  const name = isNewArrivals ? "Yeni Gelenler" : categoryDisplayName(category?.slug, category?.name || "Ürünler");
  const summary = isNewArrivals ? "ROSTA Coffee Co.’nun en yeni ürünleri." : category?.description || categoryDescription(category?.slug);
  const canonicalSlug = isNewArrivals ? "new-arrivals" : category?.public_slug || normalized;
  const canonical = `${SITE_URL}/category/${encodeURIComponent(canonicalSlug)}`;

  return {
    title: name,
    description: summary,
    alternates: { canonical },
    robots: products.length
      ? { index: true, follow: true }
      : { index: false, follow: true, noarchive: true },
    openGraph: { title: `${name} | ROSTA Coffee Co.`, description: summary, url: canonical },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const normalized = publicCategorySlug(slug);
  const isNewArrivals = normalized === "new-arrivals";
  const category = isNewArrivals ? null : await getCachedCategoryBySlug(slug);
  if (!isNewArrivals && !category) return notFound();

  const products = await getCachedProductsByCategorySlug(slug);
  const name = isNewArrivals ? "Yeni Gelenler" : categoryDisplayName(category?.slug, category?.name || "Ürünler");
  const description = isNewArrivals ? "ROSTA Coffee Co.’nun en yeni ürünleri." : category?.description || categoryDescription(category?.slug);

  return (
    <div className="min-h-screen bg-ivory px-4 pb-24 pt-[calc(var(--announcement-height,0px)+128px)] md:px-8">
      <div className="mx-auto max-w-7xl">
        <PageIntro eyebrow="Kategori" title={name} description={description} className="mb-12 md:mb-20" />
        <ProductCatalog
          products={toCatalogProducts(products)}
          emptyMessage="Bu kategoride seçimine uygun aktif ürün bulunamadı."
          showProductDescriptions={false}
        />
      </div>
    </div>
  );
}
