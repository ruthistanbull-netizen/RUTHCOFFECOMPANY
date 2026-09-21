import type { ThemeCustomizerSettings } from "@/lib/themeCustomizer";

export const HOME_HERO_IMAGE_ID = "home-hero-image-1";
export const HOME_HERO_DESKTOP_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--desktop-image`;
export const HOME_HERO_MOBILE_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--mobile-image`;

export type HomepageHeroImages = {
  desktop: string;
  mobile: string;
};

export const ROSTA_DEFAULT_HERO_IMAGE =
  "/home/rosta-hero.webp?v=20260921-hq2";

export function homepageHeroImages(
  _settings: ThemeCustomizerSettings,
): HomepageHeroImages {
  return {
    desktop: ROSTA_DEFAULT_HERO_IMAGE,
    mobile: ROSTA_DEFAULT_HERO_IMAGE,
  };
}

export function homepageHeroImage(settings: ThemeCustomizerSettings) {
  return homepageHeroImages(settings).desktop;
}
