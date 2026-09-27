"use client";

import { useEffect } from "react";
import { themePageKey, themeTemplatePageKey } from "@/lib/themeCustomizer";

const TARGET_QUERY = [
  "[data-theme-id]",
  "img",
  "video",
  "a",
  "button",
  "[role='button']",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "label",
  "strong",
  "small",
  "nav",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "div",
].join(",");

const CONTEXT_ID_ATTR = "data-ruth-theme-context-id";
const CONTEXT_TIME_ATTR = "data-ruth-theme-context-time";
const LONG_PRESS_MS = 340;
const LONG_PRESS_MOVE_TOLERANCE_PX = 18;

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function structuralPath(element: Element) {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body && parts.length < 12) {
    const parent = current.parentElement;
    const tag = current.tagName.toLowerCase();
    if (!parent) {
      parts.unshift(tag);
      break;
    }

    const peerElements: Element[] = [];
    for (let index = 0; index < parent.children.length; index += 1) {
      const child = parent.children.item(index);
      if (child && child.tagName === current.tagName) peerElements.push(child);
    }

    parts.unshift(`${tag}:${Math.max(0, peerElements.indexOf(current)) + 1}`);
    current = parent;
  }
  return parts.join("/");
}

function ensureThemeId(element: Element) {
  const existing = element.getAttribute("data-theme-id");
  if (existing) return existing;
  const scope = element.closest("header,footer") ? "global" : themeTemplatePageKey(window.location.pathname);
  const id = `auto-${hash(`${scope}:${structuralPath(element)}`)}`;
  element.setAttribute("data-theme-id", id);
  return id;
}

function editorTarget(raw: EventTarget | null) {
  if (!(raw instanceof Element)) return null;
  const target = raw.closest(TARGET_QUERY);
  if (!target) return null;
  if (target.closest("[data-ruth-theme-editor-ui]")) return null;
  return target;
}

function requestContext(element: Element, clientX: number, clientY: number, pointerType: "mouse" | "touch") {
  if (window.parent === window) return;
  const id = ensureThemeId(element);
  const rect = element.getBoundingClientRect();
  const section = element.closest<HTMLElement>("[data-theme-section-id]");
  const sectionId = section?.getAttribute("data-theme-section-id") || null;
  const sectionTarget = Boolean(section && (element === section || element.getAttribute("data-theme-section-id") === sectionId));

  document.documentElement.setAttribute(CONTEXT_ID_ATTR, id);
  document.documentElement.setAttribute(CONTEXT_TIME_ATTR, String(Date.now()));

  window.parent.postMessage({
    type: "RUTH_THEME_EDITOR_CONTEXT_REQUEST",
    pathname: themePageKey(window.location.pathname),
    id,
    sectionId,
    sectionTarget,
    pointerType,
    point: {
      x: Math.max(0, clientX),
      y: Math.max(0, clientY),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    },
    rect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    },
  }, "*");
}

export function ThemeEditorContextGestureBridge() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("themeEditor") !== "1") return;

    let longPressTimer = 0;
    let pressTarget: Element | null = null;
    let pressX = 0;
    let pressY = 0;
    let pressTouchId: number | null = null;
    let suppressClickUntil = 0;

    const style = document.createElement("style");
    style.dataset.ruthThemeGestureStyle = "true";
    style.textContent = `
      html[data-ruth-theme-gesture-active],
      html[data-ruth-theme-gesture-active] body,
      html[data-ruth-theme-gesture-active] body * {
        -webkit-touch-callout: none !important;
        -webkit-user-select: none !important;
        user-select: none !important;
      }
      html[data-ruth-theme-gesture-active] img,
      html[data-ruth-theme-gesture-active] video,
      html[data-ruth-theme-gesture-active] a {
        -webkit-user-drag: none !important;
        -webkit-touch-callout: none !important;
        -webkit-user-select: none !important;
        user-select: none !important;
        touch-action: pan-x pan-y !important;
      }
      html[data-ruth-theme-gesture-active] img,
      html[data-ruth-theme-gesture-active] video {
        -webkit-tap-highlight-color: transparent !important;
      }
    `;
    document.documentElement.setAttribute("data-ruth-theme-gesture-active", "true");
    document.head.appendChild(style);
    document.querySelectorAll<HTMLImageElement>("img").forEach((image) => image.setAttribute("draggable", "false"));

    const clearPress = () => {
      window.clearTimeout(longPressTimer);
      longPressTimer = 0;
      pressTarget = null;
      pressTouchId = null;
    };

    const fireLongPress = () => {
      if (!pressTarget) return;
      suppressClickUntil = Date.now() + 1000;
      requestContext(pressTarget, pressX, pressY, "touch");
      if (navigator.vibrate) navigator.vibrate(16);
      clearPress();
    };

    const stopNativeContext = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onContextMenu = (event: MouseEvent) => {
      const target = editorTarget(event.target);
      if (!target) return;
      stopNativeContext(event);
      if (Date.now() < suppressClickUntil) return;
      suppressClickUntil = Date.now() + 700;
      requestContext(target, event.clientX, event.clientY, "mouse");
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        clearPress();
        return;
      }
      const target = editorTarget(event.target);
      const touch = event.touches.item(0);
      if (!target || !touch) return;

      clearPress();
      pressTarget = target;
      pressX = touch.clientX;
      pressY = touch.clientY;
      pressTouchId = touch.identifier;
      longPressTimer = window.setTimeout(fireLongPress, LONG_PRESS_MS);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (pressTouchId === null || !pressTarget) return;
      let touch: Touch | null = null;
      for (let index = 0; index < event.touches.length; index += 1) {
        const candidate = event.touches.item(index);
        if (candidate?.identifier === pressTouchId) {
          touch = candidate;
          break;
        }
      }
      if (!touch) {
        clearPress();
        return;
      }
      if (Math.hypot(touch.clientX - pressX, touch.clientY - pressY) > LONG_PRESS_MOVE_TOLERANCE_PX) clearPress();
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (pressTouchId === null) return;
      for (let index = 0; index < event.changedTouches.length; index += 1) {
        if (event.changedTouches.item(index)?.identifier === pressTouchId) {
          clearPress();
          return;
        }
      }
    };

    const onClickCapture = (event: MouseEvent) => {
      if (Date.now() > suppressClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const onDragStart = (event: DragEvent) => {
      if (!editorTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const onSelectStart = (event: Event) => {
      if (!editorTarget(event.target)) return;
      event.preventDefault();
    };

    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, true);
    document.addEventListener("touchcancel", onTouchEnd, true);
    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("selectstart", onSelectStart, true);

    return () => {
      clearPress();
      document.documentElement.removeAttribute("data-ruth-theme-gesture-active");
      document.documentElement.removeAttribute(CONTEXT_ID_ATTR);
      document.documentElement.removeAttribute(CONTEXT_TIME_ATTR);
      style.remove();
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("selectstart", onSelectStart, true);
    };
  }, []);

  return null;
}
