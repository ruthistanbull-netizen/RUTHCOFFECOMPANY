"use client";

import { useEffect } from "react";

const RECOVERY_KEY = "ruth_admin_navigation_recovery_v2";
const RECOVERY_WINDOW_MS = 12_000;
const MAX_RECOVERY_ATTEMPTS = 2;

function errorText(value: unknown) {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
}

function isRecoverableNavigationFailure(value: unknown) {
  const message = errorText(value).toLowerCase();
  return (
    message.includes("connection closed") ||
    message.includes("react error #412") ||
    message.includes("minified react error #412") ||
    message.includes("failed to fetch rsc payload") ||
    message.includes("failed to fetch server response") ||
    message.includes("failed to fetch") ||
    message.includes("chunkloaderror") ||
    message.includes("loading chunk") ||
    message.includes("dynamically imported module") ||
    message.includes("rsc payload") ||
    message.includes("networkerror")
  );
}

function isStandaloneIos() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  const standalone =
    navigatorWithStandalone.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return standalone && ios;
}

function safeUrl(value: string | URL | null | undefined) {
  if (value == null) return null;
  try {
    const url = new URL(String(value), window.location.href);
    if (url.origin !== window.location.origin) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function routeTarget(url: URL) {
  return `${url.pathname}${url.search}${url.hash}`;
}

function isCrossPageTarget(url: URL) {
  return url.pathname !== window.location.pathname;
}

function anchorFromEvent(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  return target?.closest("a[href]") as HTMLAnchorElement | null;
}

function shouldTrackNavigation(event: MouseEvent, anchor: HTMLAnchorElement, url: URL) {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.hasAttribute("download")) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  return isCrossPageTarget(url);
}

function markHubInternalDocumentHandoff() {
  try {
    const hasWorkspace =
      window.sessionStorage.getItem("rosta_panel_hub_entered_v1") === "1" ||
      window.sessionStorage.getItem("rr_hub_ruth_entered_v1") === "1";
    if (hasWorkspace) window.sessionStorage.setItem("rr_hub_pwa_handoff_v1", "1");
  } catch {}
}

function armHubInternalDocumentHandoff() {
  markHubInternalDocumentHandoff();
  window.setTimeout(() => {
    try {
      window.sessionStorage.removeItem("rr_hub_pwa_handoff_v1");
    } catch {}
  }, 1500);
}

export function AdminNavigationRecovery() {
  useEffect(() => {
    let pendingTarget: string | null = null;
    let reloadTimer = 0;
    let lastDocumentPath = window.location.pathname;

    const rememberTarget = (value: string | URL | null | undefined) => {
      const url = safeUrl(value);
      if (!url) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      pendingTarget = routeTarget(url);
    };

    // Keep normal Next.js SPA navigation as the primary path. Forcing every
    // cross-page tap into a document navigation makes standalone/PWA shells look
    // like a fresh launch and can send the user back to RR HUB. We only remember
    // the intended destination here; a document request remains a recovery path.
    const onDocumentClick = (event: MouseEvent) => {
      const anchor = anchorFromEvent(event);
      if (!anchor) return;
      const url = safeUrl(anchor.href);
      if (!url || !shouldTrackNavigation(event, anchor, url)) return;
      pendingTarget = routeTarget(url);
      // Raw <a> links still perform a real document navigation. Arm a short-lived
      // handoff marker so a same-panel document load is not mistaken for a cold
      // standalone launch. Successful SPA transitions clear the marker shortly after.
      armHubInternalDocumentHandoff();
    };

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = ((data: unknown, unused: string, url?: string | URL | null) => {
      rememberTarget(url);
      originalPushState(data, unused, url);
    }) as History["pushState"];

    window.history.replaceState = ((data: unknown, unused: string, url?: string | URL | null) => {
      rememberTarget(url);
      originalReplaceState(data, unused, url);
    }) as History["replaceState"];

    const recover = (reason: unknown) => {
      if (!isRecoverableNavigationFailure(reason)) return;
      if (reloadTimer) return;

      const target = pendingTarget || `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const now = Date.now();
      let attempts = 1;

      try {
        const previous = JSON.parse(window.sessionStorage.getItem(RECOVERY_KEY) || "null") as { target?: string; at?: number; attempts?: number } | null;
        if (previous?.target === target && typeof previous.at === "number" && now - previous.at < RECOVERY_WINDOW_MS) {
          attempts = Math.max(1, Number(previous.attempts || 1) + 1);
          if (attempts > MAX_RECOVERY_ATTEMPTS) return;
        }
        window.sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ target, at: now, attempts }));
      } catch {
        // sessionStorage may be unavailable in hardened/private contexts.
      }

      reloadTimer = window.setTimeout(() => {
        const destination = safeUrl(target);
        markHubInternalDocumentHandoff();
        if (destination) window.location.assign(destination.href);
        else window.location.reload();
      }, 20);
    };

    const onError = (event: ErrorEvent) => recover(event.error || event.message);
    const onUnhandledRejection = (event: PromiseRejectionEvent) => recover(event.reason);

    // Back/forward should stay client-side too. Track the destination so the
    // same recovery fallback can be used only if the RSC transition actually fails.
    const onPopState = () => {
      if (window.location.pathname === lastDocumentPath) return;
      lastDocumentPath = window.location.pathname;
      pendingTarget = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    };

    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("popstate", onPopState);

    // Keep this capability marker because standalone iOS was the original
    // failure surface; all platforms now share the safer cross-page strategy.
    void isStandaloneIos();

    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("popstate", onPopState);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      if (reloadTimer) window.clearTimeout(reloadTimer);
    };
  }, []);

  return null;
}
