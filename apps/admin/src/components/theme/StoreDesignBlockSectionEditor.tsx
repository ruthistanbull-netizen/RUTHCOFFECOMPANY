"use client";

import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  BLOCK_LIBRARY_BY_TYPE,
  SECTION_LIBRARY_BY_TYPE,
  STORE_DESIGN_SCHEMA_VERSION,
  type BlockDefinition,
  type BlockInstance,
  type SectionInstance,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";
import { useExactToast } from "@/components/base44-exact/primitives";

type Props = {
  document: ThemeDocument;
  section: SectionInstance;
  onApply: (next: ThemeDocument, label: string) => Promise<void>;
  onClose: () => void;
};

type DraftBlock = {
  id: string;
  type: string;
  settings: Record<string, unknown>;
};

function uid(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
  return `${prefix}-${random}`.slice(0, 160);
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function blockDefaults(type: string): Record<string, unknown> {
  if (type === "text-column") return { heading: "Yeni başlık", body: "" };
  if (type === "stat") return { value: "100", label: "Değer" };
  if (type === "timeline-item") return { date: "2026", heading: "Başlık", body: "" };
  if (type === "feature" || type === "trust-item") return { icon: "•", heading: "Başlık", body: "" };
  if (type === "testimonial") return { quote: "Yorum", name: "İsim", meta: "" };
  if (type === "tab") return { label: "Sekme", body: "" };
  if (type === "announcement") return { text: "Yeni duyuru", linkLabel: "", linkHref: "" };
  if (type === "ticker-item") return { text: "Yeni metin", link: "" };
  if (type === "slide") return { media: "", title: "Slayt", body: "", cta: "" };
  if (type === "media") return { assetId: "", alt: "", link: "" };
  if (type === "logo") return { assetId: "", alt: "", link: "" };
  if (type === "award") return { assetId: "", label: "Ödül", link: "" };
  if (type === "member") return { assetId: "", name: "İsim", role: "", bio: "" };
  if (type === "faq-item") return { question: "Yeni soru", answer: "" };
  return {};
}

function fieldLabel(key: string) {
  const labels: Record<string, string> = {
    assetId: "Medya",
    media: "Medya",
    alt: "Alt metin",
    link: "Bağlantı",
    linkHref: "Bağlantı",
    linkLabel: "Bağlantı metni",
    cta: "CTA bağlantısı",
    heading: "Başlık",
    title: "Başlık",
    body: "Metin",
    value: "Değer",
    label: "Etiket",
    date: "Tarih",
    icon: "İkon / sembol",
    quote: "Yorum",
    name: "İsim",
    meta: "Meta",
    role: "Rol",
    bio: "Biyografi",
    text: "Metin",
    question: "Soru",
    answer: "Cevap",
    x: "X konumu (%)",
    y: "Y konumu (%)",
    targetType: "Hedef tipi",
    targetId: "Hedef",
  };
  return labels[key] || key;
}

function blockTitle(block: DraftBlock) {
  return text(block.settings.heading || block.settings.title || block.settings.label || block.settings.name || block.settings.question || block.settings.text) || BLOCK_LIBRARY_BY_TYPE[block.type]?.label || block.type;
}

function isLongField(key: string) {
  return ["body", "bio", "quote", "answer"].includes(key);
}

function isMediaField(key: string) {
  return key === "assetId" || key === "media";
}

export function StoreDesignBlockSectionEditor({ document, section, onApply, onClose }: Props) {
  const toast = useExactToast();
  const definition = SECTION_LIBRARY_BY_TYPE[section.type];
  const allowedDefinitions = useMemo(() => (definition?.allowedBlocks || [])
    .map((type) => BLOCK_LIBRARY_BY_TYPE[type])
    .filter((item): item is BlockDefinition => Boolean(item?.implemented)), [definition]);
  const [settings, setSettings] = useState<Record<string, unknown>>(() => structuredClone(section.settings || {}));
  const [blocks, setBlocks] = useState<DraftBlock[]>(() => (section.blockIds || [])
    .map((blockId) => document.blocks[blockId])
    .filter((block): block is BlockInstance => Boolean(block))
    .map((block) => ({ id: block.id, type: block.type, settings: structuredClone(block.settings || {}) })));
  const [blockType, setBlockType] = useState(allowedDefinitions[0]?.type || "");
  const [busy, setBusy] = useState(false);

  const mediaAssets = useMemo(() => Object.values(document.media), [document.media]);
  const maxBlocks = definition?.maxBlocks || 50;

  const updateSetting = (key: string, value: unknown) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateBlock = (id: string, key: string, value: unknown) => {
    setBlocks((items) => items.map((item) => item.id === id
      ? { ...item, settings: { ...item.settings, [key]: value } }
      : item));
  };

  const addBlock = () => {
    const selected = allowedDefinitions.find((item) => item.type === blockType) || allowedDefinitions[0];
    if (!selected) return toast.error("Bu section için eklenebilir hazır block yok.");
    if (blocks.length >= maxBlocks) return toast.error(`Bu bölüm en fazla ${maxBlocks} block kabul eder.`);
    setBlocks((items) => [...items, {
      id: uid(`block-${selected.type}`),
      type: selected.type,
      settings: blockDefaults(selected.type),
    }]);
  };

  const save = async () => {
    if (busy) return;
    if (blocks.length > maxBlocks) return toast.error(`Block sayısı maxBlocks sınırını aşıyor (${maxBlocks}).`);

    setBusy(true);
    try {
      const next = structuredClone(document) as ThemeDocument;
      const owned = new Set(section.blockIds || []);
      for (const blockId of owned) delete next.blocks[blockId];

      for (const block of blocks) {
        const blockDefinition = BLOCK_LIBRARY_BY_TYPE[block.type];
        if (!blockDefinition?.implemented || !definition?.allowedBlocks.includes(block.type)) {
          throw new Error(`${block.type} bu bölüm için izinli değil.`);
        }
        next.blocks[block.id] = {
          id: block.id,
          type: block.type,
          schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
          settings: structuredClone(block.settings),
        };
      }

      next.sections[section.id] = {
        ...section,
        settings: {
          ...section.settings,
          ...settings,
        },
        blockIds: blocks.map((block) => block.id),
        schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
      };

      await onApply(next, `${definition?.label || section.type} blokları güncellendi`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bölüm kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const hasColumns = ["gallery-grid", "masonry-gallery", "collage", "social-grid", "logo-cloud", "text-columns", "stats", "feature-grid", "trust-badges", "testimonials", "press-awards", "team"].includes(section.type);
  const hasGap = hasColumns || section.type === "slideshow";
  const hasGenericBody = ["heading-subtext", "manifesto", "promo-banner", "shipping-returns-cta"].includes(section.type);
  const hasAlign = ["heading-subtext", "manifesto", "quote", "promo-banner", "shipping-returns-cta"].includes(section.type);
  const hasLink = ["promo-banner", "shipping-returns-cta"].includes(section.type);
  const showBlockComposer = allowedDefinitions.length > 0;

  return (
    <div className="fixed inset-0 z-[2147483607] grid place-items-center bg-black/35 p-3 backdrop-blur-sm">
      <div className="flex max-h-[92dvh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/10 px-4">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold">{definition?.label || section.type}</p>
            <p className="mt-0.5 truncate text-[8px] text-black/40">{section.id} · {blocks.length}/{maxBlocks} block</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.04]" aria-label="Kapat"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!["announcement-bar", "marquee"].includes(section.type) ? (
            <div className="grid gap-3 rounded-xl border border-black/[0.08] bg-[#fafafa] p-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                Bölüm başlığı
                <input value={text(settings.title)} onChange={(event) => updateSetting("title", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
              </label>
              <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                Eyebrow
                <input value={text(settings.eyebrow)} onChange={(event) => updateSetting("eyebrow", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
              </label>
              {hasGenericBody ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                  Metin
                  <textarea value={text(settings.body)} onChange={(event) => updateSetting("body", event.target.value)} className="min-h-24 resize-y rounded-lg border border-black/10 bg-white p-2.5 text-[9px] leading-5 outline-none" />
                </label>
              ) : null}
              {section.type === "quote" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Alıntı
                    <textarea value={text(settings.quote)} onChange={(event) => updateSetting("quote", event.target.value)} className="min-h-24 resize-y rounded-lg border border-black/10 bg-white p-2.5 text-[9px] leading-5 outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Atıf
                    <input value={text(settings.attribution)} onChange={(event) => updateSetting("attribution", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                </>
              ) : null}
              {section.type === "countdown" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Hedef zaman
                    <input type="datetime-local" value={text(settings.targetTime).slice(0, 16)} onChange={(event) => updateSetting("targetTime", event.target.value ? new Date(event.target.value).toISOString() : "")} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Bitiş metni
                    <input value={text(settings.completedState)} onChange={(event) => updateSetting("completedState", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Stil
                    <select value={text(settings.style) || "cards"} onChange={(event) => updateSetting("style", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="cards">Kartlar</option>
                      <option value="inline">Inline</option>
                    </select>
                  </label>
                </>
              ) : null}
              {section.type === "shipping-returns-cta" ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  İkon / sembol
                  <input value={text(settings.icon)} onChange={(event) => updateSetting("icon", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                </label>
              ) : null}
              {hasAlign ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Hizalama
                  <select value={text(settings.align) || "center"} onChange={(event) => updateSetting("align", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                    <option value="left">Sol</option>
                    <option value="center">Orta</option>
                    <option value="right">Sağ</option>
                  </select>
                </label>
              ) : null}
              {["heading-subtext", "manifesto"].includes(section.type) ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Max genişlik
                  <input value={text(settings.maxWidth) || "900px"} onChange={(event) => updateSetting("maxWidth", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" placeholder="900px" />
                </label>
              ) : null}
              {hasLink ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    CTA metni
                    <input value={text(settings.linkLabel)} onChange={(event) => updateSetting("linkLabel", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    CTA bağlantısı
                    <input value={text(settings.linkHref)} onChange={(event) => updateSetting("linkHref", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" placeholder="/pages/..." />
                  </label>
                </>
              ) : null}
              {section.type === "spacer" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Masaüstü yükseklik
                    <input type="number" min={0} max={400} value={numberValue(settings.desktopHeight, 64)} onChange={(event) => updateSetting("desktopHeight", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Mobil yükseklik
                    <input type="number" min={0} max={300} value={numberValue(settings.mobileHeight, 40)} onChange={(event) => updateSetting("mobileHeight", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                </>
              ) : null}
              {section.type === "divider" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Genişlik
                    <input value={text(settings.width) || "100%"} onChange={(event) => updateSetting("width", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Kalınlık
                    <input type="number" min={1} max={12} value={numberValue(settings.thickness, 1)} onChange={(event) => updateSetting("thickness", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                </>
              ) : null}
              {section.type === "anchor" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Anchor ID
                    <input value={text(settings.anchorId)} onChange={(event) => updateSetting("anchorId", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-2.5 text-[8px] font-semibold text-black/45">
                    Etiketi erişilebilir içerikte tut
                    <input type="checkbox" checked={settings.labelVisibility === true} onChange={(event) => updateSetting("labelVisibility", event.target.checked)} />
                  </label>
                </>
              ) : null}
              {section.type === "before-after" ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Önce görseli
                    <select value={text(settings.beforeAssetId)} onChange={(event) => updateSetting("beforeAssetId", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="">Medya seçilmedi</option>
                      {mediaAssets.filter((asset) => asset.type === "image").map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.assetId} · v{asset.version || 1}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Sonra görseli
                    <select value={text(settings.afterAssetId)} onChange={(event) => updateSetting("afterAssetId", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="">Medya seçilmedi</option>
                      {mediaAssets.filter((asset) => asset.type === "image").map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.assetId} · v{asset.version || 1}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Önce etiketi
                    <input value={text(settings.beforeLabel)} onChange={(event) => updateSetting("beforeLabel", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Sonra etiketi
                    <input value={text(settings.afterLabel)} onChange={(event) => updateSetting("afterLabel", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Başlangıç divider konumu
                    <input type="range" min={10} max={90} value={numberValue(settings.divider, 50)} onChange={(event) => updateSetting("divider", Number(event.target.value))} />
                  </label>
                </>
              ) : null}
              {section.type === "hotspot-lookbook" ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                  Lookbook görseli
                  <select value={text(settings.imageAssetId)} onChange={(event) => updateSetting("imageAssetId", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                    <option value="">Medya seçilmedi</option>
                    {mediaAssets.filter((asset) => asset.type === "image").map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.assetId} · v{asset.version || 1}</option>)}
                  </select>
                </label>
              ) : null}
              {["image-text-split", "video-text-split"].includes(section.type) ? (
                <>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45 md:col-span-2">
                    Bölüm medyası
                    <select value={text(settings.imageAssetId)} onChange={(event) => updateSetting("imageAssetId", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="">Medya seçilmedi</option>
                      {mediaAssets
                        .filter((asset) => section.type === "video-text-split" ? asset.type === "video" : asset.type === "image")
                        .map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.type} · {asset.assetId} · v{asset.version || 1}</option>)}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    Medya konumu
                    <select value={text(settings.side) || "left"} onChange={(event) => updateSetting("side", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="left">Sol</option>
                      <option value="right">Sağ</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                    İçerik genişliği
                    <select value={text(settings.contentWidth) || "50%"} onChange={(event) => updateSetting("contentWidth", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                      <option value="40%">40%</option>
                      <option value="50%">50%</option>
                      <option value="60%">60%</option>
                    </select>
                  </label>
                </>
              ) : null}
              {hasColumns ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Masaüstü kolon
                  <input type="number" min={1} max={6} value={numberValue(settings.columns, 3)} onChange={(event) => updateSetting("columns", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                </label>
              ) : null}
              {hasGap ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Gap
                  <input type="number" min={0} max={100} value={numberValue(settings.gap, 20)} onChange={(event) => updateSetting("gap", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
                </label>
              ) : null}
              <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                Dikey boşluk
                <input type="number" min={0} max={240} value={numberValue(settings.paddingY, 64)} onChange={(event) => updateSetting("paddingY", Number(event.target.value))} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none" />
              </label>
              {section.type === "slideshow" ? (
                <label className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-2.5 text-[8px] font-semibold text-black/45">
                  Autoplay
                  <input type="checkbox" checked={settings.autoplay === true} onChange={(event) => updateSetting("autoplay", event.target.checked)} />
                </label>
              ) : null}
              {section.type === "timeline" ? (
                <label className="grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Yön
                  <select value={text(settings.orientation) || "vertical"} onChange={(event) => updateSetting("orientation", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                    <option value="vertical">Dikey</option>
                    <option value="horizontal">Yatay</option>
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}

          {showBlockComposer ? (
          <div className="mt-4 rounded-xl border border-black/[0.08]">
            <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.07] bg-[#fafafa] p-3">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-semibold">Bloklar</p>
                <p className="mt-1 text-[7px] text-black/35">Yalnız allowedBlocks + implemented=true kayıtları eklenebilir.</p>
              </div>
              {allowedDefinitions.length > 1 ? (
                <select value={blockType} onChange={(event) => setBlockType(event.target.value)} className="h-8 rounded-lg border border-black/10 bg-white px-2 text-[8px] font-medium outline-none">
                  {allowedDefinitions.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
                </select>
              ) : null}
              <button type="button" disabled={!allowedDefinitions.length || blocks.length >= maxBlocks} onClick={addBlock} className="flex h-8 items-center gap-1 rounded-lg bg-[#111] px-2.5 text-[8px] font-semibold text-white disabled:opacity-35">
                <Plus className="h-3 w-3" />Blok Ekle
              </button>
            </div>

            <div className="space-y-2 p-3">
              {blocks.map((block, index) => {
                const blockDefinition = BLOCK_LIBRARY_BY_TYPE[block.type];
                return (
                  <div key={block.id} className="rounded-xl border border-black/[0.08] bg-white p-3">
                    <div className="flex items-center gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[8px] font-semibold">{index + 1}. {blockDefinition?.label || block.type}</p>
                        <p className="mt-0.5 truncate text-[7px] text-black/30">{block.id} · {blockTitle(block)}</p>
                      </div>
                      <button type="button" disabled={index === 0} onClick={() => setBlocks((items) => {
                        const next = [...items];
                        [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                        return next;
                      })} className="grid h-7 w-7 place-items-center rounded-md hover:bg-black/[0.04] disabled:opacity-20" aria-label="Yukarı taşı"><ArrowUp className="h-3 w-3" /></button>
                      <button type="button" disabled={index === blocks.length - 1} onClick={() => setBlocks((items) => {
                        const next = [...items];
                        [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
                        return next;
                      })} className="grid h-7 w-7 place-items-center rounded-md hover:bg-black/[0.04] disabled:opacity-20" aria-label="Aşağı taşı"><ArrowDown className="h-3 w-3" /></button>
                      <button type="button" onClick={() => setBlocks((items) => items.filter((item) => item.id !== block.id))} className="grid h-7 w-7 place-items-center rounded-md text-red-600 hover:bg-red-50" aria-label="Sil"><Trash2 className="h-3 w-3" /></button>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {(blockDefinition?.settings || Object.keys(block.settings)).map((key) => {
                        const value = block.settings[key];
                        if (isMediaField(key)) {
                          return (
                            <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45 md:col-span-2">
                              {fieldLabel(key)}
                              <select value={text(value)} onChange={(event) => updateBlock(block.id, key, event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                                <option value="">Medya seçilmedi</option>
                                {mediaAssets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.type} · {asset.assetId} · v{asset.version || 1}</option>)}
                              </select>
                            </label>
                          );
                        }
                        if (isLongField(key)) {
                          return (
                            <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45 md:col-span-2">
                              {fieldLabel(key)}
                              <textarea value={text(value)} onChange={(event) => updateBlock(block.id, key, event.target.value)} className="min-h-20 resize-y rounded-lg border border-black/10 p-2.5 text-[9px] leading-5 outline-none" />
                            </label>
                          );
                        }
                        if ((key === "x" || key === "y") && block.type === "hotspot") {
                          return (
                            <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45">
                              {fieldLabel(key)}
                              <input type="number" min={0} max={100} value={numberValue(value, 50)} onChange={(event) => updateBlock(block.id, key, Number(event.target.value))} className="h-9 rounded-lg border border-black/10 px-2.5 text-[9px] outline-none" />
                            </label>
                          );
                        }
                        if (key === "targetType" && block.type === "hotspot") {
                          return (
                            <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45">
                              {fieldLabel(key)}
                              <select value={text(value) || "link"} onChange={(event) => updateBlock(block.id, key, event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-[9px] outline-none">
                                <option value="link">Bağlantı</option>
                                <option value="product">Ürün / ürün route'u</option>
                              </select>
                            </label>
                          );
                        }
                        return (
                          <label key={key} className="grid gap-1 text-[8px] font-semibold text-black/45">
                            {fieldLabel(key)}
                            <input value={text(value)} onChange={(event) => updateBlock(block.id, key, event.target.value)} className="h-9 rounded-lg border border-black/10 px-2.5 text-[9px] outline-none" />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {!blocks.length ? <p className="py-7 text-center text-[8px] text-black/35">Henüz blok yok. “Blok Ekle” ile section içeriğini oluştur.</p> : null}
            </div>
          </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-black/10 bg-[#fafafa] p-3">
          <p className="min-w-0 flex-1 truncate text-[8px] text-black/35">Stable block ID · max {maxBlocks} · schema {STORE_DESIGN_SCHEMA_VERSION}</p>
          <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-lg border border-black/10 bg-white px-4 text-[9px] font-semibold disabled:opacity-40">Vazgeç</button>
          <button type="button" disabled={busy} onClick={() => void save()} className="flex h-10 items-center gap-2 rounded-lg bg-[#111] px-4 text-[9px] font-semibold text-white disabled:opacity-40">
            <Save className="h-3.5 w-3.5" />{busy ? "Uygulanıyor…" : "Uygula"}
          </button>
        </footer>
      </div>
    </div>
  );
}
