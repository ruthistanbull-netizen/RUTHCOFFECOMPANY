"use client";

import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  BLOCK_LIBRARY_BY_TYPE,
  SECTION_LIBRARY_BY_TYPE,
  STORE_DESIGN_SCHEMA_VERSION,
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

const EDITABLE_TYPES = new Set([
  "featured-products",
  "product-slider",
  "image-banner",
  "rich-text",
  "faq",
]);

export function canEditStoreDesignSection(type: string) {
  return EDITABLE_TYPES.has(type);
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

type FaqDraftItem = { id: string; question: string; answer: string };

function uid(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
  return `${prefix}-${random}`.slice(0, 160);
}

export function StoreDesignSectionEditor({ document, section, onApply, onClose }: Props) {
  const toast = useExactToast();
  const definition = SECTION_LIBRARY_BY_TYPE[section.type];
  const [settings, setSettings] = useState<Record<string, unknown>>(() => structuredClone(section.settings || {}));
  const [faqItems, setFaqItems] = useState<FaqDraftItem[]>(() => (section.blockIds || [])
    .map((blockId) => document.blocks[blockId])
    .filter((block) => block?.type === "faq-item")
    .map((block) => ({
      id: block.id,
      question: textValue(block.settings.question),
      answer: textValue(block.settings.answer),
    })));
  const [busy, setBusy] = useState(false);

  const imageAssets = useMemo(
    () => Object.values(document.media).filter((asset) => asset.type === "image"),
    [document.media],
  );

  const set = (key: string, value: unknown) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = structuredClone(document) as ThemeDocument;
      const nextBlockIds = section.type === "faq" ? faqItems.map((item) => item.id) : section.blockIds;
      if (section.type === "faq") {
        for (const blockId of section.blockIds || []) delete next.blocks[blockId];
        for (const item of faqItems) {
          next.blocks[item.id] = {
            id: item.id,
            type: "faq-item",
            schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
            settings: {
              question: item.question.trim(),
              answer: item.answer.trim(),
            },
          };
        }
      }
      next.sections[section.id] = {
        ...section,
        settings: {
          ...section.settings,
          ...settings,
        },
        blockIds: nextBlockIds,
      };
      await onApply(next, `${definition?.label || "Bölüm"} ayarları güncellendi`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bölüm ayarları kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const productSection = section.type === "featured-products" || section.type === "product-slider";
  const imageBanner = section.type === "image-banner";
  const richText = section.type === "rich-text";
  const faq = section.type === "faq";

  return (
    <div className="fixed inset-0 z-[2147483605] grid place-items-center bg-black/35 p-3 backdrop-blur-sm">
      <div className="flex max-h-[90dvh] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/10 px-4">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold">{definition?.label || section.type}</p>
            <p className="mt-0.5 truncate text-[8px] text-black/40">{section.id} · schema {section.schemaVersion}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.04]" aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {productSection ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-[9px] font-semibold text-black/50 md:col-span-2">
                Başlık
                <input value={textValue(settings.title)} onChange={(event) => set("title", event.target.value)} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
              </label>
              <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                Veri kaynağı
                <select value={textValue(settings.productSource) || "featured"} onChange={(event) => set("productSource", event.target.value)} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-[10px] outline-none">
                  <option value="featured">Öne çıkanlar</option>
                  <option value="all">Tüm ürünler</option>
                  <option value="collection">Koleksiyon</option>
                  <option value="category">Kategori</option>
                </select>
              </label>
              <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                Ürün limiti
                <input type="number" min={1} max={40} value={numberValue(settings.productLimit, section.type === "product-slider" ? 12 : 8)} onChange={(event) => set("productLimit", Number(event.target.value))} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
              </label>
              <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                Masaüstü kolon
                <input type="number" min={1} max={8} value={numberValue(settings.desktopItems, 4)} onChange={(event) => set("desktopItems", Number(event.target.value))} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
              </label>
              <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                Mobil kolon
                <input type="number" min={1} max={4} value={numberValue(settings.mobileItems, 2)} onChange={(event) => set("mobileItems", Number(event.target.value))} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
              </label>
              <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                Kart aralığı
                <input type="number" min={0} max={100} value={numberValue(settings.gap, 12)} onChange={(event) => set("gap", Number(event.target.value))} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
              </label>
              <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                Dikey boşluk
                <input type="number" min={0} max={240} value={numberValue(settings.paddingY, 64)} onChange={(event) => set("paddingY", Number(event.target.value))} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
              </label>
              {section.type === "product-slider" ? (
                <label className="flex items-center justify-between gap-3 rounded-lg border border-black/[0.08] p-3 text-[9px] font-semibold text-black/55 md:col-span-2">
                  Okları göster
                  <input type="checkbox" checked={booleanValue(settings.showArrows, true)} onChange={(event) => set("showArrows", event.target.checked)} />
                </label>
              ) : null}
            </div>
          ) : null}

          {faq ? (
            <div className="grid gap-4">
              <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                Bölüm başlığı
                <input value={textValue(settings.title)} onChange={(event) => set("title", event.target.value)} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
              </label>
              <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                Dikey boşluk
                <input type="number" min={0} max={240} value={numberValue(settings.paddingY, 64)} onChange={(event) => set("paddingY", Number(event.target.value))} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
              </label>

              <div className="rounded-xl border border-black/[0.08] bg-[#fafafa] p-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-semibold">Bloklar</p>
                    <p className="mt-1 text-[7px] text-black/35">{BLOCK_LIBRARY_BY_TYPE["faq-item"]?.label || "FAQ Öğesi"} · en fazla {definition?.maxBlocks || 30}</p>
                  </div>
                  <button
                    type="button"
                    disabled={faqItems.length >= (definition?.maxBlocks || 30)}
                    onClick={() => setFaqItems((items) => [...items, { id: uid("block-faq-item"), question: "Yeni soru", answer: "" }])}
                    className="flex h-8 items-center gap-1 rounded-lg bg-[#111] px-2.5 text-[8px] font-semibold text-white disabled:opacity-35"
                  >
                    <Plus className="h-3 w-3" />Blok Ekle
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {faqItems.map((item, index) => (
                    <div key={item.id} className="rounded-lg border border-black/[0.08] bg-white p-3">
                      <div className="flex items-center gap-1">
                        <p className="min-w-0 flex-1 truncate text-[8px] font-semibold">{index + 1}. FAQ Öğesi</p>
                        <button type="button" disabled={index === 0} onClick={() => setFaqItems((items) => {
                          const next = [...items];
                          [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
                          return next;
                        })} className="grid h-7 w-7 place-items-center rounded-md hover:bg-black/[0.04] disabled:opacity-20" aria-label="Bloku yukarı taşı"><ArrowUp className="h-3 w-3" /></button>
                        <button type="button" disabled={index === faqItems.length - 1} onClick={() => setFaqItems((items) => {
                          const next = [...items];
                          [next[index + 1], next[index]] = [next[index]!, next[index + 1]!];
                          return next;
                        })} className="grid h-7 w-7 place-items-center rounded-md hover:bg-black/[0.04] disabled:opacity-20" aria-label="Bloku aşağı taşı"><ArrowDown className="h-3 w-3" /></button>
                        <button type="button" onClick={() => setFaqItems((items) => items.filter((entry) => entry.id !== item.id))} className="grid h-7 w-7 place-items-center rounded-md text-red-600 hover:bg-red-50" aria-label="Bloku sil"><Trash2 className="h-3 w-3" /></button>
                      </div>
                      <label className="mt-2 grid gap-1 text-[8px] font-semibold text-black/45">
                        Soru
                        <input value={item.question} onChange={(event) => setFaqItems((items) => items.map((entry) => entry.id === item.id ? { ...entry, question: event.target.value } : entry))} className="h-9 rounded-lg border border-black/10 px-2.5 text-[9px] font-medium text-black outline-none" />
                      </label>
                      <label className="mt-2 grid gap-1 text-[8px] font-semibold text-black/45">
                        Cevap
                        <textarea value={item.answer} onChange={(event) => setFaqItems((items) => items.map((entry) => entry.id === item.id ? { ...entry, answer: event.target.value } : entry))} className="min-h-20 resize-y rounded-lg border border-black/10 p-2.5 text-[9px] leading-5 text-black outline-none" />
                      </label>
                    </div>
                  ))}
                  {!faqItems.length ? <p className="py-4 text-center text-[8px] text-black/35">Henüz blok yok. “Blok Ekle” ile ilk FAQ öğesini oluştur.</p> : null}
                </div>
              </div>
            </div>
          ) : null}

          {imageBanner || richText ? (
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                  Eyebrow
                  <input value={textValue(settings.eyebrow)} onChange={(event) => set("eyebrow", event.target.value)} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
                </label>
                <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                  Başlık
                  <input value={textValue(settings.title)} onChange={(event) => set("title", event.target.value)} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
                </label>
              </div>

              <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                Metin
                <textarea value={textValue(settings.body)} onChange={(event) => set("body", event.target.value)} className="min-h-28 resize-y rounded-lg border border-black/10 p-3 text-[10px] leading-5 outline-none" />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                  CTA metni
                  <input value={textValue(settings.linkLabel)} onChange={(event) => set("linkLabel", event.target.value)} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
                </label>
                <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                  CTA bağlantısı
                  <input value={textValue(settings.linkHref)} onChange={(event) => set("linkHref", event.target.value)} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" placeholder="/pages/..." />
                </label>
              </div>

              {imageBanner ? (
                <>
                  <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                    Banner medyası
                    <select value={textValue(settings.imageAssetId)} onChange={(event) => set("imageAssetId", event.target.value || undefined)} className="h-10 rounded-lg border border-black/10 bg-white px-3 text-[10px] outline-none">
                      <option value="">Medya seçilmedi</option>
                      {imageAssets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.assetId} · v{asset.version || 1}</option>)}
                    </select>
                    <span className="text-[8px] font-normal leading-4 text-black/35">Yeni dosya yüklemek veya mobil varyant/focal point belirlemek için üstteki Medya kütüphanesini kullan.</span>
                  </label>
                  {textValue(settings.imageAssetId) && document.media[textValue(settings.imageAssetId)]?.url ? (
                    <img src={document.media[textValue(settings.imageAssetId)]!.url} alt="" className="h-36 w-full rounded-xl border border-black/[0.08] object-cover" />
                  ) : null}
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                      Masaüstü yükseklik
                      <input type="number" min={120} max={1200} value={numberValue(settings.desktopHeight, 520)} onChange={(event) => set("desktopHeight", Number(event.target.value))} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
                    </label>
                    <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                      Mobil yükseklik
                      <input type="number" min={100} max={900} value={numberValue(settings.mobileHeight, 360)} onChange={(event) => set("mobileHeight", Number(event.target.value))} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
                    </label>
                  </div>
                  <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                    Köşe yuvarlaklığı
                    <input type="number" min={0} max={120} value={numberValue(settings.borderRadius, 0)} onChange={(event) => set("borderRadius", Number(event.target.value))} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
                  </label>
                </>
              ) : null}

              <label className="grid gap-1.5 text-[9px] font-semibold text-black/50">
                Dikey boşluk
                <input type="number" min={0} max={240} value={numberValue(settings.paddingY, 64)} onChange={(event) => set("paddingY", Number(event.target.value))} className="h-10 rounded-lg border border-black/10 px-3 text-[10px] outline-none" />
              </label>
            </div>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-black/10 bg-[#fafafa] p-3">
          <p className="min-w-0 flex-1 truncate text-[8px] text-black/35">
            Registry izinleri: {definition?.settings.join(" · ") || "schema kontrollü"}
          </p>
          <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-lg border border-black/10 bg-white px-4 text-[9px] font-semibold disabled:opacity-40">Vazgeç</button>
          <button type="button" disabled={busy} onClick={() => void save()} className="flex h-10 items-center gap-2 rounded-lg bg-[#111] px-4 text-[9px] font-semibold text-white disabled:opacity-40">
            <Save className="h-3.5 w-3.5" />{busy ? "Uygulanıyor…" : "Uygula"}
          </button>
        </footer>
      </div>
    </div>
  );
}
