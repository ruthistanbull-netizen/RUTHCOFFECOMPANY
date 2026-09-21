"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

type Rgb = { red: number; green: number; blue: number };

const DEFAULT_SURFACE = "rgb(246 240 231)";
const THEME_META_ID = "ruth-mobile-chrome-theme-color";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function parseColor(value: string): Rgb | null {
  const raw = String(value || "").trim();
  if (!raw || raw === "transparent") return null;

  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const expanded =
      hex.length === 3
        ? hex
            .split("")
            .map((character) => `${character}${character}`)
            .join("")
        : hex;
    return {
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16),
    };
  }

  const srgb = raw.match(
    /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/i,
  );
  if (srgb) {
    const alpha = srgb[4] == null ? 1 : Number(srgb[4]);
    if (!Number.isFinite(alpha) || alpha < 0.08) return null;
    return {
      red: clamp(Number(srgb[1]) * 255, 0, 255),
      green: clamp(Number(srgb[2]) * 255, 0, 255),
      blue: clamp(Number(srgb[3]) * 255, 0, 255),
    };
  }

  const channels = raw.match(/[\d.]+/g)?.map(Number) || [];
  if (channels.length < 3) return null;
  const alpha = channels.length > 3 ? channels[3] : 1;
  if (!Number.isFinite(alpha) || alpha < 0.08) return null;
  return {
    red: clamp(channels[0] || 0, 0, 255),
    green: clamp(channels[1] || 0, 0, 255),
    blue: clamp(channels[2] || 0, 0, 255),
  };
}

function rgbString(rgb: Rgb) {
  return `rgb(${Math.round(rgb.red)} ${Math.round(rgb.green)} ${Math.round(rgb.blue)})`;
}

function cssVariable(name: string) {
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function variableColor(...names: string[]) {
  for (const name of names) {
    const parsed = parseColor(cssVariable(name));
    if (parsed) return rgbString(parsed);
  }
  return null;
}

function backgroundFromElement(element: Element | null) {
  let current = element instanceof HTMLElement ? element : element?.parentElement || null;
  while (current && current !== document.body) {
    const parsed = parseColor(window.getComputedStyle(current).backgroundColor);
    if (parsed) return rgbString(parsed);
    current = current.parentElement;
  }

  const bodyColor = parseColor(window.getComputedStyle(document.body).backgroundColor);
  return bodyColor ? rgbString(bodyColor) : null;
}

function elementBehindHeader(header: HTMLElement) {
  const rect = header.getBoundingClientRect();
  const x = clamp(window.innerWidth / 2, 1, Math.max(1, window.innerWidth - 1));
  const y = clamp(
    rect.top + Math.max(4, rect.height * 0.5),
    1,
    Math.max(1, window.innerHeight - 1),
  );

  return (
    document.elementsFromPoint(x, y).find((element) => {
      if (element === header || header.contains(element)) return false;
      if (
        element.closest(
          ".ruth-zara-menu-surface,.ruth-product-lightbox,.ruth-cart-drawer",
        )
      ) {
        return false;
      }
      return true;
    }) || null
  );
}

function resolvedHeaderSurface(pathname: string) {
  if (pathname === "/") {
    const homeSurface = variableColor(
      "--ruth-home-media-top",
      "--ruth-home-header-surface",
    );
    if (homeSurface) return homeSurface;
  }

  if (pathname.startsWith("/products/")) {
    const productSurface = variableColor(
      "--ruth-product-header-surface",
      "--ruth-product-media-top",
    );
    if (productSurface) return productSurface;
  }

  const header = document.querySelector<HTMLElement>(".ruth-zara-header");
  if (header) {
    const headerBackground = parseColor(window.getComputedStyle(header).backgroundColor);
    if (headerBackground) return rgbString(headerBackground);

    const behindHeader = backgroundFromElement(elementBehindHeader(header));
    if (behindHeader) return behindHeader;
  }

  return variableColor("--ivory", "--background") || DEFAULT_SURFACE;
}

function applyThemeColorWithoutTakingHeadOwnership(color: string) {
  const existing = Array.from(
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  );

  if (existing.length) {
    existing.forEach((meta) => {
      if (meta.content !== color) meta.content = color;
    });
    return;
  }

  let fallback = document.querySelector<HTMLMetaElement>(`#${THEME_META_ID}`);
  if (!fallback) {
    fallback = document.createElement("meta");
    fallback.id = THEME_META_ID;
    fallback.name = "theme-color";
    document.head.appendChild(fallback);
  }
  fallback.content = color;
}

export function MobileSafeAreaContinuity() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.add("ruth-mobile-chrome-active");

    let frame = 0;
    let lastColor = "";

    const sync = () => {
      frame = 0;
      if (!window.matchMedia("(max-width: 767px)").matches) return;

      const color = resolvedHeaderSurface(pathname);
      if (!color) return;

      if (color !== lastColor) {
        lastColor = color;
        root.style.setProperty("--ruth-mobile-chrome-surface", color);
        root.style.backgroundColor = color;
        body.style.backgroundColor = color;
      }

      applyThemeColorWithoutTakingHeadOwnership(color);
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule();
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("pageshow", schedule);
    window.addEventListener("focus", schedule);
    window.addEventListener("popstate", schedule);
    window.addEventListener("ruth:product-header-tone", schedule);
    window.addEventListener("ruth:home-header-tone", schedule);
    window.addEventListener("ruth:home-media-top-tone", schedule);
    document.addEventListener("visibilitychange", onVisibility);
    window.visualViewport?.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("scroll", schedule, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("pageshow", schedule);
      window.removeEventListener("focus", schedule);
      window.removeEventListener("popstate", schedule);
      window.removeEventListener("ruth:product-header-tone", schedule);
      window.removeEventListener("ruth:home-header-tone", schedule);
      window.removeEventListener("ruth:home-media-top-tone", schedule);
      document.removeEventListener("visibilitychange", onVisibility);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [pathname]);

  return (
    <style>{`
      @media (max-width: 767px) {
        html.ruth-mobile-chrome-active,
        html.ruth-mobile-chrome-active body {
          background-color: var(--ruth-mobile-chrome-surface, var(--ivory)) !important;
        }

        html.ruth-mobile-chrome-active body.site-app-shell .ruth-zara-header,
        html.ruth-mobile-chrome-active body.site-app-shell .ruth-zara-header.is-scrolled,
        html.ruth-mobile-chrome-active body.site-app-shell .ruth-zara-header.is-contrast,
        html.ruth-mobile-chrome-active body.site-app-shell .ruth-zara-header-inner {
          border-top-color: transparent !important;
          border-bottom-color: transparent !important;
        }

        html.ruth-mobile-chrome-active body.site-app-shell .ruth-zara-header::before,
        html.ruth-mobile-chrome-active body.site-app-shell .ruth-zara-header::after,
        html.ruth-mobile-chrome-active body.site-app-shell .ruth-zara-header-inner::before,
        html.ruth-mobile-chrome-active body.site-app-shell .ruth-zara-header-inner::after {
          background: transparent !important;
          border-color: transparent !important;
        }

        html.ruth-product-page-active .product-primary,
        html.ruth-product-page-active .product-media,
        html.ruth-product-page-active .product-gallery-root,
        html.ruth-product-page-active .product-gallery-frame.is-mobile-vertical:not(.is-lightbox) {
          border-top: 0 !important;
          margin-top: 0 !important;
        }
      }
    `}</style>
  );
}
