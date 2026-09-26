"use client";

import {
  Film,
  Image as ImageIcon,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  themeMediaUsageCount,
  type MediaAsset,
  type ThemeDocument,
} from "@ruth-commerce/commerce-core/store-design-v2";
import { uploadThemeMedia } from "@/lib/themeImageUpload";
import { useExactToast } from "@/components/base44-exact/primitives";

type Props = {
  document: ThemeDocument;
  onApply: (next: ThemeDocument, label: string) => Promise<void>;
  onClose: () => void;
  onSelect?: (assetId: string) => void;
  selectedAssetId?: string;
  mediaType?: "image" | "video" | "any";
};

function uid() {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "") || Math.random().toString(36).slice(2);
  return `media-${random}`.slice(0, 160);
}

function bytesLabel(value?: number) {
  if (!value || value <= 0) return "Boyut bilinmiyor";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function accepted(mediaType: Props["mediaType"]) {
  if (mediaType === "image") return "image/*,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif";
  if (mediaType === "video") return "video/*,.mp4,.m4v,.mov,.webm";
  return "image/*,video/*,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif,.mp4,.m4v,.mov,.webm";
}

async function readClientMetadata(file: File, type: "image" | "video") {
  if (typeof URL === "undefined") return {} as { width?: number; height?: number; duration?: number };
  const url = URL.createObjectURL(file);
  try {
    if (type === "image") {
      return await new Promise<{ width?: number; height?: number }>((resolve) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth || undefined, height: image.naturalHeight || undefined });
        image.onerror = () => resolve({});
        image.src = url;
      });
    }
    return await new Promise<{ width?: number; height?: number; duration?: number }>((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve({
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        duration: Number.isFinite(video.duration) ? video.duration : undefined,
      });
      video.onerror = () => resolve({});
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function StoreDesignMediaLibrary({
  document,
  onApply,
  onClose,
  onSelect,
  selectedAssetId,
  mediaType = "any",
}: Props) {
  const toast = useExactToast();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(selectedAssetId || null);
  const [focal, setFocal] = useState<{ x: number; y: number } | null>(null);

  const assets = useMemo(() => Object.values(document.media)
    .filter((asset) => mediaType === "any" || asset.type === mediaType)
    .filter((asset) => {
      const needle = query.trim().toLocaleLowerCase("tr-TR");
      if (!needle) return true;
      return asset.assetId.toLocaleLowerCase("tr-TR").includes(needle)
        || asset.url.toLocaleLowerCase("tr-TR").includes(needle)
        || asset.type.includes(needle);
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
  [document.media, mediaType, query]);

  const selected = detailId ? document.media[detailId] : null;
  const imageAssets = useMemo(() => Object.values(document.media).filter((asset) => asset.type === "image"), [document.media]);

  const commit = async (next: ThemeDocument, label: string) => {
    setBusy(true);
    try {
      next.revision = Math.max(next.revision, document.revision) + 1;
      await onApply(next, label);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    if (busy) return;
    setBusy(true);
    try {
      const uploadResult = await uploadThemeMedia(file);
      if (mediaType !== "any" && uploadResult.mediaType !== mediaType) {
        throw new Error(mediaType === "image" ? "Bu alanda yalnız görsel seçilebilir." : "Bu alanda yalnız video seçilebilir.");
      }
      const metadata = await readClientMetadata(file, uploadResult.mediaType);
      const assetId = uid();
      const next = structuredClone(document) as ThemeDocument;
      next.media[assetId] = {
        assetId,
        type: uploadResult.mediaType,
        url: uploadResult.url,
        version: 1,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        bytes: uploadResult.bytes || file.size,
        mime: uploadResult.mime || file.type || undefined,
        usageCount: 0,
        focalPoint: { x: 50, y: 50 },
        createdAt: new Date().toISOString(),
      };
      next.revision = Math.max(next.revision, document.revision) + 1;
      await onApply(next, "Medya kütüphanesine dosya eklendi");
      setDetailId(assetId);
      setFocal({ x: 50, y: 50 });
      toast.success("Medya yüklendi.");
      if (onSelect) onSelect(assetId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Medya yüklenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const replaceAsset = async (asset: MediaAsset, file: File) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await uploadThemeMedia(file);
      if (result.mediaType !== asset.type) throw new Error("Yeni sürüm mevcut medya tipiyle aynı olmalı.");
      const metadata = await readClientMetadata(file, result.mediaType);
      const next = structuredClone(document) as ThemeDocument;
      next.media[asset.assetId] = {
        ...asset,
        url: result.url,
        version: Math.max(1, asset.version || 1) + 1,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        bytes: result.bytes || file.size,
        mime: result.mime || file.type || asset.mime,
      };
      next.revision = Math.max(next.revision, document.revision) + 1;
      await onApply(next, "Medya yeni sürümle değiştirildi");
      toast.success("Yeni medya sürümü kaydedildi.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Medya değiştirilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const removeAsset = async (asset: MediaAsset) => {
    const usage = themeMediaUsageCount(document, asset.assetId);
    if (usage > 0) return toast.error(`Bu medya ${usage} yerde kullanılıyor; önce referansları kaldır.`);
    const next = structuredClone(document) as ThemeDocument;
    delete next.media[asset.assetId];
    if (detailId === asset.assetId) setDetailId(null);
    await commit(next, "Kullanılmayan medya kaydı kaldırıldı");
    toast.success("Medya kaydı kaldırıldı.");
  };

  const saveAssetSettings = async () => {
    if (!selected) return;
    const next = structuredClone(document) as ThemeDocument;
    next.media[selected.assetId] = {
      ...selected,
      focalPoint: focal || selected.focalPoint || { x: 50, y: 50 },
    };
    await commit(next, "Medya odak noktası güncellendi");
    toast.success("Medya ayarları güncellendi.");
  };

  const setRelation = async (key: "posterAssetId" | "mobileAssetId", value: string) => {
    if (!selected) return;
    const next = structuredClone(document) as ThemeDocument;
    next.media[selected.assetId] = {
      ...selected,
      [key]: value || undefined,
    };
    await commit(next, key === "posterAssetId" ? "Video posteri güncellendi" : "Mobil medya varyantı güncellendi");
  };

  return (
    <div className="fixed inset-0 z-[2147483610] grid place-items-center bg-black/35 p-3 backdrop-blur-sm">
      <div className="flex h-[min(880px,94dvh)] w-full max-w-[1120px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/10 px-4">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold">Media Library V2</p>
              <p className="mt-0.5 text-[8px] text-black/40">Fotoğraf/video kayıtları, sürüm, kullanım ve responsive varyantlar tek kaynaktan yönetilir.</p>
            </div>
            <label className="relative flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-[#111] px-3 text-[9px] font-semibold text-white">
              {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {busy ? "İşleniyor…" : "Medya Yükle"}
              <input
                type="file"
                accept={accepted(mediaType)}
                disabled={busy}
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void upload(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-black/[0.04]" aria-label="Kapat"><X className="h-4 w-4" /></button>
          </header>

          <div className="border-b border-black/[0.07] p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-black/30" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Medya ara…" className="h-9 w-full rounded-lg border border-black/10 pl-9 pr-3 text-[9px] outline-none focus:border-black/25" />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {assets.map((asset) => {
                const usage = themeMediaUsageCount(document, asset.assetId);
                const active = detailId === asset.assetId;
                return (
                  <button
                    type="button"
                    key={asset.assetId}
                    onClick={() => {
                      setDetailId(asset.assetId);
                      setFocal(asset.focalPoint || { x: 50, y: 50 });
                      if (onSelect) onSelect(asset.assetId);
                    }}
                    className={`overflow-hidden rounded-xl border text-left transition ${active ? "border-black/35 ring-1 ring-black/10" : "border-black/[0.08] hover:border-black/20"}`}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-black/[0.04]">
                      {asset.type === "video" ? (
                        <video src={asset.url} poster={asset.posterAssetId ? document.media[asset.posterAssetId]?.url : undefined} className="h-full w-full object-cover" muted preload="metadata" />
                      ) : (
                        <img src={asset.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      )}
                      <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-1 text-[7px] font-semibold text-white">
                        {asset.type === "video" ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                        {asset.type === "video" ? "Video" : "Görsel"}
                      </span>
                    </div>
                    <div className="p-2">
                      <p className="truncate text-[8px] font-semibold">{asset.assetId}</p>
                      <p className="mt-1 text-[7px] text-black/35">v{asset.version || 1} · {bytesLabel(asset.bytes)} · {usage} kullanım</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {!assets.length ? (
              <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-black/10 text-center">
                <div>
                  <ImageIcon className="mx-auto h-6 w-6 text-black/20" />
                  <p className="mt-2 text-[9px] font-semibold text-black/45">Henüz medya yok</p>
                  <p className="mt-1 text-[8px] text-black/30">Yeni yüklemeler ThemeDocument.media kaydına stable asset ID ile eklenir.</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="hidden w-[310px] shrink-0 flex-col border-l border-black/10 bg-[#fafafa] md:flex">
          <div className="border-b border-black/10 p-3">
            <p className="text-[9px] font-semibold text-black/45">MEDYA AYARLARI</p>
          </div>
          {selected ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white">
                <div className="aspect-[4/3] bg-black/[0.04]">
                  {selected.type === "video" ? (
                    <video src={selected.url} poster={selected.posterAssetId ? document.media[selected.posterAssetId]?.url : undefined} className="h-full w-full object-cover" muted controls />
                  ) : (
                    <img src={selected.url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-[8px]">
                <div className="rounded-lg bg-white p-2"><dt className="text-black/35">Sürüm</dt><dd className="mt-1 font-semibold">v{selected.version || 1}</dd></div>
                <div className="rounded-lg bg-white p-2"><dt className="text-black/35">Kullanım</dt><dd className="mt-1 font-semibold">{themeMediaUsageCount(document, selected.assetId)}</dd></div>
                <div className="rounded-lg bg-white p-2"><dt className="text-black/35">Boyut</dt><dd className="mt-1 font-semibold">{selected.width && selected.height ? `${selected.width}×${selected.height}` : "—"}</dd></div>
                <div className="rounded-lg bg-white p-2"><dt className="text-black/35">Dosya</dt><dd className="mt-1 font-semibold">{bytesLabel(selected.bytes)}</dd></div>
              </dl>

              {selected.type === "image" ? (
                <div className="mt-4 rounded-xl border border-black/[0.08] bg-white p-3">
                  <p className="text-[9px] font-semibold">Focal point</p>
                  <p className="mt-1 text-[7px] leading-4 text-black/35">Cover/crop kullanılan alanlarda odak noktasını korur.</p>
                  <label className="mt-3 grid gap-1 text-[8px] text-black/45">Yatay · {Math.round(focal?.x ?? selected.focalPoint?.x ?? 50)}%
                    <input type="range" min="0" max="100" value={focal?.x ?? selected.focalPoint?.x ?? 50} onChange={(event) => setFocal({ x: Number(event.target.value), y: focal?.y ?? selected.focalPoint?.y ?? 50 })} />
                  </label>
                  <label className="mt-2 grid gap-1 text-[8px] text-black/45">Dikey · {Math.round(focal?.y ?? selected.focalPoint?.y ?? 50)}%
                    <input type="range" min="0" max="100" value={focal?.y ?? selected.focalPoint?.y ?? 50} onChange={(event) => setFocal({ x: focal?.x ?? selected.focalPoint?.x ?? 50, y: Number(event.target.value) })} />
                  </label>
                  <button type="button" disabled={busy} onClick={() => void saveAssetSettings()} className="mt-3 h-9 w-full rounded-lg bg-[#111] text-[8px] font-semibold text-white disabled:opacity-40">Odak Noktasını Kaydet</button>
                </div>
              ) : (
                <label className="mt-4 grid gap-1.5 text-[8px] font-semibold text-black/45">
                  Video poster
                  <select value={selected.posterAssetId || ""} onChange={(event) => void setRelation("posterAssetId", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2 text-[8px] font-medium text-black outline-none">
                    <option value="">Poster yok</option>
                    {imageAssets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{asset.assetId}</option>)}
                  </select>
                </label>
              )}

              <label className="mt-4 grid gap-1.5 text-[8px] font-semibold text-black/45">
                Mobil varyant
                <select value={selected.mobileAssetId || ""} onChange={(event) => void setRelation("mobileAssetId", event.target.value)} className="h-9 rounded-lg border border-black/10 bg-white px-2 text-[8px] font-medium text-black outline-none">
                  <option value="">Aynı medyayı kullan</option>
                  {Object.values(document.media).filter((asset) => asset.assetId !== selected.assetId && asset.type === selected.type).map((asset) => (
                    <option key={asset.assetId} value={asset.assetId}>{asset.assetId}</option>
                  ))}
                </select>
              </label>

              <label className="relative mt-4 flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-black/10 bg-white text-[8px] font-semibold">
                <RefreshCw className="h-3.5 w-3.5" />Yeni sürüm yükle
                <input
                  type="file"
                  accept={selected.type === "video" ? accepted("video") : accepted("image")}
                  disabled={busy}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void replaceAsset(selected, file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>

              <button type="button" disabled={busy || themeMediaUsageCount(document, selected.assetId) > 0} onClick={() => void removeAsset(selected)} className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white text-[8px] font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-40">
                <Trash2 className="h-3.5 w-3.5" />Kullanılmayan kaydı kaldır
              </button>
            </div>
          ) : (
            <div className="grid flex-1 place-items-center p-5 text-center text-[8px] leading-4 text-black/35">Ayarlarını görmek için bir medya seç.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
