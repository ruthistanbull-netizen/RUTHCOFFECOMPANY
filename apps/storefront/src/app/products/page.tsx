import type { Metadata } from "next";
import { PageIntro } from "@/components/PageIntro";
import { ProductCatalog } from "@/components/catalog/ProductCatalog";
import { getProducts, toCatalogProducts } from "@/data/catalogReadModel";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Kahve ve Ürünler | ROSTA Coffee Co.",
  description: "ROSTA Coffee Co. kahve ve seçili ürünlerini keşfet.",
  alternates: { canonical: `${SITE_URL}/products` },
  openGraph: {
    title: "Kahve ve Ürünler | ROSTA Coffee Co.",
    description: "ROSTA Coffee Co. kahve ve seçili ürünlerini keşfet.",
    url: `${SITE_URL}/products`,
  },
};

export const revalidate = 300;

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <div
      data-editor-id="catalog-page-shell:products"
      data-editor-type="catalog-shell"
      data-editor-label="Tüm Ürünler Katalog Sayfası"
      className="min-h-screen bg-carbon px-4 pb-24 pt-[calc(var(--announcement-height,0px)+128px)] text-cream md:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <PageIntro
          eyebrow="Alışveriş"
          title="Tüm Ürünler"
          description="ROSTA Coffee Co. ürünlerini keşfet ve güvenle alışveriş yap."
          className="mb-12 md:mb-20"
          editorId="page-intro:products"
          editorType="page-intro"
          editorLabel="Tüm Ürünler Sayfa Başlığı"
        />
        <ProductCatalog products={toCatalogProducts(products)} showProductDescriptions={false} />
      </div>
    </div>
  );
}
