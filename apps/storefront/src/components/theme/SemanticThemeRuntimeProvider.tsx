"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { EditorScope } from "@ruth-commerce/commerce-core/store-design-v2";

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
  if (path === "visible") return value === false ? "display:none!important;" : "display:revert;";
  if (path === "textAlign") return `text-align:${String(value)}!important;`;
  if (path === "opacity") return `opacity:${Number(value)}!important;`;
  if (path === "borderRadius") return `border-radius:${Number(value)}px!important;`;
  if (path === "backgroundColor") return `background-color:${String(value)}!important;`;
  if (path === "color") return `color:${String(value)}!important;`;
  if (path === "media.objectFit") return `object-fit:${String(value)}!important;`;
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

export function SemanticThemeRuntimeProvider({ children }: { children: ReactNode }) {
  const [patches, setPatches] = useState<Record<string, SemanticRuntimePatch>>({});

  useEffect(() => {
    const onPatch = (event: Event) => {
      const detail = (event as CustomEvent<SemanticRuntimePatch>).detail;
      if (!detail?.key || !detail.selectorValue || !detail.path) return;
      setPatches((current) => ({ ...current, [detail.key]: detail }));
    };
    window.addEventListener(SEMANTIC_RUNTIME_PATCH_EVENT, onPatch as EventListener);
    return () => window.removeEventListener(SEMANTIC_RUNTIME_PATCH_EVENT, onPatch as EventListener);
  }, []);

  const css = useMemo(
    () => Object.values(patches)
      .sort((a, b) => a.revision - b.revision)
      .map(ruleFor)
      .filter(Boolean)
      .join("\n"),
    [patches],
  );

  return (
    <>
      {children}
      {css ? <style data-store-design-v2-runtime>{css}</style> : null}
    </>
  );
}
