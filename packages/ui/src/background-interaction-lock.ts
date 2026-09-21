"use client";

import * as React from "react";

type LockSnapshot = {
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyWidth: string;
  bodyPaddingRight: string;
  bodyOverscrollBehavior: string;
  htmlOverflow: string;
  htmlOverscrollBehavior: string;
};

let lockDepth = 0;
let snapshot: LockSnapshot | null = null;
let recoveryInstalled = false;

function applyBackgroundInteractionLock() {
  const body = document.body;
  const html = document.documentElement;
  const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);

  snapshot = {
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyWidth: body.style.width,
    bodyPaddingRight: body.style.paddingRight,
    bodyOverscrollBehavior: body.style.overscrollBehavior,
    htmlOverflow: html.style.overflow,
    htmlOverscrollBehavior: html.style.overscrollBehavior,
  };

  // Do not freeze the body with position:fixed. That pattern forces a full
  // layout/paint of long admin pages and can leave iOS/desktop browsers at a
  // stale fixed scroll position while an overlay is unmounting.
  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";
  html.style.overflow = "hidden";
  html.style.overscrollBehavior = "none";
  if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
}

function clearBackgroundInteractionLock() {
  if (!snapshot) return;

  const body = document.body;
  const html = document.documentElement;
  const previous = snapshot;
  snapshot = null;

  body.style.overflow = previous.bodyOverflow;
  body.style.position = previous.bodyPosition;
  body.style.top = previous.bodyTop;
  body.style.left = previous.bodyLeft;
  body.style.width = previous.bodyWidth;
  body.style.paddingRight = previous.bodyPaddingRight;
  body.style.overscrollBehavior = previous.bodyOverscrollBehavior;
  html.style.overflow = previous.htmlOverflow;
  html.style.overscrollBehavior = previous.htmlOverscrollBehavior;
}

/**
 * Hard recovery for a detached/unmounted overlay owner. The canonical overlay
 * stack emits `ruth-overlay-stack-change`; when it reaches zero there must not
 * be an overlay-owned page lock left behind.
 */
export function releaseAllBackgroundInteractionLocks() {
  lockDepth = 0;
  clearBackgroundInteractionLock();
}

function ensureRecoveryListeners() {
  if (recoveryInstalled || typeof document === "undefined") return;
  recoveryInstalled = true;

  document.addEventListener("ruth-overlay-stack-change", (event) => {
    const detail = (event as CustomEvent<{ active?: boolean }>).detail;
    if (detail?.active === false && lockDepth > 0) {
      releaseAllBackgroundInteractionLocks();
    }
  });

  window.addEventListener("pageshow", () => {
    if (!document.documentElement.hasAttribute("data-ruth-overlay-active") && lockDepth > 0) {
      releaseAllBackgroundInteractionLocks();
    }
  });
}

/**
 * Acquires the single shared background interaction lock.
 *
 * Nested callers share the same ref-counted lock. The lock only disables
 * background scrolling; it no longer changes the body's positioning or calls
 * scrollTo during cleanup, so opening/closing a popup does not trigger a large
 * synchronous relayout or a scroll jump.
 */
export function acquireBackgroundInteractionLock() {
  if (typeof document === "undefined") return () => undefined;

  ensureRecoveryListeners();
  if (lockDepth === 0) applyBackgroundInteractionLock();
  lockDepth += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockDepth = Math.max(0, lockDepth - 1);
    if (lockDepth === 0) clearBackgroundInteractionLock();
  };
}

export function isBackgroundInteractionLocked() {
  return lockDepth > 0;
}

export function useBackgroundInteractionLock(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    return acquireBackgroundInteractionLock();
  }, [active]);
}
