"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { ruthMotion, ruthMotionEase } from "@ruth-commerce/ui/motion";

const PAGE_SURFACE_SELECTORS = [
  "[data-ruthie-immersive-root]",
  "[data-theme-editor-immersive-root]",
  "main",
] as const;

const PAGE_EASE = `cubic-bezier(${ruthMotionEase.join(", ")})`;

function visiblePageSurface() {
  for (const selector of PAGE_SURFACE_SELECTORS) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) continue;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") continue;
    return element;
  }
  return null;
}

export function AdminUnifiedMotionEnhancer() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const animationRef = useRef<Animation | null>(null);

  useEffect(() => {
    /* On phones, animating the complete <main> creates a full-screen GPU layer
       containing long product/order lists and decoded images. Mobile Safari can
       retain that layer long enough to stutter or exhaust memory. Keep the
       premium page motion on larger screens and let mobile navigation paint
       directly instead. */
    if (window.matchMedia("(max-width: 767px)").matches) {
      animationRef.current?.cancel();
      animationRef.current = null;
      const surface = visiblePageSurface();
      surface?.style.removeProperty("opacity");
      surface?.style.removeProperty("transform");
      return;
    }

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const surface = visiblePageSurface();
        if (!surface) return;

        animationRef.current?.cancel();
        animationRef.current = null;
        surface.dataset.adminPageMotion = "true";

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          surface.style.removeProperty("opacity");
          surface.style.removeProperty("transform");
          return;
        }

        const animation = surface.animate(
          [
            { opacity: 0.62, transform: `translate3d(0, ${ruthMotion.distance.subtle}px, 0)` },
            { opacity: 1, transform: "translate3d(0, 0, 0)" },
          ],
          {
            duration: ruthMotion.milliseconds.normal,
            easing: PAGE_EASE,
            fill: "both",
          },
        );
        animationRef.current = animation;

        void animation.finished
          .catch(() => undefined)
          .then(() => {
            if (animationRef.current !== animation) return;
            animation.cancel();
            animationRef.current = null;
          });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      animationRef.current?.cancel();
      animationRef.current = null;
    };
  }, [routeKey]);

  return null;
}
