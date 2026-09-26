"use client";

import { ArrowLeftRight, RefreshCw, Shield, Truck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ruthMotion } from "@ruth-commerce/ui/motion";
import { ProductGallery } from "@/components/product/ProductGallery";
import {
  ProductPurchasePanel,
  type ProductDetailItem,
} from "@/components/product/ProductPurchasePanel";
import { ProductRecommendations } from "@/components/product/ProductRecommendations";
import { ProductReviewsSection } from "@/components/reviews/ProductReviewsSection";
import { formatPrice } from "@/lib/formatPrice";
import {
  cleanedProductDescription,
  displayCollectionName,
  displayMaterial,
  productCareDetails,
  productMaterialDetails,
} from "@/lib/productDisplay";
import { productPrimaryDetailImageSrc } from "@/lib/productDisplayImage";
import type { Product } from "@/types/site";

export type ProductBrowserWindow = {
  previous: Product | null;
  current: Product;
  next: Product | null;
  source?: "live" | "static";
};

type BrowserLinks = {
  previousSlug: string | null;
  nextSlug: string | null;
};

type Direction = "previous" | "next";
type BrowserPhase = "idle" | "dragging" | "settling" | "handoff";

type GestureState = {
  active: boolean;
  axis: "x" | "y" | null;
  pointerId: number | null;
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
  currentX: number;
  velocity: number;
};

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
      options?: { timeout?: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

const SETTLE_MS = 330;
const SNAP_DISTANCE_RATIO = 0.18;
const SNAP_VELOCITY = 0.38;
const EDGE_RESISTANCE = 0.16;
const IMAGE_WAIT_MS = 650;
const MAX_PRODUCT_CACHE = 9;
const MAX_IMAGE_CACHE = 6;
const PRODUCT_SWIPE_HINT_STORAGE_KEY = "rosta_product_swipe_hint_seen_v1";
const PRODUCT_SWIPE_HINT_VISIBLE_MS = 5_000;

function emptyGesture(): GestureState {
  return {
    active: false,
    axis: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastTime: 0,
    currentX: 0,
    velocity: 0,
  };
}

function cleanLine(text: string | null | undefined) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function productImages(product: Product) {
  const source = product.image_urls?.length
    ? product.image_urls
    : product.main_image_url
      ? [product.main_image_url]
      : [];
  return [...new Set(source.filter((value): value is string => Boolean(value)))];
}

function firstImage(product: Product | null | undefined) {
  if (!product) return null;
  return product.main_image_url || product.image_urls?.[0] || null;
}

function productDetails(product: Product): ProductDetailItem[] {
  const beanType = cleanLine(
    product.material || productMaterialDetails(product) || displayMaterial(product),
  );
  const roastProfile = cleanLine(product.finish_color);
  const description =
    cleanLine(cleanedProductDescription(product)) ||
    "ROSTA Coffee Co. ürünü.";
  const careDetails = cleanLine(product.care_advice || productCareDetails(product));
  const packageUsage = cleanLine(product.size_usage);

  return [
    { id: "description", label: "Açıklama", content: description },
    {
      id: "material",
      label: "Ürün Bilgisi",
      content: [
        "ÇEKİRDEK TÜRÜ",
        beanType || "Belirtilmedi",
        "",
        "KAVRUM PROFİLİ",
        roastProfile || "Belirtilmedi",
      ].join("\n"),
    },
    {
      id: "size-usage",
      label: "Paket / Kullanım",
      content: [
        packageUsage ? "PAKET / GRAMAJ" : null,
        packageUsage || null,
        packageUsage && careDetails ? "" : null,
        careDetails ? "SAKLAMA / KULLANIM" : null,
        careDetails || null,
      ].filter((value): value is string => Boolean(value)).join("\n") ||
        "Paket ve kullanım bilgisi ürün bazında değişebilir.",
    },
    {
      id: "shipping-returns",
      label: "Kargo ve İade",
      content:
        "Teslimat ve iade koşulları sipariş ve ürün tipine göre uygulanır. Güncel detaylar için kargo ve iade sayfasını inceleyebilirsiniz.",
    },
  ];}

function prefersReducedPreload() {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike })
    .connection;
  return Boolean(
    connection?.saveData ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g",
  );
}

function eligibleSwipeTarget(target: EventTarget | null) {
  if (!(target instanceof Element) || window.scrollY > 36) return false;
  return !target.closest(
    ".product-gallery-lightbox,[data-product-browser-ignore],button,a,input,textarea,select,details,summary,[role='tab'],[contenteditable='true']",
  );
}

function ProductBrowserPreview({ product }: { product: Product | null }) {
  if (!product) return <article className="product-browser-preview is-empty" />;

  const price = Number(product.price || 0);
  const compareAt = Number(product.compare_at_price || 0);
  const hasDiscount = Number.isFinite(compareAt) && compareAt > price && price > 0;
  const discountPercentage = hasDiscount
    ? Math.max(1, Math.round(((compareAt - price) / compareAt) * 100))
    : 0;
  const image = productPrimaryDetailImageSrc(product) || firstImage(product);

  return (
    <article className="product-browser-preview">
      <div className="product-browser-preview-media">
        {image ? (
          <img
            src={image}
            alt=""
            loading="eager"
            decoding="async"
            fetchPriority="low"
            draggable={false}
          />
        ) : null}
      </div>
      <section className="product-browser-preview-details">
        <div className="product-browser-preview-tabs">
          <span>Açıklama</span>
          <span>Ürün Bilgisi</span>
          <span>Paket / Kullanım</span>
          <span>Kargo ve İade</span>
        </div>
        <div className="product-browser-preview-copy">
          <small>
            {displayCollectionName(product.collections?.name) || "ROSTA Coffee Co."}
          </small>
          <p>Ürün detayları ve kullanım bilgileri</p>
        </div>
      </section>
      <aside className="product-browser-preview-purchase">
        <div className="product-browser-preview-buy-row">
          <strong>{product.name}</strong>
          <div className="product-browser-preview-price">
            {hasDiscount ? <del>{formatPrice(compareAt, product.currency || "TRY")}</del> : null}
            <span className={hasDiscount ? "is-sale" : ""}>
              {formatPrice(price, product.currency || "TRY")}
              {hasDiscount ? <em>-%{discountPercentage}</em> : null}
            </span>
          </div>
        </div>
        <div className="product-browser-preview-add">
          {product.stock_status === "out_of_stock" ? "Stokta Yok" : "Sepete Ekle"}
        </div>
      </aside>
    </article>
  );
}

export function ProductDetailExperience({
  initialWindow,
}: {
  initialWindow: ProductBrowserWindow;
}) {
  const initialProducts = [
    initialWindow.previous,
    initialWindow.current,
    initialWindow.next,
  ].filter((product): product is Product => Boolean(product));

  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const visualFrameRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const gestureRef = useRef<GestureState>(emptyGesture());
  const phaseRef = useRef<BrowserPhase>("idle");
  const pendingXRef = useRef(0);
  const browserWindowRef = useRef(initialWindow);
  const productCacheRef = useRef(
    new Map(initialProducts.map((product) => [product.slug, product])),
  );
  const linkCacheRef = useRef(
    new Map<string, BrowserLinks>([
      [
        initialWindow.current.slug,
        {
          previousSlug: initialWindow.previous?.slug || null,
          nextSlug: initialWindow.next?.slug || null,
        },
      ],
    ]),
  );
  const pendingWindowRef = useRef<Map<string, Promise<ProductBrowserWindow | null>>>(
    new Map(),
  );
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [browserWindow, setBrowserWindow] = useState(initialWindow);

  const putProduct = useCallback((product: Product | null) => {
    if (!product) return;
    const cache = productCacheRef.current;
    cache.delete(product.slug);
    cache.set(product.slug, product);
    while (cache.size > MAX_PRODUCT_CACHE) {
      const oldest = cache.keys().next().value as string | undefined;
      if (!oldest) break;
      cache.delete(oldest);
    }
  }, []);

  const rememberWindow = useCallback(
    (value: ProductBrowserWindow) => {
      putProduct(value.previous);
      putProduct(value.current);
      putProduct(value.next);
      linkCacheRef.current.set(value.current.slug, {
        previousSlug: value.previous?.slug || null,
        nextSlug: value.next?.slug || null,
      });
      return value;
    },
    [putProduct],
  );

  const materializeWindow = useCallback(
    (slug: string, fallbackDirection?: Direction): ProductBrowserWindow | null => {
      const current = productCacheRef.current.get(slug);
      if (!current) return null;
      const links = linkCacheRef.current.get(slug);
      const liveWindow = browserWindowRef.current;
      let previous = links?.previousSlug
        ? productCacheRef.current.get(links.previousSlug) || null
        : null;
      let next = links?.nextSlug
        ? productCacheRef.current.get(links.nextSlug) || null
        : null;

      if (!links && fallbackDirection === "next") previous = liveWindow.current;
      if (!links && fallbackDirection === "previous") next = liveWindow.current;
      if (previous?.id === current.id) previous = null;
      if (next?.id === current.id) next = null;
      return { previous, current, next };
    },
    [],
  );

  const preloadImage = useCallback((product: Product | null) => {
    if (!product) return;
    const url = productPrimaryDetailImageSrc(product) || firstImage(product);
    if (!url || imageCacheRef.current.has(url)) return;
    const image = new window.Image();
    image.decoding = "async";
    image.fetchPriority = "low";
    image.src = url;
    imageCacheRef.current.set(url, image);
    void image.decode().catch(() => undefined);
    while (imageCacheRef.current.size > MAX_IMAGE_CACHE) {
      const oldest = imageCacheRef.current.keys().next().value as string | undefined;
      if (!oldest) break;
      imageCacheRef.current.delete(oldest);
    }
  }, []);

  const fetchWindow = useCallback(
    (slug: string, signal?: AbortSignal) => {
      const cached = materializeWindow(slug);
      if (cached && linkCacheRef.current.has(slug)) return Promise.resolve(cached);
      const pending = pendingWindowRef.current.get(slug);
      if (pending) return pending;

      const request = fetch(
        `/api/products/${encodeURIComponent(slug)}/browser-window`,
        {
          credentials: "same-origin",
          cache: "force-cache",
          signal,
          headers: { Accept: "application/json" },
        },
      )
        .then(async (response) => {
          if (!response.ok) return null;
          const payload = (await response.json()) as {
            ok?: boolean;
            window?: ProductBrowserWindow;
          };
          if (!payload.ok || !payload.window?.current) return null;
          return rememberWindow(payload.window);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return null;
          return null;
        })
        .finally(() => pendingWindowRef.current.delete(slug));

      pendingWindowRef.current.set(slug, request);
      return request;
    },
    [materializeWindow, rememberWindow],
  );

  useEffect(() => {
    browserWindowRef.current = browserWindow;
    rememberWindow(browserWindow);
    document.title = `${browserWindow.current.name} | ROSTA Coffee`;
  }, [browserWindow, rememberWindow]);

  useEffect(() => {
    if (
      !window.matchMedia("(max-width: 767px)").matches ||
      (!initialWindow.previous && !initialWindow.next)
    ) {
      return;
    }

    try {
      if (window.localStorage.getItem(PRODUCT_SWIPE_HINT_STORAGE_KEY) === "1") {
        return;
      }
      window.localStorage.setItem(PRODUCT_SWIPE_HINT_STORAGE_KEY, "1");
    } catch {
      // Storage can be unavailable in strict privacy contexts; show for this mount.
    }

    setShowSwipeHint(true);
    const hideTimer = window.setTimeout(
      () => setShowSwipeHint(false),
      PRODUCT_SWIPE_HINT_VISIBLE_MS,
    );
    return () => window.clearTimeout(hideTimer);
  }, [initialWindow.next, initialWindow.previous]);

  useEffect(() => {
    const controller = new AbortController();
    const host = window as IdleWindow;
    let timeoutHandle: number | null = null;
    let idleHandle: number | null = null;
    let cancelled = false;

    const warm = async () => {
      const current = browserWindowRef.current;
      preloadImage(current.previous);
      preloadImage(current.next);
      const neighbors = [current.next, current.previous].filter(
        (product): product is Product => Boolean(product),
      );

      for (const neighbor of neighbors) {
        if (cancelled) return;
        const loaded = await fetchWindow(neighbor.slug, controller.signal);
        if (!loaded || cancelled || prefersReducedPreload()) continue;
        const far =
          neighbor.slug === current.next?.slug ? loaded.next : loaded.previous;
        preloadImage(far);
      }
    };

    if (host.requestIdleCallback) {
      idleHandle = host.requestIdleCallback(() => void warm(), { timeout: 900 });
    } else {
      timeoutHandle = window.setTimeout(() => void warm(), 120);
    }

    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
      if (idleHandle !== null) host.cancelIdleCallback?.(idleHandle);
    };
  }, [browserWindow.current.slug, fetchWindow, preloadImage]);

  const setPhase = useCallback((phase: BrowserPhase) => {
    phaseRef.current = phase;
    if (rootRef.current) rootRef.current.dataset.browserPhase = phase;
  }, []);

  const flushVisual = useCallback(() => {
    visualFrameRef.current = null;
    trackRef.current?.style.setProperty(
      "--product-browser-x",
      `${pendingXRef.current}px`,
    );
  }, []);

  const setVisualX = useCallback(
    (value: number) => {
      pendingXRef.current = value;
      if (visualFrameRef.current !== null) return;
      visualFrameRef.current = window.requestAnimationFrame(flushVisual);
    },
    [flushVisual],
  );

  const resetVisuals = useCallback(() => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    gestureRef.current = emptyGesture();
    setVisualX(0);
    setPhase("idle");
  }, [setPhase, setVisualX]);

  const waitForProductImage = useCallback(
    (product: Product) => {
      const url = productPrimaryDetailImageSrc(product) || firstImage(product);
      if (!url) return Promise.resolve();
      preloadImage(product);
      const image = imageCacheRef.current.get(url);
      if (image?.complete) return Promise.resolve();

      return new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        image?.addEventListener("load", finish, { once: true });
        image?.addEventListener("error", finish, { once: true });
        window.setTimeout(finish, IMAGE_WAIT_MS);
      });
    },
    [preloadImage],
  );

  const commitProduct = useCallback(
    async (target: Product, direction: Direction, pushHistory = true) => {
      const nextWindow =
        materializeWindow(target.slug, direction) ||
        ({
          previous: direction === "next" ? browserWindowRef.current.current : null,
          current: target,
          next: direction === "previous" ? browserWindowRef.current.current : null,
        } satisfies ProductBrowserWindow);

      await waitForProductImage(target);
      flushSync(() => setBrowserWindow(nextWindow));
      browserWindowRef.current = nextWindow;
      if (pushHistory) {
        window.history.pushState(
          { ruthProductSlug: target.slug },
          "",
          `/products/${target.slug}`,
        );
      }
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      setVisualX(0);
      setPhase("handoff");
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setPhase("idle"));
      });
    },
    [materializeWindow, setPhase, setVisualX, waitForProductImage],
  );

  useEffect(() => {
    const onPopState = () => {
      const slug = decodeURIComponent(
        window.location.pathname.split("/").filter(Boolean).pop() || "",
      );
      if (!slug || slug === browserWindowRef.current.current.slug) return;
      const nextWindow = materializeWindow(slug);
      if (!nextWindow) {
        window.location.reload();
        return;
      }
      flushSync(() => setBrowserWindow(nextWindow));
      browserWindowRef.current = nextWindow;
      resetVisuals();
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [materializeWindow, resetVisuals]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const releaseCapture = (pointerId: number | null) => {
      if (pointerId === null) return;
      try {
        if (root.hasPointerCapture(pointerId)) root.releasePointerCapture(pointerId);
      } catch {
        // Pointer may already have been released by the browser.
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (
        phaseRef.current !== "idle" ||
        !event.isPrimary ||
        (event.pointerType === "mouse" && event.button !== 0) ||
        !window.matchMedia("(max-width: 767px)").matches ||
        !eligibleSwipeTarget(event.target)
      ) {
        return;
      }

      gestureRef.current = {
        active: true,
        axis: null,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastTime: performance.now(),
        currentX: 0,
        velocity: 0,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (
        !gesture.active ||
        gesture.pointerId === null ||
        event.pointerId !== gesture.pointerId
      ) {
        return;
      }

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      const absoluteX = Math.abs(deltaX);
      const absoluteY = Math.abs(deltaY);

      if (!gesture.axis) {
        if (absoluteX < 6 && absoluteY < 6) return;

        if (absoluteY > absoluteX * 1.12) {
          releaseCapture(gesture.pointerId);
          gestureRef.current = emptyGesture();
          return;
        }

        if (absoluteX <= absoluteY * 1.12) return;

        gesture.axis = "x";
        setShowSwipeHint(false);
        setPhase("dragging");
        try {
          root.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is an optimization, not a requirement.
        }
      }

      if (gesture.axis !== "x") return;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();

      const now = performance.now();
      const elapsed = Math.max(1, now - gesture.lastTime);
      gesture.velocity = (event.clientX - gesture.lastX) / elapsed;
      gesture.lastX = event.clientX;
      gesture.lastTime = now;

      const target =
        deltaX < 0
          ? browserWindowRef.current.next
          : browserWindowRef.current.previous;
      const visibleX = target ? deltaX : deltaX * EDGE_RESISTANCE;

      gesture.currentX = visibleX;
      setVisualX(visibleX);
    };

    const finish = (event: PointerEvent, cancelled: boolean) => {
      const gesture = gestureRef.current;
      if (
        !gesture.active ||
        gesture.pointerId === null ||
        event.pointerId !== gesture.pointerId
      ) {
        return;
      }

      releaseCapture(gesture.pointerId);

      if (gesture.axis !== "x") {
        gestureRef.current = emptyGesture();
        return;
      }

      const distanceRatio =
        Math.abs(gesture.currentX) / Math.max(1, window.innerWidth);
      const direction: Direction =
        gesture.currentX < 0 ? "next" : "previous";
      const target =
        direction === "next"
          ? browserWindowRef.current.next
          : browserWindowRef.current.previous;
      const accepted =
        !cancelled &&
        Boolean(target) &&
        (distanceRatio > SNAP_DISTANCE_RATIO ||
          Math.abs(gesture.velocity) > SNAP_VELOCITY);

      gestureRef.current = emptyGesture();

      setPhase("settling");

      if (!accepted || !target) {
        setVisualX(0);
        settleTimerRef.current = window.setTimeout(resetVisuals, SETTLE_MS);
        return;
      }

      setVisualX(direction === "next" ? -window.innerWidth : window.innerWidth);
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        void commitProduct(target, direction);
      }, SETTLE_MS);
    };

    const onPointerUp = (event: PointerEvent) => finish(event, false);
    const onPointerCancel = (event: PointerEvent) => finish(event, true);

    root.addEventListener("pointerdown", onPointerDown, {
      passive: true,
      capture: true,
    });
    root.addEventListener("pointermove", onPointerMove, {
      passive: false,
      capture: true,
    });
    root.addEventListener("pointerup", onPointerUp, {
      passive: true,
      capture: true,
    });
    root.addEventListener("pointercancel", onPointerCancel, {
      passive: true,
      capture: true,
    });

    return () => {
      root.removeEventListener("pointerdown", onPointerDown, true);
      root.removeEventListener("pointermove", onPointerMove, true);
      root.removeEventListener("pointerup", onPointerUp, true);
      root.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [commitProduct, resetVisuals, setPhase, setVisualX]);

  useEffect(
    () => () => {
      if (visualFrameRef.current !== null) {
        window.cancelAnimationFrame(visualFrameRef.current);
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
    },
    [],
  );

  const product = browserWindow.current;
  const images = useMemo(() => productImages(product), [product]);
  const details = useMemo(() => productDetails(product), [product]);
  const collectionName =
    displayCollectionName(product.collections?.name) || "ROSTA Coffee";
  const productPrice = Number(product.price ?? 0);
  const compareAt = Number(product.compare_at_price ?? 0);
  const hasDiscount =
    Number.isFinite(compareAt) && compareAt > productPrice && productPrice > 0;
  const discountPercentage = hasDiscount
    ? Math.max(1, Math.round(((compareAt - productPrice) / compareAt) * 100))
    : 0;

  return (
    <div
      ref={rootRef}
      data-editor-id={`product-detail-shell:${product.id}`}
      data-editor-type="product-detail-shell"
      data-editor-label="Ürün Detay"
      className="product-browser-root"
      data-browser-phase="idle"
      style={{ touchAction: "pan-y pinch-zoom" }}
    >
      <style>{`
        .product-browser-root{--product-browser-x:0px;position:relative;min-height:100svh;overflow-x:clip;background:var(--rosta-carbon)}
        .product-browser-stage{position:fixed;inset:0;z-index:90;visibility:hidden;overflow:hidden;opacity:0;pointer-events:none;background:var(--rosta-carbon)}
        .product-browser-track{display:flex;width:300vw;height:100%;transform:translate3d(calc(-100vw + var(--product-browser-x)),0,0);backface-visibility:hidden}
        .product-browser-preview{position:relative;flex:0 0 100vw;width:100vw;height:100%;overflow:hidden;background:var(--rosta-carbon);color:var(--rosta-cream)}
        .product-browser-preview-media{width:100vw;height:133.333333vw;min-height:133.333333vw;max-height:133.333333vw;overflow:hidden;background:var(--ruth-product-media-top,var(--rosta-cream));contain:layout paint size}
        .product-browser-preview-media img{display:block;box-sizing:border-box;width:100%!important;height:100%!important;padding:clamp(10px,3vw,16px)!important;object-fit:contain!important;object-position:center center!important;transform:translateZ(0);backface-visibility:hidden}
        .product-browser-preview-details{background:var(--rosta-carbon-soft)}
        .product-browser-preview-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid color-mix(in srgb,var(--rosta-kraft) 40%,transparent);border-bottom:1px solid color-mix(in srgb,var(--rosta-kraft) 40%,transparent)}
        .product-browser-preview-tabs span{display:flex;min-height:48px;align-items:center;justify-content:center;border-right:1px solid color-mix(in srgb,var(--rosta-kraft) 32%,transparent);padding:6px 3px;color:var(--ruth-color-text-muted);font-size:clamp(6.8px,2vw,8.5px);line-height:1.24;letter-spacing:.025em;text-align:center;text-transform:uppercase}
        .product-browser-preview-tabs span:first-child{background:var(--ruth-color-accent-soft);color:var(--rosta-cream);box-shadow:inset 0 -2px 0 var(--rosta-brick-b)}
        .product-browser-preview-copy{min-height:106px;padding:16px}
        .product-browser-preview-copy small{display:block;color:var(--rosta-brick-b);font-size:8px;letter-spacing:.18em;text-transform:uppercase}
        .product-browser-preview-copy p{margin:10px 0 0;color:var(--ruth-color-text-muted);font-size:11px;line-height:1.65}
        .product-browser-preview-purchase{position:absolute;right:0;bottom:0;left:0;border-top:1px solid color-mix(in srgb,var(--rosta-kraft) 46%,transparent);background:var(--rosta-carbon);padding-bottom:env(safe-area-inset-bottom)}
        .product-browser-preview-buy-row{display:flex;min-height:58px;align-items:center;justify-content:space-between;gap:12px;padding:15px 18px 10px}
        .product-browser-preview-buy-row>strong{min-width:0;overflow:hidden;font-size:clamp(.9rem,4.1vw,1.08rem);font-weight:500;text-overflow:ellipsis;white-space:nowrap}
        .product-browser-preview-price{display:flex;flex-shrink:0;align-items:center;gap:6px;font-size:13px}
        .product-browser-preview-price del{color:var(--ruth-color-text-muted);font-size:8.5px}
        .product-browser-preview-price>span.is-sale{display:inline-flex;align-items:center;gap:5px;border-radius:2px;background:var(--rosta-brick-b);padding:5px 6px;color:var(--rosta-action-text);font-size:11px;font-weight:600}
        .product-browser-preview-price em{font-size:7px;font-style:normal}
        .product-browser-preview-add{display:flex;width:calc(100% - 36px);min-height:56px;align-items:center;justify-content:center;margin:0 18px 14px;border:1px solid var(--rosta-brick-b);background:var(--rosta-brick-b);color:var(--rosta-action-text);font-size:10px;letter-spacing:.19em;text-transform:uppercase}.product-browser-preview-add:active{border-color:var(--rosta-espresso);background:var(--rosta-espresso)}.product-browser-preview-add:focus-visible{outline:2px solid var(--ruth-color-focus);outline-offset:2px}
        .product-browser-root:is([data-browser-phase="dragging"],[data-browser-phase="settling"],[data-browser-phase="handoff"]) .product-browser-stage{visibility:visible;opacity:1}
        .product-browser-root[data-browser-phase="dragging"] .product-browser-track{will-change:transform}
        .product-browser-root[data-browser-phase="settling"] .product-browser-track{transition:transform ${SETTLE_MS}ms cubic-bezier(.22,1,.36,1);will-change:transform}
        .product-browser-root:is([data-browser-phase="dragging"],[data-browser-phase="settling"],[data-browser-phase="handoff"]) .product-purchase-mobile{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
        .product-swipe-hint{display:none}
        .product-swipe-hint-icon{flex:0 0 auto;animation:product-swipe-hint-nudge ${ruthMotion.milliseconds.slow * 2}ms cubic-bezier(.22,1,.36,1) infinite alternate}
        @keyframes product-swipe-hint-nudge{from{transform:translate3d(-6px,0,0)}to{transform:translate3d(6px,0,0)}}
        .product-detail-page{min-height:100svh;background:var(--rosta-carbon);color:var(--rosta-cream)}
        .product-primary{display:grid;width:min(100% - 48px,1280px);margin:0 auto;grid-template-columns:minmax(0,1fr) minmax(360px,1fr);gap:clamp(38px,6vw,88px);padding:calc(var(--announcement-height,0px) + 126px) 0 76px}
        .product-media{min-width:0;background:transparent}
        .product-summary{position:relative;min-width:0;padding:18px 0 0}
        .product-summary-inner{position:sticky;top:118px;max-width:560px}
        .product-eyebrow{margin:0 0 14px;color:var(--rosta-brick-b);font-size:9px;letter-spacing:.22em;text-transform:uppercase}
        .product-title{margin:0;font-family:var(--font-heading);font-size:clamp(2rem,4vw,4.1rem);font-weight:400;line-height:.98;letter-spacing:-.035em}
        .product-price-row{display:flex;align-items:center;gap:10px;margin-top:25px}
        .product-price{font-size:20px;font-weight:500}
        .product-compare{color:var(--ruth-color-text-muted);font-size:11px}
        .product-detail-sale-pill{display:inline-flex;align-items:center;gap:6px;border-radius:2px;background:var(--rosta-brick-b);padding:7px 9px;color:var(--rosta-action-text)}
        .product-detail-sale-pill strong{font-size:15px}
        .product-detail-sale-pill em{font-size:9px;font-style:normal}
        .product-service-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:34px}
        .product-service-card{padding:14px 7px;border:1px solid color-mix(in srgb,var(--rosta-kraft) 36%,transparent);text-align:center}
        .product-service-card svg{margin:0 auto 7px;color:var(--rosta-brick-b)}
        .product-service-card strong{display:block;font-size:8px;letter-spacing:.13em;text-transform:uppercase}
        .product-service-card span{display:block;margin-top:5px;color:var(--ruth-color-text-muted);font-size:8px}
        .product-secondary-content{background:var(--rosta-carbon)}
        @media(max-width:767px){
          .product-detail-page{padding-top:0}
          .product-primary{display:flex;width:100%;margin:0;flex-direction:column;gap:0;padding:0}
          .product-media{position:relative;z-index:0;order:1;width:100%}
          .product-swipe-hint{position:absolute;right:max(24px,env(safe-area-inset-right));bottom:24px;left:max(24px,env(safe-area-inset-left));z-index:5;display:flex;width:max-content;max-width:calc(100% - 48px);min-height:44px;align-items:center;justify-content:center;gap:10px;margin-inline:auto;padding:10px 14px;border:1px solid color-mix(in srgb,var(--ruth-color-accent) 24%,transparent);border-radius:999px;background:color-mix(in srgb,var(--ruth-color-canvas) 91%,transparent);box-shadow:0 10px 30px color-mix(in srgb,var(--rosta-carbon) 58%,transparent);color:var(--ruth-color-text-primary);font-family:var(--ruth-font-body);font-size:11px;font-weight:500;line-height:1.35;letter-spacing:.01em;text-align:center;touch-action:pan-y pinch-zoom;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
          .product-summary{position:relative;z-index:2;order:2;width:100%;padding:0;background:var(--rosta-carbon)}
          .product-summary-inner{position:static;max-width:none}
          .product-summary-copy,.product-service-grid{display:none}
          .product-mobile-details-inline{margin-top:0!important}
          .product-purchase-mobile{position:fixed!important;right:0!important;bottom:0!important;left:0!important;display:block!important;transform:none!important;opacity:1!important;visibility:visible!important;will-change:auto!important}
          .product-secondary-content{position:relative;z-index:2;padding-bottom:calc(150px + env(safe-area-inset-bottom));content-visibility:auto;contain-intrinsic-size:800px}
          .product-gallery-root,.product-gallery-frame:not(.is-lightbox),.product-gallery-slide,.product-gallery-image,.product-gallery-image img,.product-gallery-placeholder{border-radius:0!important}
        }
        @media(min-width:768px){.product-browser-stage{display:none}}
        @media(prefers-reduced-motion:reduce){.product-browser-track{transition-duration:1ms!important}.product-swipe-hint-icon{animation:none!important}}
      `}</style>

      <div
        data-editor-id={`product-sequence-nav:${product.id}`}
        data-editor-type="product-sequence-nav"
        data-editor-label="Ürün Sıra Navigasyonu"
        className="product-browser-stage"
        aria-hidden="true"
      >
        <div ref={trackRef} className="product-browser-track">
          <ProductBrowserPreview product={browserWindow.previous} />
          <ProductBrowserPreview product={product} />
          <ProductBrowserPreview product={browserWindow.next} />
        </div>
      </div>

      <div className="product-detail-page" key={product.id}>
        <section className="product-primary">
          <div className="product-media">
            <ProductGallery key={product.id} product={product} images={images} />
            {showSwipeHint ? (
              <div
                className="product-swipe-hint"
                role="status"
                aria-live="polite"
              >
                <ArrowLeftRight
                  className="product-swipe-hint-icon"
                  size={22}
                  strokeWidth={1.6}
                  aria-hidden="true"
                />
                <span>Ürünler arasında geçmek için sağa veya sola kaydır</span>
              </div>
            ) : null}
          </div>
          <div className="product-summary">
            <div className="product-summary-inner">
              <div
                data-editor-id={`product-title-meta:${product.id}`}
                data-editor-type="product-title-meta"
                data-editor-label="Ürün Başlık / Meta"
                className="product-summary-copy"
              >
                <p className="product-eyebrow">{collectionName}</p>
                <h1 className="product-title" lang="en-US" data-latin-uppercase>
                  {product.name}
                </h1>
                <div
                  data-editor-id={`price-block:${product.id}`}
                  data-editor-type="price-block"
                  data-editor-label="Fiyat Bloğu"
                  className="product-price-row"
                >
                  {hasDiscount ? (
                    <>
                      <del className="product-compare">
                        {formatPrice(compareAt, product.currency || "TRY")}
                      </del>
                      <span
                        data-editor-id={`status-badges:${product.id}`}
                        data-editor-type="status-badges"
                        data-editor-label="Ürün Rozetleri"
                        className="product-detail-sale-pill"
                      >
                        <strong>{formatPrice(productPrice, product.currency || "TRY")}</strong>
                        <em>-%{discountPercentage}</em>
                      </span>
                    </>
                  ) : (
                    <strong className="product-price">
                      {formatPrice(productPrice, product.currency || "TRY")}
                    </strong>
                  )}
                </div>
              </div>

              <ProductPurchasePanel key={product.id} product={product} details={details} />

              <div
                data-editor-id={`shipping-info:${product.id}`}
                data-editor-type="shipping-info"
                data-editor-label="Kargo / Güven Bilgileri"
                className="product-service-grid"
              >
                {[
                  { icon: Truck, title: "Kargo", text: "2.000₺ üzeri ücretsiz" },
                  { icon: Shield, title: "Güvenli", text: "PAYTR ile ödeme" },
                  { icon: RefreshCw, title: "Değişim", text: "14 gün destek" },
                ].map((item) => (
                  <div key={item.title} className="product-service-card">
                    <item.icon size={17} />
                    <strong>{item.title}</strong>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <ProductRecommendations
          key={product.slug}
          current={product}
          previous={browserWindow.previous}
          next={browserWindow.next}
        />

        <div className="product-secondary-content">
          <ProductReviewsSection
            key={product.id}
            productId={product.id}
            productSlug={product.slug}
            productName={product.name}
          />
        </div>
      </div>
    </div>
  );
}
