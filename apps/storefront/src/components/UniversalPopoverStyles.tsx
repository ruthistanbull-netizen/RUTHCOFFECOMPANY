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
          background: var(--ruth-color-overlay) !important;
          -webkit-backdrop-filter: blur(6px) !important;
          backdrop-filter: blur(6px) !important;
        }

        .ruth-universal-popover,
        .product-variant-sheet,
        [data-ruth-overlay-surface="dialog"],
        [data-ruth-overlay-surface="drawer"],
        [data-ruth-overlay-surface="popover"] {
          border: 1px solid var(--ruth-color-border-subtle) !important;
          background: var(--ruth-color-surface-elevated) !important;
          color: var(--ruth-color-text-primary) !important;
          box-shadow: 0 26px 80px color-mix(in srgb, var(--rosta-carbon) 58%, transparent) !important;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
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
          box-shadow: 0 18px 46px color-mix(in srgb, var(--rosta-carbon) 50%, transparent) !important;
        }

        [data-ruth-overlay-surface="drawer"] {
          overflow: hidden !important;
          border-radius: 28px !important;
        }

        .ruth-universal-popover h2,
        .product-variant-sheet h2,
        [data-ruth-overlay-surface] h2 {
          color: var(--ruth-color-text-primary) !important;
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
          border: 1px solid var(--ruth-color-border-subtle) !important;
          border-radius: 18px !important;
          background: var(--ruth-color-surface-elevated) !important;
          padding: 8px !important;
          color: var(--ruth-color-text-primary) !important;
          box-shadow: 0 18px 46px color-mix(in srgb, var(--rosta-carbon) 50%, transparent) !important;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
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
          color: var(--ruth-color-text-muted) !important;
          font-family: var(--font-body) !important;
          font-size: 11px !important;
          font-weight: 500 !important;
          line-height: 1.3 !important;
          letter-spacing: 0.16em !important;
          text-align: left !important;
          text-transform: uppercase !important;
          transition: background-color 160ms ease, color 160ms ease, transform 160ms cubic-bezier(.22,1,.36,1) !important;
        }

        div:has(> button[aria-label="Hesap menüsü"]) > div.absolute a:focus-visible,
        div:has(> button[aria-label="Hesap menüsü"]) > div.absolute > button:focus-visible,
        [data-ruth-overlay-item="true"]:focus-visible {
          background: var(--ruth-color-accent-soft) !important;
          color: var(--ruth-color-text-primary) !important;
          outline: 2px solid var(--ruth-color-focus) !important;
          outline-offset: 2px !important;
        }

        @media (hover: hover) and (pointer: fine) {
          div:has(> button[aria-label="Hesap menüsü"]) > div.absolute a:hover,
          div:has(> button[aria-label="Hesap menüsü"]) > div.absolute > button:hover,
          [data-ruth-overlay-item="true"]:hover {
            background: var(--ruth-color-accent-soft) !important;
            color: var(--ruth-color-text-primary) !important;
          }

          div:has(> button[aria-label="Hesap menüsü"]) > div.absolute a:hover,
          div:has(> button[aria-label="Hesap menüsü"]) > div.absolute > button:hover {
            transform: translateX(2px);
          }
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
          border-color: var(--ruth-color-border-subtle) !important;
          border-radius: 12px !important;
          background: var(--ruth-color-surface-muted) !important;
          color: var(--ruth-color-text-primary) !important;
        }

        .product-variant-sheet input::placeholder,
        .ruth-universal-popover input::placeholder,
        [data-ruth-overlay-surface] input::placeholder,
        [data-ruth-overlay-surface] textarea::placeholder {
          color: var(--ruth-color-text-muted) !important;
        }

        .product-variant-sheet [aria-label="Kapat"],
        [data-ruth-overlay-surface] [aria-label*="kapat" i] {
          border-color: var(--ruth-color-border-subtle) !important;
          border-radius: 50% !important;
          background: var(--ruth-color-surface-muted) !important;
          color: var(--ruth-color-text-primary) !important;
          box-shadow: 0 8px 22px color-mix(in srgb, var(--rosta-carbon) 38%, transparent) !important;
        }

        [data-ruth-overlay-item="true"] {
          display: flex !important;
          min-height: 42px !important;
          align-items: center !important;
          border-radius: 12px !important;
          padding: 11px 14px !important;
          color: var(--ruth-color-text-muted) !important;
          font-size: 11px !important;
          font-weight: 500 !important;
          letter-spacing: 0.16em !important;
          text-transform: uppercase !important;
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

        @media (forced-colors: active) {
          div:has(> button[aria-label="Hesap menüsü"]) > div.absolute a:focus-visible,
          div:has(> button[aria-label="Hesap menüsü"]) > div.absolute > button:focus-visible,
          [data-ruth-overlay-item="true"]:focus-visible {
            outline-color: Highlight !important;
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
