"use client";

import { useEffect, useRef } from "react";
import {
  themePage,
  themePageKey,
  type ThemeCustomizerSettings,
  type ThemeDeviceStyle,
  type ThemeElementOverride,
} from "@/lib/themeCustomizer";
import {
  themeSectionPage,
  type ThemeSection,
  type ThemeSectionSettings,
} from "@ruth-commerce/commerce-core/theme-sections";

function templatePageKey(pathname: string) {
  const key = themePageKey(pathname);
  if (/^\/products\/[^/]+$/.test(key)) return "/products/[slug]";
  if (/^\/category\/[^/]+$/.test(key)) return "/category/[slug]";
  if (/^\/collections\/[^/]+$/.test(key)) return "/collections/[slug]";
  return key;
}

function isHeroImageId(id: string) {
  return /^home-hero-image-\d+(?:--(?:desktop|mobile)-image)?$/.test(id);
}

function mergeStyle(base?: ThemeDeviceStyle, next?: ThemeDeviceStyle) {
  return { ...(base || {}), ...(next || {}) } as ThemeDeviceStyle;
}

function mergeOverride(base: ThemeElementOverride | undefined, next: ThemeElementOverride) {
  if (!base) return next;
  return {
    ...base,
    ...next,
    hidden: next.hidden ?? base.hidden,
    desktop: mergeStyle(base.desktop, next.desktop),
    mobile: mergeStyle(base.mobile, next.mobile),
  } as ThemeElementOverride;
}

function allOverrides(settings: ThemeCustomizerSettings) {
  const exact = themePageKey(window.location.pathname);
  const template = templatePageKey(exact);
  const merged = new Map<string, ThemeElementOverride>();
  const list = [
    ...themePage(settings, "/__global__").overrides,
    ...(template !== exact ? themePage(settings, template).overrides : []),
    ...themePage(settings, exact).overrides,
  ];
  for (const item of list) merged.set(item.id, mergeOverride(merged.get(item.id), item));
  return [...merged.values()];
}

function findTarget(override: ThemeElementOverride) {
  try {
    const bySelector = document.querySelector(override.selector);
    if (bySelector) return bySelector;
  } catch {}
  return document.querySelector(`[data-theme-id="${CSS.escape(override.id)}"]`);
}

function replaceImage(target: Element, src: string) {
  const image = target instanceof HTMLImageElement
    ? target
    : target.querySelector("img");
  if (!(image instanceof HTMLImageElement)) return;

  image.setAttribute("src", src);
  image.setAttribute("srcset", src);
  image.src = src;
  image.srcset = src;

  const picture = image.closest("picture");
  if (picture) {
    for (const source of Array.from(picture.querySelectorAll("source"))) {
      source.setAttribute("srcset", src);
      source.srcset = src;
    }
  }
}

function applyStyle(element: HTMLElement, desktop?: ThemeDeviceStyle, mobile?: ThemeDeviceStyle) {
  const style = mergeStyle(desktop, window.innerWidth < 768 ? mobile : undefined);
  const px = (value: number | null | undefined, unit?: string) => value == null ? null : `${value}${unit || "px"}`;
  const set = (property: string, value: string | null) => {
    if (value !== null) element.style.setProperty(property, value);
  };

  set("width", px(style.width, style.widthUnit));
  set("height", px(style.height, style.heightUnit));
  set("max-width", px(style.maxWidth, style.maxWidthUnit));
  set("min-height", px(style.minHeight, style.minHeightUnit));
  set("font-size", style.fontSize == null ? null : `${style.fontSize}px`);
  set("line-height", style.lineHeight == null ? null : String(style.lineHeight));
  set("letter-spacing", style.letterSpacing == null ? null : `${style.letterSpacing}px`);
  if (style.paddingX != null) {
    set("padding-left", `${style.paddingX}px`);
    set("padding-right", `${style.paddingX}px`);
  }
  if (style.paddingY != null) {
    set("padding-top", `${style.paddingY}px`);
    set("padding-bottom", `${style.paddingY}px`);
  }
  set("margin-top", style.marginTop == null ? null : `${style.marginTop}px`);
  set("margin-bottom", style.marginBottom == null ? null : `${style.marginBottom}px`);
  set("gap", style.gap == null ? null : `${style.gap}px`);
  set("border-radius", style.borderRadius == null ? null : `${style.borderRadius}px`);
  set("opacity", style.opacity == null ? null : String(style.opacity));
  set("text-align", style.textAlign || null);
  set("object-fit", style.objectFit || null);
  if (style.objectPositionX != null || style.objectPositionY != null) {
    set("object-position", `${style.objectPositionX ?? 50}% ${style.objectPositionY ?? 50}%`);
  }
  set("color", style.color || null);
  set("background-color", style.backgroundColor || null);
}

function leafTextTarget(element: Element) {
  if (element.children.length > 0) return false;
  return !element.querySelector("svg,img,picture,video,input,select,textarea");
}

function applyOverride(override: ThemeElementOverride) {
  const target = findTarget(override);
  if (!target) return;
  const html = target as HTMLElement;

  if (override.hidden === true) {
    html.style.setProperty("display", "none", "important");
    return;
  }

  if (override.text !== undefined && leafTextTarget(target) && ["text", "button", "link"].includes(String(override.kind))) {
    target.textContent = override.text;
  }
  if (override.imageSrc && !isHeroImageId(override.id)) replaceImage(target, override.imageSrc);
  if (override.href !== undefined && target instanceof HTMLAnchorElement) target.href = override.href;
  applyStyle(html, override.desktop, override.mobile);
}

function applyTheme(settings: ThemeCustomizerSettings) {
  const root = document.documentElement;
  const body = document.body;
  const vars: Record<string, string> = {
    "--ivory": settings.colors.ivory,
    "--cream": settings.colors.cream,
    "--ink": settings.colors.ink,
    "--gold": settings.colors.gold,
    "--gold-dark": settings.colors.goldDark,
    "--muted-foreground": settings.colors.muted,
    "--background": settings.colors.ivory,
    "--foreground": settings.colors.ink,
    "--ruth-color-canvas": settings.colors.ivory,
    "--ruth-color-surface": settings.colors.cream,
    "--ruth-color-text-primary": settings.colors.ink,
    "--ruth-color-text-muted": settings.colors.muted,
    "--ruth-color-accent": settings.colors.gold,
    "--ruth-color-accent-strong": settings.colors.goldDark,
  };
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
    body.style.setProperty(key, value);
  }
  for (const override of allOverrides(settings)) applyOverride(override);
}

function sectionText(root: HTMLElement, selector: string, fallback?: string) {
  return (root.querySelector(selector) || (fallback ? root.querySelector(fallback) : null)) as HTMLElement | null;
}

function applySection(root: HTMLElement, section: ThemeSection) {
  root.style.display = section.enabled === false ? "none" : "";
  if (section.enabled === false) return;

  if (section.backgroundColor) root.style.backgroundColor = section.backgroundColor;
  if (section.textColor) {
    root.style.color = section.textColor;
    for (const child of Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6,p,a,button,span,strong,small"))) {
      if (child instanceof HTMLElement) child.style.color = section.textColor;
    }
  }
  if (section.paddingY != null) {
    root.style.paddingTop = `${section.paddingY}px`;
    root.style.paddingBottom = `${section.paddingY}px`;
  }
  if (section.borderRadius != null) root.style.borderRadius = `${section.borderRadius}px`;

  const height = window.innerWidth < 768 ? section.mobileHeight : section.desktopHeight;
  if (height && section.type === "image-banner") root.style.height = `${height}px`;
  if (height && (section.type === "product-slider" || section.type === "featured-products")) root.style.minHeight = `${height}px`;

  if (section.imageSrc) replaceImage(root, section.imageSrc);

  const title = sectionText(root, "[data-theme-section-title]", "h1,h2,h3");
  if (title && section.title !== undefined) title.textContent = section.title || "";
  const eyebrow = sectionText(root, "[data-theme-section-eyebrow]");
  if (eyebrow && section.eyebrow !== undefined) eyebrow.textContent = section.eyebrow || "";
  const body = sectionText(root, "[data-theme-section-body]");
  if (body && section.body !== undefined) body.textContent = section.body || "";
  const link = root.querySelector("[data-theme-section-link],a") as HTMLAnchorElement | null;
  if (link && section.linkLabel !== undefined) link.textContent = section.linkLabel || "";
  if (link && section.linkHref) link.href = section.linkHref;

  if (section.type === "product-slider" || section.type === "featured-products") {
    const rail = root.querySelector(".theme-product-rail") as HTMLElement | null;
    if (rail) {
      rail.style.setProperty("--desktop-items", String(Math.max(1, Math.round(section.desktopItems || 4))));
      rail.style.setProperty("--mobile-items", String(Math.max(1, Math.round(section.mobileItems || 2))));
      rail.style.setProperty("--theme-gap", `${Math.max(0, section.gap ?? 12)}px`);
      rail.style.gap = `${Math.max(0, section.gap ?? 12)}px`;
    }
  }
}

function applySections(settings: ThemeSectionSettings, pathname: string) {
  const page = themeSectionPage(settings, pathname);
  for (const section of page.sections) {
    const root = document.querySelector(`[data-theme-section-id="${CSS.escape(section.id)}"]`) as HTMLElement | null;
    if (root) applySection(root, section);
  }
}

export function ThemeEditorLivePreviewRepair() {
  const themeRef = useRef<ThemeCustomizerSettings | null>(null);
  const sectionRef = useRef<{ settings: ThemeSectionSettings; path: string } | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("themeEditor") !== "1") return;

    let applying = false;
    let timer = 0;
    const delayed = new Set<number>();

    const applyLatest = () => {
      applying = true;
      if (themeRef.current) applyTheme(themeRef.current);
      if (sectionRef.current) applySections(sectionRef.current.settings, sectionRef.current.path);
      window.setTimeout(() => { applying = false; }, 0);
    };

    const burst = () => {
      applyLatest();
      window.requestAnimationFrame(applyLatest);
      for (const delay of [50, 160, 420]) {
        const id = window.setTimeout(applyLatest, delay);
        delayed.add(id);
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      if (event.data.type === "RUTH_THEME_EDITOR_SETTINGS" && event.data.settings) {
        themeRef.current = event.data.settings as ThemeCustomizerSettings;
        burst();
        return;
      }
      if (event.data.type === "RUTH_THEME_EDITOR_SECTION_DRAFT_LOCAL" && event.data.settings && typeof event.data.path === "string") {
        sectionRef.current = { settings: event.data.settings as ThemeSectionSettings, path: event.data.path };
        burst();
      }
    };

    const observer = new MutationObserver((mutations) => {
      if (applying || !themeRef.current && !sectionRef.current) return;
      const relevant = mutations.some((mutation) => mutation.type === "childList" || mutation.type === "attributes");
      if (!relevant) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(applyLatest, 24);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset"],
    });
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", applyLatest);

    return () => {
      observer.disconnect();
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", applyLatest);
      window.clearTimeout(timer);
      for (const id of delayed) window.clearTimeout(id);
    };
  }, []);

  return null;
}
