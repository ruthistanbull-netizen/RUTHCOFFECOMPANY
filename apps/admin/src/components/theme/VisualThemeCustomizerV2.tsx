"use client";

import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ImagePlus,
  Monitor,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminAuthHeaders, adminRequest, apiUrl } from "@/lib/adminApi";
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
import { useExactToast } from "@/components/base44-exact/primitives";

type Device = "desktop" | "mobile";
type SelectedElement = {
  id: string;
  selector: string;
  label: string;
  tag: string;
  kind: ThemeElementOverride["kind"];
  text?: string;
  imageSrc?: string;
  href?: string;
  metrics?: {
    width?: number;
    height?: number;
    fontSize?: number;
    lineHeight?: number | null;
    borderRadius?: number;
    opacity?: number;
    objectFit?: string;
    textAlign?: string;
    color?: string;
    backgroundColor?: string;
  };
};

type OutlineItem = { id: string; label: string; tag: string; kind: ThemeElementOverride["kind"] };

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://rostacoffecompany.zeabur.app";
const PAGES = [
  ["Ana Sayfa", "/"], ["Tüm Ürünler", "/products"], ["Kategoriler", "/categories"],
  ["Koleksiyonlar", "/collections"], ["Hakkımızda", "/about"], ["İletişim", "/contact"],
  ["S.S.S.", "/faq"], ["Kargo / İade", "/shipping-returns"], ["Garanti / Kullanım", "/warranty-care"],
  ["Sipariş Takip", "/siparis-takip"], ["Hesabım", "/account"],
] as const;

const PALETTE = [
  ["ivory", "Ana arka plan"], ["cream", "İkincil arka plan"], ["ink", "Ana yazı"],
  ["muted", "İkincil yazı"], ["gold", "Vurgu"], ["goldDark", "Koyu vurgu"],
] as const;

function PanelToggle({ title, open, onClick }: { title: string; open: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center justify-between py-1 text-left text-[11px] font-semibold">{title}{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>;
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between rounded-xl border border-black/10 bg-white px-3 py-2.5"><span className="text-[10px] font-medium">{label}</span><span className={`relative h-6 w-11 rounded-full ${checked ? "bg-black" : "bg-black/15"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`} /></span></button>;
}

function Slider({ label, value, min, max, step = 1, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white px-3 py-3">
      <div className="mb-1.5 flex items-center justify-between"><span className="text-[10px] font-medium">{label}</span><span className="rounded-md bg-black/[0.05] px-2 py-1 text-[9px] tabular-nums text-muted">{Math.round(value * 100) / 100}{suffix}</span></div>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(event) => onChange(Number(event.target.value))} className="h-7 w-full cursor-ew-resize accent-black" aria-label={label} />
    </div>
  );
}

function DevicePicker({ value, onChange }: { value: Device; onChange: (value: Device) => void }) {
  return <div className="flex rounded-xl border border-black/10 bg-black/[0.035] p-1"><button type="button" onClick={() => onChange("desktop")} className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[10px] ${value === "desktop" ? "bg-white shadow-sm" : "text-muted"}`}><Monitor className="h-3.5 w-3.5" /> Masaüstü</button><button type="button" onClick={() => onChange("mobile")} className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[10px] ${value === "mobile" ? "bg-white shadow-sm" : "text-muted"}`}><Smartphone className="h-3.5 w-3.5" /> Mobil</button></div>;
}

function kindMark(kind: ThemeElementOverride["kind"]) {
  if (kind === "image") return "▧";
  if (kind === "text") return "T";
  if (kind === "button") return "▰";
  if (kind === "link") return "↗";
  if (kind === "section") return "▤";
  return "□";
}

export function VisualThemeCustomizerV2() {
  const toast = useExactToast();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [settings, setSettings] = useState<ThemeCustomizerSettings>(defaultThemeCustomizerSettings);
  const [saved, setSaved] = useState<ThemeCustomizerSettings>(defaultThemeCustomizerSettings);
  const [path, setPath] = useState("/");
  const [manualPath, setManualPath] = useState("");
  const [device, setDevice] = useState<Device>("desktop");
  const [zoom, setZoom] = useState(90);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [nonce, setNonce] = useState(Date.now());
  const [areasOpen, setAreasOpen] = useState(true);
  const [globalOpen, setGlobalOpen] = useState(true);
  const [elementOpen, setElementOpen] = useState(true);

  const pageKey = themePageKey(path);
  const overrides = themePage(settings, pageKey).overrides;
  const override = selected ? overrides.find((item) => item.id === selected.id) || null : null;
  const style = (override?.[device] || {}) as ThemeDeviceStyle;
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ settings?: unknown }>(`/api/theme?t=${Date.now()}`);
      const next = normalizeThemeCustomizerSettings(result.settings);
      setSettings(next); setSaved(next); setNonce(Date.now());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tema ayarları alınamadı.");
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || !event.data || typeof event.data !== "object") return;
      if (event.data.type === "RUTH_THEME_EDITOR_READY") {
        iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SETTINGS", settings }, "*");
        iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_REFRESH_OUTLINE" }, "*");
      }
      if (event.data.type === "RUTH_THEME_EDITOR_OUTLINE" && Array.isArray(event.data.items)) setOutline(event.data.items as OutlineItem[]);
      if (event.data.type === "RUTH_THEME_EDITOR_SELECT" && event.data.element) { setSelected(event.data.element as SelectedElement); setElementOpen(true); }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [settings]);

  useEffect(() => { iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SETTINGS", settings }, "*"); }, [settings]);
  useEffect(() => { setSelected(null); setOutline([]); setNonce(Date.now()); }, [pageKey]);

  const baseOverride = (): ThemeElementOverride | null => selected ? override || {
    id: selected.id, selector: selected.selector, label: selected.label, tag: selected.tag,
    kind: selected.kind || "other", hidden: false, text: selected.text, imageSrc: selected.imageSrc, href: selected.href,
    desktop: {}, mobile: {},
  } : null;

  const patchOverride = (patch: Partial<ThemeElementOverride>) => {
    const base = baseOverride();
    if (!base) return;
    setSettings((current) => upsertThemeElementOverride(current, pageKey, { ...base, ...patch }));
  };

  const patchStyle = (key: keyof ThemeDeviceStyle, value: ThemeDeviceStyle[keyof ThemeDeviceStyle]) => {
    const base = baseOverride();
    if (!base) return;
    patchOverride({ [device]: { ...((base[device] || {}) as ThemeDeviceStyle), [key]: value } });
  };

  const num = (key: keyof ThemeDeviceStyle, fallback: number) => typeof style[key] === "number" ? style[key] as number : fallback;

  const upload = async (file: File, onUrl: (url: string) => void) => {
    if (!file.type.startsWith("image/")) { toast.error("Bir görsel dosyası seç."); return; }
    setUploading(true);
    try {
      const headers = await adminAuthHeaders();
      const body = new FormData(); body.append("file", file);
      const response = await fetch(apiUrl("/api/products/upload-image"), { method: "POST", headers, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.url) throw new Error(result.error || "Görsel yüklenemedi.");
      onUrl(String(result.url));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Görsel yüklenemedi."); }
    finally { setUploading(false); }
  };

  const publish = async () => {
    setSaving(true);
    try {
      const result = await adminRequest<{ settings?: unknown; warning?: string }>("/api/theme", { method: "PUT", body: JSON.stringify({ settings }) });
      const next = normalizeThemeCustomizerSettings(result.settings || settings);
      setSettings(next); setSaved(next); setNonce(Date.now());
      toast.success(result.warning ? `Tema yayınlandı. ${result.warning}` : "Tema yayınlandı.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Tema yayınlanamadı."); }
    finally { setSaving(false); }
  };

  const visibleOutline = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase("tr-TR");
    return q ? outline.filter((item) => `${item.label} ${item.tag}`.toLocaleLowerCase("tr-TR").includes(q)) : outline;
  }, [filter, outline]);

  const previewUrl = `${STOREFRONT_URL.replace(/\/$/, "")}${pageKey === "/" ? "/" : pageKey}?themeEditor=1&themePreview=${nonce}`;
  const mobile = device === "mobile";
  const widthFallback = selected?.metrics?.width || (mobile ? 340 : 800);
  const heightFallback = selected?.metrics?.height || (mobile ? 260 : 500);
  const fontFallback = selected?.metrics?.fontSize || 16;

  return (
    <div className="fixed inset-0 z-[90] flex min-h-0 flex-col bg-[#ececea]" data-theme-customizer-v2>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/10 bg-white px-3">
        <div className="w-[190px] shrink-0"><p className="text-[12px] font-semibold">Tema Özelleştirme</p><p className="text-[9px] text-muted">ROSTA Coffee Co. Core</p></div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <select value={PAGES.some((item) => item[1] === pageKey) ? pageKey : "custom"} onChange={(event) => event.target.value !== "custom" && setPath(event.target.value)} className="h-9 w-[190px] rounded-xl border border-black/10 bg-white px-3 text-[10px] outline-none">
            {PAGES.map(([label, value]) => <option key={value} value={value}>{label}</option>)}<option value="custom">Başka sayfa…</option>
          </select>
          <div className="hidden h-9 items-center rounded-xl border border-black/10 bg-white pl-2 xl:flex"><input value={manualPath} onChange={(event) => setManualPath(event.target.value)} onKeyDown={(event) => event.key === "Enter" && manualPath.trim() && setPath(themePageKey(manualPath))} placeholder="/products/urun-slug" className="w-[170px] bg-transparent text-[9px] outline-none" /><button type="button" onClick={() => manualPath.trim() && setPath(themePageKey(manualPath))} className="mr-1 rounded-lg bg-black px-2 py-1.5 text-[9px] text-white">Git</button></div>
          <DevicePicker value={device} onChange={setDevice} />
        </div>
        <div className="flex w-[240px] shrink-0 justify-end gap-2"><a href={`${STOREFRONT_URL}${pageKey}`} target="_blank" rel="noreferrer" className="grid h-9 w-9 place-items-center rounded-xl border border-black/10 bg-white" aria-label="Websiteyi aç"><ExternalLink className="h-3.5 w-3.5" /></a><button type="button" disabled={!dirty} onClick={() => setSettings(saved)} className="flex h-9 items-center gap-1.5 rounded-xl border border-black/10 bg-white px-3 text-[9px] disabled:opacity-35"><RotateCcw className="h-3.5 w-3.5" /> Değişiklikleri geri al</button><button type="button" disabled={!dirty || saving || uploading} onClick={() => void publish()} className="flex h-9 items-center gap-1.5 rounded-xl bg-black px-3 text-[9px] font-medium text-white disabled:opacity-35"><Save className="h-3.5 w-3.5" /> {saving ? "Yayınlanıyor" : "Yayınla"}</button></div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[340px] shrink-0 flex-col border-r border-black/10 bg-[#fafafa]">
          <div className="border-b border-black/10 p-3">
            <PanelToggle title="Sayfadaki Alanlar" open={areasOpen} onClick={() => setAreasOpen((value) => !value)} />
            {areasOpen ? <><div className="mt-2 flex h-9 items-center gap-2 rounded-xl border border-black/10 bg-white px-2.5"><Search className="h-3.5 w-3.5 text-muted" /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Alan ara" className="min-w-0 flex-1 bg-transparent text-[10px] outline-none" /></div><div className="mt-2 max-h-[245px] space-y-1 overflow-y-auto pr-1">{visibleOutline.map((item) => <button key={item.id} type="button" onClick={() => iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SELECT_REQUEST", id: item.id }, "*")} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left ${selected?.id === item.id ? "bg-black text-white" : "hover:bg-black/[0.045]"}`}><span className={`grid h-6 w-6 place-items-center rounded-md text-[10px] ${selected?.id === item.id ? "bg-white/15" : "bg-black/[0.05]"}`}>{kindMark(item.kind)}</span><span className="min-w-0 flex-1 truncate text-[10px]">{item.label}</span>{overrides.some((entry) => entry.id === item.id) ? <span className={`h-1.5 w-1.5 rounded-full ${selected?.id === item.id ? "bg-white" : "bg-black"}`} /> : null}</button>)}</div></> : null}
          </div>

          <div className="border-b border-black/10 p-3">
            <PanelToggle title="Genel Tema" open={globalOpen} onClick={() => setGlobalOpen((value) => !value)} />
            {globalOpen ? <div className="mt-2 space-y-2"><div className="grid grid-cols-2 gap-2">{PALETTE.map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-xl border border-black/10 bg-white p-2"><input type="color" value={settings.colors[key]} onChange={(event) => setSettings((current) => ({ ...current, colors: { ...current.colors, [key]: event.target.value } }))} className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0" /><span className="min-w-0 text-[9px] leading-tight">{label}</span></label>)}</div><Switch label="WhatsApp butonunu göster" checked={settings.whatsapp.enabled} onChange={(enabled) => setSettings((current) => ({ ...current, whatsapp: { ...current.whatsapp, enabled } }))} /></div> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <PanelToggle title={selected ? selected.label : "Seçili Alan"} open={elementOpen} onClick={() => setElementOpen((value) => !value)} />
            {elementOpen ? selected ? <div className="mt-2 space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-black/10 bg-white p-3"><div className="min-w-0"><p className="truncate text-[10px] font-medium">{selected.label}</p><p className="mt-1 text-[8px] uppercase tracking-[0.1em] text-muted">{selected.kind} · {device === "desktop" ? "Masaüstü" : "Mobil"}</p></div><button type="button" disabled={!override} onClick={() => setSettings((current) => removeThemeElementOverride(current, pageKey, selected.id))} className="grid h-8 w-8 place-items-center rounded-lg border border-black/10 disabled:opacity-25" aria-label="Ayarı sıfırla"><Trash2 className="h-3.5 w-3.5" /></button></div>
              <Switch label="Bu alanı göster" checked={!override?.hidden} onChange={(visible) => patchOverride({ hidden: !visible })} />

              {["text", "button", "link"].includes(String(selected.kind)) ? <div className="rounded-xl border border-black/10 bg-white p-3"><label className="mb-1.5 block text-[9px] font-medium">Yazı</label><textarea rows={3} value={override?.text ?? selected.text ?? ""} onChange={(event) => patchOverride({ text: event.target.value })} className="w-full resize-y rounded-lg border border-black/10 bg-[#fafafa] p-2 text-[10px] outline-none" /></div> : null}
              {selected.kind === "link" ? <div className="rounded-xl border border-black/10 bg-white p-3"><label className="mb-1.5 block text-[9px] font-medium">Bağlantı</label><input value={override?.href ?? selected.href ?? ""} onChange={(event) => patchOverride({ href: event.target.value })} className="h-9 w-full rounded-lg border border-black/10 bg-[#fafafa] px-2 text-[9px] outline-none" /></div> : null}
              {selected.kind === "image" ? <div className="rounded-xl border border-black/10 bg-white p-3"><label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-black/20 bg-[#fafafa] text-[9px]"><ImagePlus className="h-4 w-4" /> {uploading ? "Yükleniyor…" : "Fotoğrafı değiştir"}<input hidden type="file" accept="image/*" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file, (url) => patchOverride({ imageSrc: url, kind: "image" })); }} /></label><div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-black/[0.035] p-1">{(["cover", "contain", "fill"] as const).map((fit) => <button key={fit} type="button" onClick={() => patchStyle("objectFit", fit)} className={`rounded-md px-2 py-1.5 text-[8px] ${(style.objectFit || selected.metrics?.objectFit || "cover") === fit ? "bg-white shadow-sm" : "text-muted"}`}>{fit === "cover" ? "Doldur" : fit === "contain" ? "Sığdır" : "Esnet"}</button>)}</div></div> : null}

              <div className="rounded-xl border border-black/10 bg-black/[0.025] p-2.5"><p className="px-1 pb-2 text-[8px] font-semibold uppercase tracking-[0.12em] text-muted">Boyut · sürükleyerek ayarla</p><div className="space-y-2">
                <Slider label="Genişlik" value={num("width", widthFallback)} min={selected.kind === "button" ? 40 : 20} max={mobile ? 440 : 1800} suffix=" px" onChange={(value) => { patchStyle("width", value); patchStyle("widthUnit", "px"); }} />
                <Slider label="Yükseklik" value={num("height", heightFallback)} min={12} max={mobile ? 1100 : 1500} suffix=" px" onChange={(value) => { patchStyle("height", value); patchStyle("heightUnit", "px"); }} />
                {["text", "button", "link"].includes(String(selected.kind)) ? <><Slider label="Yazı büyüklüğü" value={num("fontSize", fontFallback)} min={8} max={110} suffix=" px" onChange={(value) => patchStyle("fontSize", value)} /><Slider label="Satır yüksekliği" value={num("lineHeight", 1.4)} min={0.8} max={3} step={0.05} onChange={(value) => patchStyle("lineHeight", value)} /><Slider label="Harf aralığı" value={num("letterSpacing", 0)} min={-5} max={30} step={0.25} onChange={(value) => patchStyle("letterSpacing", value)} /></> : null}
                <Slider label="Yatay iç boşluk" value={num("paddingX", 0)} min={0} max={180} onChange={(value) => patchStyle("paddingX", value)} />
                <Slider label="Dikey iç boşluk" value={num("paddingY", 0)} min={0} max={180} onChange={(value) => patchStyle("paddingY", value)} />
                <Slider label="Üst mesafe" value={num("marginTop", 0)} min={-260} max={500} onChange={(value) => patchStyle("marginTop", value)} />
                <Slider label="Alt mesafe" value={num("marginBottom", 0)} min={-260} max={500} onChange={(value) => patchStyle("marginBottom", value)} />
                <Slider label="Köşe yuvarlaklığı" value={num("borderRadius", selected.metrics?.borderRadius || 0)} min={0} max={160} onChange={(value) => patchStyle("borderRadius", value)} />
                <Slider label="Opaklık" value={num("opacity", selected.metrics?.opacity || 1)} min={0.05} max={1} step={0.05} onChange={(value) => patchStyle("opacity", value)} />
                {selected.kind === "image" ? <><Slider label="Fotoğraf yatay konumu" value={num("objectPositionX", 50)} min={0} max={100} suffix="%" onChange={(value) => patchStyle("objectPositionX", value)} /><Slider label="Fotoğraf dikey konumu" value={num("objectPositionY", 50)} min={0} max={100} suffix="%" onChange={(value) => patchStyle("objectPositionY", value)} /></> : null}
              </div></div>

              <div className="rounded-xl border border-black/10 bg-white p-3"><p className="mb-2 text-[9px] font-medium">Renk</p><div className="grid grid-cols-2 gap-2"><label className="flex items-center gap-2 rounded-lg bg-[#f7f7f6] p-2"><input type="color" value={style.color || "#111111"} onChange={(event) => patchStyle("color", event.target.value)} className="h-7 w-7 cursor-pointer border-0 bg-transparent p-0" /><span className="text-[8px]">Yazı</span></label><label className="flex items-center gap-2 rounded-lg bg-[#f7f7f6] p-2"><input type="color" value={style.backgroundColor || "#ffffff"} onChange={(event) => patchStyle("backgroundColor", event.target.value)} className="h-7 w-7 cursor-pointer border-0 bg-transparent p-0" /><span className="text-[8px]">Arka plan</span></label></div></div>
            </div> : <div className="mt-3 rounded-2xl border border-dashed border-black/15 bg-white px-4 py-8 text-center"><p className="text-[10px] font-medium">Siteden bir alan seç</p><p className="mt-1.5 text-[9px] leading-relaxed text-muted">Önizlemedeki fotoğraf, yazı, buton veya bölüme tıkla. Ayarlar burada otomatik açılır.</p></div> : null}
          </div>
        </aside>

        <main className="relative min-w-0 flex-1 overflow-hidden bg-[#e5e5e2]">
          <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-black/10 bg-white/95 p-1 shadow-sm backdrop-blur"><button type="button" onClick={() => setZoom((value) => Math.max(55, value - 5))} className="h-7 px-2 text-[11px]">−</button><span className="min-w-[42px] text-center text-[8px] tabular-nums text-muted">{zoom}%</span><button type="button" onClick={() => setZoom((value) => Math.min(110, value + 5))} className="h-7 px-2 text-[11px]">+</button><button type="button" onClick={() => { setNonce(Date.now()); setSelected(null); setOutline([]); }} className="grid h-7 w-7 place-items-center rounded-lg hover:bg-black/[0.05]" aria-label="Yenile"><RefreshCw className="h-3.5 w-3.5" /></button></div>
          <div className="flex h-full items-start justify-center overflow-auto px-6 pb-10 pt-14"><div className={`origin-top overflow-hidden bg-white shadow-[0_20px_70px_rgba(0,0,0,.14)] ${mobile ? "rounded-[30px] border-[8px] border-black" : "rounded-lg border border-black/10"}`} style={{ width: mobile ? 390 : "100%", maxWidth: mobile ? 390 : 1600, height: mobile ? 844 : "calc(100vh - 116px)", transform: `scale(${zoom / 100})` }}><iframe key={`${pageKey}-${nonce}`} ref={iframeRef} src={previewUrl} title="Canlı ROSTA Coffee Co. önizlemesi" className="h-full w-full border-0 bg-white" onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SETTINGS", settings }, "*")} /></div></div>
        </main>
      </div>

      {loading ? <div className="absolute inset-0 z-50 grid place-items-center bg-white/75 backdrop-blur-sm"><div className="rounded-2xl border border-black/10 bg-white px-5 py-4 text-[10px] shadow-lg">Tema özelleştirici hazırlanıyor…</div></div> : null}
    </div>
  );
}
