"use client";

import { useEffect } from "react";
import { ThemeEditorDevicePreview } from "./ThemeEditorDevicePreview";
import { VisualThemeCustomizer } from "./VisualThemeCustomizer";

const CONFIGURED_STOREFRONT = process.env.NEXT_PUBLIC_STOREFRONT_URL || "https://rostacoffecompany.zeabur.app";
const STOREFRONT_ORIGIN = (() => {
  try { return new URL(CONFIGURED_STOREFRONT).origin; }
  catch { return "https://rostacoffecompany.zeabur.app"; }
})();

function canonicalPreviewUrl(frame: HTMLIFrameElement) {
  let current: URL;
  try {
    current = new URL(frame.src || STOREFRONT_ORIGIN);
  } catch {
    current = new URL(STOREFRONT_ORIGIN);
  }

  const next = new URL(`${current.pathname || "/"}${current.search || ""}`, STOREFRONT_ORIGIN);
  next.searchParams.set("themeEditor", "1");
  if (!next.searchParams.has("themePreview")) next.searchParams.set("themePreview", String(Date.now()));
  return next.toString();
}

export function ThemePreviewViewport() {
  useEffect(() => {
    let stopped = false;
    let frameObserver: MutationObserver | null = null;
    let currentFrame: HTMLIFrameElement | null = null;

    const syncPreviewOrigin = () => {
      if (stopped) return;
      const root = document.querySelector("[data-theme-customizer-v4]") as HTMLElement | null;
      const frame = root?.querySelector("iframe") as HTMLIFrameElement | null;
      if (!frame) return;

      if (frame !== currentFrame) {
        frameObserver?.disconnect();
        currentFrame = frame;
        frameObserver = new MutationObserver(syncPreviewOrigin);
        frameObserver.observe(frame, { attributes: true, attributeFilter: ["src"] });
      }

      let origin = "";
      try { origin = new URL(frame.src).origin; }
      catch { origin = ""; }

      if (origin !== STOREFRONT_ORIGIN) {
        const next = canonicalPreviewUrl(frame);
        if (frame.src !== next) frame.src = next;
      }
    };

    const rootObserver = new MutationObserver(syncPreviewOrigin);
    rootObserver.observe(document.body, { childList: true, subtree: true });
    syncPreviewOrigin();

    return () => {
      stopped = true;
      rootObserver.disconnect();
      frameObserver?.disconnect();
    };
  }, []);

  return (
    <>
      <VisualThemeCustomizer />
      <ThemeEditorDevicePreview />
    </>
  );
}
