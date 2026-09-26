"use client";

import { useEffect } from "react";
import {
  themePageKey,
  type ThemeElementOverride,
} from "@/lib/themeCustomizer";
import {
  themeSectionPage,
  type ThemeSection,
  type ThemeSectionSettings,
} from "@ruth-commerce/commerce-core/theme-sections";

const Q = "h1,h2,h3,h4,h5,h6,p,span,label,strong,small,a,button,img,video,[role='button']";

function templatePageKey(pathname: string) {
  const key = themePageKey(pathname);
  if (/^\/products\/[^/]+$/.test(key)) return "/products/[slug]";
  if (/^\/category\/[^/]+$/.test(key)) return "/category/[slug]";
  if (/^\/collections\/[^/]+$/.test(key)) return "/collections/[slug]";
  return key;
}

function kind(element: Element): ThemeElementOverride["kind"] {
  const tag = element.tagName.toLowerCase();
  if (tag === "img" || tag === "video") return "image";
  if (tag === "button" || element.getAttribute("role") === "button") return "button";
  if (tag === "a") return "link";
  return "text";
}

function label(element: Element) {
  return String(element.getAttribute("aria-label") || element.getAttribute("alt") || element.textContent || kind(element) || "")
    .replace(/\s+/g, " ").trim().slice(0, 80) || "Öğe";
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function structuralPath(element: Element) {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && parts.length < 10) {
    const parent: Element | null = current.parentElement;
    const tag = current.tagName.toLowerCase();
    if (!parent) { parts.unshift(tag); break; }
    const peers = Array.from(parent.children).filter((child: Element) => child.tagName === current?.tagName);
    parts.unshift(`${tag}:${peers.indexOf(current) + 1}`);
    current = parent;
  }
  return parts.join("/");
}

function ensurePageSectionId(element: Element) {
  const existing = element.getAttribute("data-theme-id");
  if (existing) return existing;
  const sectionId = element.getAttribute("data-theme-section-id");
  const id = sectionId
    ? `page-section-${sectionId}`.replace(/[^a-zA-Z0-9_-]/g, "-")
    : `page-section-${hash(`${templatePageKey(window.location.pathname)}:${structuralPath(element)}`)}`;
  element.setAttribute("data-theme-id", id);
  return id;
}

function pageSectionLabel(element: Element, index: number) {
  const explicit = element.getAttribute("data-theme-label") || element.getAttribute("aria-label") || element.getAttribute("data-section-title");
  if (explicit) return explicit.replace(/\s+/g, " ").trim().slice(0, 70);
  const heading = element.querySelector("h1,h2,h3")?.textContent?.replace(/\s+/g, " ").trim();
  if (heading) return heading.slice(0, 70);
  const marker = `${element.id} ${element.className}`.toLowerCase();
  if (/review|rating|yorum|degerlend/.test(marker)) return "Değerlendirmeler";
  if (/filter|facet|sort/.test(marker)) return "Filtreler";
  if (/product|catalog|grid|listing/.test(marker)) return "Ürünler";
  if (/hero|banner/.test(marker)) return "Ana Görsel / Banner";
  if (/recommend|related|complete/.test(marker)) return "Önerilen Ürünler";
  if (/newsletter|bulletin/.test(marker)) return "Bülten";
  return `Bölüm ${index + 1}`;
}

function visibleBlock(element: Element) {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width >= 120 && rect.height >= 60;
}

function pageSectionCandidates() {
  const main = document.querySelector("main");
  if (!main) return [] as Element[];

  const configured = Array.from(main.querySelectorAll("[data-theme-section-id]"));
  if (configured.length) return configured.filter(visibleBlock);

  const direct = Array.from(main.children).filter((element: Element) => /^(SECTION|ARTICLE|DIV|NAV)$/.test(element.tagName) && visibleBlock(element));
  let candidates = direct;
  if (candidates.length <= 1 && candidates[0]) {
    const nested = Array.from(candidates[0].children).filter((element: Element) => /^(SECTION|ARTICLE|DIV|NAV)$/.test(element.tagName) && visibleBlock(element));
    if (nested.length > 1) candidates = nested;
  }

  if (candidates.length <= 1) {
    const semantic = Array.from(main.querySelectorAll("section,article")).filter(visibleBlock);
    const topLevel = semantic.filter((element) => !semantic.some((other) => other !== element && other.contains(element)));
    if (topLevel.length > candidates.length) candidates = topLevel;
  }

  return candidates.filter((element, index, all) => !all.some((other, otherIndex) => otherIndex !== index && other.contains(element)));
}

function sendPageSections() {
  if (window.parent === window) return;
  const items = pageSectionCandidates().slice(0, 40).map((element, index) => ({
    id: ensurePageSectionId(element),
    label: pageSectionLabel(element, index),
    tag: element.tagName.toLowerCase(),
    kind: "section",
  }));
  window.parent.postMessage({ type: "RUTH_THEME_EDITOR_PAGE_SECTIONS", pathname: themePageKey(window.location.pathname), items }, "*");
}

function replaceImageSource(image: HTMLImageElement, src: string) {
  image.setAttribute("src", src);
  image.setAttribute("srcset", src);
  image.src = src;
  image.srcset = src;
  const picture = image.closest("picture");
  if (!picture) return;
  for (const source of Array.from(picture.querySelectorAll("source"))) {
    source.setAttribute("srcset", src);
    source.srcset = src;
  }
}

function sectionContentTarget(root: HTMLElement, selector: string, fallback: string | null = null) {
  const marked = root.querySelector(selector) as HTMLElement | null;
  if (marked) return marked;
  return fallback ? root.querySelector(fallback) as HTMLElement | null : null;
}

function sectionLinkTarget(root: HTMLElement, section: ThemeSection) {
  const marked = root.querySelector("[data-theme-section-link]") as HTMLAnchorElement | null;
  if (marked) return marked;
  if (section.type === "product-slider" || section.type === "featured-products") return null;
  return root.querySelector("a") as HTMLAnchorElement | null;
}

function applySectionVisual(root: HTMLElement, section: ThemeSection) {
  root.style.display = section.enabled === false ? "none" : "";
  if (section.enabled === false) return;

  if (section.backgroundColor) root.style.background = section.backgroundColor;
  if (section.textColor) {
    root.style.color = section.textColor;
    for (const node of Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6,p,a,button,span,strong,small"))) {
      if (node instanceof HTMLElement) node.style.color = section.textColor;
    }
  }

  if (section.paddingY != null) {
    root.style.paddingTop = `${section.paddingY}px`;
    root.style.paddingBottom = `${section.paddingY}px`;
  }
  if (section.borderRadius != null) root.style.borderRadius = `${section.borderRadius}px`;

  if (section.type === "product-slider" || section.type === "featured-products") {
    const desktopItems = Math.max(1, Math.round(section.desktopItems || 4));
    const mobileItems = Math.max(1, Math.round(section.mobileItems || 2));
    const gap = Math.max(0, section.gap ?? 12);
    const rail = root.querySelector(".theme-product-rail") as HTMLElement | null;
    if (rail) {
      rail.style.setProperty("--desktop-items", String(desktopItems));
      rail.style.setProperty("--mobile-items", String(mobileItems));
      rail.style.setProperty("--theme-gap", `${gap}px`);
      rail.style.gap = `${gap}px`;
    }
    const height = window.innerWidth < 768 ? section.mobileHeight : section.desktopHeight;
    if (height) root.style.minHeight = `${height}px`;
    for (const button of Array.from(root.querySelectorAll("button[aria-label='Önceki ürünler'],button[aria-label='Sonraki ürünler']"))) {
      (button as HTMLElement).style.display = section.showArrows === false ? "none" : "";
    }
  }

  if (section.type === "image-banner") {
    const height = window.innerWidth < 768 ? section.mobileHeight : section.desktopHeight;
    if (height) root.style.height = `${height}px`;
    if (section.imageSrc) {
      const image = root.querySelector("img");
      if (image instanceof HTMLImageElement) replaceImageSource(image, section.imageSrc);
    }
  }

  const heading = sectionContentTarget(root, "[data-theme-section-title]", "h1,h2,h3");
  if (heading && section.title !== undefined) heading.textContent = section.title || "";

  const eyebrow = sectionContentTarget(root, "[data-theme-section-eyebrow]");
  if (eyebrow && section.eyebrow !== undefined) eyebrow.textContent = section.eyebrow || "";

  const body = sectionContentTarget(root, "[data-theme-section-body]");
  if (body && section.body !== undefined) body.textContent = section.body || "";

  if ((!eyebrow || !body) && (section.type === "rich-text" || section.type === "image-banner")) {
    const paragraphs = Array.from(root.querySelectorAll("p")) as HTMLElement[];
    if (!eyebrow && section.eyebrow !== undefined && paragraphs[0]) paragraphs[0].textContent = section.eyebrow || "";
    if (!body && section.body !== undefined) {
      const bodyTarget = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : paragraphs[0];
      if (bodyTarget) bodyTarget.textContent = section.body || "";
    }
  }

  const link = sectionLinkTarget(root, section);
  if (link && section.linkLabel !== undefined) link.textContent = section.linkLabel || "";
  if (link && section.linkHref !== undefined) {
    if (section.linkHref) link.setAttribute("href", section.linkHref);
    else link.removeAttribute("href");
  }
}

function applySectionDraft(settings: ThemeSectionSettings, pathname: string) {
  const page = themeSectionPage(settings, pathname);
  const missingIds: string[] = [];
  let appliedCount = 0;
  for (const section of page.sections) {
    const root = document.querySelector(`[data-theme-section-id="${CSS.escape(section.id)}"]`) as HTMLElement | null;
    if (root) {
      applySectionVisual(root, section);
      appliedCount += 1;
    } else {
      missingIds.push(section.id);
    }
  }
  return { appliedCount, missingIds };
}

export function ThemeEditorEnhancements() {
  useEffect(() => {
    const editorParams = new URLSearchParams(window.location.search);\n    if (editorParams.get("themeEditor") !== "1" || editorParams.get("storeDesignV2") === "1") return;

    let applying = false;
    let mutationTimer = 0;
    let latestDraft: { settings: ThemeSectionSettings; path: string; revision: number } | null = null;
    const delayed = new Set<number>();

    const applyLatestDraft = () => {
      if (!latestDraft) return;
      applying = true;
      const result = applySectionDraft(latestDraft.settings, latestDraft.path);
      if (window.parent !== window) {
        window.parent.postMessage({
          type: "RUTH_THEME_EDITOR_SECTION_DRAFT_APPLIED",
          pathname: latestDraft.path,
          revision: latestDraft.revision,
          ...result,
        }, "*");
      }
      window.setTimeout(() => { applying = false; }, 0);
    };

    const applyDraftBurst = () => {
      applyLatestDraft();
      window.requestAnimationFrame(applyLatestDraft);
      for (const delay of [80, 240]) {
        const id = window.setTimeout(() => {
          delayed.delete(id);
          applyLatestDraft();
        }, delay);
        delayed.add(id);
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      if (event.data.type === "RUTH_THEME_EDITOR_SECTION_DRAFT_LOCAL" && event.data.settings && typeof event.data.path === "string") {
        latestDraft = {
          settings: event.data.settings as ThemeSectionSettings,
          path: event.data.path,
          revision: Number(event.data.revision || 0),
        };
        applyDraftBurst();
        return;
      }
      if (event.data.type === "RUTH_THEME_EDITOR_PAGE_SECTIONS_REQUEST") {
        window.requestAnimationFrame(sendPageSections);
        window.setTimeout(sendPageSections, 100);
        return;
      }
      if (event.data.type !== "RUTH_THEME_EDITOR_SECTION_OUTLINE_REQUEST" || typeof event.data.sectionId !== "string") return;

      const sectionId = event.data.sectionId;
      const root = document.querySelector(`[data-theme-section-id="${CSS.escape(sectionId)}"]`);
      const items = root ? Array.from(root.querySelectorAll(Q)).map((element, index) => {
        let id = element.getAttribute("data-theme-id");
        if (!id) {
          id = `section-${sectionId}-${index}`.replace(/[^a-zA-Z0-9_-]/g, "-");
          element.setAttribute("data-theme-id", id);
        }
        return { id, label: label(element), tag: element.tagName.toLowerCase(), kind: kind(element) };
      }).slice(0, 80) : [];

      window.parent.postMessage({ type: "RUTH_THEME_EDITOR_SECTION_OUTLINE", sectionId, items }, "*");
    };

    const observer = new MutationObserver((mutations) => {
      if (applying || !latestDraft) return;
      if (!mutations.some((mutation) => mutation.type === "childList" || mutation.type === "attributes")) return;
      window.clearTimeout(mutationTimer);
      mutationTimer = window.setTimeout(applyLatestDraft, 24);
    });

    const onMouseDown = (event: MouseEvent) => {
      if (event.detail < 2) return;
      const raw = event.target instanceof Element ? event.target : null;
      const control = raw?.closest("button,[role='button'],summary") as HTMLElement | null;
      if (!control) return;
      control.setAttribute("data-ruth-theme-editor-ui", "true");
      window.setTimeout(() => control.removeAttribute("data-ruth-theme-editor-ui"), 60);
    };

    const onDouble = (event: MouseEvent) => {
      const raw = event.target instanceof Element ? event.target : null;
      const anchor = raw?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const target = new URL(anchor.getAttribute("href") || "", window.location.href);
      if (target.origin !== window.location.origin) {
        window.open(target.toString(), "_blank", "noopener,noreferrer");
        return;
      }
      const current = new URL(window.location.href);
      target.searchParams.set("themeEditor", "1");
      target.searchParams.set("themePreview", String(Date.now()));
      const draft = current.searchParams.get("themeSectionsPreview");
      if (draft) target.searchParams.set("themeSectionsPreview", draft);
      window.parent.postMessage({ type: "RUTH_THEME_EDITOR_NAVIGATED", pathname: target.pathname }, "*");
      window.location.assign(target.toString());
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("resize", applyLatestDraft);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("dblclick", onDouble, true);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset"],
    });
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", applyLatestDraft);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("dblclick", onDouble, true);
      observer.disconnect();
      window.clearTimeout(mutationTimer);
      for (const id of delayed) window.clearTimeout(id);
    };
  }, []);
  return null;
}
