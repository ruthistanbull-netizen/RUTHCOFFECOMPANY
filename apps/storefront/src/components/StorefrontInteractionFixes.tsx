export function StorefrontInteractionFixes() {
  return (
    <style>{`
      .site-app-shell .ruth-zara-menu-button {
        display: flex !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
        mix-blend-mode: normal !important;
        z-index: 130 !important;
      }

      .site-app-shell .ruth-zara-menu-button .ruth-zara-hamburger {
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        opacity: 1 !important;
        visibility: visible !important;
      }

      .site-app-shell .ruth-zara-menu-button .ruth-zara-hamburger__line {
        display: block !important;
        opacity: 1 !important;
        visibility: visible !important;
        background: currentColor !important;
      }

      html:not(.ruth-home-page-active):not(.ruth-product-page-active)
        .ruth-zara-menu-button:not(.ruth-zara-menu-button--menu-open) {
        color: #111111 !important;
      }

      html.ruth-product-page-active
        .ruth-zara-menu-button:not(.ruth-zara-menu-button--menu-open) {
        color: var(--ruth-product-header-ink, #111111) !important;
      }

      html.ruth-home-page-active[data-home-header-tone="dark"]
        .ruth-zara-header-inner,
      html.ruth-home-page-active[data-home-header-tone="dark"]
        .ruth-zara-menu-button:not(.ruth-zara-menu-button--menu-open),
      html.ruth-home-page-active:not([data-home-header-tone])
        .ruth-zara-header-inner,
      html.ruth-home-page-active:not([data-home-header-tone])
        .ruth-zara-menu-button:not(.ruth-zara-menu-button--menu-open) {
        color: #ffffff !important;
        mix-blend-mode: normal !important;
      }

      html.ruth-home-page-active[data-home-header-tone="light"]
        .ruth-zara-header-inner,
      html.ruth-home-page-active[data-home-header-tone="light"]
        .ruth-zara-menu-button:not(.ruth-zara-menu-button--menu-open) {
        color: #111111 !important;
        mix-blend-mode: normal !important;
      }

      html.ruth-home-page-active[data-home-header-tone="dark"] .header-wordmark,
      html.ruth-home-page-active:not([data-home-header-tone]) .header-wordmark {
        filter: brightness(0) invert(1) !important;
      }

      html.ruth-home-page-active[data-home-header-tone="light"] .header-wordmark {
        filter: brightness(0) !important;
      }

      html.ruth-home-page-active .ruth-zara-header button,
      html.ruth-home-page-active .ruth-zara-header a,
      html.ruth-home-page-active .ruth-zara-header svg {
        color: inherit !important;
        stroke: currentColor !important;
      }

      .ruth-product-lightbox__close {
        color: var(--ruth-lightbox-close-ink, var(--ruth-product-header-ink, #111111)) !important;
        border-color: color-mix(in srgb, var(--ruth-lightbox-close-ink, var(--ruth-product-header-ink, #111111)) 26%, transparent) !important;
        background: color-mix(in srgb, var(--ruth-lightbox-close-ink, var(--ruth-product-header-ink, #111111)) 8%, transparent) !important;
        box-shadow: 0 8px 28px color-mix(in srgb, var(--ruth-lightbox-close-ink, var(--ruth-product-header-ink, #111111)) 10%, transparent) !important;
      }

      .ruth-product-lightbox__close svg {
        color: inherit !important;
        stroke: currentColor !important;
      }

      .ruth-product-lightbox__zoom-controls span {
        min-width: 54px;
        font-variant-numeric: tabular-nums;
      }

      @media (min-width: 768px) {
        .ruth-product-lightbox {
          background: rgba(246, 240, 231, .10) !important;
          backdrop-filter: blur(30px) saturate(.9) brightness(.98) !important;
          -webkit-backdrop-filter: blur(30px) saturate(.9) brightness(.98) !important;
        }

        .ruth-product-lightbox__surface {
          background: transparent !important;
        }

        .ruth-product-lightbox__viewport {
          position: absolute !important;
          inset: 0 !important;
          display: grid !important;
          place-items: center !important;
          width: 100vw !important;
          height: 100dvh !important;
          padding: 28px 72px !important;
          background: transparent !important;
          overflow: hidden !important;
        }

        .ruth-product-lightbox__media {
          position: relative !important;
          inset: auto !important;
          width: min(72vw, calc((100dvh - 56px) * .75)) !important;
          height: auto !important;
          max-width: none !important;
          max-height: calc(100dvh - 56px) !important;
          aspect-ratio: 3 / 4 !important;
          overflow: hidden !important;
          border-radius: 18px !important;
          background: var(--ruth-product-media-top, #faf7f2) !important;
          box-shadow: 0 26px 90px rgba(0, 0, 0, .3) !important;
        }

        .ruth-product-lightbox__zoom-viewport,
        .ruth-product-lightbox__zoom-stage,
        .ruth-product-lightbox__zoom-image,
        .ruth-product-lightbox__zoom-image img {
          width: 100% !important;
          height: 100% !important;
          min-width: 100% !important;
          min-height: 100% !important;
        }

        .ruth-product-lightbox__zoom-image img {
          object-fit: cover !important;
          object-position: center center !important;
        }

        .ruth-product-lightbox__topbar {
          background: transparent !important;
          padding: 24px 30px !important;
        }

        .ruth-product-lightbox__meta {
          color: #111111 !important;
          text-shadow: none !important;
        }

        .ruth-product-lightbox__meta span {
          color: rgba(17, 17, 17, .62) !important;
        }

        .ruth-product-lightbox__zoom-controls {
          right: 30px !important;
          bottom: 28px !important;
        }
      }

      @media (max-width: 767px) {
        html.ruth-home-page-active,
        html.ruth-home-page-active body {
          background-color: var(--ruth-home-media-top, rgb(126 126 108)) !important;
        }

        html.ruth-home-page-active .ruth-zara-header,
        html.ruth-home-page-active .ruth-zara-header.is-scrolled,
        html.ruth-home-page-active .ruth-zara-header.is-contrast,
        html.ruth-home-page-active .ruth-zara-header .ruth-zara-header-inner {
          background: transparent !important;
          border-color: transparent !important;
          box-shadow: none !important;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }

        html.ruth-home-page-active .ruth-zara-header::before {
          content: "";
          position: absolute;
          right: 0;
          bottom: 100%;
          left: 0;
          height: max(env(safe-area-inset-top), 1px);
          background: var(--ruth-home-media-top, rgb(126 126 108));
          pointer-events: none;
        }

        html.ruth-home-page-active main > #home-editorial {
          position: relative !important;
          margin-top: -64px !important;
          padding-top: 0 !important;
        }

        html.ruth-product-page-active .product-page-swipe-shell {
          position: relative !important;
          width: 100% !important;
          overflow-x: clip !important;
          transform: none !important;
          -webkit-transform: none !important;
          transition: none !important;
          will-change: auto !important;
          contain: none !important;
          pointer-events: auto !important;
          touch-action: pan-y pinch-zoom !important;
          overscroll-behavior-y: auto !important;
        }

        html.ruth-product-page-active .product-media {
          position: relative !important;
          inset: auto !important;
          top: auto !important;
          z-index: 0 !important;
          width: 100% !important;
          min-height: 0 !important;
          align-self: auto !important;
          overflow: visible !important;
          transform: none !important;
          -webkit-transform: none !important;
          will-change: auto !important;
          contain: none !important;
        }

        html.ruth-product-page-active .product-gallery-root {
          position: relative !important;
          width: 100% !important;
          height: auto !important;
          overflow: visible !important;
          transform: none !important;
          -webkit-transform: none !important;
          will-change: auto !important;
          contain: none !important;
          pointer-events: auto !important;
        }

        html.ruth-product-page-active
          .product-gallery-frame.is-mobile-vertical:not(.is-lightbox) {
          position: relative !important;
          width: 100% !important;
          aspect-ratio: 3 / 4 !important;
          overflow: hidden !important;
          -webkit-user-select: none !important;
          user-select: none !important;
          pointer-events: auto !important;
        }

        html.ruth-product-page-active .product-gallery-frame button,
        html.ruth-product-page-active .product-summary button,
        html.ruth-product-page-active .product-purchase-mobile,
        html.ruth-product-page-active .product-purchase-mobile button {
          pointer-events: auto !important;
          touch-action: manipulation !important;
        }

        .site-app-shell .product-card-collection {
          font-size: 8.4px !important;
          line-height: 1.2 !important;
          letter-spacing: 0.13em !important;
        }

        .site-app-shell .product-card-name {
          font-size: 0.84rem !important;
          line-height: 1.22 !important;
        }

        .site-app-shell .product-card-current {
          font-size: 12px !important;
        }

        .site-app-shell .product-card-compare {
          font-size: 9.5px !important;
        }

        .site-app-shell .product-card-sale-pill strong {
          font-size: 11px !important;
        }

        .site-app-shell .product-card-sale-pill em {
          font-size: 8px !important;
        }

        .site-app-shell .product-complete-rail {
          display: grid !important;
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          gap: 6px !important;
          padding: 0 8px !important;
        }

        .site-app-shell .product-complete-card {
          width: auto !important;
          min-width: 0 !important;
        }

        .site-app-shell .product-complete-card .product-card-collection {
          font-size: 7.5px !important;
        }

        .site-app-shell .product-complete-card .product-card-name {
          font-size: 9.6px !important;
          line-height: 1.24 !important;
        }

        .site-app-shell .product-complete-card .product-card-current,
        .site-app-shell .product-complete-card .product-card-sale-pill strong {
          font-size: 10.5px !important;
        }
      }
    `}</style>
  );
}
