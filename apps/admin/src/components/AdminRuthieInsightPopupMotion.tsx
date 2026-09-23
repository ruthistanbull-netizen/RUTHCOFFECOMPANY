"use client";

import { useEffect } from "react";

const POPUP_SELECTOR = '[data-ruthie-insight-popup="true"]';
const BACKDROP_SELECTOR = 'button[aria-label="Ruthie sohbetini kapat"]';
const CLOSE_SELECTOR = 'button[aria-label="Kapat"]';
const MOBILE_QUERY = "(max-width: 767px)";
const EASING = "cubic-bezier(.22,1,.36,1)";

type MotionState = {
  phase: "opening" | "open" | "closing";
  animation: Animation | null;
};

function validTranslate(value: string | null | undefined) {
  return value && value !== "none" ? value : "0 0";
}

/**
 * Ruthie Insight used to have three simultaneous motion owners: Framer Motion,
 * a CSS keyframe and AdminBottomSheetGrowthMotion. That made the large surface
 * fight over transform/translate on iPhone and also allowed React to unmount the
 * dialog before a visible exit animation could complete.
 *
 * This bridge is now the only visual owner for the popup surface. React keeps
 * owning focus, portal state and dismissal. We intercept only dismissal input,
 * play the compositor-only exit first, then replay the real close action.
 */
export function AdminRuthieInsightPopupMotion() {
  useEffect(() => {
    const mobileMedia = window.matchMedia(MOBILE_QUERY);
    const reduceMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const states = new WeakMap<HTMLElement, MotionState>();
    const bound = new Set<HTMLElement>();
    let replayingClose = false;

    const durationFor = (closing = false) => {
      if (reduceMedia.matches) return 0;
      if (mobileMedia.matches) return closing ? 300 : 360;
      return closing ? 210 : 240;
    };

    const closedTranslate = () => mobileMedia.matches ? "0 100%" : "0 26px";

    const finishOpen = (element: HTMLElement) => {
      const state = states.get(element);
      if (!state || state.phase === "closing") return;
      state.phase = "open";
      state.animation = null;
      element.dataset.ruthieMotionPhase = "open";
      element.style.translate = "0 0";
      element.style.willChange = "auto";
    };

    const attach = (element: HTMLElement) => {
      if (bound.has(element)) return;
      bound.add(element);

      const state: MotionState = { phase: "opening", animation: null };
      states.set(element, state);
      element.dataset.ruthieMotionOwner = "canonical";
      element.dataset.ruthieMotionPhase = "opening";
      element.style.willChange = "translate";

      const from = closedTranslate();
      element.style.translate = from;

      if (reduceMedia.matches) {
        finishOpen(element);
        return;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const current = states.get(element);
          if (!current || current.phase !== "opening") return;
          current.animation = element.animate(
            [
              { translate: from },
              { translate: "0 0" },
            ],
            {
              duration: durationFor(false),
              easing: EASING,
              fill: "forwards",
            },
          );
          current.animation.addEventListener("finish", () => finishOpen(element), { once: true });
          current.animation.addEventListener("cancel", () => {
            const latest = states.get(element);
            if (latest?.phase === "opening") finishOpen(element);
          }, { once: true });
        });
      });
    };

    const findPopup = () => document.querySelector<HTMLElement>(POPUP_SELECTOR);

    const fadeBackdropImmediately = (backdrop: HTMLElement | null) => {
      if (!backdrop) return;

      // Framer also owns the backdrop opacity. During the previous close flow
      // its animation could repaint opacity:1 after our WAAPI fade had started,
      // leaving one dark frame after the sheet was already below the viewport.
      // Pin the current visual value with an inline !important transition and
      // fade it immediately so no standalone dark overlay can remain.
      const currentOpacity = getComputedStyle(backdrop).opacity || "1";
      backdrop.getAnimations().forEach((animation) => animation.cancel());
      backdrop.style.setProperty("opacity", currentOpacity, "important");
      backdrop.style.setProperty("transition", "opacity 110ms ease-out", "important");
      backdrop.style.setProperty("pointer-events", "none", "important");

      requestAnimationFrame(() => {
        backdrop.style.setProperty("opacity", "0", "important");
      });
    };

    const playClose = (element: HTMLElement, after: () => void) => {
      const state: MotionState = states.get(element) || { phase: "open", animation: null };
      states.set(element, state);
      if (state.phase === "closing") return;
      state.phase = "closing";
      state.animation?.cancel();
      element.dataset.ruthieMotionPhase = "closing";
      element.style.pointerEvents = "none";
      element.style.willChange = "translate";

      const layer = element.parentElement;
      const backdrop = layer?.querySelector<HTMLElement>(BACKDROP_SELECTOR) || null;
      fadeBackdropImmediately(backdrop);

      if (reduceMedia.matches) {
        after();
        return;
      }

      const from = validTranslate(getComputedStyle(element).translate);
      const to = closedTranslate();
      state.animation = element.animate(
        [
          { translate: from },
          { translate: to },
        ],
        {
          duration: durationFor(true),
          easing: EASING,
          fill: "forwards",
        },
      );

      const complete = () => {
        element.style.translate = to;
        state.animation = null;
        after();
      };
      state.animation.addEventListener("finish", complete, { once: true });
    };

    const replayButton = (button: HTMLButtonElement) => {
      const popup = findPopup();
      if (!popup) {
        replayingClose = true;
        button.click();
        replayingClose = false;
        return;
      }
      playClose(popup, () => {
        replayingClose = true;
        button.click();
        replayingClose = false;
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      if (replayingClose) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const popup = findPopup();
      if (!popup) return;

      const button = target.closest<HTMLButtonElement>(`${CLOSE_SELECTOR}, ${BACKDROP_SELECTOR}`);
      if (!button) return;
      const isPopupClose = button.matches(BACKDROP_SELECTOR) || popup.contains(button);
      if (!isPopupClose) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      replayButton(button);
    };

    const onClick = (event: MouseEvent) => {
      if (replayingClose) return;
      const popup = findPopup();
      if (!popup || popup.dataset.ruthieMotionPhase !== "closing") return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(`${CLOSE_SELECTOR}, ${BACKDROP_SELECTOR}`)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || replayingClose) return;
      const popup = findPopup();
      if (!popup) return;
      const close = popup.querySelector<HTMLButtonElement>(CLOSE_SELECTOR);
      if (!close) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      replayButton(close);
    };

    const scan = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches(POPUP_SELECTOR)) attach(node);
      node.querySelectorAll<HTMLElement>(POPUP_SELECTOR).forEach(attach);
    };

    document.querySelectorAll<HTMLElement>(POPUP_SELECTOR).forEach(attach);

    const treeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(scan);
        mutation.removedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          const removed = node.matches(POPUP_SELECTOR)
            ? [node]
            : Array.from(node.querySelectorAll<HTMLElement>(POPUP_SELECTOR));
          removed.forEach((element) => {
            const state = states.get(element);
            state?.animation?.cancel();
            bound.delete(element);
          });
        });
      }
    });
    treeObserver.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      treeObserver.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      bound.forEach((element) => states.get(element)?.animation?.cancel());
      bound.clear();
    };
  }, []);

  return null;
}
