"use client";

import { useLayoutEffect } from "react";

const FIRST_VISIT_KEY = "rosta_product_swipe_hint_first_visit_v1_seen";
const LEGACY_NEXT_KEY = "rosta_product_swipe_next_hint_v1_seen";
const LEGACY_BACK_KEY = "rosta_product_swipe_back_hint_v1_seen";
const LEGACY_ORIGINAL_KEY = "rosta_product_swipe_hint_seen_v1";
const GUIDE_VISIBLE_MS = 5_000;

function isProductPage() {
  return /^\/products\/[^/?#]+/.test(window.location.pathname);
}

function readSeen() {
  try {
    return (
      window.localStorage.getItem(FIRST_VISIT_KEY) === "1" ||
      window.localStorage.getItem(LEGACY_NEXT_KEY) === "1" ||
      window.localStorage.getItem(LEGACY_ORIGINAL_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function persistSeen() {
  try {
    window.localStorage.setItem(FIRST_VISIT_KEY, "1");
    // ProductSwipeExperiencePolish still understands these keys. Mark both so
    // changing products or swiping back can never create a second guide.
    window.localStorage.setItem(LEGACY_NEXT_KEY, "1");
    window.localStorage.setItem(LEGACY_BACK_KEY, "1");
  } catch {
    // Storage can be unavailable in strict privacy contexts.
  }
}

function guides() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(".ruth-product-swipe-guide"),
  );
}

export function ProductSwipeFirstVisitGuard() {
  useLayoutEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;

    const body = document.body;
    let hasSeen = readSeen();
    let firstGuide: HTMLElement | null = null;
    let hideTimer: number | null = null;
    let frame = 0;

    const clearHideTimer = () => {
      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    };

    const blockFutureGuides = () => {
      body.dataset.ruthSwipeGuideBlocked = "true";
      guides().forEach((guide) => guide.remove());
    };

    const allowFirstGuide = () => {
      delete body.dataset.ruthSwipeGuideBlocked;
    };

    const sync = () => {
      frame = 0;

      if (!isProductPage()) {
        clearHideTimer();
        firstGuide = null;
        allowFirstGuide();
        guides().forEach((guide) => guide.remove());
        return;
      }

      if (hasSeen && !firstGuide) {
        persistSeen();
        blockFutureGuides();
        return;
      }

      const liveGuides = guides();
      if (!hasSeen) {
        const guide = liveGuides[0];
        if (!guide) {
          allowFirstGuide();
          return;
        }

        // The guide has now genuinely been shown on the shopper's first
        // product-page visit. Persist immediately so a refresh cannot show it
        // a second time, while leaving the current guide visible for 5 seconds.
        hasSeen = true;
        firstGuide = guide;
        persistSeen();
        clearHideTimer();
        hideTimer = window.setTimeout(() => {
          firstGuide?.remove();
          firstGuide = null;
          blockFutureGuides();
        }, GUIDE_VISIBLE_MS);
        return;
      }

      if (firstGuide && !firstGuide.isConnected) {
        clearHideTimer();
        firstGuide = null;
        blockFutureGuides();
        return;
      }

      // A race must never create a second arrow/text guide after the first one.
      liveGuides.forEach((guide) => {
        if (guide !== firstGuide) guide.remove();
      });
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", schedule);
    window.addEventListener("pageshow", schedule);
    window.addEventListener("rosta:product-history-change", schedule);
    schedule();

    return () => {
      observer.disconnect();
      clearHideTimer();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("popstate", schedule);
      window.removeEventListener("pageshow", schedule);
      window.removeEventListener("rosta:product-history-change", schedule);
      delete body.dataset.ruthSwipeGuideBlocked;
    };
  }, []);

  return (
    <style>{`
      body[data-ruth-swipe-guide-blocked="true"] .ruth-product-swipe-guide {
        display: none !important;
      }
    `}</style>
  );
}
