export const productGalleryStyles = `
.product-gallery-root{width:100%;min-width:0}
.product-gallery-empty,.product-gallery-frame{position:relative;width:100%;aspect-ratio:3/4;overflow:hidden;background:var(--ruth-color-surface);contain:layout paint}
.product-gallery-empty{display:grid;place-items:center}
.product-gallery-keen:not([data-keen-slider-disabled]){align-content:flex-start;display:flex;overflow:hidden;position:relative;-webkit-user-select:none;-webkit-touch-callout:none;user-select:none;touch-action:pan-y;-webkit-tap-highlight-color:transparent;width:100%;height:100%}
.product-gallery-keen:not([data-keen-slider-disabled])[data-keen-slider-v]{flex-wrap:wrap;touch-action:pan-x}
.product-gallery-slide{position:relative;width:100%;height:100%;min-height:100%;overflow:hidden;flex:0 0 100%;cursor:grab;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.product-gallery-slide:active{cursor:grabbing}
.product-gallery-image,.product-gallery-image img,.product-gallery-placeholder{display:block;width:100%!important;height:100%!important;object-fit:contain!important;object-position:center!important;background:var(--ruth-color-surface);-webkit-user-drag:none;user-select:none}
.product-gallery-image img{pointer-events:none}
.product-gallery-placeholder{background:var(--ruth-product-media-top,var(--ruth-color-surface))}
.product-gallery-frame:not(.is-lightbox){border-radius:28px;box-shadow:0 22px 65px color-mix(in srgb,var(--ruth-color-text-primary) 10%,transparent)}
.product-gallery-expand,.product-gallery-arrow{position:absolute;z-index:4;display:grid;width:44px;height:44px;place-items:center;border:1px solid color-mix(in srgb,var(--ruth-color-accent) 28%,transparent);border-radius:50%;background:color-mix(in srgb,var(--ruth-color-canvas) 90%,transparent);color:var(--ink);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:opacity .24s ease,transform .28s cubic-bezier(.22,1,.36,1),background .24s ease,box-shadow .24s ease}
.product-gallery-expand{top:16px;right:16px}
.product-gallery-arrow{top:50%;transform:translateY(-50%)}
.product-gallery-arrow.is-previous{left:16px}
.product-gallery-arrow.is-next{right:16px}
.product-gallery-arrow:disabled{opacity:.2;pointer-events:none}
.product-gallery-progress{position:absolute;right:13px;bottom:13px;z-index:4;display:flex;gap:5px;padding:8px 10px;border-radius:999px;background:color-mix(in srgb,var(--ruth-color-canvas) 82%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.product-gallery-progress button{width:5px;height:5px;padding:0;border:0;border-radius:50%;background:color-mix(in srgb,var(--ruth-color-text-primary) 25%,transparent);transition:transform .24s cubic-bezier(.22,1,.36,1),background .2s ease}
.product-gallery-progress button.is-active{background:var(--ink);transform:scale(1.45)}
.ruth-product-lightbox{position:fixed;inset:0;z-index:1200;width:100vw;height:100dvh;overflow:hidden;background:color-mix(in srgb,var(--rosta-carbon,#111111) 72%,transparent);-webkit-backdrop-filter:blur(24px) saturate(.9);backdrop-filter:blur(24px) saturate(.9);overscroll-behavior:none;touch-action:none}
.ruth-product-lightbox__surface{position:absolute;inset:0;overflow:hidden;background:transparent;color:var(--ink);transform-origin:center center}
.ruth-product-lightbox__viewport{position:absolute;inset:0;display:grid;width:100%;height:100%;place-items:center;padding:clamp(28px,4vw,58px);overflow:hidden;background:transparent}
.ruth-product-lightbox__media{position:relative;width:min(68vw,calc((100dvh - 88px)*.75),720px);aspect-ratio:3/4;overflow:hidden;border:1px solid rgba(255,255,255,.22);border-radius:20px;background:var(--ruth-product-media-top,var(--ruth-color-canvas,var(--cream)));box-shadow:0 34px 100px rgba(0,0,0,.24),0 8px 28px rgba(0,0,0,.12);transform-origin:center center;will-change:transform,opacity,filter,clip-path}
.ruth-product-lightbox__zoom-viewport{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;touch-action:none;overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;cursor:zoom-in}
.ruth-product-lightbox__zoom-viewport.is-zoomed{cursor:grab}
.ruth-product-lightbox__zoom-viewport.is-zoomed:active{cursor:grabbing}
.ruth-product-lightbox__zoom-stage{position:absolute;inset:0;display:grid;place-items:center;transform-origin:center center;will-change:transform;transition:transform .42s cubic-bezier(.22,1,.36,1)}
.ruth-product-lightbox__zoom-stage.is-gesture-active{transition:none}
.ruth-product-lightbox__zoom-image,.ruth-product-lightbox__zoom-image img,.ruth-product-lightbox__zoom-image .product-gallery-placeholder{display:block;width:100%!important;height:100%!important;min-width:100%!important;min-height:100%!important;object-fit:cover!important;object-position:center center!important;background:var(--ruth-product-media-top,var(--ruth-color-canvas,var(--cream)))!important;-webkit-user-drag:none;user-drag:none;user-select:none;pointer-events:none}
.ruth-product-lightbox__topbar{position:absolute;top:0;right:0;left:0;z-index:20;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;padding:calc(18px + env(safe-area-inset-top)) max(22px,env(safe-area-inset-right)) 28px max(22px,env(safe-area-inset-left));background:linear-gradient(180deg,color-mix(in srgb,var(--rosta-carbon,#111111) 34%,transparent) 0%,color-mix(in srgb,var(--rosta-carbon,#111111) 12%,transparent) 48%,transparent 100%);pointer-events:none}
.ruth-product-lightbox__meta{min-width:0;display:grid;gap:4px;color:var(--rosta-action-text,#FFFFFF);pointer-events:auto;text-shadow:0 2px 18px rgba(0,0,0,.42)}
.ruth-product-lightbox__meta span{color:color-mix(in srgb,var(--rosta-action-text,#FFFFFF) 72%,transparent);font-size:8px;line-height:1;letter-spacing:.19em;text-transform:uppercase}
.ruth-product-lightbox__meta strong{overflow:hidden;font-family:var(--font-heading);font-size:clamp(1rem,2vw,1.35rem);font-weight:400;line-height:1.08;text-overflow:ellipsis;white-space:nowrap}
.ruth-product-lightbox__close{display:grid;width:44px;height:44px;place-items:center;justify-self:end;border:1px solid color-mix(in srgb,var(--ruth-lightbox-close-bg,#111) 82%,transparent);border-radius:50%;background:var(--ruth-lightbox-close-bg,#111);color:var(--ruth-lightbox-close-fg,#fff);box-shadow:0 10px 34px rgba(0,0,0,.18);pointer-events:auto;transition:transform .28s cubic-bezier(.22,1,.36,1),background-color .22s ease,color .22s ease,border-color .22s ease}
.ruth-product-lightbox__close svg{color:currentColor!important;stroke:currentColor!important}
.ruth-product-lightbox__close:active{transform:scale(.9)}
.ruth-product-lightbox__zoom-controls{position:absolute;right:max(18px,env(safe-area-inset-right));bottom:calc(18px + env(safe-area-inset-bottom));z-index:21;display:grid;grid-template-columns:42px 58px 42px;align-items:center;overflow:hidden;border:1px solid rgba(255,255,255,.35);border-radius:999px;background:color-mix(in srgb,var(--rosta-cream,#FBF3E6) 88%,transparent);box-shadow:0 12px 36px rgba(0,0,0,.16);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.ruth-product-lightbox__zoom-controls button{display:grid;width:42px;height:42px;place-items:center;border:0;background:transparent;color:var(--rosta-carbon,#111111);transition:opacity .18s ease,transform .18s ease,background .18s ease}
.ruth-product-lightbox__zoom-controls button:active{transform:scale(.88)}
.ruth-product-lightbox__zoom-controls button:disabled{opacity:.22;pointer-events:none}
.ruth-product-lightbox__zoom-controls span{display:grid;height:42px;place-items:center;border-right:1px solid color-mix(in srgb,var(--rosta-carbon,#111111) 12%,transparent);border-left:1px solid color-mix(in srgb,var(--rosta-carbon,#111111) 12%,transparent);font-size:8px;letter-spacing:.08em;font-variant-numeric:tabular-nums}
html.ruth-product-lightbox-open,html.ruth-product-lightbox-open body{height:100%;overflow:hidden!important;overscroll-behavior:none}
@media(hover:hover) and (pointer:fine){
  .ruth-product-lightbox__close:hover{transform:rotate(4deg) scale(1.05);filter:brightness(.96)}
  .product-gallery-expand:hover,.product-gallery-arrow:not(:disabled):hover{background:color-mix(in srgb,var(--ruth-color-canvas) 98%,transparent);box-shadow:0 8px 24px color-mix(in srgb,var(--ruth-color-text-primary) 12%,transparent)}
  .ruth-product-lightbox__zoom-controls button:not(:disabled):hover{background:color-mix(in srgb,var(--rosta-carbon,#111111) 8%,transparent)}
}
@media(max-width:767px){
  .product-gallery-root{position:relative;width:100%;height:auto!important;overflow:visible;opacity:1!important;transform:none!important;border-radius:0!important}
  html.ruth-product-page-active body .site-app-shell .product-media{min-height:100svh!important;background:var(--ruth-product-media-top,var(--cream))}
  html.ruth-product-page-active body .site-app-shell .product-browser-preview-details{margin-top:max(0px,calc(100svh - 133.333333vw))}
  html.ruth-product-page-active body .site-app-shell .product-gallery-frame.is-mobile-vertical:not(.is-lightbox){position:relative!important;width:100vw!important;height:133.333333vw!important;min-height:133.333333vw!important;max-height:none!important;aspect-ratio:3/4!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;overflow:hidden!important;overscroll-behavior:contain!important;-webkit-user-select:none!important;user-select:none!important;-webkit-tap-highlight-color:transparent}
  html.ruth-product-page-active body .site-app-shell .product-gallery-frame.is-mobile-vertical .product-gallery-keen{display:flex!important;width:100%!important;height:100%!important;min-height:100%!important;overflow:hidden!important;touch-action:pan-x!important;overscroll-behavior:contain!important}
  html.ruth-product-page-active body .site-app-shell .product-gallery-frame.is-mobile-vertical .product-gallery-slide{width:100%!important;height:100%!important;min-width:100%!important;min-height:100%!important;overflow:hidden!important;border-radius:0!important}
  html.ruth-product-page-active body .site-app-shell .product-gallery-frame.is-mobile-vertical .product-gallery-image,html.ruth-product-page-active body .site-app-shell .product-gallery-frame.is-mobile-vertical .product-gallery-image img,html.ruth-product-page-active body .site-app-shell .product-gallery-frame.is-mobile-vertical .product-gallery-placeholder{width:100%!important;height:100%!important;border-radius:0!important;background:var(--ruth-product-media-top,var(--cream))!important}
  html.ruth-product-page-active body .site-app-shell .product-gallery-frame.is-mobile-vertical:not(.is-lightbox) .product-gallery-image img{box-sizing:border-box!important;padding:clamp(10px,3vw,16px)!important;object-fit:contain!important;object-position:center center!important}
  .product-gallery-frame.is-mobile-vertical:not(.is-lightbox) .product-gallery-arrow{display:none!important}
  .product-gallery-frame.is-mobile-vertical:not(.is-lightbox) .product-gallery-expand{top:calc(72px + env(safe-area-inset-top));right:12px;width:40px;height:40px;border-radius:50%;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}
  .product-gallery-frame.is-mobile-vertical:not(.is-lightbox) .product-gallery-progress{right:10px;bottom:auto;top:50%;flex-direction:column;transform:translateY(-50%);padding:9px 8px;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none}
  .product-gallery-frame.is-mobile-vertical:not(.is-lightbox) .product-gallery-expand{border-color:color-mix(in srgb,var(--rosta-kraft) 62%,transparent);background:color-mix(in srgb,var(--rosta-cream) 92%,transparent);color:var(--rosta-espresso)}
  .product-gallery-frame.is-mobile-vertical:not(.is-lightbox) .product-gallery-expand svg{color:currentColor;stroke:currentColor}
  .product-gallery-frame.is-mobile-vertical:not(.is-lightbox) .product-gallery-progress{border:1px solid color-mix(in srgb,var(--rosta-kraft) 56%,transparent);background:color-mix(in srgb,var(--rosta-cream) 90%,transparent)}
  .product-gallery-frame.is-mobile-vertical:not(.is-lightbox) .product-gallery-progress button{background:color-mix(in srgb,var(--rosta-cocoa) 38%,transparent)}
  .product-gallery-frame.is-mobile-vertical:not(.is-lightbox) .product-gallery-progress button.is-active{background:var(--rosta-brick-b);transform:scale(1.45)}
  .ruth-product-lightbox{background:var(--ruth-product-media-top,var(--ruth-color-canvas,var(--cream)));-webkit-backdrop-filter:none;backdrop-filter:none}
  .ruth-product-lightbox,.ruth-product-lightbox__surface,.ruth-product-lightbox__viewport{width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;border:0!important;border-radius:0!important;margin:0!important;padding:0!important}
  .ruth-product-lightbox__media{position:absolute!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;aspect-ratio:auto!important;border:0!important;border-radius:0!important;margin:0!important;padding:0!important;box-shadow:none!important;background:var(--ruth-product-media-top,var(--cream))!important}
  .ruth-product-lightbox__topbar{gap:12px;padding:calc(10px + env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 30px max(14px,env(safe-area-inset-left));background:linear-gradient(180deg,color-mix(in srgb,var(--ruth-color-canvas,var(--cream)) 80%,transparent) 0%,transparent 100%)}
  .ruth-product-lightbox__meta{gap:3px;padding-right:8px;color:var(--ruth-product-header-ink,#111);text-shadow:none}
  .ruth-product-lightbox__meta span{font-size:7px;color:color-mix(in srgb,var(--ruth-product-header-ink,#111) 58%,transparent)}
  .ruth-product-lightbox__meta strong{font-size:clamp(.98rem,4.7vw,1.16rem)}
  .ruth-product-lightbox__close{width:40px;height:40px;flex:0 0 40px}
  .ruth-product-lightbox__zoom-controls{right:max(12px,env(safe-area-inset-right));bottom:calc(12px + env(safe-area-inset-bottom));grid-template-columns:40px 54px 40px}
  .ruth-product-lightbox__zoom-controls button,.ruth-product-lightbox__zoom-controls span{height:40px}
  .ruth-product-lightbox__zoom-controls button{width:40px}
}
@media(max-width:767px) and (prefers-reduced-motion:reduce){.product-gallery-root,.product-gallery-progress button,.product-gallery-expand,.product-gallery-arrow,.ruth-product-lightbox__close,.ruth-product-lightbox__zoom-controls button,.ruth-product-lightbox__zoom-stage{transition:none!important}}
`;
