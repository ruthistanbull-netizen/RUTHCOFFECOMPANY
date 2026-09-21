"use client";

import { useEffect } from "react";

function unlockHorizontalProductSwipe() {
  document
    .querySelectorAll<HTMLElement>(
      ".product-gallery-frame.is-mobile-vertical:not(.is-lightbox)[data-product-browser-ignore]",
    )
    .forEach((frame) => frame.removeAttribute("data-product-browser-ignore"));
}

export function ProductPageRecovery() {
  useEffect(() => {
    unlockHorizontalProductSwipe();

    const observer = new MutationObserver(unlockHorizontalProductSwipe);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-product-browser-ignore"],
    });

    window.addEventListener("pageshow", unlockHorizontalProductSwipe);
    window.addEventListener(
      "ruth:product-primary-image-ready",
      unlockHorizontalProductSwipe,
    );

    return () => {
      observer.disconnect();
      window.removeEventListener("pageshow", unlockHorizontalProductSwipe);
      window.removeEventListener(
        "ruth:product-primary-image-ready",
        unlockHorizontalProductSwipe,
      );
    };
  }, []);

  return (
    <style>{`
      /*
       * Product pages use the original contrast behavior while the header sits
       * on top of media. This does not depend on canvas/CORS image sampling, so
       * local and Supabase-hosted product photos behave identically.
       */
      html.ruth-product-page-active
        .ruth-zara-header.product-header-transparent[data-menu-open="false"],
      html.ruth-product-page-active
        .ruth-zara-header.product-header-transparent[data-menu-open="false"]
        .ruth-zara-header-inner {
        background: transparent !important;
        border-color: transparent !important;
        box-shadow: none !important;
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
      }

      html.ruth-product-page-active
        .ruth-zara-header.product-header-transparent[data-menu-open="false"]
        .ruth-zara-header-inner {
        color: #ffffff !important;
        mix-blend-mode: difference !important;
      }

      html.ruth-product-page-active
        .ruth-zara-header.product-header-transparent[data-menu-open="false"]
        .header-wordmark {
        filter: brightness(0) invert(1) !important;
      }

      html.ruth-product-page-active
        .ruth-zara-header.product-header-transparent[data-menu-open="false"]
        button,
      html.ruth-product-page-active
        .ruth-zara-header.product-header-transparent[data-menu-open="false"]
        a,
      html.ruth-product-page-active
        .ruth-zara-header.product-header-transparent[data-menu-open="false"]
        svg {
        color: inherit !important;
        stroke: currentColor !important;
      }

      html.ruth-product-page-active
        .ruth-zara-header.product-header-transparent[data-menu-open="false"]
        .ruth-zara-menu-button:not(.ruth-zara-menu-button--menu-open) {
        color: #ffffff !important;
        mix-blend-mode: difference !important;
      }

      html.ruth-product-page-active
        .ruth-zara-header.product-header-transparent[data-menu-open="false"]
        .ruth-zara-menu-button:not(.ruth-zara-menu-button--menu-open)
        .ruth-zara-hamburger__line {
        background: currentColor !important;
      }

      @media (max-width: 767px) {
        html.ruth-product-page-active
          .ruth-zara-header.product-header-transparent[data-menu-open="false"] {
          background: transparent !important;
        }
      }
    `}</style>
  );
}
