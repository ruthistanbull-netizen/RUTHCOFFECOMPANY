import type { Metadata } from "next";
import Link from "next/link";
import { AnimatedBlock, PageIntro } from "@/components/PageIntro";
import {
  getCachedCategories,
  getCachedProductsByCategorySlug,
} from "@/data/catalogCache";
import { categoryHref, publicCategorySlug } from "@/lib/catalogCategories";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Takı Kategorileri | Kolye, Yüzük, Bileklik ve Setler",
  description: "Ruth Istanbul takı kategorilerini keşfet; kolye, yüzük, bileklik ve set seçeneklerini kategoriye göre incele.",
  alternates: { canonical: `${SITE_URL}/categories` },
  openGraph: {
    title: "Takı Kategorileri | Ruth Istanbul",
    description: "Ruth Istanbul takı kategorilerini keşfet.",
    url: `${SITE_URL}/categories`,
  },
};

export const revalidate = 600;

export default async function CategoriesPage() {
  const categories = await getCachedCategories();
  const counts = await Promise.all(
    categories.map(async (category) => {
      const slug = category.public_slug || publicCategorySlug(category.slug);
      const products = await getCachedProductsByCategorySlug(slug);
      return [String(category.id), products.length] as const;
    }),
  );
  const countMap = new Map(counts);

  return (
    <div className="min-h-screen bg-ivory pt-[calc(var(--announcement-height,0px)+96px)]">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-20">
        <PageIntro eyebrow="Kategoriler" title="Ürünleri kategoriye göre keşfet" className="mb-14 md:mb-20" />

        {categories.length === 0 ? (
          <p className="text-center text-muted-ruth">Henüz aktif kategori bulunmuyor.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((category, index) => (
              <AnimatedBlock key={category.id} delay={index * 0.06}>
                <Link
                  href={categoryHref(category.public_slug || category.slug)}
                  className="group flex min-h-[280px] flex-col justify-between overflow-hidden rounded-2xl bg-cream p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-ink/8"
                  style={{ border: "1px solid rgba(184,151,106,0.14)" }}
                >
                  <div>
                    <p className="mb-5 text-[10px] uppercase tracking-wide-luxe text-gold-dark">
                      {String(countMap.get(String(category.id)) || 0).padStart(2, "0")} Ürün
                    </p>
                    <h2 className="font-heading text-4xl text-ink">{category.name}</h2>
                  </div>
                  <span className="mt-10 text-xs uppercase tracking-wide-luxe text-gold-dark">Görüntüle</span>
                </Link>
              </AnimatedBlock>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
