"use client";

import {
  ArrowLeft,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Layers3,
  Monitor,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSaveLifecycle, useSaveLifecycleSource } from "@ruth-commerce/ui";
import { adminAuthHeaders, adminRequest, apiUrl } from "@/lib/adminApi";
import {
  defaultThemeCustomizerSettings,
  normalizeThemeCustomizerSettings,
  type ThemeCustomizerSettings,
  type ThemeNavItem,
} from "@/lib/themeCustomizer";
import {
  createThemeSection,
  defaultThemeSectionSettings,
  normalizeThemeSectionSettings,
  themeSectionPage,
  themeSectionRenderSignature,
  upsertThemeSectionPage,
  type ThemeProductSource,
  type ThemeSection,
  type ThemeSectionPage,
  type ThemeSectionSettings,
  type ThemeSectionType,
} from "@ruth-commerce/commerce-core/theme-sections";
import { useExactToast } from "@/components/base44-exact/primitives";

type Device = "desktop" | "mobile";
type EditorView =
  | "sections"
  | "section"
  | "library"
  | "theme"
  | "theme-colors"
  | "theme-logo"
  | "theme-announcement"
  | "theme-navigation"
  | "theme-whatsapp"
  | "theme-home-media";

type PageItem = {
  path: string;
  label: string;
  group: string;
  previewPath?: string;
  template?: boolean;
};

type CatalogOption = { id: string; name: string; slug?: string; product_count?: number };
type CatalogResponse = { items?: CatalogOption[] };

const RAW_STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://rostacoffecompany.zeabur.app";
const STOREFRONT_URL = RAW_STOREFRONT_URL
  .replace(/^https:\/\/ruthistanbul\.com(?=\/|$)/, "https://rostacoffecompany.zeabur.app")
  .replace(/\/$/, "");

const SECTION_LABELS: Record<ThemeSectionType, string> = {
  hero: "Ana Görsel",
  "scroll-story": "Kayan Görseller",
  collections: "Koleksiyonlar",
  "featured-products": "Öne Çıkan Ürünler",
  "brand-story": "Marka Hikayesi",
  trust: "Güven / Kargo",
  "product-slider": "Ürün Listesi",
  "image-banner": "Görsel Banner",
  "rich-text": "Metin Alanı",
};

const SECTION_LIBRARY: Array<{ type: ThemeSectionType; title: string; detail: string }> = [
  { type: "product-slider", title: "Ürün Listesi", detail: "Ürünleri öne çıkanlardan, koleksiyondan veya kategoriden göster." },
  { type: "image-banner", title: "Görsel Banner", detail: "Görsel, başlık, açıklama ve bağlantı içeren geniş alan." },
  { type: "rich-text", title: "Metin Alanı", detail: "Başlık, açıklama ve bağlantı içeren sade içerik alanı." },
];

const COLOR_FIELDS: Array<[keyof ThemeCustomizerSettings["colors"], string]> = [
  ["ivory", "Ana arka plan"],
  ["cream", "İkincil arka plan"],
  ["ink", "Ana yazı"],
  ["muted", "İkincil yazı"],
  ["gold", "Vurgu"],
  ["goldDark", "Koyu vurgu"],
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
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

function fieldClass() {
  return "h-10 w-full rounded-lg border border-border-subtle bg-surface-secondary px-3 text-[12px] outline-none transition focus:border-accent focus:bg-surface-primary";
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold text-muted">{label}</span>
      {multiline ? (
        <textarea
          rows={4}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full resize-y rounded-lg border border-border-subtle bg-surface-secondary p-3 text-[12px] leading-5 outline-none transition focus:border-accent focus:bg-surface-primary"
        />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={cx(fieldClass(), "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent")} />
      )}
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold text-muted">{label}</span>
      <div className="relative">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)))}
          className={cx(fieldClass(), suffix && "pr-12")}
        />
        {suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[9px] text-subtle">{suffix}</span> : null}
      </div>
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
  detail,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  detail?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-border-subtle bg-surface-primary px-3.5 text-left transition hover:border-border-strong"
    >
      <span className="min-w-0 flex-1">
        <b className="block text-[11px] font-medium">{label}</b>
        {detail ? <small className="mt-0.5 block text-[9px] leading-4 text-muted">{detail}</small> : null}
      </span>
      <span className={cx("relative block h-6 w-11 shrink-0 rounded-full transition-colors", value ? "bg-accent" : "bg-black/15")}>
        <span className={cx("absolute left-1 top-1 h-4 w-4 rounded-full bg-surface-primary shadow-sm transition-transform", value ? "translate-x-5" : "translate-x-0")} />
      </span>
    </button>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold text-muted">{label}</span>
        <span className="text-[9px] tabular-nums text-subtle">{Math.round(value * 10) / 10}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-5 w-full cursor-ew-resize accent-[#C94A40]"
      />
    </div>
  );
}

function Group({ title, children, description }: { title: string; children: ReactNode; description?: string }) {
  return (
    <section className="border-b border-black/[0.065] bg-surface-primary px-4 py-4">
      <h3 className="text-[11px] font-semibold">{title}</h3>
      {description ? <p className="mt-1 text-[9px] leading-4 text-muted">{description}</p> : null}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function ImageUpload({
  value,
  label,
  onChange,
  compact = false,
}: {
  value?: string;
  label: string;
  onChange: (url: string) => void;
  compact?: boolean;
}) {
  const toast = useExactToast();
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Bir görsel dosyası seç.");
      return;
    }
    setBusy(true);
    try {
      const headers = await adminAuthHeaders();
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(apiUrl("/api/products/upload-image"), { method: "POST", headers, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.url) throw new Error(result?.error || "Görsel yüklenemedi.");
      onChange(String(result.url));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Görsel yüklenemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cx("rounded-lg border border-border-subtle bg-surface-secondary", compact ? "p-2" : "p-3")}>
      <div className="flex items-center gap-3">
        {value ? (
          <img src={value} alt="" className={cx("shrink-0 rounded-md border border-border-subtle object-cover", compact ? "h-12 w-12" : "h-16 w-16")} />
        ) : (
          <div className={cx("grid shrink-0 place-items-center rounded-md bg-black/[0.035] text-subtle", compact ? "h-12 w-12" : "h-16 w-16")}>
            <ImagePlus className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-medium">{label}</p>
          <p className="mt-0.5 truncate text-[8px] text-subtle">{value || "Görsel seçilmedi"}</p>
          <label className="mt-2 inline-flex h-7 cursor-pointer items-center rounded-md border border-border-subtle bg-surface-primary px-2.5 text-[9px] font-medium focus-visible:border-accent">
            {busy ? "Yükleniyor…" : value ? "Değiştir" : "Görsel seç"}
            <input hidden type="file" accept="image/*" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
          </label>
        </div>
        {value ? (
          <button type="button" onClick={() => onChange("")} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-subtle active:bg-accent-soft focus-visible:bg-accent-soft focus-visible:text-main">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ThemeMenuItem({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 border-b border-border-subtle px-4 text-left transition hover:bg-accent-soft">
      <span className="min-w-0 flex-1">
        <b className="block text-[11px] font-medium">{title}</b>
        <small className="mt-0.5 block text-[9px] leading-4 text-muted">{detail}</small>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
    </button>
  );
}

export function VisualThemeCustomizerV4() {
  const toast = useExactToast();
  const saveLifecycle = useSaveLifecycle();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const visualRevisionRef = useRef(0);
  const sectionRevisionRef = useRef(0);
  const sectionRequestRef = useRef(0);
  const renderedSignatureRef = useRef(themeSectionRenderSignature(defaultThemeSectionSettings));

  const [visual, setVisual] = useState<ThemeCustomizerSettings>(defaultThemeCustomizerSettings);
  const [visualSaved, setVisualSaved] = useState<ThemeCustomizerSettings>(defaultThemeCustomizerSettings);
  const [sections, setSections] = useState<ThemeSectionSettings>(defaultThemeSectionSettings);
  const [sectionsSaved, setSectionsSaved] = useState<ThemeSectionSettings>(defaultThemeSectionSettings);
  const [pages, setPages] = useState<PageItem[]>([{ path: "/", label: "Ana Sayfa", group: "Sayfalar" }]);
  const [collections, setCollections] = useState<CatalogOption[]>([]);
  const [categories, setCategories] = useState<CatalogOption[]>([]);
  const [activePageKey, setActivePageKey] = useState("/");
  const [view, setView] = useState<EditorView>("sections");
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(Date.now());
  const [dragId, setDragId] = useState<string | null>(null);
  const [previewToken] = useState(() => `theme_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`);

  const visualDirty = JSON.stringify(visual) !== JSON.stringify(visualSaved);
  const sectionsDirty = JSON.stringify(sections) !== JSON.stringify(sectionsSaved);
  const renderSignature = useMemo(() => themeSectionRenderSignature(sections), [sections]);

  const activePage = useMemo(
    () => pages.find((item) => item.path === activePageKey) || pages[0] || { path: "/", label: "Ana Sayfa", group: "Sayfalar" },
    [activePageKey, pages],
  );
  const previewPath = cleanPath(activePage.previewPath || activePage.path || "/");
  const managedPage = themeSectionPage(sections, activePageKey);
  const canManageSections = Boolean(sections.pages[activePageKey]) || activePageKey === "/" || activePageKey.startsWith("/pages/");
  const selectedSection = managedPage.sections.find((item) => item.id === selectedSectionId) || null;

  const groupedPages = useMemo(() => {
    const map = new Map<string, PageItem[]>();
    for (const item of pages) {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [pages]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [visualResult, sectionResult, pageResult, collectionResult, categoryResult] = await Promise.all([
        adminRequest<{ settings?: unknown }>(`/api/theme?t=${Date.now()}`),
        adminRequest<{ settings?: unknown }>(`/api/theme-sections?t=${Date.now()}`),
        adminRequest<{ pages?: PageItem[] }>(`/api/theme-editor-pages?t=${Date.now()}`, { force: true, timeoutMs: 7_000 }).catch(() => ({ pages: [] })),
        adminRequest<CatalogResponse>("/api/catalog-groups?type=collection").catch(() => ({ items: [] })),
        adminRequest<CatalogResponse>("/api/catalog-groups?type=category").catch(() => ({ items: [] })),
      ]);

      const nextVisual = normalizeThemeCustomizerSettings(visualResult.settings);
      const nextSections = normalizeThemeSectionSettings(sectionResult.settings);
      setVisual(nextVisual);
      setVisualSaved(nextVisual);
      setSections(nextSections);
      setSectionsSaved(nextSections);
      renderedSignatureRef.current = themeSectionRenderSignature(nextSections);
      if (Array.isArray(pageResult.pages) && pageResult.pages.length) setPages(pageResult.pages);
      setCollections(collectionResult.items || []);
      setCategories(categoryResult.items || []);
      setNonce(Date.now());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tema düzenleyici yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const sendVisualDraft = useCallback((settings: ThemeCustomizerSettings) => {
    const revision = ++visualRevisionRef.current;
    iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SETTINGS", settings, revision }, "*");
  }, []);

  const sendSectionDraft = useCallback((settings: ThemeSectionSettings) => {
    const revision = ++sectionRevisionRef.current;
    iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SECTION_DRAFT_LOCAL", path: previewPath, settings, revision }, "*");
  }, [previewPath]);

  useEffect(() => {
    if (!loading) sendVisualDraft(visual);
  }, [loading, sendVisualDraft, visual]);

  useEffect(() => {
    if (loading || !sectionsDirty || !canManageSections) return;
    sendSectionDraft(sections);

    const requestId = ++sectionRequestRef.current;
    const needsServerRender = renderSignature !== renderedSignatureRef.current;
    const timer = window.setTimeout(() => {
      void adminRequest("/api/theme-sections", {
        method: "POST",
        body: JSON.stringify({ token: previewToken, settings: sections }),
        confirmation: false,
      }).then(() => {
        if (requestId !== sectionRequestRef.current || !needsServerRender) return;
        renderedSignatureRef.current = renderSignature;
        const frame = iframeRef.current;
        if (!frame) return;
        const url = new URL(frame.src || `${STOREFRONT_URL}${previewPath}`);
        url.pathname = previewPath;
        url.searchParams.set("themeEditor", "1");
        url.searchParams.set("themePreview", String(Date.now()));
        url.searchParams.set("themeSectionsPreview", previewToken);
        frame.src = url.toString();
      }).catch(() => undefined);
    }, 320);

    return () => window.clearTimeout(timer);
  }, [canManageSections, loading, previewPath, previewToken, renderSignature, sections, sectionsDirty, sendSectionDraft]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || !event.data || typeof event.data !== "object") return;
      if (event.data.type === "RUTH_THEME_EDITOR_READY") {
        window.setTimeout(() => {
          sendVisualDraft(visual);
          if (sectionsDirty && canManageSections) sendSectionDraft(sections);
        }, 20);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [canManageSections, sections, sectionsDirty, sendSectionDraft, sendVisualDraft, visual]);

  const publishVisual = useCallback(async (silent = false) => {
    if (!visualDirty) return true;
    try {
      const result = await adminRequest<{ settings?: unknown; warning?: string }>("/api/theme", {
        method: "PUT",
        body: JSON.stringify({ settings: visual }),
        confirmation: false,
      });
      const next = normalizeThemeCustomizerSettings(result.settings || visual);
      setVisual(next);
      setVisualSaved(next);
      if (!silent) toast.success(result.warning ? `Tema kaydedildi. ${result.warning}` : "Tema kaydedildi.");
      return true;
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Tema ayarları kaydedilemedi.");
      return false;
    }
  }, [toast, visual, visualDirty]);

  const publishSections = useCallback(async (silent = false) => {
    if (!sectionsDirty) return true;
    try {
      const result = await adminRequest<{ settings?: unknown }>("/api/theme-sections", {
        method: "PUT",
        body: JSON.stringify({ settings: sections }),
        confirmation: false,
      });
      const next = normalizeThemeSectionSettings(result.settings || sections);
      setSections(next);
      setSectionsSaved(next);
      renderedSignatureRef.current = themeSectionRenderSignature(next);
      setNonce(Date.now());
      if (!silent) toast.success("Bölümler kaydedildi.");
      return true;
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Bölümler kaydedilemedi.");
      return false;
    }
  }, [sections, sectionsDirty, toast]);

  const discardVisualDraft = useCallback(() => setVisual(visualSaved), [visualSaved]);
  const discardSections = useCallback(() => {
    setSections(sectionsSaved);
    renderedSignatureRef.current = themeSectionRenderSignature(sectionsSaved);
    setNonce(Date.now());
  }, [sectionsSaved]);

  useSaveLifecycleSource({
    id: "theme-visual",
    dirty: visualDirty,
    save: () => publishVisual(true),
    discard: discardVisualDraft,
  });
  useSaveLifecycleSource({
    id: "theme-sections",
    dirty: sectionsDirty,
    save: () => publishSections(true),
    discard: discardSections,
  });

  // Keep the canonical shared save lifecycle as the only save/leave authority.
  const lifecycleDirty = saveLifecycle.dirty;
  const lifecycleSaving = saveLifecycle.saving;

  const saveAll = useCallback(async () => {
    const ok = await saveLifecycle.save();
    if (ok) toast.success("Tema değişiklikleri kaydedildi.");
    else toast.error("Bazı tema değişiklikleri kaydedilemedi. Düzenlemelerin korunuyor.");
  }, [saveLifecycle, toast]);

  const discardAll = () => {
    setVisual(visualSaved);
    setSections(sectionsSaved);
    renderedSignatureRef.current = themeSectionRenderSignature(sectionsSaved);
    setNonce(Date.now());
    toast.success("Kaydedilmemiş değişiklikler geri alındı.");
  };

  const changePage = (key: string) => {
    const item = pages.find((candidate) => candidate.path === key);
    if (!item || (!item.previewPath && item.template)) {
      toast.error("Bu şablon için önizlenecek kayıt bulunamadı.");
      return;
    }

    void saveLifecycle.requestTransition(() => {
      setActivePageKey(key);
      setSelectedSectionId(null);
      setView("sections");
      const path = cleanPath(item.previewPath || item.path);
      const frame = iframeRef.current;
      if (!frame) return;
      const url = new URL(`${STOREFRONT_URL}${path}`);
      url.searchParams.set("themeEditor", "1");
      url.searchParams.set("themePreview", String(Date.now()));
      frame.src = url.toString();
    });
  };

  const setManagedPage = (page: ThemeSectionPage) => setSections((current) => upsertThemeSectionPage(current, page));

  const patchSection = (patch: Partial<ThemeSection>) => {
    if (!selectedSection) return;
    setManagedPage({
      ...managedPage,
      sections: managedPage.sections.map((section) => section.id === selectedSection.id ? { ...section, ...patch } : section),
    });
  };

  const toggleSection = (id: string) => {
    setManagedPage({
      ...managedPage,
      sections: managedPage.sections.map((section) => section.id === id ? { ...section, enabled: !section.enabled } : section),
    });
  };

  const removeSection = (id: string) => {
    setManagedPage({ ...managedPage, sections: managedPage.sections.filter((section) => section.id !== id) });
    if (selectedSectionId === id) {
      setSelectedSectionId(null);
      setView("sections");
    }
  };

  const addSection = (type: ThemeSectionType) => {
    const section = createThemeSection(type, `${type}-${Date.now()}`);
    setManagedPage({ ...managedPage, sections: [...managedPage.sections, section] });
    setSelectedSectionId(section.id);
    setView("section");
  };

  const dropSection = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const sourceIndex = managedPage.sections.findIndex((section) => section.id === dragId);
    const targetIndex = managedPage.sections.findIndex((section) => section.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...managedPage.sections];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setManagedPage({ ...managedPage, sections: next });
    setDragId(null);
  };

  const patchVisual = (patch: Partial<ThemeCustomizerSettings>) => setVisual((current) => ({ ...current, ...patch }));

  const patchMenuLink = (id: string, patch: Partial<ThemeNavItem>) => {
    setVisual((current) => ({
      ...current,
      header: {
        ...current.header,
        links: current.header.links.map((item) => item.id === id ? { ...item, ...patch } : item),
      },
    }));
  };

  const addMenuLink = () => {
    setVisual((current) => ({
      ...current,
      header: {
        ...current.header,
        links: [...current.header.links, { id: `link-${Date.now()}`, label: "Yeni bağlantı", path: "/", side: "left", children: [] }],
      },
    }));
  };

  const removeMenuLink = (id: string) => {
    setVisual((current) => ({
      ...current,
      header: { ...current.header, links: current.header.links.filter((item) => item.id !== id) },
    }));
  };

  const titleForView = () => {
    if (view === "section" && selectedSection) return SECTION_LABELS[selectedSection.type];
    if (view === "library") return "Yeni Bölüm Ekle";
    if (view === "theme") return "Tema Ayarları";
    if (view === "theme-colors") return "Renkler";
    if (view === "theme-logo") return "Logo";
    if (view === "theme-announcement") return "Duyuru Alanı";
    if (view === "theme-navigation") return "Üst Menü";
    if (view === "theme-whatsapp") return "WhatsApp";
    if (view === "theme-home-media") return "Anasayfa Görselleri";
    return activePage.label || "Bölümler";
  };

  const back = () => {
    if (view === "section" || view === "library") {
      setView("sections");
      if (view === "section") setSelectedSectionId(null);
      return;
    }
    if (view.startsWith("theme-") && view !== "theme") {
      setView("theme");
      return;
    }
    if (view === "theme") setView("sections");
  };

  const sliderSection = selectedSection?.type === "product-slider" || selectedSection?.type === "featured-products";
  const customSection = sliderSection || selectedSection?.type === "image-banner" || selectedSection?.type === "rich-text";
  const previewUrl = `${STOREFRONT_URL}${previewPath === "/" ? "/" : previewPath}?themeEditor=1&themePreview=${nonce}`;

  return (
    <div className="fixed inset-0 z-[90] flex min-h-0 flex-col bg-background text-main" data-theme-customizer-v4>
      <header className="flex h-[64px] min-h-[64px] shrink-0 items-center border-b border-border-subtle bg-surface-primary px-3 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <a href="/" aria-label="Panele dön" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border-subtle active:bg-accent-soft focus-visible:bg-accent-soft">
            <X className="h-4 w-4" />
          </a>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-[12px] font-semibold">Mağaza Tasarımı</p>
            <p className="mt-0.5 text-[8px] text-subtle">İçerik ve görünüm</p>
          </div>
        </div>

        <div className="mx-2 flex min-w-0 flex-[1.4] items-center justify-center gap-2">
          <select
            value={activePageKey}
            onChange={(event) => changePage(event.target.value)}
            className="h-9 w-full max-w-[330px] rounded-lg border border-border-subtle bg-surface-primary px-3 text-[11px] font-medium outline-none hover:border-border-strong"
            aria-label="Düzenlenecek sayfa"
          >
            {groupedPages.map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}
              </optgroup>
            ))}
          </select>
          <div className="hidden rounded-lg bg-black/[0.045] p-1 sm:flex">
            <button type="button" onClick={() => setDevice("desktop")} className={cx("grid h-7 w-8 place-items-center rounded-md", device === "desktop" ? "bg-surface-primary shadow-sm" : "text-muted")} aria-label="Masaüstü önizleme"><Monitor className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => setDevice("mobile")} className={cx("grid h-7 w-8 place-items-center rounded-md", device === "mobile" ? "bg-surface-primary shadow-sm" : "text-muted")} aria-label="Mobil önizleme"><Smartphone className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          {lifecycleDirty ? <button type="button" onClick={discardAll} disabled={lifecycleSaving} className="hidden h-9 rounded-lg border border-border-subtle px-3 text-[9px] font-medium active:bg-accent-soft focus-visible:bg-accent-soft disabled:opacity-40 sm:inline-flex sm:items-center">Geri al</button> : null}
          <button type="button" onClick={() => void saveAll()} disabled={!lifecycleDirty || loading || lifecycleSaving} className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-[9px] font-semibold text-[var(--rosta-action-text)] active:bg-[var(--rosta-espresso)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-35">
            {lifecycleSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Kaydet
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="order-2 flex h-[48dvh] w-full shrink-0 flex-col border-t border-border-subtle bg-surface-primary md:order-1 md:h-full md:w-[360px] md:border-r md:border-t-0">
          <div className="flex h-[54px] shrink-0 items-center gap-2 border-b border-border-subtle px-3">
            {view !== "sections" ? (
              <button type="button" onClick={back} className="grid h-8 w-8 shrink-0 place-items-center rounded-md active:bg-accent-soft focus-visible:bg-accent-soft"><ArrowLeft className="h-4 w-4" /></button>
            ) : (
              <Layers3 className="ml-1 h-4 w-4 shrink-0 text-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold">{titleForView()}</p>
              {view === "sections" ? <p className="mt-0.5 truncate text-[8px] text-subtle">{managedPage.sections.length} bölüm</p> : null}
            </div>
            {view === "sections" && canManageSections ? (
              <button type="button" onClick={() => setView("library")} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-2.5 text-[9px] font-medium focus-visible:border-accent"><Plus className="h-3.5 w-3.5" />Ekle</button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="grid h-full place-items-center p-6 text-center">
                <div><RefreshCw className="mx-auto h-5 w-5 animate-spin text-subtle" /><p className="mt-3 text-[10px] text-muted">Tema ayarları hazırlanıyor…</p></div>
              </div>
            ) : null}

            {!loading && view === "sections" ? (
              canManageSections ? (
                <div className="pb-4">
                  <div className="space-y-1.5 p-3">
                    {managedPage.sections.map((section) => (
                      <div
                        key={section.id}
                        draggable
                        onDragStart={() => setDragId(section.id)}
                        onDragEnd={() => setDragId(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => dropSection(section.id)}
                        className={cx("group flex min-h-[50px] items-center gap-1 rounded-lg border bg-surface-primary px-1.5 transition", dragId === section.id ? "border-accent/45 opacity-55" : "border-border-subtle focus-visible:border-accent")}
                      >
                        <span className="grid h-9 w-7 shrink-0 cursor-grab place-items-center text-subtle active:cursor-grabbing"><GripVertical className="h-4 w-4" /></span>
                        <button type="button" onClick={() => { setSelectedSectionId(section.id); setView("section"); }} className="min-w-0 flex-1 py-2 text-left">
                          <b className="block truncate text-[10px] font-medium">{SECTION_LABELS[section.type]}</b>
                          <small className="mt-0.5 block truncate text-[8px] text-subtle">{section.enabled ? "Gösteriliyor" : "Gizli"}</small>
                        </button>
                        <button type="button" onClick={() => toggleSection(section.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted active:bg-accent-soft focus-visible:bg-accent-soft" aria-label={section.enabled ? "Gizle" : "Göster"}>
                          {section.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>
                        {!["hero", "scroll-story", "collections", "featured-products", "brand-story", "trust"].includes(section.type) ? (
                          <button type="button" onClick={() => removeSection(section.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-subtle opacity-0 transition active:bg-danger-soft active:text-danger focus-visible:bg-danger-soft focus-visible:text-danger group-focus-within:opacity-100 md:group-hover:opacity-100" aria-label="Sil"><Trash2 className="h-3.5 w-3.5" /></button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => setView("library")} className="mx-3 flex h-10 w-[calc(100%-24px)] items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong text-[9px] font-medium text-muted focus-visible:border-accent hover:bg-accent-soft"><Plus className="h-3.5 w-3.5" />Yeni Bölüm Ekle</button>
                </div>
              ) : (
                <div className="p-4">
                  <div className="rounded-xl border border-border-subtle bg-surface-secondary p-4">
                    <p className="text-[11px] font-semibold">Bu sayfa hazır tema şablonunu kullanıyor</p>
                    <p className="mt-2 text-[9px] leading-5 text-muted">Bu ekranda tek tek site öğelerine ayrı override vermiyoruz. Sayfanın düzeni tema bileşenlerinden gelir; ortak görünümü Tema Ayarları’ndan yönetebilirsin.</p>
                  </div>
                </div>
              )
            ) : null}

            {!loading && view === "library" ? (
              <div className="p-3">
                <p className="px-1 pb-3 text-[9px] leading-4 text-muted">Sayfaya eklemek istediğin hazır bölümü seç. Eklendikten sonra yalnızca o bölümün gerekli ayarları gösterilir.</p>
                <div className="space-y-2">
                  {SECTION_LIBRARY.map((item) => (
                    <button key={item.type} type="button" onClick={() => addSection(item.type)} className="flex min-h-[62px] w-full items-center gap-3 rounded-lg border border-border-subtle bg-surface-primary px-3 text-left focus-visible:border-accent hover:bg-accent-soft">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Plus className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><b className="block text-[10px] font-medium">{item.title}</b><small className="mt-1 block text-[8px] leading-4 text-muted">{item.detail}</small></span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {!loading && view === "section" && selectedSection ? (
              <div className="pb-16">
                <Group title="Bölüm"><Toggle label="Bu bölümü göster" value={selectedSection.enabled} onChange={(enabled) => patchSection({ enabled })} /></Group>

                {selectedSection.type === "hero" ? (
                  <Group title="İçerik" description="Ana görsel bu temada ortak anasayfa görsel ayarından gelir.">
                    <button type="button" onClick={() => setView("theme-home-media")} className="flex h-11 w-full items-center justify-between rounded-lg border border-border-subtle px-3 text-[10px] font-medium focus-visible:border-accent"><span>Anasayfa görsellerini düzenle</span><ChevronRight className="h-4 w-4 text-subtle" /></button>
                  </Group>
                ) : null}

                {selectedSection.type === "scroll-story" ? (
                  <Group title="İçerik" description="Kayan görseller tek bir yerde yönetilir.">
                    <button type="button" onClick={() => setView("theme-home-media")} className="flex h-11 w-full items-center justify-between rounded-lg border border-border-subtle px-3 text-[10px] font-medium focus-visible:border-accent"><span>Kayan görselleri düzenle</span><ChevronRight className="h-4 w-4 text-subtle" /></button>
                  </Group>
                ) : null}

                {selectedSection.type === "collections" ? (
                  <Group title="İçerik"><p className="rounded-lg bg-surface-secondary p-3 text-[9px] leading-5 text-muted">Bu bölüm paneldeki koleksiyon kayıtlarından otomatik beslenir. Burada yalnızca sıralama ve görünürlük yönetilir.</p></Group>
                ) : null}
                {selectedSection.type === "brand-story" ? (
                  <Group title="İçerik"><p className="rounded-lg bg-surface-secondary p-3 text-[9px] leading-5 text-muted">Marka hikayesi hazır tema bileşenidir. DOM öğesi seçip stil override etme mantığı bu editörden kaldırıldı.</p></Group>
                ) : null}
                {selectedSection.type === "trust" ? (
                  <Group title="İçerik"><p className="rounded-lg bg-surface-secondary p-3 text-[9px] leading-5 text-muted">Kargo ve güven bilgileri mağaza ayarlarından beslenir. Bu bölümde görünürlük ve sıralama yönetilir.</p></Group>
                ) : null}

                {sliderSection ? (
                  <>
                    <Group title="Ürün kaynağı">
                      <label className="block">
                        <span className="mb-1.5 block text-[10px] font-semibold text-muted">Gösterilecek ürünler</span>
                        <select
                          value={selectedSection.productSource || "featured"}
                          onChange={(event) => {
                            const next = event.target.value as ThemeProductSource;
                            patchSection({ productSource: next, productSourceId: next === "collection" ? collections[0]?.id : next === "category" ? categories[0]?.id : undefined });
                          }}
                          className={cx(fieldClass(), "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent")}
                        >
                          <option value="featured">Öne Çıkanlar</option>
                          <option value="all">Tüm Ürünler</option>
                          <option value="collection">Koleksiyon</option>
                          <option value="category">Kategori</option>
                        </select>
                      </label>
                      {selectedSection.productSource === "collection" ? (
                        <label className="block"><span className="mb-1.5 block text-[10px] font-semibold text-muted">Koleksiyon</span><select value={selectedSection.productSourceId || collections[0]?.id || ""} onChange={(event) => patchSection({ productSourceId: event.target.value })} className={cx(fieldClass(), "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent")}>{collections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                      ) : null}
                      {selectedSection.productSource === "category" ? (
                        <label className="block"><span className="mb-1.5 block text-[10px] font-semibold text-muted">Kategori</span><select value={selectedSection.productSourceId || categories[0]?.id || ""} onChange={(event) => patchSection({ productSourceId: event.target.value })} className={cx(fieldClass(), "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent")}>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                      ) : null}
                    </Group>
                    <Group title="Başlık">
                      <TextField label="Üst başlık" value={selectedSection.eyebrow || ""} onChange={(eyebrow) => patchSection({ eyebrow })} />
                      <TextField label="Başlık" value={selectedSection.title || ""} onChange={(title) => patchSection({ title })} />
                      <TextField label="Bağlantı yazısı" value={selectedSection.linkLabel || ""} onChange={(linkLabel) => patchSection({ linkLabel })} />
                      <TextField label="Bağlantı" value={selectedSection.linkHref || ""} onChange={(linkHref) => patchSection({ linkHref })} placeholder="/products" />
                    </Group>
                    <Group title="Ürün düzeni">
                      <Range label="Toplam ürün" value={selectedSection.productLimit || 12} min={1} max={40} onChange={(productLimit) => patchSection({ productLimit: Math.round(productLimit) })} />
                      <Range label="Masaüstünde yan yana" value={selectedSection.desktopItems || 4} min={1} max={8} onChange={(desktopItems) => patchSection({ desktopItems: Math.round(desktopItems) })} />
                      <Range label="Mobilde yan yana" value={selectedSection.mobileItems || 2} min={1} max={4} onChange={(mobileItems) => patchSection({ mobileItems: Math.round(mobileItems) })} />
                      <Range label="Ürün aralığı" value={selectedSection.gap ?? 12} min={0} max={60} suffix=" px" onChange={(gap) => patchSection({ gap })} />
                      <Range label="Üst / alt boşluk" value={selectedSection.paddingY ?? 64} min={0} max={200} suffix=" px" onChange={(paddingY) => patchSection({ paddingY })} />
                      <Toggle label="Kaydırma oklarını göster" value={selectedSection.showArrows !== false} onChange={(showArrows) => patchSection({ showArrows })} />
                    </Group>
                  </>
                ) : null}

                {selectedSection.type === "image-banner" ? (
                  <>
                    <Group title="Görsel"><ImageUpload label="Banner görseli" value={selectedSection.imageSrc} onChange={(imageSrc) => patchSection({ imageSrc })} /></Group>
                    <Group title="İçerik">
                      <TextField label="Üst başlık" value={selectedSection.eyebrow || ""} onChange={(eyebrow) => patchSection({ eyebrow })} />
                      <TextField label="Başlık" value={selectedSection.title || ""} onChange={(title) => patchSection({ title })} />
                      <TextField label="Açıklama" value={selectedSection.body || ""} onChange={(body) => patchSection({ body })} multiline />
                      <TextField label="Bağlantı yazısı" value={selectedSection.linkLabel || ""} onChange={(linkLabel) => patchSection({ linkLabel })} />
                      <TextField label="Bağlantı" value={selectedSection.linkHref || ""} onChange={(linkHref) => patchSection({ linkHref })} />
                    </Group>
                    <Group title="Boyut">
                      <Range label="Masaüstü yüksekliği" value={selectedSection.desktopHeight || 520} min={180} max={1100} suffix=" px" onChange={(desktopHeight) => patchSection({ desktopHeight })} />
                      <Range label="Mobil yüksekliği" value={selectedSection.mobileHeight || 360} min={160} max={900} suffix=" px" onChange={(mobileHeight) => patchSection({ mobileHeight })} />
                      <Range label="Köşe yuvarlaklığı" value={selectedSection.borderRadius || 0} min={0} max={80} suffix=" px" onChange={(borderRadius) => patchSection({ borderRadius })} />
                    </Group>
                  </>
                ) : null}

                {selectedSection.type === "rich-text" ? (
                  <>
                    <Group title="İçerik">
                      <TextField label="Üst başlık" value={selectedSection.eyebrow || ""} onChange={(eyebrow) => patchSection({ eyebrow })} />
                      <TextField label="Başlık" value={selectedSection.title || ""} onChange={(title) => patchSection({ title })} />
                      <TextField label="Açıklama" value={selectedSection.body || ""} onChange={(body) => patchSection({ body })} multiline />
                      <TextField label="Bağlantı yazısı" value={selectedSection.linkLabel || ""} onChange={(linkLabel) => patchSection({ linkLabel })} />
                      <TextField label="Bağlantı" value={selectedSection.linkHref || ""} onChange={(linkHref) => patchSection({ linkHref })} />
                    </Group>
                    <Group title="Boşluk"><Range label="Üst / alt boşluk" value={selectedSection.paddingY ?? 64} min={0} max={220} suffix=" px" onChange={(paddingY) => patchSection({ paddingY })} /></Group>
                  </>
                ) : null}

                {customSection ? (
                  <Group title="Renkler">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="rounded-lg border border-border-subtle bg-surface-secondary p-2.5"><span className="mb-2 block text-[9px] text-muted">Arka plan</span><div className="flex items-center gap-2"><input type="color" value={selectedSection.backgroundColor || "#ffffff"} onChange={(event) => patchSection({ backgroundColor: event.target.value })} className="h-7 w-9 border-0 bg-transparent p-0" /><span className="text-[8px] text-subtle">{selectedSection.backgroundColor || "Tema rengi"}</span></div></label>
                      <label className="rounded-lg border border-border-subtle bg-surface-secondary p-2.5"><span className="mb-2 block text-[9px] text-muted">Yazı</span><div className="flex items-center gap-2"><input type="color" value={selectedSection.textColor || "#111111"} onChange={(event) => patchSection({ textColor: event.target.value })} className="h-7 w-9 border-0 bg-transparent p-0" /><span className="text-[8px] text-subtle">{selectedSection.textColor || "Tema rengi"}</span></div></label>
                    </div>
                  </Group>
                ) : null}
              </div>
            ) : null}

            {!loading && view === "theme" ? (
              <div>
                <ThemeMenuItem title="Renkler" detail="Sitenin ortak renk paleti" onClick={() => setView("theme-colors")} />
                <ThemeMenuItem title="Logo" detail="Logo görseli ve masaüstü / mobil boyutu" onClick={() => setView("theme-logo")} />
                <ThemeMenuItem title="Duyuru Alanı" detail="Üstte gösterilen kampanya ve bilgilendirme metni" onClick={() => setView("theme-announcement")} />
                <ThemeMenuItem title="Üst Menü" detail="Menü bağlantıları" onClick={() => setView("theme-navigation")} />
                <ThemeMenuItem title="WhatsApp" detail="Sabit WhatsApp butonu" onClick={() => setView("theme-whatsapp")} />
                <ThemeMenuItem title="Anasayfa Görselleri" detail="Hero ve kayan görseller" onClick={() => setView("theme-home-media")} />
              </div>
            ) : null}

            {!loading && view === "theme-colors" ? (
              <Group title="Tema renkleri" description="Bu renkler bağlı tüm tema alanlarında tek noktadan kullanılır.">
                {COLOR_FIELDS.map(([key, label]) => (
                  <label key={key} className="flex h-11 items-center gap-3 rounded-lg border border-border-subtle bg-surface-secondary px-3">
                    <input type="color" value={visual.colors[key]} onChange={(event) => patchVisual({ colors: { ...visual.colors, [key]: event.target.value } })} className="h-7 w-9 border-0 bg-transparent p-0" />
                    <span className="min-w-0 flex-1 text-[10px] font-medium">{label}</span>
                    <span className="text-[8px] uppercase text-subtle">{visual.colors[key]}</span>
                  </label>
                ))}
              </Group>
            ) : null}

            {!loading && view === "theme-logo" ? (
              <div>
                <Group title="Logo"><ImageUpload label="Site logosu" value={visual.logo.src} onChange={(src) => patchVisual({ logo: { ...visual.logo, src } })} /></Group>
                <Group title="Boyut"><Range label="Masaüstü logo genişliği" value={visual.logo.desktopWidth} min={60} max={420} suffix=" px" onChange={(desktopWidth) => patchVisual({ logo: { ...visual.logo, desktopWidth } })} /><Range label="Mobil logo genişliği" value={visual.logo.mobileWidth} min={40} max={300} suffix=" px" onChange={(mobileWidth) => patchVisual({ logo: { ...visual.logo, mobileWidth } })} /></Group>
              </div>
            ) : null}

            {!loading && view === "theme-announcement" ? (
              <Group title="Duyuru alanı">
                <Toggle label="Duyuru alanını göster" value={visual.announcement.enabled} onChange={(enabled) => patchVisual({ announcement: { ...visual.announcement, enabled } })} />
                <TextField label="Birinci metin" value={visual.announcement.text} onChange={(text) => patchVisual({ announcement: { ...visual.announcement, text } })} />
                <TextField label="İkinci metin" value={visual.announcement.text2} onChange={(text2) => patchVisual({ announcement: { ...visual.announcement, text2 } })} />
                <TextField label="Bağlantı" value={visual.announcement.href} onChange={(href) => patchVisual({ announcement: { ...visual.announcement, href } })} />
                <NumberField label="Metin değişim süresi" value={visual.announcement.intervalSeconds} min={2} max={30} suffix="sn" onChange={(intervalSeconds) => patchVisual({ announcement: { ...visual.announcement, intervalSeconds } })} />
              </Group>
            ) : null}

            {!loading && view === "theme-navigation" ? (
              <div className="pb-16">
                <Group title="Üst menü" description="Yalnızca mağaza sahibinin ihtiyacı olan bağlantı alanları gösterilir.">
                  {visual.header.links.map((item) => (
                    <div key={item.id} className="rounded-lg border border-border-subtle bg-surface-secondary p-3">
                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <TextField label="Başlık" value={item.label} onChange={(label) => patchMenuLink(item.id, { label })} />
                        <button type="button" onClick={() => removeMenuLink(item.id)} className="mt-[18px] grid h-10 w-10 place-items-center rounded-lg text-black/30 active:bg-danger-soft active:text-danger focus-visible:bg-danger-soft focus-visible:text-danger"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      <div className="mt-3 grid grid-cols-[1fr_110px] gap-2">
                        <TextField label="Bağlantı" value={item.path} onChange={(path) => patchMenuLink(item.id, { path })} />
                        <label className="block"><span className="mb-1.5 block text-[10px] font-semibold text-muted">Konum</span><select value={item.side || "left"} onChange={(event) => patchMenuLink(item.id, { side: event.target.value === "right" ? "right" : "left" })} className={cx(fieldClass(), "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent")}><option value="left">Sol</option><option value="right">Sağ</option></select></label>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addMenuLink} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong text-[9px] font-medium focus-visible:border-accent"><Plus className="h-3.5 w-3.5" />Bağlantı ekle</button>
                </Group>
              </div>
            ) : null}

            {!loading && view === "theme-whatsapp" ? (
              <Group title="WhatsApp">
                <Toggle label="WhatsApp butonunu göster" value={visual.whatsapp.enabled} onChange={(enabled) => patchVisual({ whatsapp: { ...visual.whatsapp, enabled } })} />
                <TextField label="Telefon" value={visual.whatsapp.phone} onChange={(phone) => patchVisual({ whatsapp: { ...visual.whatsapp, phone } })} placeholder="90850..." />
                <TextField label="Buton yazısı" value={visual.whatsapp.label} onChange={(label) => patchVisual({ whatsapp: { ...visual.whatsapp, label } })} />
              </Group>
            ) : null}

            {!loading && view === "theme-home-media" ? (
              <div className="pb-16">
                <Group title="Ana görsel"><ImageUpload label="Anasayfa hero görseli" value={visual.homepageImages.heroImage} onChange={(heroImage) => patchVisual({ homepageImages: { ...visual.homepageImages, heroImage } })} /></Group>
                <Group title="Kayan görseller" description="Görseller listedeki sırayla gösterilir.">
                  {visual.homepageImages.scrollImages.map((image, index) => (
                    <ImageUpload
                      key={`${image}-${index}`}
                      compact
                      label={`Görsel ${index + 1}`}
                      value={image}
                      onChange={(url) => patchVisual({ homepageImages: { ...visual.homepageImages, scrollImages: visual.homepageImages.scrollImages.map((item, itemIndex) => itemIndex === index ? url : item).filter(Boolean) } })}
                    />
                  ))}
                  {visual.homepageImages.scrollImages.length < 12 ? (
                    <ImageUpload compact label="Yeni görsel ekle" value="" onChange={(url) => { if (url) patchVisual({ homepageImages: { ...visual.homepageImages, scrollImages: [...visual.homepageImages.scrollImages, url] } }); }} />
                  ) : null}
                </Group>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-border-subtle bg-surface-primary p-3">
            <button type="button" onClick={() => setView(view === "theme" ? "sections" : "theme")} className={cx("flex h-10 w-full items-center gap-2 rounded-lg px-3 text-[10px] font-medium transition", view.startsWith("theme") ? "bg-accent-soft text-accent" : "active:bg-accent-soft focus-visible:bg-accent-soft")}><Palette className="h-4 w-4" />Tema Ayarları</button>
          </div>
        </aside>

        <main className="order-1 flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background p-3 md:order-2 md:p-5">
          <div className={cx("relative overflow-hidden bg-surface-primary shadow-[0_10px_40px_rgba(15,23,42,.08)] transition-all duration-300", device === "mobile" ? "h-full max-h-[820px] w-[430px] max-w-full rounded-[24px] border border-border-subtle" : "h-full w-full rounded-xl border border-border-subtle")}>
            <iframe
              ref={iframeRef}
              key={`${previewPath}-${nonce}`}
              src={previewUrl}
              title="Mağaza önizleme"
              className="h-full w-full border-0 bg-surface-primary"
              onLoad={() => {
                window.setTimeout(() => {
                  sendVisualDraft(visual);
                  if (sectionsDirty && canManageSections) sendSectionDraft(sections);
                }, 40);
              }}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
