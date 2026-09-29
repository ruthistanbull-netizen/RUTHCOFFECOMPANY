"use client";

import { useEffect, useRef } from "react";
import { SEMANTIC_RUNTIME_PATCH_EVENT } from "@/components/theme/SemanticThemeRuntimeProvider";
import {
  STORE_DESIGN_MEDIA_RUNTIME_EVENT,
  type StoreDesignMediaRuntimeDetail,
} from "@/components/theme/StoreDesignResponsiveImage";
import {
  COMPONENT_REGISTRY,
  STORE_DESIGN_MESSAGES,
  STORE_DESIGN_SCHEMA_VERSION,
  componentDefinition,
  type ComponentDefinition,
  type EditorScope,
} from "@ruth-commerce/commerce-core/store-design-v2";

type SemanticTarget = {
  id: string;
  type: string;
  label: string;
  instanceKey?: string;
  element: HTMLElement;
  definition: ComponentDefinition;
};

type ThemePatchMessage = {
  type: typeof STORE_DESIGN_MESSAGES.PATCH;
  targetId: string;
  path: string;
  value: unknown;
  revision: number;
  scope?: EditorScope;
  device?: "desktop" | "mobile";
};

const TARGET_SELECTOR = "[data-editor-id][data-editor-type]";
const LONG_PRESS_MS = 430;
const LONG_PRESS_TOLERANCE = 18;
const PREVIEW_SCROLL_MESSAGE = "store-design-v2:preview-scroll";

function editorEnabled() {
  const params = new URLSearchParams(window.location.search);
  return params.get("themeEditor") === "1" && params.get("storeDesignV2") === "1";
}

function originMatches(origin: string, pattern: string) {
  try {
    const candidate = new URL(origin);
    const raw = pattern.trim();
    if (!raw) return false;

    if (raw === "http://localhost:*" || raw === "https://localhost:*") {
      return candidate.protocol === raw.split("//")[0] && candidate.hostname === "localhost";
    }

    const wildcard = raw.match(/^(https?:)\/\/\*\.([^/:]+)(?::(\d+))?$/);
    if (wildcard) {
      const [, protocol, domain, port] = wildcard;
      return candidate.protocol === protocol &&
        candidate.hostname.endsWith(`.${domain}`) &&
        (!port || candidate.port === port);
    }

    return candidate.origin === new URL(raw).origin;
  } catch {
    return false;
  }
}

function parentOrigin(allowedOrigins: string[]) {
  try {
    const explicit = new URLSearchParams(window.location.search).get("editorOrigin");
    if (explicit) {
      const explicitOrigin = new URL(explicit).origin;
      if (allowedOrigins.some((pattern) => originMatches(explicitOrigin, pattern))) return explicitOrigin;
      return "";
    }

    const referrer = document.referrer ? new URL(document.referrer).origin : "";
    return referrer && allowedOrigins.some((pattern) => originMatches(referrer, pattern)) ? referrer : "";
  } catch {
    return "";
  }
}

function semanticTargetFromNode(node: HTMLElement | null): SemanticTarget | null {
  if (!node) return null;
  const id = node.dataset.editorId?.trim();
  const type = node.dataset.editorType?.trim();
  if (!id || !type) return null;
  const definition = componentDefinition(type);
  if (!definition) return null;
  return {
    id,
    type,
    label: node.dataset.editorLabel?.trim() || definition.label,
    instanceKey: node.dataset.editorInstance?.trim() || undefined,
    element: node,
    definition,
  };
}

function automaticTargetType(element: HTMLElement) {
  if (element instanceof HTMLImageElement) return "image";
  if (element instanceof HTMLVideoElement) return "video";
  if (element instanceof HTMLAnchorElement) return "link";
  if (element instanceof HTMLButtonElement) return "button";
  return "text";
}

function automaticTargetLabel(element: HTMLElement, type: string) {
  const aria = element.getAttribute("aria-label")?.trim();
  if (aria) return aria;
  if (type === "image") return (element as HTMLImageElement).alt?.trim() || "Görsel";
  if (type === "video") return "Video";
  const text = (element.textContent || "").replace(/\s+/g, " ").trim();
  return text.slice(0, 72) || (type === "button" ? "Düğme" : type === "link" ? "Bağlantı" : "Metin");
}

function automaticTargetPath(root: HTMLElement, element: HTMLElement) {
  const parts: number[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== root) {
    const parent = current.parentElement;
    if (!parent) break;
    parts.push(Array.prototype.indexOf.call(parent.children, current));
    current = parent;
  }
  return parts.reverse().join(".");
}

function ensureAutomaticTarget(element: HTMLElement) {
  const current = element.closest<HTMLElement>(TARGET_SELECTOR);
  if (current === element) return semanticTargetFromNode(element);

  const root = current || document.body.closest<HTMLElement>(TARGET_SELECTOR);
  if (!root) return null;

  if (
    current &&
    current !== element &&
    (current.matches("a,button,img,video") || current.dataset.storeDesignEditableText === "true")
  ) {
    return semanticTargetFromNode(current);
  }

  const rootId = root.dataset.editorId?.trim();
  if (!rootId) return semanticTargetFromNode(current);
  const type = automaticTargetType(element);
  const definition = componentDefinition(type);
  if (!definition) return semanticTargetFromNode(current);

  const suffix = automaticTargetPath(root, element);
  const id = `${rootId}::auto::${suffix || "0"}`;
  element.dataset.editorId = id;
  element.dataset.editorType = type;
  element.dataset.editorLabel = automaticTargetLabel(element, type);
  element.dataset.editorInstance = id;
  element.dataset.storeDesignAutoTarget = "true";
  if (type === "text" || type === "link" || type === "button") {
    element.dataset.storeDesignEditableText = "true";
  }
  return semanticTargetFromNode(element);
}

function targetFrom(element: Element | null): SemanticTarget | null {
  if (!element) return null;
  const html = element instanceof HTMLElement ? element : element.parentElement;
  if (!html) return null;

  const interactive = html.closest<HTMLElement>("a[href],button");
  if (interactive) {
    const target = ensureAutomaticTarget(interactive);
    if (target) return target;
  }

  const media = html.closest<HTMLElement>("img,video");
  if (media) {
    const target = ensureAutomaticTarget(media);
    if (target) return target;
  }

  const text = html.closest<HTMLElement>("h1,h2,h3,h4,h5,h6,p,label,li,span,strong,em,small");
  if (text && !text.querySelector("img,video")) {
    const target = ensureAutomaticTarget(text);
    if (target) return target;
  }

  return semanticTargetFromNode(html.closest<HTMLElement>(TARGET_SELECTOR));
}

function targetFromEvent(event: Event) {
  for (const node of event.composedPath()) {
    if (!(node instanceof Element)) continue;
    const target = targetFrom(node);
    if (target) return target;
  }
  return null;
}

function breadcrumbs(target: SemanticTarget) {
  const chain: Array<{ id: string; type: string; label: string }> = [];
  let current: HTMLElement | null = target.element;
  const seen = new Set<string>();

  while (current) {
    const id = current.dataset.editorId?.trim();
    const type = current.dataset.editorType?.trim();
    if (id && type && !seen.has(id)) {
      const definition = componentDefinition(type);
      if (definition) {
        chain.unshift({
          id,
          type,
          label: current.dataset.editorLabel?.trim() || definition.label,
        });
        seen.add(id);
      }
    }
    current = current.parentElement?.closest<HTMLElement>(TARGET_SELECTOR) || null;
  }

  return chain;
}

function editableTextElement(target: SemanticTarget) {
  const direct = target.element.matches('[data-store-design-editable-text="true"]')
    ? target.element
    : target.element.querySelector<HTMLElement>('[data-store-design-editable-text="true"]');
  if (direct instanceof HTMLElement) return direct;

  const tag = target.element.tagName;
  const simpleTextTag = target.element instanceof HTMLAnchorElement
    || target.element instanceof HTMLButtonElement
    || /^H[1-6]$/.test(tag)
    || tag === "P"
    || tag === "SPAN";
  if (!simpleTextTag) return null;
  if (target.element.querySelector("img,video,svg")) return null;
  return target.element;
}

function linkElementForTarget(target: SemanticTarget) {
  if (target.element instanceof HTMLAnchorElement) return target.element;
  const parent = target.element.closest<HTMLAnchorElement>("a[href]");
  if (parent) return parent;
  return target.element.querySelector<HTMLAnchorElement>("a[href]");
}

function snapshot(target: SemanticTarget) {
  const computed = window.getComputedStyle(target.element);
  const rect = target.element.getBoundingClientRect();
  const textElement = editableTextElement(target);
  const linkElement = linkElementForTarget(target);
  const media = target.element instanceof HTMLImageElement || target.element instanceof HTMLVideoElement
    ? target.element
    : target.definition.controlGroups.includes("media")
      ? target.element.querySelector<HTMLImageElement | HTMLVideoElement>("img,video")
      : null;
  const mediaComputed = media ? window.getComputedStyle(media) : null;

  return {
    visible: computed.display !== "none",
    textAlign: computed.textAlign,
    opacity: Number.parseFloat(computed.opacity || "1"),
    borderRadius: Number.parseFloat(computed.borderRadius || "0"),
    backgroundColor: computed.backgroundColor,
    color: computed.color,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    content: textElement ? {
      text: (textElement.textContent || "").replace(/\s+/g, " ").trim(),
    } : null,
    link: linkElement ? {
      href: linkElement.getAttribute("href") || "",
      target: linkElement.getAttribute("target") === "_blank" ? "_blank" : "_self",
    } : null,
    media: media ? {
      kind: media instanceof HTMLVideoElement ? "video" : "image",
      src: media.getAttribute("src") || media.currentSrc || "",
      alt: media instanceof HTMLImageElement ? media.getAttribute("alt") || "" : "",
      objectFit: mediaComputed?.objectFit || "cover",
      objectPosition: mediaComputed?.objectPosition || "50% 50%",
    } : null,
    grid: target.type === "product-grid" ? {
      columns: Math.max(1, computed.gridTemplateColumns.split(/\s+/).filter(Boolean).length || 1),
      gapX: Number.parseFloat(computed.columnGap || "0") || 0,
      gapY: Number.parseFloat(computed.rowGap || "0") || 0,
      maxWidth: computed.maxWidth || "none",
    } : null,
    card: target.type === "product-card" ? {
      density: computed.getPropertyValue("--theme-card-density").trim() || "m",
      imageRatio: computed.getPropertyValue("--theme-card-image-ratio-token").trim() || "3/4",
      titleLines: Number.parseInt(computed.getPropertyValue("--theme-card-title-lines").trim() || "2", 10) || 2,
      showPrice: computed.getPropertyValue("--theme-card-price-display").trim() !== "none",
      showQuickAdd: computed.getPropertyValue("--theme-card-quick-add-display").trim() !== "none",
    } : null,
  };
}

const CONSENT_APPEARANCE_PATCHES = new Set([
  "title",
  "intro",
  "acceptLabel",
  "rejectLabel",
  "privacyLabel",
  "position",
  "widthPreset",
  "radiusPreset",
]);

function allowedPatch(definition: ComponentDefinition, path: string) {
  const root = path.split(".")[0] || "";
  if (definition.protectedFields.includes(path) || definition.protectedFields.includes(root)) return false;
  if (definition.semanticType === "consent-banner" && CONSENT_APPEARANCE_PATCHES.has(path)) return true;

  if (root === "content") return definition.controlGroups.includes("content");
  if (root === "link") return definition.controlGroups.includes("content") || definition.controlGroups.includes("media");
  if (root === "media" && message.path === "media.alt") return definition.controlGroups.includes("media");
  if (root === "visible") return definition.controlGroups.includes("layout");
  if (root === "textAlign" || root === "color") return definition.controlGroups.includes("typography");
  if (root === "opacity" || root === "borderRadius" || root === "backgroundColor") {
    return definition.controlGroups.includes("layout") || definition.controlGroups.includes("card");
  }
  if (root === "media") return definition.controlGroups.includes("media");
  if (root === "grid") return definition.semanticType === "product-grid" && definition.controlGroups.includes("layout");
  if (root === "card") return definition.semanticType === "product-card" && definition.controlGroups.includes("card");
  return false;
}

function validatePatch(target: SemanticTarget, message: ThemePatchMessage) {
  if (!allowedPatch(target.definition, message.path)) {
    return { ok: false, error: "Bu ayar seçilen öğe için kullanılamıyor." };
  }
  if (message.value === null) return { ok: true };

  switch (message.path) {
    case "content.text": {
      const value = String(message.value ?? "");
      return value.length <= 500 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)
        ? { ok: true }
        : { ok: false, error: "Metin 500 karakterden kısa olmalı." };
    }
    case "link.href": {
      const value = String(message.value || "").trim();
      if (!value) return { ok: true };
      if (value.length > 2048) return { ok: false, error: "Bağlantı çok uzun." };
      if (value.startsWith("/") || value.startsWith("#") || /^(https?:|mailto:|tel:)/i.test(value)) return { ok: true };
      return { ok: false, error: "Bağlantı / ile başlayan site adresi veya güvenli bir web adresi olmalı." };
    }
    case "link.target":
      return ["_self", "_blank"].includes(String(message.value))
        ? { ok: true }
        : { ok: false, error: "Geçersiz sekme seçimi." };
    case "visible":
      return { ok: typeof message.value === "boolean", error: typeof message.value === "boolean" ? undefined : "Geçersiz görünürlük değeri." };
    case "textAlign":
      return ["left", "center", "right", "start", "end"].includes(String(message.value))
        ? { ok: true }
        : { ok: false, error: "Geçersiz hizalama." };
    case "opacity": {
      const value = Number(message.value);
      return Number.isFinite(value) && value >= 0 && value <= 1
        ? { ok: true }
        : { ok: false, error: "Saydamlık değeri 0 ile 1 arasında olmalı." };
    }
    case "borderRadius": {
      const value = Number(message.value);
      return Number.isFinite(value) && value >= 0 && value <= 120
        ? { ok: true }
        : { ok: false, error: "Köşe değeri izin verilen aralığın dışında." };
    }
    case "media.assetId": {
      const value = String(message.value || "").trim();
      return /^[a-zA-Z0-9_-]{1,160}$/.test(value)
        ? { ok: true }
        : { ok: false, error: "Geçersiz medya seçimi." };
    }
    case "media.alt": {
      const value = String(message.value ?? "");
      return value.length <= 240
        ? { ok: true }
        : { ok: false, error: "Alternatif metin 240 karakterden kısa olmalı." };
    }
    case "media.src": {
      const value = String(message.value || "").trim();
      if (!value || value.length > 2048) return { ok: false, error: "Geçersiz medya adresi." };
      try {
        const url = new URL(value, window.location.origin);
        return ["http:", "https:"].includes(url.protocol)
          ? { ok: true }
          : { ok: false, error: "Medya adresi güvenli bir web adresi olmalı." };
      } catch {
        return { ok: false, error: "Geçersiz medya adresi." };
      }
    }
    case "media.objectFit":
      return ["cover", "contain"].includes(String(message.value))
        ? { ok: true }
        : { ok: false, error: "Geçersiz medya yerleşimi." };
    case "media.objectPosition":
      return ["50% 50%", "50% 0%", "50% 100%", "0% 50%", "100% 50%"].includes(String(message.value))
        ? { ok: true }
        : { ok: false, error: "Geçersiz görsel odak konumu." };
    case "title":
    case "acceptLabel":
    case "rejectLabel":
    case "privacyLabel": {
      if (target.definition.semanticType !== "consent-banner") return { ok: false, error: "Bu metin alanı yalnız çerez bildirimi için kullanılabilir." };
      const value = String(message.value || "").trim();
      const max = message.path === "title" ? 80 : message.path === "privacyLabel" ? 80 : 40;
      return value.length > 0 && value.length <= max && !/[{}]/.test(value)
        ? { ok: true }
        : { ok: false, error: "Çerez bildirimi metni izin verilen uzunlukta olmalı." };
    }
    case "intro": {
      if (target.definition.semanticType !== "consent-banner") return { ok: false, error: "Bu açıklama alanı yalnız çerez bildirimi için kullanılabilir." };
      const value = String(message.value || "").trim();
      return value.length > 0 && value.length <= 360 && !/[{}]/.test(value)
        ? { ok: true }
        : { ok: false, error: "Çerez bildirimi açıklaması 1-360 karakter olmalı." };
    }
    case "position":
      return target.definition.semanticType === "consent-banner" && ["bottom-center", "bottom-left", "bottom-right"].includes(String(message.value))
        ? { ok: true }
        : { ok: false, error: "Geçersiz çerez bildirimi konumu." };
    case "widthPreset":
      return target.definition.semanticType === "consent-banner" && ["compact", "standard", "wide"].includes(String(message.value))
        ? { ok: true }
        : { ok: false, error: "Geçersiz çerez bildirimi genişliği." };
    case "radiusPreset":
      return target.definition.semanticType === "consent-banner" && ["soft", "rounded", "pill"].includes(String(message.value))
        ? { ok: true }
        : { ok: false, error: "Geçersiz çerez bildirimi köşe biçimi." };
    case "backgroundColor":
    case "color": {
      const value = String(message.value || "").trim();
      return value.length > 0 && value.length <= 80 && !/[;{}]/.test(value)
        ? { ok: true }
        : { ok: false, error: "Geçersiz renk değeri." };
    }
    case "grid.columns": {
      const value = Number(message.value);
      const mobile = message.device === "mobile";
      const min = mobile ? 1 : 2;
      const max = mobile ? 2 : 6;
      return Number.isInteger(value) && value >= min && value <= max
        ? { ok: true }
        : { ok: false, error: mobile ? "Mobil ızgara 1-2 sütun olmalı." : "Masaüstü ızgara 2-6 sütun olmalı." };
    }
    case "grid.gapX":
    case "grid.gapY": {
      const value = Number(message.value);
      return Number.isFinite(value) && value >= 0 && value <= 120
        ? { ok: true }
        : { ok: false, error: "Izgara boşluğu 0-120 piksel arasında olmalı." };
    }
    case "grid.maxWidth":
      return ["none", "1200px", "1280px", "1440px", "1600px"].includes(String(message.value))
        ? { ok: true }
        : { ok: false, error: "Geçersiz en fazla genişlik seçimi." };
    case "card.density":
      return ["s", "m", "l"].includes(String(message.value))
        ? { ok: true }
        : { ok: false, error: "Geçersiz ürün kartı yoğunluğu." };
    case "card.imageRatio":
      return ["1/1", "4/5", "3/4"].includes(String(message.value))
        ? { ok: true }
        : { ok: false, error: "Geçersiz ürün kartı görsel oranı." };
    case "card.titleLines": {
      const value = Number(message.value);
      return Number.isInteger(value) && value >= 1 && value <= 3
        ? { ok: true }
        : { ok: false, error: "Ürün başlığı 1-3 satır olabilir." };
    }
    case "card.showPrice":
    case "card.showQuickAdd":
      return typeof message.value === "boolean"
        ? { ok: true }
        : { ok: false, error: "Geçersiz görünürlük değeri." };
    default:
      return { ok: false, error: "Bu ayar önizlemede henüz kullanılamıyor." };
  }
}

function runtimeSelector(target: SemanticTarget, scope: EditorScope) {
  if (scope === "family" || scope === "template") {
    return { mode: "type" as const, value: target.type };
  }
  if (scope === "section") {
    const section = target.element.closest<HTMLElement>('[data-editor-id^="section:"]');
    const id = section?.dataset.editorId?.trim();
    if (id) {
      if (id === target.id) return { mode: "id" as const, value: id };
      return { mode: "sectionType" as const, value: id, targetType: target.type };
    }
  }
  return { mode: "id" as const, value: target.id };
}

function dispatchRuntimePatch(target: SemanticTarget, message: ThemePatchMessage) {
  const requestedScope = message.scope;
  const scope = requestedScope && target.definition.allowedScopes.includes(requestedScope)
    ? requestedScope
    : target.definition.defaultScope;
  const selector = runtimeSelector(target, scope);
  const device = message.device === "mobile" ? "mobile" : "desktop";
  window.dispatchEvent(new CustomEvent(SEMANTIC_RUNTIME_PATCH_EVENT, {
    detail: {
      key: `${scope}:${selector.mode}:${selector.value}:${"targetType" in selector ? selector.targetType || "" : ""}:${device}:${message.path}`,
      selectorMode: selector.mode,
      selectorValue: selector.value,
      targetType: "targetType" in selector ? selector.targetType : undefined,
      path: message.path,
      value: message.value,
      scope,
      device,
      revision: Number(message.revision || 0),
    },
  }));
}

function routePath(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function SemanticThemeEditorBridge({ allowedOrigins = [] }: { allowedOrigins?: string[] }) {
  const selectedRef = useRef<SemanticTarget | null>(null);

  useEffect(() => {
    if (!editorEnabled() || window.parent === window) return;

    const expectedParentOrigin = parentOrigin(allowedOrigins);
    if (!expectedParentOrigin) return;

    const post = (payload: Record<string, unknown>) => {
      window.parent.postMessage(payload, expectedParentOrigin);
    };

    const previewScrollbarStyle = document.createElement("style");
    previewScrollbarStyle.dataset.storeDesignV2PreviewScrollbar = "true";
    previewScrollbarStyle.textContent = `
      @media (max-width: 520px) {
        html, body {
          scrollbar-width: none !important;
          -ms-overflow-style: none !important;
        }
        html::-webkit-scrollbar,
        body::-webkit-scrollbar {
          width: 0 !important;
          height: 0 !important;
          display: none !important;
        }
      }

      [data-store-design-v2-keyboard-target="true"]:focus-visible {
        outline: 3px solid #e07b63 !important;
        outline-offset: 3px !important;
      }
    `;
    document.head.appendChild(previewScrollbarStyle);

    let interactionMode: "browse" | "edit" = "edit";
    const originalTabIndex = new Map<HTMLElement, string | null>();
    const originalMediaSources = new WeakMap<HTMLImageElement | HTMLVideoElement, { src: string | null; srcset?: string | null }>();
    const originalTextValues = new WeakMap<HTMLElement, string>();
    const originalLinkValues = new WeakMap<HTMLAnchorElement, { href: string | null; target: string | null }>();

    const syncKeyboardTargets = () => {
      const targets = Array.from(document.querySelectorAll<HTMLElement>(TARGET_SELECTOR));
      const activeTargets = new Set(targets);

      for (const [element, original] of originalTabIndex) {
        if (!document.contains(element)) {
          originalTabIndex.delete(element);
          continue;
        }
        if (activeTargets.has(element)) continue;
        if (original === null) element.removeAttribute("tabindex");
        else element.setAttribute("tabindex", original);
        element.removeAttribute("data-store-design-v2-keyboard-target");
        originalTabIndex.delete(element);
      }

      for (const element of targets) {
        if (!originalTabIndex.has(element)) originalTabIndex.set(element, element.getAttribute("tabindex"));
        const original = originalTabIndex.get(element);

        if (interactionMode === "edit" && original === null) {
          element.setAttribute("tabindex", "0");
          element.setAttribute("data-store-design-v2-keyboard-target", "true");
        } else if (interactionMode === "browse") {
          if (original == null) element.removeAttribute("tabindex");
          else element.setAttribute("tabindex", original);
          element.removeAttribute("data-store-design-v2-keyboard-target");
        }
      }
    };

    const restoreKeyboardTargets = () => {
      for (const [element, original] of originalTabIndex) {
        if (!document.contains(element)) continue;
        if (original === null) element.removeAttribute("tabindex");
        else element.setAttribute("tabindex", original);
        element.removeAttribute("data-store-design-v2-keyboard-target");
      }
      originalTabIndex.clear();
    };

    syncKeyboardTargets();

    const overlay = document.createElement("div");
    overlay.dataset.storeDesignV2Ui = "true";
    overlay.style.cssText = [
      "position:fixed",
      "visibility:hidden",
      "opacity:0",
      "pointer-events:none",
      "z-index:2147483646",
      "box-sizing:border-box",
      "border:2px solid #e07b63",
      "border-radius:6px",
      "background:rgba(224,123,99,.07)",
      "box-shadow:0 0 0 1px rgba(255,255,255,.72),0 0 0 4px rgba(224,123,99,.14)",
      "transition:left 140ms cubic-bezier(.25,.1,.25,1),top 140ms cubic-bezier(.25,.1,.25,1),width 140ms cubic-bezier(.25,.1,.25,1),height 140ms cubic-bezier(.25,.1,.25,1),opacity 140ms cubic-bezier(.25,.1,.25,1)",
    ].join(";");
    document.body.appendChild(overlay);

    const positionOverlay = () => {
      const selected = selectedRef.current;
      if (!selected || !document.contains(selected.element)) {
        overlay.style.opacity = "0";
        overlay.style.visibility = "hidden";
        return;
      }
      const rect = selected.element.getBoundingClientRect();
      overlay.style.visibility = "visible";
      overlay.style.opacity = "1";
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    };

    let lastScrollNotice = 0;
    const onPreviewScroll = () => {
      positionOverlay();
      const now = Date.now();
      if (now - lastScrollNotice < 80) return;
      lastScrollNotice = now;
      post({
        type: PREVIEW_SCROLL_MESSAGE,
        route: window.location.pathname,
      });
    };

    const mediaElementForTarget = (target: SemanticTarget) => (
      target.element instanceof HTMLImageElement || target.element instanceof HTMLVideoElement
        ? target.element
        : target.definition.controlGroups.includes("media")
          ? target.element.querySelector<HTMLImageElement | HTMLVideoElement>("img,video")
          : null
    );

    const applyDirectMediaPatch = (target: SemanticTarget, message: ThemePatchMessage) => {
      const media = mediaElementForTarget(target);
      if (!media) return;
      if (message.path === "media.alt") {
        if (media instanceof HTMLImageElement) media.setAttribute("alt", String(message.value ?? ""));
        return;
      }
      if (message.path !== "media.src") return;

      if (!originalMediaSources.has(media)) {
        originalMediaSources.set(media, {
          src: media.getAttribute("src"),
          srcset: media instanceof HTMLImageElement ? media.getAttribute("srcset") : undefined,
        });
      }

      if (message.value === null) {
        const original = originalMediaSources.get(media);
        if (original?.src) media.setAttribute("src", original.src);
        else media.removeAttribute("src");

        if (media instanceof HTMLImageElement) {
          if (original?.srcset) media.setAttribute("srcset", original.srcset);
          else media.removeAttribute("srcset");
        }
      } else {
        media.setAttribute("src", String(message.value));
        if (media instanceof HTMLImageElement) media.removeAttribute("srcset");
      }

      if (media instanceof HTMLVideoElement) media.load();
    };

    const applyDirectContentPatch = (target: SemanticTarget, message: ThemePatchMessage) => {
      if (message.path === "content.text") {
        const element = editableTextElement(target);
        if (!element) return;
        if (!originalTextValues.has(element)) originalTextValues.set(element, element.textContent || "");
        element.textContent = message.value === null
          ? originalTextValues.get(element) || ""
          : String(message.value ?? "");
        return;
      }

      if (message.path === "link.href" || message.path === "link.target") {
        const link = linkElementForTarget(target);
        if (!link) return;
        if (!originalLinkValues.has(link)) {
          originalLinkValues.set(link, {
            href: link.getAttribute("href"),
            target: link.getAttribute("target"),
          });
        }
        const original = originalLinkValues.get(link);
        if (message.path === "link.href") {
          if (message.value === null) {
            if (original?.href === null || original?.href === undefined) link.removeAttribute("href");
            else link.setAttribute("href", original.href);
          } else if (String(message.value).trim()) {
            link.setAttribute("href", String(message.value).trim());
          } else {
            link.removeAttribute("href");
          }
        } else if (message.value === null) {
          if (original?.target === null || original?.target === undefined) link.removeAttribute("target");
          else link.setAttribute("target", original.target);
        } else if (String(message.value) === "_blank") {
          link.setAttribute("target", "_blank");
          link.setAttribute("rel", "noopener noreferrer");
        } else {
          link.removeAttribute("target");
        }
      }
    };

    const select = (target: SemanticTarget, pointer?: { x: number; y: number; kind: "mouse" | "touch" }) => {
      selectedRef.current = target;
      positionOverlay();
      post({
        type: STORE_DESIGN_MESSAGES.SELECT,
        schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
        route: window.location.pathname,
        target: {
          id: target.id,
          type: target.type,
          label: target.label,
          instanceKey: target.instanceKey,
          defaultScope: target.definition.defaultScope,
          allowedScopes: target.definition.allowedScopes,
          controlGroups: target.definition.controlGroups,
          protectedFields: target.definition.protectedFields,
          breadcrumb: breadcrumbs(target),
          current: snapshot(target),
        },
        pointer,
      });
    };

    const onContextMenu = (event: MouseEvent) => {
      // Store Design V2 owns right click across the whole preview. Never let the
      // browser context menu cover the editor, even if a future DOM node is not
      // yet registered as a specific semantic target.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const target = targetFromEvent(event) || targetFrom(document.body);
      if (!target) return;
      select(target, { x: event.clientX, y: event.clientY, kind: "mouse" });
    };

    let lastEditAction: Element | null = null;
    let lastEditActionAt = 0;

    const onClick = (event: MouseEvent) => {
      const now = Date.now();
      if (now < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (interactionMode !== "edit") return;

      const eventElement = event.target instanceof Element ? event.target : null;
      const actionable = eventElement?.closest("a[href],button,[role='button']") || null;
      const doubleAction = Boolean(actionable && actionable === lastEditAction && now - lastEditActionAt <= 360);
      lastEditAction = actionable;
      lastEditActionAt = now;

      if (doubleAction) {
        lastEditAction = null;
        lastEditActionAt = 0;
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const target = targetFromEvent(event);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      select(target);
    };

    const onDoubleClick = (event: MouseEvent) => {
      if (interactionMode !== "edit") return;
      const target = targetFromEvent(event);
      if (!target) return;
      const element = editableTextElement(target);
      if (!element) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      select(target);

      const before = (element.textContent || "").replace(/\s+/g, " ").trim();
      element.setAttribute("contenteditable", "true");
      element.setAttribute("spellcheck", "false");
      element.dataset.storeDesignInlineEdit = "true";
      element.focus({ preventScroll: true });

      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);

      let cancelled = false;
      const cleanup = () => {
        element.removeAttribute("contenteditable");
        element.removeAttribute("spellcheck");
        delete element.dataset.storeDesignInlineEdit;
        element.removeEventListener("keydown", onInlineKeyDown, true);
        element.removeEventListener("blur", onInlineBlur, true);
      };
      const commit = () => {
        const value = (element.textContent || "").replace(/\s+/g, " ").trim();
        cleanup();
        if (!cancelled && value !== before) {
          post({
            type: "store-design-v2:inline-edit",
            targetId: target.id,
            value,
          });
        }
      };
      const onInlineBlur = () => commit();
      const onInlineKeyDown = (keyEvent: KeyboardEvent) => {
        keyEvent.stopPropagation();
        if (keyEvent.key === "Escape") {
          keyEvent.preventDefault();
          cancelled = true;
          element.textContent = before;
          cleanup();
          element.blur();
          return;
        }
        if (keyEvent.key === "Enter" && !keyEvent.shiftKey) {
          keyEvent.preventDefault();
          element.blur();
        }
      };
      element.addEventListener("keydown", onInlineKeyDown, true);
      element.addEventListener("blur", onInlineBlur, true);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab" && interactionMode === "edit") syncKeyboardTargets();
      const wantsQuickMenu = event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
      if (!wantsQuickMenu) return;
      const target = targetFromEvent(event) || targetFrom(document.activeElement);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = target.element.getBoundingClientRect();
      select(target, {
        x: Math.max(8, Math.min(window.innerWidth - 8, rect.left + Math.min(rect.width / 2, 48))),
        y: Math.max(8, Math.min(window.innerHeight - 8, rect.top + Math.min(rect.height / 2, 48))),
        kind: "mouse",
      });
    };

    let longPressTimer = 0;
    let suppressClickUntil = 0;
    let pressTarget: SemanticTarget | null = null;
    let pressX = 0;
    let pressY = 0;
    let pressTouchId: number | null = null;

    const clearPress = () => {
      window.clearTimeout(longPressTimer);
      longPressTimer = 0;
      pressTarget = null;
      pressTouchId = null;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return clearPress();
      const touch = event.touches.item(0);
      const target = targetFromEvent(event);
      if (!touch || !target) return;
      clearPress();
      pressTarget = target;
      pressX = touch.clientX;
      pressY = touch.clientY;
      pressTouchId = touch.identifier;
      longPressTimer = window.setTimeout(() => {
        if (pressTarget) {
          suppressClickUntil = Date.now() + 700;
          select(pressTarget, { x: pressX, y: pressY, kind: "touch" });
        }
        clearPress();
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (pressTouchId === null || !pressTarget) return;
      let touch: Touch | null = null;
      for (let index = 0; index < event.touches.length; index += 1) {
        const candidate = event.touches.item(index);
        if (candidate?.identifier === pressTouchId) {
          touch = candidate;
          break;
        }
      }
      if (!touch || Math.hypot(touch.clientX - pressX, touch.clientY - pressY) > LONG_PRESS_TOLERANCE) clearPress();
    };

    const onTouchEnd = () => clearPress();

    const onFocusIn = (event: FocusEvent) => {
      if (interactionMode !== "edit") return;
      const target = targetFromEvent(event);
      if (!target || selectedRef.current?.id === target.id) return;
      select(target);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      if (expectedParentOrigin && event.origin !== expectedParentOrigin) return;

      if (event.data.type === "store-design-v2:select-target") {
        const requestedId = typeof event.data.targetId === "string" ? event.data.targetId.trim() : "";
        if (!requestedId) return;
        let element = document.querySelector(`[data-editor-id="${CSS.escape(requestedId)}"]`);
        if (!element && requestedId === "global.header.mega-menu") {
          element = document.querySelector('[data-editor-id="global.header.menu-trigger"]');
        }
        const target = targetFrom(element) || targetFrom(document.body);
        if (!target) return;
        target.element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        select(target);
        return;
      }

      if (event.data.type === STORE_DESIGN_MESSAGES.INTERACTION_MODE) {
        interactionMode = event.data.mode === "browse" ? "browse" : "edit";
        if (interactionMode === "browse") {
          overlay.style.opacity = "0";
          overlay.style.visibility = "hidden";
          clearPress();
        } else {
          positionOverlay();
        }
        syncKeyboardTargets();
        return;
      }

      if (event.data.type === STORE_DESIGN_MESSAGES.PATCH) {
        const message = event.data as ThemePatchMessage;
        const selected = selectedRef.current;
        const target = selected?.id === message.targetId
          ? selected
          : targetFrom(document.querySelector(`[data-editor-id="${CSS.escape(String(message.targetId || ""))}"]`));

        const result = target
          ? validatePatch(target, message)
          : { ok: false, error: "Seçilen öğe bulunamadı. Öğeyi yeniden seçip tekrar dene." };

        if (target && result.ok) {
          applyDirectMediaPatch(target, message);
          applyDirectContentPatch(target, message);
          dispatchRuntimePatch(target, message);
          selectedRef.current = target;
          positionOverlay();
          window.requestAnimationFrame(() => {
            positionOverlay();
            post({
              type: STORE_DESIGN_MESSAGES.PATCH_APPLIED,
              targetId: message.targetId,
              revision: Number(message.revision || 0),
              ...result,
              current: snapshot(target),
            });
          });
          return;
        }

        post({
          type: STORE_DESIGN_MESSAGES.PATCH_APPLIED,
          targetId: message.targetId,
          revision: Number(message.revision || 0),
          ...result,
        });
        return;
      }

      if (event.data.type === STORE_DESIGN_MESSAGES.MEDIA_ASSET_READY) {
        const asset = event.data.asset as StoreDesignMediaRuntimeDetail | undefined;
        const validUrl = (value: unknown) => typeof value === "string" && /^https?:\/\//i.test(value);
        if (!asset?.assetId || (asset.url && !validUrl(asset.url)) || (asset.mobileUrl && !validUrl(asset.mobileUrl))) {
          return;
        }
        window.dispatchEvent(new CustomEvent(STORE_DESIGN_MEDIA_RUNTIME_EVENT, { detail: asset }));
        return;
      }

      if (event.data.type === STORE_DESIGN_MESSAGES.ROUTE_NAVIGATE) {
        const next = routePath(event.data.path);
        if (!next) return;
        const url = new URL(next, window.location.origin);
        url.searchParams.set("themeEditor", "1");
        url.searchParams.set("storeDesignV2", "1");
        const currentParams = new URLSearchParams(window.location.search);
        const editorOrigin = currentParams.get("editorOrigin");
        const previewToken = currentParams.get("storeDesignV2Preview");
        if (editorOrigin) url.searchParams.set("editorOrigin", editorOrigin);
        if (previewToken) url.searchParams.set("storeDesignV2Preview", previewToken);
        window.location.assign(url.toString());
      }
    };

    const announceReady = () => {
      post({
        type: STORE_DESIGN_MESSAGES.READY,
        schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
        route: window.location.pathname,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        registeredTypes: COMPONENT_REGISTRY.map((item) => item.semanticType),
      });
    };

    const heartbeat = window.setInterval(() => {
      post({
        type: STORE_DESIGN_MESSAGES.HEARTBEAT,
        schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
        route: window.location.pathname,
        at: Date.now(),
      });
    }, 5_000);

    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDoubleClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, true);
    document.addEventListener("touchcancel", onTouchEnd, true);
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", positionOverlay);
    window.addEventListener("scroll", onPreviewScroll, true);

    announceReady();

    return () => {
      window.clearInterval(heartbeat);
      clearPress();
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("dblclick", onDoubleClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", positionOverlay);
      window.removeEventListener("scroll", onPreviewScroll, true);
      restoreKeyboardTargets();
      previewScrollbarStyle.remove();
      overlay.remove();
      selectedRef.current = null;
    };
  }, [allowedOrigins]);

  return null;
}
