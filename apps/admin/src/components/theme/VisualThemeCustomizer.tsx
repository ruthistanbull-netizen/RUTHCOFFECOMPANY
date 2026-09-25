"use client";

import {
  ArrowLeft,
  ChevronRight,
  Copy,
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
  homepageHeroDeviceMediaType,
  isHomepageHeroElement,
  normalizeThemeMediaSettings,
  setHomepageHeroDeviceMedia,
  type HomepageHeroDevice,
  type HomepageMediaType,
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
const THEME_MEDIA_ACCEPT = "image/*,video/*,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif,.mp4,.m4v,.mov,.webm";

function mediaTypeForFile(file: File): HomepageMediaType {
  return file.type.startsWith("video/") || /\.(mp4|m4v|mov|webm)$/i.test(file.name || "") ? "video" : "image";
}

function mediaTypeForUrl(value: string): HomepageMediaType {
  return /\.(mp4|m4v|mov|webm)(?:$|[?#])/i.test(value || "") ? "video" : "image";
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
  return "h-10 w-full rounded-xl border border-border-subtle bg-surface-secondary px-3 text-[11px] outline-none transition focus:border-accent focus:bg-surface-primary";
}

function panelCard() {
  return "rounded-2xl border border-border-subtle bg-surface-primary p-3 shadow-card";
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

function UploadCard({
  title,
  value,
  busy,
  onFile,
  mediaType,
  onDuplicate,
}: {
  title: string;
  value: string;
  busy: boolean;
  onFile: (file: File) => void;
  mediaType?: HomepageMediaType;
  onDuplicate?: () => void;
}) {
  const resolvedType = mediaType || mediaTypeForUrl(value);
  return (
    <div className="min-w-0 rounded-xl border border-border-subtle bg-surface-secondary p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-[9px] font-semibold">{title}</p>
        <span className="rounded-full border border-border-subtle bg-surface-primary px-2 py-0.5 text-[7px] font-medium uppercase tracking-[0.12em] text-subtle">
          {resolvedType === "video" ? "Video" : "Fotoğraf"}
        </span>
      </div>
      <div className="aspect-[4/3] overflow-hidden rounded-lg border border-border-subtle bg-surface-primary">
        {value ? (
          resolvedType === "video" ? (
            <video src={value} className="h-full w-full object-cover" muted loop autoPlay playsInline preload="auto" />
          ) : (
            <img src={value} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <div className="grid h-full place-items-center text-subtle"><ImageIcon className="h-5 w-5" /></div>
        )}
      </div>
      <ThemeImageInput busy={busy} hasValue={Boolean(value)} onFile={onFile} media="any" />
      {onDuplicate && value ? (
        <button
          type="button"
          onClick={onDuplicate}
          className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-surface-primary text-[8px] font-medium text-muted transition hover:border-accent/60 hover:text-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Copy className="h-3 w-3" /> Aynısından çoğalt
        </button>
      ) : null}
    </div>
  );
}


function SelectedMediaUpload({
  label,
  value,
  mediaType,
  busy,
  onFile,
}: {
  label: string;
  value: string;
  mediaType: HomepageMediaType;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-secondary p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[8px] font-semibold">{label}</span>
        <span className="rounded-full border border-border-subtle bg-surface-primary px-1.5 py-0.5 text-[6px] uppercase tracking-[0.12em] text-subtle">
          {mediaType === "video" ? "Video" : "Fotoğraf"}
        </span>
      </div>
      <div className="mb-2 h-[72px] overflow-hidden rounded-lg border border-border-subtle bg-surface-primary">
        {value ? (
          mediaType === "video" ? (
            <video src={value} className="h-full w-full object-cover" muted loop autoPlay playsInline preload="auto" />
          ) : (
            <img src={value} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <div className="grid h-full place-items-center text-[7px] text-subtle">Medya seçilmedi</div>
        )}
      </div>
      <ThemeImageInput busy={busy} hasValue={Boolean(value)} onFile={onFile} media="any" compact />
    </div>
  );
}

const ROSTA_EDITOR_COLORS = [
  { label: "Carbon", value: "#111111" },
  { label: "Carbon Soft", value: "#242424" },
  { label: "Cream", value: "#FBF3E6" },
  { label: "Brick B", value: "#C94A40" },
  { label: "Espresso", value: "#38251C" },
  { label: "Cocoa", value: "#6B4638" },
  { label: "Kraft", value: "#C8A77D" },
  { label: "Action White", value: "#FFFFFF" },
] as const;

function LockedColorField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-11 items-center gap-2 rounded-xl border border-border-subtle bg-surface-secondary px-3">
      <span className="h-7 w-8 rounded-md border border-border-subtle" style={{ background: value }} aria-hidden="true" />
      <span className="min-w-0 flex-1 text-[10px] font-medium">{label}</span>
      <span className="text-[8px] uppercase text-subtle">{value}</span>
    </div>
  );
}

function BrandColorSelect({
  label,
  value,
  onChange,
  allowDefault = true,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  allowDefault?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[8px] text-muted">{label}</span>
      <select
        value={value || ""}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-10 w-full rounded-lg border border-border-subtle bg-surface-secondary px-2.5 text-[9px] outline-none focus:border-accent"
      >
        {allowDefault ? <option value="">Varsayılan</option> : null}
        {ROSTA_EDITOR_COLORS.map((color) => <option key={color.value} value={color.value}>{color.label} · {color.value}</option>)}
      </select>
    </label>
  );
}

export function VisualThemeCustomizer() {
  const toast = useExactToast();
  const saveLifecycle = useSaveLifecycle();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingContextRef = useRef<ContextRequest | null>(null);
  const pendingSelectIdRef = useRef<string | null>(null);
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
  const selectedIsHomepageHero = Boolean(selected && isHomepageHeroElement(path, selected.id));
  const selectedDesktopMediaSrc = selected
    ? selectedIsHomepageHero
      ? homepageHeroDeviceImage(settings, "desktop")
      : selectedOverride?.desktopImageSrc || selectedOverride?.imageSrc || selected.imageSrc || ""
    : "";
  const selectedMobileMediaSrc = selected
    ? selectedIsHomepageHero
      ? homepageHeroDeviceImage(settings, "mobile")
      : selectedOverride?.mobileImageSrc || selectedOverride?.imageSrc || selected.imageSrc || ""
    : "";
  const selectedDesktopMediaType: HomepageMediaType = selected
    ? selectedIsHomepageHero
      ? homepageHeroDeviceMediaType(settings, "desktop")
      : selectedOverride?.desktopMediaType || selectedOverride?.mediaType || selected.mediaType || (selected.tag === "video" ? "video" : "image")
    : "image";
  const selectedMobileMediaType: HomepageMediaType = selected
    ? selectedIsHomepageHero
      ? homepageHeroDeviceMediaType(settings, "mobile")
      : selectedOverride?.mobileMediaType || selectedOverride?.mediaType || selected.mediaType || (selected.tag === "video" ? "video" : "image")
    : "image";

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

  const persistHeroMedia = useCallback(async (
    heroDevice: HomepageHeroDevice,
    src: string,
    mediaType: HomepageMediaType,
  ) => {
    const nextToSave = normalizeThemeMediaSettings(setHomepageHeroDeviceMedia(settings, heroDevice, src, mediaType));

    setSettings(nextToSave);
    sendSettings(nextToSave);

    const result = await adminRequest<{ settings?: unknown; warning?: string }>("/api/theme", {
      method: "PUT",
      body: JSON.stringify({ settings: nextToSave }),
      confirmation: false,
    });
    const persisted = normalizeThemeMediaSettings(normalizeThemeCustomizerSettings(result.settings || nextToSave));
    if (homepageHeroDeviceImage(persisted, heroDevice) !== src || homepageHeroDeviceMediaType(persisted, heroDevice) !== mediaType) {
      throw new Error(`${heroDevice === "desktop" ? "Masaüstü" : "Mobil"} hero medyası veritabanına doğru kaydedilemedi.`);
    }

    setSettings(persisted);
    setSaved(persisted);
    sendSettings(persisted);
    setNonce(Date.now());
    if (result.warning) toast.warning(`Hero kaydedildi. ${result.warning}`);
    else toast.success(`${heroDevice === "desktop" ? "Masaüstü" : "Mobil"} hero ${mediaType === "video" ? "videosu" : "fotoğrafı"} değiştirildi ve yayınlandı.`);
  }, [sendSettings, settings, toast]);

  const uploadHero = async (heroDevice: HomepageHeroDevice, file: File) => {
    setUploading(`hero-${heroDevice}`);
    try {
      const mediaType = mediaTypeForFile(file);
      const src = await uploadThemeImage(file);
      await persistHeroMedia(heroDevice, src, mediaType);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Hero medyası yüklenemedi.");
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
      toast.error(error instanceof Error ? error.message : "Medya yüklenemedi.");
    } finally {
      setUploading(null);
    }
  };

  const duplicateScrollMedia = useCallback((index: number) => {
    setSettings((current) => {
      const items = [...current.homepageImages.scrollImages];
      const source = items[index];
      if (!source) return current;
      if (items.length >= 12) {
        window.setTimeout(() => toast.error("Kayan medya alanında en fazla 12 öğe olabilir."), 0);
        return current;
      }
      items.splice(index + 1, 0, source);
      return {
        ...current,
        homepageImages: {
          ...current.homepageImages,
          scrollImages: items,
        },
      };
    });
  }, [toast]);

  const uploadSelectedImage = async (file: File, targetDevice: Device) => {
    if (!selected) return;
    setUploading(`selected-${targetDevice}`);
    try {
      const mediaType = mediaTypeForFile(file);
      const src = await uploadThemeImage(file);

      if (isHomepageHeroElement(path, selected.id)) {
        await persistHeroMedia(targetDevice, src, mediaType);
        if (device === targetDevice) {
          setSelected((current) => current ? {
            ...current,
            tag: mediaType === "video" ? "video" : "img",
            mediaType,
            imageSrc: src,
          } : current);
        }
        return;
      }

      setSettings((current) => {
        const base = baseOverride(current);
        if (!base) return current;
        const patch = targetDevice === "mobile"
          ? { mobileImageSrc: src, mobileMediaType: mediaType }
          : { desktopImageSrc: src, desktopMediaType: mediaType };
        return upsertThemeElementOverride(current, targetPage, {
          ...base,
          ...patch,
          kind: "image",
        });
      });

      if (device === targetDevice) {
        setSelected((current) => current ? {
          ...current,
          tag: mediaType === "video" ? "video" : "img",
          mediaType,
          imageSrc: src,
        } : current);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fotoğraf veya video yüklenemedi.");
    } finally {
      setUploading(null);
    }
  };

  const duplicateSelectedMedia = useCallback(() => {
    if (!selected || selected.kind !== "image") return;
    const source = selectedOverride?.imageSrc || selected.imageSrc || "";
    if (!source) {
      toast.error("Çoğaltılacak medya kaynağı bulunamadı.");
      return;
    }

    const baseId = selected.id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 92) || "media";
    const duplicateId = `${baseId}--copy-${Date.now().toString(36)}`;
    const mediaType: HomepageMediaType =
      selectedOverride?.mediaType || selected.mediaType || (selected.tag === "video" ? "video" : "image");

    const duplicate: ThemeElementOverride = {
      id: duplicateId,
      selector: `[data-theme-id="${duplicateId}"]`,
      label: `${selected.label || "Medya"} · Kopya`,
      tag: mediaType === "video" ? "video" : "img",
      kind: "image",
      hidden: false,
      imageSrc: selectedOverride?.imageSrc || source,
      mediaType: selectedOverride?.mediaType || mediaType,
      desktopImageSrc: selectedOverride?.desktopImageSrc,
      mobileImageSrc: selectedOverride?.mobileImageSrc,
      desktopMediaType: selectedOverride?.desktopMediaType,
      mobileMediaType: selectedOverride?.mobileMediaType,
      duplicateOf: selected.id,
      desktop: { ...(selectedOverride?.desktop || {}) },
      mobile: { ...(selectedOverride?.mobile || {}) },
    };

    pendingSelectIdRef.current = duplicateId;
    setSettings((current) => upsertThemeElementOverride(current, targetPage, duplicate));
    setMenu(null);
    toast.success("Medya çoğaltıldı.");
  }, [selected, selectedOverride, targetPage, toast]);

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

      if (message.type === "RUTH_THEME_EDITOR_SETTINGS_APPLIED" && pendingSelectIdRef.current) {
        const pendingId = pendingSelectIdRef.current;
        const missing = Array.isArray(message.missingIds) ? message.missingIds : [];
        if (!missing.includes(pendingId)) {
          pendingSelectIdRef.current = null;
          iframeRef.current?.contentWindow?.postMessage({
            type: "RUTH_THEME_EDITOR_SELECT_REQUEST",
            id: pendingId,
            scroll: true,
          }, "*");
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
    <div className="fixed inset-0 z-[90] flex min-h-0 flex-col bg-background text-main" data-theme-customizer-v4>
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
      <header className="flex h-[64px] shrink-0 items-center border-b border-border-subtle bg-surface-primary px-3 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <a href="/" aria-label="Panele dön" className="grid h-9 w-9 place-items-center rounded-xl border border-border-subtle bg-surface-primary shadow-sm"><ArrowLeft className="h-4 w-4" /></a>
          <div className="hidden sm:block"><p className="text-[12px] font-semibold">Mağaza Tasarımı</p><p className="mt-0.5 text-[8px] text-subtle">Sağ tıkla · mobilde basılı tutarak düzenle</p></div>
        </div>

        <div className="mx-2 flex min-w-0 flex-[1.5] items-center justify-center gap-2">
          <select value={pages.some((item) => item.path === path) ? path : pages[0]?.path || "/"} onChange={(event) => setPage(event.target.value)} className="h-9 w-full max-w-[330px] rounded-xl border border-border-subtle bg-surface-primary px-3 text-[10px] font-medium outline-none">
            {groupedPages(pages).map(([group, items]) => <optgroup key={group} label={group}>{items.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</optgroup>)}
          </select>
          <div className="flex rounded-xl bg-surface-tertiary p-1">
            <button type="button" aria-label="Masaüstü önizleme" onClick={() => setDevice("desktop")} className={cx("grid h-7 w-8 place-items-center rounded-lg", device === "desktop" ? "bg-surface-primary shadow-sm" : "text-subtle")}><Monitor className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="Mobil önizleme" onClick={() => setDevice("mobile")} className={cx("grid h-7 w-8 place-items-center rounded-lg", device === "mobile" ? "bg-surface-primary shadow-sm" : "text-subtle")}><Smartphone className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          {dirty ? <button type="button" onClick={discard} disabled={saveLifecycle.saving} className="hidden h-9 rounded-xl border border-border-subtle bg-surface-primary px-3 text-[9px] font-medium sm:inline-flex sm:items-center">Geri al</button> : null}
          <button type="button" onClick={() => void saveLifecycle.save()} disabled={!dirty || saveLifecycle.saving || loading} className="inline-flex h-9 items-center gap-2 rounded-xl bg-accent px-3.5 text-[9px] font-semibold text-[var(--rosta-action-text)] active:bg-[var(--rosta-espresso)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-35">
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
          <div className="grid grid-cols-3 gap-1 border-b border-border-subtle p-2">
            <button type="button" onClick={() => setSideView("quick")} className={cx("h-9 rounded-lg text-[9px] font-medium", sideView === "quick" ? "bg-surface-primary shadow-sm" : "text-muted")}>Hızlı düzenle</button>
            <button type="button" onClick={() => setSideView("home")} className={cx("h-9 rounded-lg text-[9px] font-medium", sideView === "home" ? "bg-surface-primary shadow-sm" : "text-muted")}>Anasayfa</button>
            <button type="button" onClick={() => setSideView("theme")} className={cx("h-9 rounded-lg text-[9px] font-medium", sideView === "theme" ? "bg-surface-primary shadow-sm" : "text-muted")}>Tema</button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading ? <div className="grid h-full place-items-center"><RefreshCw className="h-5 w-5 animate-spin text-subtle" /></div> : null}

            {!loading && sideView === "quick" ? (
              <div className="space-y-3">
                <div className={panelCard()}><div className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><MousePointer2 className="h-4 w-4" /></span><div><p className="text-[10px] font-semibold">Önizlemeden düzenle</p><p className="mt-1 text-[9px] leading-4 text-muted">Masaüstünde sağ tıkla, mobilde uzun bas. Görsel, yazı, bağlantı, buton ve bölüm için yalnız o öğeye ait ayarlar tıkladığın yerde açılır.</p></div></div></div>
              </div>
            ) : null}

            {!loading && sideView === "home" ? (
              path === "/" ? (
                <div className="space-y-3">
                  <div className={panelCard()}>
                    <div className="mb-3"><p className="text-[10px] font-semibold">Ana hero medyaları</p><p className="mt-1 text-[8px] leading-4 text-subtle">Masaüstü ve mobil ayrı kaydedilir. Her alana ister fotoğraf ister video yükleyebilirsin; seçilen medya türü storefrontta aynı şekilde yayınlanır.</p></div>
                    <div className="grid grid-cols-2 gap-2">
                      <UploadCard title="Masaüstü" value={homepageHeroDeviceImage(settings, "desktop")} busy={uploading === "hero-desktop"} onFile={(file) => void uploadHero("desktop", file)} />
                      <UploadCard title="Mobil" value={homepageHeroDeviceImage(settings, "mobile")} busy={uploading === "hero-mobile"} onFile={(file) => void uploadHero("mobile", file)} />
                    </div>
                  </div>
                  <div className={panelCard()}>
                    <p className="mb-3 text-[10px] font-semibold">Kayan medya</p>
                    <div className="grid grid-cols-2 gap-2">{settings.homepageImages.scrollImages.map((src, index) => <UploadCard key={`${src}-${index}`} title={`Medya ${index + 1}`} value={src} busy={uploading === `scroll-${index}`} onFile={(file) => void uploadScroll(index, file)} onDuplicate={() => duplicateScrollMedia(index)} />)}</div>
                  </div>
                </div>
              ) : <div className="rounded-xl border border-dashed border-border-strong p-4 text-center text-[9px] text-subtle">Anasayfa medyaları için Ana Sayfa’yı seç.</div>
            ) : null}

            {!loading && sideView === "theme" ? (
              <div className="space-y-3">
                <div className={panelCard()}><div className="mb-3"><p className="text-[10px] font-semibold">ROSTA renk sistemi</p><p className="mt-1 text-[8px] leading-4 text-subtle">Marka paleti kilitli. Tema düzenleyici içerik, görsel, ölçü ve yerleşimi değiştirir; marka renkleri bu sistemin dışına çıkmaz.</p></div><div className="space-y-2"><LockedColorField label="Ana arka plan · Carbon" value="#111111" /><LockedColorField label="İkincil yüzey · Carbon Soft" value="#242424" /><LockedColorField label="Ana yazı · Cream" value="#FBF3E6" /><LockedColorField label="Ana aksiyon · Brick B" value="#C94A40" /><LockedColorField label="Basılı / güçlü · Espresso" value="#38251C" /><LockedColorField label="İkincil kahve · Cocoa" value="#6B4638" /><LockedColorField label="Sınır · Kraft" value="#C8A77D" /></div></div>
                <div className={panelCard()}><p className="mb-2 text-[10px] font-semibold">WhatsApp</p><label className="block"><span className="mb-1 block text-[8px] text-subtle">Buton yazısı</span><input value={settings.whatsapp.label} onChange={(event) => setSettings((current) => ({ ...current, whatsapp: { ...current.whatsapp, label: event.target.value } }))} className={fieldClass()} /></label><label className="mt-2 block"><span className="mb-1 block text-[8px] text-subtle">Telefon</span><input value={settings.whatsapp.phone} onChange={(event) => setSettings((current) => ({ ...current, whatsapp: { ...current.whatsapp, phone: event.target.value.replace(/\D/g, "") } }))} className={fieldClass()} /></label></div>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-background p-3 md:p-4">
          <div className={cx("relative overflow-hidden bg-surface-primary shadow-floating transition-all duration-300", device === "mobile" ? "h-full max-h-[820px] w-[430px] max-w-full rounded-[24px] border border-border-subtle" : "h-full w-full rounded-xl border border-border-subtle")}>
            <iframe ref={iframeRef} key={`${path}-${nonce}`} src={previewUrl} title="Mağaza önizleme" className="h-full w-full border-0 bg-surface-primary" onLoad={() => window.setTimeout(() => sendSettings(settings), 40)} />
          </div>
        </main>
      </div>

      {menu && selected ? (
        <div
          className="fixed z-[2147483640] w-[264px] max-w-[calc(100vw-20px)] max-h-[min(460px,calc(100vh-78px))] overflow-y-auto rounded-xl border border-border-subtle bg-surface-primary shadow-overlay"
          style={{ left: menu.x, top: menu.y }}
          data-ruth-theme-editor-ui
          data-ruth-theme-context-menu
        >
          <div className="sticky top-0 z-10 border-b border-border-subtle bg-surface-primary/95 px-2.5 py-2 backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold">{selected.label}</p>
                <p className="mt-0.5 text-[8px] text-subtle">{selected.tag} · {selected.kind} · {device === "mobile" ? "Mobil" : "Masaüstü"}</p>
              </div>
              <button type="button" onClick={() => setMenu(null)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[14px] text-subtle active:bg-accent-soft active:text-main focus-visible:bg-accent-soft focus-visible:text-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">×</button>
            </div>
          </div>

          {selected.kind === "image" ? (
            <section className="border-b border-border-subtle p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[9px] font-semibold">Medya</p>
                <span className="rounded-full border border-border-subtle bg-surface-secondary px-2 py-0.5 text-[7px] uppercase tracking-[0.12em] text-subtle">
                  {(selectedOverride?.mediaType || selected.mediaType || (selected.tag === "video" ? "video" : "image")) === "video" ? "Video" : "Fotoğraf"}
                </span>
              </div>
              {(selectedOverride?.imageSrc || selected.imageSrc) ? (
                <div className="mb-2 h-[78px] overflow-hidden rounded-lg border border-border-subtle bg-surface-secondary">
                  {(selectedOverride?.mediaType || selected.mediaType || (selected.tag === "video" ? "video" : "image")) === "video" ? (
                    <video src={selectedOverride?.imageSrc || selected.imageSrc} className="h-full w-full object-cover" muted loop autoPlay playsInline preload="auto" />
                  ) : (
                    <img src={selectedOverride?.imageSrc || selected.imageSrc} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
              ) : null}
              <label className={cx("relative flex h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-border-subtle bg-surface-secondary text-[9px] font-medium focus-within:bg-surface-primary focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent", uploading === "selected" && "pointer-events-none opacity-40")}>
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
              <p className="mt-1.5 text-[7px] leading-3 text-subtle">JPG, PNG, WebP, AVIF, HEIC veya MP4, MOV, M4V, WebM yükleyebilirsin. Seçtiğin dosya türüne göre alan otomatik fotoğraf ya da videoya dönüşür.</p>
              <button
                type="button"
                onClick={duplicateSelectedMedia}
                disabled={!(selectedOverride?.imageSrc || selected.imageSrc)}
                className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border-subtle bg-surface-secondary text-[8px] font-medium text-muted transition hover:border-accent/60 hover:text-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-35"
              >
                <Copy className="h-3.5 w-3.5" /> Aynısından çoğalt
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[8px] font-medium text-muted">Doldurma</span>
                  <select
                    value={selectedDeviceStyle?.objectFit || selectedMetrics?.objectFit || "cover"}
                    onChange={(event) => patchDeviceStyle({ objectFit: event.target.value as ThemeDeviceStyle["objectFit"] })}
                    className="h-9 w-full rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[9px] outline-none"
                  >
                    <option value="cover">Kırp / doldur</option>
                    <option value="contain">Tamamını göster</option>
                    <option value="fill">Esnet</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] font-medium text-muted">Köşe</span>
                  <input type="number" min={0} max={1000} value={Math.round(numberStyle("borderRadius", selectedMetrics?.borderRadius || 0))} onChange={(event) => patchDeviceStyle({ borderRadius: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[9px] outline-none" />
                </label>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[8px] text-muted"><span>Yatay odak</span><span>{Math.round(numberStyle("objectPositionX", selectedMetrics?.objectPositionX ?? 50))}%</span></div>
                <input type="range" min={0} max={100} value={numberStyle("objectPositionX", selectedMetrics?.objectPositionX ?? 50)} onChange={(event) => patchDeviceStyle({ objectPositionX: Number(event.target.value) })} className="w-full accent-[#C94A40]" />
              </div>
              <div className="mt-2">
                <div className="mb-1 flex justify-between text-[8px] text-muted"><span>Dikey odak</span><span>{Math.round(numberStyle("objectPositionY", selectedMetrics?.objectPositionY ?? 50))}%</span></div>
                <input type="range" min={0} max={100} value={numberStyle("objectPositionY", selectedMetrics?.objectPositionY ?? 50)} onChange={(event) => patchDeviceStyle({ objectPositionY: Number(event.target.value) })} className="w-full accent-[#C94A40]" />
              </div>
            </section>
          ) : null}

          {selected.textEditable ? (
            <section className="border-b border-border-subtle p-3">
              <span className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold"><Type className="h-3 w-3" />Yazı</span>
              <textarea rows={3} value={selectedOverride?.text ?? selected.text ?? ""} onChange={(event) => patchOverride({ text: event.target.value })} className="w-full resize-y rounded-xl border border-border-subtle bg-surface-secondary p-2.5 text-[9px] leading-4 outline-none focus:border-accent" />
            </section>
          ) : null}

          {selected.kind === "link" ? (
            <section className="border-b border-border-subtle p-3">
              <span className="mb-1.5 flex items-center gap-1.5 text-[9px] font-semibold"><Link2 className="h-3 w-3" />Bağlantı</span>
              <input value={selectedOverride?.href ?? selected.href ?? ""} onChange={(event) => patchOverride({ href: event.target.value })} className="h-9 w-full rounded-lg border border-border-subtle bg-surface-secondary px-2.5 text-[9px] outline-none focus:border-accent" placeholder="/products" />
            </section>
          ) : null}

          {(selected.textEditable || selected.kind === "text" || selected.kind === "link" || selected.kind === "button") ? (
            <section className="border-b border-border-subtle p-3">
              <p className="mb-2 text-[9px] font-semibold">Tipografi</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[8px] text-muted">Yazı boyutu</span>
                  <input type="number" min={6} max={240} value={Math.round(numberStyle("fontSize", selectedMetrics?.fontSize || 16))} onChange={(event) => patchDeviceStyle({ fontSize: Number(event.target.value) || 6 })} className="h-9 w-full rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[9px] outline-none" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] text-muted">Satır yüksekliği</span>
                  <input type="number" min={0.5} max={4} step={0.05} value={numberStyle("lineHeight", selectedMetrics?.lineHeight || 1.2)} onChange={(event) => patchDeviceStyle({ lineHeight: Number(event.target.value) || 1 })} className="h-9 w-full rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[9px] outline-none" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] text-muted">Harf aralığı</span>
                  <input type="number" min={-20} max={100} step={0.1} value={numberStyle("letterSpacing", selectedMetrics?.letterSpacing || 0)} onChange={(event) => patchDeviceStyle({ letterSpacing: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[9px] outline-none" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] text-muted">Hizalama</span>
                  <select value={selectedDeviceStyle?.textAlign || selectedMetrics?.textAlign || "left"} onChange={(event) => patchDeviceStyle({ textAlign: event.target.value as ThemeDeviceStyle["textAlign"] })} className="h-9 w-full rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[9px] outline-none">
                    <option value="left">Sol</option><option value="center">Orta</option><option value="right">Sağ</option>
                  </select>
                </label>
              </div>
              <div className="mt-2">
                <BrandColorSelect label="Yazı rengi" value={selectedDeviceStyle?.color} onChange={(color) => patchDeviceStyle({ color })} />
              </div>
            </section>
          ) : null}

          {(selected.kind === "button" || selected.kind === "section" || selected.kind === "container" || selected.kind === "image") ? (
            <section className="border-b border-border-subtle p-3">
              <p className="mb-2 text-[9px] font-semibold">Boyut ve görünüm</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[8px] text-muted">Genişlik</span>
                  <div className="flex gap-1">
                    <input type="number" min={0} max={5000} value={Math.round(numberStyle("width", selectedMetrics?.width || 0))} onChange={(event) => patchDeviceStyle({ width: Number(event.target.value) || 0, widthUnit: "px" })} className="h-9 min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[9px] outline-none" />
                    <button type="button" onClick={() => patchDeviceStyle({ width: null })} className="h-9 rounded-lg border border-border-subtle px-2 text-[8px] text-muted">Auto</button>
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] text-muted">Yükseklik</span>
                  <div className="flex gap-1">
                    <input type="number" min={0} max={5000} value={Math.round(numberStyle("height", selectedMetrics?.height || 0))} onChange={(event) => patchDeviceStyle({ height: Number(event.target.value) || 0, heightUnit: "px" })} className="h-9 min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[9px] outline-none" />
                    <button type="button" onClick={() => patchDeviceStyle({ height: null })} className="h-9 rounded-lg border border-border-subtle px-2 text-[8px] text-muted">Auto</button>
                  </div>
                </label>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[8px] text-muted">Yatay iç boşluk</span>
                  <input type="number" min={0} max={500} value={Math.round(numberStyle("paddingX", selectedMetrics?.paddingX || 0))} onChange={(event) => patchDeviceStyle({ paddingX: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[9px] outline-none" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] text-muted">Dikey iç boşluk</span>
                  <input type="number" min={0} max={500} value={Math.round(numberStyle("paddingY", selectedMetrics?.paddingY || 0))} onChange={(event) => patchDeviceStyle({ paddingY: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[9px] outline-none" />
                </label>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[8px] text-muted">Üst boşluk</span>
                  <input type="number" min={-1000} max={2000} value={Math.round(numberStyle("marginTop", selectedMetrics?.marginTop || 0))} onChange={(event) => patchDeviceStyle({ marginTop: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[9px] outline-none" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[8px] text-muted">Alt boşluk</span>
                  <input type="number" min={-1000} max={2000} value={Math.round(numberStyle("marginBottom", selectedMetrics?.marginBottom || 0))} onChange={(event) => patchDeviceStyle({ marginBottom: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[9px] outline-none" />
                </label>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <BrandColorSelect label="Arka plan" value={selectedDeviceStyle?.backgroundColor} onChange={(backgroundColor) => patchDeviceStyle({ backgroundColor })} />
                <label className="block">
                  <span className="mb-1 block text-[8px] text-muted">Köşe</span>
                  <input type="number" min={0} max={1000} value={Math.round(numberStyle("borderRadius", selectedMetrics?.borderRadius || 0))} onChange={(event) => patchDeviceStyle({ borderRadius: Number(event.target.value) || 0 })} className="h-9 w-full rounded-lg border border-border-subtle bg-surface-secondary px-2 text-[9px] outline-none" />
                </label>
              </div>
              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[8px] text-muted"><span>Opaklık</span><span>{Math.round(numberStyle("opacity", selectedMetrics?.opacity ?? 1) * 100)}%</span></div>
                <input type="range" min={0.05} max={1} step={0.05} value={numberStyle("opacity", selectedMetrics?.opacity ?? 1)} onChange={(event) => patchDeviceStyle({ opacity: Number(event.target.value) })} className="w-full accent-[#C94A40]" />
              </div>
            </section>
          ) : null}

          <div className="sticky bottom-0 border-t border-border-subtle bg-surface-primary/95 p-2 backdrop-blur">
            <button type="button" onClick={resetSelectedOverride} disabled={!selectedOverride} className="h-8 w-full rounded-lg border border-border-subtle text-[8px] font-medium text-muted active:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-30">Bu öğenin ayarlarını sıfırla</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
