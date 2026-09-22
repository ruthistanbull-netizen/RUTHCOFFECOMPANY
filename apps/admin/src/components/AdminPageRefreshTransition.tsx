"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  beginInteraction,
  cancelInteraction,
  endInteraction,
  isBackgroundInteractionLocked,
  moveInteraction,
  type InteractionCandidate,
} from "@ruth-commerce/ui";
import { RuthieBrandIcon } from "@/components/RuthieBrandIcon";

const TRIGGER_PULL_PX = 92;
const MAX_PULL_PX = 124;
const HOLD_PULL_PX = 54;
const TOUCH_DEAD_ZONE_PX = 18;
const TOP_TOLERANCE_PX = 1;
const REFRESH_VISUAL_MS = 680;
const DONE_HOLD_MS = 260;
const REFRESH_SESSION_KEY = "ruth_admin_sdr_refresh";
const VISUAL_HEIGHT_PX = 100;

const PULL_INTERACTION_POLICY = {
  axis: "y" as const,
  customDrag: true,
  touchDragHoldMs: 1,
  tapSlopPx: 8,
  dragThresholdPx: TOUCH_DEAD_ZONE_PX,
  scrollThresholdPx: TOUCH_DEAD_ZONE_PX,
};

const BLOCKING_LAYER_SELECTOR = [
  "[data-exact-workspace-layer]",
  "[data-exact-select-layer]",
  "[data-ruth-liquid-date-layer]",
  "[role='dialog'][aria-modal='true']",
  "aside[class*='z-drawer']",
  "[class~='z-command']",
  "[data-ruthie-immersive-root]",
  "[data-theme-editor-immersive-root]",
].join(",");

const TEXT_ENTRY_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[data-no-pull-refresh]",
].join(",");

type NavigatorWithVibration = Navigator & { vibrate?: (pattern: number | number[]) => boolean };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function elementIsVisible(element: Element) {
  if (!(element instanceof HTMLElement)) return true;
  if (element.dataset.state === "closed" || element.getAttribute("aria-hidden") === "true") return false;
  const style = window.getComputedStyle(element);
  if (
    style.display === "none"
    || style.visibility === "hidden"
    || style.pointerEvents === "none"
    || Number(style.opacity || 1) <= 0.01
  ) return false;
  return element.getClientRects().length > 0;
}

function hasBlockingLayer() {
  return Array.from(document.querySelectorAll(BLOCKING_LAYER_SELECTOR)).some(elementIsVisible);
}

function isMobileTouchViewport() {
  return window.matchMedia("(max-width: 1023px) and (pointer: coarse)").matches;
}

function pageScrollTop() {
  return Math.max(
    0,
    window.scrollY || 0,
    document.documentElement.scrollTop || 0,
    document.body.scrollTop || 0,
  );
}

function isScrollableY(element: HTMLElement) {
  if (element.scrollHeight <= element.clientHeight + 1) return false;
  const overflowY = window.getComputedStyle(element).overflowY;
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

function hasScrollableAncestorAwayFromTop(target: Element | null) {
  let current: HTMLElement | null = target instanceof HTMLElement ? target : target?.parentElement ?? null;

  while (current && current !== document.body && current !== document.documentElement) {
    if (isScrollableY(current) && current.scrollTop > TOP_TOLERANCE_PX) return true;
    current = current.parentElement;
  }

  return false;
}

function resistedPull(rawDistance: number) {
  const activeDistance = Math.max(0, rawDistance - TOUCH_DEAD_ZONE_PX);
  const eased = MAX_PULL_PX * (1 - Math.exp(-activeDistance / (MAX_PULL_PX * 0.78)));
  return clamp(eased, 0, MAX_PULL_PX);
}

function vibrate(pattern: number | number[]) {
  try {
    (navigator as NavigatorWithVibration).vibrate?.(pattern);
  } catch {
    // iOS Safari ignores the Vibration API; visual feedback remains available.
  }
}

export function AdminPageRefreshTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const indicator = indicatorRef.current;
    const label = labelRef.current;
    const main = document.querySelector<HTMLElement>("main");
    if (!indicator || !label || !main || !isMobileTouchViewport()) return;

    const root = document.documentElement;
    const body = document.body;
    const previousRootOverscroll = root.style.overscrollBehaviorY;
    const previousBodyOverscroll = body.style.overscrollBehaviorY;

    root.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";

    let touchIdentifier: number | null = null;
    let interaction: InteractionCandidate | null = null;
    let pullOwned = false;
    let armed = false;
    let refreshing = false;
    let currentPull = 0;
    const timers: number[] = [];

    const setTimer = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(callback, delay);
      timers.push(timer);
      return timer;
    };

    const setState = (state: "idle" | "pulling" | "armed" | "loading" | "done", copy: string) => {
      indicator.dataset.state = state;
      label.textContent = copy;
    };

    const applyPull = (pull: number, withTransition = false) => {
      currentPull = clamp(pull, 0, MAX_PULL_PX);
      const progress = clamp(currentPull / TRIGGER_PULL_PX, 0, 1);
      const reveal = progress * VISUAL_HEIGHT_PX;
      const visualY = -VISUAL_HEIGHT_PX + reveal;
      const contentOffset = progress * VISUAL_HEIGHT_PX;
      const arrowOpacity = clamp(progress * 1.5, 0, 1);

      indicator.style.setProperty("--ptr-progress", progress.toFixed(4));
      indicator.style.setProperty("--ptr-visual-y", `${visualY.toFixed(2)}px`);
      indicator.style.setProperty("--ptr-arrow-opacity", arrowOpacity.toFixed(4));
      main.style.setProperty("--admin-ptr-content-offset", `${contentOffset.toFixed(2)}px`);
      main.dataset.adminPtrMoving = "true";

      if (withTransition) {
        indicator.dataset.transitioning = "true";
        main.dataset.adminPtrTransitioning = "true";
      } else {
        delete indicator.dataset.transitioning;
        delete main.dataset.adminPtrTransitioning;
      }
    };

    const clearPull = (withTransition = true) => {
      applyPull(0, withTransition);
      const finish = () => {
        delete indicator.dataset.transitioning;
        delete main.dataset.adminPtrMoving;
        delete main.dataset.adminPtrTransitioning;
        main.style.removeProperty("--admin-ptr-content-offset");
      };
      if (withTransition) setTimer(finish, 280);
      else finish();
    };

    const resetIdle = (withTransition = true) => {
      armed = false;
      pullOwned = false;
      setState("idle", "Yenilemek için çek");
      clearPull(withTransition);
    };

    const clearGesture = (cancelCandidate = false) => {
      if (cancelCandidate && interaction?.phase === "candidate") cancelInteraction(interaction);
      touchIdentifier = null;
      interaction = null;
      pullOwned = false;
      armed = false;
    };

    const holdLoadingVisual = () => {
      indicator.style.setProperty("--ptr-progress", "1");
      indicator.style.setProperty("--ptr-visual-y", "0px");
      indicator.style.setProperty("--ptr-arrow-opacity", "0");
      main.style.setProperty("--admin-ptr-content-offset", `${VISUAL_HEIGHT_PX}px`);
      indicator.dataset.transitioning = "true";
      main.dataset.adminPtrMoving = "true";
      main.dataset.adminPtrTransitioning = "true";
    };

    const triggerRefresh = () => {
      if (refreshing) return;
      refreshing = true;
      armed = false;
      pullOwned = false;
      setState("loading", "Yenileniyor…");
      applyPull(HOLD_PULL_PX, true);
      holdLoadingVisual();
      vibrate(10);

      try {
        window.sessionStorage.setItem(REFRESH_SESSION_KEY, String(Date.now()));
      } catch {
        // Storage restrictions must never block refresh.
      }

      window.dispatchEvent(new CustomEvent("ruth:pull-refresh"));
      router.refresh();

      setTimer(() => {
        setState("done", "Tamamlandı");
        holdLoadingVisual();
        setTimer(() => {
          refreshing = false;
          resetIdle(true);
        }, DONE_HOLD_MS);
      }, REFRESH_VISUAL_MS);
    };

    const canBeginPull = (target: EventTarget | null) => {
      if (refreshing || isBackgroundInteractionLocked() || hasBlockingLayer()) return false;
      if (pageScrollTop() > TOP_TOLERANCE_PX) return false;

      const element = target instanceof Element ? target : null;
      if (!element || element.closest(TEXT_ENTRY_SELECTOR)) return false;
      if (hasScrollableAncestorAwayFromTop(element)) return false;

      return true;
    };

    const cancelTracking = () => {
      clearGesture(true);
      if (!refreshing && currentPull > 0) resetIdle(true);
    };

    const onTouchStart = (event: TouchEvent) => {
      clearGesture(true);
      if (event.touches.length !== 1 || !canBeginPull(event.target)) return;

      const touch = event.touches[0];
      touchIdentifier = touch.identifier;
      interaction = beginInteraction({
        pointerType: "touch",
        x: touch.clientX,
        y: touch.clientY,
        at: event.timeStamp || performance.now(),
        startedOnHandle: true,
      });
    };

    const onTouchMove = (event: TouchEvent) => {
      if (touchIdentifier === null || !interaction || refreshing) return;
      if (event.touches.length !== 1 || isBackgroundInteractionLocked()) {
        cancelTracking();
        return;
      }

      const touch = Array.from(event.touches).find((item) => item.identifier === touchIdentifier);
      if (!touch) return;

      const deltaY = touch.clientY - interaction.start.y;
      if (!pullOwned && deltaY <= 0) return;
      if (pageScrollTop() > TOP_TOLERANCE_PX || hasBlockingLayer()) {
        cancelTracking();
        return;
      }

      const resolution = moveInteraction(
        interaction,
        { x: touch.clientX, y: touch.clientY, at: event.timeStamp || performance.now() },
        PULL_INTERACTION_POLICY,
      );

      if (resolution.phase === "candidate") return;
      if (resolution.phase !== "custom-drag") {
        cancelTracking();
        return;
      }

      if (!pullOwned) {
        pullOwned = true;
        setState("pulling", "Yenilemek için çek");
      }

      if (resolution.deltaY <= 0) {
        resetIdle(false);
        return;
      }

      event.preventDefault();
      const pull = resistedPull(resolution.deltaY);
      applyPull(pull, false);

      const nextArmed = pull >= TRIGGER_PULL_PX;
      if (nextArmed && !armed) {
        armed = true;
        setState("armed", "Bırak, yenilensin");
        vibrate(7);
      } else if (!nextArmed && armed) {
        armed = false;
        setState("pulling", "Yenilemek için çek");
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (touchIdentifier === null || !interaction) return;
      const endedTouch = Array.from(event.changedTouches).find((item) => item.identifier === touchIdentifier);
      if (!endedTouch) return;

      const resolution = endInteraction(
        interaction,
        { x: endedTouch.clientX, y: endedTouch.clientY, at: event.timeStamp || performance.now() },
        PULL_INTERACTION_POLICY,
      );
      const shouldRefresh =
        !refreshing &&
        pullOwned &&
        resolution.phase === "custom-drag" &&
        armed &&
        currentPull >= TRIGGER_PULL_PX;

      clearGesture(false);

      if (shouldRefresh) {
        triggerRefresh();
        return;
      }

      if (!refreshing) resetIdle(true);
    };

    const onTouchCancel = () => {
      clearGesture(true);
      if (!refreshing) resetIdle(true);
    };

    const onResize = () => {
      if (!isMobileTouchViewport()) {
        clearGesture(true);
        refreshing = false;
        resetIdle(false);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      clearGesture(true);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
      window.removeEventListener("resize", onResize);
      for (const timer of timers) window.clearTimeout(timer);
      root.style.overscrollBehaviorY = previousRootOverscroll;
      body.style.overscrollBehaviorY = previousBodyOverscroll;
      delete main.dataset.adminPtrMoving;
      delete main.dataset.adminPtrTransitioning;
      main.style.removeProperty("--admin-ptr-content-offset");
    };
  }, [router]);

  useEffect(() => {
    const indicator = indicatorRef.current;
    const main = document.querySelector<HTMLElement>("main");
    if (!indicator || !main) return;

    indicator.dataset.state = "idle";
    indicator.style.setProperty("--ptr-progress", "0");
    indicator.style.setProperty("--ptr-visual-y", `-${VISUAL_HEIGHT_PX}px`);
    indicator.style.setProperty("--ptr-arrow-opacity", "0");
    delete indicator.dataset.transitioning;
    delete main.dataset.adminPtrMoving;
    delete main.dataset.adminPtrTransitioning;
    main.style.removeProperty("--admin-ptr-content-offset");
  }, [pathname]);

  return (
    <>
      <div
        ref={indicatorRef}
        id="admin-character-ptr"
        data-state="idle"
        aria-live="polite"
        aria-atomic="true"
      >
        <svg data-ptr-arrow viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.35" d="M12 4v15M6.5 13.5 12 19l5.5-5.5" />
        </svg>

        <span data-ruthie-refresh-logo aria-hidden="true">
          <RuthieBrandIcon size={62} strokeWidth={1.35} />
        </span>

        <span ref={labelRef} data-ptr-accessible-label>Yenilemek için çek</span>
      </div>

      <style jsx global>{`
        @keyframes admin-ruthie-character-wiggle {
          0% {
            transform: translate3d(-2px, 1px, 0) rotate(-7deg);
          }
          100% {
            transform: translate3d(4px, -1px, 0) rotate(5deg);
          }
        }

        #admin-character-ptr {
          --ptr-progress: 0;
          --ptr-visual-y: -${VISUAL_HEIGHT_PX}px;
          --ptr-arrow-opacity: 0;
          position: fixed;
          z-index: 2147482500;
          top: 0;
          left: 0;
          width: 100%;
          height: ${VISUAL_HEIGHT_PX}px;
          overflow: hidden;
          pointer-events: none;
          user-select: none;
          background: #222;
          color: #fff;
          text-align: center;
          transform: translate3d(0, var(--ptr-visual-y), 0);
          will-change: transform;
        }

        #admin-character-ptr[data-transitioning="true"] {
          transition: transform .25s ease;
        }

        #admin-character-ptr [data-ptr-arrow] {
          position: absolute;
          z-index: 2;
          top: 50px;
          left: 50%;
          width: 24px;
          height: 24px;
          fill: none;
          stroke: currentColor;
          opacity: var(--ptr-arrow-opacity);
          transform: translate3d(-50%, -50%, 0) rotate(0deg);
          transform-origin: center;
          transition: transform .2s ease-out, opacity .15s ease-in-out;
        }

        #admin-character-ptr[data-state="armed"] [data-ptr-arrow] {
          transform: translate3d(-50%, -50%, 0) rotate(180deg);
        }

        #admin-character-ptr [data-ruthie-refresh-logo] {
          position: absolute;
          z-index: 1;
          top: 50%;
          left: 50%;
          width: 75px;
          height: 75px;
          display: grid;
          place-items: center;
          color: #fff;
          opacity: 0;
          transform: translate3d(-50%, -50%, 0);
          transition: opacity .15s ease-in-out;
          filter: drop-shadow(0 4px 12px rgba(0, 0, 0, .18));
        }

        #admin-character-ptr [data-ruthie-refresh-logo] > svg {
          width: 62px;
          height: 62px;
        }

        #admin-character-ptr[data-state="loading"] [data-ruthie-refresh-logo],
        #admin-character-ptr[data-state="done"] [data-ruthie-refresh-logo] {
          opacity: 1;
        }

        #admin-character-ptr[data-state="loading"] [data-ruthie-refresh-logo] > svg {
          animation: admin-ruthie-character-wiggle .45s ease-in-out infinite alternate;
          transform-origin: 50% 50%;
        }

        #admin-character-ptr[data-state="loading"] [data-ptr-arrow],
        #admin-character-ptr[data-state="done"] [data-ptr-arrow] {
          opacity: 0;
        }

        #admin-character-ptr [data-ptr-accessible-label] {
          position: absolute !important;
          width: 1px !important;
          height: 1px !important;
          padding: 0 !important;
          margin: -1px !important;
          overflow: hidden !important;
          clip: rect(0, 0, 0, 0) !important;
          white-space: nowrap !important;
          border: 0 !important;
        }

        main[data-admin-ptr-moving="true"] {
          translate: 0 var(--admin-ptr-content-offset, 0px);
          will-change: translate;
        }

        main[data-admin-ptr-transitioning="true"] {
          transition: translate .25s ease;
        }

        @media (min-width: 1024px), (pointer: fine) {
          #admin-character-ptr {
            display: none !important;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          #admin-character-ptr,
          #admin-character-ptr *,
          main[data-admin-ptr-moving="true"] {
            animation-duration: 1ms !important;
            transition-duration: 1ms !important;
          }
        }
      `}</style>
    </>
  );
}
