"use client";

import { useEffect } from "react";

type SwipeProduct = {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
  sku?: string | null;
  product_code?: string | null;
  price?: number | string | null;
  compare_at_price?: number | string | null;
  currency?: string | null;
  stock_status?: string | null;
  main_image_url?: string | null;
  image_urls?: string[] | null;
  variants?: Array<{ sku?: string | null }> | null;
};

type SwipeWindow = {
  previous?: SwipeProduct | null;
  current?: SwipeProduct | null;
  next?: SwipeProduct | null;
};

type Direction = "next" | "previous";

const NEXT_HINT_KEY = "ruth_product_swipe_next_hint_v6_seen";
const BACK_HINT_KEY = "ruth_product_swipe_back_hint_v6_seen";
const SETTLE_MS = 330;
const SNAP_RATIO = 0.18;
const SNAP_VELOCITY = 0.38;

function currentSlug() {
  const match = window.location.pathname.match(/^\/products\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function productCode(product: SwipeProduct | null | undefined) {
  if (!product) return "";
  return clean(
    product.product_code ||
      product.variants?.find((variant) => clean(variant?.sku))?.sku ||
      product.sku,
  );
}

function productImages(product: SwipeProduct | null | undefined) {
  if (!product) return [];
  const source = product.image_urls?.length
    ? product.image_urls
    : product.main_image_url
      ? [product.main_image_url]
      : [];
  return [...new Set(source.filter((value): value is string => Boolean(value)))];
}

function localSeen(key: string) {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSeen(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Storage can be unavailable in strict privacy contexts.
  }
}

function formatTry(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
      .format(amount)
      .replace("₺", "TL")
      .replace(/\u00a0/g, " ");
  } catch {
    return `${amount.toFixed(2)} TL`;
  }
}

function createSvg(paths: string[], className: string, size = 16) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add(className);
  for (const value of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", value);
    svg.append(path);
  }
  return svg;
}

function activeGallerySnapshot() {
  const dots = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      ".product-gallery-frame.is-mobile-vertical:not(.is-lightbox) .product-gallery-progress button",
    ),
  );
  const found = dots.findIndex((dot) => dot.classList.contains("is-active"));
  const activeIndex = found >= 0 ? found : 0;
  const slides = Array.from(
    document.querySelectorAll<HTMLElement>(
      ".product-gallery-frame.is-mobile-vertical:not(.is-lightbox) .product-gallery-slide",
    ),
  );
  const image = slides[activeIndex]?.querySelector<HTMLImageElement>("img");
  return {
    activeIndex,
    imageSrc: image?.currentSrc || image?.src || "",
  };
}

function ensureLiveProductCode(product: SwipeProduct | null | undefined) {
  const code = productCode(product);
  if (!code) return;
  const title = document.querySelector<HTMLElement>(
    ".product-purchase-mobile .product-mobile-buy-row > h1",
  );
  if (!title) return;

  let mount = title.querySelector<HTMLElement>("[data-ruth-storefront-product-code]");
  if (!mount) {
    mount = document.createElement("span");
    mount.dataset.ruthStorefrontProductCode = "true";
    mount.dataset.ruthProductCodePlacement = "mobile";
    mount.className = "ruth-storefront-product-code";
    title.append(mount);
  }

  const text = `ÜRÜN KODU · ${code}`;
  if (mount.textContent !== text) mount.textContent = text;
  mount.hidden = false;
  mount.removeAttribute("aria-hidden");
}

function normalizePreviewPurchase(article: HTMLElement, product: SwipeProduct) {
  const row = article.querySelector<HTMLElement>(".product-browser-preview-buy-row");
  row?.classList.add("product-mobile-buy-row");

  const title = row?.querySelector<HTMLElement>(":scope > strong") || null;
  if (title) {
    const code = productCode(product);
    let mount = title.querySelector<HTMLElement>(".product-browser-preview-code");
    if (code && !mount) {
      mount = document.createElement("span");
      mount.className = "product-browser-preview-code";
      title.append(mount);
    }
    if (mount) {
      if (code) mount.textContent = `ÜRÜN KODU · ${code}`;
      else mount.remove();
    }
  }

  const price = article.querySelector<HTMLElement>(".product-browser-preview-price");
  if (price) {
    price.classList.add("product-mobile-price");
    const compare = price.querySelector<HTMLElement>("del");
    compare?.classList.add("product-purchase-compare");
    const value = price.querySelector<HTMLElement>(":scope > span");
    if (value) {
      if (value.querySelector("em")) {
        value.classList.remove("is-sale");
        value.classList.add("product-purchase-sale-pill");
      } else {
        value.classList.add("product-purchase-current");
      }
    }
  }

  const add = article.querySelector<HTMLElement>(".product-browser-preview-add");
  if (add) {
    add.classList.add("product-mobile-add");
    if (!add.querySelector(".product-browser-preview-bag")) {
      add.prepend(
        createSvg(
          [
            "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z",
            "M3 6h18",
            "M16 10a4 4 0 0 1-8 0",
          ],
          "product-browser-preview-bag",
        ),
      );
    }
  }
}

function ensurePreviewControls(
  article: HTMLElement,
  product: SwipeProduct,
  activeIndex: number,
) {
  const media = article.querySelector<HTMLElement>(".product-browser-preview-media");
  if (!media) return;

  let expand = media.querySelector<HTMLButtonElement>(".product-browser-preview-expand");
  if (!expand) {
    expand = document.createElement("button");
    expand.type = "button";
    expand.tabIndex = -1;
    expand.className = "product-gallery-expand product-browser-preview-expand";
    expand.setAttribute("aria-hidden", "true");
    expand.append(
      createSvg(
        ["M15 3h6v6", "m21 3-7 7", "m3 21 7-7", "M9 21H3v-6"],
        "product-browser-preview-expand-icon",
        17,
      ),
    );
    media.append(expand);
  }

  const imageCount = Math.max(1, productImages(product).length);
  let progress = media.querySelector<HTMLElement>(".product-browser-preview-progress");
  if (!progress) {
    progress = document.createElement("div");
    progress.className = "product-gallery-progress product-browser-preview-progress";
    progress.setAttribute("aria-hidden", "true");
    media.append(progress);
  }

  if (progress.childElementCount !== imageCount) {
    progress.replaceChildren();
    for (let index = 0; index < imageCount; index += 1) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.tabIndex = -1;
      progress.append(dot);
    }
  }

  const safeIndex = Math.min(activeIndex, imageCount - 1);
  Array.from(progress.children).forEach((dot, index) => {
    dot.classList.toggle("is-active", index === safeIndex);
  });
}

function ensurePreviewDetailStrip(article: HTMLElement) {
  if (article.querySelector(".product-browser-preview-detail-strip")) return;
  const purchase = article.querySelector<HTMLElement>(".product-browser-preview-purchase");
  if (!purchase) return;
  const strip = document.createElement("div");
  strip.className = "product-browser-preview-detail-strip";
  for (const label of [
    "Açıklama",
    "Materyal ve Bakım",
    "Ölçü ve Kullanım",
    "Kargo İade ve Değişim",
  ]) {
    const cell = document.createElement("span");
    cell.textContent = label;
    strip.append(cell);
  }
  purchase.before(strip);
}

function polishPreview(
  article: HTMLElement,
  product: SwipeProduct | null | undefined,
  center: boolean,
) {
  if (!product) return;
  normalizePreviewPurchase(article, product);
  ensurePreviewDetailStrip(article);

  const snapshot = center
    ? activeGallerySnapshot()
    : { activeIndex: 0, imageSrc: "" };
  const previewImage = article.querySelector<HTMLImageElement>(
    ".product-browser-preview-media > img",
  );
  if (center && snapshot.imageSrc && previewImage && previewImage.src !== snapshot.imageSrc) {
    previewImage.src = snapshot.imageSrc;
  }
  ensurePreviewControls(article, product, snapshot.activeIndex);
}

function createHint(direction: Direction) {
  const hint = document.createElement("div");
  hint.className = `ruth-product-swipe-guide is-${direction}`;
  hint.dataset.direction = direction;
  hint.setAttribute("role", "status");
  hint.setAttribute("aria-live", "polite");

  const copy = document.createElement("span");
  copy.className = "ruth-product-swipe-guide-copy";
  const kicker = document.createElement("span");
  kicker.textContent = "Ürün değiştirmek için";
  const label = document.createElement("strong");
  label.textContent = direction === "next" ? "Sola kaydır" : "Sağa kaydır";
  copy.append(kicker, label);

  const motion = document.createElement("span");
  motion.className = "ruth-product-swipe-guide-motion";
  for (let index = 0; index < 3; index += 1) {
    const chevron = document.createElement("span");
    chevron.className = "ruth-product-swipe-guide-chevron";
    motion.append(chevron);
  }

  hint.append(copy, motion);
  return hint;
}

export function ProductSwipeExperiencePolish() {
  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;

    const productCache = new Map<string, SwipeProduct>();
    let liveWindow: SwipeWindow | null = null;
    let liveWindowSlug = "";
    let request: AbortController | null = null;
    let frame = 0;
    let guide: HTMLElement | null = null;
    let forwardCompleted = false;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastAt = 0;
    let axis: "x" | "y" | null = null;
    let velocity = 0;
    let universalSwipe = false;
    let universalX = 0;

    const remember = (windowValue: SwipeWindow | null | undefined) => {
      if (!windowValue) return;
      for (const product of [windowValue.previous, windowValue.current, windowValue.next]) {
        const slug = clean(product?.slug);
        if (slug && product) productCache.set(slug, product);
      }
    };

    const removeGuide = () => {
      guide?.remove();
      guide = null;
    };

    const showGuide = (direction: Direction) => {
      const key = direction === "next" ? NEXT_HINT_KEY : BACK_HINT_KEY;
      if (localSeen(key)) return;
      removeGuide();
      guide = createHint(direction);
      document.body.append(guide);
    };

    const maybeShowInitialGuide = () => {
      if (!liveWindow?.next || localSeen(NEXT_HINT_KEY)) return;
      showGuide("next");
    };

    const apply = () => {
      frame = 0;
      document.querySelectorAll<HTMLElement>(".product-swipe-hint").forEach((node) => {
        node.style.setProperty("display", "none", "important");
      });

      const slug = currentSlug();
      if (!slug) return;
      const cached = productCache.get(slug);
      if (cached) ensureLiveProductCode(cached);

      if (!liveWindow || liveWindowSlug !== slug) return;
      ensureLiveProductCode(liveWindow.current);
      const articles = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".product-browser-track > .product-browser-preview",
        ),
      );
      const products = [liveWindow.previous, liveWindow.current, liveWindow.next];
      articles.forEach((article, index) =>
        polishPreview(article, products[index], index === 1),
      );
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    const load = async (slug: string) => {
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
          window?: SwipeWindow | null;
        };
        if (!payload.ok || !payload.window?.current) return;
        remember(payload.window);
        if (currentSlug() === slug) {
          liveWindow = payload.window;
          liveWindowSlug = slug;
          schedule();
          maybeShowInitialGuide();
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    };

    let lastSlug = "";
    const syncSlug = () => {
      const slug = currentSlug();
      if (!slug) return;
      if (slug !== lastSlug) {
        lastSlug = slug;
        const cached = productCache.get(slug);
        if (cached) ensureLiveProductCode(cached);
        if (liveWindowSlug !== slug) void load(slug);
      }
      schedule();
    };

    const setStageX = (value: number, phase: "dragging" | "settling" | "idle") => {
      const root = document.querySelector<HTMLElement>(".product-browser-root");
      const track = document.querySelector<HTMLElement>(".product-browser-track");
      if (!root || !track) return;
      track.style.setProperty("--product-browser-x", `${value}px`);
      root.dataset.browserPhase = phase;
      root.style.setProperty("--ruth-live-page-x", `${value}px`);
    };

    const resetUniversal = () => {
      universalSwipe = false;
      universalX = 0;
      pointerId = null;
      axis = null;
      const root = document.querySelector<HTMLElement>(".product-browser-root");
      root?.style.setProperty("--ruth-live-page-x", "0px");
    };

    const navigateAfterUniversalSwipe = (target: SwipeProduct, direction: Direction) => {
      const x = direction === "next" ? -window.innerWidth : window.innerWidth;
      setStageX(x, "settling");
      window.setTimeout(() => {
        markSeen(direction === "next" ? NEXT_HINT_KEY : BACK_HINT_KEY);
        removeGuide();
        window.location.assign(`/products/${encodeURIComponent(clean(target.slug))}`);
      }, SETTLE_MS);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType === "mouse") return;
      if (!currentSlug()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "button,a,input,textarea,select,details,summary,[role='tab'],[contenteditable='true'],.ruth-product-lightbox",
        )
      ) {
        return;
      }
      pointerId = event.pointerId;
      startX = lastX = event.clientX;
      startY = event.clientY;
      lastAt = performance.now();
      velocity = 0;
      axis = null;
      universalSwipe = window.scrollY > 36;
      universalX = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);

      if (!axis) {
        if (ax < 7 && ay < 7) return;
        if (ay > ax * 1.12) {
          axis = "y";
          return;
        }
        if (ax <= ay * 1.12) return;
        axis = "x";
        removeGuide();
      }

      if (axis !== "x") return;
      const now = performance.now();
      velocity = (event.clientX - lastX) / Math.max(1, now - lastAt);
      lastX = event.clientX;
      lastAt = now;

      if (!universalSwipe) return;
      const target = dx < 0 ? liveWindow?.next : liveWindow?.previous;
      universalX = target ? dx : dx * 0.16;
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
      setStageX(universalX, "dragging");
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      const wasHorizontal = axis === "x";
      const wasUniversal = universalSwipe;
      const x = universalX;
      const direction: Direction = x < 0 ? "next" : "previous";
      const target = direction === "next" ? liveWindow?.next : liveWindow?.previous;
      const accepted =
        wasHorizontal &&
        wasUniversal &&
        Boolean(target) &&
        (Math.abs(x) / Math.max(1, window.innerWidth) > SNAP_RATIO ||
          Math.abs(velocity) > SNAP_VELOCITY);

      if (wasUniversal && wasHorizontal) {
        event.stopImmediatePropagation();
        if (accepted && target) {
          navigateAfterUniversalSwipe(target, direction);
        } else {
          setStageX(0, "settling");
          window.setTimeout(() => setStageX(0, "idle"), SETTLE_MS);
        }
      } else if (wasHorizontal) {
        const intended: Direction = event.clientX - startX < 0 ? "next" : "previous";
        markSeen(intended === "next" ? NEXT_HINT_KEY : BACK_HINT_KEY);
        removeGuide();
        if (intended === "next") forwardCompleted = true;
      }

      resetUniversal();
    };

    const observer = new MutationObserver(syncSlug);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "data-browser-phase"],
    });

    const onHistory = () => {
      const slug = currentSlug();
      if (!slug) return;
      if (forwardCompleted && !localSeen(BACK_HINT_KEY)) {
        window.setTimeout(() => showGuide("previous"), 80);
        forwardCompleted = false;
      }
      syncSlug();
    };

    const originalPushState = window.history.pushState.bind(window.history);
    window.history.pushState = function pushState(data, unused, url) {
      const result = originalPushState(data, unused, url);
      window.dispatchEvent(new Event("ruth:product-history-change"));
      return result;
    };

    const interval = window.setInterval(syncSlug, 300);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
    window.addEventListener("pageshow", syncSlug);
    window.addEventListener("popstate", onHistory);
    window.addEventListener("ruth:product-history-change", onHistory);
    syncSlug();

    return () => {
      observer.disconnect();
      request?.abort();
      removeGuide();
      window.clearInterval(interval);
      window.history.pushState = originalPushState;
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
      window.removeEventListener("pageshow", syncSlug);
      window.removeEventListener("popstate", onHistory);
      window.removeEventListener("ruth:product-history-change", onHistory);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <style>{`
      @media (max-width: 767px) {
        .product-swipe-hint { display: none !important; }

        .ruth-product-swipe-guide {
          position: fixed !important;
          top: 50% !important;
          z-index: 119 !important;
          display: grid !important;
          width: 150px !important;
          gap: 3px !important;
          padding: 0 !important;
          border: 0 !important;
          background: transparent !important;
          box-shadow: none !important;
          color: #211912 !important;
          pointer-events: none !important;
          transform: translateY(-50%) !important;
        }

        .ruth-product-swipe-guide.is-next {
          right: max(15px, env(safe-area-inset-right)) !important;
          justify-items: end !important;
          text-align: right !important;
        }

        .ruth-product-swipe-guide.is-previous {
          left: max(15px, env(safe-area-inset-left)) !important;
          justify-items: start !important;
          text-align: left !important;
        }

        .ruth-product-swipe-guide-copy {
          display: grid !important;
          gap: 1px !important;
          white-space: nowrap !important;
        }

        .ruth-product-swipe-guide-copy > span {
          color: color-mix(in srgb, #211912 62%, transparent) !important;
          font-family: var(--ruth-font-body) !important;
          font-size: 9.5px !important;
          font-weight: 500 !important;
          line-height: 1.2 !important;
          letter-spacing: .025em !important;
        }

        .ruth-product-swipe-guide-copy > strong {
          color: #211912 !important;
          font-family: var(--ruth-font-body) !important;
          font-size: 12px !important;
          font-weight: 650 !important;
          line-height: 1.2 !important;
          letter-spacing: .01em !important;
        }

        .ruth-product-swipe-guide-motion {
          position: relative !important;
          display: block !important;
          width: 2.1rem !important;
          height: 5.4rem !important;
          margin-top: -22px !important;
          transform-origin: center center !important;
        }

        .ruth-product-swipe-guide.is-next .ruth-product-swipe-guide-motion {
          margin-right: 24px !important;
          transform: rotate(90deg) !important;
        }

        .ruth-product-swipe-guide.is-previous .ruth-product-swipe-guide-motion {
          margin-left: 24px !important;
          transform: rotate(-90deg) !important;
        }

        /*
         * Pure CSS Scroll Animation Arrow by Jakub Honisek
         * https://codepen.io/JakubHonisek/pen/qjpeeO
         * Chevron geometry, delays and keyframe percentages are kept intact.
         * The wrapper is only rotated to map the original vertical motion to
         * horizontal product navigation.
         */
        .ruth-product-swipe-guide-chevron {
          position: absolute !important;
          width: 2.1rem !important;
          height: .48rem !important;
          opacity: 0;
          transform: scale(.3);
          animation: ruth-product-guide-chevron 3s ease-out infinite !important;
        }

        .ruth-product-swipe-guide-chevron:first-child {
          animation: ruth-product-guide-chevron 3s ease-out 1s infinite !important;
        }

        .ruth-product-swipe-guide-chevron:nth-child(2) {
          animation: ruth-product-guide-chevron 3s ease-out 2s infinite !important;
        }

        .ruth-product-swipe-guide-chevron::before,
        .ruth-product-swipe-guide-chevron::after {
          content: "" !important;
          position: absolute !important;
          top: 0 !important;
          width: 50% !important;
          height: 100% !important;
          background: currentColor !important;
        }

        .ruth-product-swipe-guide-chevron::before {
          left: 0 !important;
          transform: skewY(30deg) !important;
        }

        .ruth-product-swipe-guide-chevron::after {
          right: 0 !important;
          width: 50% !important;
          transform: skewY(-30deg) !important;
        }

        .product-browser-preview-media { position: relative !important; }
        .product-browser-preview-media > img {
          padding: 0 !important;
          object-fit: contain !important;
          object-position: center center !important;
        }

        .product-browser-preview-purchase {
          box-shadow: 0 -18px 48px rgba(33,25,18,.16) !important;
        }

        .product-browser-preview-buy-row > strong {
          display: block !important;
          min-width: 0 !important;
          margin: 0 !important;
          overflow: hidden !important;
          font-size: clamp(.9rem,4.1vw,1.08rem) !important;
          font-weight: 500 !important;
          line-height: 1.2 !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }

        .product-browser-preview-code {
          display: block !important;
          width: max-content !important;
          max-width: 100% !important;
          margin: 3px 0 0 !important;
          overflow: hidden !important;
          color: var(--muted-foreground) !important;
          font-family: var(--font-body) !important;
          font-size: 7.5px !important;
          font-weight: 500 !important;
          line-height: 1.15 !important;
          letter-spacing: .09em !important;
          text-overflow: ellipsis !important;
          text-transform: uppercase !important;
          white-space: nowrap !important;
        }

        .product-browser-preview-add {
          gap: 9px !important;
          border: 1px solid var(--ink) !important;
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
          border-radius: 50% !important;
          box-shadow: none !important;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }

        .product-browser-preview-progress {
          top: 50% !important;
          right: 10px !important;
          bottom: auto !important;
          flex-direction: column !important;
          padding: 9px 8px !important;
          transform: translateY(-50%) !important;
          box-shadow: none !important;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }

        .product-browser-preview-detail-strip {
          position: absolute !important;
          right: 0 !important;
          bottom: calc(128px + env(safe-area-inset-bottom)) !important;
          left: 0 !important;
          z-index: 3 !important;
          display: grid !important;
          grid-template-columns: repeat(4,minmax(0,1fr)) !important;
          height: 16px !important;
          overflow: hidden !important;
          border-top: 1px solid rgba(184,151,106,.22) !important;
          border-bottom: 1px solid rgba(184,151,106,.22) !important;
          background: var(--cream) !important;
        }

        .product-browser-preview-detail-strip span {
          border-right: 1px solid rgba(184,151,106,.18) !important;
          color: transparent !important;
          font-size: 0 !important;
        }

        .product-browser-preview-detail-strip span:last-child {
          border-right: 0 !important;
        }

        .product-browser-root[data-browser-phase="dragging"] .product-detail-page,
        .product-browser-root[data-browser-phase="settling"] .product-detail-page {
          transform: translate3d(var(--ruth-live-page-x,0px),0,0) !important;
          will-change: transform !important;
        }

        .product-browser-root[data-browser-phase="settling"] .product-detail-page {
          transition: transform ${SETTLE_MS}ms cubic-bezier(.22,1,.36,1) !important;
        }
      }

      @keyframes ruth-product-guide-chevron {
        25% { opacity: 1; }
        33.3% { opacity: 1; transform: translateY(2.28rem); }
        66.6% { opacity: 1; transform: translateY(3.12rem); }
        100% { opacity: 0; transform: translateY(4.8rem) scale(.5); }
      }

      @media (max-width: 767px) and (prefers-reduced-motion: reduce) {
        .ruth-product-swipe-guide-chevron { animation: none !important; opacity: .9 !important; }
      }
    `}</style>
  );
}
