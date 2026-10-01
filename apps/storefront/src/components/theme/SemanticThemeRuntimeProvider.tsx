"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  STORE_DESIGN_MEDIA_RUNTIME_EVENT,
  type StoreDesignMediaRuntimeDetail,
} from "@/components/theme/StoreDesignResponsiveImage";
import {
  COMPONENT_REGISTRY_BY_TYPE,
  normalizeThemeDocument,
  type EditorScope,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";

export const SEMANTIC_RUNTIME_PATCH_EVENT = "store-design-v2:runtime-patch";
export const STORE_DESIGN_PREVIEW_DOCUMENT_EVENT = "store-design-v2:preview-document-runtime";
export const STORE_DESIGN_CONSENT_SETTINGS_EVENT = "store-design-v2:consent-settings";
export const STORE_DESIGN_CROSS_SELL_SETTINGS_EVENT = "store-design-v2:cross-sell-settings";

export type SemanticRuntimePatch = {
  key: string;
  selectorMode: "id" | "type" | "sectionType";
  selectorValue: string;
  targetType?: string;
  path: string;
  value: unknown;
  scope: EditorScope;
  device: "desktop" | "mobile";
  revision: number;
};

const SemanticMediaContext = createContext<{ patches: SemanticRuntimePatch[]; media: ThemeDocument["media"]; mobile: boolean }>({ patches: [], media: {}, mobile: false });

export function useSemanticMedia(id: string, fallback: string) {
  const { patches, media, mobile } = useContext(SemanticMediaContext);
  let src = fallback;
  let video = /\.(mp4|webm|mov)(?:[?#]|$)/i.test(src);
  for (const device of mobile ? ["desktop", "mobile"] : ["desktop"]) {
    for (const patch of patches) {
      if (patch.device !== device || patch.selectorMode !== "id" || patch.selectorValue !== id) continue;
      if (patch.path === "media.src" && typeof patch.value === "string" && patch.value) {
        src = patch.value;
        video = Object.values(media).some((asset) => asset.url === src && asset.type === "video") || /\.(mp4|webm|mov)(?:[?#]|$)/i.test(src);
      }
      if (patch.path === "media.assetId" && media[String(patch.value)]) {
        const asset = media[String(patch.value)];
        src = asset.url;
        video = asset.type === "video";
      }
    }
  }
  return { src, video };
}

function cssString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function declaration(path: string, value: unknown) {
  if (path === "visible") return value === false ? "display:none!important;" : "";
  if (path === "order") return `order:${Math.max(-100, Math.min(100, Math.round(Number(value))))}!important;`;
  if (path === "textAlign") return `text-align:${String(value)}!important;`;
  if (path === "opacity") return `opacity:${Number(value)}!important;`;
  if (path === "borderRadius") return `border-radius:${Number(value)}px!important;`;
  if (path === "backgroundColor") return `background-color:${String(value)}!important;`;
  if (path === "color") return `color:${String(value)}!important;`;
  if (path === "media.objectFit") return `object-fit:${String(value)}!important;`;
  if (path === "media.objectPosition") return `object-position:${String(value)}!important;`;
  if (path === "grid.columns") return `--theme-product-grid-columns:${Math.max(1, Math.min(6, Math.round(Number(value))))};`;
  if (path === "grid.gapX") return `--theme-product-grid-gap-x:${Math.max(0, Math.min(120, Number(value)))}px;`;
  if (path === "grid.gapY") return `--theme-product-grid-gap-y:${Math.max(0, Math.min(120, Number(value)))}px;`;
  if (path === "grid.maxWidth") return `--theme-product-grid-max-width:${String(value)};`;
  if (path === "card.density") {
    const density = String(value);
    if (density === "s") return "--theme-card-density:s;--theme-card-info-pad-top:8px;--theme-card-title-size:.80rem;--theme-card-control-size:32px;";
    if (density === "l") return "--theme-card-density:l;--theme-card-info-pad-top:16px;--theme-card-title-size:1.02rem;--theme-card-control-size:42px;";
    return "--theme-card-density:m;--theme-card-info-pad-top:12px;--theme-card-title-size:.91rem;--theme-card-control-size:38px;";
  }
  if (path === "card.imageRatio") {
    const ratio = String(value);
    const cssRatio = ratio === "1/1" ? "1 / 1" : ratio === "4/5" ? "4 / 5" : "3 / 4";
    return `--theme-card-image-ratio-token:${ratio};--theme-card-image-ratio:${cssRatio};`;
  }
  if (path === "card.titleLines") return `--theme-card-title-lines:${Math.max(1, Math.min(3, Math.round(Number(value))))};`;
  if (path === "card.showPrice") return `--theme-card-price-display:${value === false ? "none" : "flex"};`;
  if (path === "card.showQuickAdd") return `--theme-card-quick-add-display:${value === false ? "none" : "grid"};`;
  return "";
}

const AUTOMATIC_TARGET_SELECTOR = "a[href],button,img,video,h1,h2,h3,h4,h5,h6,p,label,li,span,strong,em,small";

function automaticTargetType(element: HTMLElement) {
  if (element instanceof HTMLImageElement) return "image";
  if (element instanceof HTMLVideoElement) return "video";
  if (element instanceof HTMLAnchorElement) return "link";
  if (element instanceof HTMLButtonElement) return "button";
  return "text";
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

function markAutomaticSemanticTargets() {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(AUTOMATIC_TARGET_SELECTOR));
  for (const element of candidates) {
    if (element.dataset.editorId && element.dataset.editorType) continue;

    const existing = element.closest<HTMLElement>("[data-editor-id][data-editor-type]");
    if (
      existing &&
      existing !== element &&
      (existing.matches("a,button,img,video") || existing.dataset.storeDesignEditableText === "true")
    ) {
      continue;
    }

    const root = existing || document.body.closest<HTMLElement>("[data-editor-id][data-editor-type]");
    const rootId = root?.dataset.editorId?.trim();
    if (!root || !rootId) continue;

    const type = automaticTargetType(element);
    if (!COMPONENT_REGISTRY_BY_TYPE[type]) continue;
    const suffix = automaticTargetPath(root, element);
    const id = `${rootId}::auto::${suffix || "0"}`;
    const aria = element.getAttribute("aria-label")?.trim();
    const text = (element.textContent || "").replace(/\s+/g, " ").trim();
    const label = aria
      || (element instanceof HTMLImageElement ? element.alt?.trim() : "")
      || text.slice(0, 72)
      || (type === "image" ? "Görsel" : type === "video" ? "Video" : type === "button" ? "Düğme" : type === "link" ? "Bağlantı" : "Metin");

    element.dataset.editorId = id;
    element.dataset.editorType = type;
    element.dataset.editorLabel = label;
    element.dataset.editorInstance = id;
    element.dataset.storeDesignAutoTarget = "true";
    if (type === "text" || ((type === "link" || type === "button") && !element.querySelector("img,video,svg"))) {
      element.dataset.storeDesignEditableText = "true";
    }
  }
}

function selectorFor(patch: SemanticRuntimePatch) {
  let selector = "";
  if (patch.selectorMode === "sectionType" && patch.targetType) {
    selector = `[data-editor-id=${cssString(patch.selectorValue)}] [data-editor-type=${cssString(patch.targetType)}]`;
  } else {
    const attribute = patch.selectorMode === "type" ? "data-editor-type" : "data-editor-id";
    selector = `[${attribute}=${cssString(patch.selectorValue)}]`;
  }
  if (patch.path === "media.assetId" || patch.path === "media.src" || patch.path === "media.objectFit" || patch.path === "media.objectPosition" || patch.path === "media.alt") return `${selector},${selector} img,${selector} video`;
  return selector;
}

function ruleFor(patch: SemanticRuntimePatch) {
  const value = declaration(patch.path, patch.value);
  if (!value) return "";
  const rule = `${selectorFor(patch)}{${value}}`;
  return patch.device === "mobile" ? `@media(max-width:767px){${rule}}` : rule;
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function flattenLeaves(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [[prefix, value]] : [];
  }
  const result: Array<[string, unknown]> = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    result.push(...flattenLeaves(child, path));
  }
  return result;
}

function patchKey(
  scope: EditorScope,
  selectorMode: SemanticRuntimePatch["selectorMode"],
  selectorValue: string,
  targetType: string | undefined,
  device: SemanticRuntimePatch["device"],
  path: string,
) {
  return `${scope}:${selectorMode}:${selectorValue}:${targetType || ""}:${device}:${path}`;
}

function addResponsive(
  output: Record<string, SemanticRuntimePatch>,
  args: {
    scope: EditorScope;
    selectorMode: SemanticRuntimePatch["selectorMode"];
    selectorValue: string;
    targetType?: string;
    responsive: unknown;
    revision: number;
  },
) {
  const responsive = objectRecord(args.responsive);
  for (const device of ["desktop", "mobile"] as const) {
    for (const [path, value] of flattenLeaves(responsive[device])) {
      const key = patchKey(args.scope, args.selectorMode, args.selectorValue, args.targetType, device, path);
      output[key] = {
        key,
        selectorMode: args.selectorMode,
        selectorValue: args.selectorValue,
        targetType: args.targetType,
        path,
        value,
        scope: args.scope,
        device,
        revision: args.revision,
      };
    }
  }
}

function templateForPath(document: ThemeDocument, pathname: string) {
  const direct = document.pages[pathname] || Object.values(document.pages).find((page) => page.route === pathname);
  if (direct?.templateId && document.templates[direct.templateId]) return document.templates[direct.templateId];

  const dynamicTemplateId =
    /^\/products\/[^/]+$/.test(pathname) ? "/products/[slug]" :
    /^\/(category|categories)\/[^/]+$/.test(pathname) ? "/category/[slug]" :
    /^\/collections\/[^/]+$/.test(pathname) ? "/collections/[slug]" :
    "";

  const bindingKey = dynamicTemplateId || pathname;
  const boundTemplateId = document.templateBindings?.[bindingKey];
  if (boundTemplateId && document.templates[boundTemplateId]) return document.templates[boundTemplateId];
  if (dynamicTemplateId && document.templates[dynamicTemplateId]) return document.templates[dynamicTemplateId];
  return document.templates[`route:${pathname}`] || null;
}

function crossSellConfigForPath(document: ThemeDocument, pathname: string) {
  const template = templateForPath(document, pathname);
  if (!template) return null;
  const section = (template.sectionIds || [])
    .map((sectionId) => document.sections[sectionId])
    .find((item) => item?.type === "cross-sell");
  if (!section) return null;
  return {
    id: section.id,
    enabled: section.enabled !== false,
    settings: objectRecord(section.settings),
  };
}

function patchesFromDocument(document: ThemeDocument, pathname: string) {
  const output: Record<string, SemanticRuntimePatch> = {};
  const revision = Number(document.revision || 0);

  for (const container of [document.globals.header, document.globals.footer, document.globals.tokens]) {
    for (const [semanticType, responsive] of Object.entries(container)) {
      if (semanticType.startsWith("id:")) {
        let selectorValue = semanticType.slice(3);
        try {
          selectorValue = decodeURIComponent(selectorValue);
        } catch {}
        addResponsive(output, {
          scope: "instance",
          selectorMode: "id",
          selectorValue,
          responsive,
          revision,
        });
        continue;
      }
      if (!COMPONENT_REGISTRY_BY_TYPE[semanticType]) continue;
      addResponsive(output, {
        scope: "global",
        selectorMode: "type",
        selectorValue: semanticType,
        responsive,
        revision,
      });
    }
  }

  for (const [semanticType, family] of Object.entries(document.globals.componentFamilies)) {
    addResponsive(output, {
      scope: "family",
      selectorMode: "type",
      selectorValue: semanticType,
      responsive: family,
      revision,
    });
  }

  const template = templateForPath(document, pathname);
  for (const [semanticKey, responsive] of Object.entries(template?.componentSettings || {})) {
    const byType = Boolean(COMPONENT_REGISTRY_BY_TYPE[semanticKey]);
    addResponsive(output, {
      scope: "template",
      selectorMode: byType ? "type" : "id",
      selectorValue: semanticKey,
      responsive,
      revision,
    });
  }

  for (const section of Object.values(document.sections)) {
    const semantic = objectRecord(section.settings.semantic);
    for (const [semanticKey, responsive] of Object.entries(semantic)) {
      const byType = Boolean(COMPONENT_REGISTRY_BY_TYPE[semanticKey]);
      const sectionTarget = `section:${section.id}`;
      addResponsive(output, {
        scope: byType ? "section" : "instance",
        selectorMode: byType && semanticKey !== section.type ? "sectionType" : "id",
        selectorValue: byType && semanticKey !== section.type ? sectionTarget : (byType ? sectionTarget : semanticKey),
        targetType: byType && semanticKey !== section.type ? semanticKey : undefined,
        responsive,
        revision,
      });
    }
  }

  return output;
}

export function SemanticThemeRuntimeProvider({
  children,
  initialDocument,
}: {
  children: ReactNode;
  initialDocument?: ThemeDocument;
}) {
  const pathname = usePathname() || "/";
  const [templatePathname, setTemplatePathname] = useState(pathname);
  const [runtimePatches, setRuntimePatches] = useState<Record<string, SemanticRuntimePatch>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTemplatePathname(params.get("storeDesignCartPreview") === "1" ? "/cart" : pathname);
  }, [pathname]);
  const [previewDocument, setPreviewDocument] = useState<ThemeDocument | null>(null);
  const [runtimeMediaAssets, setRuntimeMediaAssets] = useState<Record<string, StoreDesignMediaRuntimeDetail>>({});
  const [mobileMedia, setMobileMedia] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width:767px)");
    const update = () => setMobileMedia(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const onPreviewDocument = (event: Event) => {
      const detail = (event as CustomEvent<{ document?: unknown }>).detail;
      if (!detail?.document) return;
      setPreviewDocument(normalizeThemeDocument(detail.document));
    };
    window.addEventListener(STORE_DESIGN_PREVIEW_DOCUMENT_EVENT, onPreviewDocument as EventListener);
    return () => window.removeEventListener(STORE_DESIGN_PREVIEW_DOCUMENT_EVENT, onPreviewDocument as EventListener);
  }, []);

  useEffect(() => {
    const onMediaAsset = (event: Event) => {
      const asset = (event as CustomEvent<StoreDesignMediaRuntimeDetail>).detail;
      if (!asset?.assetId) return;
      setRuntimeMediaAssets((current) => ({
        ...current,
        [asset.assetId]: asset,
      }));
    };
    window.addEventListener(STORE_DESIGN_MEDIA_RUNTIME_EVENT, onMediaAsset as EventListener);
    return () => window.removeEventListener(STORE_DESIGN_MEDIA_RUNTIME_EVENT, onMediaAsset as EventListener);
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search)
      .get("storeDesignV2Preview")
      ?.replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 120) || "";

    if (!token) {
      setPreviewDocument(null);
      return;
    }

    let active = true;
    const controller = new AbortController();

    fetch(`/api/store-design-v2-preview?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Preview draft HTTP ${response.status}`);
        return response.json() as Promise<{ document?: unknown }>;
      })
      .then((payload) => {
        if (active && payload.document) setPreviewDocument(normalizeThemeDocument(payload.document));
      })
      .catch((error) => {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("Store Design V2 preview draft alınamadı:", error);
          setPreviewDocument(null);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [pathname]);

  useEffect(() => {
    const onPatch = (event: Event) => {
      const detail = (event as CustomEvent<SemanticRuntimePatch>).detail;
      if (!detail?.key || !detail.selectorValue || !detail.path) return;
      setRuntimePatches((current) => {
        if (detail.value === null || (detail.path === "visible" && detail.value !== false)) {
          const next = { ...current };
          delete next[detail.key];
          return next;
        }
        return { ...current, [detail.key]: detail };
      });
    };
    window.addEventListener(SEMANTIC_RUNTIME_PATCH_EVENT, onPatch as EventListener);
    return () => window.removeEventListener(SEMANTIC_RUNTIME_PATCH_EVENT, onPatch as EventListener);
  }, []);

  const effectiveDocument = previewDocument || initialDocument;

  useEffect(() => {
    if (!effectiveDocument) return;
    const responsive = objectRecord(effectiveDocument.globals.tokens["consent-banner"]);
    window.dispatchEvent(new CustomEvent(STORE_DESIGN_CONSENT_SETTINGS_EVENT, {
      detail: {
        desktop: objectRecord(responsive.desktop),
        mobile: objectRecord(responsive.mobile),
      },
    }));
  }, [effectiveDocument]);

  useEffect(() => {
    if (!effectiveDocument) return;
    window.dispatchEvent(new CustomEvent(STORE_DESIGN_CROSS_SELL_SETTINGS_EVENT, {
      detail: {
        cart: crossSellConfigForPath(effectiveDocument, "/cart"),
        checkout: crossSellConfigForPath(effectiveDocument, "/checkout"),
      },
    }));
  }, [effectiveDocument]);

  const initialPatches = useMemo(
    () => effectiveDocument ? patchesFromDocument(effectiveDocument, templatePathname) : {},
    [effectiveDocument, templatePathname],
  );

  const mergedPatches = useMemo(
    () => Object.values({ ...initialPatches, ...runtimePatches })
      .sort((a, b) => a.revision - b.revision),
    [initialPatches, runtimePatches],
  );

  const css = useMemo(
    () => [...mergedPatches.filter((patch) => patch.device === "desktop"), ...mergedPatches.filter((patch) => patch.device === "mobile")]
      .map(ruleFor)
      .filter(Boolean)
      .join("\n"),
    [mergedPatches],
  );

  useEffect(() => {
    let frame = 0;
    let remaining = 5;
    const refresh = () => {
      if (frame) window.cancelAnimationFrame(frame);
      remaining = 5;
      const tick = () => {
        frame = 0;
        markAutomaticSemanticTargets();
        remaining -= 1;
        if (remaining > 0) frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    };
    markAutomaticSemanticTargets();
    refresh();
    window.addEventListener("pageshow", refresh);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", refresh);
    };
  }, [templatePathname, effectiveDocument]);

  useEffect(() => {
    const sourcePatches = mergedPatches.filter((patch) => (
      (patch.path === "media.assetId" || patch.path === "media.src") &&
      typeof patch.value === "string" &&
      patch.value
    ));
    if (!sourcePatches.length) return;

    const originals = new Map<HTMLImageElement | HTMLVideoElement, { src: string | null; srcset?: string | null }>();
    const mediaQuery = window.matchMedia("(max-width:767px)");

    const restore = () => {
      for (const [element, original] of originals) {
        if (!element.isConnected) continue;
        if (original.src === null) element.removeAttribute("src");
        else element.setAttribute("src", original.src);
        if (element instanceof HTMLImageElement) {
          if (original.srcset === null || original.srcset === undefined) element.removeAttribute("srcset");
          else element.setAttribute("srcset", original.srcset);
        } else {
          element.load();
        }
      }
      originals.clear();
    };

    const apply = () => {
      restore();
      const mobile = mediaQuery.matches;
      const desktopPatches = sourcePatches.filter((patch) => patch.device === "desktop");
      const mobilePatches = mobile ? sourcePatches.filter((patch) => patch.device === "mobile") : [];
      const active = [...desktopPatches, ...mobilePatches];
      for (const patch of active) {
        const rawValue = String(patch.value || "").trim();
        const source = patch.path === "media.assetId"
          ? runtimeMediaAssets[rawValue]?.url || effectiveDocument?.media[rawValue]?.url || ""
          : rawValue;
        if (!source) continue;
        const selector = selectorFor(patch);
        let elements: NodeListOf<Element>;
        try {
          elements = document.querySelectorAll(selector);
        } catch {
          continue;
        }
        for (const node of elements) {
          const candidates = node instanceof HTMLImageElement || node instanceof HTMLVideoElement
            ? [node]
            : Array.from(node.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img,video"));
          for (const element of candidates) {
            if (element.dataset.editorMediaOwned === "true") continue;
            if (!originals.has(element)) {
              originals.set(element, {
                src: element.getAttribute("src"),
                srcset: element instanceof HTMLImageElement ? element.getAttribute("srcset") : undefined,
              });
            }
            element.setAttribute("src", source);
            if (element instanceof HTMLImageElement) {
              element.setAttribute("srcset", source);
            } else {
              element.load();
            }
          }
        }
      }
    };

    let applyFrame = 0;
    let remainingFrames = 0;
    const applyBurst = () => {
      if (applyFrame) window.cancelAnimationFrame(applyFrame);
      remainingFrames = 6;
      const tick = () => {
        applyFrame = 0;
        apply();
        remainingFrames -= 1;
        if (remainingFrames > 0) applyFrame = window.requestAnimationFrame(tick);
      };
      applyFrame = window.requestAnimationFrame(tick);
    };

    apply();
    applyBurst();
    mediaQuery.addEventListener("change", applyBurst);
    window.addEventListener("pageshow", applyBurst);
    return () => {
      if (applyFrame) window.cancelAnimationFrame(applyFrame);
      mediaQuery.removeEventListener("change", applyBurst);
      window.removeEventListener("pageshow", applyBurst);
      restore();
    };
  }, [effectiveDocument, mergedPatches, runtimeMediaAssets]);

  useEffect(() => {
    const contentPatches = mergedPatches.filter((patch) => (
      patch.path === "content.text"
      || patch.path === "link.href"
      || patch.path === "link.target"
      || patch.path === "media.alt"
    ));
    if (!contentPatches.length) return;

    const mediaQuery = window.matchMedia("(max-width:767px)");
    const originals = new Map<Element, { text?: string; href?: string | null; target?: string | null; rel?: string | null; alt?: string | null }>();

    const restore = () => {
      for (const [element, original] of originals) {
        if (!element.isConnected) continue;
        if (original.text !== undefined) element.textContent = original.text;
        if (element instanceof HTMLImageElement && original.alt !== undefined) {
          if (original.alt === null) element.removeAttribute("alt");
          else element.setAttribute("alt", original.alt);
        }
        if (element instanceof HTMLAnchorElement) {
          if (original.href === null || original.href === undefined) element.removeAttribute("href");
          else element.setAttribute("href", original.href);
          if (original.target === null || original.target === undefined) element.removeAttribute("target");
          else element.setAttribute("target", original.target);
          if (original.rel === null || original.rel === undefined) element.removeAttribute("rel");
          else element.setAttribute("rel", original.rel);
        }
      }
      originals.clear();
    };

    const textNodeFor = (node: Element) => {
      if (node.matches('[data-store-design-editable-text="true"]') && !node.querySelector("img,video,svg")) {
        return node as HTMLElement;
      }
      const nested = node.querySelector<HTMLElement>('[data-store-design-editable-text="true"]');
      if (nested && !nested.querySelector("img,video,svg")) return nested;
      if (node instanceof HTMLAnchorElement || node instanceof HTMLButtonElement) {
        const nestedText = Array.from(node.querySelectorAll<HTMLElement>("span,strong,em,small"))
          .find((element) => !element.querySelector("img,video,svg") && Boolean((element.textContent || "").trim()));
        if (nestedText) return nestedText;
      }
      const tag = node.tagName;
      const simple = node instanceof HTMLAnchorElement
        || node instanceof HTMLButtonElement
        || /^H[1-6]$/.test(tag)
        || tag === "P"
        || tag === "SPAN";
      if (!simple || node.querySelector("img,video,svg")) return null;
      return node as HTMLElement;
    };

    const linkNodeFor = (node: Element) => (
      node instanceof HTMLAnchorElement
        ? node
        : node.closest<HTMLAnchorElement>("a[href]") || node.querySelector<HTMLAnchorElement>("a[href]")
    );

    const apply = () => {
      restore();
      const mobile = mediaQuery.matches;
      const desktopPatches = contentPatches.filter((patch) => patch.device === "desktop");
      const mobilePatches = mobile ? contentPatches.filter((patch) => patch.device === "mobile") : [];
      for (const patch of [...desktopPatches, ...mobilePatches]) {
        let nodes: NodeListOf<Element>;
        try {
          nodes = document.querySelectorAll(selectorFor(patch));
        } catch {
          continue;
        }

        for (const node of nodes) {
          if (patch.path === "media.alt") {
            const image = node instanceof HTMLImageElement ? node : node.querySelector<HTMLImageElement>("img");
            if (!image) continue;
            if (!originals.has(image)) originals.set(image, { alt: image.getAttribute("alt") });
            image.setAttribute("alt", String(patch.value ?? ""));
            continue;
          }

          if (patch.path === "content.text") {
            const element = textNodeFor(node);
            if (!element) continue;
            if (!originals.has(element)) originals.set(element, { text: element.textContent || "" });
            element.textContent = String(patch.value ?? "");
            continue;
          }

          const link = linkNodeFor(node);
          if (!link) continue;
          if (!originals.has(link)) {
            originals.set(link, {
              href: link.getAttribute("href"),
              target: link.getAttribute("target"),
              rel: link.getAttribute("rel"),
            });
          }
          if (patch.path === "link.href") {
            const href = String(patch.value || "").trim();
            if (href) link.setAttribute("href", href);
            else link.removeAttribute("href");
          } else if (String(patch.value) === "_blank") {
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener noreferrer");
          } else {
            link.removeAttribute("target");
          }
        }
      }
    };

    let frame = 0;
    const refresh = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(apply);
    };
    apply();
    refresh();
    mediaQuery.addEventListener("change", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      mediaQuery.removeEventListener("change", refresh);
      window.removeEventListener("pageshow", refresh);
      restore();
    };
  }, [mergedPatches]);

  useEffect(() => {
    const onSectionAnchorClick = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const link = element?.closest<HTMLAnchorElement>('a[href^="#sd-section:"]');
      if (!link) return;
      const raw = link.getAttribute("href")?.slice("#sd-section:".length) || "";
      let sectionId = raw;
      try {
        sectionId = decodeURIComponent(raw);
      } catch {}
      if (!sectionId) return;
      const section = document.querySelector<HTMLElement>(`[data-theme-section-id="${CSS.escape(sectionId)}"]`);
      if (!section) return;
      event.preventDefault();
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#section-${encodeURIComponent(sectionId)}`);
    };
    document.addEventListener("click", onSectionAnchorClick, true);
    return () => document.removeEventListener("click", onSectionAnchorClick, true);
  }, []);

  return (
    <SemanticMediaContext.Provider value={{ patches: mergedPatches, media: effectiveDocument?.media || {}, mobile: mobileMedia }}>
      {children}
      {css ? <style data-store-design-v2-runtime>{css}</style> : null}
    </SemanticMediaContext.Provider>
  );
}
