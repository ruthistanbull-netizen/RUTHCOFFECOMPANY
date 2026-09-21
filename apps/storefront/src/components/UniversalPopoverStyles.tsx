"use client";

import { OverlayStandardizer } from "@ruth-commerce/ui";

export function UniversalPopoverStyles() {
  return (
    <>
      <OverlayStandardizer />
      <style>{`
        .ruth-universal-overlay,
        .product-variant-overlay,
        [data-ruth-overlay-backdrop="true"] {
          background: rgba(35, 27, 20, 0.34) !important;
          -webkit-backdrop-filter: blur(6px) !important;
          backdrop-filter: blur(6px) !important;
        }

        .ruth-universal-popover,
        .product-variant-sheet,
        [data-ruth-overlay-surface="dialog"],
        [data-ruth-overlay-surface="drawer"],
        [data-ruth-overlay-surface="popover"] {
          border: 1px solid rgba(184, 151, 106, 0.24) !important;
          background: linear-gradient(180deg, rgba(255, 250, 242, 0.985), rgba(250, 247, 242, 0.985)) !important;
          color: var(--ink) !important;
          box-shadow: 0 26px 80px rgba(35, 27, 20, 0.2) !important;
          -webkit-backdrop-filter: blur(20px) !important;
          backdrop-filter: blur(20px) !important;
          font-family: var(--font-body) !important;
        }

        .ruth-universal-popover,
        [data-ruth-overlay-surface="dialog"] {
          border-radius: 28px !important;
        }

        [data-ruth-overlay-surface="popover"] {
          min-width: 190px !important;
          overflow: hidden !important;
          border-radius: 18px !important;
          padding: 8px !important;
          box-shadow: 0 18px 46px rgba(35, 27, 20, 0.16) !important;
        }

        [data-ruth-overlay-surface="drawer"] {
          overflow: hidden !important;
          border-radius: 28px !important;
        }

        .ruth-universal-popover h2,
        .product-variant-sheet h2,
        [data-ruth-overlay-surface] h2 {
          font-family: var(--font-heading) !important;
          font-weight: 400 !important;
        }

        .ruth-universal-popover button,
        .product-variant-sheet button,
        [data-ruth-overlay-surface] button {
          font-family: var(--font-body) !important;
        }

        div:has(> button[aria-label="Hesap menüsü"]) > div.absolute {
          position: absolute !important;
          top: 100% !important;
          right: 0 !important;
          left: auto !important;
          z-index: 130 !important;
          width: 12rem !important;
          margin: 12px 0 0 !important;
          overflow: hidden !important;
          border: 1px solid rgba(184, 151, 106, 0.24) !important;
          border-radius: 18px !important;
          background: rgba(250, 247, 242, 0.97) !important;
          padding: 8px !important;
          color: var(--ink) !important;
          box-shadow: 0 18px 46px rgba(35, 27, 20, 0.16) !important;
          -webkit-backdrop-filter: blur(18px) !important;
          backdrop-filter: blur(18px) !important;
          transform-origin: top right !important;
        }

        div:has(> button[aria-label="Hesap menüsü"]) > div.absolute a,
        div:has(> button[aria-label="Hesap menüsü"]) > div.absolute > button {
          display: flex !important;
          width: 100% !important;
          min-height: 42px !important;
          align-items: center !important;
          border: 0 !important;
          border-radius: 12px !important;
          background: transparent !important;
          padding: 11px 14px !important;
          color: var(--muted-foreground) !important;
          font-family: var(--font-body) !important;
          font-size: 11px !important;
          font-weight: 500 !important;
          line-height: 1.3 !important;
          letter-spacing: 0.16em !important;
          text-align: left !important;
          text-transform: uppercase !important;
          transition: background-color 160ms ease, color 160ms ease, transform 160ms cubic-bezier(.22,1,.36,1) !important;
        }

        div:has(> button[aria-label="Hesap menüsü"]) > div.absolute a:hover,
        div:has(> button[aria-label="Hesap menüsü"]) > div.absolute a:focus-visible,
        div:has(> button[aria-label="Hesap menüsü"]) > div.absolute > button:hover,
        div:has(> button[aria-label="Hesap menüsü"]) > div.absolute > button:focus-visible {
          background: var(--ivory) !important;
          color: var(--ink) !important;
          outline: none !important;
          transform: translateX(2px);
        }

        .product-variant-sheet {
          overflow: hidden auto !important;
          border-radius: 28px !important;
        }

        .product-variant-sheet input,
        .product-variant-sheet select,
        .ruth-universal-popover input,
        .ruth-universal-popover select,
        [data-ruth-overlay-surface] input,
        [data-ruth-overlay-surface] select,
        [data-ruth-overlay-surface] textarea {
          border-color: rgba(184, 151, 106, 0.24) !important;
          border-radius: 12px !important;
          background: rgba(255, 255, 255, 0.76) !important;
        }

        .product-variant-sheet [aria-label="Kapat"],
        [data-ruth-overlay-surface] [aria-label*="kapat" i] {
          border-color: rgba(184, 151, 106, 0.24) !important;
          border-radius: 50% !important;
          background: rgba(250, 247, 242, 0.86) !important;
          box-shadow: 0 8px 22px rgba(35, 27, 20, 0.08) !important;
        }

        [data-ruth-overlay-item="true"] {
          display: flex !important;
          min-height: 42px !important;
          align-items: center !important;
          border-radius: 12px !important;
          padding: 11px 14px !important;
          color: var(--muted-foreground) !important;
          font-size: 11px !important;
          font-weight: 500 !important;
          letter-spacing: 0.16em !important;
          text-transform: uppercase !important;
        }

        [data-ruth-overlay-item="true"]:hover,
        [data-ruth-overlay-item="true"]:focus-visible {
          background: var(--ivory) !important;
          color: var(--ink) !important;
          outline: none !important;
        }

        @media (min-width: 768px) {
          [data-ruth-overlay-surface="drawer"] {
            top: 12px !important;
            right: 12px !important;
            bottom: 12px !important;
            max-height: calc(100dvh - 24px) !important;
          }

          .product-variant-sheet {
            height: calc(100dvh - 24px) !important;
            max-width: 430px !important;
            margin: 12px 12px 12px 0 !important;
          }
        }

        @media (max-width: 767px) {
          .ruth-universal-popover,
          [data-ruth-overlay-surface="dialog"],
          [data-ruth-overlay-surface="drawer"] {
            width: calc(100vw - 16px) !important;
            max-height: calc(100dvh - 16px) !important;
            margin: 8px !important;
            border-radius: 23px !important;
          }

          div:has(> button[aria-label="Hesap menüsü"]) > div.absolute {
            top: 100% !important;
            right: -4px !important;
            width: min(12rem, calc(100vw - 24px)) !important;
            margin-top: 10px !important;
            padding: 8px !important;
            border-radius: 17px !important;
          }

          div:has(> button[aria-label="Hesap menüsü"]) > div.absolute a,
          div:has(> button[aria-label="Hesap menüsü"]) > div.absolute > button {
            min-height: 44px !important;
            font-size: 10.5px !important;
          }

          .product-variant-sheet {
            width: calc(100vw - 16px) !important;
            max-height: calc(100dvh - 16px) !important;
            margin: 0 8px 8px !important;
            border-radius: 23px !important;
            padding-bottom: calc(24px + env(safe-area-inset-bottom)) !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ruth-universal-popover,
          .product-variant-sheet,
          [data-ruth-overlay-surface] {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}
