"use client";

import { useEffect, useState } from "react";
import { StoreDesignEditableMedia } from "./StoreDesignEditableMedia";

export const STORE_DESIGN_MEDIA_RUNTIME_EVENT = "store-design-v2:media-asset-ready";

export type StoreDesignMediaRuntimeDetail = {
  assetId: string;
  url?: string;
  version?: number;
  focalPoint?: { x: number; y: number };
  mobileAssetId?: string;
  mobileUrl?: string;
  mobileFocalPoint?: { x: number; y: number };
};

type Props = {
  editorId: string;
  assetId?: string;
  src: string;
  mobileAssetId?: string;
  mobileSrc?: string;
  objectPosition?: string;
  mobileObjectPosition?: string;
  alt: string;
  className?: string;
};

function position(value?: { x: number; y: number }, fallback = "50% 50%") {
  if (!value) return fallback;
  const x = Math.min(100, Math.max(0, Number(value.x || 0)));
  const y = Math.min(100, Math.max(0, Number(value.y || 0)));
  return `${x}% ${y}%`;
}

function versioned(url: string | undefined, version?: number) {
  if (!url) return "";
  if (!version) return url;
  const clean = url.replace(/([?&])v=\d+(&|$)/, (_match, prefix, suffix) => suffix ? prefix : "");
  return `${clean}${clean.includes("?") ? "&" : "?"}v=${Math.max(1, Number(version))}`;
}

export function StoreDesignResponsiveImage({
  editorId,
  assetId,
  src,
  mobileAssetId,
  mobileSrc,
  objectPosition = "50% 50%",
  mobileObjectPosition,
  alt,
  className = "",
}: Props) {
  const [desktop, setDesktop] = useState({ assetId, src, objectPosition });
  const [mobile, setMobile] = useState({
    assetId: mobileAssetId,
    src: mobileSrc || src,
    objectPosition: mobileObjectPosition || objectPosition,
  });

  useEffect(() => {
    setDesktop({ assetId, src, objectPosition });
    setMobile({
      assetId: mobileAssetId,
      src: mobileSrc || src,
      objectPosition: mobileObjectPosition || objectPosition,
    });
  }, [assetId, mobileAssetId, mobileObjectPosition, mobileSrc, objectPosition, src]);

  useEffect(() => {
    const onMedia = (event: Event) => {
      const detail = (event as CustomEvent<StoreDesignMediaRuntimeDetail>).detail;
      if (!detail?.assetId) return;

      if (assetId && detail.assetId === assetId) {
        const nextDesktopSrc = versioned(detail.url, detail.version) || desktop.src;
        const nextDesktopPosition = position(detail.focalPoint, desktop.objectPosition);
        setDesktop({ assetId, src: nextDesktopSrc, objectPosition: nextDesktopPosition });

        const nextMobileId = detail.mobileAssetId;
        setMobile((current) => ({
          assetId: nextMobileId,
          src: detail.mobileUrl || (nextMobileId ? current.src : nextDesktopSrc),
          objectPosition: position(detail.mobileFocalPoint, nextDesktopPosition),
        }));
        return;
      }

      if (mobile.assetId && detail.assetId === mobile.assetId) {
        setMobile((current) => ({
          ...current,
          src: versioned(detail.url, detail.version) || current.src,
          objectPosition: position(detail.focalPoint, current.objectPosition),
        }));
      }
    };

    window.addEventListener(STORE_DESIGN_MEDIA_RUNTIME_EVENT, onMedia as EventListener);
    return () => window.removeEventListener(STORE_DESIGN_MEDIA_RUNTIME_EVENT, onMedia as EventListener);
  }, [assetId, desktop.objectPosition, desktop.src, mobile.assetId]);

  const mobileResolved = mobile.src || desktop.src;

  return (
    <div className="absolute inset-0 block h-full w-full">
      <StoreDesignEditableMedia editorId={`${editorId}.mobile`} aliases={[editorId, editorId.replace(/\.media$/, "")]} src={mobileResolved} alt={alt} className={`h-full w-full object-cover md:hidden ${className}`} style={{ objectPosition: mobile.objectPosition }} />
      <StoreDesignEditableMedia editorId={`${editorId}.desktop`} aliases={[editorId]} src={desktop.src} alt={alt} className={`hidden h-full w-full object-cover md:block ${className}`} style={{ objectPosition: desktop.objectPosition }} />
    </div>
  );
}
