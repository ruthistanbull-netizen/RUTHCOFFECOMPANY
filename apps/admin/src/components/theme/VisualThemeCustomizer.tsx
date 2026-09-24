"use client";

import {
  ArrowLeft,
  ChevronRight,
  Image as ImageIcon,
  Link2,
  Monitor,
  MousePointer2,
  Palette,
  RefreshCw,
  Save,
  Smartphone,
  Type,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSaveLifecycle, useSaveLifecycleSource } from "@ruth-commerce/ui";
import { adminRequest } from "@/lib/adminApi";
import {
  defaultThemeCustomizerSettings,
  normalizeThemeCustomizerSettings,
  removeThemeElementOverride,
  themePage,
  themePageKey,
  upsertThemeElementOverride,
  type ThemeCustomizerSettings,
  type ThemeDeviceStyle,
  type ThemeElementOverride,
} from "@/lib/themeCustomizer";
import {
  homepageHeroDeviceForElement,
  homepageHeroDeviceImage,
  isHomepageHeroElement,
  normalizeThemeMediaSettings,
  setHomepageHeroDeviceImage,
  type HomepageHeroDevice,
} from "@/lib/themeMedia";
import { uploadThemeImage } from "@/lib/themeImageUpload";
import { ThemeImageInput } from "@/components/theme/ThemeImageInput";
import { useExactToast } from "@/components/base44-exact/primitives";

type Device = "desktop" | "mobile";
type SideView = "quick" | "home" | "theme";
type PageItem = { path: string; label: string; group: string; previewPath?: string };
type SelectedElement = {
  id: string;
  selector: string;
  label: string;
  tag: string;
  scope?: "global" | "page";
  kind: ThemeElementOverride["kind"];
  text?: string;
  textEditable?: boolean;
  imageSrc?: string;
  mediaType?: "image" | "video";
  href?: string;
  metrics?: {
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

type ContextPoint = { x: number; y: number; viewportWidth: number; viewportHeight: number };
type ContextRequest = { id: string; point: ContextPoint };
type MenuPosition = { x: number; y: number };

const RAW_STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://rostacoffecompany.zeabur.app";
const STOREFRONT_URL = RAW_STOREFRONT_URL
  .replace(/^https:\/\/ruthistanbul\.com(?=\/|$)/, "https://rostacoffecompany.zeabur.app")
  .replace(/\/$/, "");
const THEME_IMAGE_ACCEPT = "image/*,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif";
const THEME_MEDIA_ACCEPT = "image/*,video/*,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif,.mp4,.m4v,.mov,.webm";

function mediaTypeForFile(file: File): "image" | "video" {
  return file.type.startsWith("video/") || /\.(mp4|m4v|mov|webm)$/i.test(file.name || "") ? "video" : "image";
}
const FALLBACK_PAGES: PageItem[] = [
  { path: "/", label: "Ana Sayfa", group: "Mağaza" },
  { path: "/products", label: "Tüm Ürünler", group: "Mağaza" },
  { path: "/categories", label: "Kategoriler", group: "Mağaza" },
  { path: "/collections", label: "Koleksiyonlar", group: "Mağaza" },
  { path: "/about", label: "Hakkımızda", group: "Sayfalar" },
  { path: "/contact", label: "İletişim", group: "Sayfalar" },
  { path: "/faq", label: "S.S.S.", group: "Sayfalar" },
  { path: "/shipping-returns", label: "Kargo / İade", group: "Sayfalar" },
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function fieldClass() {
  return "h-10 w-full rounded-xl border border-black/10 bg-[#fafafa] px-3 text-[11px] outline-none transition focus:border-[#b28c43]/55 focus:bg-white";
}

function panelCard() {
  return "rounded-2xl border border-black/[0.08] bg-white p-3 shadow-[0_1px_0_rgba(0,0,0,.02)]";
}

function cleanPath(value: string) {
  try {
    const url = new URL(value, STOREFRONT_URL);
    const path = url.pathname.replace(/\/{2,}/g, "/");
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  } catch {
    return "/";
  }
}

function groupedPages(pages: PageItem[]) {
  const groups = new Map<string, PageItem[]>();
  for (const page of pages) {
    groups.set(page.group || "Sayfalar", [...(groups.get(page.group || "Sayfalar") || []), page]);
  }
  return [...groups.entries()];
}

function UploadCard({ title, value, busy, onFile }: { title: string; value: string; busy: boolean; onFile: (file: File) => void }) {
  return (
    <div className="min-w-0 rounded-xl border border-black/[0.08] bg-[#fafafa] p-2.5">
      <p className="mb-2 text-[9px] font-semibold">{title}</p>
      <div className="aspect-[4/3] overflow-hidden rounded-lg border border-black/[0.06] bg-white">
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-black/20"><ImageIcon className="h-5 w-5" /></div>
        )}
      </div>
      <ThemeImageInput busy={busy} hasValue={Boolean(value)} onFile={onFile} />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex h-11 items-center gap-2 rounded-xl border border-black/[0.08] bg-[#fafafa] px-3">
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-7 w-8 border-0 bg-transparent p-0" />
      <span className="min-w-0 flex-1 text-[10px] font-medium">{label}</span>
      <span className="text-[8px] uppercase text-black/35">{value}</span>
    </label>
  );
}

export function VisualThemeCustomizer() {
  const toast = useExactToast();
  const saveLifecycle = useSaveLifecycle();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingContextRef = useRef<ContextRequest | null>(null);
  const [settings, setSettings] = useState<ThemeCustomizerSettings>(defaultThemeCustomizerSettings);
  const [saved, setSaved] = useState<ThemeCustomizerSettings>(defaultThemeCustomizerSettings);
  const [pages, setPages] = useState<PageItem[]>(FALLBACK_PAGES);
  const [path, setPath] = useState("/");
  const [device, setDevice] = useState<Device>("desktop");
  const [sideView, setSideView] = useState<SideView>("home");
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [nonce, setNonce] = useState(Date.now());

  const canonicalSettings = useMemo(() => normalizeThemeMediaSettings(settings), [settings]);
  const dirty = JSON.stringify(canonicalSettings) !== JSON.stringify(saved);
  const pageKey = themePageKey(path);
  const targetPage = selected?.scope === "global" ? "/__global__" : pageKey;
  const selectedOverride = selected
    ? themePage(settings, targetPage).overrides.find((item) => item.id === selected.id) || null
    : null;

  const sendSettings = useCallback((next: ThemeCustomizerSettings) => {
    iframeRef.current?.contentWindow?.postMessage({
      type: "RUTH_THEME_EDITOR_SETTINGS",
      settings: normalizeThemeMediaSettings(next),
      revision: Date.now(),
    }, "*");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [themeResult, pageResult] = await Promise.all([
        adminRequest<{ settings?: unknown }>(`/api/theme?editor=${Date.now()}`, { force: true }),
        adminRequest<{ pages?: PageItem[] }>(`/api/theme-editor-pages?editor=${Date.now()}`, { force: true, timeoutMs: 7000 })
          .catch(() => ({ pages: FALLBACK_PAGES })),
      ]);
      const next = normalizeThemeMediaSettings(normalizeThemeCustomizerSettings(themeResult.settings));
      setSettings(next);
      setSaved(next);
      if (Array.isArray(pageResult.pages) && pageResult.pages.length) setPages(pageResult.pages);
      setNonce(Date.now());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mağaza tasarımı yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!loading) sendSettings(settings); }, [loading, sendSettings, settings]);

  const publish = useCallback(async () => {
    try {
      const nextToSave = normalizeThemeMediaSettings(settings);
      const result = await adminRequest<{ settings?: unknown; warning?: string }>("/api/theme", {
        method: "PUT",
        body: JSON.stringify({ settings: nextToSave }),
        confirmation: false,
      });
      const persisted = normalizeThemeMediaSettings(normalizeThemeCustomizerSettings(result.settings || nextToSave));
      setSettings(persisted);
      setSaved(persisted);
      setNonce(Date.now());
      if (result.warning) toast.success(`Kaydedildi. ${result.warning}`);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Değişiklikler kaydedilemedi.");
      return false;
    }
  }, [settings, toast]);

  const discard = useCallback(() => {
    setSettings(saved);
    sendSettings(saved);
    setSelected(null);
    setMenu(null);
  }, [saved, sendSettings]);

  useSaveLifecycleSource({ id: "theme-visual-customizer", dirty, save: publish, discard });

  useEffect(() => {
    if (!menu) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-ruth-theme-context-menu]")) return;
      setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  const baseOverride = useCallback((current: ThemeCustomizerSettings) => {
    if (!selected) return null;
    return themePage(current, targetPage).overrides.find((item) => item.id === selected.id) || {
      id: selected.id,
      selector: selected.selector,
      label: selected.label,
      tag: selected.tag,
      kind: selected.kind || "other",
      hidden: false,
      desktop: {},
      mobile: {},
    } satisfies ThemeElementOverride;
  }, [selected, targetPage]);

  const patchOverride = useCallback((patch: Partial<ThemeElementOverride>) => {
    if (!selected) return;
    setSettings((current) => {
      const base = baseOverride(current);
      if (!base) return current;
      return upsertThemeElementOverride(current, targetPage, { ...base, ...patch });
    });
  }, [baseOverride, selected, targetPage]);

  const patchDeviceStyle = useCallback((patch: Partial<ThemeDeviceStyle>) => {
    if (!selected) return;
    setSettings((current) => {
      const base = baseOverride(current);
      if (!base) return current;
      const deviceStyle = device === "mobile" ? base.mobile : base.desktop;
      return upsertThemeElementOverride(current, targetPage, {
        ...base,
        [device]: { ...(deviceStyle || {}), ...patch },
      });
    });
  }, [baseOverride, device, selected, targetPage]);

  const resetSelectedOverride = useCallback(() => {
    if (!selected) return;
    setSettings((current) => removeThemeElementOverride(current, targetPage, selected.id));
    setMenu(null);
  }, [selected, targetPage]);

  const persistHeroImage = useCallback(async (heroDevice: HomepageHeroDevice, src: string) => {
    const nextToSave = normalizeThemeMediaSettings(setHomepageHeroDeviceImage(settings, heroDevice, src));

    setSettings(nextToSave);
    sendSettings(nextToSave);

    const result = await adminRequest<{ settings?: unknown; warning?: string }>("/api/theme", {
      method: "PUT",
      body: JSON.stringify({ settings: nextToSave }),
      confirmation: false,
    });
    const persisted = normalizeThemeMediaSettings(normalizeThemeCustomizerSettings(result.settings || nextToSave));
    if (homepageHeroDeviceImage(persisted, heroDevice) !== src) {
      throw new Error(`${heroDevice === "desktop" ? "Masaüstü" : "Mobil"} hero görseli veritabanına doğru URL ile kaydedilemedi.`);
    }

    setSettings(persisted);
    setSaved(persisted);
    sendSettings(persisted);
    setNonce(Date.now());
    if (result.warning) toast.warning(`Hero kaydedildi. ${result.warning}`);
    else toast.success(`${heroDevice === "desktop" ? "Masaüstü" : "Mobil"} hero görseli değiştirildi ve yayınlandı.`);
  }, [sendSettings, settings, toast]);

  const uploadHero = async (heroDevice: HomepageHeroDevice, file: File) => {
    setUploading(`hero-${heroDevice}`);
    try {
      const src = await uploadThemeImage(file);
      await persistHeroImage(heroDevice, src);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Hero görseli yüklenemedi.");
    } finally {
      setUploading(null);
    }
  };

  const uploadScroll = async (index: number, file: File) => {
    setUploading(`scroll-${index}`);
    try {
      const src = await uploadThemeImage(file);
      setSettings((current) => ({
        ...current,
        homepageImages: {
          ...current.homepageImages,
          scrollImages: current.homepageImages.scrollImages.map((item, itemIndex) => itemIndex === index ? src : item),
        },
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Görsel yüklenemedi.");
    } finally {
      setUploading(null);
    }
  };

  const uploadSelectedImage = async (file: File) => {
    if (!selected) return;
    setUploading("selected");
    try {
      const mediaType = mediaTypeForFile(file);
      const src = await uploadThemeImage(file);

      if (isHomepageHeroElement(path, selected.id) && mediaType === "image") {
        const selectedDevice = homepageHeroDeviceForElement(selected.id) || device;
        await persistHeroImage(selectedDevice, src);
      }

      setSettings((current) => {
        const base = baseOverride(current);
        if (!base) return current;
        return upsertThemeElementOverride(current, targetPage, {
          ...base,
          imageSrc: src,
          mediaType,
          kind: "image",
        });
      });
      setSelected((current) => current ? { ...current, tag: mediaType === "video" ? "video" : "img", mediaType, imageSrc: src } : current);
      iframeRef.current?.contentWindow?.postMessage({
        type: "RUTH_THEME_EDITOR_MEDIA_OVERRIDE",
        id: selected.id,
        selector: selected.selector,
        imageSrc: src,
        src,
        mediaType,
      }, "*");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fotoğraf veya video yüklenemedi.");
    } finally {
      setUploading(null);
    }
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || !event.data || typeof event.data !== "object") return;
      const message = event.data as Record<string, any>;

      if (message.type === "RUTH_THEME_EDITOR_CONTEXT_REQUEST" && typeof message.id === "string" && message.point) {
        setMenu(null);
        pendingContextRef.current = { id: message.id, point: message.point as ContextPoint };
        iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SELECT_REQUEST", id: message.id, scroll: false }, "*");
        return;
      }

      if (message.type === "RUTH_THEME_EDITOR_RESIZE" && typeof message.id === "string" && selected?.id === message.id) {
        const width = Number(message.width);
        const height = Number(message.height);
        const targetDevice: Device = message.device === "mobile" ? "mobile" : "desktop";
        if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          setSettings((current) => {
            const base = baseOverride(current);
            if (!base) return current;
            const currentStyle = targetDevice === "mobile" ? base.mobile : base.desktop;
            return upsertThemeElementOverride(current, targetPage, {
              ...base,
              [targetDevice]: {
                ...(currentStyle || {}),
                width: Math.round(width),
                widthUnit: "px",
                height: Math.round(height),
                heightUnit: "px",
              },
            });
          });
          setSelected((current) => current ? {
            ...current,
            metrics: current.metrics ? { ...current.metrics, width: Math.round(width), height: Math.round(height) } : current.metrics,
          } : current);
        }
        return;
      }

      if (message.type === "RUTH_THEME_EDITOR_SELECT" && message.element) {
        const next = message.element as SelectedElement;
        setSelected(next);
        const pending = pendingContextRef.current;
        if (pending?.id === next.id && iframeRef.current) {
          const rect = iframeRef.current.getBoundingClientRect();
          const scaleX = rect.width / Math.max(1, pending.point.viewportWidth);
          const scaleY = rect.height / Math.max(1, pending.point.viewportHeight);
          const requestedX = rect.left + pending.point.x * scaleX;
          const requestedY = rect.top + pending.point.y * scaleY;
          setMenu({
            x: Math.max(10, Math.min(window.innerWidth - 274, requestedX)),
            y: Math.max(70, Math.min(Math.max(70, window.innerHeight - 470), requestedY)),
          });
          pendingContextRef.current = null;
        }
        return;
      }

      if ((message.type === "RUTH_THEME_EDITOR_READY" || message.type === "RUTH_THEME_EDITOR_NAVIGATED") && typeof message.pathname === "string") {
        const nextPath = themePageKey(message.pathname);
        setPath(nextPath);
        if (message.type === "RUTH_THEME_EDITOR_READY") window.setTimeout(() => sendSettings(settings), 20);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [baseOverride, selected?.id, sendSettings, settings, targetPage]);

  const setPage = (nextPath: string) => {
    const page = pages.find((item) => item.path === nextPath);
    if (!page) return;
    void saveLifecycle.requestTransition(() => {
      const clean = cleanPath(page.previewPath || page.path);
      setPath(clean);
      setSelected(null);
      setMenu(null);
      const url = new URL(`${STOREFRONT_URL}${clean}`);
      url.searchParams.set("themeEditor", "1");
      url.searchParams.set("themePreview", String(Date.now()));
      if (iframeRef.current) iframeRef.current.src = url.toString();
    });
  };

  const previewUrl = `${STOREFRONT_URL}${path === "/" ? "/" : path}?themeEditor=1&themePreview=${nonce}`;
  const selectedDeviceStyle = device === "mobile" ? selectedOverride?.mobile : selectedOverride?.desktop;
  const selectedMetrics = selected?.metrics;
  const numberStyle = (key: keyof ThemeDeviceStyle, fallback: number) => {
    const value = selectedDeviceStyle?.[key];
    return typeof value === "number" ? value : fallback;
  };

  return (
    <div className="fixed inset-0 z-[90] flex min-h-0 flex-col bg-[#eceef1]" data-theme-customizer-v4>
      <style>{`
        [data-ruth-theme-context-menu] section { padding: 8px !important; }
        [data-ruth-theme-context-menu] section > p,
        [data-ruth-theme-context-menu] section > span { margin-bottom: 5px !important; }
        [data-ruth-theme-context-menu] input:not([type="range"]):not([type="color"]),
        [data-ruth-theme-context-menu] select { height: 30px !important; min-height: 30px !important; font-size: 8px !important; border-radius: 8px !important; }
        [data-ruth-theme-context-menu] textarea { min-height: 58px !important; padding: 7px !important; font-size: 8px !important; line-height: 1.35 !important; border-radius: 8px !important; }
        [data-ruth-theme-context-menu] label > span { font-size: 7.5px !important; }
        [data-ruth-theme-context-menu] input[type="range"] { height: 14px !important; }
        [data-ruth-theme-context-menu] button { min-height: 30px; }
      `}</style>
      <header className="flex h-[64px] shrink-0 items-center border-b border-black/10 bg-[#fbf8f3] px-3 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <a href="/" aria-label="Panele dön" className="grid h-9 w-9 place-items-center rounded-xl border border-black/[0.08] bg-white shadow-sm"><ArrowLeft className="h-4 w-4" /></a>
          <div className="hidden sm:block"><p className="text-[12px] font-semibold">Mağaza Tasarımı</p><p className="mt-0.5 text-[8px] text-black/35">Sağ tıkla · mobilde basılı tutarak düzenle</p></div>
        </div>

        <div className="mx-2 flex min-w-0 flex-[1.5] items-center justify-center gap-2">
          <select value={pages.some((item) => item.path === path) ? path : pages[0]?.path || "/"} onChange={(event) => setPage(event.target.value)} className="h-9 w-full max-w-[330px] rounded-xl border border-black/10 bg-white px-3 text-[10px] font-medium outline-none">
            {groupedPages(pages).map(([group, items]) => <optgroup key={group} label={group}>{items.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</optgroup>)}
          </select>
          <div className="flex rounded-xl bg-black/[0.05] p-1">
            <button type="button" aria-label="Masaüstü önizleme" onClick={() => setDevice("desktop")} className={cx("grid h-7 w-8 place-items-center rounded-lg", device === "desktop" ? "bg-white shadow-sm" : "text-black/35")}><Monitor className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="Mobil önizleme" onClick={() => setDevice("mobile")} className={cx("grid h-7 w-8 place-items-center rounded-lg", device === "mobile" ? "bg-white shadow-sm" : "text-black/35")}><Smartphone className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          {dirty ? <button type="button" onClick={discard} disabled={saveLifecycle.saving} className="hidden h-9 rounded-xl border border-black/10 bg-white px-3 text-[9px] font-medium sm:inline-flex sm:items-center">Geri al</button> : null}
          <button type="button" onClick={() => void saveLifecycle.save()} disabled={!dirty || saveLifecycle.saving || loading} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#211a08] px-3.5 text-[9px] font-semibold text-white disabled:opacity-35">
            {saveLifecycle.saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Kaydet
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          aria-hidden="true"
          style={{ display: "none" }}
          className="h-0 w-0 overflow-hidden"
        >
          <div className="grid grid-cols-3 gap-1 border-b border-black/[0.07] p-2">
            <button type="button" onClick={() => setSideView("quick")} className={cx("h-9 rounded-lg text-[9px] font-medium", sideView === "quick" ? "bg-white shadow-sm" : "text-black/45")}>Hızlı düzenle</button>
            <button type="button" onClick={() => setSideView("home")} className={cx("h-9 rounded-lg text-[9px] font-medium", sideView === "home" ? "bg-white shadow-sm" : "text-black/45")}>Anasayfa</button>
            <button type="button" onClick={() => setSideView("theme")} className={cx("h-9 rounded-lg text-[9px] font-medium", sideView === "theme" ? "bg-white shadow-sm" : "text-black/45")}>Tema</button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading ? <div className="grid h-full place-items-center"><RefreshCw className="h-5 w-5 animate-spin text-black/30" /></div> : null}

            {!loading && sideView === "quick" ? (
              <div className="space-y-3">
                <div className={panelCard()}><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f1e9d4] text-[#7b5c1e]"><MousePointer2 className="h-4 w-4" /></span><div><p className="text-[10px] font-semibold">Önizlemeden düzenle</p><p className="mt-1 text-[9px] leading-4 text-black/45">Masaüstünde sağ tıkla, mobilde uzun bas. Görsel, yazı, bağlantı, buton ve bölüm için yalnız o öğeye ait ayarlar tıkladığın yerde açılır.</p></div></div></div>
              </div>
            ) : null}

            {!loading && sideView === "home" ? (
              path === "/" ? (
                <div className="space-y-3">
                  <div className={panelCard()}>
                    <div className="mb-3"><p className="text-[10px] font-semibold">Ana hero görselleri</p><p className="mt-1 text-[8px] leading-4 text-black/40">Masaüstü ve mobil görseller ayrı kaydedilir. İki cihaz da gerçek img kaynağı kullanır; desktop srcSet kullanılmaz.</p></div>
                    <div className="grid grid-cols-2 gap-2">
                      <UploadCard title="Masaüstü" value={homepageHeroDeviceImage(settings, "desktop")} busy={uploading === "hero-desktop"} onFile={(file) => void uploadHero("desktop", file)} />
                      <UploadCard title="Mobil" value={homepageHeroDeviceImage(settings, "mobile")} busy={uploading === "hero-mobile"} onFile={(file) => void uploadHero("mobile", file)} />
                    </div>
                  </div>
                  <div className={panelCard()}>
                    <p className="mb-3 text-[10px] font-semibold">Kayan görseller</p>
                    <div className="grid grid-cols-2 gap-2">{settings.homepageImages.scrollImages.map((src, index) => <UploadCard key={index} title={`Görsel ${index + 1}`} value={src} busy={uploading === `scroll-${index}`} onFile={(file) => void uploadScroll(index, file)} />)}</div>
                  </div>
                </div>
              ) : <div className="rounded-xl border border-dashed border-black/15 p-4 text-center text-[9px] text-black/40">Anasayfa fotoğrafları için Ana Sayfa’yı seç.</div>
            ) : null}

            {!loading && sideView === "theme" ? (
              <div className="space-y-3">
                <div className={panelCard()}><p className="mb-3 text-[10px] font-semibold">Site renkleri</p><div className="space-y-2"><ColorField label="Ana arka plan" value={settings.colors.ivory} onChange={(ivory) => setSettings((current) => ({ ...current, colors: { ...current.colors, ivory } }))} /><ColorField label="İkincil arka plan" value={settings.colors.cream} onChange={(cream) => setSettings((current) => ({ ...current, colors: { ...current.colors, cream } }))} /><ColorField label="Ana yazı" value={settings.colors.ink} onChange={(ink) => setSettings((current) => ({ ...current, colors: { ...current.colors, ink } }))} /><ColorField label="Vurgu" value={settings.colors.gold} onChange={(gold) => setSettings((current) => ({ ...current, colors: { ...current.colors, gold } }))} /></div></div>
                <div className={panelCard()}><p className="mb-2 text-[10px] font-semibold">WhatsApp</p><label className="block"><span className="mb-1 block text-[8px] text-black/40">Buton yazısı</span><input value={settings.whatsapp.label} onChange={(event) => setSettings((current) => ({ ...current, whatsapp: { ...current.whatsapp, label: event.target.value } }))} className={fieldClass()} /></label><label className="mt-2 block"><span className="mb-1 block text-[8px] text-black/40">Telefon</span><input value={settings.whatsapp.phone} onChange={(event) => setSettings((current) => ({ ...current, whatsapp: { ...current.whatsapp, phone: event.target.value.replace(/\D/g, "") } }))} className={fieldClass()} /></label></div>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#e9ebee] p-3 md:p-4">
          <div className={cx("relative overflow-hidden bg-white shadow-[0_10px_40px_rgba(15,23,42,.08)] transition-all duration-300", device === "mobile" ? "h-full max-h-[820px] w-[430px] max-w-full rounded-[24px] border border-black/10" : "h-full w-full rounded-xl border border-black/[0.08]")}>
            <iframe ref={iframeRef} key={`${path}-${nonce}`} src={previewUrl} title="Mağaza önizleme" className="h-full w-full border-0 bg-white" onLoad={() => window.setTimeout(() => sendSettings(settings), 40)} />
          </div>
        </main>
      </div>

      {menu && selected ? (
        <div
          className="fixed z-[2147483640] w-[264px] max-w-[calc(100vw-20px)] max-h-[min(460px,calc(100vh-78px))] overflow-y-auto rounded-xl border border-black/10 bg-white shadow-[0_18px_46px_rgba(15,23,42,.22)]"
          style={{ left: menu.x, top: menu.y }}
          data-ruth-theme-editor-ui
          data-ruth-theme-context-menu
        >
          <div className="sticky top-0 z-10 border-b border-black/[0.06] bg-white/95 px-2.5 py-2 backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold">{selected.label}</p>
                <p className="mt-0.5 text-[8px] text-black/35">{selected.tag} · {selected.kind} · {device === "mobile" ? "Mobil" : "Masaüstü"}</p>
              </div>
              <button type="button" onClick={() => setMenu(null)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[14px] text-black/35 hover:bg-black/[0.04] hover:text-black">×</button>
            </div>
          </div>

          {selected.kind === "image" ? (
            <section className="border-b border-black/[0.06] p-3">
              <p className="mb-2 text-[9px] font-semibold">Medya</p>
              {selected.imageSrc ? (
                <div className="mb-2 h-[68px] overflow-hidden rounded-lg border border-black/[0.06] bg-[#f6f6f4]">
                  {(selectedOverride?.mediaType || selected.mediaType || (selected.tag === "video" ? "video" : "image")) === "video" ? (
                    <video src={selectedOverride?.imageSrc || selected.imageSrc} muted playsInline className="h-full w-full object-cover" />
                  ) : (
                    <img src={selectedOverride?.imageSrc || selected.imageSrc} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
              ) : null}
              <label className={cx("relative flex h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-black/[0.09] bg-[#fafafa] text-[9px] font-medium hover:bg-white", uploading === "selected" && "pointer-events-none opacity-40")}>
                <ImageIcon className="h-3.5 w-3.5" />{uploading === "selected" ? "Yükleniyor…" : "Fotoğraf / video değiştir"}
                <input
                  type="file"
                  accept={THEME_MEDIA_ACCEPT}
                  disabled={uploading === "selected"}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void uploadSelectedImage(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[8px] font-medium text-black/45">Doldurma</span>
                  <select
                    value={selectedDeviceStyle?.objectFit || selectedMetrics?.objectFit || "cover"}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => patchDeviceStyle({ objectFit: event.target.value as ThemeDeviceStyle["objectFit"] })}
                    className="h-9 w-full cursor-pointer rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none"
                  >
                    <option value="cover">Kırp / doldur</option>
                    <option value="contain">Tamamını göster</option>
                    <option value="fill">Esnet</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] font-medium text-black/45">Köşe</span>
                  <input type="number" min={0} max={1000} value={Math.round(numberStyle("borderRadius", selectedMetrics?.borderRadius || 0))} onChange={(event) => patchDeviceStyle({ borderRadius: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none" />
                </label>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[8px] text-black/45"><span>Yatay odak</span><span>{Math.round(numberStyle("objectPositionX", selectedMetrics?.objectPositionX ?? 50))}%</span></div>
                <input type="range" min={0} max={100} value={numberStyle("objectPositionX", selectedMetrics?.objectPositionX ?? 50)} onChange={(event) => patchDeviceStyle({ objectPositionX: Number(event.target.value) })} className="w-full accent-[#b28c43]" />
              </div>
              <div className="mt-2">
                <div className="mb-1 flex justify-between text-[8px] text-black/45"><span>Dikey odak</span><span>{Math.round(numberStyle("objectPositionY", selectedMetrics?.objectPositionY ?? 50))}%</span></div>
                <input type="range" min={0} max={100} value={numberStyle("objectPositionY", selectedMetrics?.objectPositionY ?? 50)} onChange={(event) => patchDeviceStyle({ objectPositionY: Number(event.target.value) })} className="w-full accent-[#b28c43]" />
              </div>
            </section>
          ) : null}

          {selected.textEditable ? (
            <section className="border-b border-black/[0.06] p-3">
              <span className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold"><Type className="h-3 w-3" />Yazı</span>
              <textarea rows={3} value={selectedOverride?.text ?? selected.text ?? ""} onChange={(event) => patchOverride({ text: event.target.value })} className="w-full resize-y rounded-xl border border-black/10 bg-[#fafafa] p-2.5 text-[9px] leading-4 outline-none focus:border-[#b28c43]/50" />
            </section>
          ) : null}

          {selected.kind === "link" ? (
            <section className="border-b border-black/[0.06] p-3">
              <span className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold"><Link2 className="h-3 w-3" />Bağlantı</span>
              <input value={selectedOverride?.href ?? selected.href ?? ""} onChange={(event) => patchOverride({ href: event.target.value })} className="h-9 w-full rounded-lg border border-black/10 bg-[#fafafa] px-2.5 text-[9px] outline-none focus:border-[#b28c43]/50" placeholder="/products" />
            </section>
          ) : null}

          {(selected.textEditable || selected.kind === "text" || selected.kind === "link" || selected.kind === "button") ? (
            <section className="border-b border-black/[0.06] p-3">
              <p className="mb-2 text-[9px] font-semibold">Tipografi</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[8px] text-black/45">Yazı boyutu</span>
                  <input type="number" min={6} max={240} value={Math.round(numberStyle("fontSize", selectedMetrics?.fontSize || 16))} onChange={(event) => patchDeviceStyle({ fontSize: Number(event.target.value) || 6 })} className="h-9 w-full rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] text-black/45">Satır yüksekliği</span>
                  <input type="number" min={0.5} max={4} step={0.05} value={numberStyle("lineHeight", selectedMetrics?.lineHeight || 1.2)} onChange={(event) => patchDeviceStyle({ lineHeight: Number(event.target.value) || 1 })} className="h-9 w-full rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] text-black/45">Harf aralığı</span>
                  <input type="number" min={-20} max={100} step={0.1} value={numberStyle("letterSpacing", selectedMetrics?.letterSpacing || 0)} onChange={(event) => patchDeviceStyle({ letterSpacing: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] text-black/45">Hizalama</span>
                  <select value={selectedDeviceStyle?.textAlign || selectedMetrics?.textAlign || "left"} onChange={(event) => patchDeviceStyle({ textAlign: event.target.value as ThemeDeviceStyle["textAlign"] })} className="h-9 w-full rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none">
                    <option value="left">Sol</option><option value="center">Orta</option><option value="right">Sağ</option>
                  </select>
                </label>
              </div>
              <label className="mt-2 flex h-10 items-center gap-2 rounded-lg border border-black/[0.08] bg-[#fafafa] px-2.5">
                <input type="color" value={selectedDeviceStyle?.color || selectedMetrics?.color || "#111111"} onChange={(event) => patchDeviceStyle({ color: event.target.value })} className="h-6 w-8 border-0 bg-transparent p-0" />
                <span className="text-[8px] font-medium text-black/50">Yazı rengi</span>
                <span className="ml-auto text-[8px] uppercase text-black/35">{selectedDeviceStyle?.color || selectedMetrics?.color || "#111111"}</span>
              </label>
            </section>
          ) : null}

          {(selected.kind === "button" || selected.kind === "section" || selected.kind === "container" || selected.kind === "image") ? (
            <section className="border-b border-black/[0.06] p-3">
              <p className="mb-2 text-[9px] font-semibold">Boyut ve görünüm</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[8px] text-black/45">Genişlik</span>
                  <div className="flex gap-1">
                    <input type="number" min={0} max={5000} value={Math.round(numberStyle("width", selectedMetrics?.width || 0))} onChange={(event) => patchDeviceStyle({ width: Number(event.target.value) || 0, widthUnit: "px" })} className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none" />
                    <button type="button" onClick={() => patchDeviceStyle({ width: null })} className="h-9 rounded-lg border border-black/10 px-2 text-[8px] text-black/45">Auto</button>
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] text-black/45">Yükseklik</span>
                  <div className="flex gap-1">
                    <input type="number" min={0} max={5000} value={Math.round(numberStyle("height", selectedMetrics?.height || 0))} onChange={(event) => patchDeviceStyle({ height: Number(event.target.value) || 0, heightUnit: "px" })} className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none" />
                    <button type="button" onClick={() => patchDeviceStyle({ height: null })} className="h-9 rounded-lg border border-black/10 px-2 text-[8px] text-black/45">Auto</button>
                  </div>
                </label>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[8px] text-black/45">Yatay iç boşluk</span>
                  <input type="number" min={0} max={500} value={Math.round(numberStyle("paddingX", selectedMetrics?.paddingX || 0))} onChange={(event) => patchDeviceStyle({ paddingX: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] text-black/45">Dikey iç boşluk</span>
                  <input type="number" min={0} max={500} value={Math.round(numberStyle("paddingY", selectedMetrics?.paddingY || 0))} onChange={(event) => patchDeviceStyle({ paddingY: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none" />
                </label>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[8px] text-black/45">Üst boşluk</span>
                  <input type="number" min={-1000} max={2000} value={Math.round(numberStyle("marginTop", selectedMetrics?.marginTop || 0))} onChange={(event) => patchDeviceStyle({ marginTop: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] text-black/45">Alt boşluk</span>
                  <input type="number" min={-1000} max={2000} value={Math.round(numberStyle("marginBottom", selectedMetrics?.marginBottom || 0))} onChange={(event) => patchDeviceStyle({ marginBottom: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none" />
                </label>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex h-10 items-center gap-2 rounded-lg border border-black/[0.08] bg-[#fafafa] px-2.5">
                  <input type="color" value={selectedDeviceStyle?.backgroundColor || selectedMetrics?.backgroundColor || "#ffffff"} onChange={(event) => patchDeviceStyle({ backgroundColor: event.target.value })} className="h-6 w-8 border-0 bg-transparent p-0" />
                  <span className="text-[8px] font-medium text-black/50">Arka plan</span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] text-black/45">Köşe</span>
                  <input type="number" min={0} max={1000} value={Math.round(numberStyle("borderRadius", selectedMetrics?.borderRadius || 0))} onChange={(event) => patchDeviceStyle({ borderRadius: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none" />
                </label>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[8px] text-black/45"><span>Opaklık</span><span>{Math.round(numberStyle("opacity", selectedMetrics?.opacity ?? 1) * 100)}%</span></div>
                <input type="range" min={0.05} max={1} step={0.05} value={numberStyle("opacity", selectedMetrics?.opacity ?? 1)} onChange={(event) => patchDeviceStyle({ opacity: Number(event.target.value) })} className="w-full accent-[#b28c43]" />
              </div>
            </section>
          ) : null}

          <div className="sticky bottom-0 border-t border-black/[0.07] bg-white/95 p-2 backdrop-blur">
            <button type="button" onClick={resetSelectedOverride} disabled={!selectedOverride} className="h-8 w-full rounded-lg border border-black/10 text-[8px] font-medium text-black/55 hover:bg-black/[0.025] disabled:opacity-30">Bu öğenin ayarlarını sıfırla</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
