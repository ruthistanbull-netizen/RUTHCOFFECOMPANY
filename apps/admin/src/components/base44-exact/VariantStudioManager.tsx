"use client";

import { AnimatePresence, Reorder, motion } from "framer-motion";
import { ImagePlus, Palette, Plus, Trash2, Type, X } from "lucide-react";
import { Pressable, reorderItem } from "@ruth-commerce/ui";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ExactDataCard, ExactEmptyState } from "./data";
import { ExactButton, ExactField, ExactIconButton, exactFormInputClass } from "./primitives";
import { VariantMediaReorderItem } from "./VariantMediaReorderItem";

export type StudioVariant = {
  id?: string;
  option_summary: string;
  price: string | number;
  stock: string | number;
  stock_status: string;
  image_url?: string | null;
  image_urls?: string[];
  options?: Record<string, string>;
  variant_display_type?: string;
  color_value?: string;
};

type AddOption = { id: string; label: string; color: string };

type Props = {
  variants: StudioVariant[];
  setVariants: Dispatch<SetStateAction<StudioVariant[]>>;
  productPhotos: string[];
  basePrice: string;
};

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function colorFor(variant: StudioVariant) {
  return variant.color_value || variant.options?.__colorValue || "";
}

function displayFor(variant: StudioVariant) {
  return variant.variant_display_type || variant.options?.__displayType || "list";
}

function fullscreenMotion() {
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
  };
}

export function VariantStudioManager({ variants, setVariants, productPhotos, basePrice }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [optionName, setOptionName] = useState("Renk");
  const [displayType, setDisplayType] = useState<"list" | "color">("list");
  const [addOptions, setAddOptions] = useState<AddOption[]>([
    { id: crypto.randomUUID(), label: "", color: "#111111" },
  ]);
  const [mediaIndex, setMediaIndex] = useState<number | null>(null);
  const [mediaOrder, setMediaOrder] = useState<string[]>([]);

  const mediaVariant = mediaIndex == null ? null : variants[mediaIndex];
  const allProductPhotos = useMemo(() => unique(productPhotos), [productPhotos]);
  const portalTarget = typeof document === "undefined" ? null : document.body;

  useEffect(() => {
    if (!addOpen && mediaIndex == null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (addOpen) setAddOpen(false);
      else setMediaIndex(null);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [addOpen, mediaIndex]);

  const updateVariant = (index: number, patch: Partial<StudioVariant>) => {
    setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...patch } : variant));
  };

  const openMedia = (index: number) => {
    const variant = variants[index];
    const current = unique([...(variant?.image_urls || []), variant?.image_url]);
    setMediaOrder(current.length ? current : allProductPhotos.slice(0, 1));
    setMediaIndex(index);
  };

  const saveMedia = () => {
    if (mediaIndex == null) return;
    const ordered = unique(mediaOrder);
    updateVariant(mediaIndex, {
      image_urls: ordered,
      image_url: ordered[0] || null,
    });
    setMediaIndex(null);
  };

  const resetAdd = () => {
    setOptionName("Renk");
    setDisplayType("list");
    setAddOptions([{ id: crypto.randomUUID(), label: "", color: "#111111" }]);
  };

  const saveNewVariants = () => {
    const cleanOptions = addOptions.filter((option) => option.label.trim());
    if (!cleanOptions.length) return;
    setVariants((current) => [
      ...current,
      ...cleanOptions.map((option) => {
        const label = option.label.trim();
        const options: Record<string, string> = {
          [optionName.trim() || "Seçenek"]: label,
          __displayType: displayType,
          __colorValue: displayType === "color" ? option.color : "",
        };
        return {
          option_summary: `${optionName.trim() || "Seçenek"}: ${label}`,
          price: basePrice || "",
          stock: 0,
          stock_status: "in_stock",
          image_url: allProductPhotos[0] || null,
          image_urls: allProductPhotos[0] ? [allProductPhotos[0]] : [],
          options,
          variant_display_type: displayType,
          color_value: displayType === "color" ? option.color : "",
        } satisfies StudioVariant;
      }),
    ]);
    setAddOpen(false);
    resetAdd();
  };

  const fullscreenEditors = portalTarget ? createPortal(
    <>
      <AnimatePresence>
        {addOpen ? (
          <motion.section
            {...fullscreenMotion()}
            className="fixed inset-0 z-[2147483600] flex h-[100dvh] w-screen flex-col overflow-hidden bg-surface-primary"
            role="dialog"
            aria-modal="true"
            aria-label="Yeni varyant ekle"
          >
            <header className="shrink-0 border-b border-border-subtle bg-surface-primary px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pb-4">
              <div className="mx-auto flex w-full max-w-2xl items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="ruth-type-section-title text-main">Yeni varyant ekle</h3>
                  <p className="ruth-type-caption mt-1 text-muted">Seçenek adını, görünümünü ve değerlerini belirle.</p>
                </div>
                <ExactIconButton icon={X} label="Kapat" variant="ghost" size="icon-sm" onClick={() => setAddOpen(false)} />
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-7">
              <div className="mx-auto grid w-full max-w-2xl gap-5">
                <ExactField label="Seçenek adı">
                  <input value={optionName} onChange={(event) => setOptionName(event.target.value)} className={exactFormInputClass} placeholder="Örn. Renk, Zincir Uzunluğu, Beden" />
                </ExactField>

                <div>
                  <p className="ruth-type-label mb-2 text-muted">Sitede nasıl gösterilsin?</p>
                  <div className="grid grid-cols-2 gap-2 rounded-[16px] bg-surface-secondary p-1.5">
                    <Pressable type="button" pressStrength="subtle" aria-pressed={displayType === "list"} onClick={() => setDisplayType("list")} className={`ruth-type-control flex h-11 items-center justify-center gap-2 rounded-[12px] ${displayType === "list" ? "bg-surface-primary text-main shadow-sm" : "text-muted"}`}>
                      <Type className="h-4 w-4" /> İsim olarak
                    </Pressable>
                    <Pressable type="button" pressStrength="subtle" aria-pressed={displayType === "color"} onClick={() => setDisplayType("color")} className={`ruth-type-control flex h-11 items-center justify-center gap-2 rounded-[12px] ${displayType === "color" ? "bg-surface-primary text-main shadow-sm" : "text-muted"}`}>
                      <Palette className="h-4 w-4" /> Renk olarak
                    </Pressable>
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="ruth-type-label text-muted">Seçenekler</p>
                    <Pressable type="button" pressStrength="subtle" className="ruth-type-control font-semibold text-accent" onClick={() => setAddOptions((current) => [...current, { id: crypto.randomUUID(), label: "", color: "#111111" }])}>+ Seçenek ekle</Pressable>
                  </div>
                  <div className="space-y-2.5">
                    {addOptions.map((option, index) => (
                      <motion.div layout key={option.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-[14px] bg-surface-secondary p-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          {displayType === "color" ? (
                            <input type="color" value={option.color} onChange={(event) => setAddOptions((current) => current.map((item) => item.id === option.id ? { ...item, color: event.target.value } : item))} className="h-10 w-11 shrink-0 cursor-pointer rounded-[10px] border-0 bg-transparent p-0" />
                          ) : (
                            <span className="ruth-type-code flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-primary font-bold tabular-nums text-subtle">{index + 1}</span>
                          )}
                          <input value={option.label} onChange={(event) => setAddOptions((current) => current.map((item) => item.id === option.id ? { ...item, label: event.target.value } : item))} className={`${exactFormInputClass} h-10`} placeholder={displayType === "color" ? "Örn. Orta Kavrum" : "Örn. 250 g"} autoFocus={index === 0} />
                        </div>
                        <ExactIconButton icon={Trash2} label="Seçeneği sil" variant="ghost" size="icon-sm" onClick={() => setAddOptions((current) => current.length === 1 ? current : current.filter((item) => item.id !== option.id))} />
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <footer className="shrink-0 border-t border-border-subtle bg-surface-primary px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pt-4">
              <div className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-2">
                <ExactButton variant="secondary" onClick={() => setAddOpen(false)}>Vazgeç</ExactButton>
                <ExactButton onClick={saveNewVariants}>Varyantları ekle</ExactButton>
              </div>
            </footer>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {mediaIndex != null && mediaVariant ? (
          <motion.section
            {...fullscreenMotion()}
            className="fixed inset-0 z-[2147483610] flex h-[100dvh] w-screen flex-col overflow-hidden bg-surface-primary"
            role="dialog"
            aria-modal="true"
            aria-label="Varyant görselleri"
          >
            <header className="shrink-0 border-b border-border-subtle bg-surface-primary px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pb-4">
              <div className="mx-auto flex w-full max-w-6xl items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="ruth-type-section-title text-main">Varyant görselleri</h3>
                  <p className="ruth-type-caption mt-1 truncate text-muted">{mediaVariant.option_summary}</p>
                </div>
                <ExactIconButton icon={X} label="Kapat" variant="ghost" size="icon-sm" onClick={() => setMediaIndex(null)} />
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-7">
              <div className="mx-auto w-full max-w-6xl">
                <div className="grid grid-cols-[minmax(0,1fr)_84px] gap-3 sm:grid-cols-[minmax(0,1fr)_112px] sm:gap-5 lg:grid-cols-[minmax(0,720px)_128px] lg:justify-center">
                  <div className="relative aspect-[3/4] max-h-[64dvh] overflow-hidden rounded-[20px] bg-surface-secondary sm:rounded-[24px]">
                    {mediaOrder[0] ? (
                      <motion.img key={mediaOrder[0]} src={mediaOrder[0]} alt="" initial={{ opacity: 0.45, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="h-full w-full object-cover" />
                    ) : (
                      <ImagePlus className="absolute inset-0 m-auto h-8 w-8 text-subtle" />
                    )}
                    <span className="ruth-type-caption absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 font-semibold text-white backdrop-blur-sm">Ana varyant görseli</span>
                  </div>

                  <Reorder.Group axis="y" values={mediaOrder} onReorder={setMediaOrder} className="max-h-[64dvh] space-y-2 overflow-y-auto pr-0.5 no-scrollbar">
                    {mediaOrder.map((photo, index) => (
                      <VariantMediaReorderItem
                        key={photo}
                        photo={photo}
                        index={index}
                        length={mediaOrder.length}
                        isMain={index === 0}
                        onMakeMain={() => setMediaOrder((current) => [photo, ...current.filter((item) => item !== photo)])}
                        onRemove={() => setMediaOrder((current) => current.filter((item) => item !== photo))}
                        onKeyboardMove={(fromIndex, toIndex) => setMediaOrder((current) => reorderItem(current, fromIndex, toIndex))}
                      />
                    ))}
                  </Reorder.Group>
                </div>

                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="ruth-type-card-title text-main">Üründeki bütün görseller</p>
                    <p className="ruth-type-caption text-subtle">Dokunarak varyanta ekle</p>
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                    {allProductPhotos.map((photo) => {
                      const selected = mediaOrder.includes(photo);
                      return (
                        <Pressable key={photo} type="button" pressStrength="subtle" aria-pressed={selected} onClick={() => setMediaOrder((current) => selected ? current : [...current, photo])} className={`relative aspect-[3/4] overflow-hidden rounded-[12px] ring-2 ${selected ? "ring-accent" : "ring-transparent hover:ring-border-strong"}`}>
                          <img src={photo} alt="" className="h-full w-full object-cover" />
                          {selected ? <span className="absolute inset-0 bg-accent/10" /> : null}
                        </Pressable>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <footer className="shrink-0 border-t border-border-subtle bg-surface-primary px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pt-4">
              <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-2">
                <ExactButton variant="secondary" onClick={() => setMediaIndex(null)}>Vazgeç</ExactButton>
                <ExactButton onClick={saveMedia}>Görsel sırasını kaydet</ExactButton>
              </div>
            </footer>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </>,
    portalTarget,
  ) : null;

  return (
    <>
      <ExactDataCard
        title="Varyantlar"
        action={
          <ExactButton variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Varyant ekle
          </ExactButton>
        }
      >
        <div className="space-y-2.5">
          {variants.map((variant, index) => {
            const image = variant.image_url || variant.image_urls?.[0] || allProductPhotos[0] || "";
            const color = colorFor(variant);
            const display = displayFor(variant);
            return (
              <motion.div
                layout
                key={variant.id || `${variant.option_summary}-${index}`}
                className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-[18px] border border-border-subtle bg-surface-secondary p-2.5 shadow-[0_1px_0_rgba(0,0,0,0.02)] md:grid-cols-[78px_minmax(0,1fr)]"
              >
                <Pressable
                  type="button"
                  pressStrength="standard"
                  onClick={() => openMedia(index)}
                  className="group relative h-[92px] w-full overflow-hidden rounded-[14px] bg-surface-tertiary ring-1 ring-border-subtle md:h-[86px]"
                  aria-label="Varyant görsellerini düzenle"
                >
                  {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="absolute inset-0 m-auto h-5 w-5 text-subtle" />}
                  <span className="ruth-type-caption absolute inset-x-1.5 bottom-1.5 rounded-full bg-black/55 px-1.5 py-1 text-center font-semibold text-white opacity-90 backdrop-blur-sm">Görseller</span>
                </Pressable>

                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    {display === "color" && color ? <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10" style={{ background: color }} /> : null}
                    <p className="ruth-type-card-title min-w-0 flex-1 truncate text-main">{variant.option_summary || `Varyant ${index + 1}`}</p>
                    <ExactIconButton
                      icon={Trash2}
                      label="Varyantı sil"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(150px,1.35fr)_0.75fr_0.55fr_0.85fr]">
                    <label className="min-w-0">
                      <span className="ruth-type-label mb-1 block text-subtle">Varyant</span>
                      <input value={variant.option_summary} onChange={(event) => updateVariant(index, { option_summary: event.target.value })} className={`${exactFormInputClass} h-9`} />
                    </label>
                    <label>
                      <span className="ruth-type-label mb-1 block text-subtle">Fiyat</span>
                      <input type="number" min="0" step="0.01" value={variant.price} onChange={(event) => updateVariant(index, { price: event.target.value })} className={`${exactFormInputClass} h-9`} />
                    </label>
                    <label>
                      <span className="ruth-type-label mb-1 block text-subtle">Stok</span>
                      <input type="number" min="0" value={variant.stock} onChange={(event) => updateVariant(index, { stock: event.target.value })} className={`${exactFormInputClass} h-9`} />
                    </label>
                    <label>
                      <span className="ruth-type-label mb-1 block text-subtle">Durum</span>
                      <select value={variant.stock_status} onChange={(event) => updateVariant(index, { stock_status: event.target.value })} className={`${exactFormInputClass} h-9`}>
                        <option value="in_stock">Stokta</option>
                        <option value="out_of_stock">Stok yok</option>
                        <option value="preorder">Ön sipariş</option>
                      </select>
                    </label>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {!variants.length ? <ExactEmptyState compact icon={ImagePlus} title="Varyant yok" description="Varyant ekle butonuyla seçeneklerini oluşturabilirsin." /> : null}
        </div>
      </ExactDataCard>

      {fullscreenEditors}
    </>
  );
}
