import {
  normalizeThemeSection,
  type ThemeSection,
} from "@ruth-commerce/commerce-core/theme-sections";
import type {
  BlockInstance,
  MediaAsset,
  PageRecord,
  ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";

const LEGACY_RENDER_ALIASES: Record<string, string> = {
  "collection-cards": "collections",
};

const BLOCK_RENDER_SECTION_TYPES = new Set([
  "video-hero",
  "video-banner",
  "background-media",
  "slideshow",
  "gallery-grid",
  "masonry-gallery",
  "collage",
  "image-text-split",
  "video-text-split",
  "social-grid",
  "before-after",
  "hotspot-lookbook",
  "logo-cloud",
  "text-columns",
  "stats",
  "timeline",
  "feature-grid",
  "trust-badges",
  "testimonials",
  "tabs",
  "press-awards",
  "team",
  "announcement-bar",
  "marquee",
  "heading-subtext",
  "manifesto",
  "quote",
  "promo-banner",
  "countdown",
  "shipping-returns-cta",
  "spacer",
  "divider",
  "anchor",
]);

function versionedMediaUrl(asset: MediaAsset | undefined) {
  if (!asset?.url) return undefined;
  const version = Math.max(1, Number(asset.version || 1));

  try {
    const url = new URL(asset.url);
    url.searchParams.set("v", String(version));
    return url.toString();
  } catch {
    const [withoutHash, hash = ""] = asset.url.split("#", 2);
    const [pathname, query = ""] = withoutHash.split("?", 2);
    const params = new URLSearchParams(query);
    params.set("v", String(version));
    const search = params.toString();
    return `${pathname}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
  }
}

function focalPosition(asset: MediaAsset | undefined) {
  if (!asset?.focalPoint) return undefined;
  const x = Math.min(100, Math.max(0, Number(asset.focalPoint.x || 0)));
  const y = Math.min(100, Math.max(0, Number(asset.focalPoint.y || 0)));
  return `${x}% ${y}%`;
}

export function storeDesignPageForRoute(document: ThemeDocument, pathname: string) {
  return document.pages[pathname] || Object.values(document.pages).find((page) => page.route === pathname) || null;
}

export function storeDesignSectionsForPage(document: ThemeDocument, page: PageRecord): ThemeSection[] {
  const template = document.templates[page.templateId];
  if (!template) return [];

  return template.sectionIds
    .map((id) => document.sections[id])
    .filter(Boolean)
    .map((section) => {
      const { semantic: _semantic, ...settings } = section.settings || {};
      const v2BlockSection = BLOCK_RENDER_SECTION_TYPES.has(section.type);
      const normalized = normalizeThemeSection({
        id: section.id,
        type: LEGACY_RENDER_ALIASES[section.type] || (v2BlockSection ? "rich-text" : section.type),
        enabled: section.enabled,
        ...settings,
      });
      if (!normalized) return null;

      const imageAssetId = typeof settings.imageAssetId === "string" ? settings.imageAssetId : "";
      const desktopAsset = imageAssetId ? document.media[imageAssetId] : undefined;
      const mobileAsset = desktopAsset?.mobileAssetId ? document.media[desktopAsset.mobileAssetId] : undefined;

      const faqItems = section.type === "faq"
        ? (section.blockIds || [])
            .map((blockId) => document.blocks[blockId])
            .filter((block): block is BlockInstance => Boolean(block && block.type === "faq-item"))
            .map((block) => ({
              id: block.id,
              question: typeof block.settings.question === "string" ? block.settings.question : "",
              answer: typeof block.settings.answer === "string" ? block.settings.answer : "",
            }))
            .filter((item) => item.question || item.answer)
        : undefined;

      const v2Assets = v2BlockSection
        ? Object.fromEntries(
            Object.entries(settings)
              .filter(([key, value]) => /AssetId$/.test(key) && typeof value === "string" && Boolean(value))
              .map(([key, value]) => {
                const asset = document.media[String(value)];
                const poster = asset?.posterAssetId ? document.media[asset.posterAssetId] : undefined;
                return asset
                  ? [key, { url: versionedMediaUrl(asset)!, type: asset.type, posterUrl: versionedMediaUrl(poster) }]
                  : [key, undefined];
              })
              .filter((entry): entry is [string, { url: string; type: "image" | "video"; posterUrl?: string }] => Boolean(entry[1])),
          )
        : undefined;

      const v2Blocks = v2BlockSection
        ? (section.blockIds || [])
            .map((blockId) => document.blocks[blockId])
            .filter((block): block is BlockInstance => Boolean(block))
            .map((block) => {
              const mediaRef = typeof block.settings.assetId === "string"
                ? block.settings.assetId
                : typeof block.settings.media === "string"
                  ? block.settings.media
                  : "";
              const asset = mediaRef ? document.media[mediaRef] : undefined;
              const poster = asset?.posterAssetId ? document.media[asset.posterAssetId] : undefined;
              return {
                id: block.id,
                type: block.type,
                settings: block.settings,
                assetUrl: versionedMediaUrl(asset),
                assetType: asset?.type,
                posterUrl: versionedMediaUrl(poster),
              };
            })
        : undefined;

      return {
        ...normalized,
        imageSrc: versionedMediaUrl(desktopAsset) || normalized.imageSrc,
        imageAssetId: desktopAsset?.assetId,
        mobileImageSrc: versionedMediaUrl(mobileAsset),
        mobileImageAssetId: mobileAsset?.assetId,
        imageObjectPosition: focalPosition(desktopAsset),
        mobileImageObjectPosition: focalPosition(mobileAsset) || focalPosition(desktopAsset),
        faqItems,
        v2Type: v2BlockSection ? section.type : undefined,
        v2Settings: v2BlockSection ? settings : undefined,
        v2MediaType: v2BlockSection ? desktopAsset?.type : undefined,
        v2PosterUrl: v2BlockSection && desktopAsset?.posterAssetId ? versionedMediaUrl(document.media[desktopAsset.posterAssetId]) : undefined,
        v2Assets,
        v2Blocks,
      };
    })
    .filter((section): section is ThemeSection => section !== null);
}
