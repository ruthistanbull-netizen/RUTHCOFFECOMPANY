"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  announceProductHeaderTone,
  type ProductHeaderToneDetail,
} from "./productGalleryTone";

const PRODUCT_FALLBACK_COLOR = "rgb(250 247 242)";
const DEFAULT_THEME_COLOR = "#F6F0E7";

function activeProductImage() {
  const frame = document.querySelector<HTMLElement>(
    ".product-gallery-frame:not(.is-lightbox)",
  );
  if (!frame) return null;

  const dots = Array.from(
    frame.querySelectorAll<HTMLButtonElement>(".product-gallery-progress button"),
  );
  const activeIndex = Math.max(
    0,
    dots.findIndex((dot) => dot.classList.contains("is-active")),
  );
  const slides = frame.querySelectorAll<HTMLElement>(".product-gallery-slide");
  return slides[activeIndex]?.querySelector<HTMLImageElement>("img") || null;
}

function setThemeColor(color: string) {
  let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!themeColor) {
    themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    document.head.appendChild(themeColor);
  }
  themeColor.content = color;
}

function normalizedDetail(detail: ProductHeaderToneDetail): ProductHeaderToneDetail {
  const tone = detail.tone || "adaptive";
  return {
    tone,
    color: detail.color || PRODUCT_FALLBACK_COLOR,
    ink: detail.ink || (tone === "light" ? "#ffffff" : "#111111"),
    invert: detail.invert || (tone === "light" ? "1" : "0"),
  };
}

function parseRgb(color: string) {
  if (!color || color === "transparent") return null;
  const values = color.match(/[\d.]+/g)?.map(Number) || [];
  if (values.length < 3) return null;
  const alpha = values.length > 3 ? values[3] : 1;
  if (!Number.isFinite(alpha) || alpha < 0.08) return null;
  return {
    red: Math.max(0, Math.min(255, values[0] || 0)),
    green: Math.max(0, Math.min(255, values[1] || 0)),
    blue: Math.max(0, Math.min(255, values[2] || 0)),
  };
}

function detailFromColor(color: string): ProductHeaderToneDetail | null {
  const rgb = parseRgb(color);
  if (!rgb) return null;
  const luminance = rgb.red * 0.2126 + rgb.green * 0.7152 + rgb.blue * 0.0722;
  const darkBackground = luminance < 148;
  return {
    tone: darkBackground ? "light" : "dark",
    color: `rgb(${Math.round(rgb.red)} ${Math.round(rgb.green)} ${Math.round(rgb.blue)})`,
    ink: darkBackground ? "#ffffff" : "#111111",
    invert: darkBackground ? "1" : "0",
  };
}

function backgroundDetail(element: Element | null) {
  let current = element instanceof HTMLElement ? element : element?.parentElement || null;
  while (current) {
    const detail = detailFromColor(window.getComputedStyle(current).backgroundColor);
    if (detail) return detail;
    current = current.parentElement;
  }
  return null;
}

function elementBelowHeader() {
  const header = document.querySelector<HTMLElement>(".ruth-zara-header");
  if (!header) return null;
  const rect = header.getBoundingClientRect();
  const x = Math.max(1, Math.min(window.innerWidth - 1, window.innerWidth / 2));
  const y = Math.max(
    1,
    Math.min(window.innerHeight - 1, rect.top + Math.max(1, rect.height * 0.55)),
  );

  return (
    document.elementsFromPoint(x, y).find((element) => {
      if (element === header || header.contains(element)) return false;
      if (element.closest(".ruth-zara-menu-button,.ruth-zara-menu-surface")) return false;
      if (element.closest(".ruth-product-lightbox")) return false;
      return true;
    }) || null
  );
}

export function ProductHeaderAdaptiveTone() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const productPage = pathname.startsWith("/products/");
    root.classList.toggle("ruth-product-page-active", productPage);

    if (!productPage) {
      root.style.removeProperty("--ruth-product-media-top");
      root.style.removeProperty("--ruth-product-header-surface");
      root.style.removeProperty("--ruth-product-header-ink");
      root.style.removeProperty("--ruth-product-header-invert");
      delete root.dataset.productHeaderTone;
      setThemeColor(DEFAULT_THEME_COLOR);
      return () => root.classList.remove("ruth-product-page-active");
    }

    let imageTone = normalizedDetail({
      tone: "adaptive",
      color: PRODUCT_FALLBACK_COLOR,
    });
    let frame = 0;
    let lastHeaderSignature = "";

    const applyHeader = (detail: ProductHeaderToneDetail) => {
      const normalized = normalizedDetail(detail);
      const color = normalized.color || PRODUCT_FALLBACK_COLOR;
      const signature = `${color}|${normalized.ink}|${normalized.invert}`;
      if (signature === lastHeaderSignature) return;
      lastHeaderSignature = signature;
      root.dataset.productHeaderTone = normalized.tone;
      root.style.setProperty("--ruth-product-header-surface", color);
      root.style.setProperty("--ruth-product-header-ink", normalized.ink || "#111111");
      root.style.setProperty("--ruth-product-header-invert", normalized.invert || "0");
      setThemeColor(color);
    };

    const syncHeaderTone = () => {
      frame = 0;
      const element = elementBelowHeader();
      if (
        element?.closest(
          ".product-gallery-frame:not(.is-lightbox),.product-gallery-root,.product-media,.product-page-swipe-viewport-stage",
        )
      ) {
        applyHeader(imageTone);
        return;
      }
      applyHeader(backgroundDetail(element) || imageTone);
    };

    const scheduleSync = () => {
      if (!frame) frame = window.requestAnimationFrame(syncHeaderTone);
    };

    const onTone = (event: Event) => {
      const detail = (event as CustomEvent<ProductHeaderToneDetail>).detail;
      if (!detail) return;
      imageTone = normalizedDetail(detail);
      root.style.setProperty(
        "--ruth-product-media-top",
        imageTone.color || PRODUCT_FALLBACK_COLOR,
      );
      scheduleSync();
    };

    root.style.setProperty("--ruth-product-media-top", PRODUCT_FALLBACK_COLOR);
    applyHeader(imageTone);
    window.addEventListener("ruth:product-header-tone", onTone);
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync, { passive: true });

    const initialFrame = window.requestAnimationFrame(() => {
      const image = activeProductImage();
      const source = image?.currentSrc || image?.src;
      if (source) announceProductHeaderTone(source);
      scheduleSync();
    });

    return () => {
      window.cancelAnimationFrame(initialFrame);
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("ruth:product-header-tone", onTone);
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      root.classList.remove("ruth-product-page-active");
      root.style.removeProperty("--ruth-product-media-top");
      root.style.removeProperty("--ruth-product-header-surface");
      root.style.removeProperty("--ruth-product-header-ink");
      root.style.removeProperty("--ruth-product-header-invert");
      delete root.dataset.productHeaderTone;
      setThemeColor(DEFAULT_THEME_COLOR);
    };
  }, [pathname]);

  return (
    <style>{`
      html:has(.ruth-zara-menu-surface) .ruth-zara-menu-button {
        color: #111111 !important;
        mix-blend-mode: normal !important;
      }
      html:has(.ruth-zara-menu-surface) .ruth-zara-menu-button .ruth-zara-hamburger__line {
        background: currentColor !important;
      }

      html.ruth-product-page-active .ruth-zara-header,
      html.ruth-product-page-active .ruth-zara-header.is-scrolled,
      html.ruth-product-page-active .ruth-zara-header.is-contrast,
      html.ruth-product-page-active .ruth-zara-header .ruth-zara-header-inner {
        background: transparent !important;
        border-color: transparent !important;
        box-shadow: none !important;
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
      }
      html.ruth-product-page-active .ruth-zara-header .ruth-zara-header-inner {
        color: var(--ruth-product-header-ink, #111111) !important;
        mix-blend-mode: normal !important;
      }
      html.ruth-product-page-active .ruth-zara-header .header-wordmark {
        filter: brightness(0) invert(var(--ruth-product-header-invert, 0)) !important;
      }
      html.ruth-product-page-active .ruth-zara-header button,
      html.ruth-product-page-active .ruth-zara-header a,
      html.ruth-product-page-active .ruth-zara-header svg {
        color: inherit !important;
        stroke: currentColor !important;
      }
      html.ruth-product-page-active:has(.ruth-zara-header[data-menu-open="false"]) .ruth-zara-menu-button {
        color: var(--ruth-product-header-ink, #111111) !important;
        mix-blend-mode: normal !important;
      }

      @media (min-width: 768px) {
        #home-editorial > .home-editorial-slide:nth-of-type(2) > .sticky > div {
          background-image: url("/home/ruth-beach-desktop") !important;
          background-position: center center !important;
          background-repeat: no-repeat !important;
          background-size: cover !important;
        }
        #home-editorial > .home-editorial-slide:nth-of-type(2) picture img {
          opacity: 0 !important;
        }
      }

      .site-app-shell .product-card-collection { font-size: 9px !important; }
      .site-app-shell .product-card-name { font-size: 0.95rem !important; }
      .site-app-shell .product-card-current { font-size: 13.5px !important; }

      @container (max-width: 190px) {
        .site-app-shell .product-card-collection { font-size: 7.2px !important; }
        .site-app-shell .product-card-name { font-size: 9.2px !important; }
        .site-app-shell .product-card-current { font-size: 10px !important; }
      }

      @media (max-width: 1023px) {
        .ruth-zara-menu-logo {
          left: 34px !important;
          width: clamp(238px, 72vw, 310px) !important;
          max-width: 310px !important;
          height: 94px !important;
          max-height: 94px !important;
        }
      }

      @media (max-width: 767px) {
        html.ruth-home-page-active,
        html.ruth-home-page-active body {
          background: var(--ruth-home-media-top, rgb(126 126 108)) !important;
        }
        html.ruth-home-page-active main > #home-editorial {
          margin-top: -64px !important;
          padding-top: 0 !important;
        }
        html.ruth-home-page-active .ruth-zara-header,
        html.ruth-home-page-active .ruth-zara-header.is-scrolled,
        html.ruth-home-page-active .ruth-zara-header.is-contrast,
        html.ruth-home-page-active .ruth-zara-header .ruth-zara-header-inner {
          background: transparent !important;
          border-color: transparent !important;
          box-shadow: none !important;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
        }
        .site-app-shell .product-complete-card .product-card-collection { font-size: 7.2px !important; }
        .site-app-shell .product-complete-card .product-card-name { font-size: 9.1px !important; }
        .site-app-shell .product-complete-card .product-card-current { font-size: 10px !important; }
      }
    `}</style>
  );
}
