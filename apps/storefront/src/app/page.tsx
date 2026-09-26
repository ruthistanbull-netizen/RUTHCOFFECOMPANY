import type { Metadata } from "next";
import { HomeSectionRenderer } from "@/components/theme/HomeSectionRenderer";
import { HomeHeroRuntimeAdjustments } from "@/components/HomeHeroRuntimeAdjustments";
import { HomeHeaderAdaptiveTone } from "@/components/HomeHeaderAdaptiveTone";
import { ThemeEditorHomeScrollBridge } from "@/components/theme/ThemeEditorHomeScrollBridge";
import { getFeaturedProducts, getProducts } from "@/data/catalogReadModel";
import { getCachedCollections, getCachedSiteSettings } from "@/data/catalogCache";
import {
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
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = { alternates: { canonical: SITE_URL } };
// Deploy marker: media replacement fixes verified for storefront.
export const revalidate = 10;

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const legacyToken = typeof query.themeSectionsPreview === "string" ? query.themeSectionsPreview : "";
  const v2Token = typeof query.storeDesignV2Preview === "string" ? query.storeDesignV2Preview : "";

  const [featuredProducts, allProducts, collections, themeSettings, publishedSections, siteSettings, draftSections, publishedV2, previewV2] = await Promise.all([
    getFeaturedProducts(),
    getProducts(),
    getCachedCollections(),
    getThemeCustomizerSettings(),
    getThemeSectionSettings(),
    getCachedSiteSettings(),
    legacyToken ? getThemeSectionPreviewSettings(legacyToken) : Promise.resolve(null),
    getStoreDesignV2Published(),
    v2Token ? getStoreDesignV2Preview(v2Token) : Promise.resolve(null),
  ]);

  const freeShippingThreshold = Math.max(
    0,
    Number((siteSettings.shipping_settings as Record<string, unknown> | undefined)?.freeShippingThreshold ?? 2000),
  );

  const legacyPage = themeSectionPage(draftSections || publishedSections, "/");
  const previewHome = previewV2 ? storeDesignPageForRoute(previewV2, "/") : null;
  const publishedHome = storeDesignPageForRoute(publishedV2, "/");
  const pageSections = previewHome
    ? storeDesignSectionsForPage(previewV2!, previewHome)
    : publishedHome?.status === "published"
      ? storeDesignSectionsForPage(publishedV2, publishedHome)
      : legacyPage.sections;

  const heroImages = homepageHeroImages(themeSettings);
  const editorialVideo = themeSettings.homepageImages.editorialVideo || "/home/rosta-under-hero-video.mp4";
  const editorialImage = themeSettings.homepageImages.editorialImage || "/home/rosta-under-hero-photo.jpg";

  return <>
    <HomeHeroRuntimeAdjustments />
    <HomeHeaderAdaptiveTone />
    <ThemeEditorHomeScrollBridge />
    <h1 className="sr-only">Rosta Coffee Co kahve, kahve danışmanlığı ve kahve tedariği</h1>
    <main data-store-design-v2-page={previewHome?.id || publishedHome?.id || undefined}>
      {pageSections.map((section) => (
        <HomeSectionRenderer
          key={section.id}
          section={section}
          featuredProducts={featuredProducts}
          allProducts={allProducts}
          collections={collections}
          heroImages={heroImages}
          editorialVideo={editorialVideo}
          editorialImage={editorialImage}
          scrollImages={themeSettings.homepageImages.scrollImages}
          themeSettings={themeSettings}
          freeShippingThreshold={freeShippingThreshold}
        />
      ))}
    </main>
  </>;
}
