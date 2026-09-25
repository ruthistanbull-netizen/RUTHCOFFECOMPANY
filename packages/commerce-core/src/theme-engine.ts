export type ThemeNavChild = { label: string; path: string };
export type ThemeNavItem = { id: string; label: string; path: string; side?: "left" | "right"; children?: ThemeNavChild[] };
export type ThemeMenuMediaCard = { id: string; imageSrc: string; label: string; href: string };

export type ThemeLengthUnit = "px" | "%" | "vw" | "vh" | "svh";
export type ThemeTextAlign = "left" | "center" | "right";
export type ThemeObjectFit = "cover" | "contain" | "fill";

export type ThemeDeviceStyle = {
  width?: number | null;
  widthUnit?: ThemeLengthUnit;
  height?: number | null;
  heightUnit?: ThemeLengthUnit;
  maxWidth?: number | null;
  maxWidthUnit?: ThemeLengthUnit;
  minHeight?: number | null;
  minHeightUnit?: ThemeLengthUnit;
  fontSize?: number | null;
  lineHeight?: number | null;
  letterSpacing?: number | null;
  paddingX?: number | null;
  paddingY?: number | null;
  marginTop?: number | null;
  marginBottom?: number | null;
  gap?: number | null;
  borderRadius?: number | null;
  opacity?: number | null;
  textAlign?: ThemeTextAlign;
  objectFit?: ThemeObjectFit;
  mediaScale?: number | null;
  objectPositionX?: number | null;
  objectPositionY?: number | null;
  color?: string | null;
  backgroundColor?: string | null;
};

export type ThemeElementOverride = {
  id: string;
  selector: string;
  label: string;
  tag?: string;
  kind?: "section" | "text" | "image" | "button" | "link" | "container" | "other";
  hidden?: boolean;
  text?: string;
  imageSrc?: string;
  mediaType?: "image" | "video";
  desktopImageSrc?: string;
  mobileImageSrc?: string;
  desktopMediaType?: "image" | "video";
  mobileMediaType?: "image" | "video";
  duplicateOf?: string;
  href?: string;
  desktop?: ThemeDeviceStyle;
  mobile?: ThemeDeviceStyle;
};

export type ThemePageEditorConfig = {
  overrides: ThemeElementOverride[];
};

export type ThemeVisualEditorSettings = {
  pages: Record<string, ThemePageEditorConfig>;
};

export type ThemeCustomizerSettings = {
  announcement: { enabled: boolean; text: string; text2: string; href: string; intervalSeconds: number };
  logo: { src: string; desktopWidth: number; mobileWidth: number };
  colors: { ivory: string; cream: string; ink: string; gold: string; goldDark: string; muted: string };
  header: { links: ThemeNavItem[]; mediaCards?: ThemeMenuMediaCard[] };
  whatsapp: { enabled: boolean; phone: string; label: string };
  homepageImages: { heroImage: string; heroDesktopImage: string; heroMobileImage: string; editorialVideo: string; editorialImage: string; scrollImages: string[] };
  editor: ThemeVisualEditorSettings;
};

export const defaultThemeCustomizerSettings: ThemeCustomizerSettings = {
  announcement: { enabled: false, text: "2000 TL ve üzeri alışverişlerde ücretsiz kargo ✦", text2: "", href: "/products", intervalSeconds: 5 },
  logo: { src: "/rosta-coffee-co.svg", desktopWidth: 180, mobileWidth: 120 },
  colors: { ivory: "#111111", cream: "#242424", ink: "#FBF3E6", gold: "#C94A40", goldDark: "#38251C", muted: "#6B4638" },
  header: { links: [
    { id: "home", label: "Anasayfa", path: "/", side: "left", children: [] },
    { id: "products", label: "Tüm Ürünler", path: "/products", side: "left", children: [] },
    { id: "categories", label: "Kategoriler", path: "/categories", side: "left", children: [] },
    { id: "collections", label: "Koleksiyonlar", path: "/collections", side: "right", children: [] },
    { id: "tracking", label: "Sipariş Takip", path: "/siparis-takip", side: "right", children: [] },
    { id: "contact", label: "İletişim", path: "/contact", side: "right", children: [] },
  ], mediaCards: [] },
  whatsapp: { enabled: false, phone: "", label: "WhatsApp" },
  homepageImages: { heroImage: "", heroDesktopImage: "", heroMobileImage: "", editorialVideo: "/home/rosta-under-hero-video.mp4", editorialImage: "/home/rosta-under-hero-photo.jpg", scrollImages: ["/home/rosta-hero-current.webp", "/home/rosta-espresso.webp", "/home/rosta-hero-v4.webp", "/home/rosta-under-hero-photo.jpg", "/home/rosta-under-hero-v4.jpg", "/home/rosta-hero.webp"] },
  editor: { pages: {} },
};

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function numeric(value: unknown, fallback: number, min: number, max: number) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : fallback;
}

function nullableNumber(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : null;
}

const ROSTA_THEME_COLOR_ALIASES: Record<string, string> = {
  "#111111": "#111111",
  "#242424": "#242424",
  "#fbf3e6": "#FBF3E6",
  "#38251c": "#38251C",
  "#c94a40": "#C94A40",
  "#6b4638": "#6B4638",
  "#c8a77d": "#C8A77D",
  "#ffffff": "#FFFFFF",
  "#b9563d": "#C94A40",
  "#f4f0e8": "#FBF3E6",
  "#aaa8a1": "#C8A77D",
  "#6f725b": "#6B4638",
  "#2b1b16": "#38251C",
};

function colorValue(value: unknown, fallback: string | null) {
  const raw = stringValue(value, fallback || "").toLowerCase();
  if (!raw) return fallback;
  return ROSTA_THEME_COLOR_ALIASES[raw] || fallback;
}

function safeUrl(value: unknown, fallback: string, kind: "link" | "image") {
  const raw = stringValue(value, fallback).replace(/[\u0000-\u001f\u007f]/g, "");
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  if (kind === "link" && raw.startsWith("#")) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "https:") return parsed.toString();
    if (kind === "link" && (parsed.protocol === "mailto:" || parsed.protocol === "tel:")) return parsed.toString();
    return fallback;
  } catch {
    return fallback;
  }
}

function inputObject(input: unknown): Record<string, any> {
  if (typeof input === "string") {
    try { return inputObject(JSON.parse(input)); } catch { return {}; }
  }
  if (!input || typeof input !== "object") return {};
  const value = input as Record<string, any>;
  if (value.settings && typeof value.settings === "object") return value.settings;
  if (value.setting_value) return inputObject(value.setting_value);
  return value;
}

function normalizeUnit(value: unknown, fallback: ThemeLengthUnit): ThemeLengthUnit {
  return value === "%" || value === "vw" || value === "vh" || value === "svh" || value === "px" ? value : fallback;
}

export function normalizeThemeDeviceStyle(input: unknown): ThemeDeviceStyle {
  const raw = input && typeof input === "object" ? input as Record<string, any> : {};
  return {
    width: nullableNumber(raw.width, 0, 5000),
    widthUnit: normalizeUnit(raw.widthUnit, "px"),
    height: nullableNumber(raw.height, 0, 5000),
    heightUnit: normalizeUnit(raw.heightUnit, "px"),
    maxWidth: nullableNumber(raw.maxWidth, 0, 5000),
    maxWidthUnit: normalizeUnit(raw.maxWidthUnit, "px"),
    minHeight: nullableNumber(raw.minHeight, 0, 5000),
    minHeightUnit: normalizeUnit(raw.minHeightUnit, "px"),
    fontSize: nullableNumber(raw.fontSize, 6, 240),
    lineHeight: nullableNumber(raw.lineHeight, 0.5, 4),
    letterSpacing: nullableNumber(raw.letterSpacing, -20, 100),
    paddingX: nullableNumber(raw.paddingX, 0, 500),
    paddingY: nullableNumber(raw.paddingY, 0, 500),
    marginTop: nullableNumber(raw.marginTop, -1000, 2000),
    marginBottom: nullableNumber(raw.marginBottom, -1000, 2000),
    gap: nullableNumber(raw.gap, 0, 500),
    borderRadius: nullableNumber(raw.borderRadius, 0, 1000),
    opacity: nullableNumber(raw.opacity, 0, 1),
    textAlign: raw.textAlign === "left" || raw.textAlign === "center" || raw.textAlign === "right" ? raw.textAlign : undefined,
    objectFit: raw.objectFit === "cover" || raw.objectFit === "contain" || raw.objectFit === "fill" ? raw.objectFit : undefined,
    mediaScale: nullableNumber(raw.mediaScale, 70, 140),
    objectPositionX: nullableNumber(raw.objectPositionX, 0, 100),
    objectPositionY: nullableNumber(raw.objectPositionY, 0, 100),
    color: colorValue(raw.color, null),
    backgroundColor: colorValue(raw.backgroundColor, null),
  };
}

function normalizeMediaDeviceStyle(input: unknown): ThemeDeviceStyle {
  const style = normalizeThemeDeviceStyle(input);
  return {
    ...style,
    // The old editor stored arbitrary pixel boxes on media. The new media
    // system always inherits the storefront's responsive frame instead.
    width: null,
    height: null,
    maxWidth: null,
    minHeight: null,
    paddingX: null,
    paddingY: null,
    marginTop: null,
    marginBottom: null,
  };
}

function normalizeElementOverride(input: unknown, index: number): ThemeElementOverride | null {
  const raw = input && typeof input === "object" ? input as Record<string, any> : {};
  const selector = stringValue(raw.selector).slice(0, 700);
  if (!selector) return null;
  const kindValues = new Set(["section", "text", "image", "button", "link", "container", "other"]);
  const kind = kindValues.has(raw.kind) ? raw.kind as ThemeElementOverride["kind"] : "other";
  return {
    id: stringValue(raw.id, `element-${index}`).slice(0, 140),
    selector,
    label: stringValue(raw.label, "Öğe").slice(0, 180),
    tag: stringValue(raw.tag).slice(0, 40),
    kind,
    hidden: typeof raw.hidden === "boolean" ? raw.hidden : undefined,
    text: typeof raw.text === "string" ? raw.text.slice(0, 16000) : undefined,
    imageSrc: typeof raw.imageSrc === "string" ? safeUrl(raw.imageSrc, "", "image") : undefined,
    mediaType: raw.mediaType === "video" ? "video" : raw.mediaType === "image" ? "image" : undefined,
    desktopImageSrc: typeof raw.desktopImageSrc === "string" ? safeUrl(raw.desktopImageSrc, "", "image") : undefined,
    mobileImageSrc: typeof raw.mobileImageSrc === "string" ? safeUrl(raw.mobileImageSrc, "", "image") : undefined,
    desktopMediaType: raw.desktopMediaType === "video" ? "video" : raw.desktopMediaType === "image" ? "image" : undefined,
    mobileMediaType: raw.mobileMediaType === "video" ? "video" : raw.mobileMediaType === "image" ? "image" : undefined,
    duplicateOf: typeof raw.duplicateOf === "string" ? stringValue(raw.duplicateOf).slice(0, 140) || undefined : undefined,
    href: typeof raw.href === "string" ? safeUrl(raw.href, "", "link") : undefined,
    desktop: kind === "image" ? normalizeMediaDeviceStyle(raw.desktop) : normalizeThemeDeviceStyle(raw.desktop),
    mobile: kind === "image" ? normalizeMediaDeviceStyle(raw.mobile) : normalizeThemeDeviceStyle(raw.mobile),
  };
}

export function normalizeThemeEditor(input: unknown): ThemeVisualEditorSettings {
  const raw = input && typeof input === "object" ? input as Record<string, any> : {};
  const rawPages = raw.pages && typeof raw.pages === "object" ? raw.pages as Record<string, any> : {};
  const pages: Record<string, ThemePageEditorConfig> = {};
  for (const [pagePath, page] of Object.entries(rawPages).slice(0, 80)) {
    if (!pagePath.startsWith("/")) continue;
    const overrides: unknown[] = Array.isArray(page?.overrides) ? page.overrides as unknown[] : [];
    pages[pagePath.slice(0, 300)] = {
      overrides: overrides
        .slice(0, 500)
        .map((item: unknown, index: number) => normalizeElementOverride(item, index))
        .filter((item: ThemeElementOverride | null): item is ThemeElementOverride => item !== null),
    };
  }
  return { pages };
}

export function normalizeThemeCustomizerSettings(input: unknown): ThemeCustomizerSettings {
  const raw = inputObject(input);
  const announcement = raw.announcement || {};
  const logo = raw.logo || {};
  const colors = raw.colors || {};
  const whatsapp = raw.whatsapp || {};
  const homepageImages = raw.homepageImages || {};
  const header = raw.header || {};
  const links: ThemeNavItem[] = Array.isArray(header.links) ? header.links.map((item: any, index: number) => ({
    id: stringValue(item?.id, `link-${index}`).slice(0, 80),
    label: stringValue(item?.label).slice(0, 80),
    path: safeUrl(item?.path, "/", "link"),
    side: item?.side === "right" ? "right" : "left",
    children: Array.isArray(item?.children) ? item.children.map((child: any) => ({ label: stringValue(child?.label).slice(0, 80), path: safeUrl(child?.path, "/", "link") })).filter((child: ThemeNavChild) => child.label) : [],
  })).filter((item: ThemeNavItem) => item.label) : defaultThemeCustomizerSettings.header.links;
  const mediaCards: ThemeMenuMediaCard[] = Array.isArray(header.mediaCards)
    ? header.mediaCards
        .slice(0, 12)
        .map((item: any, index: number) => ({
          id: stringValue(item?.id, `menu-media-${index}`).slice(0, 80),
          imageSrc: safeUrl(item?.imageSrc, "", "image"),
          label: stringValue(item?.label).slice(0, 80),
          href: safeUrl(item?.href, "/collections", "link"),
        }))
        .filter((item: ThemeMenuMediaCard) => item.imageSrc)
    : defaultThemeCustomizerSettings.header.mediaCards;
  const scrollImages = Array.isArray(homepageImages.scrollImages) ? homepageImages.scrollImages.map((item: unknown) => safeUrl(item, "", "image")).filter(Boolean).slice(0, 12) : defaultThemeCustomizerSettings.homepageImages.scrollImages;
  return {
    announcement: {
      enabled: typeof announcement.enabled === "boolean" ? announcement.enabled : defaultThemeCustomizerSettings.announcement.enabled,
      text: stringValue(announcement.text, defaultThemeCustomizerSettings.announcement.text).slice(0, 220),
      text2: stringValue(announcement.text2).slice(0, 220),
      href: safeUrl(announcement.href, defaultThemeCustomizerSettings.announcement.href, "link"),
      intervalSeconds: Math.round(numeric(announcement.intervalSeconds, 5, 2, 60)),
    },
    logo: {
      src: safeUrl(logo.src, defaultThemeCustomizerSettings.logo.src, "image"),
      desktopWidth: Math.round(numeric(logo.desktopWidth, 245, 40, 700)),
      mobileWidth: Math.round(numeric(logo.mobileWidth, 170, 40, 500)),
    },
    colors: {
      ivory: defaultThemeCustomizerSettings.colors.ivory,
      cream: defaultThemeCustomizerSettings.colors.cream,
      ink: defaultThemeCustomizerSettings.colors.ink,
      gold: defaultThemeCustomizerSettings.colors.gold,
      goldDark: defaultThemeCustomizerSettings.colors.goldDark,
      muted: defaultThemeCustomizerSettings.colors.muted,
    },
    header: {
      links: links.length ? links : defaultThemeCustomizerSettings.header.links,
      mediaCards,
    },
    whatsapp: {
      enabled: typeof whatsapp.enabled === "boolean" ? whatsapp.enabled : defaultThemeCustomizerSettings.whatsapp.enabled,
      phone: stringValue(whatsapp.phone, defaultThemeCustomizerSettings.whatsapp.phone).replace(/\D/g, "").slice(0, 20),
      label: stringValue(whatsapp.label, defaultThemeCustomizerSettings.whatsapp.label).slice(0, 80),
    },
    homepageImages: {
      heroImage: safeUrl(homepageImages.heroImage, defaultThemeCustomizerSettings.homepageImages.heroImage, "image"),
      heroDesktopImage: safeUrl(homepageImages.heroDesktopImage, defaultThemeCustomizerSettings.homepageImages.heroDesktopImage, "image"),
      heroMobileImage: safeUrl(homepageImages.heroMobileImage, defaultThemeCustomizerSettings.homepageImages.heroMobileImage, "image"),
      editorialVideo: safeUrl(homepageImages.editorialVideo, defaultThemeCustomizerSettings.homepageImages.editorialVideo, "image"),
      editorialImage: safeUrl(homepageImages.editorialImage, defaultThemeCustomizerSettings.homepageImages.editorialImage, "image"),
      scrollImages: scrollImages.length ? scrollImages : defaultThemeCustomizerSettings.homepageImages.scrollImages,
    },
    editor: normalizeThemeEditor(raw.editor),
  };
}

export function themePageKey(pathname: string) {
  const clean = `/${String(pathname || "/").split(/[?#]/)[0].replace(/^\/+/, "")}`.replace(/\/{2,}/g, "/");
  return clean.length > 1 && clean.endsWith("/") ? clean.slice(0, -1) : clean;
}

export function themeTemplatePageKey(pathname: string) {
  const key = themePageKey(pathname);
  if (/^\/products\/[^/]+$/.test(key)) return "/products/[slug]";
  if (/^\/category\/[^/]+$/.test(key)) return "/category/[slug]";
  if (/^\/collections\/[^/]+$/.test(key)) return "/collections/[slug]";
  return key;
}

const styleUnitValueKeys: Partial<Record<keyof ThemeDeviceStyle, keyof ThemeDeviceStyle>> = {
  widthUnit: "width",
  heightUnit: "height",
  maxWidthUnit: "maxWidth",
  minHeightUnit: "minHeight",
};

/**
 * Device styles are sparse overrides. Normalized settings intentionally keep
 * empty numeric fields as null, so a plain object spread would erase a
 * desktop/template value when a mobile/page override only changes one field.
 */
export function mergeThemeDeviceStyle(base?: ThemeDeviceStyle, next?: ThemeDeviceStyle) {
  const merged: ThemeDeviceStyle = { ...(base || {}) };
  for (const [rawKey, value] of Object.entries(next || {})) {
    const key = rawKey as keyof ThemeDeviceStyle;
    if (value === null || value === undefined) continue;

    const pairedValueKey = styleUnitValueKeys[key];
    if (pairedValueKey && next?.[pairedValueKey] == null) continue;

    (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

export function mergeThemeElementOverride(base: ThemeElementOverride | undefined, next: ThemeElementOverride) {
  if (!base) return {
    ...next,
    desktop: mergeThemeDeviceStyle(undefined, next.desktop),
    mobile: mergeThemeDeviceStyle(undefined, next.mobile),
  };

  const merged: ThemeElementOverride = { ...base };
  for (const [key, value] of Object.entries(next)) {
    if (key === "desktop" || key === "mobile" || value === undefined) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  merged.desktop = mergeThemeDeviceStyle(base.desktop, next.desktop);
  merged.mobile = mergeThemeDeviceStyle(base.mobile, next.mobile);
  return merged;
}

/** Resolve global -> dynamic template -> exact page precedence consistently. */
export function resolveThemeElementOverrides(settings: ThemeCustomizerSettings, pathname: string) {
  const exactKey = themePageKey(pathname);
  const templateKey = themeTemplatePageKey(exactKey);
  const combined = [
    ...themePage(settings, "/__global__").overrides,
    ...(templateKey !== exactKey ? themePage(settings, templateKey).overrides : []),
    ...themePage(settings, exactKey).overrides,
  ];
  const merged = new Map<string, ThemeElementOverride>();
  for (const item of combined) {
    const key = item.id || item.selector;
    merged.set(key, mergeThemeElementOverride(merged.get(key), item));
  }
  return Array.from(merged.values());
}

export function themePage(settings: ThemeCustomizerSettings, pathname: string): ThemePageEditorConfig {
  return settings.editor.pages[themePageKey(pathname)] || { overrides: [] };
}

export function upsertThemeElementOverride(settings: ThemeCustomizerSettings, pathname: string, next: ThemeElementOverride): ThemeCustomizerSettings {
  const key = themePageKey(pathname);
  const page = themePage(settings, key);
  const index = page.overrides.findIndex((item) => item.id === next.id || item.selector === next.selector);
  const overrides = [...page.overrides];
  const normalized = normalizeElementOverride(next, index < 0 ? overrides.length : index);
  if (!normalized) return settings;
  if (index < 0) overrides.push(normalized); else overrides[index] = normalized;
  return { ...settings, editor: { ...settings.editor, pages: { ...settings.editor.pages, [key]: { overrides } } } };
}

export function removeThemeElementOverride(settings: ThemeCustomizerSettings, pathname: string, id: string): ThemeCustomizerSettings {
  const key = themePageKey(pathname);
  const page = themePage(settings, key);
  return { ...settings, editor: { ...settings.editor, pages: { ...settings.editor.pages, [key]: { overrides: page.overrides.filter((item) => item.id !== id) } } } };
}

export function isSystemManagedMenuLink(link: Pick<ThemeNavItem, "id" | "label" | "path">) {
  const key = `${link.id} ${link.label} ${link.path}`.toLocaleLowerCase("tr-TR");
  return link.path === "/categories" || link.path === "/collections" || link.path.includes("new-arrivals") || key.includes("kategori") || key.includes("koleksiyon") || key.includes("yeni gelen") || key.includes("new arrival");
}
