import type { Metadata } from "next";
import { HomeSectionRenderer } from "@/components/theme/HomeSectionRenderer";
import { ThemeEditorHomeScrollBridge } from "@/components/theme/ThemeEditorHomeScrollBridge";
import { getFeaturedProducts, getProducts } from "@/data/catalogReadModel";
import { getCachedCollections, getCachedSiteSettings } from "@/data/catalogCache";
import { getThemeCustomizerSettings } from "@/data/site";
import { getThemeSectionSettings } from "@/data/themeSections";
import { getThemeSectionPreviewSettings } from "@/data/themeSectionPreview";
import { homepageHeroImages } from "@/lib/themeMedia";
import { themeSectionPage } from "@ruth-commerce/commerce-core/theme-sections";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = { alternates: { canonical: SITE_URL } };
export const revalidate = 10;

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const token = typeof query.themeSectionsPreview === "string" ? query.themeSectionsPreview : "";
  const [featuredProducts, allProducts, collections, themeSettings, publishedSections, siteSettings, draftSections] = await Promise.all([
    getFeaturedProducts(),
    getProducts(),
    getCachedCollections(),
    getThemeCustomizerSettings(),
    getThemeSectionSettings(),
    getCachedSiteSettings(),
    token ? getThemeSectionPreviewSettings(token) : Promise.resolve(null),
  ]);

  const freeShippingThreshold = Math.max(
    0,
    Number((siteSettings.shipping_settings as Record<string, unknown> | undefined)?.freeShippingThreshold ?? 2000),
  );
  const page = themeSectionPage(draftSections || publishedSections, "/");
  const heroImages = homepageHeroImages(themeSettings);

  return <>
    <ThemeEditorHomeScrollBridge />
    <h1 className="sr-only">Rosta Coffee Co kahve, kahve danışmanlığı ve kahve tedariği</h1>
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
  </>;
}
