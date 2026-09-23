"use client";

import { ChevronRight, Layers3, RefreshCw } from "lucide-react";
import { LoadingIndicator, useSaveLifecycle } from "@ruth-commerce/ui";
import { useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";

type PageItem = { path: string; label: string; group: string; previewPath?: string; template?: boolean };
type LiveSection = { id: string; label: string; tag: string; kind: string };
type PageCatalogResponse = { pages?: PageItem[] };

function frame() {
  return document.querySelector("[data-theme-customizer-v4] iframe") as HTMLIFrameElement | null;
}

function normalizePath(value: string) {
  try {
    const url = new URL(value, "https://rostacoffecompany.zeabur.app");
    const path = url.pathname.replace(/\/{2,}/g, "/");
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  } catch {
    return "/";
  }
}

function templatePath(path: string) {
  const clean = normalizePath(path);
  if (/^\/products\/[^/]+$/.test(clean)) return "/products/[slug]";
  if (/^\/(category|categories)\/[^/]+$/.test(clean)) return "/category/[slug]";
  if (/^\/collections\/[^/]+$/.test(clean)) return "/collections/[slug]";
  return clean;
}

function isDynamicPage(path: string) {
  return templatePath(path) !== normalizePath(path);
}

function navigatePreview(path: string) {
  const iframe = frame();
  if (!iframe) return false;
  const current = new URL(iframe.src);
  current.pathname = normalizePath(path);
  current.searchParams.set("themeEditor", "1");
  current.searchParams.set("themePreview", String(Date.now()));
  iframe.src = current.toString();
  return true;
}

function requestSections() {
  frame()?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_PAGE_SECTIONS_REQUEST" }, "*");
}

function editSection(id: string) {
  frame()?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SELECT_REQUEST", id }, "*");
}

function pageDetail(path: string) {
  if (!isDynamicPage(path)) return "";
  const slug = normalizePath(path).split("/").filter(Boolean).pop() || "";
  try { return decodeURIComponent(slug).replace(/-/g, " "); }
  catch { return slug.replace(/-/g, " "); }
}

function syncVisualExactScope(exactPageOnly: boolean) {
  const checkbox = document.querySelector("[data-theme-customizer-v4] > header > div:first-child input[type='checkbox']") as HTMLInputElement | null;
  if (checkbox && checkbox.checked !== exactPageOnly) checkbox.click();
}

export function ThemeEditorPageCoordinator() {
  const { requestTransition } = useSaveLifecycle();
  const [pages, setPages] = useState<PageItem[]>([{ path: "/", label: "Ana Sayfa", group: "Sayfalar" }]);
  const [path, setPath] = useState("/");
  const [sections, setSections] = useState<LiveSection[]>([]);
  const [panelOpen, setPanelOpen] = useState(true);
  const [loadingSections, setLoadingSections] = useState(false);
  const [exactPageOnly, setExactPageOnly] = useState(false);

  const coreManaged = path === "/" || path.startsWith("/pages/");
  const dynamicPage = isDynamicPage(path);
  const selectedValue = templatePath(path);

  useEffect(() => {
    void adminRequest<PageCatalogResponse>(`/api/theme-editor-pages?t=${Date.now()}`, { force: true, timeoutMs: 7_000 })
      .then((result) => {
        if (Array.isArray(result.pages) && result.pages.length) setPages(result.pages);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ruth-theme-page-scope", { detail: { exactPageOnly } }));
    syncVisualExactScope(exactPageOnly);
    const timer = window.setTimeout(() => syncVisualExactScope(exactPageOnly), 120);
    return () => window.clearTimeout(timer);
  }, [exactPageOnly, path]);

  useEffect(() => {
    document.body.classList.toggle("ruth-theme-live-sections", !coreManaged);
    return () => document.body.classList.remove("ruth-theme-live-sections");
  }, [coreManaged]);

  useEffect(() => {
    if (coreManaged) return;
    setLoadingSections(true);
    setSections([]);
    const timer = window.setTimeout(() => requestSections(), 140);
    const fallback = window.setTimeout(() => setLoadingSections(false), 1_800);
    return () => { window.clearTimeout(timer); window.clearTimeout(fallback); };
  }, [coreManaged, path]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const source = frame()?.contentWindow;
      if (source && event.source !== source) return;
      if (!event.data || typeof event.data !== "object") return;
      if ((event.data.type === "RUTH_THEME_EDITOR_READY" || event.data.type === "RUTH_THEME_EDITOR_NAVIGATED") && typeof event.data.pathname === "string") {
        const next = normalizePath(event.data.pathname);
        setPath(next);
        setExactPageOnly(false);
        setPanelOpen(true);
        if (next !== "/" && !next.startsWith("/pages/")) window.setTimeout(() => requestSections(), 100);
      }
      if (event.data.type === "RUTH_THEME_EDITOR_PAGE_SECTIONS" && Array.isArray(event.data.items)) {
        setSections(event.data.items as LiveSection[]);
        setLoadingSections(false);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const iframe = frame();
      if (!iframe?.src) return;
      try {
        const next = normalizePath(new URL(iframe.src).pathname);
        setPath((current) => current === next ? current : next);
      } catch {}
    }, 450);
    return () => window.clearInterval(timer);
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, PageItem[]>();
    for (const item of pages) {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    }
    if (!pages.some((item) => item.path === selectedValue) && !isDynamicPage(path)) {
      const list = map.get("Açık Sayfa") || [];
      list.push({ path, label: `Açık Sayfa · ${path}`, group: "Açık Sayfa" });
      map.set("Açık Sayfa", list);
    }
    return [...map.entries()];
  }, [pages, path, selectedValue]);

  const changePage = (selectedPath: string) => {
    const item = pages.find((candidate) => candidate.path === selectedPath);
    const source = item?.previewPath || (item?.template ? "" : selectedPath);
    if (!source) return;
    const next = normalizePath(source);

    void requestTransition(() => {
      setPath(next);
      setExactPageOnly(false);
      setPanelOpen(true);
      setSections([]);
      if (!navigatePreview(next)) window.setTimeout(() => navigatePreview(next), 180);
    });
  };

  const refreshSections = () => {
    if (loadingSections) return;
    setLoadingSections(true);
    requestSections();
  };

  return (
    <>
      <style>{`
        [data-theme-editor-immersive-root] > a[aria-label='Panele dön']{display:none!important}
        [data-theme-customizer-v4] > header > div:first-child{visibility:hidden!important}
        body.ruth-theme-live-sections [data-theme-sections-panel],
        body.ruth-theme-live-sections [data-theme-sections-launcher]{display:none!important}
      `}</style>

      <div data-theme-editor-page-coordinator className="fixed left-0 top-0 z-[2147483610] flex h-[70px] w-[390px] items-center border-r border-b border-black/10 bg-white px-4 max-md:h-[70px] max-md:w-[calc(100vw-176px)] max-md:border-r-0 max-md:px-2">
        <div className="min-w-0 flex-1">
          <select
            value={selectedValue}
            onChange={(event) => changePage(event.target.value)}
            className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-[12px] font-semibold outline-none hover:border-black/20 max-md:h-8 max-md:text-[10px]"
            aria-label="Düzenlenecek sayfa"
          >
            {grouped.map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}
              </optgroup>
            ))}
          </select>
          {dynamicPage ? (
            <label className="mt-1 flex cursor-pointer items-center gap-2 truncate text-[9px] text-black/50">
              <input type="checkbox" checked={exactPageOnly} onChange={(event) => setExactPageOnly(event.target.checked)} className="h-3.5 w-3.5 shrink-0 accent-[#C9A23A]" />
              <span className="shrink-0">Sadece bu sayfayı düzenle</span>
              <span className="truncate text-black/28 max-md:hidden">· {pageDetail(path)}</span>
            </label>
          ) : null}
        </div>
      </div>

      {!coreManaged && panelOpen ? (
        <aside className="fixed bottom-0 left-0 top-[70px] z-[2147483595] flex w-[390px] flex-col border-r border-black/10 bg-white shadow-xl max-md:top-auto max-md:h-[52dvh] max-md:w-full max-md:border-r-0 max-md:border-t">
          <header className="flex h-[54px] shrink-0 items-center gap-2 border-b border-black/[0.08] px-3">
            <Layers3 className="ml-1 h-4 w-4 text-black/55" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold">Bölümler · {sections.length}</p>
              <p className="mt-0.5 truncate text-[9px] text-black/38">{dynamicPage ? `${selectedValue} şablonu` : path}</p>
            </div>
            <button
              type="button"
              onClick={refreshSections}
              disabled={loadingSections}
              className="grid h-8 w-8 place-items-center rounded-md hover:bg-black/[0.04] disabled:cursor-wait disabled:opacity-60"
              aria-label="Bölümleri yenile"
              aria-busy={loadingSections || undefined}
            >
              {loadingSections ? <LoadingIndicator size="sm" /> : <RefreshCw className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => setPanelOpen(false)} className="h-8 rounded-md border border-black/10 px-3 text-[9px]">Kapat</button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {sections.length ? <div className="space-y-2">{sections.map((section, index) => (
              <button
                key={section.id}
                type="button"
                onClick={() => { editSection(section.id); setPanelOpen(false); }}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-md border border-black/[0.08] bg-white px-3 text-left hover:border-[#C9A23A]/35 hover:bg-[#fffaf0]"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#f6edcf] text-[9px] font-semibold text-[#8f6e1f]">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[10px] font-medium">{section.label}</b>
                  <small className="mt-0.5 block text-[8px] text-black/35">Bölümü düzenle</small>
                </span>
                <ChevronRight className="h-4 w-4 text-black/25" />
              </button>
            ))}</div> : (
              <div className="rounded-md border border-dashed border-black/12 bg-[#fafafa] p-4 text-center text-[10px] leading-5 text-black/50">
                {loadingSections ? "Sayfadaki bölümler okunuyor…" : "Bu sayfada ayrı bir bölüm bulunamadı. Önizlemedeki öğelere tıklayarak yine düzenleyebilirsin."}
              </div>
            )}
          </div>
        </aside>
      ) : null}

      {!coreManaged && !panelOpen ? (
        <button type="button" onClick={() => { setPanelOpen(true); setLoadingSections(true); requestSections(); }} className="fixed bottom-[66px] left-3 z-[2147483595] flex h-9 items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-[10px] font-semibold shadow-sm max-md:bottom-3 max-md:bottom-3"><Layers3 className="h-4 w-4" />Bölümler</button>
      ) : null}
    </>
  );
}
