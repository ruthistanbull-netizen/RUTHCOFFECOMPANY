import {
  defaultThemeCustomizerSettings,
  type ThemeCustomizerSettings,
} from "@/lib/themeCustomizer";

export const HOME_HERO_IMAGE_ID = "home-hero-image-1";
export const HOME_HERO_DESKTOP_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--desktop-image`;
export const HOME_HERO_MOBILE_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--mobile-image`;

export type HomepageHeroImages = { desktop: string; mobile: string };

export const ROSTA_DEFAULT_HERO_IMAGE =
  "/home/rosta-hero-v6?v=20260921-original-avif";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function homepageHeroImages(settings: ThemeCustomizerSettings): HomepageHeroImages {
  const saved = clean(settings.homepageImages.heroImage);
  const savedDesktop = clean(settings.homepageImages.heroDesktopImage);
  const savedMobile = clean(settings.homepageImages.heroMobileImage);
  const overrides = settings.editor.pages["/"]?.overrides || [];
  const desktopOverride = clean(overrides.find((item) => item.id === HOME_HERO_DESKTOP_IMAGE_ID)?.imageSrc);
  const mobileOverride = clean(overrides.find((item) => item.id === HOME_HERO_MOBILE_IMAGE_ID)?.imageSrc);
  const sharedOverride = clean(overrides.find((item) => item.id === HOME_HERO_IMAGE_ID)?.imageSrc);
  const shared = sharedOverride || saved || ROSTA_DEFAULT_HERO_IMAGE;

  return {
    desktop: desktopOverride || savedDesktop || shared || ROSTA_DEFAULT_HERO_IMAGE,
    mobile: mobileOverride || savedMobile || shared || ROSTA_DEFAULT_HERO_IMAGE,
  };
}

export function homepageHeroImage(settings: ThemeCustomizerSettings) {
  return homepageHeroImages(settings).desktop;
}
