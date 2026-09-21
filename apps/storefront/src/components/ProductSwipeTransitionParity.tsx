"use client";

import { useEffect } from "react";

type PreviewProduct = {
  slug?: string | null;
  main_image_url?: string | null;
  image_urls?: string[] | null;
};

type PreviewWindow = {
  previous?: PreviewProduct | null;
  current?: PreviewProduct | null;
  next?: PreviewProduct | null;
};

function currentSlug() {
  const match = window.location.pathname.match(/^\/products\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function primaryPreviewImage(product: PreviewProduct | null | undefined) {
  if (!product) return "";
  // Match ProductGallery exactly: image_urls is the gallery source of truth;
  // main_image_url is only the fallback when the gallery array is empty.
  return product.image_urls?.find(Boolean) || product.main_image_url || "";
}

function createPreviewImage(src: string) {
  const image = document.createElement("img");
  image.src = src;
  image.alt = "";
  image.loading = "eager";
  image.decoding = "async";
  image.fetchPriority = "high";
  image.draggable = false;
  return image;
}

function bindPreviewImage(
  preview: HTMLElement,
  product: PreviewProduct | null | undefined,
  forcedSrc = "",
) {
  if (!product) return;
  const media = preview.querySelector<HTMLElement>(".product-browser-preview-media");
  if (!media) return;

  const desiredSrc = forcedSrc || primaryPreviewImage(product);
  if (!desiredSrc) return;

  const desiredSlug = String(product.slug || "");
  const current = media.querySelector<HTMLImageElement>(":scope > img");
  const currentAttr = current?.getAttribute("src") || "";
  const productChanged = preview.dataset.ruthPreviewSlug !== desiredSlug;

  // Safari can keep the decoded bitmap from the product that previously
  // occupied this preview slot. A fresh img node guarantees that a target
  // product never paints the current product photo during the next swipe.
  if (!current || productChanged || currentAttr !== desiredSrc) {
    const replacement = createPreviewImage(desiredSrc);
    if (current) current.replaceWith(replacement);
    else media.prepend(replacement);
  }

  preview.dataset.ruthPreviewSlug = desiredSlug;
}

function createBagIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("product-browser-preview-bag");

  for (const value of [
    "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z",
    "M3 6h18",
    "M16 10a4 4 0 0 1-8 0",
  ]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", value);
    svg.append(path);
  }

  return svg;
}

export function ProductSwipeTransitionParity() {
  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;

    let frame = 0;
    let windowSlug = "";
    let previewWindow: PreviewWindow | null = null;
    let request: AbortController | null = null;

    const warmImages = (value: PreviewWindow | null) => {
      if (!value) return;
      for (const product of [value.previous, value.current, value.next]) {
        const src = primaryPreviewImage(product);
        if (!src) continue;
        const image = new window.Image();
        image.decoding = "async";
        image.fetchPriority = "high";
        image.src = src;
        void image.decode().catch(() => undefined);
      }
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };

    const loadWindow = async (slug: string) => {
      if (!slug || slug === windowSlug) return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch(
          `/api/products/${encodeURIComponent(slug)}/browser-window`,
          {
            credentials: "same-origin",
            cache: "force-cache",
            signal: controller.signal,
            headers: { Accept: "application/json" },
          },
        );
        if (!response.ok) return;
        const payload = (await response.json()) as {
          ok?: boolean;
          window?: PreviewWindow | null;
        };
        if (!payload.ok || !payload.window?.current) return;
        if (currentSlug() !== slug) return;
        windowSlug = slug;
        previewWindow = payload.window;
        warmImages(previewWindow);
        schedule();
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    };

    const sync = () => {
      frame = 0;
      const root = document.querySelector<HTMLElement>(".product-browser-root");
      if (!root) return;

      const slug = currentSlug();
      if (slug && slug !== windowSlug) void loadWindow(slug);

      const liveFrame = document.querySelector<HTMLElement>(
        ".product-gallery-frame.is-mobile-vertical:not(.is-lightbox)",
      );
      const livePurchase = document.querySelector<HTMLElement>(".product-purchase-mobile");
      const liveImage = liveFrame?.querySelector<HTMLImageElement>(
        ".product-gallery-slide .product-gallery-image img",
      );

      if (liveFrame) {
        const rect = liveFrame.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          root.style.setProperty("--ruth-swipe-media-width", `${rect.width}px`);
          root.style.setProperty("--ruth-swipe-media-height", `${rect.height}px`);
        }
      }

      if (livePurchase) {
        const rect = livePurchase.getBoundingClientRect();
        if (rect.height > 0) {
          root.style.setProperty("--ruth-swipe-purchase-height", `${rect.height}px`);
        }
      }

      document
        .querySelectorAll<HTMLElement>(".product-browser-preview-detail-strip")
        .forEach((node) => node.remove());

      const previews = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".product-browser-track > .product-browser-preview",
        ),
      );
      const products = previewWindow
        ? [previewWindow.previous, previewWindow.current, previewWindow.next]
        : [null, null, null];

      previews.forEach((preview, index) => {
        preview
          .querySelector<HTMLElement>(".product-browser-preview-details")
          ?.setAttribute("aria-hidden", "true");

        const row = preview.querySelector<HTMLElement>(
          ".product-browser-preview-buy-row",
        );
        row?.classList.add("product-mobile-buy-row");

        const price = preview.querySelector<HTMLElement>(
          ".product-browser-preview-price",
        );
        price?.classList.add("product-mobile-price");
        price
          ?.querySelector<HTMLElement>("del")
          ?.classList.add("product-purchase-compare");

        const priceValue = price?.querySelector<HTMLElement>(":scope > span");
        if (priceValue) {
          if (priceValue.querySelector("em")) {
            priceValue.classList.remove("is-sale");
            priceValue.classList.add("product-purchase-sale-pill");
          } else {
            priceValue.classList.add("product-purchase-current");
          }
        }

        const add = preview.querySelector<HTMLElement>(
          ".product-browser-preview-add",
        );
        if (add) {
          add.classList.add("product-mobile-add");
          if (!add.querySelector(".product-browser-preview-bag")) {
            add.prepend(createBagIcon());
          }
        }

        const targetProduct = products[index];
        if (targetProduct) {
          const liveSrc =
            index === 1 && liveImage ? liveImage.currentSrc || liveImage.src : "";
          bindPreviewImage(preview, targetProduct, liveSrc);
        }
      });
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-browser-phase", "class", "src"],
    });

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("popstate", schedule);
    window.addEventListener("ruth:product-history-change", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    schedule();

    return () => {
      observer.disconnect();
      request?.abort();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("popstate", schedule);
      window.removeEventListener("ruth:product-history-change", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <style>{`
      @media (max-width: 767px) {
        html.ruth-product-page-active body.site-app-shell
          .product-gallery-frame.is-mobile-vertical:not(.is-lightbox),
        html.ruth-product-page-active body.site-app-shell
          .product-browser-preview-media {
          width: var(--ruth-swipe-media-width, 100vw) !important;
          height: var(--ruth-swipe-media-height, 133.333333vw) !important;
          min-height: var(--ruth-swipe-media-height, 133.333333vw) !important;
          max-height: var(--ruth-swipe-media-height, 133.333333vw) !important;
          aspect-ratio: 3 / 4 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: var(--ruth-product-media-top, var(--cream)) !important;
        }

        html.ruth-product-page-active body.site-app-shell
          .product-gallery-frame.is-mobile-vertical:not(.is-lightbox)
          .product-gallery-image,
        html.ruth-product-page-active body.site-app-shell
          .product-gallery-frame.is-mobile-vertical:not(.is-lightbox)
          .product-gallery-image img,
        html.ruth-product-page-active body.site-app-shell
          .product-browser-preview-media > img {
          box-sizing: border-box !important;
          display: block !important;
          width: 100% !important;
          height: 100% !important;
          min-width: 100% !important;
          min-height: 100% !important;
          max-width: none !important;
          max-height: none !important;
          margin: 0 !important;
          padding: 0 !important;
          object-fit: cover !important;
          object-position: center center !important;
          transform: none !important;
          translate: none !important;
          -webkit-transform: none !important;
        }

        .product-browser-preview-details,
        .product-browser-preview-detail-strip {
          display: none !important;
          visibility: hidden !important;
        }

        .product-browser-preview {
          height: 100dvh !important;
          min-height: 100dvh !important;
          background: var(--cream) !important;
        }

        .product-browser-track,
        .product-browser-stage {
          height: 100dvh !important;
          min-height: 100dvh !important;
        }

        .product-browser-preview-purchase {
          position: absolute !important;
          z-index: 118 !important;
          right: 0 !important;
          bottom: 0 !important;
          left: 0 !important;
          display: block !important;
          width: 100% !important;
          min-height: var(--ruth-swipe-purchase-height, auto) !important;
          border-top: 1px solid rgba(184,151,106,.3) !important;
          background: var(--cream) !important;
          box-shadow: 0 -18px 48px rgba(33,25,18,.16) !important;
          padding-bottom: env(safe-area-inset-bottom) !important;
          opacity: 1 !important;
          visibility: visible !important;
          transform: none !important;
          -webkit-transform: none !important;
          backface-visibility: hidden !important;
          -webkit-backface-visibility: hidden !important;
          contain: layout paint !important;
          isolation: isolate !important;
        }

        .product-browser-preview-buy-row,
        .product-browser-preview-buy-row.product-mobile-buy-row {
          display: flex !important;
          min-height: 58px !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 12px !important;
          padding: 15px 18px 10px !important;
        }

        .product-browser-preview-buy-row > strong {
          display: block !important;
          min-width: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
          color: var(--ink) !important;
          font-family: var(--font-body) !important;
          font-size: clamp(.9rem,4.1vw,1.08rem) !important;
          font-weight: 500 !important;
          line-height: 1.2 !important;
          letter-spacing: normal !important;
          text-overflow: ellipsis !important;
          text-transform: none !important;
          white-space: nowrap !important;
        }

        .product-browser-preview-price,
        .product-browser-preview-price.product-mobile-price {
          display: flex !important;
          flex-shrink: 0 !important;
          align-items: center !important;
          justify-content: flex-end !important;
          gap: 6px !important;
          font-size: 13px !important;
        }

        .product-browser-preview-price .product-purchase-compare {
          font-size: 8.5px !important;
        }

        .product-browser-preview-price .product-purchase-sale-pill {
          display: inline-flex !important;
          align-items: center !important;
          gap: 5px !important;
          border-radius: 2px !important;
          background: #b40016 !important;
          padding: 5px 6px !important;
          color: #fff !important;
          line-height: 1 !important;
        }

        .product-browser-preview-price .product-purchase-sale-pill strong {
          font-size: 11px !important;
          font-weight: 600 !important;
        }

        .product-browser-preview-price .product-purchase-sale-pill em {
          font-size: 7px !important;
          font-style: normal !important;
          letter-spacing: .02em !important;
        }

        .product-browser-preview-add,
        .product-browser-preview-add.product-mobile-add {
          display: flex !important;
          width: calc(100% - 36px) !important;
          min-height: 56px !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 9px !important;
          margin: 0 18px 14px !important;
          border: 1px solid var(--ink) !important;
          background: var(--ink) !important;
          color: var(--cream) !important;
          font-size: 10px !important;
          font-weight: 400 !important;
          letter-spacing: .19em !important;
          line-height: normal !important;
          text-transform: uppercase !important;
        }

        .product-browser-preview-bag {
          width: 16px !important;
          height: 16px !important;
          flex: 0 0 16px !important;
        }

        .product-browser-preview-expand {
          top: calc(72px + env(safe-area-inset-top)) !important;
          right: 12px !important;
          width: 40px !important;
          height: 40px !important;
        }

        .product-browser-preview-progress {
          top: 50% !important;
          right: 10px !important;
          bottom: auto !important;
          transform: translateY(-50%) !important;
        }

        .product-browser-root:is(
          [data-browser-phase="dragging"],
          [data-browser-phase="settling"],
          [data-browser-phase="handoff"]
        ) .product-detail-page {
          transform: none !important;
          -webkit-transform: none !important;
          transition: none !important;
        }
      }
    `}</style>
  );
}
