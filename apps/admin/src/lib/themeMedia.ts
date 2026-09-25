import {
  defaultThemeCustomizerSettings,
  upsertThemeElementOverride,
  type ThemeCustomizerSettings,
  type ThemeElementOverride,
} from "@/lib/themeCustomizer";

export const HOME_HERO_IMAGE_ID = "home-hero-image-1";
export const HOME_HERO_DESKTOP_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--desktop-image`;
export const HOME_HERO_MOBILE_IMAGE_ID = `${HOME_HERO_IMAGE_ID}--mobile-image`;

export type HomepageHeroDevice = "desktop" | "mobile";
export type HomepageMediaType = "image" | "video";

function inferredMediaType(value: string): HomepageMediaType {
  return /\.(mp4|m4v|mov|webm)(?:$|[?#])/i.test(value) ? "video" : "image";
}

export function cleanThemeImage(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function deviceId(device: HomepageHeroDevice) {
  return device === "desktop" ? HOME_HERO_DESKTOP_IMAGE_ID : HOME_HERO_MOBILE_IMAGE_ID;
}

function deviceOverride(overrides: ThemeElementOverride[], device: HomepageHeroDevice) {
  return overrides.find((item) => item.id === deviceId(device));
}

function withoutBaseHeroImageSource(overrides: ThemeElementOverride[]) {
  return overrides.flatMap((item) => {
    if (item.id !== HOME_HERO_IMAGE_ID || item.imageSrc === undefined) return [item];
    const { imageSrc: _imageSrc, ...styleOnly } = item;
    return [styleOnly as ThemeElementOverride];
  });
}

/**
 * Canonical homepage hero contract:
 * - homepageImages.heroImage is the shared/fallback source.
 * - desktop/mobile may each own a dedicated image override record.
 * - the base hero override never owns media; it may only keep visual styles.
 */
export function normalizeThemeMediaSettings(settings: ThemeCustomizerSettings): ThemeCustomizerSettings {
  const home = settings.editor.pages["/"];
  const overrides = home?.overrides || [];
  const savedHero = cleanThemeImage(settings.homepageImages.heroImage);
  const defaultHero = cleanThemeImage(defaultThemeCustomizerSettings.homepageImages.heroImage);
  const baseLegacyHero = cleanThemeImage(overrides.find((item) => item.id === HOME_HERO_IMAGE_ID)?.imageSrc);
  const sharedHero = (savedHero && savedHero !== defaultHero ? savedHero : "")
    || baseLegacyHero
    || savedHero
    || defaultHero;
  const cleanedOverrides = withoutBaseHeroImageSource(overrides);

  return {
    ...settings,
    homepageImages: {
      ...settings.homepageImages,
      heroImage: sharedHero,
    },
    editor: home ? {
      ...settings.editor,
      pages: {
        ...settings.editor.pages,
        "/": { ...home, overrides: cleanedOverrides },
      },
    } : settings.editor,
  };
}

export function homepageHeroImage(settings: ThemeCustomizerSettings) {
  return cleanThemeImage(normalizeThemeMediaSettings(settings).homepageImages.heroImage)
    || defaultThemeCustomizerSettings.homepageImages.heroImage;
}

export function homepageHeroDeviceImage(settings: ThemeCustomizerSettings, device: HomepageHeroDevice) {
  const normalized = normalizeThemeMediaSettings(settings);
  const overrides = normalized.editor.pages["/"]?.overrides || [];
  return cleanThemeImage(deviceOverride(overrides, device)?.imageSrc)
    || homepageHeroImage(normalized);
}

export function setHomepageHeroImage(settings: ThemeCustomizerSettings, imageSrc: string) {
  const src = cleanThemeImage(imageSrc);
  if (!src) return settings;
  const normalized = normalizeThemeMediaSettings(settings);
  return {
    ...normalized,
    homepageImages: {
      ...normalized.homepageImages,
      heroImage: src,
    },
  };
}

export function homepageHeroDeviceMediaType(
  settings: ThemeCustomizerSettings,
  device: HomepageHeroDevice,
): HomepageMediaType {
  const normalized = normalizeThemeMediaSettings(settings);
  const overrides = normalized.editor.pages["/"]?.overrides || [];
  const override = deviceOverride(overrides, device);
  if (override?.mediaType === "video") return "video";
  if (override?.mediaType === "image") return "image";
  return inferredMediaType(homepageHeroDeviceImage(normalized, device));
}

export function setHomepageHeroDeviceMedia(
  settings: ThemeCustomizerSettings,
  device: HomepageHeroDevice,
  mediaSrc: string,
  mediaType: HomepageMediaType,
) {
  const src = cleanThemeImage(mediaSrc);
  if (!src) return settings;
  const normalized = normalizeThemeMediaSettings(settings);
  const id = deviceId(device);
  return upsertThemeElementOverride(normalized, "/", {
    id,
    selector: `[data-theme-id="${id}"]`,
    label: device === "desktop" ? "Ana sayfa hero medyası · Masaüstü" : "Ana sayfa hero medyası · Mobil",
    tag: mediaType === "video" ? "video" : "img",
    kind: "image",
    hidden: false,
    imageSrc: src,
    mediaType,
    desktop: {},
    mobile: {},
  });
}

export function setHomepageHeroDeviceImage(
  settings: ThemeCustomizerSettings,
  device: HomepageHeroDevice,
  imageSrc: string,
) {
  return setHomepageHeroDeviceMedia(settings, device, imageSrc, "image");
}

export function homepageHeroDeviceForElement(id: string): HomepageHeroDevice | null {
  if (id === HOME_HERO_DESKTOP_IMAGE_ID) return "desktop";
  if (id === HOME_HERO_MOBILE_IMAGE_ID) return "mobile";
  return null;
}

export function isHomepageHeroElement(pathname: string, id: string) {
  return pathname === "/" && (
    id === HOME_HERO_IMAGE_ID
    || id === HOME_HERO_DESKTOP_IMAGE_ID
    || id === HOME_HERO_MOBILE_IMAGE_ID
  );
}
