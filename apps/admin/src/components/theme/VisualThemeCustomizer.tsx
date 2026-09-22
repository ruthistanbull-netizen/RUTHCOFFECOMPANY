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
  themePage,
  themePageKey,
  upsertThemeElementOverride,
  type ThemeCustomizerSettings,
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
  href?: string;
};

type ContextPoint = { x: number; y: number; viewportWidth: number; viewportHeight: number };
type ContextRequest = { id: string; point: ContextPoint };
type MenuPosition = { x: number; y: number };

const STOREFRONT_URL = (
  process.env.NEXT_PUBLIC_STOREFRONT_URL ||
  "https://rostacoffecompany.zeabur.app"
).replace(/\/$/, "");
const THEME_IMAGE_ACCEPT = "image/*,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif";
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
      const src = await uploadThemeImage(file);
      if (isHomepageHeroElement(path, selected.id)) {
        const selectedDevice = homepageHeroDeviceForElement(selected.id) || device;
        await persistHeroImage(selectedDevice, src);
      } else {
        setSettings((current) => {
          const base = baseOverride(current);
          if (!base) return current;
          return upsertThemeElementOverride(current, targetPage, { ...base, imageSrc: src, kind: "image" });
        });
        iframeRef.current?.contentWindow?.postMessage({
          type: "RUTH_THEME_EDITOR_IMAGE_OVERRIDE",
          id: selected.id,
          selector: selected.selector,
          imageSrc: src,
          src,
        }, "*");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Görsel yüklenemedi.");
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
        if (typeof message.sectionId === "string" && message.sectionId) {
          pendingContextRef.current = null;
          setSelected(null);
          return;
        }
        pendingContextRef.current = { id: message.id, point: message.point as ContextPoint };
        iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SELECT_REQUEST", id: message.id, scroll: false }, "*");
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
          setMenu({
            x: Math.min(Math.max(12, window.innerWidth - 292), Math.max(12, rect.left + pending.point.x * scaleX)),
            y: Math.min(Math.max(72, window.innerHeight - 250), Math.max(72, rect.top + pending.point.y * scaleY)),
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
  }, [sendSettings, settings]);

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

  return (
    <div className="fixed inset-0 z-[90] flex min-h-0 flex-col bg-[#eceef1]" data-theme-customizer-v4>
      <header className="flex h-[64px] shrink-0 items-center border-b border-black/10 bg-[#fbf8f3] px-3 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <a href="/" aria-label="Panele dön" className="grid h-9 w-9 place-items-center rounded-xl border border-black/[0.08] bg-white shadow-sm"><ArrowLeft className="h-4 w-4" /></a>
          <div className="hidden sm:block"><p className="text-[12px] font-semibold">Mağaza Tasarımı</p><p className="mt-0.5 text-[8px] text-black/35">Masaüstü ve mobil mağaza medya editörü</p></div>
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
        <aside className="order-2 flex h-[44dvh] w-full shrink-0 flex-col border-t border-black/10 bg-[#fbf8f3] md:order-1 md:h-full md:w-[360px] md:border-r md:border-t-0">
          <div className="grid grid-cols-3 gap-1 border-b border-black/[0.07] p-2">
            <button type="button" onClick={() => setSideView("quick")} className={cx("h-9 rounded-lg text-[9px] font-medium", sideView === "quick" ? "bg-white shadow-sm" : "text-black/45")}>Hızlı düzenle</button>
            <button type="button" onClick={() => setSideView("home")} className={cx("h-9 rounded-lg text-[9px] font-medium", sideView === "home" ? "bg-white shadow-sm" : "text-black/45")}>Anasayfa</button>
            <button type="button" onClick={() => setSideView("theme")} className={cx("h-9 rounded-lg text-[9px] font-medium", sideView === "theme" ? "bg-white shadow-sm" : "text-black/45")}>Tema</button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading ? <div className="grid h-full place-items-center"><RefreshCw className="h-5 w-5 animate-spin text-black/30" /></div> : null}

            {!loading && sideView === "quick" ? (
              <div className="space-y-3">
                <div className={panelCard()}><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f1e9d4] text-[#7b5c1e]"><MousePointer2 className="h-4 w-4" /></span><div><p className="text-[10px] font-semibold">Önizlemeden düzenle</p><p className="mt-1 text-[9px] leading-4 text-black/45">Masaüstünde sağ tıkla, mobilde uzun bas. Bölüm ayarları tıkladığın yerde açılır; sol panel seçimle değişmez.</p></div></div></div>
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

        <main className="order-1 flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#e9ebee] p-3 md:order-2 md:p-5">
          <div className={cx("relative overflow-hidden bg-white shadow-[0_10px_40px_rgba(15,23,42,.08)] transition-all duration-300", device === "mobile" ? "h-full max-h-[820px] w-[430px] max-w-full rounded-[24px] border border-black/10" : "h-full w-full rounded-xl border border-black/[0.08]")}>
            <iframe ref={iframeRef} key={`${path}-${nonce}`} src={previewUrl} title="Mağaza önizleme" className="h-full w-full border-0 bg-white" onLoad={() => window.setTimeout(() => sendSettings(settings), 40)} />
          </div>
        </main>
      </div>

      {menu && selected ? (
        <div className="fixed z-[2147483640] w-[280px] overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-[0_18px_50px_rgba(15,23,42,.24)]" style={{ left: menu.x, top: menu.y }} data-ruth-theme-editor-ui data-ruth-theme-context-menu>
          <div className="border-b border-black/[0.06] px-3 py-2.5">
            <p className="truncate text-[9px] font-semibold">{selected.label}</p>
            <p className="mt-0.5 text-[8px] text-black/35">{selected.tag} · {selected.kind}</p>
          </div>
          {selected.kind === "image" ? (
            <label className={cx("relative flex h-10 w-full items-center gap-2 overflow-hidden px-3 text-left text-[9px] hover:bg-black/[0.04]", uploading === "selected" && "pointer-events-none opacity-40")}>
              <ImageIcon className="h-3.5 w-3.5" />{uploading === "selected" ? "Yükleniyor…" : "Görseli değiştir"}
              <input
                type="file"
                accept={THEME_IMAGE_ACCEPT}
                disabled={uploading === "selected"}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  setMenu(null);
                  if (file) void uploadSelectedImage(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          ) : null}
          {selected.textEditable ? (
            <label className="block border-t border-black/[0.05] px-3 py-2.5">
              <span className="mb-1.5 flex items-center gap-1.5 text-[8px] font-medium text-black/45"><Type className="h-3 w-3" />Yazı</span>
              <textarea rows={3} value={selectedOverride?.text ?? selected.text ?? ""} onChange={(event) => patchOverride({ text: event.target.value })} className="w-full resize-y rounded-lg border border-black/10 bg-[#fafafa] p-2 text-[9px] outline-none focus:border-[#b28c43]/50" />
            </label>
          ) : null}
          {selected.kind === "link" ? (
            <label className="block border-t border-black/[0.05] px-3 py-2.5">
              <span className="mb-1.5 flex items-center gap-1.5 text-[8px] font-medium text-black/45"><Link2 className="h-3 w-3" />Bağlantı</span>
              <input value={selectedOverride?.href ?? selected.href ?? ""} onChange={(event) => patchOverride({ href: event.target.value })} className="h-9 w-full rounded-lg border border-black/10 bg-[#fafafa] px-2.5 text-[9px] outline-none focus:border-[#b28c43]/50" />
            </label>
          ) : null}
          {!selected.textEditable && selected.kind !== "image" && selected.kind !== "link" ? <div className="flex min-h-10 items-center gap-2 px-3 text-[9px] text-black/45"><MousePointer2 className="h-3.5 w-3.5" />Bu öğenin özel alanı yok.</div> : null}
          <button type="button" onClick={() => { setSideView("theme"); setMenu(null); }} className="flex h-10 w-full items-center gap-2 border-t border-black/[0.05] px-3 text-left text-[9px] hover:bg-black/[0.04]"><Palette className="h-3.5 w-3.5" />Tema ayarları<ChevronRight className="ml-auto h-3 w-3" /></button>
        </div>
      ) : null}
    </div>
  );
}
