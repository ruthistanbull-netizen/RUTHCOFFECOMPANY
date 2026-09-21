import type { Metadata } from "next";
import { PageIntro } from "@/components/PageIntro";
import { ProductCatalog } from "@/components/catalog/ProductCatalog";
import { getProducts, toCatalogProducts } from "@/data/catalogReadModel";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Tasarım Takılar | Kolye, Yüzük, Bileklik ve Setler",
  description: "Ruth Istanbul kolye, yüzük, bileklik ve set koleksiyonlarını keşfet. 925 ayar gümüş ve özel tasarım takılar.",
  alternates: { canonical: `${SITE_URL}/products` },
  openGraph: {
    title: "Tasarım Takılar | Ruth Istanbul",
    description: "Ruth Istanbul kolye, yüzük, bileklik ve set koleksiyonlarını keşfet.",
    url: `${SITE_URL}/products`,
  },
};

export const revalidate = 300;

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <div className="min-h-screen bg-ivory px-4 pb-24 pt-[calc(var(--announcement-height,0px)+128px)] md:px-8">
      <div className="mx-auto max-w-7xl">
        <PageIntro
          eyebrow="Alışveriş"
          title="Tüm Ürünler"
          description="Ruth Istanbul’un seçili parçalarını keşfet ve güvenle alışveriş yap."
          className="mb-12 md:mb-20"
        />
        <ProductCatalog products={toCatalogProducts(products)} showProductDescriptions={false} />
      </div>
    </div>
  );
}
