import {
  defaultThemeCustomizerSettings,
  type ThemeCustomizerSettings,
} from "@/lib/themeCustomizer";

export const HOME_HERO_IMAGE_ID = "home-hero-image-1";
export const HOME_HERO_DESKTOP_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--desktop-image`;
export const HOME_HERO_MOBILE_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--mobile-image`;

export type HomepageHeroImages = { desktop: string; mobile: string };

const LEGACY_DESKTOP_HERO_IMAGE = "/home/sss-desktop.webp";
const LEGACY_MOBILE_HERO_IMAGE = "/home/sudem-mobile.webp";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function homepageHeroImages(settings: ThemeCustomizerSettings): HomepageHeroImages {
  const saved = clean(settings.homepageImages.heroImage);
  const fallback = clean(defaultThemeCustomizerSettings.homepageImages.heroImage);
  const overrides = settings.editor.pages["/"]?.overrides || [];
  const desktopOverride = clean(overrides.find((item) => item.id === HOME_HERO_DESKTOP_IMAGE_ID)?.imageSrc);
  const mobileOverride = clean(overrides.find((item) => item.id === HOME_HERO_MOBILE_IMAGE_ID)?.imageSrc);
  const sharedOverride = clean(overrides.find((item) => item.id === HOME_HERO_IMAGE_ID)?.imageSrc);
  const shared = (saved && saved !== fallback ? saved : "") || sharedOverride || saved || fallback;

  if (!desktopOverride && !mobileOverride && (shared === LEGACY_DESKTOP_HERO_IMAGE || shared === LEGACY_MOBILE_HERO_IMAGE)) {
    return { desktop: LEGACY_DESKTOP_HERO_IMAGE, mobile: LEGACY_MOBILE_HERO_IMAGE };
  }

  return {
    desktop: desktopOverride || shared,
    mobile: mobileOverride || shared,
  };
}

export function homepageHeroImage(settings: ThemeCustomizerSettings) {
  return homepageHeroImages(settings).desktop;
}
