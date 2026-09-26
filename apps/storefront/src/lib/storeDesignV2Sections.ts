import {
  normalizeThemeSection,
  type ThemeSection,
} from "@ruth-commerce/commerce-core/theme-sections";
import type {
  PageRecord,
  ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";

const LEGACY_RENDER_ALIASES: Record<string, string> = {
  "collection-cards": "collections",
  "trust-badges": "trust",
};

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
      return normalizeThemeSection({
        id: section.id,
        type: LEGACY_RENDER_ALIASES[section.type] || section.type,
        enabled: section.enabled,
        ...settings,
      });
    })
    .filter((section): section is ThemeSection => section !== null);
}
