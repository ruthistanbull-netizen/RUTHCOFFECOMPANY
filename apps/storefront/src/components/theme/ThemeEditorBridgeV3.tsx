"use client";

import { useEffect, useRef } from "react";
import {
  mergeThemeDeviceStyle,
  resolveThemeElementOverrides,
  themePageKey,
  themeTemplatePageKey,
  type ThemeCustomizerSettings,
  type ThemeDeviceStyle,
  type ThemeElementOverride,
} from "@/lib/themeCustomizer";

type Snapshot = {
  style: string | null;
  text: string | null;
  src: string | null;
  srcset: string | null;
  href: string | null;
  sources: Array<{ node: HTMLSourceElement; srcset: string | null }>;
};

type EditorElement = {
  id: string;
  selector: string;
  label: string;
  tag: string;
  scope: "global" | "page";
  kind: ThemeElementOverride["kind"];
  text?: string;
  textEditable: boolean;
  imageSrc?: string;
  mediaType?: "image" | "video";
  href?: string;
  metrics: {
    width: number;
    height: number;
    fontSize: number;
    lineHeight: number | null;
    letterSpacing: number;
    paddingX: number;
    paddingY: number;
    marginTop: number;
    marginBottom: number;
    borderRadius: number;
    opacity: number;
    objectFit: string;
    objectPositionX: number;
    objectPositionY: number;
    textAlign: string;
    color: string;
    backgroundColor: string;
    display: string;
  };
};

const EDITABLE_QUERY = [
  "header", "footer", "main section", "main article", "main nav", "main div", "main ul", "main li",
  "main h1", "main h2", "main h3", "main h4", "main h5", "main h6",
  "main p", "main span", "main label", "main strong", "main small",
  "main img", "main video", "main a", "main button", "main [role='button']",
  "header nav", "header div", "header ul", "header li",
  "header h1", "header h2", "header h3", "header h4", "header h5", "header h6",
  "header p", "header span", "header label", "header strong", "header small",
  "header a", "header button", "header [role='button']", "header img", "header video",
  "footer nav", "footer div", "footer ul", "footer li",
  "footer h1", "footer h2", "footer h3", "footer h4", "footer h5", "footer h6",
  "footer p", "footer span", "footer label", "footer strong", "footer small",
  "footer a", "footer button", "footer [role='button']", "footer img", "footer video",
  "[data-theme-id]",
].join(",");

const PICK_QUERY = [
  "[data-theme-id]", "a", "button", "[role='button']", "img", "video",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "label", "strong", "small",
  "nav", "section", "article", "header", "footer", "div",
].join(",");

function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function isGlobalElement(element: Element) {
  return Boolean(element.closest("header,footer"));
}

function structuralPath(element: Element) {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && parts.length < 12) {
    const parent: Element | null = current.parentElement;
    const tag = current.tagName.toLowerCase();
    if (!parent) { parts.unshift(tag); break; }
    const peers = Array.from(parent.children).filter((child: Element) => child.tagName === current?.tagName);
    parts.unshift(`${tag}:${peers.indexOf(current) + 1}`);
    current = parent;
  }
  return parts.join("/");
}

function ensureThemeId(element: Element) {
  const existing = element.getAttribute("data-theme-id");
  if (existing) return existing;
  const seed = isGlobalElement(element) ? "global" : themeTemplatePageKey(window.location.pathname);
  const id = `auto-${hash(`${seed}:${structuralPath(element)}`)}`;
  element.setAttribute("data-theme-id", id);
  return id;
}

function kindFor(element: Element): ThemeElementOverride["kind"] {
  const tag = element.tagName.toLowerCase();
  if (tag === "img" || tag === "video" || tag === "picture") return "image";
  if (tag === "button" || element.getAttribute("role") === "button") return "button";
  if (tag === "a") return "link";
  if (/^h[1-6]$/.test(tag) || ["p", "span", "label", "strong", "small"].includes(tag)) return "text";
  if (["section", "article", "header", "footer", "nav"].includes(tag)) return "section";
  if (["div", "ul", "li"].includes(tag)) return "container";
  return "other";
}

function isPlainTextElement(element: Element) {
  if (kindFor(element) === "image") return false;
  if (element.children.length > 0) return false;
  if (element.querySelector("svg,img,picture,video,input,select,textarea")) return false;
  return Boolean((element.textContent || "").trim());
}

function labelFor(element: Element) {
  const explicit = element.getAttribute("data-theme-label") || element.getAttribute("aria-label") || element.getAttribute("alt") || element.getAttribute("title");
  if (explicit) return explicit.replace(/\s+/g, " ").trim().slice(0, 80);
  const text = (element.textContent || "").replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 80);
  const kind = kindFor(element);
  if (kind === "image") return "Görsel";
  if (kind === "button") return "Buton";
  if (kind === "section") return "Bölüm";
  if (kind === "container") return "Alan";
  return element.tagName.toLowerCase();
}

function pictureSources(element: Element) {
  if (element.tagName !== "IMG") return [] as HTMLSourceElement[];
  const picture = element.closest("picture");
  return picture ? Array.from(picture.querySelectorAll("source")) : [];
}

function isHeroImageId(id: string) {
  return /^home-hero-image-\d+$/.test(id);
}

function snapshot(element: Element): Snapshot {
  const media = element as HTMLImageElement | HTMLVideoElement;
  const image = element as HTMLImageElement;
  const anchor = element as HTMLAnchorElement;
  return {
    style: element.getAttribute("style"),
    text: isPlainTextElement(element) ? element.textContent : null,
    src: element.tagName === "IMG" || element.tagName === "VIDEO" ? media.getAttribute("src") : null,
    srcset: element.tagName === "IMG" ? image.getAttribute("srcset") : null,
    href: element.tagName === "A" ? anchor.getAttribute("href") : null,
    sources: pictureSources(element).map((node) => ({ node, srcset: node.getAttribute("srcset") })),
  };
}

function restore(element: Element, original: Snapshot, preserveMedia = false) {
  if (original.style === null) element.removeAttribute("style"); else element.setAttribute("style", original.style);
  if (original.text !== null && isPlainTextElement(element) && element.textContent !== original.text) element.textContent = original.text;
  if (!preserveMedia && (element.tagName === "IMG" || element.tagName === "VIDEO")) {
    if (original.src === null) element.removeAttribute("src"); else (element as HTMLImageElement | HTMLVideoElement).setAttribute("src", original.src);
  }
  if (!preserveMedia && element.tagName === "IMG") {
    if (original.srcset === null) element.removeAttribute("srcset"); else (element as HTMLImageElement).setAttribute("srcset", original.srcset);
  }
  if (!preserveMedia) {
    for (const source of original.sources) {
      if (source.srcset === null) source.node.removeAttribute("srcset"); else source.node.setAttribute("srcset", source.srcset);
    }
  }
  if (element.tagName === "A") {
    if (original.href === null) element.removeAttribute("href"); else (element as HTMLAnchorElement).setAttribute("href", original.href);
  }
}

function mergedStyle(desktop: ThemeDeviceStyle | undefined, mobile: ThemeDeviceStyle | undefined, useMobile: boolean) {
  return useMobile
    ? mergeThemeDeviceStyle(desktop, mobile)
    : mergeThemeDeviceStyle(undefined, desktop);
}

function len(value: number | null | undefined, unit: string | null | undefined) {
  return value == null ? null : `${value}${unit || "px"}`;
}

function cssNumber(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cssColorToHex(value: string, fallback: string) {
  const raw = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  const match = raw.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i);
  if (!match) return fallback;
  return `#${[match[1], match[2], match[3]].map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, "0")).join("")}`;
}

function objectPosition(value: string) {
  const parts = value.trim().split(/\s+/);
  const keyword = (part: string | undefined, axis: "x" | "y") => {
    if (!part) return 50;
    if (part.endsWith("%")) return Math.max(0, Math.min(100, cssNumber(part, 50)));
    if (axis === "x") {
      if (part === "left") return 0;
      if (part === "right") return 100;
    } else {
      if (part === "top") return 0;
      if (part === "bottom") return 100;
    }
    return 50;
  };
  return { x: keyword(parts[0], "x"), y: keyword(parts[1] || parts[0], "y") };
}

function applyDeviceStyle(element: HTMLElement, style: ThemeDeviceStyle) {
  const computedDisplay = window.getComputedStyle(element).display;
  const needsBox = style.width != null || style.height != null || style.paddingX != null || style.paddingY != null || style.marginTop != null || style.marginBottom != null;
  if (computedDisplay === "inline" && needsBox) element.style.display = "inline-block";

  const width = len(style.width, style.widthUnit); if (width) element.style.width = width;
  const height = len(style.height, style.heightUnit); if (height) element.style.height = height;
  const maxWidth = len(style.maxWidth, style.maxWidthUnit); if (maxWidth) element.style.maxWidth = maxWidth;
  const minHeight = len(style.minHeight, style.minHeightUnit); if (minHeight) element.style.minHeight = minHeight;
  if (style.fontSize != null) element.style.fontSize = `${style.fontSize}px`;
  if (style.lineHeight != null) element.style.lineHeight = String(style.lineHeight);
  if (style.letterSpacing != null) element.style.letterSpacing = `${style.letterSpacing}px`;
  if (style.paddingX != null) { element.style.paddingLeft = `${style.paddingX}px`; element.style.paddingRight = `${style.paddingX}px`; }
  if (style.paddingY != null) { element.style.paddingTop = `${style.paddingY}px`; element.style.paddingBottom = `${style.paddingY}px`; }
  if (style.marginTop != null) element.style.marginTop = `${style.marginTop}px`;
  if (style.marginBottom != null) element.style.marginBottom = `${style.marginBottom}px`;
  if (style.gap != null) element.style.gap = `${style.gap}px`;
  if (style.borderRadius != null) element.style.borderRadius = `${style.borderRadius}px`;
  if (style.opacity != null) element.style.opacity = String(style.opacity);
  if (style.textAlign) element.style.textAlign = style.textAlign;
  if (style.objectFit) element.style.objectFit = style.objectFit;
  if (style.objectPositionX != null || style.objectPositionY != null) element.style.objectPosition = `${style.objectPositionX ?? 50}% ${style.objectPositionY ?? 50}%`;
  if (style.color) element.style.color = style.color;
  if (style.backgroundColor) element.style.backgroundColor = style.backgroundColor;
}

function applyOverride(element: Element, override: ThemeElementOverride, mobile: boolean, preserveMedia = false) {
  const html = element as HTMLElement;
  if (override.hidden) { html.style.display = "none"; return; }
  if (override.text !== undefined && isPlainTextElement(element) && ["text", "button", "link"].includes(String(override.kind))) element.textContent = override.text;
  if (!preserveMedia && override.imageSrc && (element.tagName === "IMG" || element.tagName === "VIDEO")) {
    (element as HTMLImageElement | HTMLVideoElement).setAttribute("src", override.imageSrc);
    if (element.tagName === "IMG") (element as HTMLImageElement).setAttribute("srcset", override.imageSrc);
    for (const source of pictureSources(element)) source.setAttribute("srcset", override.imageSrc);
  }
  if (override.href !== undefined && element.tagName === "A") {
    if (override.href) (element as HTMLAnchorElement).setAttribute("href", override.href);
    else element.removeAttribute("href");
  }
  applyDeviceStyle(html, mergedStyle(override.desktop, override.mobile, mobile));
}

function applyGlobal(settings: ThemeCustomizerSettings) {
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
    "--ruth-color-surface-muted": settings.colors.cream,
    "--ruth-color-text-primary": settings.colors.ink,
    "--ruth-color-text-muted": settings.colors.muted,
    "--ruth-color-accent": settings.colors.gold,
    "--ruth-color-accent-soft": "color-mix(in srgb, #B9563D 28%, #F4F0E8)",
    "--ruth-color-accent-strong": settings.colors.goldDark,
    "--ruth-color-border-subtle": "color-mix(in srgb, #AAA8A1 52%, transparent)",
    "--ruth-color-border-strong": "#AAA8A1",
    "--ruth-color-focus": "#B9563D",
    "--ruth-color-overlay": "rgba(17, 17, 17, 0.46)",
    "--ruth-color-text-inverse": "#F4F0E8",
  };
  for (const [key, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(key, value);
    document.body.style.setProperty(key, value);
  }

  const whatsapp = document.querySelector(".whatsapp-floating-bubble") as HTMLAnchorElement | null;
  if (whatsapp) {
    whatsapp.style.display = settings.whatsapp.enabled ? "" : "none";
    const phone = String(settings.whatsapp.phone || "").replace(/\D/g, "");
    if (phone) whatsapp.href = `https://wa.me/${phone}?text=${encodeURIComponent("Merhaba, ROSTA Coffee destek ekibinden yardım almak istiyorum.")}`;
    const label = whatsapp.querySelector("span:last-child");
    if (label) label.textContent = settings.whatsapp.label || "WhatsApp";
  }
}

function metadata(element: Element): EditorElement {
  const id = ensureThemeId(element);
  const rect = element.getBoundingClientRect();
  const computed = window.getComputedStyle(element as HTMLElement);
  const media = element as HTMLImageElement | HTMLVideoElement;
  const anchor = element as HTMLAnchorElement;
  const textEditable = isPlainTextElement(element) && ["text", "button", "link"].includes(String(kindFor(element)));
  const position = objectPosition(computed.objectPosition || "50% 50%");
  return {
    id,
    selector: `[data-theme-id="${id}"]`,
    label: labelFor(element),
    tag: element.tagName.toLowerCase(),
    scope: isGlobalElement(element) ? "global" : "page",
    kind: kindFor(element),
    text: textEditable ? (element.textContent || "") : undefined,
    textEditable,
    imageSrc: kindFor(element) === "image" ? media.currentSrc || media.getAttribute("src") || "" : undefined,
    mediaType: kindFor(element) === "image" ? (element.tagName === "VIDEO" ? "video" : "image") : undefined,
    href: element.tagName === "A" ? anchor.getAttribute("href") || "" : undefined,
    metrics: {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      fontSize: Math.round(cssNumber(computed.fontSize)),
      lineHeight: computed.lineHeight === "normal" ? null : cssNumber(computed.lineHeight),
      letterSpacing: cssNumber(computed.letterSpacing, 0),
      paddingX: Math.round(cssNumber(computed.paddingLeft)),
      paddingY: Math.round(cssNumber(computed.paddingTop)),
      marginTop: Math.round(cssNumber(computed.marginTop)),
      marginBottom: Math.round(cssNumber(computed.marginBottom)),
      borderRadius: Math.round(cssNumber(computed.borderRadius)),
      opacity: cssNumber(computed.opacity, 1),
      objectFit: computed.objectFit || "cover",
      objectPositionX: position.x,
      objectPositionY: position.y,
      textAlign: computed.textAlign || "left",
      color: cssColorToHex(computed.color, "#111111"),
      backgroundColor: cssColorToHex(computed.backgroundColor, "#ffffff"),
      display: computed.display,
    },
  };
}

function pickTarget(raw: Element) {
  const picked = raw.closest(PICK_QUERY);
  if (!picked || picked === document.body || picked === document.documentElement) return null;
  return picked;
}

function findById(id: string) {
  return Array.from(document.querySelectorAll("[data-theme-id]")).find((element) => element.getAttribute("data-theme-id") === id) || null;
}

function registerElements(root: ParentNode = document) {
  if (root instanceof Element && root.matches(EDITABLE_QUERY)) ensureThemeId(root);
  for (const element of Array.from(root.querySelectorAll(EDITABLE_QUERY))) ensureThemeId(element);
}

function buildOutline(settings: ThemeCustomizerSettings) {
  registerElements();
  const seen = new Set<string>();
  const items: Array<{ id: string; label: string; tag: string; kind: ThemeElementOverride["kind"] }> = [];
  const elements = Array.from(document.querySelectorAll(EDITABLE_QUERY));
  const overrides = new Map(resolveThemeElementOverrides(settings, window.location.pathname).map((item) => [item.id, item]));

  const add = (element: Element, keepWhenCollapsed = false) => {
    if (!(element instanceof HTMLElement)) return;
    const rect = element.getBoundingClientRect();
    const id = ensureThemeId(element);
    if (seen.has(id)) return;
    if (!keepWhenCollapsed && (rect.width < 10 || rect.height < 8)) return;
    const override = overrides.get(id);
    seen.add(id);
    items.push({
      id,
      label: override?.label || labelFor(element),
      tag: override?.tag || element.tagName.toLowerCase(),
      kind: override?.kind || kindFor(element),
    });
  };

  // Kaydedilmiş öğeleri önce ekle. Böylece gizlenen veya metni boşaltılan
  // bir öğe boyutu 0 olsa bile listede kalır ve kullanıcı değişikliği geri alabilir.
  for (const element of elements) {
    const id = ensureThemeId(element);
    if (overrides.has(id)) add(element, true);
  }
  for (const element of elements) {
    add(element);
    if (items.length >= 500) break;
  }
  return items;
}

function combinedOverrides(settings: ThemeCustomizerSettings) {
  return resolveThemeElementOverrides(settings, window.location.pathname);
}

export function ThemeEditorBridgeV3({ settings }: { settings: ThemeCustomizerSettings }) {
  const settingsRef = useRef(settings);
  const originals = useRef(new WeakMap<Element, Snapshot>());
  const trackedIds = useRef(new Set<string>());

  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    const editorMode = new URLSearchParams(window.location.search).get("themeEditor") === "1";
    let mutating = false;
    let releaseTimer = 0;
    let outlineTimer = 0;
    let mutationTimer = 0;
    let resizeFrame = 0;
    let selectedElement: Element | null = null;
    const mediaOrigins = new Map<string, Element>();
    const overlay = document.createElement("div");
    overlay.dataset.ruthThemeEditorUi = "true";
    overlay.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #4f7cff;background:rgba(79,124,255,.06);display:none;box-sizing:border-box;border-radius:6px";

    const resizeDirections = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
    const handlePosition: Record<(typeof resizeDirections)[number], string> = {
      nw: "left:-7px;top:-7px;cursor:nwse-resize",
      n: "left:50%;top:-7px;transform:translateX(-50%);cursor:ns-resize",
      ne: "right:-7px;top:-7px;cursor:nesw-resize",
      e: "right:-7px;top:50%;transform:translateY(-50%);cursor:ew-resize",
      se: "right:-7px;bottom:-7px;cursor:nwse-resize",
      s: "left:50%;bottom:-7px;transform:translateX(-50%);cursor:ns-resize",
      sw: "left:-7px;bottom:-7px;cursor:nesw-resize",
      w: "left:-7px;top:50%;transform:translateY(-50%);cursor:ew-resize",
    };

    const handles = resizeDirections.map((direction) => {
      const handle = document.createElement("span");
      handle.dataset.ruthThemeResizeHandle = direction;
      handle.dataset.ruthThemeEditorUi = "true";
      handle.style.cssText = `position:absolute;width:12px;height:12px;border-radius:999px;background:#fff;border:2px solid #4f7cff;box-shadow:0 1px 4px rgba(15,23,42,.22);pointer-events:auto;touch-action:none;display:none;${handlePosition[direction]}`;
      overlay.appendChild(handle);
      return handle;
    });

    const rememberMediaOrigin = (element: Element) => {
      const id = ensureThemeId(element);
      if (!mediaOrigins.has(id)) mediaOrigins.set(id, element.cloneNode(true) as Element);
      return id;
    };

    const swapMediaElement = (element: Element, mediaType: "image" | "video") => {
      const desiredTag = mediaType === "video" ? "VIDEO" : "IMG";
      if (element.tagName === desiredTag) return element;
      const id = rememberMediaOrigin(element);
      const origin = mediaOrigins.get(id) || element;
      const replacement = mediaType === "video" ? document.createElement("video") : document.createElement("img");

      for (const attribute of Array.from(origin.attributes)) {
        if (["src", "srcset", "poster", "autoplay", "loop", "muted", "playsinline", "controls"].includes(attribute.name.toLowerCase())) continue;
        replacement.setAttribute(attribute.name, attribute.value);
      }
      replacement.setAttribute("data-theme-id", id);
      if (mediaType === "video") {
        const video = replacement as HTMLVideoElement;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
      } else {
        (replacement as HTMLImageElement).alt = (origin as HTMLImageElement).alt || "";
      }

      element.replaceWith(replacement);
      return replacement;
    };

    const restoreMediaOrigin = (id: string) => {
      const current = findById(id);
      const origin = mediaOrigins.get(id);
      if (!current || !origin) return current;
      const replacement = origin.cloneNode(true) as Element;
      replacement.setAttribute("data-theme-id", id);
      current.replaceWith(replacement);
      mediaOrigins.delete(id);
      return replacement;
    };

    const canResize = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return false;
      if (kindFor(element) !== "image") return false;
      const rect = element.getBoundingClientRect();
      return rect.width >= 180 && rect.height >= 100;
    };

    const positionOverlay = (element: Element, locked = false) => {
      const rect = element.getBoundingClientRect();
      overlay.style.display = "block";
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      const showHandles = locked && canResize(element);
      for (const handle of handles) handle.style.display = showHandles ? "block" : "none";
    };

    for (const handle of handles) {
      handle.addEventListener("pointerdown", (event) => {
        if (!(selectedElement instanceof HTMLElement) || !canResize(selectedElement)) return;
        event.preventDefault();
        event.stopPropagation();
        const direction = handle.dataset.ruthThemeResizeHandle || "se";
        const element = selectedElement;
        const start = element.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const pointerId = event.pointerId;
        handle.setPointerCapture?.(pointerId);

        const move = (moveEvent: PointerEvent) => {
          if (moveEvent.pointerId !== pointerId) return;
          moveEvent.preventDefault();
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          let width = start.width;
          let height = start.height;
          if (direction.includes("e")) width += dx;
          if (direction.includes("w")) width -= dx;
          if (direction.includes("s")) height += dy;
          if (direction.includes("n")) height -= dy;
          width = Math.max(48, Math.min(5000, width));
          height = Math.max(48, Math.min(5000, height));
          element.style.width = `${Math.round(width)}px`;
          element.style.height = `${Math.round(height)}px`;
          positionOverlay(element, true);

          window.cancelAnimationFrame(resizeFrame);
          resizeFrame = window.requestAnimationFrame(() => {
            if (window.parent === window) return;
            window.parent.postMessage({
              type: "RUTH_THEME_EDITOR_RESIZE",
              id: ensureThemeId(element),
              width: Math.round(width),
              height: Math.round(height),
              device: window.innerWidth < 768 ? "mobile" : "desktop",
            }, "*");
          });
        };

        const end = (endEvent: PointerEvent) => {
          if (endEvent.pointerId !== pointerId) return;
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", end);
          handle.removeEventListener("pointercancel", end);
          try { handle.releasePointerCapture?.(pointerId); } catch {}
        };

        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", end);
      });
    }

    if (editorMode) document.body.appendChild(overlay);

    const applySettings = (next: ThemeCustomizerSettings, scanDocument = true) => {
      window.clearTimeout(releaseTimer);
      mutating = true;
      settingsRef.current = next;
      applyGlobal(next);
      if (scanDocument) registerElements();
      const overrides = combinedOverrides(next);
      const nextIds = new Set(overrides.map((item) => item.id));
      for (const id of new Set([...trackedIds.current, ...nextIds])) {
        let element = findById(id);
        if (!nextIds.has(id) && mediaOrigins.has(id)) element = restoreMediaOrigin(id);
        const original = element ? originals.current.get(element) : null;
        if (element && original) restore(element, original, isHeroImageId(id));
      }
      const mobile = window.innerWidth < 768;
      const missingIds: string[] = [];
      let appliedCount = 0;
      for (const override of overrides) {
        let element = findById(override.id);
        if (!element) {
          missingIds.push(override.id);
          continue;
        }
        if (override.kind === "image" && override.mediaType) {
          element = swapMediaElement(element, override.mediaType);
        }
        if (!originals.current.has(element)) originals.current.set(element, snapshot(element));
        applyOverride(element, override, mobile, isHeroImageId(override.id));
        if (selectedElement && ensureThemeId(selectedElement) === override.id) {
          selectedElement = element;
          positionOverlay(element, true);
        }
        appliedCount += 1;
      }
      trackedIds.current = nextIds;
      releaseTimer = window.setTimeout(() => { mutating = false; }, 0);
      return { appliedCount, missingIds };
    };

    const sendOutline = () => {
      if (!editorMode || window.parent === window) return;
      window.clearTimeout(outlineTimer);
      outlineTimer = window.setTimeout(() => {
        window.parent.postMessage({ type: "RUTH_THEME_EDITOR_OUTLINE", pathname: themePageKey(window.location.pathname), items: buildOutline(settingsRef.current) }, "*");
      }, 80);
    };

    const select = (element: Element) => {
      if (!editorMode || window.parent === window) return;
      selectedElement = element;
      window.parent.postMessage({ type: "RUTH_THEME_EDITOR_SELECT", pathname: themePageKey(window.location.pathname), element: metadata(element) }, "*");
      positionOverlay(element, true);
    };

    const notifyPath = (pathname = window.location.pathname) => {
      if (editorMode && window.parent !== window) window.parent.postMessage({ type: "RUTH_THEME_EDITOR_NAVIGATED", pathname: themePageKey(pathname) }, "*");
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      if (event.data.type === "RUTH_THEME_EDITOR_SETTINGS" && event.data.settings) {
        const result = applySettings(event.data.settings as ThemeCustomizerSettings);
        if (editorMode && window.parent !== window) {
          window.parent.postMessage({
            type: "RUTH_THEME_EDITOR_SETTINGS_APPLIED",
            pathname: themePageKey(window.location.pathname),
            revision: Number(event.data.revision || 0),
            ...result,
          }, "*");
        }
      }
      if (event.data.type === "RUTH_THEME_EDITOR_SELECT_REQUEST" && typeof event.data.id === "string") {
        registerElements();
        const element = findById(event.data.id);
        if (element) {
          select(element);
          if (event.data.scroll !== false) element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
      if (event.data.type === "RUTH_THEME_EDITOR_MEDIA_OVERRIDE" && typeof event.data.id === "string" && event.data.imageSrc) {
        registerElements();
        let element = findById(event.data.id);
        if (element) {
          const mediaType = event.data.mediaType === "video" ? "video" : "image";
          element = swapMediaElement(element, mediaType);
          const media = element as HTMLImageElement | HTMLVideoElement;
          media.setAttribute("src", String(event.data.imageSrc));
          if (element.tagName === "IMG") (element as HTMLImageElement).setAttribute("srcset", String(event.data.imageSrc));
          selectedElement = element;
          select(element);
        }
      }
      if (event.data.type === "RUTH_THEME_EDITOR_REFRESH_OUTLINE") sendOutline();
    };

    const navigateAnchor = (anchor: HTMLAnchorElement, event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) {
        window.open(url.href, "_blank", "noopener,noreferrer");
        return;
      }
      const current = new URL(window.location.href);
      url.searchParams.set("themeEditor", "1");
      url.searchParams.set("themePreview", String(Date.now()));
      const draft = current.searchParams.get("themeSectionsPreview");
      if (draft) url.searchParams.set("themeSectionsPreview", draft);
      notifyPath(url.pathname);
      window.location.assign(url.toString());
    };

    const onClick = (event: MouseEvent) => {
      if (!editorMode) return;
      const raw = event.target instanceof Element ? event.target : null;
      if (!raw || raw.closest("[data-ruth-theme-editor-ui]")) return;

      if (event.detail >= 2) {
        const anchor = raw.closest("a[href]") as HTMLAnchorElement | null;
        if (anchor) { navigateAnchor(anchor, event); return; }
        if (raw.closest("button,[role='button'],summary")) return;
      }

      const target = pickTarget(raw);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      select(target);
    };

    const onMove = (event: MouseEvent) => {
      if (!editorMode) return;
      if (selectedElement && document.contains(selectedElement)) {
        positionOverlay(selectedElement, true);
        return;
      }
      const raw = event.target instanceof Element ? event.target : null;
      if (!raw) return;
      const target = pickTarget(raw);
      if (!target) return;
      positionOverlay(target, false);
    };

    const onResize = () => applySettings(settingsRef.current);
    const onPopState = () => { notifyPath(); sendOutline(); };
    const observer = new MutationObserver((mutations) => {
      if (mutating) return;

      let relevant = false;
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          if (mutation.addedNodes.length || mutation.removedNodes.length) relevant = true;
          for (const node of Array.from(mutation.addedNodes)) {
            if (node instanceof Element) registerElements(node);
          }
          continue;
        }
        if (mutation.type === "attributes") relevant = true;
      }

      if (!relevant) return;
      window.clearTimeout(mutationTimer);
      mutationTimer = window.setTimeout(() => {
        applySettings(settingsRef.current, false);
        sendOutline();
      }, 90);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset"],
    });
    applySettings(settingsRef.current);
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", onResize);
    window.addEventListener("popstate", onPopState);
    if (editorMode) {
      document.addEventListener("click", onClick, true);
      document.addEventListener("mousemove", onMove, true);
      window.parent.postMessage({ type: "RUTH_THEME_EDITOR_READY", pathname: themePageKey(window.location.pathname) }, "*");
      sendOutline();
    }

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mousemove", onMove, true);
      observer.disconnect();
      window.clearTimeout(releaseTimer);
      window.clearTimeout(outlineTimer);
      window.clearTimeout(mutationTimer);
      window.cancelAnimationFrame(resizeFrame);
      overlay.remove();
    };
  }, []);

  return null;
}
