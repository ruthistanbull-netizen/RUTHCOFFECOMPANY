import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnimatedBlock } from "@/components/PageIntro";
import { ProductCatalog } from "@/components/catalog/ProductCatalog";
import {
  getCachedCollectionBySlug,
  getCachedProductsByCollectionSlug,
} from "@/data/catalogCache";
import { toCatalogProducts } from "@/data/catalogReadModel";
import { SITE_URL } from "@/lib/seo";

export const revalidate = 600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const [collection, products] = await Promise.all([
    getCachedCollectionBySlug(slug),
    getCachedProductsByCollectionSlug(slug),
  ]);
  if (!collection) return { title: "Koleksiyon bulunamadı", robots: { index: false, follow: false } };
  const summary = collection.description || `${collection.name} koleksiyonunu ROSTA Coffee Co.’da keşfet.`;
  const canonical = `${SITE_URL}/collections/${encodeURIComponent(collection.slug)}`;
  return {
    title: collection.name,
    description: summary,
    alternates: { canonical },
    robots: products.length ? { index: true, follow: true } : { index: false, follow: true, noarchive: true },
    openGraph: {
      title: `${collection.name} | ROSTA Coffee Co.`,
      description: summary,
      url: canonical,
      images: collection.cover_image_url ? [{ url: collection.cover_image_url, alt: collection.name }] : undefined,
    },
  };
}

export default async function CollectionDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [collection, products] = await Promise.all([
    getCachedCollectionBySlug(slug),
    getCachedProductsByCollectionSlug(slug),
  ]);

  if (!collection) notFound();

  return (
    <div className="min-h-screen bg-ivory px-4 pb-24 pt-[calc(var(--announcement-height,0px)+128px)] md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 grid gap-10 md:mb-16 md:grid-cols-[1fr_0.8fr] md:items-end">
          <AnimatedBlock delay={0.08}>
            <p className="mb-3 text-xs uppercase tracking-wide-luxe text-gold-dark">Koleksiyon</p>
            <h1
              className="font-heading font-editorial text-balance"
              style={{ fontSize: "clamp(2.2rem, 6vw, 4.5rem)", color: "var(--ink)" }}
            >
              {collection.name}
            </h1>
            <p className="mt-6 max-w-2xl leading-8 text-muted-ruth">
              {collection.description || "ROSTA Coffee Co. seçili koleksiyonu."}
            </p>
          </AnimatedBlock>

          <AnimatedBlock delay={0.16}>
            <div className="relative overflow-hidden rounded-[24px]" style={{ aspectRatio: "16 / 10" }}>
              {collection.cover_image_url ? (
                <img src={collection.cover_image_url} alt={collection.name} className="h-full w-full object-cover" />
              ) : (
                <div className="ruth-card-gradient h-full w-full" />
              )}
            </div>
          </AnimatedBlock>
        </div>

        <ProductCatalog
          products={toCatalogProducts(products)}
          emptyMessage="Bu koleksiyonda aktif ürün bulunamadı."
          showProductDescriptions={false}
        />
      </div>
    </div>
  );
}
