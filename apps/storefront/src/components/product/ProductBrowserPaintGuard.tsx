"use client";

import { useEffect } from "react";

const MAX_HANDOFF_MS = 1800;

function productSlugFromUrl(url: string | URL | null | undefined) {
  if (!url) return null;
  try {
    const pathname = new URL(String(url), window.location.href).pathname;
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] !== "products" || !parts[1]) return null;
    return decodeURIComponent(parts[1]);
  } catch {
    return null;
  }
}

export function ProductBrowserPaintGuard() {
  useEffect(() => {
    let root = document.querySelector<HTMLElement>(".product-browser-root");
    let pendingSlug: string | null = null;
    let timeoutHandle: number | null = null;
    let releaseFrameOne: number | null = null;
    let releaseFrameTwo: number | null = null;
    const readySlugs = new Set<string>();

    const clearReleaseFrames = () => {
      if (releaseFrameOne !== null) window.cancelAnimationFrame(releaseFrameOne);
      if (releaseFrameTwo !== null) window.cancelAnimationFrame(releaseFrameTwo);
      releaseFrameOne = null;
      releaseFrameTwo = null;
    };

    const findRoot = () => {
      if (!root?.isConnected) {
        root = document.querySelector<HTMLElement>(".product-browser-root");
      }
      return root;
    };

    const hold = () => {
      const currentRoot = findRoot();
      if (!currentRoot || !pendingSlug) return;
      currentRoot.dataset.browserPhase = "handoff";
    };

    const release = (slug: string) => {
      if (!pendingSlug || slug !== pendingSlug) return;
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
      timeoutHandle = null;
      clearReleaseFrames();
      const completedSlug = pendingSlug;
      pendingSlug = null;
      releaseFrameOne = window.requestAnimationFrame(() => {
        releaseFrameOne = null;
        releaseFrameTwo = window.requestAnimationFrame(() => {
          releaseFrameTwo = null;
          const currentRoot = findRoot();
          if (currentRoot && completedSlug === slug) {
            currentRoot.dataset.browserPhase = "idle";
          }
        });
      });
    };

    const begin = (slug: string | null) => {
      if (!slug) return;
      pendingSlug = slug;
      clearReleaseFrames();
      hold();
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);

      if (readySlugs.has(slug)) {
        release(slug);
        return;
      }

      timeoutHandle = window.setTimeout(() => release(slug), MAX_HANDOFF_MS);
    };

    const onPrimaryImageReady = (event: Event) => {
      const detail = (
        event as CustomEvent<{ productSlug?: string }>
      ).detail;
      const slug = detail?.productSlug;
      if (!slug) return;
      readySlugs.delete(slug);
      readySlugs.add(slug);
      while (readySlugs.size > 6) {
        const oldest = readySlugs.values().next().value as string | undefined;
        if (!oldest) break;
        readySlugs.delete(oldest);
      }
      release(slug);
    };

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = function pushState(data, unused, url) {
      const slug = productSlugFromUrl(url);
      const result = originalPushState(data, unused, url);
      begin(slug);
      return result;
    };

    window.history.replaceState = function replaceState(data, unused, url) {
      const slug = productSlugFromUrl(url);
      const result = originalReplaceState(data, unused, url);
      begin(slug);
      return result;
    };

    const observer = new MutationObserver(() => {
      if (!pendingSlug) return;
      const currentRoot = findRoot();
      if (currentRoot?.dataset.browserPhase === "idle") hold();
    });

    if (root) {
      observer.observe(root, {
        attributes: true,
        attributeFilter: ["data-browser-phase"],
      });
    }

    window.addEventListener(
      "ruth:product-primary-image-ready",
      onPrimaryImageReady,
    );

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener(
        "ruth:product-primary-image-ready",
        onPrimaryImageReady,
      );
      observer.disconnect();
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
      clearReleaseFrames();
    };
  }, []);

  return (
    <style>{`
      @media (max-width: 767px) {
        html.ruth-product-page-active .product-gallery-frame:not(.is-lightbox) {
          touch-action: pan-y pinch-zoom !important;
          overscroll-behavior-y: auto !important;
        }
      }
    `}</style>
  );
}
