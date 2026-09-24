"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Layers3,
  Palette,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { adminAuthHeaders, adminRequest, apiUrl } from "@/lib/adminApi";
import { useExactToast } from "@/components/base44-exact/primitives";
import {
  createThemeSection,
  defaultThemeSectionSettings,
  normalizeThemeSectionSettings,
  themeSectionPage,
  upsertThemeSectionPage,
  type ThemeSection,
  type ThemeSectionPage,
  type ThemeSectionSettings,
  type ThemeSectionType,
} from "@ruth-commerce/commerce-core/theme-sections";

type InnerItem = { id: string; label: string; tag: string; kind: string };

const LABELS: Record<ThemeSectionType, string> = {
  hero: "Hero",
  "scroll-story": "Görsel Hikâye",
  collections: "Koleksiyonlar",
  "featured-products": "Öne Çıkan Ürünler",
  "brand-story": "Marka Hikâyesi",
  trust: "Güven / Kargo",
  "product-slider": "Ürün Slider",
  "image-banner": "Görsel Banner",
  "rich-text": "Metin Bölümü",
};

const LIBRARY: Array<{ type: ThemeSectionType; title: string; detail: string }> = [
  { type: "product-slider", title: "Ürün Slider", detail: "Ürünleri tek yatay sırada kaydırılabilir göster." },
  { type: "image-banner", title: "Görsel Banner", detail: "Görsel, metin ve butonlu banner ekle." },
  { type: "rich-text", title: "Metin Bölümü", detail: "Başlık, açıklama ve bağlantı ekle." },
];

function previewFrame() {
  return document.querySelector("[data-theme-customizer-v3] iframe") as HTMLIFrameElement | null;
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
  previewFrame()?.contentWindow?.postMessage(
    { type: "RUTH_THEME_EDITOR_SECTION_OUTLINE_REQUEST", sectionId },
    "*",
  );
}

function editInner(id: string) {
  previewFrame()?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SELECT_REQUEST", id }, "*");
}

function sendLiveDraft(path: string, settings: ThemeSectionSettings) {
  previewFrame()?.contentWindow?.postMessage(
    { type: "RUTH_THEME_EDITOR_SECTION_DRAFT_LOCAL", path, settings },
    "*",
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
    <div className="rounded-xl border border-border-subtle bg-surface-secondary p-3">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[9px]">
        <span className="font-medium">{label}</span>
        <span className="rounded-md bg-surface-primary px-1.5 py-0.5 tabular-nums text-muted shadow-sm">
          {Math.round(value * 10) / 10}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-6 w-full cursor-ew-resize accent-black"
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[9px] font-medium">{label}</span>
      {multiline ? (
        <textarea
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full resize-y rounded-xl border border-border-subtle bg-surface-secondary p-3 text-[10px] outline-none focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-xl border border-border-subtle bg-surface-secondary px-3 text-[10px] outline-none focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      )}
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex h-11 w-full items-center justify-between rounded-xl border border-border-subtle bg-surface-primary px-3.5 text-left"
    >
      <span className="text-[10px] font-medium">{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition ${value ? "bg-accent" : "bg-surface-tertiary"}`}>
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface-primary shadow transition-transform ${
            value ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border-subtle bg-surface-primary p-3">
      <h3 className="mb-3 text-[10px] font-semibold">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
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
      const response = await fetch(apiUrl("/api/products/upload-image"), {
        method: "POST",
        headers,
        body,
      });
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
    <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-secondary text-[9px] font-semibold focus-within:border-accent">
      <ImagePlus className="h-4 w-4" />
      {busy ? "Yükleniyor…" : "Görsel Değiştir"}
      <input
        hidden
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </label>
  );
}

function SectionSettings({
  section,
  inner,
  patch,
  onEditInner,
}: {
  section: ThemeSection;
  inner: InnerItem[];
  patch: (value: Partial<ThemeSection>) => void;
  onEditInner: (id: string) => void;
}) {
  const slider = section.type === "product-slider" || section.type === "featured-products";
  const custom = slider || section.type === "image-banner" || section.type === "rich-text";

  return (
    <div className="space-y-3 pb-28">
      <Group title="Bölüm">
        <Toggle label="Bu bölümü göster" value={section.enabled} onChange={(enabled) => patch({ enabled })} />
      </Group>

      <Group title="İçindeki öğeler">
        {inner.length ? (
          <div className="space-y-1.5">
            {inner.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onEditInner(item.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-border-subtle bg-surface-secondary px-3 py-2.5 text-left focus-visible:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-primary text-[9px] shadow-sm">
                  {item.kind === "image" ? "▧" : item.kind === "button" ? "●" : item.kind === "link" ? "↗" : "T"}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[9px] font-medium">{item.label}</b>
                  <small className="text-[7px] text-subtle">{item.kind}</small>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-subtle" />
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-surface-tertiary p-3 text-[9px] leading-relaxed text-muted">
            Önizleme yüklenince bu bölümün görselleri, yazıları ve butonları burada görünür.
          </div>
        )}
      </Group>

      {custom ? (
        <>
          <Group title="İçerik">
            {section.type === "image-banner" ? <ImageUpload onChange={(imageSrc) => patch({ imageSrc })} /> : null}
            <Field label="Başlık" value={section.title || ""} onChange={(title) => patch({ title })} />
            <Field label="Üst başlık" value={section.eyebrow || ""} onChange={(eyebrow) => patch({ eyebrow })} />
            {!slider ? <Field label="Açıklama" value={section.body || ""} onChange={(body) => patch({ body })} multiline /> : null}
            <Field label="Bağlantı yazısı" value={section.linkLabel || ""} onChange={(linkLabel) => patch({ linkLabel })} />
            <Field label="Bağlantı" value={section.linkHref || ""} onChange={(linkHref) => patch({ linkHref })} />
          </Group>

          {slider ? (
            <Group title="Ürün Slider Düzeni">
              <label className="block">
                <span className="mb-1.5 block text-[9px] font-medium">Ürün kaynağı</span>
                <select
                  value={section.productSource || "featured"}
                  onChange={(event) => patch({ productSource: event.target.value as "featured" | "all" })}
                  className="h-10 w-full rounded-xl border border-border-subtle bg-surface-secondary px-3 text-[10px]"
                >
                  <option value="featured">Öne Çıkanlar</option>
                  <option value="all">Tüm Ürünler</option>
                </select>
              </label>
              <Range label="Toplam ürün" value={section.productLimit || 12} min={1} max={40} onChange={(value) => patch({ productLimit: Math.round(value) })} />
              <Range label="Masaüstünde yan yana" value={Math.round(section.desktopItems || 4)} min={1} max={8} onChange={(value) => patch({ desktopItems: Math.round(value) })} />
              <Range label="Mobilde yan yana" value={Math.round(section.mobileItems || 2)} min={1} max={4} onChange={(value) => patch({ mobileItems: Math.round(value) })} />
              <Range label="Ürün aralığı" value={section.gap ?? 12} min={0} max={60} suffix=" px" onChange={(gap) => patch({ gap })} />
              <Range label="Masaüstü bölüm yüksekliği" value={section.desktopHeight || 520} min={240} max={1100} suffix=" px" onChange={(desktopHeight) => patch({ desktopHeight })} />
              <Range label="Mobil bölüm yüksekliği" value={section.mobileHeight || 420} min={220} max={900} suffix=" px" onChange={(mobileHeight) => patch({ mobileHeight })} />
              <Range label="Üst / alt boşluk" value={section.paddingY ?? 64} min={0} max={200} suffix=" px" onChange={(paddingY) => patch({ paddingY })} />
              <Toggle label="Kaydırma oklarını göster" value={section.showArrows !== false} onChange={(showArrows) => patch({ showArrows })} />
            </Group>
          ) : null}

          {section.type === "image-banner" ? (
            <Group title="Banner Boyutu">
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
        </>
      ) : (
        <div className="rounded-2xl border border-border-subtle bg-surface-primary p-4 text-[9px] leading-relaxed text-muted">
          Bu hazır bölümün mevcut site tasarımı korunuyor. İçindeki öğelerden görsel, yazı ve butonları tek tek düzenleyebilirsin.
        </div>
      )}
    </div>
  );
}

export function ThemeSectionPanelV3() {
  const toast = useExactToast();
  const [open, setOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pageOpen, setPageOpen] = useState(false);
  const [pageName, setPageName] = useState("");
  const [pageSlug, setPageSlug] = useState("");
  const [settings, setSettings] = useState<ThemeSectionSettings>(defaultThemeSectionSettings);
  const [saved, setSaved] = useState(defaultThemeSectionSettings);
  const [path, setPath] = useState("/");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inner, setInner] = useState<InnerItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [previewToken] = useState(() => `theme_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    adminRequest<{ settings?: unknown }>(`/api/theme-sections?t=${Date.now()}`)
      .then((result) => {
        const next = normalizeThemeSectionSettings(result.settings);
        setSettings(next);
        setSaved(next);
      })
      .catch(() => toast.error("Bölümler alınamadı."));
  }, [toast]);

  const page = themeSectionPage(settings, path);
  const pages = useMemo(() => Object.values(settings.pages), [settings.pages]);
  const selected = page.sections.find((item) => item.id === selectedId) || null;
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  const setPage = (value: ThemeSectionPage) => {
    setSettings((current) => upsertThemeSectionPage(current, value));
  };

  const patch = (value: Partial<ThemeSection>) => {
    if (!selected) return;
    setPage({
      ...page,
      sections: page.sections.map((item) => (item.id === selected.id ? { ...item, ...value } : item)),
    });
  };

  useEffect(() => {
    if (!selectedId || !open) {
      setInner([]);
      return;
    }
    const timer = window.setTimeout(() => requestInner(selectedId), 80);
    return () => window.clearTimeout(timer);
  }, [open, selectedId, path]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      if (
        event.data.type === "RUTH_THEME_EDITOR_SECTION_OUTLINE" &&
        event.data.sectionId === selectedId &&
        Array.isArray(event.data.items)
      ) {
        setInner(event.data.items as InnerItem[]);
      }
      if (
        (event.data.type === "RUTH_THEME_EDITOR_READY" || event.data.type === "RUTH_THEME_EDITOR_NAVIGATED") &&
        typeof event.data.pathname === "string" &&
        settings.pages[event.data.pathname]
      ) {
        setPath(event.data.pathname);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [selectedId, settings.pages]);

  useEffect(() => {
    if (!dirty) return;

    sendLiveDraft(path, settings);

    const timer = window.setTimeout(() => {
      adminRequest("/api/theme-sections", {
        method: "POST",
        body: JSON.stringify({ token: previewToken, settings }),
        confirmation: false,
      })
        .then(() => navigatePreview(path, previewToken))
        .catch(() => undefined);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [dirty, path, previewToken, settings]);

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

  const createPage = () => {
    const slug = pageSlug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) {
      toast.error("Sayfa adresi yaz.");
      return;
    }
    const nextPath = `/pages/${slug}`;
    if (settings.pages[nextPath]) {
      toast.error("Bu sayfa zaten var.");
      return;
    }
    setSettings((current) =>
      upsertThemeSectionPage(current, {
        path: nextPath,
        label: pageName.trim() || slug,
        sections: [],
      }),
    );
    setPath(nextPath);
    setSelectedId(null);
    setPageOpen(false);
    setPageName("");
    setPageSlug("");
    navigatePreview(nextPath, previewToken);
  };

  const publish = async () => {
    setSaving(true);
    try {
      const result = await adminRequest<{ settings?: unknown }>("/api/theme-sections", {
        method: "PUT",
        body: JSON.stringify({ settings }),
        confirmation: false,
      });
      const next = normalizeThemeSectionSettings(result.settings || settings);
      setSettings(next);
      setSaved(next);
      toast.success("Bölümler yayınlandı.");
      navigatePreview(path);
    } catch {
      toast.error("Bölümler yayınlanamadı.");
    } finally {
      setSaving(false);
    }
  };

  const openGeneral = () => {
    setOpen(false);
    window.setTimeout(() => {
      const button = Array.from(document.querySelectorAll("button")).find((node) =>
        node.textContent?.includes("Genel Tema"),
      );
      (button as HTMLButtonElement | undefined)?.click();
    }, 60);
  };

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-theme-sections-launcher
          className="fixed left-[54px] top-[10px] z-[2147483600] flex h-9 items-center gap-2 rounded-xl border border-border-subtle bg-surface-primary px-3 text-[9px] font-semibold shadow-sm focus-visible:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Layers3 className="h-4 w-4" />
          Bölümler
        </button>
      ) : null}

      {open ? (
        <aside className="fixed bottom-0 left-0 top-14 z-[2147483550] flex w-full max-w-[326px] flex-col border-r border-border-subtle bg-background shadow-2xl text-main">
          <header className="flex h-13 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-primary px-3 py-2">
            {selected ? (
              <button type="button" onClick={() => setSelectedId(null)} className="grid h-8 w-8 place-items-center rounded-lg active:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="Bölümlere dön">
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <Layers3 className="ml-1 h-4 w-4" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold">{selected ? selected.title || LABELS[selected.type] : "Bölümler"}</p>
              <p className="text-[8px] text-muted">{selected ? "İçerik ve görünüm" : "Sürükle · sırala · düzenle"}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg active:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label="Bölümleri kapat">
              <X className="h-4 w-4" />
            </button>
          </header>

          {!selected ? (
            <div className="shrink-0 border-b border-border-subtle bg-surface-primary p-3">
              <div className="flex gap-2">
                <select
                  value={path}
                  onChange={(event) => {
                    setPath(event.target.value);
                    setSelectedId(null);
                    navigatePreview(event.target.value, dirty ? previewToken : undefined);
                  }}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-secondary px-3 text-[9px]"
                >
                  {pages.map((item) => (
                    <option key={item.path} value={item.path}>{item.label}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setPageOpen(true)} className="flex h-10 items-center gap-1 rounded-xl border border-border-subtle bg-surface-primary px-2.5 text-[8px] font-medium">
                  <Plus className="h-3.5 w-3.5" />
                  Sayfa
                </button>
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {selected ? (
              <SectionSettings
                section={selected}
                inner={inner}
                patch={patch}
                onEditInner={(id) => {
                  editInner(id);
                  setOpen(false);
                }}
              />
            ) : (
              <div className="space-y-2 pb-28">
                {page.sections.map((section, index) => (
                  <div
                    key={section.id}
                    draggable
                    onDragStart={() => setDragId(section.id)}
                    onDragEnd={() => setDragId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => drop(section.id)}
                    className={`flex items-center gap-1 rounded-xl border bg-surface-primary p-2 ${dragId === section.id ? "border-accent/40 opacity-60" : "border-border-subtle"}`}
                  >
                    <span className="grid h-8 w-6 cursor-grab place-items-center text-subtle">
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <button type="button" onClick={() => setSelectedId(section.id)} className="min-w-0 flex-1 px-1 text-left">
                      <b className="block truncate text-[9px] font-semibold">{section.title || LABELS[section.type]}</b>
                      <span className="text-[7px] text-subtle">{LABELS[section.type]}</span>
                    </button>
                    <button type="button" onClick={() => setPage({ ...page, sections: page.sections.map((item) => item.id === section.id ? { ...item, enabled: !item.enabled } : item) })} className="grid h-8 w-8 place-items-center rounded-lg active:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" aria-label={section.enabled ? "Bölümü gizle" : "Bölümü göster"}>
                      {section.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" disabled={index === 0} onClick={() => move(index, -1)} className="grid h-8 w-7 place-items-center disabled:opacity-15"><ArrowUp className="h-3 w-3" /></button>
                    <button type="button" disabled={index === page.sections.length - 1} onClick={() => move(index, 1)} className="grid h-8 w-7 place-items-center disabled:opacity-15"><ArrowDown className="h-3 w-3" /></button>
                    {!section.id.startsWith("home-") ? (
                      <button type="button" onClick={() => setPage({ ...page, sections: page.sections.filter((item) => item.id !== section.id) })} className="grid h-8 w-7 place-items-center text-red-600"><Trash2 className="h-3 w-3" /></button>
                    ) : null}
                    <button type="button" onClick={() => setSelectedId(section.id)} className="grid h-8 w-7 place-items-center"><ChevronRight className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <footer className="absolute bottom-0 left-0 right-0 grid grid-cols-2 gap-2 border-t border-border-subtle bg-surface-primary p-3">
            <button type="button" onClick={() => setLibraryOpen(true)} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border-subtle text-[9px] font-semibold">
              <Plus className="h-3.5 w-3.5" />
              Yeni Bölüm
            </button>
            <button type="button" onClick={openGeneral} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border-subtle text-[9px] font-semibold">
              <Palette className="h-3.5 w-3.5" />
              Genel Tema
            </button>
            <button type="button" disabled={!dirty || saving} onClick={() => void publish()} className="col-span-2 flex h-10 items-center justify-center gap-1.5 rounded-xl bg-accent text-[9px] font-semibold text-[var(--rosta-action-text)] active:bg-[var(--rosta-espresso)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-30">
              <Save className="h-3.5 w-3.5" />
              {saving ? "Yayınlanıyor…" : "Bölümleri Yayınla"}
            </button>
          </footer>
        </aside>
      ) : null}

      {libraryOpen ? (
        <div className="fixed inset-0 z-[2147483600] grid place-items-center bg-[var(--ruth-color-overlay)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-surface-primary p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold">Yeni Bölüm</p>
                <p className="text-[8px] text-muted">Eklemek istediğin alanı seç.</p>
              </div>
              <button onClick={() => setLibraryOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg bg-surface-secondary active:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
              {LIBRARY.map((item) => (
                <button key={item.type} type="button" onClick={() => addSection(item.type)} className="w-full rounded-2xl border border-border-subtle p-4 text-left focus-visible:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  <b className="block text-[10px]">{item.title}</b>
                  <span className="mt-1 block text-[8px] leading-relaxed text-muted">{item.detail}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {pageOpen ? (
        <div className="fixed inset-0 z-[2147483600] grid place-items-center bg-[var(--ruth-color-overlay)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-surface-primary p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold">Yeni Sayfa</p>
                <p className="text-[8px] text-muted">Boş sayfa oluştur, sonra bölümleri ekle.</p>
              </div>
              <button onClick={() => setPageOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg bg-surface-secondary active:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <Field label="Sayfa adı" value={pageName} onChange={setPageName} />
              <Field label="Adres" value={pageSlug} onChange={setPageSlug} />
            </div>
            <button type="button" onClick={createPage} className="mt-4 h-10 w-full rounded-xl bg-accent text-[9px] font-semibold text-[var(--rosta-action-text)] active:bg-[var(--rosta-espresso)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Sayfayı Oluştur</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
