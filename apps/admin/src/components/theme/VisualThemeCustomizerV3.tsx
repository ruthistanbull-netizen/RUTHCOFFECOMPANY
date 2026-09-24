"use client";

import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  ImagePlus,
  Monitor,
  Palette,
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
  scope?: "global" | "page";
  kind: ThemeElementOverride["kind"];
  text?: string;
  textEditable?: boolean;
  imageSrc?: string;
  href?: string;
  metrics?: {
    width?: number;
    height?: number;
    fontSize?: number;
    lineHeight?: number | null;
    paddingX?: number;
    paddingY?: number;
    marginTop?: number;
    marginBottom?: number;
    borderRadius?: number;
    opacity?: number;
    objectFit?: string;
    objectPositionX?: number;
    objectPositionY?: number;
    textAlign?: string;
    color?: string;
    backgroundColor?: string;
    display?: string;
  };
};

type OutlineItem = { id: string; label: string; tag: string; kind: ThemeElementOverride["kind"] };

const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://rostacoffecompany.zeabur.app";
const PHONE = { width: 390, height: 844 } as const;
const PAGES = [
  ["Ana Sayfa", "/"],
  ["Tüm Ürünler", "/products"],
  ["Kategoriler", "/categories"],
  ["Koleksiyonlar", "/collections"],
  ["Hakkımızda", "/about"],
  ["İletişim", "/contact"],
  ["S.S.S.", "/faq"],
  ["Kargo / İade", "/shipping-returns"],
  ["Garanti / Kullanım", "/warranty-care"],
  ["Sipariş Takip", "/siparis-takip"],
  ["Hesabım", "/account"],
] as const;
const PALETTE = [
  ["ivory", "Ana arka plan"],
  ["cream", "İkincil arka plan"],
  ["ink", "Ana yazı"],
  ["muted", "İkincil yazı"],
  ["gold", "Vurgu"],
  ["goldDark", "Koyu vurgu"],
] as const;

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function Accordion({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
      <button type="button" onClick={onToggle} className="flex h-11 w-full items-center justify-between px-3.5 text-left text-[11px] font-semibold hover:bg-black/[0.025]">
        <span>{title}</span>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open ? <div className="border-t border-black/[0.06] p-3">{children}</div> : null}
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex h-11 w-full items-center justify-between rounded-xl border border-black/10 bg-white px-3.5 hover:border-black/20">
      <span className="text-[10px] font-medium">{label}</span>
      <span className={cx("relative block h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-black" : "bg-black/15")}>
        <span className={cx("absolute left-1 top-1 block h-4 w-4 rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-5" : "translate-x-0")} />
      </span>
    </button>
  );
}

function Slider({ label, value, min, max, step = 1, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <div className="rounded-xl border border-black/[0.08] bg-[#fbfbfa] px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-[9px] font-medium text-black/75">{label}</span>
        <span className="rounded-md bg-white px-1.5 py-0.5 text-[8px] tabular-nums text-black/45 shadow-sm">{Math.round(value * 100) / 100}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(event) => onChange(Number(event.target.value))} className="h-6 w-full cursor-ew-resize accent-black" aria-label={label} />
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<[T, string]>; onChange: (next: T) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/[0.045] p-1">
      {options.map(([key, label]) => <button key={key} type="button" onClick={() => onChange(key)} className={cx("h-8 rounded-lg text-[9px] transition", value === key ? "bg-white font-medium shadow-sm" : "text-black/45 hover:text-black")}>{label}</button>)}
    </div>
  );
}

function kindLabel(kind: ThemeElementOverride["kind"]) {
  if (kind === "image") return "Görsel";
  if (kind === "text") return "Yazı";
  if (kind === "button") return "Buton";
  if (kind === "link") return "Bağlantı";
  if (kind === "section") return "Bölüm";
  if (kind === "container") return "Alan";
  return "Öğe";
}

function kindMark(kind: ThemeElementOverride["kind"]) {
  if (kind === "image") return "▧";
  if (kind === "text") return "T";
  if (kind === "button") return "●";
  if (kind === "link") return "↗";
  if (kind === "section") return "▤";
  return "□";
}

export function VisualThemeCustomizerV3() {
  const toast = useExactToast();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [settings, setSettings] = useState<ThemeCustomizerSettings>(defaultThemeCustomizerSettings);
  const [saved, setSaved] = useState<ThemeCustomizerSettings>(defaultThemeCustomizerSettings);
  const [path, setPath] = useState("/");
  const [manualPath, setManualPath] = useState("");
  const [device, setDevice] = useState<Device>("desktop");
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [nonce, setNonce] = useState(Date.now());
  const [areasOpen, setAreasOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(true);
  const [sizeOpen, setSizeOpen] = useState(true);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [globalOpen, setGlobalOpen] = useState(false);
  const [phoneScale, setPhoneScale] = useState(0.72);

  const pageKey = themePageKey(path);
  const targetPageKey = selected?.scope === "global" ? "/__global__" : pageKey;
  const overrides = themePage(settings, targetPageKey).overrides;
  const pageOverrides = themePage(settings, pageKey).overrides;
  const globalOverrides = themePage(settings, "/__global__").overrides;
  const hasOverride = (id: string) => pageOverrides.some((item) => item.id === id) || globalOverrides.some((item) => item.id === id);
  const override = selected ? overrides.find((item) => item.id === selected.id) || null : null;
  const style = (override?.[device] || {}) as ThemeDeviceStyle;
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const mobile = device === "mobile";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminRequest<{ settings?: unknown }>(`/api/theme?t=${Date.now()}`);
      const next = normalizeThemeCustomizerSettings(result.settings);
      setSettings(next);
      setSaved(next);
      setNonce(Date.now());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tema ayarları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || !event.data || typeof event.data !== "object") return;
      const message = event.data as { type?: string; pathname?: string; items?: unknown; element?: unknown };
      if ((message.type === "RUTH_THEME_EDITOR_READY" || message.type === "RUTH_THEME_EDITOR_NAVIGATED") && message.pathname) {
        const nextPath = themePageKey(message.pathname);
        setPath((current) => current === nextPath ? current : nextPath);
        setManualPath(nextPath);
      }
      if (message.type === "RUTH_THEME_EDITOR_READY") {
        iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SETTINGS", settings }, "*");
        iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_REFRESH_OUTLINE" }, "*");
      }
      if (message.type === "RUTH_THEME_EDITOR_OUTLINE" && Array.isArray(message.items)) setOutline(message.items as OutlineItem[]);
      if (message.type === "RUTH_THEME_EDITOR_SELECT" && message.element) {
        setSelected(message.element as SelectedElement);
        setAreasOpen(false);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [settings]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SETTINGS", settings }, "*");
  }, [settings]);

  useEffect(() => {
    setSelected(null);
    setOutline([]);
  }, [pageKey]);

  useEffect(() => {
    if (!mobile || !stageRef.current) return;
    const stage = stageRef.current;
    const update = () => {
      const rect = stage.getBoundingClientRect();
      const availableWidth = Math.max(160, rect.width - 36);
      const availableHeight = Math.max(240, rect.height - 36);
      const next = Math.min(0.88, availableWidth / PHONE.width, availableHeight / PHONE.height);
      setPhoneScale(Math.max(0.28, next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [mobile]);

  const baseOverride = (current: ThemeCustomizerSettings): ThemeElementOverride | null => {
    if (!selected) return null;
    return themePage(current, targetPageKey).overrides.find((item) => item.id === selected.id) || {
      id: selected.id,
      selector: selected.selector,
      label: selected.label,
      tag: selected.tag,
      kind: selected.kind || "other",
      hidden: false,
      desktop: {},
      mobile: {},
    };
  };

  const patchOverride = (patch: Partial<ThemeElementOverride>) => {
    if (!selected) return;
    setSettings((current) => {
      const base = baseOverride(current);
      if (!base) return current;
      return upsertThemeElementOverride(current, targetPageKey, { ...base, ...patch });
    });
  };

  const patchStyles = (patch: Partial<ThemeDeviceStyle>) => {
    if (!selected) return;
    setSettings((current) => {
      const base = baseOverride(current);
      if (!base) return current;
      return upsertThemeElementOverride(current, targetPageKey, {
        ...base,
        [device]: {
          ...((base[device] || {}) as ThemeDeviceStyle),
          ...patch,
        },
      });
    });
  };

  const patchStyle = (key: keyof ThemeDeviceStyle, value: ThemeDeviceStyle[keyof ThemeDeviceStyle]) => {
    patchStyles({ [key]: value } as Partial<ThemeDeviceStyle>);
  };

  const num = (key: keyof ThemeDeviceStyle, fallback: number) => typeof style[key] === "number" ? style[key] as number : fallback;

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Bir görsel dosyası seç."); return; }
    setUploading(true);
    try {
      const headers = await adminAuthHeaders();
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(apiUrl("/api/products/upload-image"), { method: "POST", headers, body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok || !result.url) throw new Error(result.error || "Görsel yüklenemedi.");
      patchOverride({ imageSrc: String(result.url), kind: "image" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Görsel yüklenemedi.");
    } finally {
      setUploading(false);
    }
  };

  const publish = async () => {
    setSaving(true);
    try {
      const result = await adminRequest<{ settings?: unknown; warning?: string }>("/api/theme", { method: "PUT", body: JSON.stringify({ settings }) });
      const next = normalizeThemeCustomizerSettings(result.settings || settings);
      setSettings(next);
      setSaved(next);
      setNonce(Date.now());
      toast.success(result.warning ? `Tema yayınlandı. ${result.warning}` : "Tema yayınlandı.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tema yayınlanamadı.");
    } finally {
      setSaving(false);
    }
  };

  const visibleOutline = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase("tr-TR");
    return q ? outline.filter((item) => `${item.label} ${item.tag}`.toLocaleLowerCase("tr-TR").includes(q)) : outline;
  }, [filter, outline]);

  const previewUrl = `${STOREFRONT_URL.replace(/\/$/, "")}${pageKey === "/" ? "/" : pageKey}?themeEditor=1&themePreview=${nonce}`;
  const widthFallback = selected?.metrics?.width || (mobile ? 320 : 760);
  const heightFallback = selected?.metrics?.height || (mobile ? 180 : 320);
  const fontFallback = selected?.metrics?.fontSize || 16;
  const textCapable = Boolean(selected?.textEditable);
  const isTextual = selected ? ["text", "button", "link"].includes(String(selected.kind)) : false;
  const isBox = selected ? ["button", "section", "container", "link", "image"].includes(String(selected.kind)) : false;

  return (
    <div className="fixed inset-0 z-[90] flex min-h-0 flex-col bg-[#e9e9e6]" data-theme-customizer-v3>
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-black/10 bg-white px-3 py-2 md:h-14 md:flex-nowrap md:py-0">
        <div className="hidden w-[165px] shrink-0 md:block">
          <p className="text-[12px] font-semibold">Tema Özelleştirme</p>
          <p className="text-[8px] text-black/40">ROSTA Coffee Co. Core</p>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <select value={PAGES.some((item) => item[1] === pageKey) ? pageKey : "custom"} onChange={(event) => event.target.value !== "custom" && setPath(event.target.value)} className="h-9 min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 text-[10px] font-medium outline-none md:max-w-[190px]">
            {PAGES.map(([label, value]) => <option key={value} value={value}>{label}</option>)}
            <option value="custom">Bu sayfa · {pageKey}</option>
          </select>
          <div className="hidden h-9 items-center rounded-xl border border-black/10 bg-white pl-2 xl:flex">
            <input value={manualPath} onChange={(event) => setManualPath(event.target.value)} onKeyDown={(event) => event.key === "Enter" && manualPath.trim() && setPath(themePageKey(manualPath))} placeholder="/products/urun" className="w-[145px] bg-transparent text-[9px] outline-none" />
            <button type="button" onClick={() => manualPath.trim() && setPath(themePageKey(manualPath))} className="mr-1 h-7 rounded-lg bg-black px-2.5 text-[9px] font-medium text-white">Git</button>
          </div>
          <div className="flex shrink-0 rounded-xl border border-black/10 bg-black/[0.035] p-1">
            <button type="button" onClick={() => setDevice("desktop")} className={cx("flex h-7 items-center gap-1 rounded-lg px-2 text-[9px]", device === "desktop" ? "bg-white font-medium shadow-sm" : "text-black/45")}><Monitor className="h-3.5 w-3.5" /><span className="hidden sm:inline">Masaüstü</span></button>
            <button type="button" onClick={() => setDevice("mobile")} className={cx("flex h-7 items-center gap-1 rounded-lg px-2 text-[9px]", device === "mobile" ? "bg-white font-medium shadow-sm" : "text-black/45")}><Smartphone className="h-3.5 w-3.5" /><span className="hidden sm:inline">Mobil</span></button>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <a href={`${STOREFRONT_URL}${pageKey}`} target="_blank" rel="noreferrer" className="grid h-9 w-9 place-items-center rounded-xl border border-black/10 bg-white hover:border-black/20" aria-label="Websiteyi aç"><ExternalLink className="h-3.5 w-3.5" /></a>
          <button type="button" disabled={!dirty} onClick={() => setSettings(saved)} className="flex h-9 items-center gap-1 rounded-xl border border-black/10 bg-white px-2.5 text-[9px] font-medium disabled:opacity-30"><RotateCcw className="h-3.5 w-3.5" /><span className="hidden lg:inline">Geri al</span></button>
          <button type="button" disabled={!dirty || saving || uploading} onClick={() => void publish()} className="flex h-9 items-center gap-1.5 rounded-xl bg-black px-3 text-[9px] font-semibold text-white shadow-sm disabled:opacity-30"><Save className="h-3.5 w-3.5" />{saving ? "Yayınlanıyor" : "Yayınla"}</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="relative order-2 flex h-[46%] min-h-0 w-full shrink-0 flex-col border-t border-black/10 bg-[#f7f7f5] md:order-1 md:h-auto md:w-[326px] md:border-r md:border-t-0">
          <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-4">
            <Accordion title={`Sayfa alanları · ${outline.length}`} open={areasOpen} onToggle={() => setAreasOpen((value) => !value)}>
              <div className="flex h-9 items-center gap-2 rounded-xl border border-black/10 bg-[#fafafa] px-2.5">
                <Search className="h-3.5 w-3.5 text-black/35" />
                <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Alan ara" className="min-w-0 flex-1 bg-transparent text-[9px] outline-none" />
              </div>
              <div className="mt-2 max-h-[170px] space-y-1 overflow-y-auto pr-1">
                {visibleOutline.map((item) => <button key={item.id} type="button" onClick={() => iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SELECT_REQUEST", id: item.id }, "*")} className={cx("flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition", selected?.id === item.id ? "bg-black text-white" : "hover:bg-black/[0.045]")}>
                  <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[9px]", selected?.id === item.id ? "bg-white/15" : "bg-black/[0.05]")}>{kindMark(item.kind)}</span>
                  <span className="min-w-0 flex-1 truncate text-[9px]">{item.label}</span>
                  {hasOverride(item.id) ? <span className={cx("h-1.5 w-1.5 rounded-full", selected?.id === item.id ? "bg-white" : "bg-black")} /> : null}
                </button>)}
              </div>
            </Accordion>

            {selected ? <div className="mt-3 space-y-2.5">
              <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/[0.055] text-[11px] font-semibold">{kindMark(selected.kind)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold">{selected.label}</p>
                  <p className="mt-0.5 text-[8px] text-black/40">{kindLabel(selected.kind)} · {device === "mobile" ? "Mobil" : "Masaüstü"}{selected.scope === "global" ? " · Tüm site" : ""}</p>
                </div>
                <button type="button" disabled={!override} onClick={() => setSettings((current) => removeThemeElementOverride(current, targetPageKey, selected.id))} className="grid h-8 w-8 place-items-center rounded-xl border border-black/10 text-black/55 disabled:opacity-20" aria-label="Bu öğenin değişikliklerini sıfırla"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>

              <Switch label="Bu alanı göster" checked={!override?.hidden} onChange={(visible) => patchOverride({ hidden: !visible })} />

              <Accordion title="İçerik" open={contentOpen} onToggle={() => setContentOpen((value) => !value)}>
                <div className="space-y-2">
                  {textCapable ? <div><label className="mb-1.5 block text-[9px] font-medium">Metin</label><textarea rows={2} value={override?.text ?? selected.text ?? ""} onChange={(event) => patchOverride({ text: event.target.value })} className="w-full resize-none rounded-xl border border-black/10 bg-[#fafafa] p-2.5 text-[10px] outline-none focus:border-black/25" /></div> : isTextual ? <div className="rounded-xl bg-[#f2f2ef] p-3 text-[9px] leading-relaxed text-black/55">Bu öğe ikon veya iç içe yapı içeriyor. Yapıyı bozmamak için metin düzenleme kapalı; görünümünü aşağıdan değiştirebilirsin.</div> : null}
                  {selected.kind === "link" ? <div><label className="mb-1.5 block text-[9px] font-medium">Gideceği bağlantı</label><input value={override?.href ?? selected.href ?? ""} onChange={(event) => patchOverride({ href: event.target.value })} className="h-9 w-full rounded-xl border border-black/10 bg-[#fafafa] px-2.5 text-[9px] outline-none focus:border-black/25" /></div> : null}
                  {selected.kind === "image" && selected.tag !== "video" ? <div className="space-y-2"><label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-black/20 bg-[#fafafa] text-[9px] font-medium hover:border-black/35"><ImagePlus className="h-4 w-4" />{uploading ? "Yükleniyor…" : "Görseli değiştir"}<input hidden type="file" accept="image/*" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label><Segmented value={(style.objectFit || selected.metrics?.objectFit || "cover") as "cover" | "contain" | "fill"} options={[["cover", "Doldur"], ["contain", "Sığdır"], ["fill", "Esnet"]]} onChange={(value) => patchStyle("objectFit", value)} /></div> : null}
                  {!textCapable && selected.kind !== "link" && selected.kind !== "image" && !isTextual ? <p className="text-[9px] leading-relaxed text-black/45">Bu alanın içerik verisi doğrudan değiştirilmiyor. Boyut, boşluk ve görünüm ayarlarını kullan.</p> : null}
                </div>
              </Accordion>

              <Accordion title="Boyut ve boşluk" open={sizeOpen} onToggle={() => setSizeOpen((value) => !value)}>
                <div className="space-y-2">
                  <Slider label="Genişlik" value={num("width", widthFallback)} min={24} max={mobile ? 390 : 1800} suffix=" px" onChange={(value) => patchStyles({ width: value, widthUnit: "px" })} />
                  <Slider label="Yükseklik" value={num("height", heightFallback)} min={12} max={mobile ? 844 : 1400} suffix=" px" onChange={(value) => patchStyles({ height: value, heightUnit: "px" })} />
                  {textCapable ? <Slider label="Yazı büyüklüğü" value={num("fontSize", fontFallback)} min={8} max={96} suffix=" px" onChange={(value) => patchStyle("fontSize", value)} /> : null}
                  {isBox ? <><Slider label="Yatay iç boşluk" value={num("paddingX", selected.metrics?.paddingX ?? 0)} min={0} max={140} suffix=" px" onChange={(value) => patchStyle("paddingX", value)} /><Slider label="Dikey iç boşluk" value={num("paddingY", selected.metrics?.paddingY ?? 0)} min={0} max={140} suffix=" px" onChange={(value) => patchStyle("paddingY", value)} /></> : null}
                  <Slider label="Üst mesafe" value={num("marginTop", selected.metrics?.marginTop ?? 0)} min={-180} max={360} suffix=" px" onChange={(value) => patchStyle("marginTop", value)} />
                  <Slider label="Alt mesafe" value={num("marginBottom", selected.metrics?.marginBottom ?? 0)} min={-180} max={360} suffix=" px" onChange={(value) => patchStyle("marginBottom", value)} />
                </div>
              </Accordion>

              <Accordion title="Görünüm" open={appearanceOpen} onToggle={() => setAppearanceOpen((value) => !value)}>
                <div className="space-y-2">
                  {textCapable && selected?.metrics?.display !== "inline" ? <div><p className="mb-1.5 text-[9px] font-medium">Hizalama</p><Segmented value={(style.textAlign || selected.metrics?.textAlign || "left") as "left" | "center" | "right"} options={[["left", "Sol"], ["center", "Orta"], ["right", "Sağ"]]} onChange={(value) => patchStyle("textAlign", value)} /></div> : null}
                  {isBox ? <Slider label="Köşe yuvarlaklığı" value={num("borderRadius", selected.metrics?.borderRadius ?? 0)} min={0} max={120} suffix=" px" onChange={(value) => patchStyle("borderRadius", value)} /> : null}
                  <Slider label="Opaklık" value={num("opacity", selected.metrics?.opacity ?? 1)} min={0.05} max={1} step={0.05} onChange={(value) => patchStyle("opacity", value)} />
                  {selected.kind === "image" && selected.tag !== "video" ? <><Slider label="Görsel yatay konumu" value={num("objectPositionX", selected.metrics?.objectPositionX ?? 50)} min={0} max={100} suffix="%" onChange={(value) => patchStyle("objectPositionX", value)} /><Slider label="Görsel dikey konumu" value={num("objectPositionY", selected.metrics?.objectPositionY ?? 50)} min={0} max={100} suffix="%" onChange={(value) => patchStyle("objectPositionY", value)} /></> : null}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {textCapable ? <label className="flex h-10 items-center gap-2 rounded-xl border border-black/10 bg-[#fafafa] px-2.5"><input type="color" value={style.color || selected.metrics?.color || "#111111"} onChange={(event) => patchStyle("color", event.target.value)} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" /><span className="text-[8px]">Yazı rengi</span></label> : null}
                    <label className="flex h-10 items-center gap-2 rounded-xl border border-black/10 bg-[#fafafa] px-2.5"><input type="color" value={style.backgroundColor || selected.metrics?.backgroundColor || "#ffffff"} onChange={(event) => patchStyle("backgroundColor", event.target.value)} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" /><span className="text-[8px]">Arka plan</span></label>
                  </div>
                </div>
              </Accordion>
            </div> : <div className="mt-3 rounded-2xl border border-dashed border-black/15 bg-white px-5 py-7 text-center"><p className="text-[10px] font-semibold">Önizlemeden bir alan seç</p><p className="mt-1.5 text-[9px] leading-relaxed text-black/45">Tek tık düzenler. Bir bağlantıya çift tıklarsan o sayfaya geçer ve editör sayfayı otomatik algılar.</p></div>}
          </div>

          {globalOpen ? <div className="absolute bottom-[49px] left-0 right-0 z-20 max-h-[55vh] overflow-y-auto border-t border-black/10 bg-white p-3 shadow-[0_-18px_45px_rgba(0,0,0,.12)]">
            <div className="mb-3 flex items-center justify-between"><div><p className="text-[11px] font-semibold">Genel Tema</p><p className="mt-0.5 text-[8px] text-black/40">Tüm siteyi etkileyen ayarlar</p></div><button type="button" onClick={() => setGlobalOpen(false)} className="h-8 rounded-lg bg-black/[0.05] px-2.5 text-[9px]">Kapat</button></div>
            <div className="grid grid-cols-2 gap-2">{PALETTE.map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-xl border border-black/10 bg-[#fafafa] p-2"><input type="color" value={settings.colors[key]} onChange={(event) => setSettings((current) => ({ ...current, colors: { ...current.colors, [key]: event.target.value } }))} className="h-7 w-7 cursor-pointer border-0 bg-transparent p-0" /><span className="text-[8px] leading-tight">{label}</span></label>)}</div>
            <div className="mt-2"><Switch label="WhatsApp butonunu göster" checked={settings.whatsapp.enabled} onChange={(enabled) => setSettings((current) => ({ ...current, whatsapp: { ...current.whatsapp, enabled } }))} /></div>
          </div> : null}

          <button type="button" onClick={() => setGlobalOpen((value) => !value)} className={cx("flex h-[49px] shrink-0 items-center justify-between border-t border-black/10 px-4 text-left transition", globalOpen ? "bg-black text-white" : "bg-white hover:bg-black/[0.025]")}>
            <span className="flex items-center gap-2 text-[10px] font-semibold"><Palette className="h-4 w-4" />Genel Tema</span>
            {globalOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </aside>

        <main className="relative order-1 min-h-[42vh] min-w-0 flex-1 overflow-hidden bg-[#e3e3df] md:order-2 md:min-h-0">
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-black/10 bg-white/95 px-2.5 py-1.5 text-[8px] text-black/45 shadow-sm backdrop-blur">
            {mobile ? <><Smartphone className="h-3.5 w-3.5" /><span>{PHONE.width} × {PHONE.height}</span><span>·</span><span>{Math.round(phoneScale * 100)}% sığdırıldı</span></> : <><Monitor className="h-3.5 w-3.5" /><span>Masaüstü canlı önizleme</span></>}
          </div>
          <button type="button" onClick={() => { setNonce(Date.now()); setSelected(null); setOutline([]); }} className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-xl border border-black/10 bg-white/95 shadow-sm" aria-label="Önizlemeyi yenile"><RefreshCw className="h-3.5 w-3.5" /></button>

          <div ref={stageRef} className="flex h-full w-full items-center justify-center overflow-hidden p-4 pt-12">
            {mobile ? <div className="relative" style={{ width: PHONE.width * phoneScale, height: PHONE.height * phoneScale }}>
              <div className="absolute left-0 top-0 origin-top-left overflow-hidden rounded-[34px] border-[8px] border-black bg-white shadow-[0_22px_70px_rgba(0,0,0,.18)]" style={{ width: PHONE.width, height: PHONE.height, transform: `scale(${phoneScale})` }}>
                <iframe key={`${pageKey}-${nonce}-mobile`} ref={iframeRef} src={previewUrl} title="Mobil ROSTA Coffee Co. önizlemesi" className="h-full w-full border-0 bg-white" onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SETTINGS", settings }, "*")} />
              </div>
            </div> : <div className="h-full w-full max-w-[1600px] overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_20px_65px_rgba(0,0,0,.12)]">
              <iframe key={`${pageKey}-${nonce}-desktop`} ref={iframeRef} src={previewUrl} title="Masaüstü ROSTA Coffee Co. önizlemesi" className="h-full w-full border-0 bg-white" onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SETTINGS", settings }, "*")} />
            </div>}
          </div>
        </main>
      </div>

      {loading ? <div className="absolute inset-0 z-50 grid place-items-center bg-white/75 backdrop-blur-sm"><div className="rounded-2xl border border-black/10 bg-white px-5 py-4 text-[10px] shadow-lg">Tema özelleştirici hazırlanıyor…</div></div> : null}
    </div>
  );
}
