export function StorefrontRequestedFixes() {
  return (
    <style>{`
      /* Home and product headers remain transparent; only foreground contrast changes. */
      html.ruth-home-page-active .ruth-zara-header.is-contrast,
      html.ruth-home-page-active .ruth-zara-header.is-contrast .ruth-zara-header-inner { background: transparent !important; border-color: transparent !important; box-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
      html.ruth-home-page-active .ruth-zara-header.is-contrast .ruth-zara-header-inner { color: var(--ruth-home-header-logo-ink, var(--ruth-home-header-ink, #ffffff)) !important; mix-blend-mode: normal !important; }
      html.ruth-home-page-active .ruth-zara-header .header-wordmark,
      html.ruth-home-page-active .ruth-zara-header.is-contrast .header-wordmark { filter: brightness(0) invert(var(--ruth-home-header-logo-invert, var(--ruth-home-header-invert, 1))) !important; }
      html.ruth-home-page-active .ruth-zara-menu-button:not(.ruth-zara-menu-button--menu-open) { color: var(--ruth-home-header-menu-ink, var(--ruth-home-header-ink, #ffffff)) !important; mix-blend-mode: normal !important; }
      html.ruth-home-page-active .ruth-zara-menu-button:not(.ruth-zara-menu-button--menu-open) .ruth-zara-hamburger__line { background: currentColor !important; }
      html.ruth-home-page-active .ruth-zara-header button[aria-label="Ara"] { color: var(--ruth-home-header-search-ink, var(--ruth-home-header-ink, #ffffff)) !important; }
      html.ruth-home-page-active .ruth-zara-header button[aria-label="Hesap menüsü"] { color: var(--ruth-home-header-account-ink, var(--ruth-home-header-ink, #ffffff)) !important; }
      html.ruth-home-page-active .ruth-zara-header button[aria-label^="Sepet"] { color: var(--ruth-home-header-cart-ink, var(--ruth-home-header-ink, #ffffff)) !important; }
      html.ruth-home-page-active .ruth-zara-header button[aria-label="Ara"] svg,
      html.ruth-home-page-active .ruth-zara-header button[aria-label="Hesap menüsü"] svg,
      html.ruth-home-page-active .ruth-zara-header button[aria-label^="Sepet"] svg { color: inherit !important; stroke: currentColor !important; }

      html.ruth-product-page-active .ruth-zara-header,
      html.ruth-product-page-active .ruth-zara-header.is-scrolled,
      html.ruth-product-page-active .ruth-zara-header.is-contrast,
      html.ruth-product-page-active .ruth-zara-header.product-header-transparent,
      html.ruth-product-page-active .ruth-zara-header .ruth-zara-header-inner { background: transparent !important; border-color: transparent !important; box-shadow: none !important; transition: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
      html.ruth-product-page-active .ruth-zara-header .ruth-zara-header-inner { color: var(--ruth-product-header-ink, #111111) !important; mix-blend-mode: normal !important; }
      html.ruth-product-page-active .ruth-zara-header .header-wordmark { filter: brightness(0) invert(var(--ruth-product-header-invert, 0)) !important; }
      html.ruth-product-page-active .ruth-zara-header button,
      html.ruth-product-page-active .ruth-zara-header a,
      html.ruth-product-page-active .ruth-zara-header svg { color: inherit !important; stroke: currentColor !important; }

      /* Product-page mobile header: every action follows the same contrast variable as Menu. */
      @media (max-width: 767px) {
        html.ruth-product-page-active .ruth-zara-header .ruth-zara-header-inner,
        html.ruth-product-page-active .ruth-zara-header .ruth-zara-header-inner > div { color: var(--ruth-product-header-ink, #111111) !important; }
        html.ruth-product-page-active .ruth-zara-header button[aria-label="Ara"],
        html.ruth-product-page-active .ruth-zara-header button[aria-label="Hesap menüsü"],
        html.ruth-product-page-active .ruth-zara-header button[aria-label^="Sepet"] { color: var(--ruth-product-header-ink, #111111) !important; -webkit-text-fill-color: var(--ruth-product-header-ink, #111111) !important; opacity: 1 !important; }
        html.ruth-product-page-active .ruth-zara-header button[aria-label="Ara"] svg,
        html.ruth-product-page-active .ruth-zara-header button[aria-label="Hesap menüsü"] svg,
        html.ruth-product-page-active .ruth-zara-header button[aria-label^="Sepet"] svg { color: var(--ruth-product-header-ink, #111111) !important; stroke: var(--ruth-product-header-ink, #111111) !important; opacity: 1 !important; }
        html.ruth-product-page-active .ruth-zara-header button[aria-label="Ara"] svg *,
        html.ruth-product-page-active .ruth-zara-header button[aria-label="Hesap menüsü"] svg *,
        html.ruth-product-page-active .ruth-zara-header button[aria-label^="Sepet"] svg * { stroke: var(--ruth-product-header-ink, #111111) !important; color: var(--ruth-product-header-ink, #111111) !important; }
      }

      html.ruth-product-page-active .ruth-zara-menu-button:not(.ruth-zara-menu-button--menu-open) { color: var(--ruth-product-header-ink, #111111) !important; mix-blend-mode: normal !important; }
      html.ruth-product-page-active .ruth-zara-menu-button:not(.ruth-zara-menu-button--menu-open) .ruth-zara-hamburger__line { background: currentColor !important; }

      /* Material and care are rendered as two separate paragraphs. */
      .product-desktop-details p, .product-mobile-detail-copy p, .product-mobile-detail-copy { white-space: pre-line !important; }
      .product-page-swipe-panel-tabs span:nth-child(2) { font-size: 0 !important; }
      .product-page-swipe-panel-tabs span:nth-child(2)::after { content: "Materyal ve Bakım"; font-size: clamp(6.2px, 1.8vw, 8px); line-height: 1.2; }

      /* Product media has sharp corners in every non-lightbox layout. */
      html.ruth-product-page-active .product-gallery-frame:not(.is-lightbox),
      html.ruth-product-page-active .product-gallery-frame:not(.is-lightbox) .product-gallery-slide,
      html.ruth-product-page-active .product-gallery-frame:not(.is-lightbox) .product-gallery-image,
      html.ruth-product-page-active .product-gallery-frame:not(.is-lightbox) .product-gallery-image img { border-radius: 0 !important; }

      .ruth-product-lightbox { position: fixed !important; inset: 0 !important; z-index: 2147483646 !important; width: 100dvw !important; height: 100dvh !important; overflow: hidden !important; isolation: isolate !important; }
      html.ruth-product-lightbox-open .ruth-zara-header, html.ruth-product-lightbox-open .ruth-zara-menu-button, html.ruth-product-lightbox-open .product-purchase-mobile, html.ruth-product-lightbox-open .product-mobile-details-inline, html.ruth-product-lightbox-open .whatsapp-floating-bubble, html.ruth-product-lightbox-open .rewards-floating-bubble { opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }

      @media (max-width: 767px) {
        html.ruth-product-page-active, html.ruth-product-page-active body { background: var(--ruth-product-media-top, var(--cream)) !important; }
        html.ruth-product-page-active body::before, html.ruth-home-page-active body::before { content: ""; position: fixed; top: 0; right: 0; left: 0; z-index: 79; height: max(env(safe-area-inset-top), 1px); pointer-events: none; }
        html.ruth-product-page-active body::before { background: var(--ruth-product-header-surface, var(--ruth-product-media-top, var(--cream))); }
        html.ruth-home-page-active body::before { background: var(--ruth-home-media-top, var(--ivory)); }
        html.ruth-product-page-active .product-primary, html.ruth-product-page-active .product-media, html.ruth-product-page-active .product-gallery-root, html.ruth-product-page-active .product-gallery-frame.is-mobile-vertical:not(.is-lightbox) { margin-top: 0 !important; padding-top: 0 !important; }
        html.ruth-product-page-active .product-gallery-frame.is-mobile-vertical:not(.is-lightbox) { height: 133.333333vw !important; min-height: 133.333333vw !important; }
        .ruth-product-lightbox .product-gallery-arrow { display: grid !important; z-index: 30 !important; }
        .ruth-product-lightbox .product-gallery-progress { z-index: 30 !important; }
      }

      /* The iOS safe-area strip ABOVE the header belongs to the current home hero, not the header. */
      @media (max-width: 767px) {
        html.ruth-home-page-active body { margin: 0 !important; padding: 0 !important; }
        html.ruth-home-page-active body::before { height: env(safe-area-inset-top) !important; background: var(--ruth-home-media-top, var(--ivory)) !important; }
        html.ruth-home-page-active .ruth-zara-header::before { display: none !important; content: none !important; }
      }
    `}</style>
  );
}
