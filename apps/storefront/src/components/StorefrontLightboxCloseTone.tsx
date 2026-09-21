"use client";

import { useEffect } from "react";

export function StorefrontLightboxCloseTone() {
  useEffect(() => {
    /*
     * The lightbox viewport owns drag/pinch gestures. Its bubbling pointer/touch
     * handlers must never see presses that start on the +/- control itself:
     * desktop pointer capture was stealing the button click, while the mobile
     * touch handler called preventDefault() and suppressed the synthesized tap.
     * Stop only those gesture events here; the real React button onClick is
     * left untouched and remains the single zoom controller.
     */
    const shieldZoomControls = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".ruth-product-lightbox__zoom-controls")) return;
      event.stopPropagation();
    };

    const pointerEvents = [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "touchstart",
      "touchmove",
      "touchend",
      "touchcancel",
      "dblclick",
    ] as const;

    pointerEvents.forEach((type) => {
      document.addEventListener(type, shieldZoomControls, true);
    });

    return () => {
      pointerEvents.forEach((type) => {
        document.removeEventListener(type, shieldZoomControls, true);
      });
    };
  }, []);

  return (
    <style>{`
      /* Use the exact same contrast token as the product-page header:
         light image/background -> black X, dark image/background -> white X. */
      html.ruth-product-page-active .ruth-product-lightbox__close {
        color: var(--ruth-product-header-ink, #111111) !important;
        border-color: color-mix(
          in srgb,
          var(--ruth-product-header-ink, #111111) 28%,
          transparent
        ) !important;
        background: color-mix(
          in srgb,
          var(--ruth-product-header-ink, #111111) 9%,
          transparent
        ) !important;
        box-shadow: 0 8px 28px color-mix(
          in srgb,
          var(--ruth-product-header-ink, #111111) 10%,
          transparent
        ) !important;
        transition:
          color 220ms ease,
          border-color 220ms ease,
          background-color 220ms ease,
          box-shadow 220ms ease,
          transform 280ms cubic-bezier(.22, 1, .36, 1) !important;
      }

      html.ruth-product-page-active .ruth-product-lightbox__close svg {
        color: currentColor !important;
        stroke: currentColor !important;
      }

      @media (hover: hover) {
        html.ruth-product-page-active .ruth-product-lightbox__close:hover {
          background: color-mix(
            in srgb,
            var(--ruth-product-header-ink, #111111) 15%,
            transparent
          ) !important;
        }
      }

      /* ProductGallery owns the zoom transform itself. Do not replace or mirror
         its inline scale: 1.2 / 1.4 / 1.6 / 1.8 / 2 values. */
      html.ruth-product-page-active .ruth-product-lightbox__zoom-stage {
        transform-origin: center center !important;
      }

      /* Desktop lightbox reveals the product page behind it through blur;
         there is deliberately no black overlay. */
      @media (min-width: 768px) {
        html.ruth-product-page-active .ruth-product-lightbox {
          background: rgba(246, 240, 231, .06) !important;
          -webkit-backdrop-filter: blur(30px) saturate(.9) brightness(.98) !important;
          backdrop-filter: blur(30px) saturate(.9) brightness(.98) !important;
        }

        html.ruth-product-page-active .ruth-product-lightbox__surface,
        html.ruth-product-page-active .ruth-product-lightbox__viewport {
          background: transparent !important;
        }
      }
    `}</style>
  );
}
