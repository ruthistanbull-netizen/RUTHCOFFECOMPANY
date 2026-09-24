"use client";

import {
  AlertTriangle,
  Check,
  ImagePlus,
  Move,
  RotateCcw,
  RotateCw,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import { type PointerEvent, useEffect, useMemo, useState } from "react";
import { adminAuthHeaders } from "@/lib/adminApi";

type UploadResult = {
  url: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  upscaled: boolean;
};

export function ProductImageCropper({
  file,
  queuePosition = 0,
  queueTotal = 0,
  onClose,
  onUploaded,
}: {
  file: File | null;
  queuePosition?: number;
  queueTotal?: number;
  onClose: () => void;
  onUploaded: (result: UploadResult) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setFocalX(50);
    setFocalY(50);
    setZoom(1);
    setRotation(0);
    setError(null);

    const image = new Image();
    image.onload = () => setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = url;

    return () => URL.revokeObjectURL(url);
  }, [file]);

  const rotatedDimensions = useMemo(
    () => rotation === 90 || rotation === 270
      ? { width: dimensions.height, height: dimensions.width }
      : dimensions,
    [dimensions, rotation],
  );
  const lowResolution = useMemo(
    () => rotatedDimensions.width > 0 &&
      (rotatedDimensions.width < 1200 || rotatedDimensions.height < 1600),
    [rotatedDimensions],
  );
  const originalAspect = rotatedDimensions.height
    ? rotatedDimensions.width / rotatedDimensions.height
    : 0;
  const exactAspect = Math.abs(originalAspect - 0.75) < 0.005;

  if (!file) return null;

  const choosePoint = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setFocalX(Math.round(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * 100));
    setFocalY(Math.round(Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) * 100));
  };

  const reset = () => {
    setFocalX(50);
    setFocalY(50);
    setZoom(1);
    setRotation(0);
  };

  const rotate = () => {
    setRotation((current) => ((current + 90) % 360) as 0 | 90 | 180 | 270);
    setFocalX(50);
    setFocalY(50);
  };

  const upload = async () => {
    setUploading(true);
    setError(null);
    try {
      const headers = await adminAuthHeaders();
      const body = new FormData();
      body.append("file", file);
      body.append("focalX", String(focalX / 100));
      body.append("focalY", String(focalY / 100));
      body.append("zoom", String(zoom));
      body.append("rotation", String(rotation));

      const response = await fetch("/api/media/product-image", {
        method: "POST",
        headers,
        body,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Görsel yüklenemedi.");
      onUploaded(result as UploadResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Görsel yüklenemedi.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="cr-modal-layer cr-product-cropper-layer" role="presentation">
      <button className="cr-modal-backdrop" type="button" aria-label="Kadraj ekranını kapat" onClick={onClose} disabled={uploading} />
      <section className="cr-cropper" role="dialog" aria-modal="true" aria-labelledby="cropper-title">
        <header className="cr-cropper__header">
          <div>
            <span className="cr-eyebrow">Ürün görseli standardı</span>
            <h2 id="cropper-title">3:4 kadrajını ayarla</h2>
            <p>
              Çıktı otomatik olarak 1200 × 1600 px WebP oluşturulur.
              {queueTotal > 1 ? ` · Kuyrukta ${queuePosition}/${queueTotal}` : ""}
            </p>
          </div>
          <button className="cr-icon-button" type="button" onClick={onClose} disabled={uploading} aria-label="Kapat"><X /></button>
        </header>

        <div className="cr-cropper__body">
          <div className="cr-cropper__preview-column">
            <button className="cr-cropper__preview" type="button" onPointerDown={choosePoint} aria-label="Ürünün odak noktasını seç">
              <img
                src={previewUrl}
                alt="Yüklenecek ürün görseli önizlemesi"
                style={{
                  objectPosition: `${focalX}% ${focalY}%`,
                  transform: `rotate(${rotation}deg) scale(${zoom})`,
                }}
              />
              <span className="cr-cropper__focus" style={{ left: `${focalX}%`, top: `${focalY}%` }}><Move /></span>
              <span className="cr-cropper__ratio">3:4 · {rotation}°</span>
            </button>
            <div className="cr-cropper__file-info">
              <ImagePlus />
              <div>
                <strong>{file.name}</strong>
                <span>{rotatedDimensions.width || "—"} × {rotatedDimensions.height || "—"} px · {(file.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <span className={`cr-payment-pill cr-payment-pill--${exactAspect ? "success" : "info"}`}>{exactAspect ? "3:4 kaynak" : "Kırpılacak"}</span>
            </div>
          </div>

          <div className="cr-cropper__controls">
            {lowResolution ? <div className="cr-notice cr-notice--danger"><AlertTriangle /><span>Kaynak görsel 1200 × 1600 px altında. Sistem 3:4 üretecek ancak keskinlik sınırlı olabilir.</span></div> : <div className="cr-notice cr-notice--success"><Check /><span>Kaynak çözünürlük web çıktısı için uygun.</span></div>}
            {error ? <div className="cr-notice cr-notice--danger"><AlertTriangle /><span>{error}</span></div> : null}

            <label className="cr-range-field">
              <span><Move /> Yatay odak <strong>%{focalX}</strong></span>
              <input type="range" min="0" max="100" value={focalX} onChange={(event) => setFocalX(Number(event.target.value))} />
            </label>
            <label className="cr-range-field">
              <span><Move /> Dikey odak <strong>%{focalY}</strong></span>
              <input type="range" min="0" max="100" value={focalY} onChange={(event) => setFocalY(Number(event.target.value))} />
            </label>
            <label className="cr-range-field">
              <span><ZoomIn /> Yakınlaştırma <strong>{zoom.toFixed(2)}×</strong></span>
              <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            </label>

            <div className="cr-cropper__rotation-actions">
              <button className="cr-button cr-button--secondary" type="button" onClick={rotate} disabled={uploading}><RotateCw /> 90° döndür</button>
              <button className="cr-button cr-button--secondary" type="button" onClick={reset} disabled={uploading}><RotateCcw /> Kadrajı sıfırla</button>
            </div>

            <div className="cr-cropper__help">
              <strong>Kadraj ipucu</strong>
              <p>Yüzük ve küçük ürünlerde odak noktasını ürünün merkezine getir. Kolye zincirinin üst kısmı kesiliyorsa dikey odağı yukarı taşı.</p>
            </div>
          </div>
        </div>

        <footer className="cr-cropper__footer">
          <button className="cr-button cr-button--secondary" type="button" onClick={onClose} disabled={uploading}>Kuyruğu iptal et</button>
          <button className="cr-button cr-button--primary" type="button" onClick={() => void upload()} disabled={uploading}>
            {uploading ? <span className="cr-spinner cr-spinner--small" /> : <Upload />}
            {uploading ? "3:4 hazırlanıyor" : queueTotal > 1 ? "Yükle ve sonrakine geç" : "3:4 olarak yükle"}
          </button>
        </footer>
      </section>
    </div>
  );
}
