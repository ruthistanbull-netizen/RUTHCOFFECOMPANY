"use client";

import {
  ChevronDown,
  ChevronRight,
  CircleDot,
  Layers3,
  Monitor,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Save,
  Send,
  Smartphone,
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

const RAW_STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://rostacoffecompany.zeabur.app";
const STOREFRONT_ORIGIN = (() => {
  try { return new URL(RAW_STOREFRONT_URL).origin; }
  catch { return "https://rostacoffecompany.zeabur.app"; }
})();

function previewUrl(path: string) {
  const url = new URL(path || "/", STOREFRONT_ORIGIN);
  url.searchParams.set("themeEditor", "1");
  url.searchParams.set("storeDesignV2", "1");
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

export function StoreDesignV21() {
  const toast = useExactToast();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const initialSrcRef = useRef("");
  const [pages, setPages] = useState<PageItem[]>([]);
  const [activePath, setActivePath] = useState("/");
  const [document, setDocument] = useState<ThemeDocument>(createEmptyThemeDocument());
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

  const dirty = JSON.stringify(document) !== JSON.stringify(published);
  const groupedPages = useMemo(() => groupPages(pages), [pages]);
  const activePage = pages.find((item) => item.path === activePath) || pages[0] || null;

  const postToPreview = useCallback((payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(payload, STOREFRONT_ORIGIN);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      adminRequest<StoreDesignResponse>(`/api/store-design-v2?t=${Date.now()}`, { force: true }),
      adminRequest<{ pages?: PageItem[] }>(`/api/theme-editor-pages?t=${Date.now()}`, { force: true, timeoutMs: 7_000 }),
    ]).then(([themeResult, pageResult]) => {
      if (!active) return;
      const nextDraft = normalizeThemeDocument(themeResult.draft || themeResult.published);
      const nextPublished = normalizeThemeDocument(themeResult.published || themeResult.draft);
      const nextPages = Array.isArray(pageResult.pages) && pageResult.pages.length
        ? pageResult.pages
        : [{ path: "/", label: "Ana Sayfa", group: "Sayfalar" }];

      setDocument(nextDraft);
      setPublished(nextPublished);
      setPages(nextPages);
      setActivePath(nextPages[0]?.path || "/");
      initialSrcRef.current = previewUrl(cleanPreviewPath(nextPages[0] || { path: "/", label: "Ana Sayfa", group: "Sayfalar" }));
      setLoading(false);
    }).catch((error) => {
      if (!active) return;
      setLoading(false);
      toast.error(error instanceof Error ? error.message : "Mağaza tasarımı yüklenemedi.");
    });

    return () => { active = false; };
  }, [toast]);

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
      if (lastHeartbeat && Date.now() - lastHeartbeat > 12_000) setConnected(false);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [lastHeartbeat]);

  const changePage = (path: string) => {
    const page = pages.find((item) => item.path === path);
    if (!page) return;
    setActivePath(path);
    setSelected(null);
    postToPreview({
      type: STORE_DESIGN_MESSAGES.ROUTE_NAVIGATE,
      path: cleanPreviewPath(page),
    });
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
                <select value={activePath} onChange={(event) => changePage(event.target.value)} className="h-10 w-full appearance-none rounded-lg border border-black/10 bg-white px-3 pr-8 text-[11px] font-medium outline-none hover:border-black/20">
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
              onLoad={() => setConnected(false)}
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
                {dirty ? "Taslak ile yayınlanan sürüm farklı." : "Taslak ve yayınlanan sürüm eşleşiyor."} Normal düzenlemeler iframe reload etmeden patch protokolüyle ilerleyecek.
              </p>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
