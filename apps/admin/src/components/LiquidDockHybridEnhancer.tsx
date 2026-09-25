"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const LIQUID_GL_MODULE = "https://cdn.jsdelivr.net/npm/liquid-gl@2.0.1/+esm";
const QUICK_LIQUID_MODULE = "https://cdn.jsdelivr.net/npm/quick-liquid@0.1.1/+esm";
const DOCK_SELECTOR = 'nav[aria-label="ROSTA Coffee Co. mobil menü"]';

type LegacyLiquidGLRenderer = {
  lenses?: LegacyLiquidGLLens[];
  canvas?: HTMLCanvasElement;
  _rafId?: number | null;
  captureSnapshot?: () => Promise<boolean> | void;
};

type LegacyLiquidGLLens = {
  renderer?: LegacyLiquidGLRenderer;
  _sizeObs?: ResizeObserver;
  _shadowEl?: HTMLElement | null;
};

type LegacyLiquidGLFunction = ((options: Record<string, unknown>) => LegacyLiquidGLLens | LegacyLiquidGLLens[] | void) & {
  registerDynamic?: (elements: string | Element | Element[]) => void;
};

type LiquidGLModule = {
  default?: LegacyLiquidGLFunction;
};

type QuickSpring = {
  setTarget: (target: number) => void;
  tick: (now: number) => boolean;
  readonly value: number;
  readonly atRest: boolean;
};

type QuickSpringConstructor = new (
  initialValue?: number,
  config?: string | Record<string, number | boolean>,
) => QuickSpring;

type QuickLiquidModule = {
  Spring?: QuickSpringConstructor;
};

function remoteImport<T>(url: string) {
  return import(/* webpackIgnore: true */ url) as Promise<T>;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function activeButton(nav: HTMLElement) {
  return nav.querySelector<HTMLButtonElement>('button[data-dock-index][aria-current="page"]');
}

function positionAnchor(anchor: HTMLElement, track: HTMLElement, button: HTMLElement | null) {
  if (!button) return;
  const trackRect = track.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  const width = Math.min(42, Math.max(32, buttonRect.width * 0.48));
  const height = Math.min(48, Math.max(38, trackRect.height - 14));
  const left = buttonRect.left - trackRect.left + buttonRect.width / 2 - width / 2;
  const top = (trackRect.height - height) / 2;

  anchor.style.width = `${width}px`;
  anchor.style.height = `${height}px`;
  anchor.style.left = `${left}px`;
  anchor.style.top = `${top}px`;
  anchor.dataset.dockIndex = button.dataset.dockIndex ?? "";
}

function isDockMoving(nav: HTMLElement, indicatorSlot: HTMLElement) {
  const navClass = String(nav.className);
  const indicatorClass = String(indicatorSlot.className);
  return (
    navClass.includes("dragging") ||
    navClass.includes("interacting") ||
    indicatorClass.includes("moving") ||
    indicatorClass.includes("dragging")
  );
}

function dockTransitionBudget(nav: HTMLElement) {
  const raw = getComputedStyle(nav).getPropertyValue("--dock-duration").trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? Math.max(320, parsed + 180) : 560;
}

function renderMetaballBridge(
  path: SVGPathElement,
  svg: SVGSVGElement,
  track: HTMLElement,
  anchor: HTMLElement,
  lensHost: HTMLElement,
  strengthInput: number,
) {
  const trackRect = track.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const lensRect = lensHost.getBoundingClientRect();
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

export function LiquidDockHybridEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    let disposed = false;
    let rootObserver: MutationObserver | null = null;
    let motionObserver: MutationObserver | null = null;
    let animationFrame = 0;
    let bridgeUntil = 0;
    let bridgeSpring: QuickSpring | null = null;
    let bridgeSpringTarget = 0;
    let lens: LegacyLiquidGLLens | null = null;
    let nav: HTMLElement | null = null;
    let track: HTMLElement | null = null;
    let lensHost: HTMLElement | null = null;
    let anchor: HTMLElement | null = null;
    let bridgeSvg: SVGSVGElement | null = null;
    let bridgePath: SVGPathElement | null = null;
    let fallbackGlass: HTMLElement | null = null;
    let fallbackGlassOpacity = "";
    let detachInteractions: (() => void) | null = null;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobileQuery = window.matchMedia("(max-width: 1023px)");

    const setBridgeSpringTarget = (target: number) => {
      if (!bridgeSpring || bridgeSpringTarget === target) return;
      bridgeSpringTarget = target;
      bridgeSpring.setTarget(target);
    };

    const runBridgeLoop = (now: number) => {
      if (!nav || !track || !anchor || !lensHost || !bridgeSvg || !bridgePath) {
        animationFrame = 0;
        return;
      }

      const indicatorSlot = track.querySelector<HTMLElement>(":scope > span:first-child");
      if (!indicatorSlot) {
        animationFrame = 0;
        return;
      }

      const moving = isDockMoving(nav, indicatorSlot);
      const currentButton = activeButton(nav);

      if (moving) {
        setBridgeSpringTarget(1);
        if (currentButton?.dataset.dockIndex !== anchor.dataset.dockIndex) {
          positionAnchor(anchor, track, currentButton);
        }
      } else if (now >= bridgeUntil) {
        setBridgeSpringTarget(0);
      }

      const springActive = bridgeSpring?.tick(now) ?? false;
      const fallbackStrength = moving || now < bridgeUntil ? 1 : 0;
      const strength = bridgeSpring?.value ?? fallbackStrength;
      renderMetaballBridge(bridgePath, bridgeSvg, track, anchor, lensHost, strength);

      const keepRunning = moving || now < bridgeUntil || springActive || strength > 0.025;
      if (keepRunning) {
        animationFrame = window.requestAnimationFrame(runBridgeLoop);
        return;
      }

      bridgePath.setAttribute("d", "");
      positionAnchor(anchor, track, currentButton);
      animationFrame = 0;
    };

    const wakeBridge = () => {
      if (!nav || reducedMotion) return;
      setBridgeSpringTarget(1);
      bridgeUntil = Math.max(bridgeUntil, performance.now() + dockTransitionBudget(nav));
      if (!animationFrame) animationFrame = window.requestAnimationFrame(runBridgeLoop);
    };

    const setup = async (nextNav: HTMLElement) => {
      if (disposed || !mobileQuery.matches || nextNav.dataset.ruthHybridLiquid) return;

      const nextTrack = nextNav.querySelector<HTMLElement>(":scope > div");
      const nextIndicatorSlot = nextTrack?.querySelector<HTMLElement>(":scope > span:first-child");
      const nextIndicator = nextIndicatorSlot?.querySelector<HTMLElement>(":scope > span:first-child");
      if (!nextTrack || !nextIndicatorSlot || !nextIndicator) return;

      nav = nextNav;
      track = nextTrack;
      nextNav.dataset.ruthHybridLiquid = "loading";

      const nextLensHost = document.createElement("span");
      nextLensHost.dataset.ruthLiquidglLens = "active";
      Object.assign(nextLensHost.style, {
        position: "absolute",
        inset: "0",
        borderRadius: "inherit",
        pointerEvents: "none",
        zIndex: "2147483599",
        background: "transparent",
      });
      nextIndicator.appendChild(nextLensHost);
      lensHost = nextLensHost;

      const nextAnchor = document.createElement("span");
      nextAnchor.dataset.ruthLiquidAnchor = "true";
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

      const svgNamespace = "http://www.w3.org/2000/svg";
      const nextBridgeSvg = document.createElementNS(svgNamespace, "svg");
      nextBridgeSvg.dataset.ruthQuickLiquidBridge = "true";
      nextBridgeSvg.setAttribute("aria-hidden", "true");
      Object.assign(nextBridgeSvg.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: "2",
        mixBlendMode: "screen",
      });

      const nextBridgePath = document.createElementNS(svgNamespace, "path");
      nextBridgePath.setAttribute("fill", "rgba(255, 255, 255, 0.12)");
      nextBridgePath.setAttribute("stroke", "rgba(255, 255, 255, 0.68)");
      nextBridgePath.setAttribute("stroke-linejoin", "round");
      nextBridgePath.setAttribute("vector-effect", "non-scaling-stroke");
      nextBridgePath.style.filter = "drop-shadow(0 1px 2px rgba(17,17,17,0.10))";
      nextBridgeSvg.appendChild(nextBridgePath);
      nextTrack.appendChild(nextBridgeSvg);
      bridgeSvg = nextBridgeSvg;
      bridgePath = nextBridgePath;

      const onInteractionStart = () => {
        if (!anchor || !track || !nav) return;
        if (!isDockMoving(nav, nextIndicatorSlot)) {
          positionAnchor(anchor, track, activeButton(nav));
        }
        wakeBridge();
      };

      nextNav.addEventListener("pointerdown", onInteractionStart, true);
      nextNav.addEventListener("pointermove", wakeBridge, true);
      nextNav.addEventListener("pointerup", wakeBridge, true);
      nextNav.addEventListener("pointercancel", wakeBridge, true);
      nextNav.addEventListener("click", wakeBridge, true);
      detachInteractions = () => {
        nextNav.removeEventListener("pointerdown", onInteractionStart, true);
        nextNav.removeEventListener("pointermove", wakeBridge, true);
        nextNav.removeEventListener("pointerup", wakeBridge, true);
        nextNav.removeEventListener("pointercancel", wakeBridge, true);
        nextNav.removeEventListener("click", wakeBridge, true);
      };

      const [liquidGLResult, quickLiquidResult] = await Promise.allSettled([
        remoteImport<LiquidGLModule>(LIQUID_GL_MODULE),
        reducedMotion
          ? Promise.resolve<QuickLiquidModule>({})
          : remoteImport<QuickLiquidModule>(QUICK_LIQUID_MODULE),
      ]);
      if (disposed || !nav || !track || !lensHost || !anchor) return;

      if (quickLiquidResult.status === "fulfilled" && quickLiquidResult.value.Spring && !reducedMotion) {
        bridgeSpring = new quickLiquidResult.value.Spring(0, "liquidMerge");
        bridgeSpringTarget = 0;
      }

      if (liquidGLResult.status === "fulfilled" && !reducedMotion) {
        const liquidGL = liquidGLResult.value.default;
        const shellMain = document.querySelector("[data-base44-exact-shell] main");
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

        if (liquidGL) {
          try {
            const created = liquidGL({
              target: '[data-ruth-liquidgl-lens="active"]',
              snapshot: shellMain ? "[data-base44-exact-shell] main" : "body",
              resolution: isIOS ? 0.72 : 1,
              refraction: 0.024,
              aberration: 0.18,
              bevelDepth: 0.14,
              bevelWidth: 0.2,
              frost: isIOS ? 0.55 : 0.28,
              shadow: false,
              specular: true,
              reveal: "none",
              tilt: false,
              magnify: 1.065,
            });
            lens = Array.isArray(created) ? created[0] ?? null : created ?? null;
          } catch (error) {
            console.warn("Ruth Liquid Dock WebGL layer unavailable; keeping built-in optics.", error);
          }
        }
      }

      if (lens) {
        nextNav.dataset.ruthHybridWebgl = "ready";
        fallbackGlass = nextIndicator.children.item(0) as HTMLElement | null;
        if (fallbackGlass) {
          fallbackGlassOpacity = fallbackGlass.style.opacity;
          fallbackGlass.style.setProperty("opacity", "0.20", "important");
        }
      } else {
        nextNav.dataset.ruthHybridWebgl = reducedMotion ? "reduced-motion" : "fallback";
      }

      if (quickLiquidResult.status === "rejected") {
        console.warn("Ruth Liquid Dock QuickLiquid spring unavailable; using dock motion fallback.", quickLiquidResult.reason);
      }
      if (liquidGLResult.status === "rejected") {
        console.warn("Ruth Liquid Dock liquidGL module unavailable; using built-in optics.", liquidGLResult.reason);
      }

      nextNav.dataset.ruthHybridLiquid = "ready";

      motionObserver = new MutationObserver(() => wakeBridge());
      motionObserver.observe(nextIndicatorSlot, { attributes: true, attributeFilter: ["class", "style"] });
      wakeBridge();
    };

    const findDock = () => {
      const found = document.querySelector<HTMLElement>(DOCK_SELECTOR);
      if (found) void setup(found);
    };

    findDock();
    rootObserver = new MutationObserver(findDock);
    rootObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      rootObserver?.disconnect();
      motionObserver?.disconnect();
      detachInteractions?.();
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      bridgeSvg?.remove();
      anchor?.remove();
      lensHost?.remove();
      if (fallbackGlass) fallbackGlass.style.opacity = fallbackGlassOpacity;
      if (nav) {
        delete nav.dataset.ruthHybridLiquid;
        delete nav.dataset.ruthHybridWebgl;
      }
    };
  }, [pathname]);

  return null;
}
