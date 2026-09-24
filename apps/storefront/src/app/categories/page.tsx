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
  title: "Kahve Kategorileri | ROSTA Coffee Co.",
  description: "ROSTA Coffee Co. ürünlerini kategoriye göre keşfet.",
  alternates: { canonical: `${SITE_URL}/categories` },
  openGraph: {
    title: "Kahve Kategorileri | ROSTA Coffee Co.",
    description: "ROSTA Coffee Co. kahve ve ürün kategorilerini keşfet.",
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
    <div className="min-h-screen bg-carbon pt-[calc(var(--announcement-height,0px)+96px)] text-cream">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-20">
        <PageIntro eyebrow="Kategoriler" title="Ürünleri kategoriye göre keşfet" className="mb-14 md:mb-20" />

        {categories.length === 0 ? (
          <p className="text-center text-cream/70">Henüz aktif kategori bulunmuyor.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((category, index) => (
              <AnimatedBlock key={category.id} delay={index * 0.06}>
                <Link
                  href={categoryHref(category.public_slug || category.slug)}
                  className="group flex min-h-[280px] flex-col justify-between overflow-hidden rounded-2xl bg-carbon-soft p-6 transition duration-300   "
                  style={{ border: "1px solid color-mix(in srgb, var(--rosta-kraft) 30%, transparent)" }}
                >
                  <div>
                    <p className="mb-5 text-[10px] uppercase tracking-wide-luxe text-brick">
                      {String(countMap.get(String(category.id)) || 0).padStart(2, "0")} Ürün
                    </p>
                    <h2 className="font-heading text-4xl text-cream">{category.name}</h2>
                  </div>
                  <span className="mt-10 text-xs uppercase tracking-wide-luxe text-brick">Görüntüle</span>
                </Link>
              </AnimatedBlock>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
