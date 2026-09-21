"use client";

import * as React from "react";
import { FullscreenOverlay } from "./overlays";

type ProductMediaPreview = {
  src: string;
  alt: string;
  title: string;
};

export interface ProductMediaPreviewSystemProps {
  rootSelector?: string;
  closeLabel?: string;
}

function imageSource(image: HTMLImageElement) {
  return image.currentSrc || image.src || image.getAttribute("src") || "";
}

function imageTitle(image: HTMLImageElement) {
  const explicitOwner = image.closest<HTMLElement>("[data-ruth-product-title]");
  const explicit = image.dataset.ruthProductTitle || explicitOwner?.dataset.ruthProductTitle;
  if (explicit?.trim()) return explicit.trim();

  const alt = image.alt.trim();
  if (alt) return alt;

  const container = image.closest<HTMLElement>("article, figure, button, [role='button']");
  const labels = Array.from(
    container?.querySelectorAll<HTMLElement>("[data-ruth-product-name], h1, h2, h3, h4, strong") || [],
  )
    .map((element) => element.textContent?.trim() || "")
    .filter((label) => label && !/^(ana|set|3:4|r)$/i.test(label));

  return labels[0] || "Ürün görseli";
}

function hasNativePreview(image: HTMLImageElement) {
  const control = image.closest<HTMLElement>("button, [role='button']");
  if (!control) return false;
  if (control.dataset.ruthProductMediaPreview === "native") return true;

  const label = `${control.getAttribute("aria-label") || ""} ${control.getAttribute("title") || ""}`;
  if (/büyüt|önizle|preview|zoom|tam ekran/i.test(label)) return true;

  return String(control.className || "").toLocaleLowerCase("tr-TR").includes("image-button");
}

function isExcludedAsset(image: HTMLImageElement, src: string) {
  const descriptor = `${src} ${image.alt} ${image.getAttribute("class") || ""}`.toLocaleLowerCase("tr-TR");
  return /(^|[\/_\-.])(logo|avatar|icon|favicon|apple-touch|manifest|qrcode|qr-code|barcode)([\/_\-.]|$)/i.test(descriptor);
}

function isPreviewableProductImage(image: HTMLImageElement, rootSelector: string) {
  if (!image.closest(rootSelector)) return false;
  if (image.closest("[data-ruthie-immersive-root]")) return false;
  if (image.closest("nav, [role='navigation'], .ruth-fullscreen-overlay")) return false;
  if (image.closest("[data-ruth-product-media-preview='off']")) return false;
  if (hasNativePreview(image)) return false;

  const src = imageSource(image);
  if (!src || src.startsWith("data:image/svg")) return false;
  if (isExcludedAsset(image, src)) return false;

  const explicit = Boolean(image.closest("[data-ruth-product-media-preview='auto']"));
  const semanticContainer = image.closest("article, figure, button, [role='button']");
  if (!explicit && !semanticContainer) return false;

  const rect = image.getBoundingClientRect();
  if (!explicit && (rect.width < 36 || rect.height < 36)) return false;

  return true;
}

export function ProductMediaPreviewSystem({
  rootSelector = "body",
  closeLabel = "Ürün görselini kapat",
}: ProductMediaPreviewSystemProps) {
  const [preview, setPreview] = React.useState<ProductMediaPreview | null>(null);

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;

      const image = event.target.closest("img");
      if (!(image instanceof HTMLImageElement)) return;
      if (!isPreviewableProductImage(image, rootSelector)) return;

      const src = imageSource(image);
      if (!src) return;

      event.preventDefault();
      event.stopPropagation();

      setPreview({
        src,
        alt: image.alt.trim() || imageTitle(image),
        title: imageTitle(image),
      });
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [rootSelector]);

  return (
    <FullscreenOverlay
      open={Boolean(preview)}
      title={preview?.title || "Ürün görseli"}
      onClose={() => setPreview(null)}
      closeLabel={closeLabel}
      dismissalPolicy="light-dismiss"
      panelClassName="ruth-product-media-preview__panel"
    >
      {preview ? (
        <div className="ruth-product-media-preview__layout">
          <div className="ruth-product-media-preview__media">
            <img src={preview.src} alt={preview.alt} />
          </div>
          <div className="ruth-product-media-preview__copy">
            <span>Ürün görseli</span>
            <h2>{preview.title}</h2>
            <p>Görseli kapatmak için kapatma düğmesini, arka planı veya ESC tuşunu kullanabilirsin.</p>
          </div>
        </div>
      ) : null}
    </FullscreenOverlay>
  );
}
