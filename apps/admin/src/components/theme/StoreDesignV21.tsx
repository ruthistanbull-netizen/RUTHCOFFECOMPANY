"use client";

import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  Layers3,
  Monitor,
  PanelLeft,
  PanelRight,
  Redo2,
  RefreshCw,
  Save,
  Send,
  Smartphone,
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
import { adminRequest } from "@/lib/adminApi";
import { useExactToast } from "@/components/base44-exact/primitives";

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
  };
};

type StoreDesignResponse = {
  draft?: unknown;
  published?: unknown;
  draftUpdatedAt?: string | null;
  publishedUpdatedAt?: string | null;
};

type PatchHistoryEntry = {
  target: SelectedTarget;
  scope: EditorScope;
  device: Device;
  path: string;
  before: unknown;
  after: unknown;
};

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
  return { ...target, current: { ...target.current, [path]: value } };
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
  const templateId = existingPage?.templateId || (page.template ? page.path : `route:${page.path}`);
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
  const [history, setHistory] = useState<PatchHistoryEntry[]>([]);
  const [future, setFuture] = useState<PatchHistoryEntry[]>([]);
  const revisionRef = useRef(0);
  const lastReconnectRef = useRef(0);

  const hasUnsavedChanges = JSON.stringify(document) !== JSON.stringify(savedDraft);
  const hasUnpublishedChanges = JSON.stringify(savedDraft) !== JSON.stringify(published);
  const groupedPages = useMemo(() => groupPages(pages), [pages]);
  const activePage = pages.find((item) => item.path === activePath) || pages[0] || null;

  const postToPreview = useCallback((payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(payload, STOREFRONT_ORIGIN);
  }, []);

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
    ]).then(async ([themeResult, pageResult]) => {
      if (!active) return;
      const nextDraft = normalizeThemeDocument(themeResult.draft || themeResult.published);
      const nextPublished = normalizeThemeDocument(themeResult.published || themeResult.draft);
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
    const page = pages.find((item) => item.path === path);
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
    const entry: PatchHistoryEntry = { target: selected, scope, device, path, before, after: value };
    setHistory((items) => [...items.slice(-79), entry]);
    setFuture([]);
    applyPatchValue(selected, scope, device, path, value);
  };

  const undo = () => {
    const entry = history.at(-1);
    if (!entry) return;
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [...items, entry]);
    applyPatchValue(entry.target, entry.scope, entry.device, entry.path, entry.before);
  };

  const redo = () => {
    const entry = future.at(-1);
    if (!entry) return;
    setFuture((items) => items.slice(0, -1));
    setHistory((items) => [...items, entry]);
    applyPatchValue(entry.target, entry.scope, entry.device, entry.path, entry.after);
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
          <button type="button" disabled={!history.length || saving !== null} onClick={undo} className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white hover:bg-black/[0.03] disabled:opacity-30" aria-label="Geri al">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" disabled={!future.length || saving !== null} onClick={redo} className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 bg-white hover:bg-black/[0.03] disabled:opacity-30" aria-label="Yinele">
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>

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
              <label className="block text-[9px] font-semibold text-black/45">SAYFA</label>
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
              <section className="border-b border-black/[0.07] p-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold"><Layers3 className="h-3.5 w-3.5" /> Sayfa Yapısı</div>
                <div className="mt-2 space-y-1">
                  {["Header", "Sayfa şablonu", "Footer"].map((label, index) => (
                    <button key={label} type="button" className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[10px] hover:bg-black/[0.035]">
                      <ChevronRight className="h-3.5 w-3.5 text-black/30" />
                      <span className="flex-1">{label}</span>
                      <span className="text-[8px] text-black/30">{index === 1 ? "Bölümler" : "Global"}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="p-3">
                <p className="text-[9px] font-semibold text-black/45">BÖLÜM KÜTÜPHANESİ</p>
                <p className="mt-1 text-[8px] leading-4 text-black/35">Registry’deki tüm bölüm tipleri burada tek kaynaktan listeleniyor. Uyumlu sayfa filtresi Page Manager fazıyla bağlanacak.</p>
                <div className="mt-2 space-y-1">
                  {SECTION_LIBRARY.slice(0, 12).map((item) => (
                    <div key={item.type} className="flex min-h-9 items-center gap-2 rounded-lg border border-black/[0.06] px-2.5">
                      <span className="min-w-0 flex-1 truncate text-[9px] font-medium">{item.label}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[7px] font-semibold ${item.implemented ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.04] text-black/35"}`}>
                        {item.implemented ? "Hazır" : "Registry"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
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
    </div>
  );
}
