import ImmersiveEditorial from "./ImmersiveEditorial";
import { getCollections, getFeaturedProducts, getThemeCustomizerSettings } from "@/data/site";

export const revalidate = 60;

export default async function ImmersiveEditorialPage() {
  const [collections, products, themeSettings] = await Promise.all([
    getCollections(),
    getFeaturedProducts(),
    getThemeCustomizerSettings(),
  ]);

  return (
    <ImmersiveEditorial
      heroImage={themeSettings.homepageImages.heroImage}
      collections={collections.slice(0, 4)}
      products={products.slice(0, 6)}
    />
  );
}
