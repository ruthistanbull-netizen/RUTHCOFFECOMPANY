"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  COMPONENT_REGISTRY_BY_TYPE,
  normalizeThemeDocument,
  type EditorScope,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";

export const SEMANTIC_RUNTIME_PATCH_EVENT = "store-design-v2:runtime-patch";

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

function cssString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function declaration(path: string, value: unknown) {
  if (path === "visible") return value === false ? "display:none!important;" : "";
  if (path === "textAlign") return `text-align:${String(value)}!important;`;
  if (path === "opacity") return `opacity:${Number(value)}!important;`;
  if (path === "borderRadius") return `border-radius:${Number(value)}px!important;`;
  if (path === "backgroundColor") return `background-color:${String(value)}!important;`;
  if (path === "color") return `color:${String(value)}!important;`;
  if (path === "media.objectFit") return `object-fit:${String(value)}!important;`;
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

function selectorFor(patch: SemanticRuntimePatch) {
  let selector = "";
  if (patch.selectorMode === "sectionType" && patch.targetType) {
    selector = `[data-editor-id=${cssString(patch.selectorValue)}] [data-editor-type=${cssString(patch.targetType)}]`;
  } else {
    const attribute = patch.selectorMode === "type" ? "data-editor-type" : "data-editor-id";
    selector = `[${attribute}=${cssString(patch.selectorValue)}]`;
  }
  if (patch.path === "media.objectFit") return `${selector},${selector} img,${selector} video`;
  return selector;
}

function ruleFor(patch: SemanticRuntimePatch) {
  const value = declaration(patch.path, patch.value);
  if (!value) return "";
  const rule = `${selectorFor(patch)}{${value}}`;
  return patch.device === "mobile" ? `@media(max-width:767px){${rule}}` : `@media(min-width:768px){${rule}}`;
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

function patchesFromDocument(document: ThemeDocument, pathname: string) {
  const output: Record<string, SemanticRuntimePatch> = {};
  const revision = Number(document.revision || 0);

  for (const container of [document.globals.header, document.globals.footer, document.globals.tokens]) {
    for (const [semanticType, responsive] of Object.entries(container)) {
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
  const [runtimePatches, setRuntimePatches] = useState<Record<string, SemanticRuntimePatch>>({});
  const [previewDocument, setPreviewDocument] = useState<ThemeDocument | null>(null);

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
        if (detail.path === "visible" && detail.value !== false) {
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

  const initialPatches = useMemo(
    () => effectiveDocument ? patchesFromDocument(effectiveDocument, pathname) : {},
    [effectiveDocument, pathname],
  );

  const css = useMemo(
    () => Object.values({ ...initialPatches, ...runtimePatches })
      .sort((a, b) => a.revision - b.revision)
      .map(ruleFor)
      .filter(Boolean)
      .join("\n"),
    [initialPatches, runtimePatches],
  );

  return (
    <>
      {children}
      {css ? <style data-store-design-v2-runtime>{css}</style> : null}
    </>
  );
}
