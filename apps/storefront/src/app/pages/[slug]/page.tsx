import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { HomeSectionRenderer } from "@/components/theme/HomeSectionRenderer";
import { getFeaturedProducts, getProducts } from "@/data/catalogReadModel";
import {
  getCollections,
  getSiteSettings,
  getStoreDesignV2Preview,
  getStoreDesignV2Published,
  getThemeCustomizerSettings,
} from "@/data/site";
import { getThemeSectionSettings } from "@/data/themeSections";
import { getThemeSectionPreviewSettings } from "@/data/themeSectionPreview";
import { homepageHeroImages } from "@/lib/themeMedia";
import { themeSectionPage } from "@ruth-commerce/commerce-core/theme-sections";
import {
  storeDesignPageForRoute,
  storeDesignSectionsForPage,
} from "@/lib/storeDesignV2Sections";

export const revalidate = 10;

type Query = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const route = await params;
  const pathname = `/pages/${route.slug}`;
  const document = await getStoreDesignV2Published();
  const page = storeDesignPageForRoute(document, pathname);
  if (!page || page.status !== "published") return {};

  const seo = document.seo[page.seoId];
  const robots = seo?.robots || seo?.robotsPreset || "index,follow";
  const ogAsset = seo?.openGraphAssetId ? document.media[seo.openGraphAssetId] : undefined;

  return {
    title: seo?.title || page.name,
    description: seo?.description || undefined,
    alternates: seo?.canonical ? { canonical: seo.canonical } : undefined,
    robots: {
      index: robots.startsWith("index"),
      follow: robots.endsWith("follow"),
    },
    openGraph: {
      title: seo?.openGraphTitle || seo?.title || page.name,
      description: seo?.openGraphDescription || seo?.description || undefined,
      images: ogAsset?.url ? [{ url: ogAsset.url }] : undefined,
    },
  };
}

export default async function CustomThemePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Query> }) {
  const route = await params;
  const query = await searchParams;
  const pathname = `/pages/${route.slug}`;

  const previewToken = typeof query.storeDesignV2Preview === "string" ? query.storeDesignV2Preview : "";
  const [publishedV2, previewV2] = await Promise.all([
    getStoreDesignV2Published(),
    previewToken ? getStoreDesignV2Preview(previewToken) : Promise.resolve(null),
  ]);
  const activeV2 = previewV2 || publishedV2;
  const v2Page = storeDesignPageForRoute(activeV2, pathname);

  if (!previewV2 && !v2Page) {
    const rule = publishedV2.redirects.find((item) => item.active !== false && item.from === pathname);
    if (rule?.to && rule.to !== pathname) {
      if (rule.status === 302) redirect(rule.to);
      permanentRedirect(rule.to);
    }
  }

  if (v2Page) {
    if (!previewV2 && v2Page.status !== "published") notFound();

    const [featuredProducts, allProducts, collections, themeSettings, siteSettings] = await Promise.all([
      getFeaturedProducts(),
      getProducts(),
      getCollections(),
      getThemeCustomizerSettings(),
      getSiteSettings(),
    ]);
    const freeShippingThreshold = Math.max(0, Number((siteSettings.shipping_settings as Record<string, unknown> | undefined)?.freeShippingThreshold ?? 2000));
    const heroImages = homepageHeroImages(themeSettings);
    const sections = storeDesignSectionsForPage(activeV2, v2Page);

    return (
      <main className="min-h-[35vh]" data-store-design-v2-page={v2Page.id}>
        {sections.map((section) => (
          <HomeSectionRenderer
            key={section.id}
            section={section}
            featuredProducts={featuredProducts}
            allProducts={allProducts}
            collections={collections}
            heroImages={heroImages}
            scrollImages={themeSettings.homepageImages.scrollImages}
            themeSettings={themeSettings}
            freeShippingThreshold={freeShippingThreshold}
          />
        ))}
      </main>
    );
  }

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
          themeSettings={themeSettings}
          freeShippingThreshold={freeShippingThreshold}
        />
      ))}
    </main>
  );
}
