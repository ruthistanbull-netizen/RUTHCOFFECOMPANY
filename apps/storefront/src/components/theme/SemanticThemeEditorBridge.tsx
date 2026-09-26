"use client";

import { useEffect, useRef } from "react";
import {
  COMPONENT_REGISTRY,
  STORE_DESIGN_MESSAGES,
  STORE_DESIGN_SCHEMA_VERSION,
  componentDefinition,
  type ComponentDefinition,
  type EditorScope,
} from "@ruth-commerce/commerce-core/store-design-v2";

type SemanticTarget = {
  id: string;
  type: string;
  label: string;
  instanceKey?: string;
  element: HTMLElement;
  definition: ComponentDefinition;
};

type ThemePatchMessage = {
  type: typeof STORE_DESIGN_MESSAGES.PATCH;
  targetId: string;
  path: string;
  value: unknown;
  revision: number;
};

const TARGET_SELECTOR = "[data-editor-id][data-editor-type]";
const LONG_PRESS_MS = 430;
const LONG_PRESS_TOLERANCE = 18;

function editorEnabled() {
  const params = new URLSearchParams(window.location.search);
  return params.get("themeEditor") === "1" && params.get("storeDesignV2") === "1";
}

function parentOrigin() {
  try {
    const referrer = document.referrer ? new URL(document.referrer).origin : "";
    if (!referrer) return "";

    const explicit = new URLSearchParams(window.location.search).get("editorOrigin");
    if (!explicit) return referrer;

    const explicitOrigin = new URL(explicit).origin;
    return explicitOrigin === referrer ? referrer : "";
  } catch {
    return "";
  }
}

function targetFrom(element: Element | null): SemanticTarget | null {
  if (!element) return null;
  const node = element.closest<HTMLElement>(TARGET_SELECTOR);
  if (!node) return null;
  const id = node.dataset.editorId?.trim();
  const type = node.dataset.editorType?.trim();
  if (!id || !type) return null;
  const definition = componentDefinition(type);
  if (!definition) return null;
  return {
    id,
    type,
    label: node.dataset.editorLabel?.trim() || definition.label,
    instanceKey: node.dataset.editorInstance?.trim() || undefined,
    element: node,
    definition,
  };
}

function targetFromEvent(event: Event) {
  for (const node of event.composedPath()) {
    if (!(node instanceof Element)) continue;
    const target = targetFrom(node);
    if (target) return target;
  }
  return null;
}

function breadcrumbs(target: SemanticTarget) {
  const chain: Array<{ id: string; type: string; label: string }> = [];
  let current: HTMLElement | null = target.element;
  const seen = new Set<string>();

  while (current) {
    const id = current.dataset.editorId?.trim();
    const type = current.dataset.editorType?.trim();
    if (id && type && !seen.has(id)) {
      const definition = componentDefinition(type);
      if (definition) {
        chain.unshift({
          id,
          type,
          label: current.dataset.editorLabel?.trim() || definition.label,
        });
        seen.add(id);
      }
    }
    current = current.parentElement?.closest<HTMLElement>(TARGET_SELECTOR) || null;
  }

  return chain;
}

function snapshot(target: SemanticTarget) {
  const computed = window.getComputedStyle(target.element);
  const rect = target.element.getBoundingClientRect();
  const media = target.element instanceof HTMLImageElement || target.element instanceof HTMLVideoElement
    ? target.element
    : null;

  return {
    visible: computed.display !== "none",
    textAlign: computed.textAlign,
    opacity: Number.parseFloat(computed.opacity || "1"),
    borderRadius: Number.parseFloat(computed.borderRadius || "0"),
    backgroundColor: computed.backgroundColor,
    color: computed.color,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    media: media ? {
      src: media.currentSrc || media.getAttribute("src") || "",
      objectFit: computed.objectFit || "cover",
      objectPosition: computed.objectPosition || "50% 50%",
    } : null,
  };
}

function allowedPatch(definition: ComponentDefinition, path: string) {
  const root = path.split(".")[0] || "";
  if (definition.protectedFields.includes(path) || definition.protectedFields.includes(root)) return false;

  if (root === "visible") return definition.controlGroups.includes("layout");
  if (root === "textAlign" || root === "color") return definition.controlGroups.includes("typography");
  if (root === "opacity" || root === "borderRadius" || root === "backgroundColor") {
    return definition.controlGroups.includes("layout") || definition.controlGroups.includes("card");
  }
  if (root === "media") return definition.controlGroups.includes("media");
  return false;
}

function applyPatch(target: SemanticTarget, message: ThemePatchMessage) {
  if (!allowedPatch(target.definition, message.path)) {
    return { ok: false, error: "Bu kontrol bu semantik bileşen için izinli değil." };
  }

  const { element } = target;
  switch (message.path) {
    case "visible":
      element.style.display = message.value === false ? "none" : "";
      return { ok: true };
    case "textAlign":
      if (!["left", "center", "right", "start", "end"].includes(String(message.value))) {
        return { ok: false, error: "Geçersiz hizalama." };
      }
      element.style.textAlign = String(message.value);
      return { ok: true };
    case "opacity": {
      const value = Number(message.value);
      if (!Number.isFinite(value) || value < 0 || value > 1) return { ok: false, error: "Opacity 0-1 aralığında olmalı." };
      element.style.opacity = String(value);
      return { ok: true };
    }
    case "borderRadius": {
      const value = Number(message.value);
      if (!Number.isFinite(value) || value < 0 || value > 120) return { ok: false, error: "Radius preset aralığı dışında." };
      element.style.borderRadius = `${value}px`;
      return { ok: true };
    }
    case "media.objectFit":
      if (!(element instanceof HTMLImageElement || element instanceof HTMLVideoElement)) return { ok: false, error: "Hedef medya değil." };
      if (!["cover", "contain"].includes(String(message.value))) return { ok: false, error: "Geçersiz medya fit değeri." };
      element.style.objectFit = String(message.value);
      return { ok: true };
    default:
      return { ok: false, error: "Bu patch yolu henüz runtime tarafından desteklenmiyor." };
  }
}

function routePath(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function SemanticThemeEditorBridge() {
  const selectedRef = useRef<SemanticTarget | null>(null);

  useEffect(() => {
    if (!editorEnabled() || window.parent === window) return;

    const expectedParentOrigin = parentOrigin();
    if (!expectedParentOrigin) return;

    const post = (payload: Record<string, unknown>) => {
      window.parent.postMessage(payload, expectedParentOrigin);
    };

    const overlay = document.createElement("div");
    overlay.dataset.storeDesignV2Ui = "true";
    overlay.style.cssText = [
      "position:fixed",
      "display:none",
      "pointer-events:none",
      "z-index:2147483646",
      "box-sizing:border-box",
      "border:2px solid #2563eb",
      "border-radius:6px",
      "background:rgba(37,99,235,.06)",
    ].join(";");
    document.body.appendChild(overlay);

    const positionOverlay = () => {
      const selected = selectedRef.current;
      if (!selected || !document.contains(selected.element)) {
        overlay.style.display = "none";
        return;
      }
      const rect = selected.element.getBoundingClientRect();
      overlay.style.display = "block";
      overlay.style.left = `${rect.left}px`;
      overlay.style.top = `${rect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    };

    const select = (target: SemanticTarget, pointer?: { x: number; y: number; kind: "mouse" | "touch" }) => {
      selectedRef.current = target;
      positionOverlay();
      post({
        type: STORE_DESIGN_MESSAGES.SELECT,
        schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
        route: window.location.pathname,
        target: {
          id: target.id,
          type: target.type,
          label: target.label,
          instanceKey: target.instanceKey,
          defaultScope: target.definition.defaultScope,
          allowedScopes: target.definition.allowedScopes,
          controlGroups: target.definition.controlGroups,
          protectedFields: target.definition.protectedFields,
          breadcrumb: breadcrumbs(target),
          current: snapshot(target),
        },
        pointer,
      });
    };

    const onContextMenu = (event: MouseEvent) => {
      const target = targetFromEvent(event);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      select(target, { x: event.clientX, y: event.clientY, kind: "mouse" });
    };

    const onClick = (event: MouseEvent) => {
      const target = targetFromEvent(event);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      select(target);
    };

    let longPressTimer = 0;
    let pressTarget: SemanticTarget | null = null;
    let pressX = 0;
    let pressY = 0;
    let pressTouchId: number | null = null;

    const clearPress = () => {
      window.clearTimeout(longPressTimer);
      longPressTimer = 0;
      pressTarget = null;
      pressTouchId = null;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return clearPress();
      const touch = event.touches.item(0);
      const target = targetFromEvent(event);
      if (!touch || !target) return;
      clearPress();
      pressTarget = target;
      pressX = touch.clientX;
      pressY = touch.clientY;
      pressTouchId = touch.identifier;
      longPressTimer = window.setTimeout(() => {
        if (pressTarget) select(pressTarget, { x: pressX, y: pressY, kind: "touch" });
        clearPress();
      }, LONG_PRESS_MS);
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
      if (!touch || Math.hypot(touch.clientX - pressX, touch.clientY - pressY) > LONG_PRESS_TOLERANCE) clearPress();
    };

    const onTouchEnd = () => clearPress();

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      if (expectedParentOrigin && event.origin !== expectedParentOrigin) return;

      if (event.data.type === STORE_DESIGN_MESSAGES.PATCH) {
        const message = event.data as ThemePatchMessage;
        const selected = selectedRef.current;
        const target = selected?.id === message.targetId
          ? selected
          : targetFrom(document.querySelector(`[data-editor-id="${CSS.escape(String(message.targetId || ""))}"]`));

        const result = target
          ? applyPatch(target, message)
          : { ok: false, error: "Semantik hedef bulunamadı." };

        if (target && result.ok) {
          selectedRef.current = target;
          positionOverlay();
        }

        post({
          type: STORE_DESIGN_MESSAGES.PATCH_APPLIED,
          targetId: message.targetId,
          revision: Number(message.revision || 0),
          ...result,
        });
        return;
      }

      if (event.data.type === STORE_DESIGN_MESSAGES.ROUTE_NAVIGATE) {
        const next = routePath(event.data.path);
        if (!next) return;
        const url = new URL(next, window.location.origin);
        url.searchParams.set("themeEditor", "1");
        url.searchParams.set("storeDesignV2", "1");
        const editorOrigin = new URLSearchParams(window.location.search).get("editorOrigin");
        if (editorOrigin) url.searchParams.set("editorOrigin", editorOrigin);
        window.location.assign(url.toString());
      }
    };

    const announceReady = () => {
      post({
        type: STORE_DESIGN_MESSAGES.READY,
        schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
        route: window.location.pathname,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        registeredTypes: COMPONENT_REGISTRY.map((item) => item.semanticType),
      });
    };

    const heartbeat = window.setInterval(() => {
      post({
        type: STORE_DESIGN_MESSAGES.HEARTBEAT,
        schemaVersion: STORE_DESIGN_SCHEMA_VERSION,
        route: window.location.pathname,
        at: Date.now(),
      });
    }, 5_000);

    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, true);
    document.addEventListener("touchcancel", onTouchEnd, true);
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", positionOverlay);
    window.addEventListener("scroll", positionOverlay, true);

    announceReady();

    return () => {
      window.clearInterval(heartbeat);
      clearPress();
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", positionOverlay);
      window.removeEventListener("scroll", positionOverlay, true);
      overlay.remove();
      selectedRef.current = null;
    };
  }, []);

  return null;
}
