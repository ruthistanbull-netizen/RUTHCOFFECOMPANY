"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const LIQUID_GL_MODULE = "https://cdn.jsdelivr.net/npm/liquid-gl@2.0.1/+esm";
const QUICK_LIQUID_MODULE = "https://cdn.jsdelivr.net/npm/quick-liquid@0.1.1/+esm";
const DOCK_SELECTOR = 'nav[aria-label="ROSTA Coffee Co. mobil menü"]';

type LiquidGLRenderer = {
  canvas?: HTMLCanvasElement;
  captureSnapshot?: () => Promise<boolean> | void;
};

type LiquidGLLens = {
  renderer?: LiquidGLRenderer;
};

type LiquidGLFunction = ((options: Record<string, unknown>) => LiquidGLLens | LiquidGLLens[] | void) & {
  registerDynamic?: (elements: string | Element | Element[]) => void;
};

type LiquidGLModule = { default?: LiquidGLFunction };

type QuickSpring = {
  setTarget: (target: number) => void;
  tick: (now: number) => boolean;
  readonly value: number;
};

type QuickSpringConstructor = new (
  initialValue?: number,
  config?: string | Record<string, number | boolean>,
) => QuickSpring;

type QuickLiquidModule = { Spring?: QuickSpringConstructor };

declare global {
  interface Window {
    liquidGL?: LiquidGLFunction;
    __liquidGLRenderer__?: LiquidGLRenderer;
  }
}

function remoteImport<T>(url: string) {
  return import(/* webpackIgnore: true */ url) as Promise<T>;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function activeButton(nav: HTMLElement) {
  return nav.querySelector<HTMLButtonElement>('button[data-dock-index][aria-current="page"]');
}

function syncFixedLensHost(host: HTMLElement, indicator: HTMLElement) {
  const rect = indicator.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  host.style.left = `${rect.left}px`;
  host.style.top = `${rect.top}px`;
  host.style.width = `${rect.width}px`;
  host.style.height = `${rect.height}px`;
  host.style.borderRadius = getComputedStyle(indicator).borderRadius || "24px";
}

function positionAnchor(anchor: HTMLElement, track: HTMLElement, button: HTMLElement | null) {
  if (!button) return;
  const trackRect = track.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const width = Math.min(44, Math.max(34, buttonRect.width * 0.5));
  const height = Math.min(48, Math.max(38, trackRect.height - 14));

  anchor.style.width = `${width}px`;
  anchor.style.height = `${height}px`;
  anchor.style.left = `${buttonRect.left - trackRect.left + buttonRect.width / 2 - width / 2}px`;
  anchor.style.top = `${(trackRect.height - height) / 2}px`;
  anchor.dataset.dockIndex = button.dataset.dockIndex ?? "";
}

function renderBridge(
  path: SVGPathElement,
  svg: SVGSVGElement,
  track: HTMLElement,
  anchor: HTMLElement,
  fixedLensHost: HTMLElement,
  strengthInput: number,
) {
  const trackRect = track.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const lensRect = fixedLensHost.getBoundingClientRect();
  if (!trackRect.width || !anchorRect.width || !lensRect.width) {
    path.setAttribute("d", "");
    return;
  }

  svg.setAttribute("viewBox", `0 0 ${trackRect.width} ${trackRect.height}`);

  const aX = anchorRect.left - trackRect.left + anchorRect.width / 2;
  const aY = anchorRect.top - trackRect.top + anchorRect.height / 2;
  const bX = lensRect.left - trackRect.left + lensRect.width / 2;
  const bY = lensRect.top - trackRect.top + lensRect.height / 2;
  const aR = Math.min(anchorRect.width, anchorRect.height) * 0.43;
  const bR = Math.min(lensRect.width, lensRect.height) * 0.43;
  const dx = bX - aX;
  const dy = bY - aY;
  const distance = Math.hypot(dx, dy);

  if (distance < 1) {
    path.setAttribute("d", "");
    return;
  }

  const gap = Math.max(0, distance - aR - bR);
  const proximity = clamp(1 - gap / 92, 0, 1);
  const strength = clamp(strengthInput, 0, 1) * proximity;
  if (strength < 0.03) {
    path.setAttribute("d", "");
    return;
  }

  const ux = dx / distance;
  const uy = dy / distance;
  const px = -uy;
  const py = ux;
  const aW = aR * (0.32 + strength * 0.28);
  const bW = bR * (0.32 + strength * 0.28);
  const pull = Math.min(distance * 0.46, 42) * (0.58 + strength * 0.42);

  const aTop = [aX + px * aW, aY + py * aW];
  const aBottom = [aX - px * aW, aY - py * aW];
  const bTop = [bX + px * bW, bY + py * bW];
  const bBottom = [bX - px * bW, bY - py * bW];

  path.setAttribute(
    "d",
    [
      `M ${aTop[0]} ${aTop[1]}`,
      `C ${aTop[0] + ux * pull} ${aTop[1] + uy * pull}, ${bTop[0] - ux * pull} ${bTop[1] - uy * pull}, ${bTop[0]} ${bTop[1]}`,
      `C ${bX + px * bW * 0.28} ${bY + py * bW * 0.28}, ${bX - px * bW * 0.28} ${bY - py * bW * 0.28}, ${bBottom[0]} ${bBottom[1]}`,
      `C ${bBottom[0] - ux * pull} ${bBottom[1] - uy * pull}, ${aBottom[0] + ux * pull} ${aBottom[1] + uy * pull}, ${aBottom[0]} ${aBottom[1]}`,
      `C ${aX - px * aW * 0.28} ${aY - py * aW * 0.28}, ${aX + px * aW * 0.28} ${aY + py * aW * 0.28}, ${aTop[0]} ${aTop[1]}`,
      "Z",
    ].join(" "),
  );
  path.style.opacity = String(clamp(strength * 0.82, 0, 0.82));
}

export function LiquidDockHybridEnhancerV2() {
  const pathname = usePathname();

  useEffect(() => {
    let disposed = false;
    let rootObserver: MutationObserver | null = null;
    let motionObserver: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let geometryFrame = 0;
    let bridgeFrame = 0;
    let bridgeUntil = 0;
    let bridgeSpring: QuickSpring | null = null;
    let springTarget = 0;
    let lens: LiquidGLLens | null = null;
    let nav: HTMLElement | null = null;
    let track: HTMLElement | null = null;
    let indicatorSlot: HTMLElement | null = null;
    let indicator: HTMLElement | null = null;
    let fixedLensHost: HTMLElement | null = null;
    let anchor: HTMLElement | null = null;
    let bridgeSvg: SVGSVGElement | null = null;
    let bridgePath: SVGPathElement | null = null;
    let fallbackGlass: HTMLElement | null = null;
    let fallbackOpacity = "";
    let detachInteractions: (() => void) | null = null;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 1023px)");

    const setSpringTarget = (target: number) => {
      if (!bridgeSpring || springTarget === target) return;
      springTarget = target;
      bridgeSpring.setTarget(target);
    };

    const syncGeometry = () => {
      geometryFrame = 0;
      if (!indicator || !fixedLensHost) return;
      syncFixedLensHost(fixedLensHost, indicator);
    };

    const scheduleGeometry = () => {
      if (!geometryFrame) geometryFrame = window.requestAnimationFrame(syncGeometry);
    };

    const isMoving = () => {
      if (!nav || !indicatorSlot) return false;
      const navClass = String(nav.className);
      const slotClass = String(indicatorSlot.className);
      return navClass.includes("dragging") || navClass.includes("interacting") || slotClass.includes("moving") || slotClass.includes("dragging");
    };

    const bridgeLoop = (now: number) => {
      if (!nav || !track || !anchor || !fixedLensHost || !bridgeSvg || !bridgePath) {
        bridgeFrame = 0;
        return;
      }

      scheduleGeometry();
      const moving = isMoving();
      const button = activeButton(nav);

      if (moving) {
        setSpringTarget(1);
        if (button?.dataset.dockIndex !== anchor.dataset.dockIndex) positionAnchor(anchor, track, button);
      } else if (now >= bridgeUntil) {
        setSpringTarget(0);
      }

      const springRunning = bridgeSpring?.tick(now) ?? false;
      const strength = bridgeSpring?.value ?? (moving || now < bridgeUntil ? 1 : 0);
      renderBridge(bridgePath, bridgeSvg, track, anchor, fixedLensHost, strength);

      if (moving || now < bridgeUntil || springRunning || strength > 0.03) {
        bridgeFrame = window.requestAnimationFrame(bridgeLoop);
      } else {
        bridgePath.setAttribute("d", "");
        positionAnchor(anchor, track, button);
        bridgeFrame = 0;
      }
    };

    const wake = () => {
      if (!nav || reducedMotion) return;
      setSpringTarget(1);
      bridgeUntil = Math.max(bridgeUntil, performance.now() + 620);
      scheduleGeometry();
      if (!bridgeFrame) bridgeFrame = window.requestAnimationFrame(bridgeLoop);
    };

    const setup = async (nextNav: HTMLElement) => {
      if (disposed || !mobile.matches || nextNav.dataset.ruthHybridLiquidV2) return;

      const nextTrack = nextNav.querySelector<HTMLElement>(":scope > div");
      const nextSlot = nextTrack?.querySelector<HTMLElement>(":scope > span:first-child");
      const nextIndicator = nextSlot?.querySelector<HTMLElement>(":scope > span:first-child");
      if (!nextTrack || !nextSlot || !nextIndicator) return;

      nav = nextNav;
      track = nextTrack;
      indicatorSlot = nextSlot;
      indicator = nextIndicator;
      nextNav.dataset.ruthHybridLiquidV2 = "loading";

      const host = document.createElement("div");
      host.dataset.ruthLiquidglFixedLens = "active";
      host.setAttribute("aria-hidden", "true");
      Object.assign(host.style, {
        position: "fixed",
        pointerEvents: "none",
        zIndex: "2147483599",
        overflow: "hidden",
        background: "transparent",
        transform: "translateZ(0)",
        willChange: "left, top, width, height",
      });
      document.body.appendChild(host);
      fixedLensHost = host;
      syncFixedLensHost(host, nextIndicator);

      const nextAnchor = document.createElement("span");
      nextAnchor.dataset.ruthLiquidAnchorV2 = "true";
      Object.assign(nextAnchor.style, {
        position: "absolute",
        borderRadius: "999px",
        pointerEvents: "none",
        opacity: "0",
        zIndex: "1",
      });
      nextTrack.appendChild(nextAnchor);
      anchor = nextAnchor;
      positionAnchor(nextAnchor, nextTrack, activeButton(nextNav));

      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.dataset.ruthQuickLiquidBridgeV2 = "true";
      Object.assign(svg.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: "2",
        mixBlendMode: "screen",
      });
      const path = document.createElementNS(ns, "path");
      path.setAttribute("fill", "rgba(255,255,255,0.13)");
      path.setAttribute("stroke", "rgba(255,255,255,0.72)");
      path.setAttribute("stroke-width", "0.8");
      path.style.filter = "drop-shadow(0 1px 2px rgba(17,17,17,0.12))";
      svg.appendChild(path);
      nextTrack.appendChild(svg);
      bridgeSvg = svg;
      bridgePath = path;

      const onStart = () => {
        if (anchor && track && nav && !isMoving()) positionAnchor(anchor, track, activeButton(nav));
        wake();
      };
      nextNav.addEventListener("pointerdown", onStart, true);
      nextNav.addEventListener("pointermove", wake, true);
      nextNav.addEventListener("pointerup", wake, true);
      nextNav.addEventListener("pointercancel", wake, true);
      nextNav.addEventListener("click", wake, true);
      document.addEventListener("scroll", scheduleGeometry, { capture: true, passive: true });
      window.addEventListener("resize", scheduleGeometry, { passive: true });
      detachInteractions = () => {
        nextNav.removeEventListener("pointerdown", onStart, true);
        nextNav.removeEventListener("pointermove", wake, true);
        nextNav.removeEventListener("pointerup", wake, true);
        nextNav.removeEventListener("pointercancel", wake, true);
        nextNav.removeEventListener("click", wake, true);
        document.removeEventListener("scroll", scheduleGeometry, true);
        window.removeEventListener("resize", scheduleGeometry);
      };

      resizeObserver = new ResizeObserver(scheduleGeometry);
      resizeObserver.observe(nextIndicator);
      motionObserver = new MutationObserver(wake);
      motionObserver.observe(nextSlot, { attributes: true, attributeFilter: ["class", "style"] });

      const [glassResult, quickResult] = await Promise.allSettled([
        remoteImport<LiquidGLModule>(LIQUID_GL_MODULE),
        reducedMotion ? Promise.resolve<QuickLiquidModule>({}) : remoteImport<QuickLiquidModule>(QUICK_LIQUID_MODULE),
      ]);
      if (disposed || !fixedLensHost || !nav) return;

      if (quickResult.status === "fulfilled" && quickResult.value.Spring && !reducedMotion) {
        bridgeSpring = new quickResult.value.Spring(0, "liquidMerge");
      }

      if (glassResult.status === "fulfilled" && !reducedMotion) {
        const liquidGL = glassResult.value.default ?? window.liquidGL;
        if (liquidGL) {
          try {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const created = liquidGL({
              target: '[data-ruth-liquidgl-fixed-lens="active"]',
              snapshot: "body",
              resolution: isIOS ? 0.82 : 1.15,
              refraction: 0.052,
              aberration: 0.22,
              bevelDepth: 0.17,
              bevelWidth: 0.14,
              frost: isIOS ? 0.85 : 0.55,
              shadow: false,
              specular: true,
              reveal: "none",
              tilt: false,
              magnify: 1.09,
              on: {
                init(instance: LiquidGLLens) {
                  if (disposed) return;
                  nextNav.dataset.ruthHybridWebglV2 = "ready";
                  lens = instance;
                  if (instance.renderer) window.__liquidGLRenderer__ = instance.renderer;
                },
              },
            });
            lens = Array.isArray(created) ? created[0] ?? null : created ?? null;
          } catch (error) {
            console.warn("Ruth liquidGL fixed lens unavailable; keeping built-in glass.", error);
          }
        }
      }

      if (lens) {
        fallbackGlass = nextIndicator.querySelector<HTMLElement>(":scope > span:first-child");
        if (fallbackGlass) {
          fallbackOpacity = fallbackGlass.style.opacity;
          fallbackGlass.style.setProperty("opacity", "0.10", "important");
        }
        nextNav.dataset.ruthHybridWebglV2 = "ready";
      } else {
        nextNav.dataset.ruthHybridWebglV2 = reducedMotion ? "reduced-motion" : "fallback";
      }

      nextNav.dataset.ruthHybridLiquidV2 = "ready";
      wake();
    };

    const findDock = () => {
      const found = document.querySelector<HTMLElement>(DOCK_SELECTOR);
      if (found) void setup(found);
    };

    findDock();
    rootObserver = new MutationObserver(findDock);
    rootObserver.observe(document.body, { childList: true, subtree: true });

    const refreshTimer = window.setTimeout(() => {
      scheduleGeometry();
      void lens?.renderer?.captureSnapshot?.();
    }, 220);

    return () => {
      disposed = true;
      window.clearTimeout(refreshTimer);
      rootObserver?.disconnect();
      motionObserver?.disconnect();
      resizeObserver?.disconnect();
      detachInteractions?.();
      if (geometryFrame) window.cancelAnimationFrame(geometryFrame);
      if (bridgeFrame) window.cancelAnimationFrame(bridgeFrame);
      bridgeSvg?.remove();
      anchor?.remove();
      fixedLensHost?.remove();
      if (fallbackGlass) fallbackGlass.style.opacity = fallbackOpacity;
      if (nav) {
        delete nav.dataset.ruthHybridLiquidV2;
        delete nav.dataset.ruthHybridWebglV2;
      }
    };
  }, [pathname]);

  return null;
}
