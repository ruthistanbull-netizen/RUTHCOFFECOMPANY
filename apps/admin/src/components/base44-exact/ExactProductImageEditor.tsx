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
  focalX: number;
  focalY: number;
};

const defaultDraft = (): ImageDraft => ({
  zoom: 1,
  rotation: 0,
  flipX: false,
  focalX: 0.5,
  focalY: 0.5,
});

function fingerprint(value: ImageDraft) {
  return JSON.stringify([value.focalX, value.focalY, value.zoom, value.rotation, value.flipX]);
}

function ExactProductImageEditorContent({ open, imageUrl, onClose, onSave }: Props) {
  const toast = useExactToast();
  const { save, saving, requestTransition } = useSaveLifecycle();
  const [draft, setDraft] = useState<ImageDraft>(() => defaultDraft());
  const [initial, setInitial] = useState<ImageDraft>(() => defaultDraft());
  const [application, setApplication] = useState<ImageDraft>(() => defaultDraft());
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [needsRenditions, setNeedsRenditions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState({ width: 1, height: 1 });
  const [frameSize, setFrameSize] = useState({ width: 1, height: 1 });
  const frame = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) setFrameSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const drag = useRef<{ x: number; y: number; focalX: number; focalY: number } | null>(null);
  const dirty = open && !loading && !!originalUrl && (needsRenditions || fingerprint(draft) !== fingerprint(initial));
  const quarterTurn = Math.abs(draft.rotation % 180) === 90;
  const width = quarterTurn ? sourceSize.height : sourceSize.width;
  const height = quarterTurn ? sourceSize.width : sourceSize.height;
  const scale = Math.max(frameSize.width / width, frameSize.height / height) * draft.zoom;
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  const halfX = frameSize.width / drawnWidth / 2;
  const halfY = frameSize.height / drawnHeight / 2;
  const focalX = Math.min(1 - halfX, Math.max(halfX, draft.focalX));
  const focalY = Math.min(1 - halfY, Math.max(halfY, draft.focalY));

  const reset = useCallback(() => {
    setDraft(defaultDraft());
    drag.current = null;
  }, []);

  useEffect(() => {
    if (!open || !imageUrl) return;
    let active = true;
    setLoading(true); setOriginalUrl(null); setLoadError(null); drag.current = null;
    void adminRequest<{ originalURL: string; edits: { website: ImageDraft; application: ImageDraft }; hasRenditions: boolean }>(
      "/api/products/edit-image?url=" + encodeURIComponent(imageUrl), { method: "GET" },
    ).then((result) => {
      if (!active) return;
      setDraft(result.edits.website); setInitial(result.edits.website);
      setApplication(result.edits.application); setOriginalUrl(result.originalURL);
      setNeedsRenditions(!result.hasRenditions);
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : "Fotoğraf yüklenemedi.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [imageUrl, open]);


  const persistDraft = useCallback(async () => {
    if (!imageUrl || !originalUrl || loading || loadError) return false;
    try {
      const result = await adminRequest<{ url?: string }>("/api/products/edit-image", {
        method: "POST",
        body: JSON.stringify({ url: imageUrl, edits: { website: draft, application } }),
      });
      if (!result.url) throw new Error("Düzenlenmiş görsel adresi alınamadı.");
      onSave(result.url);
      toast.success("Görsel 3:4 ürün formatında düzenlendi.");
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Görsel düzenlenemedi.");
      return false;
    }
  }, [draft, application, imageUrl, originalUrl, loading, loadError, onSave, toast]);

  useSaveLifecycleSource({
    id: "product-image-editor",
    dirty,
    save: persistDraft,
    discard: () => setDraft(initial),
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
          <ExactButton size="sm" onClick={() => void handleSave()} loading={saving} disabled={!dirty || !imageUrl || !!loadError}>
            <Save className="h-4 w-4" /> Düzenlemeyi Kaydet
          </ExactButton>
        </>
      )}
    >
      {loading && <p role="status">Orijinal fotoğraf yükleniyor…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      <fieldset disabled={loading || saving || !!loadError} className="grid min-w-0 gap-4 border-0 p-0 lg:grid-cols-[1fr_280px]">
        <div className="flex min-h-[480px] items-center justify-center rounded-[var(--radius-card)] bg-surface-secondary p-4">
          <div
            ref={frame}
            style={{ touchAction: "none" }}
            className="relative aspect-[3/4] h-[min(64vh,620px)] max-w-full cursor-grab overflow-hidden rounded-[var(--radius-card)] bg-black/90 shadow-floating active:cursor-grabbing"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, focalX, focalY };
            }}
            onPointerMove={(event) => {
              if (!drag.current || loading || saving) return;
              const nextX = Math.max(halfX, Math.min(1 - halfX, drag.current.focalX - (event.clientX - drag.current.x) / drawnWidth));
              const nextY = Math.max(halfY, Math.min(1 - halfY, drag.current.focalY - (event.clientY - drag.current.y) / drawnHeight));
              setDraft((current) => ({ ...current, focalX: nextX, focalY: nextY }));
            }}
            onPointerUp={(event) => {
              event.currentTarget.releasePointerCapture(event.pointerId);
              drag.current = null;
            }}
            onPointerCancel={() => { drag.current = null; }}
          >
            {originalUrl ? (
              <img
                src={originalUrl}
                alt="Düzenlenen ürün görseli"
                draggable={false}
                onLoad={(event) => setSourceSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                onError={() => setLoadError("Orijinal fotoğraf görüntülenemedi.")}
                className="absolute select-none max-w-none"
                aria-busy={loading}
                style={{ width: sourceSize.width * scale, height: sourceSize.height * scale,
                  left: frameSize.width / 2 + (0.5 - focalX) * drawnWidth,
                  top: frameSize.height / 2 + (0.5 - focalY) * drawnHeight,
                  transform: `translate(-50%, -50%) scaleX(${draft.flipX ? -1 : 1}) rotate(${draft.rotation}deg)` }}
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
              <input type="range" min="1" max="4" step="0.05" value={draft.zoom} onChange={(event) => setDraft((current) => ({ ...current, zoom: Number(event.target.value) }))} className="w-full accent-[hsl(var(--accent))]" />
              <ExactIconButton icon={Plus} label="Yakınlaştır" variant="secondary" size="icon-sm" onClick={() => setDraft((current) => ({ ...current, zoom: Math.min(4, Number((current.zoom + 0.1).toFixed(1))) }))} />
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
            <p className="ruth-type-caption mt-1 text-muted">Görseli önizleme üzerinde sürükleyerek ürünün kartta görünecek alanını belirle. Website kadrajı uygulamadaki kadrajdan bağımsız kaydedilir.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="ruth-type-code rounded-[var(--radius-small)] bg-surface-primary p-2 text-muted">Yatay: <strong className="text-main">{Math.round(draft.focalX * 100)}</strong></div>
              <div className="ruth-type-code rounded-[var(--radius-small)] bg-surface-primary p-2 text-muted">Dikey: <strong className="text-main">{Math.round(draft.focalY * 100)}</strong></div>
            </div>
          </div>

          <div className="ruth-type-caption rounded-[var(--radius-control)] bg-info-soft p-3 text-info-foreground">
            Kaydedilen görsel 1200 × 1600 WebP olarak oluşturulur. Orijinal görsel silinmez; yeni düzenlenmiş kopya ürün galerisine yazılır.
          </div>
        </div>
      </fieldset>
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
