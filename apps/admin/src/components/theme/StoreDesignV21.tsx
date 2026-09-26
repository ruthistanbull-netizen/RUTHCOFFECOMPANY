"use client";

import {
  ChevronDown,
  CircleDot,
  Images,
  LayoutTemplate,
  Monitor,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Send,
  Smartphone,
  Settings2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COMPONENT_REGISTRY,
  SECTION_LIBRARY,
  STORE_DESIGN_MESSAGES,
  STORE_DESIGN_SCHEMA_VERSION,
  createEmptyThemeDocument,
  normalizeThemeDocument,
  type EditorScope,
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
    media?: { src?: string; objectFit?: string; objectPosition?: string } | null;
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

type StructureHistoryEntry = {
  kind: "structure";
  label: string;
  before: ThemeDocument;
  after: ThemeDocument;
  pagePath: string;
  reload: boolean;
};

type EditorHistoryEntry = SemanticHistoryEntry | StructureHistoryEntry;

const RAW_STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://rostacoffecompany.zeabur.app";
const STOREFRONT_ORIGIN = (() => {
  try { return new URL(RAW_STOREFRONT_URL).origin; }
  catch { return "https://rostacoffecompany.zeabur.app"; }
})();

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

function scopeLabel(scope: EditorScope) {
  if (scope === "instance") return "Bu örnek";
  if (scope === "section") return "Bu bölüm";
  if (scope === "family") return "Bileşen ailesi";
  if (scope === "template") return "Sayfa şablonu";
  return "Tüm site";
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

function sectionRegistration(target: SelectedTarget) {
  const entry = [...target.breadcrumb].reverse().find((item) => item.id.startsWith("section:"));
  return entry ? { id: entry.id.slice("section:".length), type: entry.type } : null;
}

function snapshotValue(target: SelectedTarget, path: string) {
  if (path === "media.objectFit") return target.current.media?.objectFit || "cover";
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
  if (path === "media.objectFit") {
    return { ...target, current: { ...target.current, media: { ...(target.current.media || {}), objectFit: String(value) } } };
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

  if (scope === "global") {
    const globalPath = `${target.type}.${device}.${path}`;
    if (target.type.startsWith("header") || target.type.includes("menu") || target.type.includes("nav")) {
      setNested(next.globals.header, globalPath, value);
    } else if (target.type.startsWith("footer") || target.type === "social-links") {
      setNested(next.globals.footer, globalPath, value);
    } else {
      setNested(next.globals.tokens, globalPath, value);
    }
    return next;
  }

  if (scope === "family") {
    const family = next.globals.componentFamilies[target.type] || { type: target.type, desktop: {}, mobile: {} };
    setNested(family[device], path, value);
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
    setNested(instance.settings, `semantic.${semanticKey}.${device}.${path}`, value);
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
  setNested(responsive[device], path, value);
  componentSettings[semanticKey] = responsive;
  next.templates[templateId] = { ...template, componentSettings };
  return next;
}

export function StoreDesignV21() {
  const toast = useExactToast();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
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
  const [selected, setSelected] = useState<SelectedTarget | null>(null);
  const [scope, setScope] = useState<EditorScope>("global");
  const [connected, setConnected] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState(0);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [pageManagerMode, setPageManagerMode] = useState<"create" | "edit" | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
  const [history, setHistory] = useState<EditorHistoryEntry[]>([]);
  const [future, setFuture] = useState<EditorHistoryEntry[]>([]);
  const revisionRef = useRef(0);
  const lastReconnectRef = useRef(0);

  const hasUnsavedChanges = documentFingerprint(document) !== documentFingerprint(savedDraft);
  const hasUnpublishedChanges = documentFingerprint(savedDraft) !== documentFingerprint(published);
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
  const activeCompatibility: PageCompatibility = (
    managedPage ? document.templates[managedPage.templateId]?.compatibility?.[0] : undefined
  ) || (activePage ? pageCompatibility(activePage) : "content");

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
        setLastHeartbeat(Date.now());
        return;
      }

      if (data.type === STORE_DESIGN_MESSAGES.HEARTBEAT) {
        setConnected(true);
        setLastHeartbeat(Date.now());
        return;
      }

      if (data.type === STORE_DESIGN_MESSAGES.SELECT && data.target) {
        const target = data.target as SelectedTarget;
        setSelected(target);
        setScope(target.defaultScope);
        setRightOpen(true);
        return;
      }

      if (data.type === STORE_DESIGN_MESSAGES.PATCH_APPLIED && data.ok === false) {
        toast.error(String(data.error || "Değişiklik önizlemeye uygulanamadı."));
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [toast]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!lastHeartbeat) return;
      const now = Date.now();
      const staleFor = now - lastHeartbeat;
      if (staleFor > 12_000) setConnected(false);
      if (
        staleFor > 18_000 &&
        activePage &&
        iframeRef.current &&
        now - lastReconnectRef.current > 18_000
      ) {
        lastReconnectRef.current = now;
        iframeRef.current.src = previewUrl(cleanPreviewPath(activePage), previewTokenRef.current);
      }
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [activePage, lastHeartbeat]);

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
    setHistory([]);
    setFuture([]);
    postToPreview({
      type: STORE_DESIGN_MESSAGES.ROUTE_NAVIGATE,
      path: cleanPreviewPath(page),
    });
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
    setSelected(null);
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
    const before = snapshotValue(selected, path);
    if (Object.is(before, value)) return;
    const entry: SemanticHistoryEntry = { kind: "semantic", target: selected, scope, device, path, before, after: value };
    setHistory((items) => [...items.slice(-79), entry]);
    setFuture([]);
    applyPatchValue(selected, scope, device, path, value);
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
    try {
      await applyStructureSnapshot(entry.after, entry.pagePath, entry.reload);
      if (!entry.reload) postMediaDocumentDiff(entry.before, entry.after);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Yapısal yineleme uygulanamadı.");
    }
  };

  const save = async (mode: "draft" | "publish") => {
    if (saving) return;
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
      if (mode === "publish") setPublished(persisted);
      toast.success(mode === "publish" ? "Mağaza tasarımı yayınlandı." : "Taslak kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mağaza tasarımı kaydedilemedi.");
    } finally {
      setSaving(null);
    }
  };

  if (loading || !initialSrcRef.current) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#f5f5f3]">
        <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-5 py-4 text-[12px] font-medium shadow-sm">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Mağaza Tasarımı V2.1 hazırlanıyor…
        </div>
      </div>
    );
  }

  return (
    <div data-store-design-v2-admin className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f5f5f3] text-[#111]">
      <header className="z-20 flex h-[58px] shrink-0 items-center gap-3 border-b border-black/10 bg-white px-3 md:px-4">
        <button type="button" onClick={() => setLeftOpen((value) => !value)} className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 hover:bg-black/[0.03]" aria-label="Sol panel">
          <PanelLeft className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[12px] font-semibold">Mağaza Tasarımı V2.1</p>
            <span className="hidden rounded-full bg-black/[0.05] px-2 py-0.5 text-[8px] font-semibold text-black/50 sm:inline">Schema {STORE_DESIGN_SCHEMA_VERSION}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-black/40">
            <CircleDot className={`h-2.5 w-2.5 ${connected ? "text-emerald-600" : "text-amber-500"}`} />
            {connected ? "Önizleme bağlı" : "Önizleme bağlanıyor"}
            <span>· {COMPONENT_REGISTRY.length} semantik hedef</span>
            <span className="hidden md:inline">· {SECTION_LIBRARY.length} bölüm tanımı</span>
          </div>
        </div>

        <div className="flex items-center rounded-lg border border-black/10 bg-[#f7f7f5] p-1">
          <button type="button" onClick={() => setDevice("desktop")} className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[9px] font-medium ${device === "desktop" ? "bg-white shadow-sm" : "text-black/45"}`}>
            <Monitor className="h-3.5 w-3.5" /><span className="hidden sm:inline">Masaüstü</span>
          </button>
          <button type="button" onClick={() => setDevice("mobile")} className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[9px] font-medium ${device === "mobile" ? "bg-white shadow-sm" : "text-black/45"}`}>
            <Smartphone className="h-3.5 w-3.5" /><span className="hidden sm:inline">Mobil</span>
          </button>
        </div>

        <div className="hidden items-center gap-1 md:flex">
          <button type="button" disabled={!history.length || saving !== null} onClick={() => void undo()} className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white hover:bg-black/[0.03] disabled:opacity-30" aria-label="Geri al">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" disabled={!future.length || saving !== null} onClick={() => void redo()} className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white hover:bg-black/[0.03] disabled:opacity-30" aria-label="Yinele">
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <button type="button" onClick={() => setTemplateManagerOpen(true)} className="hidden h-9 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-[9px] font-semibold hover:bg-black/[0.03] lg:flex">
          <LayoutTemplate className="h-3.5 w-3.5" />Template
        </button>
        <button type="button" onClick={() => setMediaOpen(true)} className="hidden h-9 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-[9px] font-semibold hover:bg-black/[0.03] lg:flex">
          <Images className="h-3.5 w-3.5" />Medya
        </button>
        <button type="button" disabled={saving !== null} onClick={() => void save("draft")} className="hidden h-9 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-[9px] font-semibold hover:bg-black/[0.03] disabled:opacity-50 sm:flex">
          <Save className="h-3.5 w-3.5" />{saving === "draft" ? "Kaydediliyor…" : "Taslağı Kaydet"}
        </button>
        <button type="button" disabled={saving !== null} onClick={() => void save("publish")} className="flex h-9 items-center gap-2 rounded-lg bg-[#111] px-3 text-[9px] font-semibold text-white disabled:opacity-50">
          <Send className="h-3.5 w-3.5" />{saving === "publish" ? "Yayınlanıyor…" : "Yayınla"}
        </button>
        <button type="button" onClick={() => setRightOpen((value) => !value)} className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 hover:bg-black/[0.03]" aria-label="Sağ panel">
          <PanelRight className="h-4 w-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        {leftOpen ? (
          <aside className="flex w-[292px] shrink-0 flex-col border-r border-black/10 bg-white max-lg:absolute max-lg:bottom-0 max-lg:left-0 max-lg:top-[58px] max-lg:z-20 max-lg:shadow-2xl">
            <div className="border-b border-black/[0.07] p-3">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-[9px] font-semibold text-black/45">SAYFA</label>
                <div className="flex items-center gap-1">
                  {managedPage ? (
                    <button type="button" onClick={() => setPageManagerMode("edit")} className="flex h-7 items-center gap-1 rounded-md border border-black/10 bg-white px-2 text-[8px] font-semibold hover:bg-black/[0.03]">
                      <Settings2 className="h-3 w-3" />Ayarlar
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setPageManagerMode("create")} className="flex h-7 items-center gap-1 rounded-md bg-[#111] px-2 text-[8px] font-semibold text-white">
                    <Plus className="h-3 w-3" />Yeni Sayfa
                  </button>
                </div>
              </div>
              <div className="relative mt-1.5">
                <select value={activePath} onChange={(event) => void changePage(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-black/10 bg-white px-3 pr-8 text-[11px] font-medium outline-none hover:border-black/20">
                  {groupedPages.map(([group, items]) => (
                    <optgroup key={group} label={group}>
                      {items.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-black/35" />
              </div>
              <p className="mt-2 truncate text-[8px] text-black/35">{activePage?.previewPath || activePage?.path || "/"}</p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <StoreDesignSectionManager
                document={document}
                activePage={activePage}
                compatibility={activeCompatibility}
                onApply={applyStructureDocument}
              />
            </div>
          </aside>
        ) : null}

        <main className="relative flex min-w-0 flex-1 items-center justify-center overflow-auto p-3 md:p-6">
          <div className={`relative shrink-0 overflow-hidden bg-white shadow-[0_18px_60px_rgba(15,23,42,.14)] transition-[width,height,border-radius] duration-300 ${device === "mobile" ? "h-[780px] w-[390px] rounded-[44px] border-[9px] border-[#111]" : "h-[calc(100dvh-106px)] min-h-[620px] w-[min(1180px,calc(100vw-120px))] rounded-xl border border-black/10"}`}>
            {device === "mobile" ? <div className="pointer-events-none absolute left-1/2 top-3 z-10 h-7 w-28 -translate-x-1/2 rounded-full bg-[#111]" /> : null}
            <iframe
              ref={iframeRef}
              title="Store Design V2 Preview"
              src={initialSrcRef.current}
              className={`h-full w-full bg-white ${device === "mobile" ? "rounded-[34px]" : ""}`}
              onLoad={() => {
                setConnected(false);
                setLastHeartbeat(Date.now());
              }}
            />
          </div>
        </main>

        {rightOpen ? (
          <aside className="flex w-[320px] shrink-0 flex-col border-l border-black/10 bg-white max-xl:absolute max-xl:bottom-0 max-xl:right-0 max-xl:top-[58px] max-xl:z-20 max-xl:shadow-2xl">
            <div className="border-b border-black/[0.07] p-3">
              <p className="text-[9px] font-semibold text-black/45">SEMANTİK HEDEF</p>
              {selected ? (
                <>
                  <p className="mt-1.5 text-[12px] font-semibold">{selected.label}</p>
                  <p className="mt-1 text-[8px] text-black/35">{selected.breadcrumb.map((item) => item.label).join(" › ")}</p>
                </>
              ) : (
                <p className="mt-2 text-[9px] leading-4 text-black/40">Önizlemede bir bileşene tıkla; masaüstünde sağ tık, mobilde uzun basma da çalışır.</p>
              )}
            </div>

            {selected ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <section className="border-b border-black/[0.07] p-3">
                  <label className="text-[9px] font-semibold text-black/45">KAPSAM</label>
                  <select value={scope} onChange={(event) => setScope(event.target.value as EditorScope)} className="mt-1.5 h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-[10px] font-medium outline-none">
                    {selected.allowedScopes.map((item) => <option key={item} value={item}>{scopeLabel(item)}</option>)}
                  </select>
                  <p className="mt-1.5 text-[8px] leading-4 text-black/35">Varsayılan: {scopeLabel(selected.defaultScope)}. Dinamik tekrarlar tek karta değil aile/bölüm kapsamına gider.</p>
                </section>

                <section className="border-b border-black/[0.07] p-3">
                  <p className="text-[9px] font-semibold text-black/45">İZİNLİ KONTROLLER</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.controlGroups.map((group) => <span key={group} className="rounded-full border border-black/[0.08] bg-[#f7f7f5] px-2 py-1 text-[8px] font-medium">{group}</span>)}
                  </div>
                </section>

                <section className="border-b border-black/[0.07] p-3">
                  <p className="text-[9px] font-semibold text-black/45">MEVCUT DURUM</p>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-[8px]">
                    <div className="rounded-lg bg-[#f7f7f5] p-2"><dt className="text-black/35">Boyut</dt><dd className="mt-1 font-medium">{selected.current.width || 0} × {selected.current.height || 0}</dd></div>
                    <div className="rounded-lg bg-[#f7f7f5] p-2"><dt className="text-black/35">Görünür</dt><dd className="mt-1 font-medium">{selected.current.visible === false ? "Hayır" : "Evet"}</dd></div>
                    <div className="rounded-lg bg-[#f7f7f5] p-2"><dt className="text-black/35">Opacity</dt><dd className="mt-1 font-medium">{selected.current.opacity ?? 1}</dd></div>
                    <div className="rounded-lg bg-[#f7f7f5] p-2"><dt className="text-black/35">Radius</dt><dd className="mt-1 font-medium">{selected.current.borderRadius ?? 0}px</dd></div>
                  </dl>
                </section>

                <section className="border-b border-black/[0.07] p-3">
                  <p className="text-[9px] font-semibold text-black/45">HIZLI AYARLAR</p>
                  <div className="mt-2 space-y-3">
                    {selected.controlGroups.includes("typography") ? (
                      <label className="grid gap-1.5 text-[8px] text-black/45">
                        Metin hizası
                        <select value={selected.current.textAlign || "left"} onChange={(event) => applyInspectorPatch("textAlign", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] font-medium text-black outline-none">
                          <option value="left">Sol</option>
                          <option value="center">Orta</option>
                          <option value="right">Sağ</option>
                        </select>
                      </label>
                    ) : null}

                    {selected.controlGroups.includes("card") || selected.controlGroups.includes("layout") ? (
                      <label className="grid gap-1.5 text-[8px] text-black/45">
                        Köşe yuvarlaklığı
                        <select value={String(Math.round(selected.current.borderRadius || 0))} onChange={(event) => applyInspectorPatch("borderRadius", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] font-medium text-black outline-none">
                          {[0, 4, 8, 12, 16, 24, 32].map((value) => <option key={value} value={value}>{value === 0 ? "Düz" : `${value}px`}</option>)}
                        </select>
                      </label>
                    ) : null}

                    {selected.controlGroups.includes("media") && selected.current.media ? (
                      <label className="grid gap-1.5 text-[8px] text-black/45">
                        Medya sığdırma
                        <select value={selected.current.media.objectFit || "cover"} onChange={(event) => applyInspectorPatch("media.objectFit", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] font-medium text-black outline-none">
                          <option value="cover">Kapla</option>
                          <option value="contain">Sığdır</option>
                        </select>
                      </label>
                    ) : null}

                    {selected.type === "product-grid" ? (
                      <div className="rounded-xl border border-black/[0.08] bg-[#fafafa] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[8px] font-semibold text-black/55">Responsive ürün grid'i</p>
                          <span className="rounded-full bg-white px-2 py-1 text-[7px] font-semibold text-black/40">{device === "mobile" ? "Mobil" : "Masaüstü"}</span>
                        </div>
                        <div className="mt-3 grid gap-3">
                          <label className="grid gap-1.5 text-[8px] text-black/45">
                            Kolon sayısı
                            <select
                              value={String(selected.current.grid?.columns ?? (device === "mobile" ? 2 : 3))}
                              onChange={(event) => applyInspectorPatch("grid.columns", Number(event.target.value))}
                              className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] font-medium text-black outline-none"
                            >
                              {(device === "mobile" ? [1, 2] : [2, 3, 4, 5, 6]).map((value) => <option key={value} value={value}>{value} kolon</option>)}
                            </select>
                          </label>
                          <label className="grid gap-1.5 text-[8px] text-black/45">
                            Yatay kart aralığı
                            <select
                              value={String(Math.round(selected.current.grid?.gapX ?? (device === "mobile" ? 16 : 20)))}
                              onChange={(event) => applyInspectorPatch("grid.gapX", Number(event.target.value))}
                              className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] font-medium text-black outline-none"
                            >
                              {[0, 8, 12, 16, 20, 24, 32, 40, 48, 64].map((value) => <option key={value} value={value}>{value}px</option>)}
                            </select>
                          </label>
                          <label className="grid gap-1.5 text-[8px] text-black/45">
                            Dikey kart aralığı
                            <select
                              value={String(Math.round(selected.current.grid?.gapY ?? (device === "mobile" ? 32 : 48)))}
                              onChange={(event) => applyInspectorPatch("grid.gapY", Number(event.target.value))}
                              className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] font-medium text-black outline-none"
                            >
                              {[0, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96].map((value) => <option key={value} value={value}>{value}px</option>)}
                            </select>
                          </label>
                          <label className="grid gap-1.5 text-[8px] text-black/45">
                            Grid max genişlik
                            <select
                              value={selected.current.grid?.maxWidth || "none"}
                              onChange={(event) => applyInspectorPatch("grid.maxWidth", event.target.value)}
                              className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] font-medium text-black outline-none"
                            >
                              <option value="none">Container'ı doldur</option>
                              <option value="1200px">1200px</option>
                              <option value="1280px">1280px</option>
                              <option value="1440px">1440px</option>
                              <option value="1600px">1600px</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    ) : null}

                    {selected.type === "product-card" ? (
                      <div className="rounded-xl border border-black/[0.08] bg-[#fafafa] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[8px] font-semibold text-black/55">Ürün kartı ailesi</p>
                          <span className="rounded-full bg-white px-2 py-1 text-[7px] font-semibold text-black/40">{device === "mobile" ? "Mobil" : "Masaüstü"}</span>
                        </div>
                        <div className="mt-3 grid gap-3">
                          <label className="grid gap-1.5 text-[8px] text-black/45">
                            Yoğunluk
                            <select
                              value={selected.current.card?.density || "m"}
                              onChange={(event) => applyInspectorPatch("card.density", event.target.value)}
                              className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] font-medium text-black outline-none"
                            >
                              <option value="s">S · Kompakt</option>
                              <option value="m">M · Dengeli</option>
                              <option value="l">L · Ferah</option>
                            </select>
                          </label>
                          <label className="grid gap-1.5 text-[8px] text-black/45">
                            Görsel oranı
                            <select
                              value={selected.current.card?.imageRatio || "3/4"}
                              onChange={(event) => applyInspectorPatch("card.imageRatio", event.target.value)}
                              className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] font-medium text-black outline-none"
                            >
                              <option value="1/1">1:1</option>
                              <option value="4/5">4:5</option>
                              <option value="3/4">3:4</option>
                            </select>
                          </label>
                          <label className="grid gap-1.5 text-[8px] text-black/45">
                            Başlık satırı
                            <select
                              value={String(selected.current.card?.titleLines ?? 2)}
                              onChange={(event) => applyInspectorPatch("card.titleLines", Number(event.target.value))}
                              className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] font-medium text-black outline-none"
                            >
                              {[1, 2, 3].map((value) => <option key={value} value={value}>{value} satır</option>)}
                            </select>
                          </label>
                          <label className="flex items-center justify-between gap-3 rounded-lg border border-black/[0.08] bg-white p-2.5 text-[8px] font-semibold text-black/50">
                            Fiyatı göster
                            <input
                              type="checkbox"
                              checked={selected.current.card?.showPrice !== false}
                              onChange={(event) => applyInspectorPatch("card.showPrice", event.target.checked)}
                            />
                          </label>
                          <label className="flex items-center justify-between gap-3 rounded-lg border border-black/[0.08] bg-white p-2.5 text-[8px] font-semibold text-black/50">
                            Hızlı sepete ekle
                            <input
                              type="checkbox"
                              checked={selected.current.card?.showQuickAdd !== false}
                              onChange={(event) => applyInspectorPatch("card.showQuickAdd", event.target.checked)}
                            />
                          </label>
                        </div>
                      </div>
                    ) : null}

                    {!selected.controlGroups.includes("typography") && !selected.controlGroups.includes("card") && !selected.controlGroups.includes("layout") && !(selected.controlGroups.includes("media") && selected.current.media) ? (
                      <p className="text-[8px] leading-4 text-black/35">Bu hedefin V2 kontrol şeması registry üzerinden genişletiliyor; korumalı alanlara genel amaçlı CSS kontrolü açılmıyor.</p>
                    ) : null}
                  </div>
                </section>

                {selected.protectedFields.length ? (
                  <section className="p-3">
                    <p className="text-[9px] font-semibold text-black/45">KORUNAN ALANLAR</p>
                    <p className="mt-1.5 text-[8px] leading-4 text-black/38">{selected.protectedFields.join(" · ")}</p>
                  </section>
                ) : null}
              </div>
            ) : (
              <div className="grid flex-1 place-items-center p-6 text-center text-[9px] leading-5 text-black/35">
                DOM etiketi yerine registry’de kayıtlı gerçek bileşenler seçilebilir.
              </div>
            )}

            <div className="border-t border-black/[0.07] p-3">
              <p className="text-[8px] leading-4 text-black/35">
                {hasUnsavedChanges
                  ? "Kaydedilmemiş düzenlemeler var."
                  : hasUnpublishedChanges
                    ? "Taslak kaydedildi; yayınlanan sürümden farklı."
                    : "Taslak ve yayınlanan sürüm eşleşiyor."} Normal düzenlemeler iframe reload etmeden patch protokolüyle ilerler.
              </p>
            </div>
          </aside>
        ) : null}
      </div>

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
          onClose={() => setMediaOpen(false)}
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
    </div>
  );
}
