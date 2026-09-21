import MythologyJourney from "./MythologyJourney";
import { getCollections, getFeaturedProducts, getThemeCustomizerSettings } from "@/data/site";

export const revalidate = 60;

export default async function MythologyJourneyPage() {
  const [collections, products, themeSettings] = await Promise.all([
    getCollections(),
    getFeaturedProducts(),
    getThemeCustomizerSettings(),
  ]);

  return (
    <MythologyJourney
      heroImage={themeSettings.homepageImages.heroImage}
      collections={collections.slice(0, 3)}
      products={products.slice(0, 4)}
    />
  );
}
