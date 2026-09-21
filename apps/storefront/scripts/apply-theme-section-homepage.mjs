import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, "../src/app/page.tsx");
const content = `import type { Metadata } from "next";
import { HomeSectionRenderer } from "@/components/theme/HomeSectionRenderer";
import { getCollections, getFeaturedProducts, getProducts, getSiteSettings, getThemeCustomizerSettings } from "@/data/site";
import { getThemeSectionSettings } from "@/data/themeSections";
import { homepageHeroImages } from "@/lib/themeMedia";
import { themeSectionPage } from "@ruth-commerce/commerce-core/theme-sections";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = { alternates: { canonical: SITE_URL } };
export const revalidate = 60;

export default async function Home() {
  const [featuredProducts, allProducts, collections, themeSettings, sectionSettings, siteSettings] = await Promise.all([
    getFeaturedProducts(), getProducts(), getCollections(), getThemeCustomizerSettings(), getThemeSectionSettings(), getSiteSettings(),
  ]);
  const freeShippingThreshold = Math.max(0, Number((siteSettings.shipping_settings as Record<string, unknown> | undefined)?.freeShippingThreshold ?? 2000));
  const page = themeSectionPage(sectionSettings, "/");
  const heroImages = homepageHeroImages(themeSettings);
  return <>
    <h1 className="sr-only">Ruth Istanbul tasarım takı ve 925 ayar gümüş takılar</h1>
    {page.sections.map((section) => <HomeSectionRenderer key={section.id} section={section} featuredProducts={featuredProducts} allProducts={allProducts} collections={collections} heroImages={heroImages} scrollImages={themeSettings.homepageImages.scrollImages} freeShippingThreshold={freeShippingThreshold} />)}
  </>;
}
`;
fs.writeFileSync(target, content);
console.log("Section based homepage prepared.");
