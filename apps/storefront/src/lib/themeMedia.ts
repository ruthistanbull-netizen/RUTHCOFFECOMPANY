import type { ThemeCustomizerSettings } from "@/lib/themeCustomizer";

export const HOME_HERO_IMAGE_ID = "home-hero-image-1";
export const HOME_HERO_DESKTOP_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--desktop-image`;
export const HOME_HERO_MOBILE_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--mobile-image`;

export type HomepageHeroImages = { desktop: string; mobile: string };

export const ROSTA_DEFAULT_HERO_IMAGE = "/home/rosta-hero-current.webp?v=20260921-rosta";

const LEGACY_HERO_PATH_MARKERS = [
  "/home/sss-desktop",
  "/home/sudem-mobile",
  "/home/rosta-hero.webp",
  "/home/rosta-hero-v4.webp",
  "/home/ruth-beach-desktop",
  "ruth-beach",
];

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sourcePath(source: string) {
  if (source.startsWith("/") && !source.startsWith("//")) {
    return (source.split(/[?#]/, 1)[0] || "").toLowerCase();
  }

  try {
    return new URL(source).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function isLegacyHeroSource(source: string) {
  const lower = source.toLowerCase();

  // Eski Ruth hero görseli geçmiş sürümlerde base64 data URI olarak da kaydedildi.
  // Onu kalıcı tema ayarı olarak tekrar kullanma.
  if (lower.startsWith("data:image/")) return true;

  const path = sourcePath(source);
  return LEGACY_HERO_PATH_MARKERS.some(
    (marker) => lower.includes(marker) || path.includes(marker),
  );
}

function currentHeroSource(value: unknown) {
  const source = clean(value);
  if (!source || isLegacyHeroSource(source)) return "";
  return source;
}

export function homepageHeroImages(settings: ThemeCustomizerSettings): HomepageHeroImages {
  const overrides = settings.editor.pages["/"]?.overrides || [];
  const desktopOverride = currentHeroSource(
    overrides.find((item) => item.id === HOME_HERO_DESKTOP_IMAGE_ID)?.imageSrc,
  );
  const mobileOverride = currentHeroSource(
    overrides.find((item) => item.id === HOME_HERO_MOBILE_IMAGE_ID)?.imageSrc,
  );
  const sharedOverride = currentHeroSource(
    overrides.find((item) => item.id === HOME_HERO_IMAGE_ID)?.imageSrc,
  );
  const saved = currentHeroSource(settings.homepageImages.heroImage);
  const shared = sharedOverride || saved || ROSTA_DEFAULT_HERO_IMAGE;

  return {
    desktop: desktopOverride || shared,
    mobile: mobileOverride || shared,
  };
}

export function homepageHeroImage(settings: ThemeCustomizerSettings) {
  return homepageHeroImages(settings).desktop;
}
