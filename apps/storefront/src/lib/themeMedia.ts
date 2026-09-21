import type { ThemeCustomizerSettings } from "@/lib/themeCustomizer";

export const HOME_HERO_IMAGE_ID = "home-hero-image-1";
export const HOME_HERO_DESKTOP_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--desktop-image`;
export const HOME_HERO_MOBILE_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--mobile-image`;

export type HomepageHeroImages = { desktop: string; mobile: string };

const ROSTA_DEFAULT_HERO_IMAGE = "/home/rosta-hero-current.webp";

const STALE_HERO_PATHS = new Set([
  "/home/sss-desktop.webp",
  "/home/sudem-mobile.webp",
  "/home/rosta-hero.webp",
  "/home/rosta-hero-v4.webp",
  "/home/ruth-beach-desktop",
  "/home/ruth-beach-desktop/",
]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sourcePath(source: string) {
  if (source.startsWith("/") && !source.startsWith("//")) {
    return source.split(/[?#]/, 1)[0] || "";
  }

  try {
    return new URL(source).pathname;
  } catch {
    return "";
  }
}

function currentHeroSource(value: unknown) {
  const source = clean(value);
  if (!source) return "";

  const path = sourcePath(source);
  if (path && STALE_HERO_PATHS.has(path)) return "";

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
