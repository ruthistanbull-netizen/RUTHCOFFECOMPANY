"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function HomeHeroRuntimeAdjustments() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;

    const root = document.documentElement;
    root.classList.add("ruth-home-page-active");

    return () => {
      root.classList.remove("ruth-home-page-active");
    };
  }, [pathname]);

  return (
    <style>{`
      body,
      .site-app-shell,
      main.site-content,
      main.site-content > [data-theme-section-id]:first-child,
      #home-editorial,
      #home-editorial .home-editorial-slide:first-child,
      #home-editorial .home-editorial-slide:first-child > .sticky {
        padding-top: 0 !important;
        border-top: 0 !important;
      }

      main.site-content {
        margin-top: 0 !important;
      }

      html.ruth-home-page-active .ruth-zara-header.is-contrast {
        background: transparent !important;
        border-color: transparent !important;
        box-shadow: none !important;
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
      }

      #home-editorial,
      #home-editorial .home-editorial-slide:first-child,
      #home-editorial .home-editorial-slide:first-child > .sticky {
        margin-top: 0 !important;
      }

      @media (min-width: 1024px) {
        html.ruth-home-page-active .home-editorial-wordmark {
          top: 38vh !important;
          right: 1vw !important;
          left: auto !important;
          width: 44.8vw !important;
          max-width: 44.8vw !important;
          height: auto !important;
        }

        html.ruth-home-page-active .ruth-zara-menu-button .ruth-zara-hamburger {
          width: 48px !important;
          height: 18px !important;
        }
      }

      @media (max-width: 767px) {
        html.ruth-home-page-active,
        html.ruth-home-page-active body,
        html.ruth-home-page-active .site-app-shell,
        html.ruth-home-page-active main,
        html.ruth-home-page-active #home-editorial,
        html.ruth-home-page-active #home-editorial .home-editorial-slide:first-child > .sticky {
          background-color: var(--ruth-home-header-surface, var(--ruth-home-media-top, var(--ivory))) !important;
        }

        html.ruth-home-page-active
          #home-editorial
          .home-editorial-slide:first-child
          > .sticky
          > div {
          inset: 0 !important;
          top: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          left: 0 !important;
        }

        html.ruth-home-page-active .home-editorial-wordmark {
          top: auto !important;
          right: auto !important;
          bottom: max(58px, calc(env(safe-area-inset-bottom) + 40px)) !important;
          left: 3vw !important;
          width: 94vw !important;
          max-width: 94vw !important;
          height: clamp(168px, 42vw, 230px) !important;
        }

        html.ruth-home-page-active .ruth-zara-header,
        html.ruth-home-page-active .ruth-zara-header.is-scrolled,
        html.ruth-home-page-active .ruth-zara-header.is-contrast,
        html.ruth-home-page-active .ruth-zara-header .ruth-zara-header-inner {
          background: transparent !important;
          border: 0 !important;
          border-color: transparent !important;
          outline: 0 !important;
          box-shadow: none !important;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }

        html.ruth-home-page-active .ruth-zara-header::before,
        html.ruth-home-page-active .ruth-zara-header::after,
        html.ruth-home-page-active .ruth-zara-header .ruth-zara-header-inner::before,
        html.ruth-home-page-active .ruth-zara-header .ruth-zara-header-inner::after {
          content: none !important;
          display: none !important;
          border: 0 !important;
          box-shadow: none !important;
        }

        html.ruth-home-page-active #home-editorial,
        html.ruth-home-page-active #home-editorial .home-editorial-slide:first-child,
        html.ruth-home-page-active #home-editorial .home-editorial-slide:first-child > .sticky {
          border-top: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }

        html.ruth-home-page-active .ruth-zara-header .ruth-zara-header-inner {
          color: var(--ruth-home-header-ink, var(--rosta-cream)) !important;
          mix-blend-mode: normal !important;
        }

        html.ruth-home-page-active .ruth-zara-header .header-wordmark {
          filter: brightness(0) invert(var(--ruth-home-header-invert, 0)) !important;
        }

        html.ruth-home-page-active:has(.ruth-zara-header[data-menu-open="false"])
          .ruth-zara-menu-button {
          color: var(--ruth-home-header-ink, var(--rosta-cream)) !important;
          mix-blend-mode: normal !important;
        }
      }
    `}</style>
  );
}
