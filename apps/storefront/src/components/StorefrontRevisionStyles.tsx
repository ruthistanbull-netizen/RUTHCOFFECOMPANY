import { ProductHeaderAdaptiveTone } from "@/components/product/ProductHeaderAdaptiveTone";

export function StorefrontRevisionStyles() {
  return (
    <>
      <ProductHeaderAdaptiveTone />
      <style>{`
        /* Product card typography refinement and latest preview revisions. */
        html.ruth-product-page-active .whatsapp-floating-bubble,
        html.ruth-product-page-active .rewards-floating-bubble {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }

        .product-card-image-frame { aspect-ratio: 3 / 4 !important; }
        .product-card-image-frame img { width: 100% !important; height: 100% !important; object-fit: cover !important; object-position: center center !important; }

        html.ruth-product-page-active .product-gallery-frame.is-lightbox .product-gallery-image,
        html.ruth-product-page-active .product-gallery-frame.is-lightbox .product-gallery-image img { object-fit: contain !important; }
        html.ruth-product-page-active .ruth-zara-header.product-header-transparent .ruth-zara-header-inner { color: var(--ruth-product-header-ink, #111111) !important; mix-blend-mode: normal !important; }
        html.ruth-product-page-active .ruth-zara-header.product-header-transparent .header-wordmark { filter: brightness(0) invert(var(--ruth-product-header-invert, 0)) !important; }
        html.ruth-product-page-active .ruth-zara-header.product-header-transparent button,
        html.ruth-product-page-active .ruth-zara-header.product-header-transparent a,
        html.ruth-product-page-active .ruth-zara-header.product-header-transparent svg { color: inherit !important; stroke: currentColor !important; }
        html.ruth-product-page-active:has(.ruth-zara-header.product-header-transparent[data-menu-open="false"]) .ruth-zara-menu-button { color: var(--ruth-product-header-ink, #111111) !important; mix-blend-mode: normal !important; }
        html.ruth-product-page-active:has(.ruth-zara-header.product-header-transparent[data-menu-open="false"]) .ruth-zara-menu-button .ruth-zara-hamburger__line { background: currentColor !important; }

        /* Mobile product header: search/account/cart follow the same adaptive contrast as the menu. */
        @media (max-width: 767px) {
          html.ruth-product-page-active .ruth-zara-header.product-header-transparent .ruth-zara-header-inner > div:last-child { color: #fff !important; mix-blend-mode: difference !important; }
          html.ruth-product-page-active .ruth-zara-header.product-header-transparent .ruth-zara-header-inner > div:last-child button,
          html.ruth-product-page-active .ruth-zara-header.product-header-transparent .ruth-zara-header-inner > div:last-child a,
          html.ruth-product-page-active .ruth-zara-header.product-header-transparent .ruth-zara-header-inner > div:last-child svg { color: inherit !important; stroke: currentColor !important; }
        }

        .site-app-shell button:has(svg.lucide-x):not(.ruth-zara-menu-button) { display:flex !important; width:40px !important; min-width:40px !important; height:40px !important; min-height:40px !important; flex:0 0 40px !important; align-items:center !important; justify-content:center !important; padding:0 !important; border:0 !important; border-radius:9999px !important; background:transparent !important; color:inherit !important; box-shadow:none !important; transition:background-color 180ms ease,transform 180ms ease !important; -webkit-tap-highlight-color:transparent; }
        .site-app-shell button:has(svg.lucide-x):not(.ruth-zara-menu-button):hover { background:rgba(0,0,0,.05) !important; }
        .site-app-shell button:has(svg.lucide-x):not(.ruth-zara-menu-button):active { transform:scale(.96) !important; }
        .site-app-shell button:has(svg.lucide-x):not(.ruth-zara-menu-button) svg { width:20px !important; height:20px !important; stroke-width:1.5 !important; }
        html:has(.product-variant-overlay) .ruth-zara-header-inner > div:last-child { opacity:0 !important; visibility:hidden !important; pointer-events:none !important; }

        .product-card-collection { font-size:10px !important; line-height:1.22 !important; }
        .product-card-name { font-size:1.05rem !important; line-height:1.3 !important; }
        .product-card-current { font-size:15px !important; }
        .product-card-compare { font-size:12px !important; }
        .product-card-sale-pill strong { font-size:13px !important; }
        .product-card-sale-pill em { font-size:9px !important; }

        /* Sold-out cards: subtly fade the image and show a red TÜKENDİ pill on the top-right. */
        .product-card-root:has(.product-card-add:disabled) .product-card-image-frame::after {
          content:"TÜKENDİ"; position:absolute; top:10px; right:10px; z-index:6; display:inline-flex; min-height:29px; align-items:center; justify-content:center; padding:0 11px; border:1px solid rgba(180,0,22,.18); border-radius:999px; background:rgba(180,0,22,.96); color:#fff; font-size:8.5px; font-weight:500; letter-spacing:.14em; line-height:1; text-transform:uppercase; box-shadow:0 5px 16px rgba(40,0,0,.12);
        }
        .product-card-root:has(.product-card-add:disabled) .product-card-image-frame img { opacity:.72 !important; filter:saturate(.82) !important; transition:opacity 220ms ease,filter 220ms ease !important; }

        .home-editorial-wordmark { left:0 !important; top:calc(100svh - clamp(248px,47vw,322px)) !important; width:100vw !important; max-width:100vw !important; height:clamp(205px,42vw,286px) !important; overflow:hidden !important; }
        .ruth-zara-menu-logo { width:16vw !important; height:6.8vw !important; min-width:218px !important; min-height:92px !important; max-width:310px !important; max-height:129px !important; }

        @container (max-width:190px) {
          .product-card-collection { font-size:7.8px !important; line-height:1.2 !important; }
          .product-card-name { font-size:9.8px !important; line-height:1.26 !important; }
          .product-card-current { font-size:10.7px !important; }
          .product-card-compare { font-size:8.2px !important; }
          .product-card-sale-pill strong { font-size:8.8px !important; }
          .product-card-sale-pill em { font-size:6.6px !important; }
        }

        @media (min-width:1024px) {
          .home-editorial-wordmark { right:-7vw !important; bottom:-12vh !important; left:auto !important; top:auto !important; width:185vw !important; max-width:none !important; height:clamp(520px,46vw,900px) !important; overflow:visible !important; -webkit-mask-position:right bottom !important; mask-position:right bottom !important; }
        }
        @media (max-width:1023px) {
          .ruth-zara-menu-logo { left:24px !important; width:clamp(224px,68vw,292px) !important; height:88px !important; min-width:0 !important; min-height:0 !important; max-width:292px !important; max-height:88px !important; }
        }
        @media (max-width:767px) {
          html.ruth-product-page-active .ruth-zara-header.product-header-transparent { background:var(--ruth-product-media-top,var(--cream)) !important; }
          .product-complete-card .product-card-collection { font-size:7.7px !important; }
          .product-complete-card .product-card-name { font-size:9.7px !important; line-height:1.26 !important; }
          .product-complete-card .product-card-current { font-size:10.5px !important; }

          /* Homepage: remove the separate body/header band so the hero image continues behind the mobile top area. */
          html.ruth-home-page-active,
          html.ruth-home-page-active body,
          html.ruth-home-page-active .site-app-shell { background:transparent !important; }
          html.ruth-home-page-active main > #home-editorial { margin-top:-64px !important; padding-top:0 !important; }
          html.ruth-home-page-active .ruth-zara-header,
          html.ruth-home-page-active .ruth-zara-header.is-scrolled,
          html.ruth-home-page-active .ruth-zara-header.is-contrast,
          html.ruth-home-page-active .ruth-zara-header .ruth-zara-header-inner { background:transparent !important; border-color:transparent !important; box-shadow:none !important; -webkit-backdrop-filter:none !important; backdrop-filter:none !important; }
          .product-card-root:has(.product-card-add:disabled) .product-card-image-frame::after { top:7px; right:7px; min-height:25px; padding:0 9px; font-size:7px; letter-spacing:.11em; }

          .product-page-swipe-shell:not(.is-dragging):not(.is-navigating):not(.is-entering) { transform:none !important; -webkit-transform:none !important; will-change:auto !important; }
          html.ruth-product-page-active .product-media,
          html.ruth-product-page-active .product-gallery-root { background:var(--ruth-product-media-top,var(--cream)) !important; }
          html.ruth-product-page-active .product-media { position:relative !important; top:auto !important; align-self:auto !important; opacity:1 !important; transform:none !important; -webkit-transform:none !important; overflow-anchor:none !important; }
          html.ruth-product-page-active .product-gallery-root,
          html.ruth-product-page-active .product-gallery-frame:not(.is-lightbox),
          html.ruth-product-page-active .product-gallery-track,
          html.ruth-product-page-active .product-gallery-slide { overflow-anchor:none !important; }
          html.ruth-product-page-active .product-gallery-frame:not(.is-lightbox) { -webkit-user-select:none !important; user-select:none !important; }
          html.ruth-product-page-active .product-summary,
          html.ruth-product-page-active .product-complete-look,
          html.ruth-product-page-active .product-secondary-content { z-index:auto !important; }
          html.ruth-product-page-active .product-purchase-mobile { position:fixed !important; inset:auto 0 0 0 !important; z-index:2147483000 !important; display:block !important; width:100% !important; max-width:100vw !important; overflow:visible !important; transform:none !important; -webkit-transform:none !important; opacity:1 !important; visibility:visible !important; pointer-events:auto !important; isolation:isolate !important; contain:none !important; will-change:auto !important; backface-visibility:hidden !important; -webkit-backface-visibility:hidden !important; }
          html.ruth-product-page-active:has(.ruth-zara-header[data-menu-open="true"]) .product-purchase-mobile,
          html.ruth-product-page-active:has(.product-variant-overlay) .product-purchase-mobile { display:none !important; opacity:0 !important; visibility:hidden !important; pointer-events:none !important; }
          html.ruth-product-page-active .product-variant-overlay { z-index:2147483600 !important; align-items:flex-end !important; padding:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom)) !important; overflow:hidden !important; overscroll-behavior:none !important; }
          html.ruth-product-page-active .product-variant-sheet { width:100% !important; height:auto !important; min-height:0 !important; max-height:calc(100dvh - max(16px,env(safe-area-inset-top)) - max(16px,env(safe-area-inset-bottom))) !important; margin:0 !important; overflow-x:hidden !important; overflow-y:auto !important; padding-bottom:calc(28px + env(safe-area-inset-bottom)) !important; overscroll-behavior:contain !important; touch-action:pan-y !important; -webkit-overflow-scrolling:touch !important; scrollbar-gutter:stable !important; }
          html.ruth-product-page-active .product-purchase-mobile::before { content:""; position:absolute; inset:0; z-index:-1; background:var(--cream); }
        }
      `}</style>
    </>
  );
}
