"use client";

import { useEffect } from "react";

type Point = { x: number; y: number };

type ZoomState = {
  scale: number;
  x: number;
  y: number;
  lastWheelAt: number;
  source: string;
};

type TouchGesture = {
  viewport: HTMLElement;
  kind: "pinch" | "pan";
  startScale: number;
  startX: number;
  startY: number;
  startDistance: number;
  startCenterX: number;
  startCenterY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

type MouseDrag = {
  viewport: HTMLElement;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

const ZOOM_MIN = 1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.2;
const DOUBLE_TAP_ZOOM = 2;
const EPSILON = 0.001;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const touchDistance = (a: Touch, b: Touch) =>
  Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);

const touchCenter = (a: Touch, b: Touch): Point => ({
  x: (a.clientX + b.clientX) / 2,
  y: (a.clientY + b.clientY) / 2,
});

const viewportFromTarget = (target: EventTarget | null) =>
  target instanceof Element
    ? target.closest<HTMLElement>(".ruth-product-lightbox__zoom-viewport")
    : null;

const sourceForViewport = (viewport: HTMLElement) => {
  const image = viewport.querySelector<HTMLImageElement>(
    ".ruth-product-lightbox__zoom-image img",
  );
  return image?.currentSrc || image?.src || "";
};

export function StorefrontLightboxPolish() {
  useEffect(() => {
    const zoomStates = new WeakMap<HTMLElement, ZoomState>();
    const lastTapAt = new WeakMap<HTMLElement, number>();
    let touchGesture: TouchGesture | null = null;
    let mouseDrag: MouseDrag | null = null;
    let controlTouchButton: HTMLButtonElement | null = null;

    const claim = (event: Event, preventDefault = true) => {
      if (preventDefault && event.cancelable) event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const boundOffsets = (viewport: HTMLElement, state: ZoomState) => {
      if (state.scale <= ZOOM_MIN + EPSILON) {
        state.x = 0;
        state.y = 0;
        return;
      }

      const maxX = (viewport.clientWidth * (state.scale - 1)) / 2;
      const maxY = (viewport.clientHeight * (state.scale - 1)) / 2;
      state.x = clamp(state.x, -maxX, maxX);
      state.y = clamp(state.y, -maxY, maxY);
    };

    const getState = (viewport: HTMLElement) => {
      const source = sourceForViewport(viewport);
      let state = zoomStates.get(viewport);
      if (!state || state.source !== source) {
        state = {
          scale: ZOOM_MIN,
          x: 0,
          y: 0,
          lastWheelAt: 0,
          source,
        };
        zoomStates.set(viewport, state);
      }
      return state;
    };

    const renderZoom = (viewport: HTMLElement, animate = true) => {
      const state = getState(viewport);
      state.scale = clamp(
        Math.round(state.scale * 1000) / 1000,
        ZOOM_MIN,
        ZOOM_MAX,
      );
      boundOffsets(viewport, state);

      viewport.classList.toggle("is-ruth-polish-gesture", !animate);
      viewport.classList.toggle(
        "is-ruth-polish-zoomed",
        state.scale > ZOOM_MIN + EPSILON,
      );

      const stage = viewport.querySelector<HTMLElement>(
        ".ruth-product-lightbox__zoom-stage",
      );
      stage?.style.setProperty(
        "--ruth-lightbox-polish-transform",
        `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`,
      );

      const label = viewport.querySelector<HTMLElement>(
        ".ruth-product-lightbox__zoom-controls span",
      );
      const nextLabel = `${Math.round(state.scale * 100)}%`;
      if (label && label.textContent !== nextLabel) label.textContent = nextLabel;

      const minus = viewport.querySelector<HTMLButtonElement>(
        '.ruth-product-lightbox__zoom-controls button[aria-label="Uzaklaştır"]',
      );
      const plus = viewport.querySelector<HTMLButtonElement>(
        '.ruth-product-lightbox__zoom-controls button[aria-label="Yakınlaştır"]',
      );
      const minusDisabled = state.scale <= ZOOM_MIN + EPSILON;
      const plusDisabled = state.scale >= ZOOM_MAX - EPSILON;
      if (minus && minus.disabled !== minusDisabled) minus.disabled = minusDisabled;
      if (plus && plus.disabled !== plusDisabled) plus.disabled = plusDisabled;
    };

    const setScale = (
      viewport: HTMLElement,
      nextScale: number,
      animate = true,
    ) => {
      const state = getState(viewport);
      state.scale = clamp(
        Math.round(clamp(nextScale, ZOOM_MIN, ZOOM_MAX) * 10) / 10,
        ZOOM_MIN,
        ZOOM_MAX,
      );
      if (state.scale <= ZOOM_MIN + EPSILON) {
        state.x = 0;
        state.y = 0;
      }
      renderZoom(viewport, animate);
    };

    const stepControl = (button: HTMLButtonElement) => {
      const viewport = button.closest<HTMLElement>(
        ".ruth-product-lightbox__zoom-viewport",
      );
      if (!viewport) return;
      const state = getState(viewport);
      const direction = button.getAttribute("aria-label") === "Uzaklaştır" ? -1 : 1;
      setScale(viewport, state.scale + direction * ZOOM_STEP, true);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>(
        ".ruth-product-lightbox__zoom-controls button",
      );
      if (!button) return;
      claim(event);
      stepControl(button);
    };

    const onDoubleClick = (event: MouseEvent) => {
      const viewport = viewportFromTarget(event.target);
      if (!viewport) return;
      if (
        event.target instanceof Element &&
        event.target.closest(".ruth-product-lightbox__zoom-controls")
      ) {
        return;
      }
      claim(event);
      const state = getState(viewport);
      setScale(
        viewport,
        state.scale > ZOOM_MIN + 0.05 ? ZOOM_MIN : DOUBLE_TAP_ZOOM,
        true,
      );
    };

    const onWheel = (event: WheelEvent) => {
      const viewport = viewportFromTarget(event.target);
      if (!viewport) return;
      claim(event);
      const state = getState(viewport);
      const now = performance.now();
      if (now - state.lastWheelAt < 72) return;
      state.lastWheelAt = now;
      setScale(
        viewport,
        state.scale + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP),
        true,
      );
    };

    const onTouchStart = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest<HTMLButtonElement>(
        ".ruth-product-lightbox__zoom-controls button",
      );
      if (control) {
        claim(event);
        controlTouchButton = control;
        touchGesture = null;
        return;
      }

      const viewport = viewportFromTarget(event.target);
      if (!viewport || event.touches.length < 1) return;
      claim(event);
      const state = getState(viewport);
      viewport.classList.add("is-ruth-polish-gesture");

      if (event.touches.length >= 2) {
        const center = touchCenter(event.touches[0], event.touches[1]);
        touchGesture = {
          viewport,
          kind: "pinch",
          startScale: state.scale,
          startX: state.x,
          startY: state.y,
          startDistance: Math.max(
            1,
            touchDistance(event.touches[0], event.touches[1]),
          ),
          startCenterX: center.x,
          startCenterY: center.y,
          originX: center.x,
          originY: center.y,
          moved: false,
        };
        return;
      }

      const touch = event.touches[0];
      touchGesture = {
        viewport,
        kind: "pan",
        startScale: state.scale,
        startX: state.x,
        startY: state.y,
        startDistance: 0,
        startCenterX: touch.clientX,
        startCenterY: touch.clientY,
        originX: touch.clientX,
        originY: touch.clientY,
        moved: false,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (controlTouchButton) {
        claim(event);
        return;
      }
      if (!touchGesture || event.touches.length < 1) return;
      claim(event);

      const { viewport } = touchGesture;
      const state = getState(viewport);

      if (event.touches.length >= 2) {
        if (touchGesture.kind !== "pinch") {
          const center = touchCenter(event.touches[0], event.touches[1]);
          touchGesture = {
            viewport,
            kind: "pinch",
            startScale: state.scale,
            startX: state.x,
            startY: state.y,
            startDistance: Math.max(
              1,
              touchDistance(event.touches[0], event.touches[1]),
            ),
            startCenterX: center.x,
            startCenterY: center.y,
            originX: center.x,
            originY: center.y,
            moved: true,
          };
          return;
        }

        const center = touchCenter(event.touches[0], event.touches[1]);
        state.scale = clamp(
          touchGesture.startScale *
            (touchDistance(event.touches[0], event.touches[1]) /
              touchGesture.startDistance),
          ZOOM_MIN,
          ZOOM_MAX,
        );
        state.x = touchGesture.startX + center.x - touchGesture.startCenterX;
        state.y = touchGesture.startY + center.y - touchGesture.startCenterY;
        touchGesture.moved = true;
        renderZoom(viewport, false);
        return;
      }

      if (touchGesture.kind === "pan") {
        const touch = event.touches[0];
        const moved = Math.hypot(
          touch.clientX - touchGesture.originX,
          touch.clientY - touchGesture.originY,
        );
        if (moved > 5) touchGesture.moved = true;
        if (state.scale > ZOOM_MIN + EPSILON) {
          state.x = touchGesture.startX + touch.clientX - touchGesture.startCenterX;
          state.y = touchGesture.startY + touch.clientY - touchGesture.startCenterY;
          renderZoom(viewport, false);
        }
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (controlTouchButton) {
        const button = controlTouchButton;
        controlTouchButton = null;
        claim(event);
        stepControl(button);
        return;
      }
      if (!touchGesture) return;
      claim(event);

      const { viewport, moved, kind } = touchGesture;
      if (event.touches.length >= 1) {
        const state = getState(viewport);
        const touch = event.touches[0];
        touchGesture = {
          viewport,
          kind: "pan",
          startScale: state.scale,
          startX: state.x,
          startY: state.y,
          startDistance: 0,
          startCenterX: touch.clientX,
          startCenterY: touch.clientY,
          originX: touch.clientX,
          originY: touch.clientY,
          moved: true,
        };
        return;
      }

      viewport.classList.remove("is-ruth-polish-gesture");
      if (kind === "pan" && !moved) {
        const now = Date.now();
        const previous = lastTapAt.get(viewport) || 0;
        if (now - previous < 320) {
          lastTapAt.set(viewport, 0);
          const state = getState(viewport);
          setScale(
            viewport,
            state.scale > ZOOM_MIN + 0.05 ? ZOOM_MIN : DOUBLE_TAP_ZOOM,
            true,
          );
        } else {
          lastTapAt.set(viewport, now);
        }
      }

      touchGesture = null;
      renderZoom(viewport, true);
    };

    const onTouchCancel = (event: TouchEvent) => {
      if (!controlTouchButton && !touchGesture) return;
      claim(event);
      controlTouchButton = null;
      if (touchGesture) {
        const viewport = touchGesture.viewport;
        touchGesture = null;
        viewport.classList.remove("is-ruth-polish-gesture");
        renderZoom(viewport, true);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".ruth-product-lightbox__zoom-controls")) return;

      const viewport = viewportFromTarget(event.target);
      if (!viewport) return;
      const state = getState(viewport);
      if (state.scale <= ZOOM_MIN + EPSILON) return;

      claim(event);
      viewport.classList.add("is-ruth-polish-gesture");
      mouseDrag = {
        viewport,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: state.x,
        startY: state.y,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!mouseDrag || event.pointerType === "touch") return;
      claim(event);
      const state = getState(mouseDrag.viewport);
      state.x = mouseDrag.startX + event.clientX - mouseDrag.startClientX;
      state.y = mouseDrag.startY + event.clientY - mouseDrag.startClientY;
      renderZoom(mouseDrag.viewport, false);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!mouseDrag || event.pointerType === "touch") return;
      claim(event);
      const viewport = mouseDrag.viewport;
      mouseDrag = null;
      viewport.classList.remove("is-ruth-polish-gesture");
      renderZoom(viewport, true);
    };

    window.addEventListener("click", onClick, true);
    window.addEventListener("dblclick", onDoubleClick, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: false,
    });
    window.addEventListener("touchmove", onTouchMove, {
      capture: true,
      passive: false,
    });
    window.addEventListener("touchend", onTouchEnd, {
      capture: true,
      passive: false,
    });
    window.addEventListener("touchcancel", onTouchCancel, {
      capture: true,
      passive: false,
    });
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);

    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("dblclick", onDoubleClick, true);
      window.removeEventListener("wheel", onWheel, true);
      window.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("touchend", onTouchEnd, true);
      window.removeEventListener("touchcancel", onTouchCancel, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
    };
  }, []);

  return (
    <style>{`
      .ruth-product-lightbox__zoom-stage {
        transform: var(
          --ruth-lightbox-polish-transform,
          translate3d(0, 0, 0) scale(1)
        ) !important;
        transition: transform 420ms cubic-bezier(.16, 1, .3, 1) !important;
        will-change: transform;
      }

      .ruth-product-lightbox__zoom-viewport.is-ruth-polish-gesture
        .ruth-product-lightbox__zoom-stage {
        transition: none !important;
      }

      .ruth-product-lightbox__zoom-viewport.is-ruth-polish-zoomed {
        cursor: grab !important;
      }

      .ruth-product-lightbox__zoom-viewport.is-ruth-polish-zoomed:active {
        cursor: grabbing !important;
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

        .ruth-product-lightbox__surface,
        .ruth-product-lightbox__viewport {
          background: transparent !important;
        }
      }

      @media (min-width: 1024px) {
        .site-app-shell {
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
          text-rendering: optimizeLegibility !important;
          font-kerning: normal !important;
          font-synthesis: none !important;
        }

        .site-app-shell :where(
          a,
          button,
          p,
          span,
          label,
          small,
          strong,
          em,
          li,
          dt,
          dd,
          th,
          td,
          input,
          select,
          textarea,
          h1,
          h2,
          h3,
          h4,
          h5,
          h6
        ) {
          -webkit-font-smoothing: antialiased !important;
          text-rendering: optimizeLegibility !important;
          font-kerning: normal !important;
          font-synthesis: none !important;
          font-stretch: normal !important;
          font-feature-settings: "kern" 1, "liga" 1 !important;
        }

        .site-app-shell .product-card-material-badge,
        .site-app-shell .product-card-collection,
        .site-app-shell .product-recommendations-heading p,
        .site-app-shell .product-recommendation-copy small,
        .site-app-shell .product-eyebrow,
        .site-app-shell .product-service-card strong,
        .site-app-shell .product-service-card span,
        .site-app-shell .ruth-product-lightbox__meta span {
          font-size: 10px !important;
          line-height: 1.35 !important;
        }

        .site-app-shell .product-card-compare,
        .site-app-shell .product-purchase-compare {
          font-size: 11px !important;
          line-height: 1.35 !important;
        }

        .site-app-shell .product-card-sale-pill em,
        .site-app-shell .product-purchase-sale-pill em,
        .site-app-shell .ruth-product-lightbox__zoom-controls span {
          font-size: 10px !important;
        }

        .site-app-shell .ruth-menu-collection-rail--desktop
          .ruth-menu-collection-card__label {
          font-size: 11px !important;
          line-height: 1.35 !important;
          letter-spacing: .055em !important;
          font-weight: 400 !important;
        }

        .site-app-shell .ruth-zara-menu-copy__index {
          font-size: 12px !important;
          line-height: 1.35 !important;
          font-weight: 400 !important;
        }

        .site-app-shell .ruth-zara-menu-copy__title,
        .site-app-shell .ruth-zara-menu-copy__link,
        .site-app-shell .ruth-zara-menu-actions {
          font-weight: 400 !important;
        }

        .site-app-shell .product-desktop-details summary,
        .site-app-shell .product-desktop-action,
        .site-app-shell .product-variant-option,
        .site-app-shell .product-variant-confirm {
          font-size: 11px !important;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .ruth-product-lightbox__zoom-stage {
          transition: none !important;
        }
      }
    `}</style>
  );
}
