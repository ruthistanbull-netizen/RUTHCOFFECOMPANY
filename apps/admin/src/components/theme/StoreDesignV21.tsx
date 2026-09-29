"use client";

import {
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  STORE_DESIGN_MESSAGES,
  STORE_DESIGN_SCHEMA_VERSION,
  analyzeThemeDocumentReferences,
  createEmptyThemeDocument,
  normalizeThemeDocument,
  type EditorScope,
  type ThemeReferenceIssue,
  type PageCompatibility,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";
import { normalizeThemeSectionSettings } from "@ruth-commerce/commerce-core/theme-sections";
import { adminRequest } from "@/lib/adminApi";
import { useExactToast } from "@/components/base44-exact/primitives";
import { StoreDesignPageManager } from "@/components/theme/StoreDesignPageManager";
import { StoreDesignSectionManager } from "@/components/theme/StoreDesignSectionManager";
import { StoreDesignMediaLibrary } from "@/components/theme/StoreDesignMediaLibrary";
import { StoreDesignTemplateManager } from "@/components/theme/StoreDesignTemplateManager";
import { StoreDesignRedirectManager } from "@/components/theme/StoreDesignRedirectManager";
import { StoreDesignSnapshotManager } from "@/components/theme/StoreDesignSnapshotManager";
import { StoreDesignPublishReport } from "@/components/theme/StoreDesignPublishReport";
import { StoreDesignDestinationPicker } from "@/components/theme/StoreDesignDestinationPicker";
import { StoreDesignToolbarV22 } from "@/components/theme/StoreDesignToolbarV22";
import { StoreDesignContextMenuV22 } from "@/components/theme/StoreDesignContextMenuV22";
import { StoreDesignStructurePanelV22 } from "@/components/theme/StoreDesignStructurePanelV22";
import { StoreDesignInspectorBodyV22 } from "@/components/theme/StoreDesignInspectorBodyV22";
import { StoreDesignMobileDockV22 } from "@/components/theme/StoreDesignMobileDockV22";

type Device = "desktop" | "mobile";
type PageItem = {
  path: string;
  label: string;
  group: string;
  previewPath?: string;
  template?: boolean;
};

type SelectedTarget = {
  id: string;
  type: string;
  label: string;
  instanceKey?: string;
  defaultScope: EditorScope;
  allowedScopes: EditorScope[];
  controlGroups: string[];
  protectedFields: string[];
  breadcrumb: Array<{ id: string; type: string; label: string }>;
  current: {
    visible?: boolean;
    textAlign?: string;
    opacity?: number;
    borderRadius?: number;
    backgroundColor?: string;
    color?: string;
    width?: number;
    height?: number;
    content?: { text?: string } | null;
    link?: { href?: string; target?: "_self" | "_blank" } | null;
    media?: { kind?: "image" | "video"; src?: string; objectFit?: string; objectPosition?: string } | null;
    grid?: { columns?: number; gapX?: number; gapY?: number; maxWidth?: string } | null;
    card?: {
      density?: "s" | "m" | "l";
      imageRatio?: "1/1" | "4/5" | "3/4";
      titleLines?: number;
      showPrice?: boolean;
      showQuickAdd?: boolean;
    } | null;
  };
};

type ContextMenuState = {
  x: number;
  y: number;
  target: SelectedTarget;
};

type QuickMediaEditState = {
  target: SelectedTarget;
  scope: EditorScope;
  device: Device;
  page: PageItem;
  mediaType: "image" | "video";
  beforeOverride: unknown;
  visibleSource: string;
};

type StoreDesignResponse = {
  draft?: unknown;
  published?: unknown;
  draftUpdatedAt?: string | null;
  publishedUpdatedAt?: string | null;
};

type SemanticHistoryEntry = {
  kind: "semantic";
  target: SelectedTarget;
  scope: EditorScope;
  device: Device;
  path: string;
  before: unknown;
  after: unknown;
};

type SemanticBatchHistoryEntry = {
  kind: "semantic-batch";
  label: string;
  patches: SemanticHistoryEntry[];
};

type StructureHistoryEntry = {
  kind: "structure";
  label: string;
  before: ThemeDocument;
  after: ThemeDocument;
  pagePath: string;
  reload: boolean;
};

type EditorHistoryEntry = SemanticHistoryEntry | SemanticBatchHistoryEntry | StructureHistoryEntry;

const RAW_STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://rostacoffecompany.zeabur.app";
const STOREFRONT_ORIGIN = (() => {
  try { return new URL(RAW_STOREFRONT_URL).origin; }
  catch { return "https://rostacoffecompany.zeabur.app"; }
})();
const PREVIEW_SCROLL_MESSAGE = "store-design-v2:preview-scroll";

function previewUrl(path: string, previewToken: string) {
  const url = new URL(path || "/", STOREFRONT_ORIGIN);
  url.searchParams.set("themeEditor", "1");
  url.searchParams.set("storeDesignV2", "1");
  if (previewToken) url.searchParams.set("storeDesignV2Preview", previewToken);
  if (typeof window !== "undefined") url.searchParams.set("editorOrigin", window.location.origin);
  return url.toString();
}

function cleanPreviewPath(page: PageItem) {
  const candidate = page.previewPath || (page.template ? "/" : page.path) || "/";
  try {
    const url = new URL(candidate, STOREFRONT_ORIGIN);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function editorUid(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
  return `${prefix}-${random}`.slice(0, 160);
}

function scopeLabel(scope: EditorScope) {
  if (scope === "instance") return "Bu öğe";
  if (scope === "section") return "Bu bölüm";
  if (scope === "family") return "Benzer öğeler";
  if (scope === "template") return "Bu sayfa türü";
  return "Tüm site";
}

function controlGroupLabel(group: string) {
  const labels: Record<string, string> = {
    content: "İçerik",
    data: "Veri kaynağı",
    typography: "Yazı",
    media: "Görsel ve medya",
    layout: "Düzen",
    style: "Görünüm",
    responsive: "Mobil ayarları",
    animation: "Hareket",
    card: "Kart görünümü",
    grid: "Izgara düzeni",
    visibility: "Görünürlük",
    spacing: "Boşluk",
    form: "Form",
    seo: "Arama görünümü",
    accessibility: "Erişilebilirlik",
    advanced: "Gelişmiş",
  };
  return labels[group] || "Diğer";
}

function groupPages(pages: PageItem[]) {
  const groups = new Map<string, PageItem[]>();
  for (const page of pages) groups.set(page.group || "Sayfalar", [...(groups.get(page.group || "Sayfalar") || []), page]);
  return [...groups.entries()];
}

function pageCompatibility(page: PageItem): PageCompatibility {
  if (page.path === "/") return "home";
  if (page.path.startsWith("/products/") || page.path === "/products/[slug]") return "product";
  if (page.path.startsWith("/category/") || page.path.startsWith("/categories/") || page.path === "/category/[slug]") return "category";
  if (page.path.startsWith("/collections/") || page.path === "/collections/[slug]") return "collection";
  if (page.path.startsWith("/search")) return "search";
  if (page.path.startsWith("/account")) return "account";
  if (page.path.startsWith("/cart")) return "cart";
  if (page.path.startsWith("/checkout")) return "checkout";
  if (/\/(privacy|kvkk|terms|commercial-communication-consent)/.test(page.path)) return "legal";
  return page.template ? "utility" : "content";
}

function setNested(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) return;
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const existing = cursor[part];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
}

function deleteNested(target: Record<string, unknown>, path: string) {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) return;
  const stack: Array<{ parent: Record<string, unknown>; key: string }> = [];
  let cursor: Record<string, unknown> = target;

  for (const part of parts.slice(0, -1)) {
    const value = cursor[part];
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    stack.push({ parent: cursor, key: part });
    cursor = value as Record<string, unknown>;
  }

  delete cursor[parts[parts.length - 1]!];

  for (const { parent, key } of stack.reverse()) {
    const value = parent[key];
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0) {
      delete parent[key];
    }
  }
}

function writeNested(target: Record<string, unknown>, path: string, value: unknown) {
  if (value === null) deleteNested(target, path);
  else setNested(target, path, value);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function globalInstanceSemanticKey(targetId: string) {
  return `id:${encodeURIComponent(targetId).replace(/\./g, "%2E")}`;
}

function flattenResponsiveLeaves(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return prefix ? [[prefix, value]] : [];
  const output: Array<[string, unknown]> = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    output.push(...flattenResponsiveLeaves(child, path));
  }
  return output;
}

function sectionRegistration(target: SelectedTarget) {
  const entry = [...target.breadcrumb].reverse().find((item) => item.id.startsWith("section:"));
  return entry ? { id: entry.id.slice("section:".length), type: entry.type } : null;
}

function responsiveSettingsFor(
  document: ThemeDocument,
  target: SelectedTarget,
  scope: EditorScope,
  page: PageItem,
) {
  const globalContainer = target.type.startsWith("header")
    || target.type.includes("menu")
    || target.type.includes("nav")
    || target.id.startsWith("global.header")
      ? document.globals.header
      : target.type.startsWith("footer") || target.type === "social-links" || target.id.startsWith("global.footer")
        ? document.globals.footer
        : document.globals.tokens;

  if (scope === "global") {
    return recordValue(globalContainer[target.type]);
  }

  if (scope === "instance" && target.id.startsWith("global.")) {
    return recordValue(globalContainer[globalInstanceSemanticKey(target.id)]);
  }

  if (scope === "family") return recordValue(document.globals.componentFamilies[target.type]);

  const section = sectionRegistration(target);
  if ((scope === "section" || scope === "instance") && section) {
    const instance = document.sections[section.id];
    const semantic = recordValue(instance?.settings?.semantic);
    const semanticKey = scope === "section" ? target.type : target.id;
    return recordValue(semantic[semanticKey]);
  }

  const existingPage = document.pages[page.path];
  const templateId = existingPage?.templateId || (page.template ? (document.templateBindings[page.path] || page.path) : `route:${page.path}`);
  const template = document.templates[templateId];
  const semanticKey = scope === "instance" ? target.id : target.type;
  return recordValue(template?.componentSettings?.[semanticKey]);
}

function snapshotValue(target: SelectedTarget, path: string) {
  if (path === "content.text") return target.current.content?.text || "";
  if (path === "link.href") return target.current.link?.href || "";
  if (path === "link.target") return target.current.link?.target || "_self";
  if (path === "media.src") return target.current.media?.src || "";
  if (path === "media.objectFit") return target.current.media?.objectFit || "cover";
  if (path === "media.objectPosition") return target.current.media?.objectPosition || "50% 50%";
  if (path === "grid.columns") return target.current.grid?.columns ?? 2;
  if (path === "grid.gapX") return target.current.grid?.gapX ?? 16;
  if (path === "grid.gapY") return target.current.grid?.gapY ?? 32;
  if (path === "grid.maxWidth") return target.current.grid?.maxWidth || "none";
  if (path === "card.density") return target.current.card?.density || "m";
  if (path === "card.imageRatio") return target.current.card?.imageRatio || "3/4";
  if (path === "card.titleLines") return target.current.card?.titleLines ?? 2;
  if (path === "card.showPrice") return target.current.card?.showPrice !== false;
  if (path === "card.showQuickAdd") return target.current.card?.showQuickAdd !== false;
  if (path === "textAlign") return target.current.textAlign || "left";
  if (path === "borderRadius") return target.current.borderRadius || 0;
  if (path === "opacity") return target.current.opacity ?? 1;
  if (path === "visible") return target.current.visible !== false;
  return undefined;
}

function updateTargetSnapshot(target: SelectedTarget, path: string, value: unknown): SelectedTarget {
  if (value === null) return target;
  if (path === "content.text") {
    return { ...target, current: { ...target.current, content: { ...(target.current.content || {}), text: String(value ?? "") } } };
  }
  if (path === "link.href" || path === "link.target") {
    const key = path === "link.href" ? "href" : "target";
    return {
      ...target,
      current: {
        ...target.current,
        link: {
          ...(target.current.link || {}),
          [key]: key === "target" ? (String(value) === "_blank" ? "_blank" : "_self") : String(value || ""),
        },
      },
    };
  }
  if (path === "media.src" || path === "media.objectFit" || path === "media.objectPosition") {
    const key = path === "media.src" ? "src" : path === "media.objectFit" ? "objectFit" : "objectPosition";
    return { ...target, current: { ...target.current, media: { ...(target.current.media || {}), [key]: String(value) } } };
  }
  if (path.startsWith("grid.")) {
    const key = path.slice("grid.".length) as "columns" | "gapX" | "gapY" | "maxWidth";
    return {
      ...target,
      current: {
        ...target.current,
        grid: {
          ...(target.current.grid || {}),
          [key]: key === "maxWidth" ? String(value) : Number(value),
        },
      },
    };
  }
  if (path.startsWith("card.")) {
    const key = path.slice("card.".length) as "density" | "imageRatio" | "titleLines" | "showPrice" | "showQuickAdd";
    const nextValue = key === "titleLines"
      ? Number(value)
      : key === "showPrice" || key === "showQuickAdd"
        ? Boolean(value)
        : value;
    return {
      ...target,
      current: {
        ...target.current,
        card: { ...(target.current.card || {}), [key]: nextValue },
      },
    };
  }
  return { ...target, current: { ...target.current, [path]: value } };
}

function documentFingerprint(value: ThemeDocument) {
  const { revision: _revision, publishedAt: _publishedAt, ...rest } = value;
  return JSON.stringify(rest);
}

function seedLegacyHomepage(value: ThemeDocument, input: unknown) {
  const alreadyHasHome = Boolean(value.pages["/"] || Object.values(value.pages).find((page) => page.route === "/"));
  if (alreadyHasHome) return value;

  const legacy = normalizeThemeSectionSettings(input);
  const legacyHome = legacy.pages["/"];
  if (!legacyHome?.sections?.length) return value;

  const next = structuredClone(value) as ThemeDocument;
  const templateId = "template:home";
  const sectionIds: string[] = [];

  for (const legacySection of legacyHome.sections) {
    const preferredId = legacySection.id || `legacy-${legacySection.type}-${sectionIds.length + 1}`;
    const sectionId = next.sections[preferredId] ? `legacy-${preferredId}` : preferredId;
    const { id: _id, type, enabled, ...settings } = legacySection;
    next.sections[sectionId] = {
      id: sectionId,
      type,
      schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      enabled: enabled !== false,
      settings: settings as Record<string, unknown>,
      blockIds: [],
    };
    sectionIds.push(sectionId);
  }

  next.templates[templateId] = {
    id: templateId,
    label: "Ana Sayfa Şablonu",
    compatibility: ["home"],
    sectionIds,
    componentSettings: {},
    schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
  };
  next.pages["/"] = {
    id: "page:home",
    name: "Ana Sayfa",
    slug: "ana-sayfa",
    route: "/",
    kind: "system",
    type: "system",
    templateId,
    status: "published",
    seoId: "seo:home",
    reserved: true,
    schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
  };
  next.seo["seo:home"] ||= {
    title: "",
    description: "",
    robots: "index,follow",
    robotsPreset: "index,follow",
    structuredDataPolicy: "inherit",
  };
  return next;
}

function persistSemanticPatch(
  current: ThemeDocument,
  target: SelectedTarget,
  scope: EditorScope,
  device: Device,
  page: PageItem,
  path: string,
  value: unknown,
  revision: number,
) {
  const next = structuredClone(current) as ThemeDocument;
  next.revision = revision;

  const globalContainer = target.type.startsWith("header")
    || target.type.includes("menu")
    || target.type.includes("nav")
    || target.id.startsWith("global.header")
      ? next.globals.header
      : target.type.startsWith("footer") || target.type === "social-links" || target.id.startsWith("global.footer")
        ? next.globals.footer
        : next.globals.tokens;

  if (scope === "global") {
    writeNested(globalContainer, `${target.type}.${device}.${path}`, value);
    return next;
  }

  if (scope === "instance" && target.id.startsWith("global.")) {
    writeNested(globalContainer, `${globalInstanceSemanticKey(target.id)}.${device}.${path}`, value);
    return next;
  }

  if (scope === "family") {
    const family = next.globals.componentFamilies[target.type] || { type: target.type, desktop: {}, mobile: {} };
    writeNested(family[device], path, value);
    next.globals.componentFamilies[target.type] = family;
    return next;
  }

  const section = sectionRegistration(target);
  if ((scope === "section" || scope === "instance") && section) {
    const instance = next.sections[section.id] || {
      id: section.id,
      type: section.type,
      schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      enabled: true,
      settings: {},
      blockIds: [],
    };
    const semanticKey = scope === "section" ? target.type : target.id;
    writeNested(instance.settings, `semantic.${semanticKey}.${device}.${path}`, value);
    next.sections[section.id] = instance;
    return next;
  }

  const existingPage = next.pages[page.path];
  const templateId = existingPage?.templateId || (page.template ? (next.templateBindings[page.path] || page.path) : `route:${page.path}`);
  const template = next.templates[templateId] || {
    id: templateId,
    label: page.template ? page.label : `${page.label} şablonu`,
    compatibility: [pageCompatibility(page)],
    sectionIds: [],
    componentSettings: {},
    schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
  };
  const componentSettings = { ...(template.componentSettings || {}) };
  const semanticKey = scope === "instance" ? target.id : target.type;
  const responsive = componentSettings[semanticKey] || { desktop: {}, mobile: {} };
  writeNested(responsive[device], path, value);
  componentSettings[semanticKey] = responsive;
  next.templates[templateId] = { ...template, componentSettings };
  return next;
}

export function StoreDesignV21() {
  const toast = useExactToast();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const mobileStructureButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileEditButtonRef = useRef<HTMLButtonElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const structurePanelRef = useRef<HTMLElement | null>(null);
  const inspectorPanelRef = useRef<HTMLElement | null>(null);
  const inspectorBodyRef = useRef<HTMLDivElement | null>(null);
  const initialSrcRef = useRef("");
  const previewTokenRef = useRef("");
  const previewSyncTimerRef = useRef<number | null>(null);
  const lastPreviewJsonRef = useRef("");
  const [pages, setPages] = useState<PageItem[]>([]);
  const [activePath, setActivePath] = useState("/");
  const [document, setDocument] = useState<ThemeDocument>(createEmptyThemeDocument());
  const [savedDraft, setSavedDraft] = useState<ThemeDocument>(createEmptyThemeDocument());
  const [published, setPublished] = useState<ThemeDocument>(createEmptyThemeDocument());
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState<Device>("desktop");
  const [interactionMode, setInteractionMode] = useState<"browse" | "edit">("edit");
  const [selected, setSelected] = useState<SelectedTarget | null>(null);
  const [scope, setScope] = useState<EditorScope>("global");
  const [connected, setConnected] = useState(false);
  const [connectionStalled, setConnectionStalled] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState(0);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<"draft" | "publish" | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [sectionPickerSignal, setSectionPickerSignal] = useState(0);
  const [presetPickerSignal, setPresetPickerSignal] = useState(0);
  const [structureFocusSectionId, setStructureFocusSectionId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [destinationTarget, setDestinationTarget] = useState<SelectedTarget | null>(null);
  const [inlineEditRequest, setInlineEditRequest] = useState<{ targetId: string; value: string } | null>(null);
  const [mobileSheetLevel, setMobileSheetLevel] = useState<"peek" | "medium" | "full">("peek");
  const [pageManagerMode, setPageManagerMode] = useState<"create" | "edit" | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [quickMediaEdit, setQuickMediaEdit] = useState<QuickMediaEditState | null>(null);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [redirectManagerOpen, setRedirectManagerOpen] = useState(false);
  const [snapshotManagerOpen, setSnapshotManagerOpen] = useState(false);
  const [publishIssues, setPublishIssues] = useState<ThemeReferenceIssue[] | null>(null);
  const [history, setHistory] = useState<EditorHistoryEntry[]>([]);
  const [future, setFuture] = useState<EditorHistoryEntry[]>([]);
  const revisionRef = useRef(0);
  const mobileSheetTouchStartRef = useRef<number | null>(null);
  const layoutBandRef = useRef<"mobile" | "tablet" | "compact" | "wide" | null>(null);

  useEffect(() => {
    const applyViewport = () => {
      const width = window.innerWidth;
      const band: "mobile" | "tablet" | "compact" | "wide" = width <= 767
        ? "mobile"
        : width <= 1199
          ? "tablet"
          : width <= 1599
            ? "compact"
            : "wide";

      setIsMobileViewport(band === "mobile");
      if (layoutBandRef.current === band) return;
      layoutBandRef.current = band;

      if (band === "mobile") {
        setDevice("mobile");
        setInteractionMode("browse");
        setLeftOpen(false);
        setRightOpen(false);
        setMobileSheetLevel("peek");
        return;
      }

      setDevice("desktop");
      setInteractionMode("edit");
      setLeftOpen(band !== "tablet");
      setRightOpen(false);
    };

    applyViewport();
    window.addEventListener("resize", applyViewport);
    return () => window.removeEventListener("resize", applyViewport);
  }, []);

  useEffect(() => {
    if (!isMobileViewport) return;
    const shell = editorShellRef.current;
    if (!shell) return;

    const viewport = window.visualViewport;
    const syncVisualViewport = () => {
      const height = Math.max(320, Math.round(viewport?.height || window.innerHeight));
      shell.style.setProperty("--sd-visual-height", `${height}px`);
      shell.style.setProperty("--sd-visual-55", `${Math.round(height * 0.55)}px`);
    };

    syncVisualViewport();
    viewport?.addEventListener("resize", syncVisualViewport);
    viewport?.addEventListener("scroll", syncVisualViewport);
    window.addEventListener("orientationchange", syncVisualViewport);
    return () => {
      viewport?.removeEventListener("resize", syncVisualViewport);
      viewport?.removeEventListener("scroll", syncVisualViewport);
      window.removeEventListener("orientationchange", syncVisualViewport);
      shell.style.removeProperty("--sd-visual-height");
      shell.style.removeProperty("--sd-visual-55");
    };
  }, [isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport) return;
    const focusFrame = window.requestAnimationFrame(() => {
      if (rightOpen && selected) inspectorPanelRef.current?.focus({ preventScroll: true });
      else if (leftOpen) structurePanelRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [isMobileViewport, leftOpen, rightOpen, selected]);

  useEffect(() => {
    if (!isMobileViewport || (!leftOpen && !rightOpen)) return;
    const onMobileEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (rightOpen) {
        setRightOpen(false);
        setMobileSheetLevel("peek");
        window.requestAnimationFrame(() => mobileEditButtonRef.current?.focus({ preventScroll: true }));
        return;
      }
      if (leftOpen) {
        setLeftOpen(false);
        window.requestAnimationFrame(() => mobileStructureButtonRef.current?.focus({ preventScroll: true }));
      }
    };
    window.addEventListener("keydown", onMobileEscape);
    return () => window.removeEventListener("keydown", onMobileEscape);
  }, [isMobileViewport, leftOpen, rightOpen]);

  useEffect(() => {
    if (!contextMenu) return;

    const focusFrame = window.requestAnimationFrame(() => {
      const menu = contextMenuRef.current;
      if (!menu) return;

      const bounds = menu.getBoundingClientRect();
      const nextX = Math.max(12, Math.min(contextMenu.x, window.innerWidth - bounds.width - 12));
      const nextY = Math.max(68, Math.min(contextMenu.y, window.innerHeight - bounds.height - 12));
      if (Math.abs(nextX - contextMenu.x) > 0.5 || Math.abs(nextY - contextMenu.y) > 0.5) {
        setContextMenu((current) => current ? { ...current, x: nextX, y: nextY } : current);
      }
      menu.focus({ preventScroll: true });
    });

    const close = (event: PointerEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest("[data-store-design-context-menu]")) return;
      setContextMenu(null);
    };
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setContextMenu(null);
        window.requestAnimationFrame(() => iframeRef.current?.focus({ preventScroll: true }));
        return;
      }
      if (event.key !== "Tab" || !contextMenuRef.current) return;

      const focusable = Array.from(contextMenuRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]),select:not([disabled]),input:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);

      if (!focusable.length) {
        event.preventDefault();
        contextMenuRef.current.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = window.document.activeElement;
      if (event.shiftKey && (active === first || active === contextMenuRef.current)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    const closeOnResize = () => setContextMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeWithKeyboard);
    window.addEventListener("resize", closeOnResize, { once: true });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeWithKeyboard);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [contextMenu]);

  const documentFingerprintValue = useMemo(() => documentFingerprint(document), [document]);
  const savedDraftFingerprintValue = useMemo(() => documentFingerprint(savedDraft), [savedDraft]);
  const publishedFingerprintValue = useMemo(() => documentFingerprint(published), [published]);
  const hasUnsavedChanges = documentFingerprintValue !== savedDraftFingerprintValue;
  const hasUnpublishedChanges = savedDraftFingerprintValue !== publishedFingerprintValue;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeExit);
    return () => window.removeEventListener("beforeunload", warnBeforeExit);
  }, [hasUnsavedChanges]);

  const toggleStructurePanel = () => {
    setLeftOpen((current) => {
      const next = !current;
      if (next && window.innerWidth <= 1199) setRightOpen(false);
      return next;
    });
  };

  const requestEditorExit = useCallback(() => {
    if (hasUnsavedChanges) {
      const leave = window.confirm("Kaydedilmemiş değişiklikler var. Çıkarsan bu değişiklikler kaybolacak. Yine de çıkmak istiyor musun?");
      if (!leave) return;
    }
    window.history.back();
  }, [hasUnsavedChanges]);

  const editorPages = useMemo(() => {
    const merged = new Map(pages.map((page) => [page.path, page]));
    for (const page of Object.values(document.pages)) {
      if (page.status === "archived") continue;
      merged.set(page.route, {
        path: page.route,
        label: page.name,
        group: page.kind === "merchant" ? "Özel Sayfalar" : "Yönetilen Sayfalar",
        previewPath: page.route,
      });
    }
    return [...merged.values()];
  }, [document.pages, pages]);
  const groupedPages = useMemo(() => groupPages(editorPages), [editorPages]);
  const activePage = editorPages.find((item) => item.path === activePath) || editorPages[0] || null;
  const managedPage = document.pages[activePath] || Object.values(document.pages).find((page) => page.route === activePath) || null;
  const selectedSectionId = selected ? sectionRegistration(selected)?.id || null : null;
  const contextSectionRegistration = contextMenu ? sectionRegistration(contextMenu.target) : null;
  const contextSection = contextSectionRegistration ? document.sections[contextSectionRegistration.id] || null : null;
  const contextTargetsWholeSection = Boolean(
    contextSectionRegistration && contextMenu?.target.id === `section:${contextSectionRegistration.id}`,
  );
  const activeStructureTemplateId = activePage
    ? (managedPage?.templateId || (activePage.template ? (document.templateBindings[activePage.path] || activePage.path) : `route:${activePage.path}`))
    : null;
  const activeStructureTemplate = activeStructureTemplateId ? document.templates[activeStructureTemplateId] || null : null;
  const contextSectionTemplate = contextSectionRegistration
    ? (
        activeStructureTemplate?.sectionIds.includes(contextSectionRegistration.id)
          ? activeStructureTemplate
          : Object.values(document.templates).find((template) => template.sectionIds.includes(contextSectionRegistration.id)) || null
      )
    : null;
  const contextSectionIndex = contextSectionRegistration && contextSectionTemplate
    ? contextSectionTemplate.sectionIds.indexOf(contextSectionRegistration.id)
    : -1;
  const contextSectionReferenceCount = contextSectionRegistration
    ? Object.values(document.templates).filter((template) => template.sectionIds.includes(contextSectionRegistration.id)).length
    : 0;
  const activeCompatibility: PageCompatibility = (
    managedPage ? document.templates[managedPage.templateId]?.compatibility?.[0] : undefined
  ) || (activePage ? pageCompatibility(activePage) : "content");
  const consentResponsive = selected?.type === "consent-banner"
    ? recordValue(document.globals.tokens["consent-banner"])
    : {};
  const consentDesktopSettings = recordValue(consentResponsive.desktop);
  const consentMobileSettings = recordValue(consentResponsive.mobile);
  const consentDeviceSettings = device === "mobile" ? consentMobileSettings : consentDesktopSettings;
  const selectedResponsiveSettings = selected && activePage
    ? responsiveSettingsFor(document, selected, scope, activePage)
    : {};
  const selectedMobileLeaves = new Map(flattenResponsiveLeaves(recordValue(selectedResponsiveSettings.mobile)));
  const hasMobileOverrides = selectedMobileLeaves.size > 0;
  const consentSetting = (key: string, fallback: string) => {
    const direct = consentDeviceSettings[key];
    if (typeof direct === "string" && direct.trim()) return direct;
    const inherited = consentDesktopSettings[key];
    return typeof inherited === "string" && inherited.trim() ? inherited : fallback;
  };

  const postToPreview = useCallback((payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(payload, STOREFRONT_ORIGIN);
  }, []);

  const postMediaDocumentDiff = useCallback((before: ThemeDocument, after: ThemeDocument) => {
    const ids = new Set([...Object.keys(before.media), ...Object.keys(after.media)]);
    for (const assetId of ids) {
      const previous = before.media[assetId];
      const asset = after.media[assetId];
      if (JSON.stringify(previous) === JSON.stringify(asset) || !asset) continue;

      const mobile = asset.mobileAssetId ? after.media[asset.mobileAssetId] : undefined;
      postToPreview({
        type: STORE_DESIGN_MESSAGES.MEDIA_ASSET_READY,
        asset: {
          assetId: asset.assetId,
          url: asset.url,
          version: asset.version,
          focalPoint: asset.focalPoint,
          mobileAssetId: mobile?.assetId,
          mobileUrl: mobile?.url,
          mobileFocalPoint: mobile?.focalPoint,
        },
      });
    }
  }, [postToPreview]);

  const syncPreviewDocument = useCallback(async (value: ThemeDocument, force = false) => {
    const token = previewTokenRef.current;
    if (!token) return;
    const serialized = JSON.stringify(value);
    if (!force && lastPreviewJsonRef.current === serialized) return;

    await adminRequest("/api/store-design-v2", {
      method: "POST",
      body: JSON.stringify({ token, document: value }),
      confirmation: false,
    });
    lastPreviewJsonRef.current = serialized;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    if (!previewTokenRef.current) {
      const random = window.crypto?.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
      previewTokenRef.current = `sdv2_${Date.now().toString(36)}_${random}`.slice(0, 120);
    }
    const previewToken = previewTokenRef.current;

    Promise.all([
      adminRequest<StoreDesignResponse>(`/api/store-design-v2?t=${Date.now()}`, { force: true }),
      adminRequest<{ pages?: PageItem[] }>(`/api/theme-editor-pages?t=${Date.now()}`, { force: true, timeoutMs: 7_000 }),
      adminRequest<{ settings?: unknown }>(`/api/theme-sections?t=${Date.now()}`, { force: true, timeoutMs: 7_000 }).catch(() => ({ settings: undefined })),
    ]).then(async ([themeResult, pageResult, legacySections]) => {
      if (!active) return;
      const nextDraft = seedLegacyHomepage(normalizeThemeDocument(themeResult.draft || themeResult.published), legacySections.settings);
      const nextPublished = seedLegacyHomepage(normalizeThemeDocument(themeResult.published || themeResult.draft), legacySections.settings);
      const nextPages = Array.isArray(pageResult.pages) && pageResult.pages.length
        ? pageResult.pages
        : [{ path: "/", label: "Ana Sayfa", group: "Sayfalar" }];

      setDocument(nextDraft);
      setSavedDraft(nextDraft);
      setPublished(nextPublished);
      revisionRef.current = nextDraft.revision;
      setPages(nextPages);
      setActivePath(nextPages[0]?.path || "/");

      try {
        await syncPreviewDocument(nextDraft, true);
      } catch (error) {
        console.warn("Store Design V2 ilk preview taslağı senkronlanamadı:", error);
      }
      if (!active) return;

      initialSrcRef.current = previewUrl(
        cleanPreviewPath(nextPages[0] || { path: "/", label: "Ana Sayfa", group: "Sayfalar" }),
        previewToken,
      );
      setLoading(false);
    }).catch((error) => {
      if (!active) return;
      setLoading(false);
      toast.error(error instanceof Error ? error.message : "Mağaza tasarımı yüklenemedi.");
    });

    return () => { active = false; };
  }, [syncPreviewDocument, toast]);

  useEffect(() => {
    if (loading || !previewTokenRef.current) return;
    if (previewSyncTimerRef.current !== null) window.clearTimeout(previewSyncTimerRef.current);

    previewSyncTimerRef.current = window.setTimeout(() => {
      void syncPreviewDocument(document).catch((error) => {
        console.warn("Store Design V2 preview taslağı senkronlanamadı:", error);
      });
    }, 250);

    return () => {
      if (previewSyncTimerRef.current !== null) window.clearTimeout(previewSyncTimerRef.current);
    };
  }, [document, loading, syncPreviewDocument]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.origin !== STOREFRONT_ORIGIN || event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === STORE_DESIGN_MESSAGES.READY) {
        setConnected(true);
        setConnectionStalled(false);
        setLastHeartbeat(Date.now());
        return;
      }

      if (data.type === STORE_DESIGN_MESSAGES.HEARTBEAT) {
        setConnected(true);
        setConnectionStalled(false);
        setLastHeartbeat(Date.now());
        return;
      }

      if (data.type === PREVIEW_SCROLL_MESSAGE) {
        setContextMenu(null);
        return;
      }

      if (data.type === STORE_DESIGN_MESSAGES.SELECT && data.target) {
        const target = data.target as SelectedTarget;
        setSelected(target);
        setStructureFocusSectionId(null);
        setScope(target.defaultScope);
        if (isMobileViewport) setLeftOpen(false);

        const pointer = data.pointer && typeof data.pointer === "object"
          ? data.pointer as { x?: unknown; y?: unknown; kind?: unknown }
          : null;
        if (
          pointer?.kind === "mouse" &&
          typeof pointer.x === "number" &&
          typeof pointer.y === "number" &&
          iframeRef.current
        ) {
          const frame = iframeRef.current.getBoundingClientRect();
          const menuWidth = 336;
          const menuHeight = Math.min(620, Math.max(360, window.innerHeight - 88));
          const x = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, frame.left + pointer.x));
          const y = Math.max(68, Math.min(window.innerHeight - menuHeight - 12, frame.top + pointer.y));
          setContextMenu({ x, y, target });
          setRightOpen(false);
        } else {
          setContextMenu(null);
          if (isMobileViewport) setMobileSheetLevel("peek");
          setRightOpen(true);
        }
        return;
      }

      if (
        data.type === "store-design-v2:inline-edit"
        && typeof data.targetId === "string"
        && typeof data.value === "string"
      ) {
        setInlineEditRequest({ targetId: data.targetId, value: data.value });
        return;
      }

      if (data.type === STORE_DESIGN_MESSAGES.PATCH_APPLIED) {
        if (data.ok === false) {
          toast.error(String(data.error || "Değişiklik önizlemeye uygulanamadı."));
          return;
        }
        if (typeof data.targetId === "string" && data.current && typeof data.current === "object") {
          const targetId = data.targetId;
          const nextCurrent = data.current as SelectedTarget["current"];
          setSelected((current) => {
            if (!current || current.id !== targetId) return current;
            return { ...current, current: nextCurrent };
          });
        }
        return;
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [isMobileViewport, toast]);

  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;
    postToPreview({
      type: STORE_DESIGN_MESSAGES.INTERACTION_MODE,
      mode: interactionMode,
    });
  }, [interactionMode, postToPreview, connected]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!lastHeartbeat) return;
      const staleFor = Date.now() - lastHeartbeat;
      if (staleFor > 12_000) {
        setConnected(false);
        setConnectionStalled(true);
      }
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [lastHeartbeat]);

  const reconnectPreview = async () => {
    if (!activePage || !iframeRef.current) return;
    setConnected(false);
    setConnectionStalled(false);
    setLastHeartbeat(Date.now());

    try {
      await syncPreviewDocument(document, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Önizleme yeniden bağlanamadı.");
      setConnectionStalled(true);
      return;
    }

    iframeRef.current.src = previewUrl(cleanPreviewPath(activePage), previewTokenRef.current);
  };

  const changePage = async (path: string) => {
    const page = editorPages.find((item) => item.path === path);
    if (!page) return;

    try {
      await syncPreviewDocument(document, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Taslak önizleme senkronlanamadı.");
      return;
    }

    setActivePath(path);
    setLastHeartbeat(Date.now());
    setSelected(null);
    setStructureFocusSectionId(null);
    setContextMenu(null);
    setHistory([]);
    setFuture([]);
    postToPreview({
      type: STORE_DESIGN_MESSAGES.ROUTE_NAVIGATE,
      path: cleanPreviewPath(page),
    });
  };

  const pagePathForIssue = (issue: ThemeReferenceIssue) => {
    const rawIds = [issue.source, issue.ownerId, issue.target, issue.targetId]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));

    const routeForTemplate = (templateId: string) => {
      const page = Object.values(document.pages).find((item) => item.templateId === templateId);
      if (page) return page.route;
      const binding = Object.entries(document.templateBindings).find(([, id]) => id === templateId);
      return binding?.[0] || null;
    };

    const routeForSection = (sectionId: string) => {
      const template = Object.values(document.templates).find((item) => item.sectionIds.includes(sectionId));
      return template ? routeForTemplate(template.id) : null;
    };

    for (const rawId of rawIds) {
      const id = rawId.replace(/^(section|block|preset|template|seo):/, "");
      if (rawId.startsWith("/")) {
        const page = editorPages.find((item) => item.path === rawId);
        if (page) return page.path;
      }

      const directPage = Object.values(document.pages).find((item) => (
        item.id === rawId || item.id === id || item.route === rawId || item.templateId === rawId || item.seoId === rawId
      ));
      if (directPage) return directPage.route;

      if (document.templates[rawId]) {
        const route = routeForTemplate(rawId);
        if (route) return route;
      }
      if (document.templates[id]) {
        const route = routeForTemplate(id);
        if (route) return route;
      }

      if (document.sections[rawId]) {
        const route = routeForSection(rawId);
        if (route) return route;
      }
      if (document.sections[id]) {
        const route = routeForSection(id);
        if (route) return route;
      }

      const blockId = document.blocks[rawId] ? rawId : document.blocks[id] ? id : null;
      if (blockId) {
        const ownerSection = Object.values(document.sections).find((section) => section.blockIds?.includes(blockId));
        if (ownerSection) {
          const route = routeForSection(ownerSection.id);
          if (route) return route;
        }
      }
    }

    return activePath;
  };

  const sectionIdForIssue = (issue: ThemeReferenceIssue) => {
    const rawIds = [issue.source, issue.ownerId, issue.target, issue.targetId]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));

    for (const rawId of rawIds) {
      const id = rawId.replace(/^(section|block):/, "");
      if (document.sections[rawId]) return rawId;
      if (document.sections[id]) return id;

      const blockId = document.blocks[rawId] ? rawId : document.blocks[id] ? id : null;
      if (!blockId) continue;
      const ownerSection = Object.values(document.sections).find((section) => section.blockIds?.includes(blockId));
      if (ownerSection) return ownerSection.id;
    }

    return null;
  };

  const fixPublishIssue = async (issue: ThemeReferenceIssue) => {
    const path = pagePathForIssue(issue);
    const sectionId = sectionIdForIssue(issue);
    const codeAliases: Record<string, string> = {
      PAGE_TEMPLATE_MISSING: "missing-page-template",
      PAGE_SEO_MISSING: "missing-page-seo",
      TEMPLATE_SECTION_MISSING: "missing-template-section",
      SECTION_BLOCK_MISSING: "missing-section-block",
      SECTION_MEDIA_MISSING: "missing-media-reference",
      BLOCK_MEDIA_MISSING: "missing-media-reference",
      SEO_MEDIA_MISSING: "missing-og-media",
      BROKEN_MANAGED_LINK: "broken-merchant-link",
      ORPHAN_SECTION: "orphan-section",
      ORPHAN_BLOCK: "orphan-block",
      ORPHAN_MEDIA: "orphan-media",
    };
    const code = codeAliases[issue.code] || issue.code;
    const source = typeof issue.source === "string"
      ? issue.source
      : typeof issue.ownerId === "string"
        ? issue.ownerId
        : "";
    const target = typeof issue.target === "string"
      ? issue.target
      : typeof issue.targetId === "string"
        ? issue.targetId
        : "";

    setPublishIssues(null);
    setMobileMoreOpen(false);
    setContextMenu(null);
    setQuickMediaEdit(null);

    if (code === "link-to-unpublished-page" && target.startsWith("/") && editorPages.some((page) => page.path === target)) {
      if (target !== activePath) await changePage(target);
      setPageManagerMode("edit");
      return;
    }

    if (path && path !== activePath && editorPages.some((page) => page.path === path)) {
      await changePage(path);
    }

    if (["missing-page-template", "missing-page-seo", "missing-og-media"].includes(code)) {
      setPageManagerMode("edit");
      return;
    }

    if (["missing-template-binding", "missing-template-section"].includes(code)) {
      setTemplateManagerOpen(true);
      return;
    }

    if (code === "invalid-preset-reference" || source.startsWith("preset:")) {
      setSelected(null);
      setStructureFocusSectionId(null);
      setRightOpen(false);
      setLeftOpen(true);
      setPresetPickerSignal((value) => value + 1);
      return;
    }

    if (code === "missing-media-reference" && !sectionId) {
      setQuickMediaEdit(null);
      setMediaOpen(true);
      return;
    }

    if (code === "broken-merchant-link" && !sectionId) {
      setRedirectManagerOpen(true);
      return;
    }

    if (code === "orphan-media") {
      setMediaOpen(true);
      return;
    }

    if (code === "orphan-section" || code === "orphan-block") {
      setSelected(null);
      setStructureFocusSectionId(sectionId);
      setRightOpen(false);
      setLeftOpen(true);
      return;
    }

    setSelected(null);
    setStructureFocusSectionId(sectionId);
    setRightOpen(false);
    setLeftOpen(true);
  };

  const applyPageDocument = useCallback(async (next: ThemeDocument, nextPath: string) => {
    await syncPreviewDocument(next, true);
    setDocument(next);
    revisionRef.current = next.revision;
    setActivePath(nextPath);
    setSelected(null);
    setHistory([]);
    setFuture([]);
    setLastHeartbeat(Date.now());

    if (iframeRef.current) {
      iframeRef.current.src = previewUrl(nextPath, previewTokenRef.current);
    }
  }, [syncPreviewDocument]);

  const applyStructureSnapshot = useCallback(async (snapshot: ThemeDocument, pagePath: string, reload = true) => {
    const next = structuredClone(snapshot) as ThemeDocument;
    next.revision = revisionRef.current + 1;
    await syncPreviewDocument(next, true);
    revisionRef.current = next.revision;
    setDocument(next);
    if (reload) setSelected(null);
    setLastHeartbeat(Date.now());

    if (reload && iframeRef.current) {
      const page = editorPages.find((item) => item.path === pagePath);
      iframeRef.current.src = previewUrl(page ? cleanPreviewPath(page) : pagePath, previewTokenRef.current);
    }
  }, [editorPages, syncPreviewDocument]);

  const applyStructureDocument = useCallback(async (next: ThemeDocument, label: string) => {
    const before = structuredClone(document) as ThemeDocument;
    const after = structuredClone(next) as ThemeDocument;
    await applyStructureSnapshot(after, activePath, true);
    setHistory((items) => [...items.slice(-79), { kind: "structure", label, before, after, pagePath: activePath, reload: true }]);
    setFuture([]);
    toast.success(label);
  }, [activePath, applyStructureSnapshot, document, toast]);

  const applyMediaDocument = useCallback(async (next: ThemeDocument, label: string) => {
    const before = structuredClone(document) as ThemeDocument;
    const after = structuredClone(next) as ThemeDocument;
    await applyStructureSnapshot(after, activePath, false);
    postMediaDocumentDiff(before, after);
    setHistory((items) => [...items.slice(-79), { kind: "structure", label, before, after, pagePath: activePath, reload: false }]);
    setFuture([]);
  }, [activePath, applyStructureSnapshot, document, postMediaDocumentDiff]);

  const applyMetadataDocument = useCallback(async (next: ThemeDocument, label: string) => {
    const before = structuredClone(document) as ThemeDocument;
    const after = structuredClone(next) as ThemeDocument;
    await applyStructureSnapshot(after, activePath, false);
    setHistory((items) => [...items.slice(-79), { kind: "structure", label, before, after, pagePath: activePath, reload: false }]);
    setFuture([]);
    toast.success(label);
  }, [activePath, applyStructureSnapshot, document, toast]);

  const applyRestoredSnapshot = useCallback(async (next: ThemeDocument) => {
    await syncPreviewDocument(next, true);
    setDocument(next);
    setSavedDraft(next);
    revisionRef.current = next.revision;
    setSelected(null);
    setHistory([]);
    setFuture([]);
    setLastHeartbeat(Date.now());

    if (iframeRef.current && activePage) {
      iframeRef.current.src = previewUrl(cleanPreviewPath(activePage), previewTokenRef.current);
    }
  }, [activePage, syncPreviewDocument]);

  const applyPatchValue = (
    target: SelectedTarget,
    patchScope: EditorScope,
    patchDevice: Device,
    path: string,
    value: unknown,
  ) => {
    if (!activePage) return;
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setDocument((current) => persistSemanticPatch(current, target, patchScope, patchDevice, activePage, path, value, revision));
    setSelected((current) => current?.id === target.id ? updateTargetSnapshot(current, path, value) : current);
    postToPreview({
      type: STORE_DESIGN_MESSAGES.PATCH,
      targetId: target.id,
      path,
      value,
      revision,
      scope: patchScope,
      device: patchDevice,
    });
  };

  const applyInspectorPatch = (path: string, value: unknown) => {
    if (!selected || !activePage) return;
    const scopedResponsive = selected.type === "consent-banner"
      ? responsiveSettingsFor(document, selected, scope, activePage)
      : null;
    const scopedDevice = scopedResponsive ? recordValue(scopedResponsive[device]) : null;
    const before = scopedDevice && Object.prototype.hasOwnProperty.call(scopedDevice, path)
      ? scopedDevice[path]
      : selected.type === "consent-banner"
        ? null
        : snapshotValue(selected, path);
    if (Object.is(before, value)) return;
    const entry: SemanticHistoryEntry = { kind: "semantic", target: selected, scope, device, path, before, after: value };
    setHistory((items) => [...items.slice(-79), entry]);
    setFuture([]);
    applyPatchValue(selected, scope, device, path, value);
  };

  useEffect(() => {
    if (!inlineEditRequest || !selected || selected.id !== inlineEditRequest.targetId || !activePage) return;
    const before = snapshotValue(selected, "content.text");
    const after = inlineEditRequest.value;
    setInlineEditRequest(null);
    if (Object.is(before, after)) return;
    setHistory((items) => [...items.slice(-79), {
      kind: "semantic",
      target: selected,
      scope,
      device,
      path: "content.text",
      before,
      after,
    }]);
    setFuture([]);
    applyPatchValue(selected, scope, device, "content.text", after);
  }, [inlineEditRequest, selected, activePage, scope, device]);

  const applyDestination = (href: string, linkTarget: "_self" | "_blank") => {
    const target = destinationTarget;
    if (!target || !activePage) return;
    const patchScope = target.allowedScopes.includes(scope) ? scope : target.defaultScope;
    const beforeHref = snapshotValue(target, "link.href");
    const beforeTarget = snapshotValue(target, "link.target");
    const entries: SemanticHistoryEntry[] = [];
    if (!Object.is(beforeHref, href)) {
      entries.push({ kind: "semantic", target, scope: patchScope, device, path: "link.href", before: beforeHref, after: href });
    }
    if (!Object.is(beforeTarget, linkTarget)) {
      entries.push({ kind: "semantic", target, scope: patchScope, device, path: "link.target", before: beforeTarget, after: linkTarget });
    }
    if (!entries.length) return;
    setHistory((items) => [...items.slice(-79), { kind: "semantic-batch", label: "Bağlantı hedefi güncellendi", patches: entries }]);
    setFuture([]);
    for (const entry of entries) applyPatchValue(target, patchScope, device, entry.path, entry.after);
  };

  const openMediaPickerForTarget = (target: SelectedTarget) => {
    if (!activePage || !target.current.media) return;
    const patchScope = target.allowedScopes.includes(scope) ? scope : target.defaultScope;
    const responsive = responsiveSettingsFor(document, target, patchScope, activePage);
    const deviceLeaves = new Map(flattenResponsiveLeaves(recordValue(responsive[device])));
    setSelected(target);
    setQuickMediaEdit({
      target,
      scope: patchScope,
      device,
      page: activePage,
      mediaType: target.current.media.kind === "video" ? "video" : "image",
      beforeOverride: deviceLeaves.has("media.src") ? deviceLeaves.get("media.src") : null,
      visibleSource: target.current.media.src || "",
    });
    setContextMenu(null);
    setMediaOpen(true);
  };

  const openQuickMediaPicker = () => {
    if (!selected || !activePage || !selected.current.media) return;
    const responsive = responsiveSettingsFor(document, selected, scope, activePage);
    const deviceLeaves = new Map(flattenResponsiveLeaves(recordValue(responsive[device])));
    setQuickMediaEdit({
      target: selected,
      scope,
      device,
      page: activePage,
      mediaType: selected.current.media.kind === "video" ? "video" : "image",
      beforeOverride: deviceLeaves.has("media.src") ? deviceLeaves.get("media.src") : null,
      visibleSource: selected.current.media.src || "",
    });
    setContextMenu(null);
    setMediaOpen(true);
  };

  const applyQuickMediaSource = (source: string) => {
    const edit = quickMediaEdit;
    const value = source.trim();
    if (!edit || !value) return;

    if (edit.visibleSource === value) {
      setMediaOpen(false);
      setQuickMediaEdit(null);
      return;
    }

    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setDocument((current) => persistSemanticPatch(
      current,
      edit.target,
      edit.scope,
      edit.device,
      edit.page,
      "media.src",
      value,
      revision,
    ));
    setSelected((current) => current?.id === edit.target.id
      ? updateTargetSnapshot(current, "media.src", value)
      : current);
    setHistory((items) => [...items.slice(-79), {
      kind: "semantic",
      target: edit.target,
      scope: edit.scope,
      device: edit.device,
      path: "media.src",
      before: edit.beforeOverride,
      after: value,
    }]);
    setFuture([]);
    postToPreview({
      type: STORE_DESIGN_MESSAGES.PATCH,
      targetId: edit.target.id,
      path: "media.src",
      value,
      revision,
      scope: edit.scope,
      device: edit.device,
    });
    setMediaOpen(false);
    setQuickMediaEdit(null);
    toast.success(edit.mediaType === "video" ? "Video değiştirildi." : "Görsel değiştirildi.");
  };

  const applyContextSectionAction = async (action: "focus" | "up" | "down" | "toggle" | "duplicate" | "delete") => {
    const registration = contextMenu ? sectionRegistration(contextMenu.target) : null;
    if (!registration) return;

    if (action === "focus") {
      setContextMenu(null);
      setSelected(null);
      setStructureFocusSectionId(registration.id);
      setRightOpen(false);
      setLeftOpen(true);
      return;
    }

    const source = document.sections[registration.id];
    const preferredTemplateId = activePage
      ? (managedPage?.templateId || (activePage.template ? (document.templateBindings[activePage.path] || activePage.path) : `route:${activePage.path}`))
      : null;
    const preferredTemplate = preferredTemplateId ? document.templates[preferredTemplateId] || null : null;
    const ownerTemplate = preferredTemplate?.sectionIds.includes(registration.id)
      ? preferredTemplate
      : Object.values(document.templates).find((template) => template.sectionIds.includes(registration.id));
    if (!source || !ownerTemplate) {
      toast.error("Bu bölümün sayfa yapısı bulunamadı.");
      return;
    }

    const next = structuredClone(document) as ThemeDocument;
    const template = next.templates[ownerTemplate.id];
    const index = template?.sectionIds.indexOf(registration.id) ?? -1;
    if (!template || index < 0) {
      toast.error("Bu bölümün sayfa yapısı bulunamadı.");
      return;
    }

    let label = "Bölüm güncellendi";

    if (action === "up") {
      if (index <= 0) return;
      [template.sectionIds[index - 1], template.sectionIds[index]] = [template.sectionIds[index], template.sectionIds[index - 1]];
      label = "Bölüm yukarı taşındı";
    } else if (action === "down") {
      if (index >= template.sectionIds.length - 1) return;
      [template.sectionIds[index + 1], template.sectionIds[index]] = [template.sectionIds[index], template.sectionIds[index + 1]];
      label = "Bölüm aşağı taşındı";
    } else if (action === "toggle") {
      const referenceCount = Object.values(document.templates).filter((item) => item.sectionIds.includes(registration.id)).length;
      if (referenceCount > 1) {
        const confirmed = window.confirm(
          `Bu bölüm ${referenceCount} yerde kullanılıyor. Görünürlük değişikliği bağlı olan tüm yerleri etkiler. Devam etmek istiyor musun?`,
        );
        if (!confirmed) return;
      }
      next.sections[registration.id] = { ...source, enabled: !source.enabled };
      label = source.enabled ? "Bölüm gizlendi" : "Bölüm gösterildi";
    } else if (action === "duplicate") {
      const copyId = editorUid(`section-${source.type}`);
      const copiedBlockIds: string[] = [];
      for (const blockId of source.blockIds || []) {
        const block = next.blocks[blockId];
        if (!block) continue;
        const copyBlockId = editorUid(`block-${block.type}`);
        next.blocks[copyBlockId] = structuredClone({ ...block, id: copyBlockId });
        copiedBlockIds.push(copyBlockId);
      }
      next.sections[copyId] = structuredClone({ ...source, id: copyId, blockIds: copiedBlockIds });
      template.sectionIds.splice(index + 1, 0, copyId);
      label = "Bölüm çoğaltıldı";
    } else if (action === "delete") {
      const confirmed = window.confirm(
        contextTargetsWholeSection
          ? "Bu bölümü sayfa yapısından kaldırmak istiyor musun?"
          : "Seçili öğenin bulunduğu üst bölümü sayfa yapısından kaldırmak istiyor musun?",
      );
      if (!confirmed) return;

      template.sectionIds.splice(index, 1);
      const stillReferenced = Object.values(next.templates).some((item) => item.sectionIds.includes(registration.id));
      if (!stillReferenced) {
        for (const blockId of source.blockIds || []) {
          const usedElsewhere = Object.values(next.sections).some((section) => section.id !== registration.id && section.blockIds?.includes(blockId));
          if (!usedElsewhere) delete next.blocks[blockId];
        }
        delete next.sections[registration.id];
      }
      label = "Bölüm kaldırıldı";
    }

    setContextMenu(null);
    setSelected(null);
    setStructureFocusSectionId(null);
    await applyStructureDocument(next, label);
  };

  const resetQuickOverrides = () => {
    if (!selected || !activePage) return;

    const responsive = responsiveSettingsFor(document, selected, scope, activePage);
    const deviceSettings = recordValue(responsive[device]);
    const leaves = new Map(flattenResponsiveLeaves(deviceSettings));
    const candidates = [
      ...(selected.controlGroups.includes("typography") ? ["textAlign"] : []),
      ...(selected.controlGroups.includes("layout") ? ["visible"] : []),
      ...(selected.type !== "product-card" && (selected.controlGroups.includes("card") || selected.controlGroups.includes("layout")) ? ["borderRadius"] : []),
      ...(selected.type !== "product-card" && selected.controlGroups.includes("media") && selected.current.media ? ["media.src", "media.objectFit", "media.objectPosition"] : []),
      ...(selected.type === "product-grid" ? ["grid.columns"] : []),
      ...(selected.type === "product-card" ? ["card.density", "card.imageRatio", "card.showPrice"] : []),
    ];
    const paths = [...new Set(candidates)].filter((path) => leaves.has(path));

    if (!paths.length) {
      toast.success("Bu uygulama alanında sıfırlanacak özel hızlı ayar yok.");
      return;
    }

    let next = document;
    let revision = revisionRef.current;
    const patches: SemanticHistoryEntry[] = [];

    for (const path of paths) {
      const before = leaves.get(path);
      revision += 1;
      next = persistSemanticPatch(next, selected, scope, device, activePage, path, null, revision);
      patches.push({ kind: "semantic", target: selected, scope, device, path, before, after: null });
      postToPreview({
        type: STORE_DESIGN_MESSAGES.PATCH,
        targetId: selected.id,
        path,
        value: null,
        revision,
        scope,
        device,
      });
    }

    revisionRef.current = revision;
    setDocument(next);
    setHistory((items) => [...items.slice(-79), { kind: "semantic-batch", label: "Hızlı ayarlar sıfırlandı", patches }]);
    setFuture([]);
    setContextMenu(null);
    toast.success("Özel hızlı ayarlar varsayılana döndürüldü.");
  };

  const applyMobileResponsiveAction = (mode: "copy-desktop" | "inherit") => {
    if (!selected || !activePage || device !== "mobile") return;

    const responsive = responsiveSettingsFor(document, selected, scope, activePage);
    const desktop = recordValue(responsive.desktop);
    const mobile = recordValue(responsive.mobile);
    const desktopLeaves = new Map(flattenResponsiveLeaves(desktop));
    const mobileLeaves = new Map(flattenResponsiveLeaves(mobile));
    const paths = mode === "copy-desktop"
      ? [...new Set([...desktopLeaves.keys(), ...mobileLeaves.keys()])]
      : [...mobileLeaves.keys()];

    if (!paths.length) {
      toast.error(mode === "copy-desktop" ? "Kopyalanacak masaüstü ayarı yok." : "Kaldırılacak özel mobil ayar yok.");
      return;
    }

    let next = document;
    let revision = revisionRef.current;
    const patches: SemanticHistoryEntry[] = [];

    for (const path of paths) {
      const before = mobileLeaves.has(path) ? mobileLeaves.get(path) : null;
      const after = mode === "copy-desktop"
        ? (desktopLeaves.has(path) ? desktopLeaves.get(path) : null)
        : null;
      if (Object.is(before, after)) continue;

      revision += 1;
      next = persistSemanticPatch(next, selected, scope, "mobile", activePage, path, after, revision);
      patches.push({
        kind: "semantic",
        target: selected,
        scope,
        device: "mobile",
        path,
        before,
        after,
      });
      postToPreview({
        type: STORE_DESIGN_MESSAGES.PATCH,
        targetId: selected.id,
        path,
        value: after,
        revision,
        scope,
        device: "mobile",
      });
    }

    if (!patches.length) return;
    revisionRef.current = revision;
    setDocument(next);
    setHistory((items) => [...items.slice(-79), {
      kind: "semantic-batch",
      label: mode === "copy-desktop" ? "Masaüstü ayarları mobil görünüme aktarıldı" : "Mobil ayarlar masaüstü ayarına döndü",
      patches,
    }]);
    setFuture([]);
    toast.success(mode === "copy-desktop" ? "Masaüstü ayarları mobil görünüme aktarıldı." : "Mobil ayarlar artık masaüstü ayarını kullanacak.");
  };

  const undo = async () => {
    const entry = history.at(-1);
    if (!entry) return;
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [...items, entry]);
    if (entry.kind === "semantic") {
      applyPatchValue(entry.target, entry.scope, entry.device, entry.path, entry.before);
      return;
    }
    if (entry.kind === "semantic-batch") {
      for (const patch of [...entry.patches].reverse()) {
        applyPatchValue(patch.target, patch.scope, patch.device, patch.path, patch.before);
      }
      return;
    }
    try {
      await applyStructureSnapshot(entry.before, entry.pagePath, entry.reload);
      if (!entry.reload) postMediaDocumentDiff(entry.after, entry.before);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Yapısal geri alma uygulanamadı.");
    }
  };

  const redo = async () => {
    const entry = future.at(-1);
    if (!entry) return;
    setFuture((items) => items.slice(0, -1));
    setHistory((items) => [...items, entry]);
    if (entry.kind === "semantic") {
      applyPatchValue(entry.target, entry.scope, entry.device, entry.path, entry.after);
      return;
    }
    if (entry.kind === "semantic-batch") {
      for (const patch of entry.patches) {
        applyPatchValue(patch.target, patch.scope, patch.device, patch.path, patch.after);
      }
      return;
    }
    try {
      await applyStructureSnapshot(entry.after, entry.pagePath, entry.reload);
      if (!entry.reload) postMediaDocumentDiff(entry.before, entry.after);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Yapısal yineleme uygulanamadı.");
    }
  };

  const save = async (mode: "draft" | "publish", forcePublish = false) => {
    if (saving) return;

    if (mode === "publish" && !forcePublish) {
      setPublishIssues(analyzeThemeDocumentReferences(document));
      return;
    }

    setSaveFeedback(null);
    setSaving(mode);
    try {
      const result = await adminRequest<{ document?: unknown; revalidate?: { ok?: boolean; message?: string } }>("/api/store-design-v2", {
        method: "PUT",
        body: JSON.stringify({ mode, document }),
        confirmation: false,
      });
      const persisted = normalizeThemeDocument(result.document || document);
      setDocument(persisted);
      setSavedDraft(persisted);
      revisionRef.current = persisted.revision;
      if (mode === "publish") {
        setPublished(persisted);
        setPublishIssues(null);
      }
      toast.success(mode === "publish" ? "Mağaza tasarımı yayınlandı." : "Taslak kaydedildi.");
      setSaveFeedback(mode);
      window.setTimeout(() => {
        setSaveFeedback((current) => current === mode ? null : current);
      }, 1_400);
    } catch (error) {
      setSaveFeedback(null);
      toast.error(error instanceof Error ? error.message : "Mağaza tasarımı kaydedilemedi.");
    } finally {
      setSaving(null);
    }
  };

  if (loading || !initialSrcRef.current) {
    return (
      <div data-store-design-v2-loading className="sd-loading-screen grid min-h-dvh place-items-center bg-[#f5f5f3]">
        <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-5 py-4 text-[12px] font-medium shadow-sm">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Mağaza Tasarımı hazırlanıyor…
        </div>
      </div>
    );
  }

  // Zeabur deployment marker: this admin source change intentionally refreshes the panel service.
  return (
    <div ref={editorShellRef} data-store-design-v2-admin data-physical-mobile={isMobileViewport ? "true" : "false"} data-device={device} data-interaction-mode={interactionMode} className="sd-editor-shell flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f5f5f3] text-[#111]">
      <StoreDesignToolbarV22
        groupedPages={groupedPages}
        activePath={activePath}
        device={device}
        interactionMode={interactionMode}
        leftOpen={leftOpen}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        saveFeedback={saveFeedback}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
        onBack={requestEditorExit}
        onToggleStructure={toggleStructurePanel}
        onChangePage={(path) => void changePage(path)}
        onDeviceChange={setDevice}
        onModeChange={(mode) => {
          setInteractionMode(mode);
          setContextMenu(null);
          if (mode === "browse") setRightOpen(false);
        }}
        onUndo={() => void undo()}
        onRedo={() => void redo()}
        onSaveDraft={() => void save("draft")}
        onPublish={() => void save("publish")}
        onOpenMedia={() => { setQuickMediaEdit(null); setMediaOpen(true); }}
        onOpenPages={() => setPageManagerMode(managedPage ? "edit" : "create")}
        onOpenTemplates={() => setTemplateManagerOpen(true)}
        onOpenRedirects={() => setRedirectManagerOpen(true)}
        onOpenHistory={() => setSnapshotManagerOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <StoreDesignStructurePanelV22
          panelRef={structurePanelRef}
          open={leftOpen}
          groupedPages={groupedPages}
          activePath={activePath}
          activeLabel={activePage?.label || "Mağaza Tasarımı"}
          managedPage={Boolean(managedPage)}
          onHide={() => setLeftOpen(false)}
          onChangePage={(path) => void changePage(path)}
          onEditPage={() => setPageManagerMode("edit")}
          onNewPage={() => setPageManagerMode("create")}
          onSelectGlobal={(targetId) => {
            setInteractionMode("edit");
            postToPreview({ type: "store-design-v2:select-target", targetId });
          }}
        >
          <StoreDesignSectionManager
            document={document}
            activePage={activePage}
            compatibility={activeCompatibility}
            openPickerSignal={sectionPickerSignal}
            openPresetSignal={presetPickerSignal}
            selectedSectionId={structureFocusSectionId || selectedSectionId}
            onApply={applyStructureDocument}
          />
        </StoreDesignStructurePanelV22>

        <main className="sd-preview-stage relative flex min-w-0 flex-1 items-center justify-center overflow-auto p-3 md:p-6">
          {!connected ? (
            <div role="status" aria-live="polite" className="sd-preview-connection-chip absolute left-1/2 top-3 z-30 flex max-w-[calc(100%_-_24px)] -translate-x-1/2 items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold shadow-lg">
              <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${connectionStalled ? "" : "animate-spin"}`} />
              <span className="truncate">{connectionStalled ? "Önizleme yanıt vermiyor" : "Önizleme bağlanıyor…"}</span>
              {connectionStalled ? (
                <button
                  type="button"
                  onClick={() => void reconnectPreview()}
                  className="rounded-full border border-current/20 px-2.5 py-1 text-[10px] font-semibold"
                >
                  Yeniden bağlan
                </button>
              ) : null}
            </div>
          ) : null}
          {isMobileViewport && interactionMode === "edit" && !leftOpen && !rightOpen ? (
            <div className="sd-edit-mode-chip pointer-events-none absolute left-1/2 top-3 z-20 max-w-[calc(100vw_-_28px)] -translate-x-1/2 truncate rounded-full px-3 py-2 text-[11px] font-semibold shadow-lg">
              {selected ? `Seçili: ${selected.label} · Düzenle'den ayarları aç` : "Düzenleme açık · Bir öğeye dokun"}
            </div>
          ) : null}
          <div className={`sd-preview-shell relative shrink-0 overflow-hidden bg-white shadow-[0_18px_60px_rgba(15,23,42,.14)] transition-[width,height,border-radius] duration-300 ${
            device === "mobile"
              ? isMobileViewport
                ? "h-full w-full rounded-none border-0"
                : "h-[780px] w-[390px] rounded-[44px] border-[9px] border-[#111]"
              : "h-[calc(100dvh_-_106px)] min-h-[620px] w-[min(1180px,calc(100vw_-_120px))] rounded-xl border border-black/10"
          }`}>
            {device === "mobile" && !isMobileViewport ? <div className="sd-device-island pointer-events-none absolute left-1/2 top-3 z-10 h-7 w-28 -translate-x-1/2 rounded-full bg-[#111]" /> : null}
            <iframe
              ref={iframeRef}
              title="Mağaza tasarımı önizlemesi"
              src={initialSrcRef.current}
              className={`sd-preview-frame h-full w-full bg-white ${device === "mobile" && !isMobileViewport ? "rounded-[34px]" : ""}`}
              onLoad={() => {
                setConnected(false);
                setConnectionStalled(false);
                setLastHeartbeat(Date.now());
              }}
            />
          </div>
        </main>

        <aside ref={inspectorPanelRef} tabIndex={-1} aria-label="Düzenleme paneli" data-open={rightOpen ? "true" : "false"} data-sheet-level={mobileSheetLevel} aria-hidden={!rightOpen} className={`sd-sidebar sd-inspector ${rightOpen ? "is-open" : "is-closed"} flex w-[360px] shrink-0 flex-col border-l border-black/10 bg-white max-xl:absolute max-xl:bottom-0 max-xl:right-0 max-xl:top-[58px] max-xl:z-20 max-xl:shadow-2xl`}>
            <div
              className="sd-inspector-header border-b border-black/[0.07] p-3"
              onTouchStart={(event) => {
                mobileSheetTouchStartRef.current = event.touches.item(0)?.clientY ?? null;
              }}
              onTouchEnd={(event) => {
                if (!isMobileViewport) return;
                const start = mobileSheetTouchStartRef.current;
                const end = event.changedTouches.item(0)?.clientY ?? null;
                mobileSheetTouchStartRef.current = null;
                if (start === null || end === null) return;
                const delta = end - start;
                if (Math.abs(delta) < 48) return;
                if (delta > 0) {
                  if ((inspectorBodyRef.current?.scrollTop || 0) > 1) return;
                  if (mobileSheetLevel === "full") setMobileSheetLevel("medium");
                  else if (mobileSheetLevel === "medium") setMobileSheetLevel("peek");
                  else setRightOpen(false);
                } else {
                  if (mobileSheetLevel === "peek") setMobileSheetLevel("medium");
                  else if (mobileSheetLevel === "medium") setMobileSheetLevel("full");
                }
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[9px] font-semibold text-black/45">DÜZENLENEN ÖĞE</p>
                <button
                  type="button"
                  onClick={() => {
                    setRightOpen(false);
                    setMobileSheetLevel("peek");
                    window.requestAnimationFrame(() => mobileEditButtonRef.current?.focus({ preventScroll: true }));
                  }}
                  className="sd-mobile-sheet-close hidden h-10 w-10 place-items-center rounded-xl border border-black/10"
                  aria-label="Ayarları kapat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {selected ? (
                <>
                  <p className="mt-1.5 text-[12px] font-semibold">{selected.label}</p>
                  <p className="mt-1 text-[8px] text-black/35">{selected.breadcrumb.map((item) => item.label).join(" › ")}</p>
                  <div className="sd-mobile-peek-summary mt-2 hidden min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5">
                    <span className="shrink-0 rounded-full border border-black/10 bg-white px-2.5 py-2 text-[10px] font-semibold text-black/50">
                      {scopeLabel(scope)}
                    </span>
                    {selected.controlGroups.includes("layout") ? (
                      <button
                        type="button"
                        onClick={() => applyInspectorPatch("visible", selected.current.visible === false)}
                        className="shrink-0 rounded-lg border border-black/10 bg-white px-2.5 text-[10px] font-semibold"
                      >
                        {selected.current.visible === false ? "Göster" : "Gizle"}
                      </button>
                    ) : null}
                    {selected.type !== "product-card" && selected.controlGroups.includes("media") && selected.current.media ? (
                      <button
                        type="button"
                        onClick={() => applyInspectorPatch("media.objectFit", selected.current.media?.objectFit === "contain" ? "cover" : "contain")}
                        className="shrink-0 rounded-lg border border-black/10 bg-white px-2.5 text-[10px] font-semibold"
                      >
                        {selected.current.media.objectFit === "contain" ? "Kapla" : "Sığdır"}
                      </button>
                    ) : null}
                    {selected.type !== "product-card" && selected.controlGroups.includes("typography") ? (
                      <button
                        type="button"
                        onClick={() => {
                          const current = selected.current.textAlign || "left";
                          applyInspectorPatch("textAlign", current === "left" ? "center" : current === "center" ? "right" : "left");
                        }}
                        className="shrink-0 rounded-lg border border-black/10 bg-white px-2.5 text-[10px] font-semibold"
                      >
                        Hiza: {selected.current.textAlign === "center" ? "Orta" : selected.current.textAlign === "right" ? "Sağ" : "Sol"}
                      </button>
                    ) : null}
                    {selected.type === "product-grid" ? (
                      <button
                        type="button"
                        onClick={() => applyInspectorPatch("grid.columns", (selected.current.grid?.columns ?? 2) === 1 ? 2 : 1)}
                        className="shrink-0 rounded-lg border border-black/10 bg-white px-2.5 text-[10px] font-semibold"
                      >
                        {selected.current.grid?.columns ?? 2} sütun
                      </button>
                    ) : null}
                    {selected.type === "product-card" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => applyInspectorPatch("card.showPrice", selected.current.card?.showPrice === false)}
                          className="shrink-0 rounded-lg border border-black/10 bg-white px-2.5 text-[10px] font-semibold"
                        >
                          {selected.current.card?.showPrice === false ? "Fiyatı göster" : "Fiyatı gizle"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const ratio = selected.current.card?.imageRatio || "3/4";
                            applyInspectorPatch("card.imageRatio", ratio === "3/4" ? "4/5" : ratio === "4/5" ? "1/1" : "3/4");
                          }}
                          className="shrink-0 rounded-lg border border-black/10 bg-white px-2.5 text-[10px] font-semibold"
                        >
                          Oran {selected.current.card?.imageRatio || "3/4"}
                        </button>
                      </>
                    ) : null}
                  </div>
                  <div role="group" className="sd-mobile-sheet-levels mt-3 hidden grid-cols-3 gap-1 rounded-xl bg-black/[0.035] p-1" aria-label="Ayar paneli görünümü">
                    {(["peek", "medium", "full"] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        aria-pressed={mobileSheetLevel === level}
                        onClick={() => setMobileSheetLevel(level)}
                        className={`rounded-lg px-2 py-2 text-[11px] font-semibold ${mobileSheetLevel === level ? "is-active" : ""}`}
                      >
                        {level === "peek" ? "Özet" : level === "medium" ? "Ayarlar" : "Tam ekran"}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-2 text-[9px] leading-4 text-black/40">Önizlemede düzenlemek istediğin öğeyi seç. Masaüstünde sağ tık, mobilde uzun basma da kullanabilirsin.</p>
              )}
            </div>

            {selected ? (
              <div ref={inspectorBodyRef} className="sd-inspector-body min-h-0 flex-1 overflow-y-auto">
                <StoreDesignInspectorBodyV22
                  selected={selected}
                  scope={scope}
                  device={device}
                  hasMobileOverrides={hasMobileOverrides}
                  scopeLabel={scopeLabel}
                  consentSetting={consentSetting}
                  onScopeChange={setScope}
                  onPatch={applyInspectorPatch}
                  onDestination={() => setDestinationTarget(selected)}
                  onMedia={openQuickMediaPicker}
                  onCopyDesktop={() => applyMobileResponsiveAction("copy-desktop")}
                  onUseDesktop={() => applyMobileResponsiveAction("inherit")}
                />
              </div>
            ) : (
              <div className="grid flex-1 place-items-center p-6 text-center text-[9px] leading-5 text-black/35">
                Önizlemede düzenlemek istediğin öğeyi seç. Yalnız bu öğe için kullanılabilen ayarlar gösterilir.
              </div>
            )}

            <div className="sd-inspector-footer border-t border-black/[0.07] p-3">
              <p className="text-[8px] leading-4 text-black/35">
                {hasUnsavedChanges
                  ? "Kaydedilmemiş düzenlemeler var."
                  : hasUnpublishedChanges
                    ? "Taslak kaydedildi; yayınlanan sürümden farklı."
                    : "Taslak ve yayınlanan sürüm eşleşiyor."}
              </p>
            </div>
          </aside>

      </div>

      {contextMenu ? (
        <StoreDesignContextMenuV22
          x={contextMenu.x}
          y={contextMenu.y}
          target={contextMenu.target}
          scope={scope}
          contextMenuRef={contextMenuRef}
          hasSection={Boolean(contextSection && contextSectionTemplate)}
          canMoveSectionUp={contextSectionIndex > 0}
          canMoveSectionDown={Boolean(contextSectionTemplate && contextSectionIndex >= 0 && contextSectionIndex < contextSectionTemplate.sectionIds.length - 1)}
          sharedSectionCount={contextSectionReferenceCount}
          onClose={() => setContextMenu(null)}
          onEditText={() => {
            setSelected(contextMenu.target);
            setContextMenu(null);
            postToPreview({
              type: "store-design-v2:start-inline-edit",
              targetId: contextMenu.target.id,
            });
          }}
          onChangeDestination={() => {
            setDestinationTarget(contextMenu.target);
            setContextMenu(null);
          }}
          onChangeMedia={() => openMediaPickerForTarget(contextMenu.target)}
          onToggleVisibility={() => applyInspectorPatch("visible", contextMenu.target.current.visible === false)}
          onMobileSettings={() => {
            setSelected(contextMenu.target);
            setContextMenu(null);
            setDevice("mobile");
            setLeftOpen(false);
            setRightOpen(true);
          }}
          onOpenFull={() => {
            setSelected(contextMenu.target);
            setContextMenu(null);
            setLeftOpen(false);
            setRightOpen(true);
          }}
          onSectionAction={(action) => void applyContextSectionAction(action)}
        />
      ) : null}

      <StoreDesignDestinationPicker
        open={Boolean(destinationTarget)}
        document={document}
        pages={editorPages}
        activePath={activePath}
        targetLabel={destinationTarget?.label || "Bağlantı"}
        currentHref={destinationTarget?.current.link?.href || ""}
        currentTarget={destinationTarget?.current.link?.target || "_self"}
        onApply={(href, target) => applyDestination(href, target)}
        onClose={() => setDestinationTarget(null)}
      />

      {publishIssues !== null ? (
        <StoreDesignPublishReport
          issues={publishIssues}
          publishing={saving === "publish"}
          onCancel={() => setPublishIssues(null)}
          onPublish={() => void save("publish", true)}
          onFixIssue={(issue) => void fixPublishIssue(issue)}
        />
      ) : null}

      {snapshotManagerOpen ? (
        <StoreDesignSnapshotManager
          currentPublishedRevision={published.revision}
          onRestore={applyRestoredSnapshot}
          onClose={() => setSnapshotManagerOpen(false)}
        />
      ) : null}

      {redirectManagerOpen ? (
        <StoreDesignRedirectManager
          document={document}
          onApply={applyMetadataDocument}
          onClose={() => setRedirectManagerOpen(false)}
        />
      ) : null}

      {templateManagerOpen ? (
        <StoreDesignTemplateManager
          document={document}
          activePath={activePath}
          activeLabel={activePage?.label || activePath}
          compatibility={activeCompatibility}
          onApply={applyStructureDocument}
          onClose={() => setTemplateManagerOpen(false)}
        />
      ) : null}

      {mediaOpen ? (
        <StoreDesignMediaLibrary
          document={document}
          onApply={applyMediaDocument}
          onClose={() => { setMediaOpen(false); setQuickMediaEdit(null); }}
          mediaType={quickMediaEdit?.mediaType || "any"}
          onSelect={quickMediaEdit ? (_assetId, asset) => {
            if (asset?.url) applyQuickMediaSource(asset.url);
          } : undefined}
        />
      ) : null}

      {pageManagerMode ? (
        <StoreDesignPageManager
          document={document}
          activePath={activePath}
          mode={pageManagerMode}
          onClose={() => setPageManagerMode(null)}
          onApply={applyPageDocument}
        />
      ) : null}

      <StoreDesignMobileDockV22
        mode={interactionMode}
        structureOpen={leftOpen}
        inspectorOpen={rightOpen}
        hasSelection={Boolean(selected)}
        structureButtonRef={mobileStructureButtonRef}
        editButtonRef={mobileEditButtonRef}
        onPreview={() => {
          setInteractionMode("browse");
          setContextMenu(null);
          setLeftOpen(false);
          setRightOpen(false);
        }}
        onStructure={() => {
          setInteractionMode("edit");
          setContextMenu(null);
          setRightOpen(false);
          setLeftOpen((value) => !value);
        }}
        onAdd={() => {
          setInteractionMode("edit");
          setContextMenu(null);
          setRightOpen(false);
          setLeftOpen(true);
          setSectionPickerSignal((value) => value + 1);
        }}
        onEdit={() => {
          setInteractionMode("edit");
          setContextMenu(null);
          setLeftOpen(false);
          setMobileSheetLevel(selected ? "medium" : "peek");
          setRightOpen(true);
        }}
        onOpenMedia={() => { setQuickMediaEdit(null); setMediaOpen(true); }}
        onOpenTemplates={() => setTemplateManagerOpen(true)}
        onOpenRedirects={() => setRedirectManagerOpen(true)}
        onOpenPages={() => setPageManagerMode(managedPage ? "edit" : "create")}
        onOpenHistory={() => setSnapshotManagerOpen(true)}
      />
    </div>
  );
}
