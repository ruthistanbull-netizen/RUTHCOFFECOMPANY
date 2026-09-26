export type ThemeSectionType =
  | "hero"
  | "scroll-story"
  | "collections"
  | "featured-products"
  | "brand-story"
  | "trust"
  | "product-slider"
  | "product-grid"
  | "image-banner"
  | "rich-text"
  | "faq";

export type ThemeProductSource = "featured" | "all" | "collection" | "category";

export type ThemeSection = {
  id: string;
  type: ThemeSectionType;
  enabled: boolean;
  title?: string;
  eyebrow?: string;
  body?: string;
  linkLabel?: string;
  linkHref?: string;
  imageSrc?: string;
  imageAssetId?: string;
  mobileImageSrc?: string;
  mobileImageAssetId?: string;
  imageObjectPosition?: string;
  mobileImageObjectPosition?: string;
  faqItems?: Array<{ id: string; question: string; answer: string }>;
  productSource?: ThemeProductSource;
  productSourceId?: string;
  productLimit?: number;
  desktopItems?: number;
  mobileItems?: number;
  desktopHeight?: number;
  mobileHeight?: number;
  gap?: number;
  maxWidth?: "none" | "1200px" | "1280px" | "1440px" | "1600px";
  paddingY?: number;
  borderRadius?: number;
  backgroundColor?: string;
  textColor?: string;
  autoplay?: boolean;
  showArrows?: boolean;
};

export type ThemeSectionPage = {
  path: string;
  label: string;
  sections: ThemeSection[];
};

export type ThemeSectionSettings = {
  pages: Record<string, ThemeSectionPage>;
};

export const defaultHomepageSections: ThemeSection[] = [
  { id: "home-hero", type: "hero", enabled: true },
  { id: "home-scroll-story", type: "scroll-story", enabled: true },
  { id: "home-collections", type: "collections", enabled: true },
  { id: "home-featured-products", type: "featured-products", enabled: true },
  { id: "home-brand-story", type: "brand-story", enabled: true },
  { id: "home-trust", type: "trust", enabled: true },
];

export const defaultThemeSectionSettings: ThemeSectionSettings = {
  pages: {
    "/": { path: "/", label: "Ana Sayfa", sections: defaultHomepageSections },
  },
};

function text(value: unknown, fallback = "", max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

const ROSTA_SECTION_COLORS: Record<string, string> = {
  "#111111": "#111111",
  "#242424": "#242424",
  "#fbf3e6": "#FBF3E6",
  "#38251c": "#38251C",
  "#c94a40": "#C94A40",
  "#6b4638": "#6B4638",
  "#c8a77d": "#C8A77D",
  "#ffffff": "#FFFFFF",
  "#fff": "#FFFFFF",
  "#f4f0e8": "#FBF3E6",
  "#b9563d": "#C94A40",
  "#aaa8a1": "#C8A77D",
  "#6f725b": "#6B4638",
  "#2b1b16": "#38251C",
  "#faf7f2": "#FBF3E6",
  "#faf7f1": "#FBF3E6",
  "#b8976a": "#C94A40",
  "#d4b896": "#C94A40",
  "#9a7b52": "#38251C",
};

function color(value: unknown) {
  const raw = text(value, "", 20).toLowerCase();
  return raw ? ROSTA_SECTION_COLORS[raw] : undefined;
}

function link(value: unknown, fallback = "") {
  const raw = text(value, fallback, 500);
  if (!raw) return "";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  if (raw.startsWith("#")) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function image(value: unknown) {
  return link(value, "");
}

function optionalText(raw: Record<string, unknown>, key: string, max: number) {
  return typeof raw[key] === "string" ? text(raw[key], "", max) : undefined;
}

function optionalLink(raw: Record<string, unknown>, key: string) {
  return typeof raw[key] === "string" ? link(raw[key], "") : undefined;
}

function optionalImage(raw: Record<string, unknown>, key: string) {
  return typeof raw[key] === "string" ? image(raw[key]) : undefined;
}

function pagePath(value: unknown) {
  const raw = text(value, "/", 220).split(/[?#]/)[0] || "/";
  const withSlash = `/${raw.replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");
  return withSlash.length > 1 && withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
}

const sectionTypes = new Set<ThemeSectionType>([
  "hero", "scroll-story", "collections", "featured-products", "brand-story", "trust",
  "product-slider", "product-grid", "image-banner", "rich-text", "faq",
]);

export function normalizeThemeSection(input: unknown, index = 0): ThemeSection | null {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const type = sectionTypes.has(raw.type as ThemeSectionType) ? raw.type as ThemeSectionType : null;
  if (!type) return null;
  const id = text(raw.id, `section-${index}`, 120).replace(/[^a-zA-Z0-9_-]/g, "-") || `section-${index}`;
  const productSource: ThemeProductSource | undefined =
    raw.productSource === "all" || raw.productSource === "featured" || raw.productSource === "collection" || raw.productSource === "category"
      ? raw.productSource
      : undefined;
  return {
    id,
    type,
    enabled: raw.enabled !== false,
    title: optionalText(raw, "title", 220),
    eyebrow: optionalText(raw, "eyebrow", 160),
    body: optionalText(raw, "body", 6000),
    linkLabel: optionalText(raw, "linkLabel", 120),
    linkHref: optionalLink(raw, "linkHref"),
    imageSrc: optionalImage(raw, "imageSrc"),
    productSource,
    productSourceId: text(raw.productSourceId, "", 160) || undefined,
    productLimit: raw.productLimit == null ? undefined : Math.round(numberValue(raw.productLimit, 8, 1, 40)),
    desktopItems: raw.desktopItems == null ? undefined : numberValue(raw.desktopItems, 4, 1, 8),
    mobileItems: raw.mobileItems == null ? undefined : numberValue(raw.mobileItems, 2, 1, 4),
    desktopHeight: raw.desktopHeight == null ? undefined : Math.round(numberValue(raw.desktopHeight, 520, 120, 1200)),
    mobileHeight: raw.mobileHeight == null ? undefined : Math.round(numberValue(raw.mobileHeight, 360, 100, 900)),
    gap: raw.gap == null ? undefined : numberValue(raw.gap, 12, 0, 100),
    maxWidth: ["none", "1200px", "1280px", "1440px", "1600px"].includes(String(raw.maxWidth))
      ? String(raw.maxWidth) as ThemeSection["maxWidth"]
      : undefined,
    paddingY: raw.paddingY == null ? undefined : numberValue(raw.paddingY, 64, 0, 240),
    borderRadius: raw.borderRadius == null ? undefined : numberValue(raw.borderRadius, 0, 0, 120),
    backgroundColor: color(raw.backgroundColor),
    textColor: color(raw.textColor),
    autoplay: typeof raw.autoplay === "boolean" ? raw.autoplay : undefined,
    showArrows: typeof raw.showArrows === "boolean" ? raw.showArrows : undefined,
  };
}

export function normalizeThemeSectionSettings(input: unknown): ThemeSectionSettings {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const rawPages = raw.pages && typeof raw.pages === "object" ? raw.pages as Record<string, unknown> : {};
  const pages: Record<string, ThemeSectionPage> = {};

  for (const [candidatePath, candidatePage] of Object.entries(rawPages).slice(0, 80)) {
    const page = candidatePage && typeof candidatePage === "object" ? candidatePage as Record<string, unknown> : {};
    const path = pagePath(page.path || candidatePath);
    const rawSections = Array.isArray(page.sections) ? page.sections : [];
    const sections = rawSections
      .slice(0, 80)
      .map((section, index) => normalizeThemeSection(section, index))
      .filter((section): section is ThemeSection => section !== null);
    pages[path] = {
      path,
      label: text(page.label, path === "/" ? "Ana Sayfa" : path.split("/").filter(Boolean).pop() || "Sayfa", 120),
      sections,
    };
  }

  if (!pages["/"]) pages["/"] = defaultThemeSectionSettings.pages["/"];
  if (pages["/"].sections.length === 0) pages["/"] = defaultThemeSectionSettings.pages["/"];
  return { pages };
}

export function themeSectionPage(settings: ThemeSectionSettings, pathname: string): ThemeSectionPage {
  const path = pagePath(pathname);
  return settings.pages[path] || { path, label: path, sections: [] };
}

function usesCustomProductRenderer(section: ThemeSection) {
  return Boolean(
    section.title !== undefined ||
    section.eyebrow !== undefined ||
    section.productLimit !== undefined ||
    section.desktopItems !== undefined ||
    section.mobileItems !== undefined ||
    section.productSource !== undefined ||
    section.productSourceId !== undefined ||
    section.gap !== undefined ||
    section.maxWidth !== undefined ||
    section.paddingY !== undefined ||
    section.desktopHeight !== undefined ||
    section.mobileHeight !== undefined ||
    section.backgroundColor !== undefined ||
    section.textColor !== undefined ||
    section.linkLabel !== undefined ||
    section.linkHref !== undefined ||
    section.showArrows !== undefined
  );
}

/**
 * Fields that change rendered DOM structure or server-selected products.
 * Pure visual/text value edits can stay on postMessage without reloading the
 * preview iframe; a signature change requires the server-backed draft render.
 */
export function themeSectionRenderSignature(settings: ThemeSectionSettings) {
  return JSON.stringify(Object.entries(settings.pages)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, page]) => [path, page.sections.map((section) => ({
      id: section.id,
      type: section.type,
      enabled: section.enabled,
      customProductRenderer: section.type === "featured-products" ? usesCustomProductRenderer(section) : undefined,
      productSource: section.productSource,
      productSourceId: section.productSourceId,
      productLimit: section.productLimit,
      showArrows: section.showArrows,
      hasTitle: Boolean(section.title),
      hasEyebrow: Boolean(section.eyebrow),
      hasBody: Boolean(section.body),
      hasLink: Boolean(section.linkLabel && section.linkHref),
      hasImage: Boolean(section.imageSrc),
    }))]));
}

export function createThemeSection(type: ThemeSectionType, id = `section-${Date.now()}`): ThemeSection {
  if (type === "product-grid") {
    return { id, type, enabled: true, title: "Ürünler", productSource: "featured", productLimit: 12, desktopItems: 3, mobileItems: 2, gap: 20, maxWidth: "none", paddingY: 64 };
  }
  if (type === "product-slider") {
    return { id, type, enabled: true, title: "Ürünler", productSource: "featured", productLimit: 12, desktopItems: 4, mobileItems: 2, gap: 12, paddingY: 64, showArrows: true, autoplay: false };
  }
  if (type === "image-banner") {
    return { id, type, enabled: true, title: "Yeni Bölüm", desktopHeight: 520, mobileHeight: 360, paddingY: 0, borderRadius: 0 };
  }
  if (type === "rich-text") {
    return { id, type, enabled: true, title: "Başlık", body: "Metninizi buraya ekleyin.", paddingY: 64 };
  }
  return { id, type, enabled: true };
}

export function upsertThemeSectionPage(settings: ThemeSectionSettings, page: ThemeSectionPage): ThemeSectionSettings {
  const path = pagePath(page.path);
  return normalizeThemeSectionSettings({ ...settings, pages: { ...settings.pages, [path]: { ...page, path } } });
}
