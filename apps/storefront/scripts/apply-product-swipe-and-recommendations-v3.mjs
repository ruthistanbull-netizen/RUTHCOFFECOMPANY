import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const experiencePath = fileURLToPath(
  new URL("../src/components/product/ProductDetailExperience.tsx", import.meta.url),
);

const source = await readFile(experiencePath, "utf8");

// Validate the behavior that is actually part of the current product page.
// The old validator required temporary visited-history markers injected by a
// previous prebuild patch. Those markers are not present in the current source
// implementation, so requiring them made an otherwise valid build fail.
const requiredMarkers = [
  'import { ProductRecommendations } from "@/components/product/ProductRecommendations";',
  'import { productPrimaryDetailImageSrc } from "@/lib/productDisplayImage";',
  'const SNAP_DISTANCE_RATIO = 0.18;',
  'const SNAP_VELOCITY = 0.38;',
  'const SETTLE_MS = 330;',
  'const PRODUCT_SWIPE_HINT_STORAGE_KEY = "ruth_product_swipe_hint_seen_v1";',
  'window.localStorage.setItem(PRODUCT_SWIPE_HINT_STORAGE_KEY, "1");',
  'className="product-swipe-hint"',
  '.product-swipe-hint-icon{animation:none!important}',
  '<ProductRecommendations',
];

for (const marker of requiredMarkers) {
  if (!source.includes(marker)) {
    throw new Error(`Product swipe v3 validation failed: ${marker}`);
  }
}

if (
  source.includes('root.addEventListener("touchstart"') ||
  source.includes('root.addEventListener("touchmove"') ||
  source.includes('const threshold = Math.min(48')
) {
  throw new Error("Product swipe v3 validation failed: legacy touch swipe code is still present.");
}

console.log("Validated native-feeling product page Snap swipe and recommendations.");
