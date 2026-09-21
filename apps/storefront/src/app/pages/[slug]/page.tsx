import { notFound } from "next/navigation";
import { HomeSectionRenderer } from "@/components/theme/HomeSectionRenderer";
import { getFeaturedProducts, getProducts } from "@/data/catalogReadModel";
import { getCollections, getSiteSettings, getThemeCustomizerSettings } from "@/data/site";
import { getThemeSectionSettings } from "@/data/themeSections";
import { getThemeSectionPreviewSettings } from "@/data/themeSectionPreview";
import { homepageHeroImages } from "@/lib/themeMedia";
import { themeSectionPage } from "@ruth-commerce/commerce-core/theme-sections";

export const revalidate = 10;

type Query = Record<string, string | string[] | undefined>;

export default async function CustomThemePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Query> }) {
  const route = await params;
  const query = await searchParams;
  const pathname = `/pages/${route.slug}`;
  const token = typeof query.themeSectionsPreview === "string" ? query.themeSectionsPreview : "";
  const draftPromise = token ? getThemeSectionPreviewSettings(token) : Promise.resolve(null);
  const [featuredProducts, allProducts, collections, themeSettings, published, siteSettings, draft] = await Promise.all([
    getFeaturedProducts(), getProducts(), getCollections(), getThemeCustomizerSettings(), getThemeSectionSettings(), getSiteSettings(), draftPromise,
  ]);
  const source = draft || published;
  if (!source.pages[pathname]) notFound();
  const page = themeSectionPage(source, pathname);
  const freeShippingThreshold = Math.max(0, Number((siteSettings.shipping_settings as Record<string, unknown> | undefined)?.freeShippingThreshold ?? 2000));
  const heroImages = homepageHeroImages(themeSettings);

  return (
    <main className="min-h-[35vh]">
      {page.sections.map((section) => (
        <HomeSectionRenderer
          key={section.id}
          section={section}
          featuredProducts={featuredProducts}
          allProducts={allProducts}
          collections={collections}
          heroImages={heroImages}
          scrollImages={themeSettings.homepageImages.scrollImages}
          freeShippingThreshold={freeShippingThreshold}
        />
      ))}
    </main>
  );
}
