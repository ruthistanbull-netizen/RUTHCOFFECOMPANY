"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, Eye, EyeOff, GripVertical, ImagePlus, Layers3, Plus, Save, Trash2, X } from "lucide-react";
import { adminAuthHeaders, adminRequest, apiUrl } from "@/lib/adminApi";
import { useExactToast } from "@/components/base44-exact/primitives";
import { createThemeSection, defaultThemeSectionSettings, normalizeThemeSectionSettings, themeSectionPage, upsertThemeSectionPage, type ThemeSection, type ThemeSectionPage, type ThemeSectionSettings, type ThemeSectionType } from "@ruth-commerce/commerce-core/theme-sections";

const labels: Record<string, string> = { hero: "Hero", "scroll-story": "Görsel Hikâye", collections: "Koleksiyonlar", "featured-products": "Öne Çıkan Ürünler", "brand-story": "Marka Hikâyesi", trust: "Güven / Kargo", "product-slider": "Ürün Slider", "image-banner": "Görsel Banner", "rich-text": "Metin Bölümü" };
const library: Array<{ type: ThemeSectionType; title: string; description: string }> = [
  { type: "product-slider", title: "Ürün Slider", description: "Ürün adedi, görünür kart sayısı, aralık ve slider ölçülerini düzenle." },
  { type: "image-banner", title: "Görsel Banner", description: "Görsel, başlık, açıklama, buton ve responsive yüksekliği düzenle." },
  { type: "rich-text", title: "Metin Bölümü", description: "Başlık, metin ve bağlantı içeren içerik alanı ekle." },
];

function Range({ label, value, min, max, step = 1, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (n: number) => void }) {
  return <label className="block rounded-xl border border-black/10 bg-[#fafafa] p-2.5"><span className="mb-1 flex justify-between text-[9px]"><b>{label}</b><span className="text-black/45">{Math.round(value * 10) / 10}{suffix}</span></span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-6 w-full cursor-ew-resize accent-black" /></label>;
}

function Field({ label, value, onChange, placeholder = "" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <label className="block"><span className="mb-1 block text-[9px] font-medium">{label}</span><input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-xl border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none focus:border-black/25" /></label>;
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="block"><span className="mb-1 block text-[9px] font-medium">{label}</span><textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} className="w-full resize-y rounded-xl border border-black/10 bg-[#fafafa] p-2.5 text-[9px] leading-relaxed outline-none focus:border-black/25" /></label>;
}

function navigate(path: string, previewToken?: string) {
  const frame = document.querySelector("[data-theme-customizer-v3] iframe") as HTMLIFrameElement | null;
  if (!frame) return;
  const url = new URL(frame.src);
  url.pathname = path;
  url.searchParams.set("themeEditor", "1");
  url.searchParams.set("themePreview", String(Date.now()));
  if (previewToken) url.searchParams.set("themeSectionsPreview", previewToken); else url.searchParams.delete("themeSectionsPreview");
  frame.src = url.toString();
}

function ImageUpload({ onChange }: { onChange: (url: string) => void }) {
  const toast = useExactToast();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      const headers = await adminAuthHeaders();
      const body = new FormData(); body.append("file", file);
      const response = await fetch(apiUrl("/api/products/upload-image"), { method: "POST", headers, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.url) throw new Error(result?.error || "Görsel yüklenemedi");
      onChange(String(result.url));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Görsel yüklenemedi");
    } finally { setBusy(false); }
  };
  return <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-black/20 bg-white text-[9px] font-semibold hover:border-black/35"><ImagePlus className="h-4 w-4" />{busy ? "Yükleniyor…" : "Görsel Değiştir"}<input hidden type="file" accept="image/*" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void upload(file); }} /></label>;
}

export function ThemeSectionPanel() {
  const toast = useExactToast();
  const [open, setOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pageDialogOpen, setPageDialogOpen] = useState(false);
  const [pageName, setPageName] = useState("");
  const [pageSlug, setPageSlug] = useState("");
  const [settings, setSettings] = useState<ThemeSectionSettings>(defaultThemeSectionSettings);
  const [saved, setSaved] = useState(settings);
  const [path, setPath] = useState("/");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [previewToken] = useState(() => `theme_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    adminRequest<{ settings?: unknown }>("/api/theme-sections?t=" + Date.now()).then((r) => {
      const next = normalizeThemeSectionSettings(r.settings); setSettings(next); setSaved(next);
    }).catch(() => toast.error("Bölümler alınamadı"));
  }, [toast]);

  const page = themeSectionPage(settings, path);
  const pages = useMemo(() => Object.values(settings.pages), [settings.pages]);
  const selected = page.sections.find((section) => section.id === selectedId) || null;
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => {
      adminRequest("/api/theme-sections", { method: "POST", body: JSON.stringify({ token: previewToken, settings }) })
        .then(() => navigate(path, previewToken)).catch(() => undefined);
    }, 320);
    return () => window.clearTimeout(timer);
  }, [dirty, path, previewToken, settings]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      if ((event.data.type === "RUTH_THEME_EDITOR_READY" || event.data.type === "RUTH_THEME_EDITOR_NAVIGATED") && typeof event.data.pathname === "string") {
        const nextPath = event.data.pathname;
        if (settings.pages[nextPath]) setPath(nextPath);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [settings.pages]);

  const setPage = (next: ThemeSectionPage) => setSettings((current) => upsertThemeSectionPage(current, next));
  const patch = (changes: Partial<ThemeSection>) => {
    if (!selected) return;
    setPage({ ...page, sections: page.sections.map((section) => section.id === selected.id ? { ...section, ...changes } : section) });
  };
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= page.sections.length) return;
    const sections = [...page.sections]; [sections[index], sections[target]] = [sections[target], sections[index]];
    setPage({ ...page, sections });
  };
  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const sections = [...page.sections];
    const from = sections.findIndex((section) => section.id === dragId);
    const to = sections.findIndex((section) => section.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = sections.splice(from, 1); if (!item) return;
    sections.splice(to, 0, item); setPage({ ...page, sections }); setDragId(null);
  };
  const add = (type: ThemeSectionType) => {
    const section = createThemeSection(type, `${type}-${Date.now()}`);
    setPage({ ...page, sections: [...page.sections, section] });
    setSelectedId(section.id); setLibraryOpen(false);
  };
  const createPage = () => {
    const slug = pageSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slug) { toast.error("Sayfa adresi yaz."); return; }
    const nextPath = `/pages/${slug}`;
    if (settings.pages[nextPath]) { toast.error("Bu sayfa zaten var."); return; }
    setSettings((current) => upsertThemeSectionPage(current, { path: nextPath, label: pageName.trim() || slug, sections: [] }));
    setPath(nextPath); setSelectedId(null); setPageName(""); setPageSlug(""); setPageDialogOpen(false);
  };
  const publish = async () => {
    setSaving(true);
    try {
      const result = await adminRequest<{ settings?: unknown }>("/api/theme-sections", { method: "PUT", body: JSON.stringify({ settings }) });
      const next = normalizeThemeSectionSettings(result.settings || settings); setSettings(next); setSaved(next);
      toast.success("Bölümler yayınlandı"); navigate(path, previewToken);
    } catch { toast.error("Bölümler yayınlanamadı"); } finally { setSaving(false); }
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed bottom-16 left-3 z-[2147483500] flex h-10 items-center gap-2 rounded-xl bg-black px-3 text-[10px] font-semibold text-white shadow-lg"><Layers3 className="h-4 w-4" />Bölümler</button>

    {open ? <div className="fixed bottom-0 left-0 top-14 z-[2147483550] flex w-[350px] max-w-full flex-col border-r border-black/10 bg-[#f7f7f5] shadow-2xl">
      <div className="flex h-12 items-center gap-2 border-b border-black/10 bg-white px-3"><button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-black/[0.04]"><ChevronLeft className="h-4 w-4" /></button><div className="flex-1"><p className="text-[11px] font-semibold">Sayfa Bölümleri</p><p className="text-[8px] text-black/40">Sürükle · sırala · düzenle</p></div><button disabled={!dirty || saving} onClick={() => void publish()} className="flex h-8 items-center gap-1 rounded-lg bg-black px-2.5 text-[8px] font-semibold text-white disabled:opacity-30"><Save className="h-3 w-3" />{saving ? "..." : "Yayınla"}</button></div>
      <div className="border-b border-black/10 bg-white p-3"><div className="flex gap-2"><select value={path} onChange={(e) => { setPath(e.target.value); setSelectedId(null); navigate(e.target.value, dirty ? previewToken : undefined); }} className="h-9 min-w-0 flex-1 rounded-xl border border-black/10 bg-[#fafafa] px-2 text-[9px]">{pages.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</select><button onClick={() => setPageDialogOpen(true)} className="flex h-9 items-center gap-1 rounded-xl border border-black/10 px-2 text-[8px]"><Plus className="h-3 w-3" /> Sayfa</button></div></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{selected ? <SectionEditor section={selected} patch={patch} back={() => setSelectedId(null)} /> : <><div className="space-y-1.5">{page.sections.map((section, index) => <div key={section.id} draggable onDragStart={() => setDragId(section.id)} onDragEnd={() => setDragId(null)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(section.id)} className={`flex items-center gap-1 rounded-xl border bg-white p-2 transition ${dragId === section.id ? "border-black/30 opacity-55" : "border-black/10"}`}><span className="grid h-7 w-6 cursor-grab place-items-center text-black/30"><GripVertical className="h-3.5 w-3.5" /></span><button onClick={() => setSelectedId(section.id)} className="min-w-0 flex-1 text-left"><p className="truncate text-[9px] font-semibold">{section.title || labels[section.type]}</p><p className="text-[7px] text-black/35">{labels[section.type]}</p></button><button onClick={() => setPage({ ...page, sections: page.sections.map((item) => item.id === section.id ? { ...item, enabled: !item.enabled } : item) })} className="grid h-7 w-7 place-items-center">{section.enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}</button><button disabled={index === 0} onClick={() => move(index, -1)} className="grid h-7 w-7 place-items-center disabled:opacity-20"><ArrowUp className="h-3 w-3" /></button><button disabled={index === page.sections.length - 1} onClick={() => move(index, 1)} className="grid h-7 w-7 place-items-center disabled:opacity-20"><ArrowDown className="h-3 w-3" /></button>{!section.id.startsWith("home-") ? <button onClick={() => setPage({ ...page, sections: page.sections.filter((item) => item.id !== section.id) })} className="grid h-7 w-7 place-items-center text-red-600"><Trash2 className="h-3 w-3" /></button> : null}</div>)}</div><button onClick={() => setLibraryOpen(true)} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-black/20 bg-white text-[9px] font-semibold hover:border-black/35"><Plus className="h-4 w-4" />Yeni Bölüm Ekle</button></>}</div>
    </div> : null}

    {libraryOpen ? <div className="fixed inset-0 z-[2147483600] grid place-items-center bg-black/25 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl"><div className="mb-4 flex items-center justify-between"><div><p className="text-[12px] font-semibold">Yeni Bölüm Ekle</p><p className="mt-0.5 text-[8px] text-black/40">Bölüm türünü seç</p></div><button onClick={() => setLibraryOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg bg-black/[0.05]"><X className="h-4 w-4" /></button></div><div className="space-y-2">{library.map((item) => <button key={item.type} onClick={() => add(item.type)} className="w-full rounded-2xl border border-black/10 p-3 text-left hover:border-black/25 hover:bg-black/[0.02]"><p className="text-[10px] font-semibold">{item.title}</p><p className="mt-1 text-[8px] leading-relaxed text-black/45">{item.description}</p></button>)}</div></div></div> : null}

    {pageDialogOpen ? <div className="fixed inset-0 z-[2147483600] grid place-items-center bg-black/25 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl"><div className="mb-4 flex items-center justify-between"><div><p className="text-[12px] font-semibold">Yeni Sayfa</p><p className="mt-0.5 text-[8px] text-black/40">Yeni storefront sayfası oluştur</p></div><button onClick={() => setPageDialogOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg bg-black/[0.05]"><X className="h-4 w-4" /></button></div><div className="space-y-3"><Field label="Sayfa adı" value={pageName} onChange={setPageName} placeholder="Örn. Hediye Rehberi" /><Field label="Sayfa adresi" value={pageSlug} onChange={setPageSlug} placeholder="hediye-rehberi" /><p className="rounded-lg bg-black/[0.035] px-2 py-1.5 text-[8px] text-black/45">/pages/{pageSlug || "sayfa-adi"}</p><button onClick={createPage} className="h-10 w-full rounded-xl bg-black text-[9px] font-semibold text-white">Sayfayı Oluştur</button></div></div></div> : null}
  </>;
}

function SectionEditor({ section, patch, back }: { section: ThemeSection; patch: (p: Partial<ThemeSection>) => void; back: () => void }) {
  const products = section.type === "product-slider" || section.type === "featured-products";
  const banner = section.type === "image-banner";
  const rich = section.type === "rich-text";
  const configurable = products || banner || rich;
  return <div className="space-y-2.5"><button onClick={back} className="text-[9px]">← Bölümlere dön</button><p className="text-[11px] font-semibold">{section.title || labels[section.type]}</p><label className="flex h-10 items-center justify-between rounded-xl border border-black/10 bg-white px-3 text-[9px]"><span>Bölümü göster</span><input type="checkbox" checked={section.enabled} onChange={(e) => patch({ enabled: e.target.checked })} /></label>
    {configurable ? <><Field label="Başlık" value={section.title || ""} onChange={(value) => patch({ title: value })} /><Field label="Üst küçük başlık" value={section.eyebrow || ""} onChange={(value) => patch({ eyebrow: value })} /></> : <p className="rounded-xl bg-white p-3 text-[8px] leading-relaxed text-black/50">Bu mevcut Ruth bölümünün içindeki öğeleri önizlemeden tek tek seçerek düzenleyebilirsin. Burada sırasını ve görünürlüğünü değiştir.</p>}
    {products ? <><label className="block text-[9px]">Ürün kaynağı<select value={section.productSource || "featured"} onChange={(e) => patch({ productSource: e.target.value === "all" ? "all" : "featured" })} className="mt-1 h-9 w-full rounded-xl border border-black/10 bg-white px-2"><option value="featured">Öne çıkan ürünler</option><option value="all">Tüm ürünler</option></select></label><Range label="Toplam ürün" value={section.productLimit || 12} min={1} max={40} onChange={(value) => patch({ productLimit: value })} /><Range label="Masaüstünde aynı anda" value={section.desktopItems || 4} min={1} max={8} step={0.5} onChange={(value) => patch({ desktopItems: value })} /><Range label="Mobilde aynı anda" value={section.mobileItems || 2.2} min={1} max={4} step={0.1} onChange={(value) => patch({ mobileItems: value })} /><Range label="Ürün aralığı" value={section.gap ?? 12} min={0} max={80} suffix=" px" onChange={(value) => patch({ gap: value })} /><Range label="Masaüstü slider yüksekliği" value={section.desktopHeight || 420} min={120} max={900} suffix=" px" onChange={(value) => patch({ desktopHeight: value })} /><Range label="Mobil slider yüksekliği" value={section.mobileHeight || 360} min={100} max={900} suffix=" px" onChange={(value) => patch({ mobileHeight: value })} /><label className="flex h-10 items-center justify-between rounded-xl border border-black/10 bg-white px-3 text-[9px]"><span>Kaydırma oklarını göster</span><input type="checkbox" checked={section.showArrows !== false} onChange={(e) => patch({ showArrows: e.target.checked })} /></label><Range label="Bölüm dikey boşluğu" value={section.paddingY ?? 64} min={0} max={220} suffix=" px" onChange={(value) => patch({ paddingY: value })} /><Field label="Tümünü gör yazısı" value={section.linkLabel || ""} onChange={(value) => patch({ linkLabel: value })} /><Field label="Tümünü gör bağlantısı" value={section.linkHref || ""} onChange={(value) => patch({ linkHref: value })} /></> : null}
    {banner ? <><ImageUpload onChange={(url) => patch({ imageSrc: url })} /><Field label="Görsel URL (isteğe bağlı)" value={section.imageSrc || ""} onChange={(value) => patch({ imageSrc: value })} /><TextArea label="Açıklama" value={section.body || ""} onChange={(value) => patch({ body: value })} /><Field label="Buton yazısı" value={section.linkLabel || ""} onChange={(value) => patch({ linkLabel: value })} /><Field label="Buton bağlantısı" value={section.linkHref || ""} onChange={(value) => patch({ linkHref: value })} /><Range label="Masaüstü yükseklik" value={section.desktopHeight || 520} min={180} max={1000} suffix=" px" onChange={(value) => patch({ desktopHeight: value })} /><Range label="Mobil yükseklik" value={section.mobileHeight || 360} min={160} max={800} suffix=" px" onChange={(value) => patch({ mobileHeight: value })} /><Range label="Köşe yuvarlaklığı" value={section.borderRadius || 0} min={0} max={100} suffix=" px" onChange={(value) => patch({ borderRadius: value })} /></> : null}
    {rich ? <><TextArea label="Metin" value={section.body || ""} onChange={(value) => patch({ body: value })} /><Field label="Bağlantı yazısı" value={section.linkLabel || ""} onChange={(value) => patch({ linkLabel: value })} /><Field label="Bağlantı" value={section.linkHref || ""} onChange={(value) => patch({ linkHref: value })} /><Range label="Dikey boşluk" value={section.paddingY ?? 64} min={0} max={220} suffix=" px" onChange={(value) => patch({ paddingY: value })} /></> : null}
    {configurable ? <div className="grid grid-cols-2 gap-2"><label className="rounded-xl border border-black/10 bg-white p-2 text-[8px]">Arka plan<input type="color" value={section.backgroundColor || "#faf7f1"} onChange={(e) => patch({ backgroundColor: e.target.value })} className="mt-1 h-7 w-full" /></label><label className="rounded-xl border border-black/10 bg-white p-2 text-[8px]">Yazı rengi<input type="color" value={section.textColor || "#211912"} onChange={(e) => patch({ textColor: e.target.value })} className="mt-1 h-7 w-full" /></label></div> : null}
  </div>;
}
