"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Product } from "@/types/site";
import { resolveProductImage } from "@/lib/productImageOverrides";
import {
  productDisplayImageSrc,
  type ProductImageMode,
} from "@/lib/productDisplayImage";

type ProductImageProps = {
  product: Product;
  imageUrl: string | null | undefined;
  alt: string;
  mode?: ProductImageMode;
  hoverScale?: boolean;
  className?: string;
  priority?: boolean;
  eager?: boolean;
  fit?: "cover" | "contain";
};

function imageStyle(fit: "cover" | "contain" = "cover"): CSSProperties {
  return {
    objectFit: fit,
    objectPosition: "center center",
    transformOrigin: "center center",
  };
}

function isVideoMediaUrl(value: string | null | undefined) {
  const clean = String(value || "").split("?")[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v)$/.test(clean) || clean.includes("/videos/");
}

export default function ProductImage({
  product,
  imageUrl,
  alt,
  mode = "card",
  hoverScale = false,
  className = "",
  priority = false,
  eager = false,
  fit = "cover",
}: ProductImageProps) {
  const rawMediaUrl = String(imageUrl || "");
  const video = isVideoMediaUrl(rawMediaUrl);
  const effectiveImageUrl = video ? rawMediaUrl : resolveProductImage(product, imageUrl);
  const displaySrc = video ? rawMediaUrl : productDisplayImageSrc(product, imageUrl, mode);
  const [resolvedSrc, setResolvedSrc] = useState(displaySrc || "");
  const [hasFailed, setHasFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setResolvedSrc(displaySrc || "");
    setHasFailed(false);
  }, [displaySrc]);

  const announcePrimaryReady = useCallback(() => {
    if (!priority || mode !== "detail" || video) return;
    window.dispatchEvent(
      new CustomEvent("ruth:product-primary-image-ready", {
        detail: {
          productId: product.id,
          productSlug: product.slug,
          src: imageRef.current?.currentSrc || resolvedSrc,
        },
      }),
    );
  }, [mode, priority, product.id, product.slug, resolvedSrc, video]);

  useEffect(() => {
    if (video) return;
    const image = imageRef.current;
    if (!image || !image.complete || image.naturalWidth < 1) return;
    announcePrimaryReady();
  }, [announcePrimaryReady, resolvedSrc, video]);

  const handleError = () => {
    const originalSrc = effectiveImageUrl || "";

    if (!video && originalSrc && resolvedSrc && resolvedSrc !== originalSrc) {
      setResolvedSrc(originalSrc);
      return;
    }

    setHasFailed(true);
  };

  const loadEagerly = priority || eager;
  const mediaClassName = `h-full w-full ${hoverScale ? "ruth-motion-media ruth-product-image-hover-scale" : ""}`;
  const mediaFit: "cover" | "contain" = video && !className.includes("ruth-product-lightbox__zoom-image")
    ? "cover"
    : fit;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {resolvedSrc && !hasFailed ? (
        video ? (
          <video
            src={resolvedSrc}
            aria-label={alt}
            muted
            loop
            autoPlay
            playsInline
            preload={loadEagerly ? "auto" : "metadata"}
            draggable={false}
            onError={handleError}
            className={mediaClassName}
            style={imageStyle(mediaFit)}
          />
        ) : (
          <img
            ref={imageRef}
            src={resolvedSrc}
            alt={alt}
            loading={loadEagerly ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            draggable={false}
            onLoad={announcePrimaryReady}
            onError={handleError}
            className={mediaClassName}
            style={imageStyle(fit)}
          />
        )
      ) : (
        <div className="ruth-card-gradient flex h-full w-full items-center justify-center p-8 text-center">
          <span className="font-heading text-3xl text-cream/85">{product.name}</span>
        </div>
      )}
    </div>
  );
}
