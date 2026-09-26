import {
  normalizeThemeSection,
  type ThemeSection,
} from "@ruth-commerce/commerce-core/theme-sections";
import type {
  MediaAsset,
  PageRecord,
  ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";

const LEGACY_RENDER_ALIASES: Record<string, string> = {
  "collection-cards": "collections",
  "trust-badges": "trust",
};

function versionedMediaUrl(asset: MediaAsset | undefined) {
  if (!asset?.url) return undefined;
  const version = Math.max(1, Number(asset.version || 1));
  const joiner = asset.url.includes("?") ? "&" : "?";
  return `${asset.url}${joiner}v=${version}`;
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
      const normalized = normalizeThemeSection({
        id: section.id,
        type: LEGACY_RENDER_ALIASES[section.type] || section.type,
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
            .filter((block) => block?.type === "faq-item")
            .map((block) => ({
              id: block.id,
              question: typeof block.settings.question === "string" ? block.settings.question : "",
              answer: typeof block.settings.answer === "string" ? block.settings.answer : "",
            }))
            .filter((item) => item.question || item.answer)
        : undefined;

      return {
        ...normalized,
        imageSrc: versionedMediaUrl(desktopAsset) || normalized.imageSrc,
        mobileImageSrc: versionedMediaUrl(mobileAsset),
        imageObjectPosition: focalPosition(desktopAsset),
        mobileImageObjectPosition: focalPosition(mobileAsset) || focalPosition(desktopAsset),
        faqItems,
      };
    })
    .filter((section): section is ThemeSection => section !== null);
}
