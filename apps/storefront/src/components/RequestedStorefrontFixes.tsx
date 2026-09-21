"use client";

export function RequestedStorefrontFixes() {
  return (
    <style>{`
      /* Requested homepage header: fully transparent over the homepage. */
      .site-app-shell:has(#home-editorial) .ruth-zara-header:not([data-menu-open="true"]) {
        background: transparent !important;
        border-color: transparent !important;
        box-shadow: none !important;
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
      }

      @media (max-width: 767px) {
        /* Native Safari document flow: no sticky media, no trapped gestures, no transformed page shell. */
        html.ruth-product-page-active,
        html.ruth-product-page-active body,
        html.ruth-product-page-active .site-app-shell,
        html.ruth-product-page-active main,
        html.ruth-product-page-active .product-page-swipe-shell,
        html.ruth-product-page-active .product-detail-page,
        html.ruth-product-page-active .product-primary,
        html.ruth-product-page-active .product-media,
        html.ruth-product-page-active .product-gallery-root,
        html.ruth-product-page-active .product-gallery-mobile-flow {
          touch-action: pan-y !important;
          overscroll-behavior-y: auto !important;
          -webkit-overflow-scrolling: touch !important;
        }

        html.ruth-product-page-active .product-page-swipe-shell {
          position: relative !important;
          overflow: visible !important;
          transform: none !important;
          -webkit-transform: none !important;
          will-change: auto !important;
          contain: none !important;
        }

        html.ruth-product-page-active .product-primary {
          display: block !important;
          width: 100% !important;
          min-height: 0 !important;
          overflow: visible !important;
        }

        html.ruth-product-page-active .product-media {
          position: static !important;
          inset: auto !important;
          display: block !important;
          width: 100% !important;
          min-height: 0 !important;
          overflow: visible !important;
          transform: none !important;
          -webkit-transform: none !important;
          will-change: auto !important;
          contain: none !important;
        }

        html.ruth-product-page-active .product-gallery-root,
        html.ruth-product-page-active .product-gallery-mobile-flow {
          position: static !important;
          display: block !important;
          width: 100% !important;
          height: auto !important;
          min-height: 0 !important;
          overflow: visible !important;
          transform: none !important;
          -webkit-transform: none !important;
          will-change: auto !important;
          contain: none !important;
        }

        html.ruth-product-page-active .product-gallery-mobile-item {
          position: relative !important;
          display: block !important;
          width: 100% !important;
          height: auto !important;
          aspect-ratio: 3 / 4 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          touch-action: pan-y !important;
          overscroll-behavior: auto !important;
          transform: none !important;
          -webkit-transform: none !important;
          will-change: auto !important;
          contain: layout paint !important;
        }

        html.ruth-product-page-active .product-gallery-mobile-item + .product-gallery-mobile-item {
          margin-top: 2px !important;
        }

        html.ruth-product-page-active .product-gallery-mobile-item .product-gallery-image,
        html.ruth-product-page-active .product-gallery-mobile-item .product-gallery-image img {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          transform: none !important;
          -webkit-transform: none !important;
          will-change: auto !important;
        }

        /* Mobile product-card typography: slightly smaller and calmer. */
        .product-card-collection {
          font-size: 8.5px !important;
          line-height: 1.2 !important;
          letter-spacing: 0.14em !important;
        }

        .product-card-name {
          font-size: 0.86rem !important;
          line-height: 1.22 !important;
        }

        .product-card-current {
          font-size: 12px !important;
        }

        .product-card-compare {
          font-size: 9.5px !important;
        }

        .product-card-sale-pill strong {
          font-size: 11px !important;
        }

        .product-card-sale-pill em {
          font-size: 8px !important;
        }

        .product-complete-card .product-card-collection {
          font-size: 7px !important;
        }

        .product-complete-card .product-card-name {
          font-size: 9px !important;
        }

        .product-complete-card .product-card-current,
        .product-complete-card .product-card-sale-pill strong {
          font-size: 10px !important;
        }
      }
    `}</style>
  );
}
