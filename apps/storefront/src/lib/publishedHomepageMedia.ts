import type { ThemeCustomizerSettings, ThemeElementOverride } from "@/lib/themeCustomizer";
import {
  HOME_EDITORIAL_IMAGE_ID,
  HOME_EDITORIAL_VIDEO_ID,
  HOME_HERO_DESKTOP_IMAGE_ID,
  HOME_HERO_IMAGE_ID,
  HOME_HERO_MOBILE_IMAGE_ID,
} from "@/lib/themeMedia";
import type { ThemeDocument } from "@ruth-commerce/commerce-core/store-design-v2";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

const ID_ALIASES: Record<string, string> = {
  "section:home-hero::auto::0.2.0.0.0.0": HOME_HERO_MOBILE_IMAGE_ID,
  "section:home-hero::auto::0.2.0.0.0.1": HOME_HERO_DESKTOP_IMAGE_ID,
  "section:home-hero::auto::0.3.0.0.0": HOME_EDITORIAL_VIDEO_ID,
  "section:home-hero::auto::0.4.0.0.0": HOME_EDITORIAL_IMAGE_ID,
  "section:home-hero::auto::0.4.0.0.0.1": HOME_EDITORIAL_IMAGE_ID,
};

function canonicalId(id: string) {
  if (ID_ALIASES[id]) return ID_ALIASES[id];
  if (id === HOME_HERO_IMAGE_ID || id === HOME_HERO_DESKTOP_IMAGE_ID ||
      id === HOME_HERO_MOBILE_IMAGE_ID || id === HOME_EDITORIAL_IMAGE_ID ||
      id === HOME_EDITORIAL_VIDEO_ID || /^home-horizontal-card-[1-4]-[12]$/.test(id) ||
      /^home-scroll-media-\d+$/.test(id)) return id;
  return "";
}

function mediaSource(value: unknown, document: ThemeDocument): string {
  const media = record(record(value).media);
  const id = typeof media.assetId === "string" ? media.assetId : "";
  const asset = id ? document.media[id] : undefined;
  const src = asset?.url || (typeof media.src === "string" ? media.src : "");
  return src.trim();
}

type ResponsiveSources = { desktop?: string; mobile?: string };

/**
 * The home hero/editorial media also uses the legacy ThemeCustomizer settings.
 * Fold only the media fields published by Store Design V2 into a copy of those
 * settings before SSR so the public storefront and editor render the SAME
 * selected photos/videos without waiting for browser-only semantic patches.
 */
export function publishedHomepageMedia(
  settings: ThemeCustomizerSettings,
  document: ThemeDocument,
): ThemeCustomizerSettings {
  const page = settings.editor.pages["/"] || { overrides: [] };

  const selected = new Map<string, ResponsiveSources>();
  const accept = (key: string, responsive: unknown) => {
    let decoded = key;
    if (decoded.startsWith("id:")) {
      try { decoded = decodeURIComponent(decoded.slice(3)); }
      catch { decoded = decoded.slice(3); }
    }
    const canonical = canonicalId(decoded);
    if (!canonical) return;
    const responsiveSettings = record(responsive);
    const desktop = mediaSource(responsiveSettings.desktop, document);
    const mobile = mediaSource(responsiveSettings.mobile, document);
    if (!desktop && !mobile) return;
    selected.set(canonical, { ...selected.get(canonical), ...(desktop ? { desktop } : {}), ...(mobile ? { mobile } : {}) });
  };

  // Same broad-to-specific precedence as SemanticThemeRuntimeProvider.
  for (const global of [document.globals.header, document.globals.footer, document.globals.tokens]) {
    for (const [key, value] of Object.entries(global)) accept(key, value);
  }

  const home = document.pages["/"] || Object.values(document.pages).find((item) => item.route === "/");
  const template = home?.templateId ? document.templates[home.templateId] : (document.templates["route:/"] || document.templates["template:home"]);
  for (const [key, value] of Object.entries(template?.componentSettings || {})) accept(key, value);
  for (const sectionId of template?.sectionIds || []) {
    const section = document.sections[sectionId];
    if (!section) continue;
    for (const [key, value] of Object.entries(record(section.settings?.semantic))) accept(key, value);
  }

  if (!selected.size) return settings;
  const next = structuredClone(settings);
  const originals = page.overrides || [];
  const updated: ThemeElementOverride[] = [...originals];
  const typeOf = (source: string): "image" | "video" =>
    /\.(mp4|mov|m4v|webm)(?:[?#]|$)/i.test(source) ? "video" : "image";

  for (const [id, sources] of selected) {
    const index = updated.findIndex((item) => item.id === id);
    const previous = index >= 0 ? updated[index] : null;
    const old = record(previous);
    const src = sources.desktop || sources.mobile || "";
    const mobile = sources.mobile || (sources.desktop ? sources.desktop : "");
    const value = {
      ...old,
      id,
      selector: typeof old.selector === "string" ? old.selector : `[data-theme-id="${id}"]`,
      label: typeof old.label === "string" ? old.label : id,
      imageSrc: src,
      desktopImageSrc: src,
      mobileImageSrc: mobile,
      mediaType: typeOf(src),
      desktopMediaType: typeOf(src),
      mobileMediaType: typeOf(mobile),
    } as ThemeElementOverride;
    if (index < 0) updated.push(value);
    else updated[index] = value;
  }

  next.editor.pages["/"] = { ...page, overrides: updated };
  return next;
}
