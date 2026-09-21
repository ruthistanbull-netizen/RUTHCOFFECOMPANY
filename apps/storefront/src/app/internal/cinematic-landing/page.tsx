import CinematicLanding from "./CinematicLanding";
import {
  getCollections,
  getFeaturedProducts,
  getSiteSettings,
  getThemeCustomizerSettings,
} from "@/data/site";

export const revalidate = 60;

export default async function CinematicLandingPage() {
  const [collections, products, themeSettings, siteSettings] = await Promise.all([
    getCollections(),
    getFeaturedProducts(),
    getThemeCustomizerSettings(),
    getSiteSettings(),
  ]);

  const shippingSettings = siteSettings.shipping_settings as Record<string, unknown> | undefined;
  const freeShippingThreshold = Math.max(
    0,
    Number(shippingSettings?.freeShippingThreshold ?? 2000),
  );

  return (
    <CinematicLanding
      heroImage={themeSettings.homepageImages.heroImage}
      storyImages={themeSettings.homepageImages.scrollImages}
      collections={collections.slice(0, 6)}
      products={products.slice(0, 8)}
      freeShippingThreshold={freeShippingThreshold}
    />
  );
}
