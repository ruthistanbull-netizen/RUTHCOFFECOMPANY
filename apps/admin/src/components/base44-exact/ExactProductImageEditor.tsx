"use client";

import {
  FlipHorizontal2,
  ImageIcon,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  ZoomIn,
} from "lucide-react";
import {
  SaveLifecycleProvider,
  useSaveLifecycle,
  useSaveLifecycleSource,
} from "@ruth-commerce/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactFormModal, ExactIconButton, useExactToast } from "./primitives";

type Props = {
  open: boolean;
  imageUrl: string | null;
  onClose: () => void;
  onSave: (url: string) => void;
};

type ImageDraft = {
  zoom: number;
  rotation: number;
  flipX: boolean;
  offsetX: number;
  offsetY: number;
};

const defaultDraft = (): ImageDraft => ({
  zoom: 1,
  rotation: 0,
  flipX: false,
  offsetX: 0,
  offsetY: 0,
});

function fingerprint(value: ImageDraft) {
  return JSON.stringify(value);
}

function ExactProductImageEditorContent({ open, imageUrl, onClose, onSave }: Props) {
  const toast = useExactToast();
  const { save, saving, requestTransition } = useSaveLifecycle();
  const [draft, setDraft] = useState<ImageDraft>(() => defaultDraft());
  const drag = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const dirty = open && fingerprint(draft) !== fingerprint(defaultDraft());

  const reset = useCallback(() => {
    setDraft(defaultDraft());
    drag.current = null;
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [imageUrl, open, reset]);

  const persistDraft = useCallback(async () => {
    if (!imageUrl) return true;
    try {
      const result = await adminRequest<{ url?: string }>("/api/products/edit-image", {
        method: "POST",
        body: JSON.stringify({ url: imageUrl, ...draft }),
      });
      if (!result.url) throw new Error("Düzenlenmiş görsel adresi alınamadı.");
      onSave(result.url);
      toast.success("Görsel 3:4 ürün formatında düzenlendi.");
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Görsel düzenlenemedi.");
      return false;
    }
  }, [draft, imageUrl, onSave, toast]);

  useSaveLifecycleSource({
    id: "product-image-editor",
    dirty,
    save: persistDraft,
    discard: reset,
  });

  const requestClose = () => {
    if (saving) return;
    void requestTransition(onClose);
  };

  const handleSave = async () => {
    if (!imageUrl || saving) return;
    const saved = await save();
    if (saved) onClose();
  };

  return (
    <ExactFormModal
      open={open}
      onClose={requestClose}
      title="Ürün Görselini Düzenle"
      subtitle="Yakınlaştır, sürükle, döndür ve 3:4 ürün kartına hazırla"
      size="xl"
      footer={(
        <>
          <ExactButton variant="secondary" size="sm" onClick={reset} disabled={saving}>
            <RotateCcw className="h-4 w-4" /> Sıfırla
          </ExactButton>
          <ExactButton variant="secondary" size="sm" onClick={requestClose} disabled={saving}>Vazgeç</ExactButton>
          <ExactButton size="sm" onClick={() => void handleSave()} loading={saving} disabled={!dirty || !imageUrl}>
            <Save className="h-4 w-4" /> Düzenlemeyi Kaydet
          </ExactButton>
        </>
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="flex min-h-[480px] items-center justify-center rounded-[var(--radius-card)] bg-surface-secondary p-4">
          <div
            className="relative aspect-[3/4] h-[min(64vh,620px)] max-w-full cursor-grab overflow-hidden rounded-[var(--radius-card)] bg-black/90 shadow-floating active:cursor-grabbing"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, offsetX: draft.offsetX, offsetY: draft.offsetY };
            }}
            onPointerMove={(event) => {
              if (!drag.current || draft.zoom <= 1) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const offsetX = Math.max(-1, Math.min(1, drag.current.offsetX + (event.clientX - drag.current.x) / Math.max(1, rect.width * 0.35)));
              const offsetY = Math.max(-1, Math.min(1, drag.current.offsetY + (event.clientY - drag.current.y) / Math.max(1, rect.height * 0.35)));
              setDraft((current) => ({ ...current, offsetX, offsetY }));
            }}
            onPointerUp={(event) => {
              event.currentTarget.releasePointerCapture(event.pointerId);
              drag.current = null;
            }}
            onPointerCancel={() => { drag.current = null; }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Düzenlenen ürün görseli"
                draggable={false}
                className="absolute inset-0 h-full w-full select-none object-cover transition-transform duration-150"
                style={{ transform: `translate(${draft.offsetX * 16}%, ${draft.offsetY * 16}%) scale(${draft.zoom}) rotate(${draft.rotation}deg) scaleX(${draft.flipX ? -1 : 1})` }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-white/40"><ImageIcon className="h-12 w-12" /></div>
            )}
            <div className="pointer-events-none absolute inset-0 border-[1px] border-white/35" />
            <div className="pointer-events-none absolute left-1/3 top-0 h-full border-l border-dashed border-white/20" />
            <div className="pointer-events-none absolute left-2/3 top-0 h-full border-l border-dashed border-white/20" />
            <div className="pointer-events-none absolute left-0 top-1/3 w-full border-t border-dashed border-white/20" />
            <div className="pointer-events-none absolute left-0 top-2/3 w-full border-t border-dashed border-white/20" />
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-[var(--radius-control)] bg-surface-secondary p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="ruth-type-card-title flex items-center gap-2 text-main"><ZoomIn className="h-4 w-4 text-accent" /> Yakınlaştırma</span>
              <strong className="ruth-type-code text-accent">{Math.round(draft.zoom * 100)}%</strong>
            </div>
            <div className="flex items-center gap-2">
              <ExactIconButton icon={Minus} label="Uzaklaştır" variant="secondary" size="icon-sm" onClick={() => setDraft((current) => ({ ...current, zoom: Math.max(1, Number((current.zoom - 0.1).toFixed(1))) }))} />
              <input type="range" min="1" max="3" step="0.05" value={draft.zoom} onChange={(event) => setDraft((current) => ({ ...current, zoom: Number(event.target.value) }))} className="w-full accent-[hsl(var(--accent))]" />
              <ExactIconButton icon={Plus} label="Yakınlaştır" variant="secondary" size="icon-sm" onClick={() => setDraft((current) => ({ ...current, zoom: Math.min(3, Number((current.zoom + 0.1).toFixed(1))) }))} />
            </div>
          </div>

          <div className="rounded-[var(--radius-control)] bg-surface-secondary p-3">
            <p className="ruth-type-card-title mb-3 text-main">Döndürme ve Yansıtma</p>
            <div className="grid grid-cols-3 gap-2">
              <ExactButton variant="secondary" size="sm" onClick={() => setDraft((current) => ({ ...current, rotation: current.rotation - 90 }))}><RotateCcw className="h-4 w-4" /> Sola</ExactButton>
              <ExactButton variant="secondary" size="sm" onClick={() => setDraft((current) => ({ ...current, rotation: current.rotation + 90 }))}><RotateCw className="h-4 w-4" /> Sağa</ExactButton>
              <ExactButton variant={draft.flipX ? "primary" : "secondary"} size="sm" onClick={() => setDraft((current) => ({ ...current, flipX: !current.flipX }))}><FlipHorizontal2 className="h-4 w-4" /> Yansıt</ExactButton>
            </div>
          </div>

          <div className="rounded-[var(--radius-control)] bg-surface-secondary p-3">
            <p className="ruth-type-card-title text-main">Konum</p>
            <p className="ruth-type-caption mt-1 text-muted">Görseli önizleme üzerinde sürükleyerek ürünün kartta görünecek alanını belirle. Sürükleme yakınlaştırma yapıldığında aktif olur.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="ruth-type-code rounded-[var(--radius-small)] bg-surface-primary p-2 text-muted">Yatay: <strong className="text-main">{Math.round(draft.offsetX * 100)}</strong></div>
              <div className="ruth-type-code rounded-[var(--radius-small)] bg-surface-primary p-2 text-muted">Dikey: <strong className="text-main">{Math.round(draft.offsetY * 100)}</strong></div>
            </div>
          </div>

          <div className="ruth-type-caption rounded-[var(--radius-control)] bg-info-soft p-3 text-info-foreground">
            Kaydedilen görsel 1200 × 1600 WebP olarak oluşturulur. Orijinal görsel silinmez; yeni düzenlenmiş kopya ürün galerisine yazılır.
          </div>
        </div>
      </div>
    </ExactFormModal>
  );
}

export function ExactProductImageEditor(props: Props) {
  return (
    <SaveLifecycleProvider>
      <ExactProductImageEditorContent {...props} />
    </SaveLifecycleProvider>
  );
}
