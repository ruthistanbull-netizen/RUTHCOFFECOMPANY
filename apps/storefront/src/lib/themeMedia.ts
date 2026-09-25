import {
  defaultThemeCustomizerSettings,
  type ThemeCustomizerSettings,
} from "@/lib/themeCustomizer";

export const HOME_HERO_IMAGE_ID = "home-hero-image-1";
export const HOME_HERO_DESKTOP_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--desktop-image`;
export const HOME_HERO_MOBILE_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--mobile-image`;
export const HOME_EDITORIAL_VIDEO_ID = "home-editorial-video-1";
export const HOME_EDITORIAL_IMAGE_ID = "home-editorial-image-2";
export const HOME_SCROLL_MEDIA_PREFIX = "home-scroll-media-";

export type HomepageHeroImages = { desktop: string; mobile: string };
export type HomepageMediaType = "image" | "video";
export type HomepageDeviceMedia = {
  desktop: { src: string; mediaType: HomepageMediaType };
  mobile: { src: string; mediaType: HomepageMediaType };
};

export const ROSTA_DEFAULT_HERO_IMAGE =
  "/home/rosta-hero-v6?v=20260921-original-avif";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function mediaTypeFromSource(value: string): HomepageMediaType {
  return /\.(mp4|m4v|mov|webm)(?:$|[?#])/i.test(value) ? "video" : "image";
}

export function homepageDeviceMedia(
  settings: ThemeCustomizerSettings,
  id: string,
  fallback: string,
): HomepageDeviceMedia {
  const overrides = settings.editor.pages["/"]?.overrides || [];
  const override = overrides.find((item) => item.id === id);
  const shared = clean(override?.imageSrc) || clean(fallback);
  const desktopSrc = clean(override?.desktopImageSrc) || shared;
  const mobileSrc = clean(override?.mobileImageSrc) || shared;
  const sharedType = override?.mediaType === "video" || override?.mediaType === "image"
    ? override.mediaType
    : mediaTypeFromSource(shared);
  const desktopType = override?.desktopMediaType === "video" || override?.desktopMediaType === "image"
    ? override.desktopMediaType
    : desktopSrc === shared ? sharedType : mediaTypeFromSource(desktopSrc);
  const mobileType = override?.mobileMediaType === "video" || override?.mobileMediaType === "image"
    ? override.mobileMediaType
    : mobileSrc === shared ? sharedType : mediaTypeFromSource(mobileSrc);

  return {
    desktop: { src: desktopSrc, mediaType: desktopType },
    mobile: { src: mobileSrc, mediaType: mobileType },
  };
}

export function homeScrollMediaId(index: number) {
  return `${HOME_SCROLL_MEDIA_PREFIX}${index}`;
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
