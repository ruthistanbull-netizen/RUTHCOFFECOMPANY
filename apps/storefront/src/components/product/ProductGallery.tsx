"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Maximize2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { ruthMotion, useOverlayBehavior } from "@ruth-commerce/ui";
import { useKeenSlider, type KeenSliderInstance } from "keen-slider/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";
import ProductImage from "@/components/ProductImage";
import { productDisplayImageSrc } from "@/lib/productDisplayImage";
import type { Product } from "@/types/site";
import { productGalleryStyles } from "./productGalleryStyles";
import { announceProductHeaderTone } from "./productGalleryTone";
import { useProductSwipeActiveImage } from "./ProductPageSwipeShell";

type GalleryViewportProps = {
  product: Product;
  images: string[];
  activeIndex: number;
  mobile: boolean;
  lightbox?: boolean;
  reduceMotion: boolean;
  onIndexChange: (index: number) => void;
  onOpenLightbox?: (index: number) => void;
};

type Point = { x: number; y: number };

type ZoomGesture = {
  distance: number;
  scale: number;
  center: Point;
  offset: Point;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.2;
const DOUBLE_TAP_ZOOM = 2;

const releaseDragGuard = (ref: MutableRefObject<boolean>) => {
  window.setTimeout(() => {
    ref.current = false;
  }, 120);
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const pointerDistance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

const pointerCenter = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

function GalleryViewport({
  product,
  images,
  activeIndex,
  mobile,
  lightbox = false,
  reduceMotion,
  onIndexChange,
  onOpenLightbox,
}: GalleryViewportProps) {
  const draggedRef = useRef(false);
  const initialIndexRef = useRef(activeIndex);
  const targetIndexRef = useRef(activeIndex);
  const imagesKey = useMemo(() => images.join("\u001f"), [images]);

  const boundedIndex = useCallback(
    (index: number) => {
      const lastIndex = Math.max(0, images.length - 1);
      return Math.max(0, Math.min(lastIndex, index));
    },
    [images.length],
  );

  const handleSlideChanged = useCallback(
    (slider: KeenSliderInstance) => {
      const nextIndex = boundedIndex(slider.track.details.rel);
      targetIndexRef.current = nextIndex;
      onIndexChange(nextIndex);
    },
    [boundedIndex, onIndexChange],
  );

  const sliderAnimation = useMemo(
    () =>
      reduceMotion
        ? { duration: 1 }
        : {
            duration: ruthMotion.milliseconds.slow,
            easing: (time: number) => 1 - Math.pow(1 - time, 3),
          },
    [reduceMotion],
  );

  const sliderOptions = useMemo(
    () => ({
      initial: initialIndexRef.current,
      vertical: mobile,
      mode: "snap" as const,
      rubberband: false,
      renderMode: "precision" as const,
      loop: false,
      defaultAnimation: sliderAnimation,
      slideChanged: handleSlideChanged,
      dragStarted: () => {
        draggedRef.current = true;
      },
      dragEnded: () => releaseDragGuard(draggedRef),
    }),
    [handleSlideChanged, mobile, sliderAnimation],
  );

  const [sliderRef, slider] = useKeenSlider<HTMLDivElement>(sliderOptions);

  useLayoutEffect(() => {
    const nextIndex = boundedIndex(activeIndex);
    targetIndexRef.current = nextIndex;
    const instance = slider.current;
    if (!instance || instance.track.details.rel === nextIndex) return;
    instance.moveToIdx(nextIndex, true, sliderAnimation);
  }, [activeIndex, boundedIndex, slider, sliderAnimation]);

  useLayoutEffect(() => {
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      const instance = slider.current;
      if (!instance) return;

      const nextIndex = boundedIndex(targetIndexRef.current);
      targetIndexRef.current = nextIndex;
      instance.update();
      instance.moveToIdx(nextIndex, true, { duration: 1 });

      // Safari can keep the renderer transform calculated for the previous
      // horizontal product during a client-side handoff. A second layout pass
      // after the new 3:4 frame is painted clears that stale X offset.
      secondFrame = window.requestAnimationFrame(() => {
        const liveInstance = slider.current;
        if (!liveInstance) return;
        liveInstance.update();
        liveInstance.moveToIdx(nextIndex, true, { duration: 1 });
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [boundedIndex, imagesKey, mobile, slider]);

  const goTo = useCallback(
    (index: number) => {
      const nextIndex = boundedIndex(index);
      targetIndexRef.current = nextIndex;
      const instance = slider.current;
      if (!instance) {
        onIndexChange(nextIndex);
        return;
      }
      instance.moveToIdx(nextIndex, true, sliderAnimation);
    },
    [boundedIndex, onIndexChange, slider, sliderAnimation],
  );

  const stepBy = useCallback(
    (direction: -1 | 1) => {
      goTo(targetIndexRef.current + direction);
    },
    [goTo],
  );

  const atStart = activeIndex <= 0;
  const atEnd = activeIndex >= images.length - 1;

  return (
    <div
      className={`product-gallery-frame ${lightbox ? "is-lightbox" : ""} ${
        mobile ? "is-mobile-vertical" : ""
      }`}
      aria-label="Ürün görselleri"
      data-product-gallery-gesture-surface={mobile ? "true" : undefined}
      data-product-browser-ignore={mobile ? "true" : undefined}
      data-gallery-motion-owner="keen"
    >
      <div ref={sliderRef} className="product-gallery-keen keen-slider">
        {images.map((image, index) => (
          <div
            key={`${image}-${index}`}
            className="product-gallery-slide keen-slider__slide"
            onClick={() => {
              if (lightbox || draggedRef.current || !onOpenLightbox) return;
              onOpenLightbox(index);
            }}
          >
            <ProductImage
              product={product}
              imageUrl={image}
              alt={`${product.name} ${index + 1}`}
              mode="detail"
              priority={!lightbox && index === 0}
              eager
              className="product-gallery-image"
              fit="contain"
            />
          </div>
        ))}
      </div>

      {!lightbox ? (
        <button
          type="button"
          className="product-gallery-expand"
          onClick={() => onOpenLightbox?.(activeIndex)}
          aria-label="Görseli büyüt"
          data-product-gallery-control
          data-product-page-swipe-ignore
        >
          <Maximize2 size={17} />
        </button>
      ) : null}

      {images.length > 1 ? (
        <>
          <button
            type="button"
            className="product-gallery-arrow is-previous"
            onClick={() => stepBy(-1)}
            aria-label="Önceki görsel"
            disabled={atStart}
            data-product-gallery-control
            data-product-page-swipe-ignore
          >
            {mobile ? <ChevronUp size={20} /> : <ChevronLeft size={20} />}
          </button>
          <button
            type="button"
            className="product-gallery-arrow is-next"
            onClick={() => stepBy(1)}
            aria-label="Sonraki görsel"
            disabled={atEnd}
            data-product-gallery-control
            data-product-page-swipe-ignore
          >
            {mobile ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </button>
        </>
      ) : null}

      <div className="product-gallery-progress">
        {images.map((_, index) => (
          <button
            key={index}
            type="button"
            className={index === activeIndex ? "is-active" : ""}
            onClick={() => goTo(index)}
            aria-label={`${index + 1}. görsel`}
            data-product-gallery-control
            data-product-page-swipe-ignore
          />
        ))}
      </div>
    </div>
  );
}

function ZoomableLightboxImage({
  product,
  image,
  imageIndex,
}: {
  product: Product;
  image: string;
  imageIndex: number;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(MIN_ZOOM);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  const touchGestureRef = useRef<ZoomGesture | null>(null);
  const touchOriginRef = useRef<Point | null>(null);
  const touchMovedRef = useRef(false);
  const mouseOriginRef = useRef<Point | null>(null);
  const mouseOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const lastTapRef = useRef(0);
  const lastWheelAtRef = useRef(0);
  const [scale, setScale] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [gestureActive, setGestureActive] = useState(false);

  const boundedOffset = useCallback((next: Point, nextScale: number): Point => {
    if (nextScale <= MIN_ZOOM) return { x: 0, y: 0 };
    const viewport = viewportRef.current;
    if (!viewport) return next;
    const maxX = (viewport.clientWidth * (nextScale - 1)) / 2;
    const maxY = (viewport.clientHeight * (nextScale - 1)) / 2;
    return {
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY),
    };
  }, []);

  const commitTransform = useCallback(
    (nextScale: number, nextOffset: Point) => {
      const roundedScale = Math.round(clamp(nextScale, MIN_ZOOM, MAX_ZOOM) * 100) / 100;
      const bounded = boundedOffset(nextOffset, roundedScale);
      scaleRef.current = roundedScale;
      offsetRef.current = bounded;
      setScale(roundedScale);
      setOffset(bounded);
    },
    [boundedOffset],
  );

  const applyScale = useCallback(
    (nextScale: number) => {
      commitTransform(nextScale, offsetRef.current);
    },
    [commitTransform],
  );

  const stepScale = useCallback(
    (direction: -1 | 1) => {
      const currentPercent = Math.round(scaleRef.current * 100);
      const nextPercent = clamp(
        currentPercent + direction * Math.round(ZOOM_STEP * 100),
        Math.round(MIN_ZOOM * 100),
        Math.round(MAX_ZOOM * 100),
      );
      applyScale(nextPercent / 100);
    },
    [applyScale],
  );

  const toggleZoom = useCallback(() => {
    if (scaleRef.current > MIN_ZOOM + 0.05) {
      commitTransform(MIN_ZOOM, { x: 0, y: 0 });
      return;
    }
    commitTransform(DOUBLE_TAP_ZOOM, { x: 0, y: 0 });
  }, [commitTransform]);

  const touchPoints = useCallback((touches: React.TouchList) => {
    return Array.from(touches).map((touch) => ({
      x: touch.clientX,
      y: touch.clientY,
    }));
  }, []);

  const resetTouchGesture = useCallback(
    (points: Point[]) => {
      if (points.length >= 2) {
        touchGestureRef.current = {
          distance: Math.max(1, pointerDistance(points[0], points[1])),
          scale: scaleRef.current,
          center: pointerCenter(points[0], points[1]),
          offset: offsetRef.current,
        };
        return;
      }
      if (points.length === 1) {
        touchGestureRef.current = {
          distance: 0,
          scale: scaleRef.current,
          center: points[0],
          offset: offsetRef.current,
        };
        return;
      }
      touchGestureRef.current = null;
    },
    [],
  );

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (event.cancelable) event.preventDefault();
      setGestureActive(true);
      const points = touchPoints(event.touches);
      if (points.length === 1) {
        touchOriginRef.current = points[0];
        touchMovedRef.current = false;
      } else {
        touchMovedRef.current = true;
      }
      resetTouchGesture(points);
    },
    [resetTouchGesture, touchPoints],
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (event.cancelable) event.preventDefault();
      const points = touchPoints(event.touches);
      const gesture = touchGestureRef.current;
      if (!gesture || !points.length) return;

      const origin = touchOriginRef.current;
      if (
        origin &&
        points.length === 1 &&
        Math.hypot(points[0].x - origin.x, points[0].y - origin.y) > 5
      ) {
        touchMovedRef.current = true;
      }

      if (points.length >= 2) {
        touchMovedRef.current = true;
        const distance = Math.max(1, pointerDistance(points[0], points[1]));
        const center = pointerCenter(points[0], points[1]);
        const nextScale = clamp(
          gesture.scale * (distance / Math.max(1, gesture.distance)),
          MIN_ZOOM,
          MAX_ZOOM,
        );
        commitTransform(nextScale, {
          x: gesture.offset.x + center.x - gesture.center.x,
          y: gesture.offset.y + center.y - gesture.center.y,
        });
        return;
      }

      if (points.length === 1 && scaleRef.current > MIN_ZOOM) {
        commitTransform(scaleRef.current, {
          x: gesture.offset.x + points[0].x - gesture.center.x,
          y: gesture.offset.y + points[0].y - gesture.center.y,
        });
      }
    },
    [commitTransform, touchPoints],
  );

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (event.cancelable) event.preventDefault();
      const remaining = touchPoints(event.touches);

      if (!remaining.length && !touchMovedRef.current && touchOriginRef.current) {
        const now = Date.now();
        if (now - lastTapRef.current < 320) {
          toggleZoom();
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      }

      touchOriginRef.current = remaining[0] ?? null;
      touchMovedRef.current = remaining.length > 1;
      resetTouchGesture(remaining);
      if (!remaining.length) setGestureActive(false);
    },
    [resetTouchGesture, toggleZoom, touchPoints],
  );

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    mouseOriginRef.current = { x: event.clientX, y: event.clientY };
    mouseOffsetRef.current = offsetRef.current;
    if (scaleRef.current > MIN_ZOOM) setGestureActive(true);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch" || !mouseOriginRef.current) return;
      if (scaleRef.current <= MIN_ZOOM) return;
      commitTransform(scaleRef.current, {
        x: mouseOffsetRef.current.x + event.clientX - mouseOriginRef.current.x,
        y: mouseOffsetRef.current.y + event.clientY - mouseOriginRef.current.y,
      });
    },
    [commitTransform],
  );

  const handlePointerEnd = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    mouseOriginRef.current = null;
    setGestureActive(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const now = performance.now();
      if (now - lastWheelAtRef.current < 120) return;
      lastWheelAtRef.current = now;
      stepScale(event.deltaY < 0 ? 1 : -1);
    },
    [stepScale],
  );

  useEffect(() => {
    scaleRef.current = MIN_ZOOM;
    offsetRef.current = { x: 0, y: 0 };
    touchGestureRef.current = null;
    touchOriginRef.current = null;
    mouseOriginRef.current = null;
    lastWheelAtRef.current = 0;
    setScale(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
    setGestureActive(false);
  }, [image]);

  return (
    <div
      ref={viewportRef}
      className={`ruth-product-lightbox__zoom-viewport ${scale > MIN_ZOOM ? "is-zoomed" : ""}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onDoubleClick={(event) => {
        event.preventDefault();
        toggleZoom();
      }}
      onWheel={handleWheel}
      data-product-page-swipe-ignore
    >
      <div
        className={`ruth-product-lightbox__zoom-stage ${gestureActive ? "is-gesture-active" : ""}`}
        style={{
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
        }}
      >
        <ProductImage
          product={product}
          imageUrl={image}
          alt={`${product.name} ${imageIndex + 1} detay görünümü`}
          mode="detail"
          eager
          className="ruth-product-lightbox__zoom-image"
          fit="contain"
        />
      </div>

      <div className="ruth-product-lightbox__zoom-controls" data-product-page-swipe-ignore>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            stepScale(-1);
          }}
          disabled={scale <= MIN_ZOOM}
          aria-label="Uzaklaştır"
        >
          <Minus size={17} />
        </button>
        <span aria-live="polite">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            stepScale(1);
          }}
          disabled={scale >= MAX_ZOOM}
          aria-label="Yakınlaştır"
        >
          <Plus size={17} />
        </button>
      </div>
    </div>
  );
}

export function ProductGallery({
  product,
  images,
}: {
  product: Product;
  images: string[];
}) {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const setSwipeActiveImage = useProductSwipeActiveImage(product.id);
  const safeImages = useMemo(() => {
    const source = images.filter(Boolean);
    return source.length
      ? [...new Set(source)]
      : product.main_image_url
        ? [product.main_image_url]
        : [];
  }, [images, product.main_image_url]);

  const [forcedImage, setForcedImage] = useState<string | null>(null);
  const displayImages = useMemo(
    () =>
      forcedImage
        ? [forcedImage, ...safeImages.filter((image) => image !== forcedImage)]
        : safeImages,
    [forcedImage, safeImages],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const warmedImagesRef = useRef(new Map<string, HTMLImageElement>());
  const reduceMotion = mobile && prefersReducedMotion;
  const lightboxOverlay = useOverlayBehavior({
    active: lightboxOpen,
    onClose: () => setLightboxOpen(false),
    dismissalPolicy: "light-dismiss",
  });

  useLayoutEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
    setForcedImage(null);
    setLightboxOpen(false);
    warmedImagesRef.current.clear();
  }, [product.id]);

  useEffect(() => {
    if (selectedIndex < displayImages.length) return;
    setSelectedIndex(Math.max(0, displayImages.length - 1));
  }, [displayImages.length, selectedIndex]);

  useEffect(() => {
    const active = displayImages[selectedIndex];
    if (!active) return;
    setSwipeActiveImage(active);
    announceProductHeaderTone(active);
  }, [displayImages, selectedIndex, setSwipeActiveImage]);

  useEffect(() => {
    if (typeof window === "undefined" || !displayImages.length) return;

    const orderedIndices = [
      selectedIndex,
      selectedIndex + 1,
      selectedIndex - 1,
      ...displayImages.map((_, index) => index),
    ].filter(
      (index, position, source) =>
        index >= 0 &&
        index < displayImages.length &&
        source.indexOf(index) === position,
    );

    orderedIndices.forEach((index) => {
      const rawSource = displayImages[index];
      const source = productDisplayImageSrc(product, rawSource, "detail");
      if (!source || warmedImagesRef.current.has(source)) return;

      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = Math.abs(index - selectedIndex) <= 1 ? "high" : "low";
      warmedImagesRef.current.set(source, image);
      image.src = source;
      void image.decode?.().catch(() => undefined);
    });
  }, [displayImages, product, selectedIndex]);

  useEffect(() => {
    const onVariant = (event: Event) => {
      const detail = (
        event as CustomEvent<{ productId?: string; imageUrl?: string }>
      ).detail;
      if (detail?.productId === product.id && detail.imageUrl) {
        setForcedImage(detail.imageUrl);
        setSelectedIndex(0);
      }
    };
    window.addEventListener("ruth:variant-image", onVariant);
    return () => window.removeEventListener("ruth:variant-image", onVariant);
  }, [product.id]);

  const selectedImage = displayImages[selectedIndex] ?? displayImages[0];

  useEffect(() => {
    const root = document.documentElement;
    if (lightboxOpen) root.classList.add("ruth-product-lightbox-open");
    else root.classList.remove("ruth-product-lightbox-open");
    return () => root.classList.remove("ruth-product-lightbox-open");
  }, [lightboxOpen]);

  const openLightbox = useCallback((index: number) => {
    setSelectedIndex(index);
    setLightboxOpen(true);
  }, []);

  const handleIndexChange = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  if (!displayImages.length) {
    return (
      <div className="product-gallery-empty">
        <span className="font-heading text-3xl text-ink/70">{product.name}</span>
      </div>
    );
  }

  const overlayTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };
  const mediaTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.52, ease: [0.16, 1, 0.3, 1] as const };

  const lightbox =
    typeof document !== "undefined"
      ? createPortal(
          <AnimatePresence mode="wait">
            {lightboxOpen ? (
              <motion.div
                className="ruth-product-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label={`${product.name} tam ekran görsel detayı`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={overlayTransition}
                data-dismissal-policy={lightboxOverlay.dismissalPolicy}
                data-product-page-swipe-ignore
              >
                <motion.section
                  ref={lightboxOverlay.containerRef}
                  className="ruth-product-lightbox__surface"
                  tabIndex={-1}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={overlayTransition}
                  onClick={lightboxOverlay.onBackdropClick}
                >
                  <div className="ruth-product-lightbox__viewport">
                    <motion.div
                      className="ruth-product-lightbox__media"
                      initial={
                        reduceMotion
                          ? { opacity: 0 }
                          : {
                              opacity: 0,
                              scale: 0.91,
                              y: 30,
                              filter: "blur(12px)",
                              clipPath: "inset(6% 5% round 30px)",
                            }
                      }
                      animate={{
                        opacity: 1,
                        scale: 1,
                        y: 0,
                        filter: "blur(0px)",
                        clipPath: "inset(0% 0% round 0px)",
                      }}
                      exit={
                        reduceMotion
                          ? { opacity: 0 }
                          : {
                              opacity: 0,
                              scale: 0.94,
                              y: 22,
                              filter: "blur(9px)",
                              clipPath: "inset(5% 4% round 26px)",
                            }
                      }
                      transition={mediaTransition}
                    >
                      <ZoomableLightboxImage
                        product={product}
                        image={selectedImage}
                        imageIndex={selectedIndex}
                      />
                    </motion.div>
                  </div>

                  <motion.header
                    className="ruth-product-lightbox__topbar"
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                    transition={mediaTransition}
                  >
                    <div className="ruth-product-lightbox__meta">
                      <span>Ürün detayı</span>
                      <strong>{product.name}</strong>
                    </div>
                    <button
                      data-autofocus
                      type="button"
                      onClick={() => setLightboxOpen(false)}
                      className="ruth-product-lightbox__close"
                      aria-label="Tam ekranı kapat"
                      data-product-page-swipe-ignore
                    >
                      <X size={20} />
                    </button>
                  </motion.header>
                </motion.section>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <div className="product-gallery-root">
      <style>{productGalleryStyles}</style>
      <GalleryViewport
        key={`${product.id}:${mobile ? "mobile" : "desktop"}`}
        product={product}
        images={displayImages}
        activeIndex={selectedIndex}
        mobile={mobile}
        reduceMotion={reduceMotion}
        onIndexChange={handleIndexChange}
        onOpenLightbox={openLightbox}
      />
      {lightbox}
    </div>
  );
}
