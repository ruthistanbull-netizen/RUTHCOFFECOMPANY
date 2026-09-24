"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Layers3,
  Palette,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useSaveLifecycleSource } from "@ruth-commerce/ui";
import { adminAuthHeaders, adminRequest, apiUrl } from "@/lib/adminApi";
import { useExactToast } from "@/components/base44-exact/primitives";
import {
  createThemeSection,
  defaultThemeSectionSettings,
  normalizeThemeSectionSettings,
  themeSectionRenderSignature,
  themeSectionPage,
  upsertThemeSectionPage,
  type ThemeProductSource,
  type ThemeSection,
  type ThemeSectionPage,
  type ThemeSectionSettings,
  type ThemeSectionType,
} from "@ruth-commerce/commerce-core/theme-sections";

type InnerItem = { id: string; label: string; tag: string; kind: string };
type CatalogOption = { id: string; name: string; slug: string; product_count?: number };
type CatalogResponse = { items?: CatalogOption[] };
type ContextPoint = { x: number; y: number; viewportWidth: number; viewportHeight: number };
type ContextPanel = { x: number; y: number; sectionId: string; elementId: string; point: ContextPoint };

const LABELS: Record<ThemeSectionType, string> = {
  hero: "Ana Görsel / Slayt",
  "scroll-story": "Kayan Görseller",
  collections: "Kategori Bölümü",
  "featured-products": "Ürünler Slaytı",
  "brand-story": "Marka Yazısı",
  trust: "Güven / Kargo",
  "product-slider": "Ürün Slider",
  "image-banner": "Büyük Banner Görseli",
  "rich-text": "Yazı Bölümü",
};

const LIBRARY: Array<{ type: ThemeSectionType; title: string; detail: string }> = [
  { type: "product-slider", title: "Ürün Slider", detail: "Tek yatay sırada kaydırılabilir ürün alanı." },
  { type: "image-banner", title: "Görsel Banner", detail: "Görsel, yazı ve buton içeren büyük alan." },
  { type: "rich-text", title: "Yazı Bölümü", detail: "Başlık, açıklama ve bağlantı içeren sade alan." },
];

const SECTION_COLOR_OPTIONS = [
  { label: "Carbon", value: "#111111" },
  { label: "Carbon Soft", value: "#242424" },
  { label: "Cream", value: "#FBF3E6" },
  { label: "Brick B", value: "#C94A40" },
  { label: "Espresso", value: "#38251C" },
  { label: "Cocoa", value: "#6B4638" },
  { label: "Kraft", value: "#C8A77D" },
  { label: "Action White", value: "#FFFFFF" },
] as const;

const LEGACY_SECTION_COLORS: Record<string, string> = {
  "#f4f0e8": "#FBF3E6",
  "#b9563d": "#C94A40",
  "#aaa8a1": "#C8A77D",
  "#6f725b": "#6B4638",
  "#2b1b16": "#38251C",
};

function lockedSectionColor(value: string | undefined, fallback: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return SECTION_COLOR_OPTIONS.find((item) => item.value.toLowerCase() === normalized)?.value
    || LEGACY_SECTION_COLORS[normalized]
    || fallback;
}

function SectionColorSelect({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value?: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const locked = lockedSectionColor(value, fallback);
  return (
    <label className="block">
      <span className="ruth-type-label mb-1.5 block">{label}</span>
      <select
        value={locked}
        onChange={(event) => onChange(event.target.value)}
        className="ruth-type-control h-10 w-full rounded-md border border-border-subtle bg-surface-secondary px-3 text-main outline-none focus:border-accent"
      >
        {SECTION_COLOR_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label} · {item.value}</option>)}
      </select>
    </label>
  );
}

function previewFrame() {
  return document.querySelector("[data-theme-customizer-v4] iframe") as HTMLIFrameElement | null;
}

function navigatePreview(path: string, token?: string) {
  const frame = previewFrame();
  if (!frame) return;
  const url = new URL(frame.src);
  url.pathname = path;
  url.searchParams.set("themeEditor", "1");
  url.searchParams.set("themePreview", String(Date.now()));
  if (token) url.searchParams.set("themeSectionsPreview", token);
  else url.searchParams.delete("themeSectionsPreview");
  frame.src = url.toString();
}

function requestInner(sectionId: string) {
  previewFrame()?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SECTION_OUTLINE_REQUEST", sectionId }, "*");
}

function editInner(id: string) {
  previewFrame()?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SELECT_REQUEST", id }, "*");
}

function sendLiveDraft(path: string, settings: ThemeSectionSettings, revision: number) {
  previewFrame()?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SECTION_DRAFT_LOCAL", path, settings, revision }, "*");
}

function Range({ label, value, min, max, step = 1, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <div className="py-1">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="ruth-type-label text-main">{label}</span>
        <span className="ruth-type-code tabular-nums text-muted">{Math.round(value * 10) / 10}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(event) => onChange(Number(event.target.value))} className="h-5 w-full cursor-ew-resize accent-[#C94A40]" />
    </div>
  );
}

function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return (
    <label className="block">
      <span className="ruth-type-label mb-1.5 block">{label}</span>
      {multiline ? (
        <textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} className="ruth-type-control w-full resize-y rounded-md border border-border-subtle bg-surface-secondary p-3 outline-none focus:border-accent" />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} className="ruth-type-control h-10 w-full rounded-md border border-border-subtle bg-surface-secondary px-3 outline-none focus:border-accent" />
      )}
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="flex h-11 w-full items-center justify-between rounded-md border border-border-subtle bg-surface-primary px-3.5 text-left">
      <span className="ruth-type-control">{label}</span>
      <span className={`relative block h-6 w-11 shrink-0 rounded-full transition ${value ? "bg-accent" : "bg-surface-tertiary"}`}>
        <span className={`absolute left-1 top-1 block h-4 w-4 rounded-full bg-surface-primary shadow-sm transition-transform ${value ? "translate-x-5" : "translate-x-0"}`} />
      </span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-border-subtle bg-surface-primary px-4 py-4"><h3 className="ruth-type-card-title mb-3">{title}</h3><div className="space-y-3">{children}</div></section>;
}

function ImageUpload({ onChange }: { onChange: (url: string) => void }) {
  const toast = useExactToast();
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      const headers = await adminAuthHeaders();
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(apiUrl("/api/products/upload-image"), { method: "POST", headers, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.url) throw new Error(result?.error || "Görsel yüklenemedi");
      onChange(String(result.url));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Görsel yüklenemedi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="ruth-type-control flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border-strong bg-surface-secondary focus-within:border-accent">
      <ImagePlus className="h-4 w-4" />
      {busy ? "Yükleniyor…" : "Görseli değiştir"}
      <input hidden type="file" accept="image/*" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
    </label>
  );
}

function CatalogSelect({ label, value, options, onChange }: { label: string; value: string; options: CatalogOption[]; onChange: (id: string) => void }) {
  return (
    <label className="block">
      <span className="ruth-type-label mb-1.5 block">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={!options.length} className="ruth-type-control h-10 w-full rounded-md border border-border-subtle bg-surface-secondary px-3 disabled:opacity-50">
        {!options.length ? <option value="">Kayıt bulunamadı</option> : null}
        {options.map((item) => <option key={item.id} value={item.id}>{item.name}{typeof item.product_count === "number" ? ` (${item.product_count})` : ""}</option>)}
      </select>
    </label>
  );
}

function SectionSettings({
  section,
  inner,
  collections,
  categories,
  patch,
  onEditInner,
}: {
  section: ThemeSection;
  inner: InnerItem[];
  collections: CatalogOption[];
  categories: CatalogOption[];
  patch: (value: Partial<ThemeSection>) => void;
  onEditInner: (id: string) => void;
}) {
  const slider = section.type === "product-slider" || section.type === "featured-products";
  const custom = slider || section.type === "image-banner" || section.type === "rich-text";
  const productSource = section.productSource || "featured";

  const changeProductSource = (next: ThemeProductSource) => {
    const firstSourceId = next === "collection" ? collections[0]?.id : next === "category" ? categories[0]?.id : undefined;
    patch({ productSource: next, productSourceId: firstSourceId });
  };

  return (
    <div className="pb-24">
      <Group title="Bölüm">
        <Toggle label="Bu bölümü göster" value={section.enabled} onChange={(enabled) => patch({ enabled })} />
      </Group>

      {!slider ? (
        <Group title="İçindeki öğeler">
          {inner.length ? (
            <div className="space-y-1.5">
              {inner.map((item) => (
                <button key={item.id} type="button" onClick={() => onEditInner(item.id)} className="flex w-full items-center gap-3 rounded-md border border-border-subtle bg-surface-secondary px-3 py-2.5 text-left focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  <span className="ruth-type-caption grid h-7 w-7 place-items-center">{item.kind === "image" ? "▧" : item.kind === "button" ? "●" : item.kind === "link" ? "↗" : "T"}</span>
                  <span className="ruth-type-control min-w-0 flex-1 truncate">{item.label}</span>
                  <ChevronRight className="h-4 w-4 text-subtle" />
                </button>
              ))}
            </div>
          ) : (
            <div className="ruth-type-caption rounded-md bg-surface-tertiary p-3 text-muted">Önizleme yüklenince bu bölümdeki yazı, görsel ve butonlar burada görünür.</div>
          )}
        </Group>
      ) : null}

      {custom ? (
        <>
          {slider ? (
            <Group title="Ürün kaynağı">
              <label className="block">
                <span className="ruth-type-label mb-1.5 block">Gösterilecek ürünler</span>
                <select value={productSource} onChange={(event) => changeProductSource(event.target.value as ThemeProductSource)} className="ruth-type-control h-10 w-full rounded-md border border-border-subtle bg-surface-secondary px-3">
                  <option value="featured">Öne Çıkanlar</option>
                  <option value="all">Tüm Ürünler</option>
                  <option value="collection">Koleksiyon</option>
                  <option value="category">Kategori</option>
                </select>
              </label>
              {productSource === "collection" ? <CatalogSelect label="Koleksiyon" value={section.productSourceId || collections[0]?.id || ""} options={collections} onChange={(productSourceId) => patch({ productSourceId })} /> : null}
              {productSource === "category" ? <CatalogSelect label="Kategori" value={section.productSourceId || categories[0]?.id || ""} options={categories} onChange={(productSourceId) => patch({ productSourceId })} /> : null}
              <div className="ruth-type-caption rounded-md bg-surface-tertiary p-3 text-muted">Ürün kartları burada alt alta listelenmez. Önizlemede tek yatay slider satırı olarak kalır.</div>
            </Group>
          ) : null}

          <Group title="İçerik">
            {section.type === "image-banner" ? <ImageUpload onChange={(imageSrc) => patch({ imageSrc })} /> : null}
            <Field label="Başlık" value={section.title || ""} onChange={(title) => patch({ title })} />
            <Field label="Üst başlık" value={section.eyebrow || ""} onChange={(eyebrow) => patch({ eyebrow })} />
            {!slider ? <Field label="Açıklama" value={section.body || ""} onChange={(body) => patch({ body })} multiline /> : null}
            <Field label="Bağlantı yazısı" value={section.linkLabel || ""} onChange={(linkLabel) => patch({ linkLabel })} />
            <Field label="Bağlantı" value={section.linkHref || ""} onChange={(linkHref) => patch({ linkHref })} />
          </Group>

          {slider ? (
            <Group title="Ürün düzeni">
              <Range label="Toplam ürün" value={section.productLimit || 12} min={1} max={40} onChange={(value) => patch({ productLimit: Math.round(value) })} />
              <Range label="Masaüstünde yan yana" value={Math.round(section.desktopItems || 4)} min={1} max={8} onChange={(value) => patch({ desktopItems: Math.round(value) })} />
              <Range label="Mobilde yan yana" value={Math.round(section.mobileItems || 2)} min={1} max={4} onChange={(value) => patch({ mobileItems: Math.round(value) })} />
              <Range label="Ürün aralığı" value={section.gap ?? 12} min={0} max={60} suffix=" px" onChange={(gap) => patch({ gap })} />
              <Range label="Masaüstü yüksekliği" value={section.desktopHeight || 520} min={240} max={1100} suffix=" px" onChange={(desktopHeight) => patch({ desktopHeight })} />
              <Range label="Mobil yüksekliği" value={section.mobileHeight || 420} min={220} max={900} suffix=" px" onChange={(mobileHeight) => patch({ mobileHeight })} />
              <Range label="Üst / alt boşluk" value={section.paddingY ?? 64} min={0} max={200} suffix=" px" onChange={(paddingY) => patch({ paddingY })} />
              <Toggle label="Kaydırma oklarını göster" value={section.showArrows !== false} onChange={(showArrows) => patch({ showArrows })} />
            </Group>
          ) : null}

          {section.type === "image-banner" ? (
            <Group title="Banner boyutu">
              <Range label="Masaüstü yüksekliği" value={section.desktopHeight || 520} min={180} max={1100} suffix=" px" onChange={(desktopHeight) => patch({ desktopHeight })} />
              <Range label="Mobil yüksekliği" value={section.mobileHeight || 360} min={160} max={900} suffix=" px" onChange={(mobileHeight) => patch({ mobileHeight })} />
              <Range label="Köşe yuvarlaklığı" value={section.borderRadius || 0} min={0} max={80} suffix=" px" onChange={(borderRadius) => patch({ borderRadius })} />
            </Group>
          ) : null}

          {section.type === "rich-text" ? (
            <Group title="Boşluk">
              <Range label="Üst / alt boşluk" value={section.paddingY ?? 64} min={0} max={220} suffix=" px" onChange={(paddingY) => patch({ paddingY })} />
            </Group>
          ) : null}

          <Group title="Görünüm">
            <div className="grid grid-cols-2 gap-2">
              <SectionColorSelect label="Arka plan" value={section.backgroundColor} fallback="#111111" onChange={(backgroundColor) => patch({ backgroundColor })} />
              <SectionColorSelect label="Yazı rengi" value={section.textColor} fallback="#FBF3E6" onChange={(textColor) => patch({ textColor })} />
            </div>
            <p className="ruth-type-caption mt-2 text-subtle">Bölüm renkleri ROSTA marka paletiyle sınırlıdır.</p>
          </Group>
        </>
      ) : (
        <div className="ruth-type-caption border-b border-border-subtle bg-surface-primary p-4 text-muted">Bu hazır bölümün ana tasarımı korunuyor. İçindeki öğelere tıklayarak yazı, görsel ve butonları tek tek düzenleyebilirsin.</div>
      )}
    </div>
  );
}

export function ThemeSectionPanelV4() {
  const toast = useExactToast();
  const [open, setOpen] = useState(false);
  const [contextPanel, setContextPanel] = useState<ContextPanel | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pageOpen, setPageOpen] = useState(false);
  const [pageName, setPageName] = useState("");
  const [pageSlug, setPageSlug] = useState("");
  const [settings, setSettings] = useState<ThemeSectionSettings>(defaultThemeSectionSettings);
  const [saved, setSaved] = useState(defaultThemeSectionSettings);
  const [path, setPath] = useState("/");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inner, setInner] = useState<InnerItem[]>([]);
  const [collections, setCollections] = useState<CatalogOption[]>([]);
  const [categories, setCategories] = useState<CatalogOption[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [previewToken] = useState(() => `theme_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`);
  const previewRevisionRef = useRef(0);
  const previewRequestRef = useRef(0);
  const renderedSignatureRef = useRef(themeSectionRenderSignature(defaultThemeSectionSettings));
  const contextModeRef = useRef(false);

  useEffect(() => {
    let active = true;
    void adminRequest<{ settings?: unknown }>(`/api/theme-sections?t=${Date.now()}`)
      .then((result) => {
        if (!active) return;
        const next = normalizeThemeSectionSettings(result.settings);
        setSettings(next);
        setSaved(next);
      })
      .catch(() => {
        if (active) toast.error("Bölümler alınamadı.");
      });
    return () => { active = false; };
  }, [toast]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      adminRequest<CatalogResponse>("/api/catalog-groups?type=collection"),
      adminRequest<CatalogResponse>("/api/catalog-groups?type=category"),
    ]).then(([collectionResult, categoryResult]) => {
      if (!active) return;
      setCollections(collectionResult.items || []);
      setCategories(categoryResult.items || []);
    }).catch(() => {
      if (active) toast.error("Koleksiyon ve kategoriler alınamadı.");
    });
    return () => { active = false; };
  }, [toast]);

  const page = themeSectionPage(settings, path);
  const pages = useMemo(() => Object.values(settings.pages), [settings.pages]);
  const selected = page.sections.find((item) => item.id === selectedId) || null;
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const renderSignature = useMemo(() => themeSectionRenderSignature(settings), [settings]);
  const selectedIsSlider = selected?.type === "product-slider" || selected?.type === "featured-products";

  const closePanel = useCallback(() => {
    contextModeRef.current = false;
    setContextPanel(null);
    setOpen(false);
  }, []);

  const setPage = (value: ThemeSectionPage) => setSettings((current) => upsertThemeSectionPage(current, value));
  const patch = (value: Partial<ThemeSection>) => {
    if (!selected) return;
    setPage({ ...page, sections: page.sections.map((item) => item.id === selected.id ? { ...item, ...value } : item) });
  };

  useEffect(() => {
    if (!selectedId || (!open && !contextPanel) || selectedIsSlider) {
      setInner([]);
      return;
    }
    const timer = window.setTimeout(() => requestInner(selectedId), 80);
    return () => window.clearTimeout(timer);
  }, [contextPanel, open, selectedId, selectedIsSlider, path]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const frame = previewFrame();
      const frameWindow = frame?.contentWindow;
      if (frameWindow && event.source !== frameWindow) return;
      if (!event.data || typeof event.data !== "object") return;

      if (event.data.type === "RUTH_THEME_EDITOR_CONTEXT_REQUEST" && typeof event.data.sectionId === "string" && event.data.point) {
        const contextPath = typeof event.data.pathname === "string" && settings.pages[event.data.pathname] ? event.data.pathname : path;
        const contextPage = themeSectionPage(settings, contextPath);
        if (contextPage.sections.some((item) => item.id === event.data.sectionId) && frame) {
          const point = event.data.point as ContextPoint;
          const rect = frame.getBoundingClientRect();
          const scaleX = rect.width / Math.max(1, point.viewportWidth);
          const scaleY = rect.height / Math.max(1, point.viewportHeight);
          const width = Math.min(390, Math.max(300, window.innerWidth - 24));
          const desiredX = rect.left + point.x * scaleX + 10;
          const desiredY = rect.top + point.y * scaleY + 10;
          const x = Math.min(Math.max(12, desiredX), Math.max(12, window.innerWidth - width - 12));
          const y = Math.min(Math.max(72, desiredY), Math.max(72, window.innerHeight - 540));

          contextModeRef.current = true;
          setPath(contextPath);
          setSelectedId(event.data.sectionId);
          setContextPanel({ x, y, sectionId: event.data.sectionId, elementId: String(event.data.id || ""), point });
          setOpen(true);
          window.setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })), 90);
        }
        return;
      }

      if (event.data.type === "RUTH_THEME_EDITOR_SECTION_OUTLINE" && event.data.sectionId === selectedId && Array.isArray(event.data.items)) setInner(event.data.items as InnerItem[]);
      if ((event.data.type === "RUTH_THEME_EDITOR_READY" || event.data.type === "RUTH_THEME_EDITOR_NAVIGATED") && typeof event.data.pathname === "string" && settings.pages[event.data.pathname]) {
        setPath(event.data.pathname);
        if (dirty && event.data.type === "RUTH_THEME_EDITOR_READY") {
          const revision = ++previewRevisionRef.current;
          sendLiveDraft(event.data.pathname, settings, revision);
          const currentFrame = previewFrame();
          let hasDraftToken = false;
          try { hasDraftToken = new URL(currentFrame?.src || "https://rostacoffecompany.zeabur.app").searchParams.get("themeSectionsPreview") === previewToken; } catch {}
          if (!hasDraftToken && renderSignature !== themeSectionRenderSignature(saved)) {
            window.setTimeout(() => navigatePreview(event.data.pathname, previewToken), 40);
          }
        }
      }
      if (event.data.type === "RUTH_THEME_EDITOR_SELECT" && !contextModeRef.current) setOpen(false);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [dirty, path, previewToken, renderSignature, saved, selectedId, settings]);

  useEffect(() => {
    if (!contextPanel) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-theme-section-context-panel]")) return;
      closePanel();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && event.isTrusted) closePanel();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closePanel, contextPanel]);

  useEffect(() => {
    if (!dirty) {
      renderedSignatureRef.current = renderSignature;
      return;
    }
    const revision = ++previewRevisionRef.current;
    sendLiveDraft(path, settings, revision);
    const requestId = ++previewRequestRef.current;
    const needsServerRender = renderSignature !== renderedSignatureRef.current;
    const timer = window.setTimeout(() => {
      void adminRequest("/api/theme-sections", {
        method: "POST",
        body: JSON.stringify({ token: previewToken, settings }),
        confirmation: false,
      }).then(() => {
        if (requestId !== previewRequestRef.current || !needsServerRender) return;
        renderedSignatureRef.current = renderSignature;
        navigatePreview(path, previewToken);
      }).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [dirty, path, previewToken, renderSignature, settings]);

  const publish = useCallback(async (silent = false) => {
    if (!dirty) return true;
    try {
      const result = await adminRequest<{ settings?: unknown }>("/api/theme-sections", { method: "PUT", body: JSON.stringify({ settings }), confirmation: false });
      const next = normalizeThemeSectionSettings(result.settings || settings);
      setSettings(next);
      setSaved(next);
      navigatePreview(path);
      if (!silent) toast.success("Bölümler kaydedildi.");
      return true;
    } catch {
      if (!silent) toast.error("Bölümler kaydedilemedi.");
      return false;
    }
  }, [dirty, path, settings, toast]);

  const discardSectionDraft = useCallback(() => {
    setSettings(saved);
    renderedSignatureRef.current = themeSectionRenderSignature(saved);
    navigatePreview(path);
  }, [path, saved]);

  useSaveLifecycleSource({
    id: "theme-sections",
    dirty,
    save: () => publish(true),
    discard: discardSectionDraft,
  });

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= page.sections.length) return;
    const sections = [...page.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    setPage({ ...page, sections });
  };

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const sections = [...page.sections];
    const from = sections.findIndex((item) => item.id === dragId);
    const to = sections.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = sections.splice(from, 1);
    if (!item) return;
    sections.splice(to, 0, item);
    setPage({ ...page, sections });
    setDragId(null);
  };

  const addSection = (type: ThemeSectionType) => {
    const section = createThemeSection(type, `${type}-${Date.now()}`);
    setPage({ ...page, sections: [...page.sections, section] });
    setSelectedId(section.id);
    setLibraryOpen(false);
  };

  const duplicateSection = (section: ThemeSection, index: number) => {
    const copy = { ...section, id: `${section.type}-${Date.now()}`, title: section.title ? `${section.title} Kopya` : undefined };
    const sections = [...page.sections];
    sections.splice(index + 1, 0, copy);
    setPage({ ...page, sections });
  };

  const createPage = () => {
    const slug = pageSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slug) { toast.error("Sayfa adresi yaz."); return; }
    const nextPath = `/pages/${slug}`;
    if (settings.pages[nextPath]) { toast.error("Bu sayfa zaten var."); return; }
    setSettings((current) => upsertThemeSectionPage(current, { path: nextPath, label: pageName.trim() || slug, sections: [] }));
    setPath(nextPath);
    setSelectedId(null);
    setPageOpen(false);
    setPageName("");
    setPageSlug("");
    navigatePreview(nextPath, previewToken);
  };

  const openGeneral = () => {
    closePanel();
    window.setTimeout(() => {
      const button = Array.from(document.querySelectorAll("button")).find((node) => node.textContent?.includes("Tema Ayarları"));
      (button as HTMLButtonElement | undefined)?.click();
    }, 40);
  };

  const openSectionsList = () => {
    contextModeRef.current = false;
    setContextPanel(null);
    setSelectedId(null);
    setOpen(true);
  };

  const panelClass = contextPanel
    ? "fixed z-[2147483645] flex max-h-[72dvh] w-[390px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-primary shadow-[0_24px_80px_rgba(15,23,42,.28)]"
    : "fixed bottom-0 left-0 top-[70px] z-[2147483550] flex w-[390px] flex-col border-r border-border-subtle bg-surface-primary max-md:top-auto max-md:h-[52dvh] max-md:w-full max-md:border-r-0 max-md:border-t";

  return (
    <>
      {!open ? <button type="button" onClick={openSectionsList} data-theme-sections-launcher className="ruth-type-control fixed bottom-4 left-4 z-[2147483600] flex h-9 items-center gap-2 rounded-md border border-border-subtle bg-surface-primary px-3 shadow-sm"><Layers3 className="h-4 w-4" />Bölümler</button> : null}

      {open ? (
        <aside
          data-theme-sections-panel
          data-theme-section-context-panel={contextPanel ? "true" : undefined}
          className={panelClass}
          style={contextPanel ? { left: contextPanel.x, top: contextPanel.y } : undefined}
        >
          <header className="flex h-[54px] shrink-0 items-center gap-2 border-b border-border-subtle px-3">
            {selected && !contextPanel ? <button type="button" onClick={() => setSelectedId(null)} className="grid h-8 w-8 place-items-center rounded-md focus-visible:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="Bölümlere dön"><ArrowLeft className="h-4 w-4" /></button> : <Layers3 className="ml-1 h-4 w-4 text-black/55" />}
            <div className="min-w-0 flex-1">
              <p className="ruth-type-card-title truncate">{selected ? selected.title || LABELS[selected.type] : "Bölümler"}</p>
              <p className="ruth-type-caption mt-0.5 text-black/38">{contextPanel ? `Bu alan · ${selected ? LABELS[selected.type] : "Bölüm"}` : selected ? "İçerik ve görünüm" : "Sürükle, sırala ve düzenle"}</p>
            </div>
            <button type="button" onClick={closePanel} className="grid h-8 w-8 place-items-center rounded-md focus-visible:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="Paneli kapat"><X className="h-4 w-4" /></button>
          </header>

          {!selected ? <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle p-3"><select value={path} onChange={(event) => { setPath(event.target.value); setSelectedId(null); navigatePreview(event.target.value, dirty ? previewToken : undefined); }} className="ruth-type-control h-10 min-w-0 flex-1 rounded-md border border-border-subtle bg-surface-secondary px-3">{pages.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</select><button type="button" onClick={() => setPageOpen(true)} className="ruth-type-control flex h-10 items-center gap-1 rounded-md border border-border-subtle px-3"><Plus className="h-3.5 w-3.5" />Sayfa</button></div> : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {selected ? (
              <SectionSettings section={selected} inner={inner} collections={collections} categories={categories} patch={patch} onEditInner={(id) => { contextModeRef.current = false; setContextPanel(null); editInner(id); setOpen(false); }} />
            ) : (
              <div className="space-y-2 p-3 pb-24">
                {page.sections.map((section, index) => (
                  <div key={section.id} draggable onDragStart={() => setDragId(section.id)} onDragEnd={() => setDragId(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(section.id)} className={`group flex min-h-[46px] items-center gap-1 rounded-md border bg-surface-primary px-2 ${dragId === section.id ? "border-accent/40 opacity-60" : "border-border-subtle focus-within:border-border-strong"}`}>
                    <span className="grid h-8 w-6 cursor-grab place-items-center text-subtle"><GripVertical className="h-4 w-4" /></span>
                    <button type="button" onClick={() => setSelectedId(section.id)} className="min-w-0 flex-1 px-1 text-left"><b className="ruth-type-control block truncate">{section.title || LABELS[section.type]}</b></button>
                    <button type="button" onClick={() => setPage({ ...page, sections: page.sections.map((item) => item.id === section.id ? { ...item, enabled: !item.enabled } : item) })} className="grid h-8 w-8 place-items-center rounded-md text-muted focus-visible:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label={section.enabled ? "Gizle" : "Göster"}>{section.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>
                    <button type="button" onClick={() => duplicateSection(section, index)} className="grid h-8 w-7 place-items-center rounded-md text-black/35 focus-visible:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="Kopyala"><Copy className="h-3.5 w-3.5" /></button>
                    <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="grid h-8 w-7 place-items-center text-subtle disabled:opacity-10"><ArrowUp className="h-3 w-3" /></button>
                    <button type="button" disabled={index === page.sections.length - 1} onClick={() => move(index, 1)} className="grid h-8 w-7 place-items-center text-subtle disabled:opacity-10"><ArrowDown className="h-3 w-3" /></button>
                    {!section.id.startsWith("home-") ? <button type="button" onClick={() => setPage({ ...page, sections: page.sections.filter((item) => item.id !== section.id) })} className="grid h-8 w-7 place-items-center rounded-md text-danger active:bg-danger-soft focus-visible:bg-danger-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="Sil"><Trash2 className="h-3.5 w-3.5" /></button> : null}
                    <button type="button" onClick={() => setSelectedId(section.id)} className="grid h-8 w-7 place-items-center"><ChevronRight className="h-4 w-4 text-subtle" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-border-subtle bg-surface-primary">
            {!selected ? <div className="flex h-[58px] items-center justify-center"><button type="button" onClick={() => setLibraryOpen(true)} className="ruth-type-control flex h-10 items-center gap-1.5 rounded-md bg-accent px-5 text-[var(--rosta-action-text)]"><Plus className="h-4 w-4" />Yeni Bölüm</button></div> : null}
            <button type="button" onClick={openGeneral} className="flex h-[48px] w-full items-center justify-between border-t border-border-subtle px-4 text-left focus-visible:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><span className="ruth-type-control flex items-center gap-2"><Palette className="h-4 w-4" />Tema Ayarları</span><ChevronRight className="h-4 w-4 text-black/35" /></button>
          </footer>
        </aside>
      ) : null}

      {libraryOpen ? <div className="fixed inset-0 z-[2147483600] grid place-items-center bg-[var(--ruth-color-overlay)] p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-xl bg-surface-primary p-4 shadow-2xl"><div className="mb-4 flex items-center justify-between"><div><p className="ruth-type-card-title">Yeni Bölüm</p><p className="ruth-type-caption mt-1 text-black/40">Eklemek istediğin alanı seç.</p></div><button onClick={() => setLibraryOpen(false)} className="grid h-8 w-8 place-items-center rounded-md bg-black/[0.04]"><X className="h-4 w-4" /></button></div><div className="space-y-2">{LIBRARY.map((item) => <button key={item.type} type="button" onClick={() => addSection(item.type)} className="w-full rounded-md border border-border-subtle p-4 text-left focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><b className="ruth-type-card-title block">{item.title}</b><span className="ruth-type-caption mt-1 block text-black/45">{item.detail}</span></button>)}</div></div></div> : null}

      {pageOpen ? <div className="fixed inset-0 z-[2147483600] grid place-items-center bg-black/25 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-xl bg-surface-primary p-4 shadow-2xl"><div className="mb-4 flex items-center justify-between"><div><p className="ruth-type-card-title">Yeni Sayfa</p><p className="ruth-type-caption mt-1 text-black/40">Boş sayfa oluştur, sonra bölümleri ekle.</p></div><button onClick={() => setPageOpen(false)} className="grid h-8 w-8 place-items-center rounded-md bg-black/[0.04]"><X className="h-4 w-4" /></button></div><div className="space-y-3"><Field label="Sayfa adı" value={pageName} onChange={setPageName} /><Field label="Adres" value={pageSlug} onChange={setPageSlug} /></div><button type="button" onClick={createPage} className="ruth-type-control mt-4 h-10 w-full rounded-md bg-accent text-[var(--rosta-action-text)]">Sayfayı Oluştur</button></div></div> : null}
    </>
  );
}
