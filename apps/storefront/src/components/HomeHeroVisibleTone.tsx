"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const FALLBACK_COLOR = { red: 126, green: 126, blue: 108 };
const DARK_THRESHOLD = 154;

type SampledMedia = HTMLImageElement | HTMLVideoElement;
type Rgb = { red: number; green: number; blue: number };
type ToneTarget = "menu" | "logo" | "search" | "account" | "cart";

const imageSamplerCache = new Map<string, Promise<HTMLImageElement | null>>();

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function parseRgb(color: string): Rgb | null {
  if (!color || color === "transparent") return null;
  const values = color.match(/[\d.]+/g)?.map(Number) || [];
  if (values.length < 3) return null;
  const alpha = values.length > 3 ? values[3] : 1;
  if (!Number.isFinite(alpha) || alpha < 0.08) return null;
  return {
    red: clamp(values[0] || 0, 0, 255),
    green: clamp(values[1] || 0, 0, 255),
    blue: clamp(values[2] || 0, 0, 255),
  };
}

function perceivedLuminance(rgb: Rgb) {
  return rgb.red * 0.2126 + rgb.green * 0.7152 + rgb.blue * 0.0722;
}

function isDark(rgb: Rgb) {
  return perceivedLuminance(rgb) < DARK_THRESHOLD;
}

function cssColor(rgb: Rgb) {
  return `rgb(${Math.round(rgb.red)} ${Math.round(rgb.green)} ${Math.round(rgb.blue)})`;
}

function backgroundFromElement(element: Element | null) {
  let current = element instanceof HTMLElement ? element : element?.parentElement || null;
  while (current) {
    const rgb = parseRgb(window.getComputedStyle(current).backgroundColor);
    if (rgb) return rgb;
    current = current.parentElement;
  }
  return null;
}

function visibleStackAt(x: number, y: number) {
  return document.elementsFromPoint(
    clamp(x, 1, Math.max(1, window.innerWidth - 1)),
    clamp(y, 1, Math.max(1, window.innerHeight - 1)),
  ).filter((element) => {
    if (element.closest(".ruth-zara-header")) return false;
    if (element.closest(".ruth-zara-menu-button")) return false;
    if (element.closest(".ruth-zara-menu-surface")) return false;
    if (element.closest(".home-editorial-wordmark")) return false;
    if (element.closest("[data-ruth-theme-editor-ui]")) return false;
    return true;
  });
}

function isVisibleMedia(element: SampledMedia) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") <= 0.01) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function mediaFromStack(stack: Element[]) {
  for (const element of stack) {
    if (
      (element instanceof HTMLImageElement || element instanceof HTMLVideoElement) &&
      element.hasAttribute("data-home-editorial-media") &&
      isVisibleMedia(element)
    ) {
      return element as SampledMedia;
    }
  }
  return null;
}

function backgroundFromStack(stack: Element[]) {
  for (const element of stack) {
    const rgb = backgroundFromElement(element);
    if (rgb) return rgb;
  }
  return null;
}

function sourceSize(media: SampledMedia) {
  if (media instanceof HTMLVideoElement) {
    return { width: media.videoWidth, height: media.videoHeight };
  }
  return { width: media.naturalWidth, height: media.naturalHeight };
}

function cropForDisplayedMedia(
  displayedMedia: SampledMedia,
  sourceWidth: number,
  sourceHeight: number,
  viewportX: number,
  viewportY: number,
) {
  const rect = displayedMedia.getBoundingClientRect();
  if (!rect.width || !rect.height || !sourceWidth || !sourceHeight) return null;

  const objectFit = window.getComputedStyle(displayedMedia).objectFit || "cover";
  const scale =
    objectFit === "contain"
      ? Math.min(rect.width / sourceWidth, rect.height / sourceHeight)
      : objectFit === "fill"
        ? rect.width / sourceWidth
        : Math.max(rect.width / sourceWidth, rect.height / sourceHeight);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const cropX = Math.max(0, (renderedWidth - rect.width) / 2);
  const cropY = Math.max(0, (renderedHeight - rect.height) / 2);
  const sourceX = clamp(
    (viewportX - rect.left + cropX) / scale,
    0,
    Math.max(0, sourceWidth - 1),
  );
  const sourceY = clamp(
    (viewportY - rect.top + cropY) / scale,
    0,
    Math.max(0, sourceHeight - 1),
  );
  const sampleWidth = clamp(34 / scale, 1, Math.max(1, sourceWidth));
  const sampleHeight = clamp(24 / scale, 1, Math.max(1, sourceHeight));

  return {
    x: clamp(sourceX - sampleWidth / 2, 0, Math.max(0, sourceWidth - sampleWidth)),
    y: clamp(sourceY - sampleHeight / 2, 0, Math.max(0, sourceHeight - sampleHeight)),
    width: sampleWidth,
    height: sampleHeight,
  };
}

function averageCanvasPixels(context: CanvasRenderingContext2D, width: number, height: number) {
  const pixels = context.getImageData(0, 0, width, height).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = (pixels[index + 3] || 0) / 255;
    if (alpha < 0.08) continue;
    red += (pixels[index] || 0) * alpha;
    green += (pixels[index + 1] || 0) * alpha;
    blue += (pixels[index + 2] || 0) * alpha;
    weight += alpha;
  }

  if (!weight) return null;
  return { red: red / weight, green: green / weight, blue: blue / weight } satisfies Rgb;
}

function drawSample(
  source: CanvasImageSource,
  crop: { x: number; y: number; width: number; height: number },
) {
  const canvas = document.createElement("canvas");
  canvas.width = 12;
  canvas.height = 8;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return averageCanvasPixels(context, canvas.width, canvas.height);
}

function loadSamplerImage(source: string) {
  if (!source) return Promise.resolve<HTMLImageElement | null>(null);
  const cached = imageSamplerCache.get(source);
  if (cached) return cached;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => {
      imageSamplerCache.delete(source);
      resolve(null);
    };
    image.src = source;
  });
  imageSamplerCache.set(source, promise);
  return promise;
}

async function sampleMediaAt(media: SampledMedia, x: number, y: number) {
  try {
    if (media instanceof HTMLVideoElement) {
      if (media.readyState < 2 || !media.videoWidth || !media.videoHeight) return null;
      const crop = cropForDisplayedMedia(media, media.videoWidth, media.videoHeight, x, y);
      return crop ? drawSample(media, crop) : null;
    }

    const source = media.currentSrc || media.src;
    const sampler = await loadSamplerImage(source);
    const natural = sampler
      ? { width: sampler.naturalWidth, height: sampler.naturalHeight }
      : sourceSize(media);
    if (!natural.width || !natural.height) return null;
    const crop = cropForDisplayedMedia(media, natural.width, natural.height, x, y);
    if (!crop) return null;

    try {
      return drawSample(sampler || media, crop);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

async function samplePoint(x: number, y: number) {
  const stack = visibleStackAt(x, y);
  const media = mediaFromStack(stack);
  if (media) {
    const sampled = await sampleMediaAt(media, x, y);
    if (sampled) return sampled;
  }
  return backgroundFromStack(stack) || FALLBACK_COLOR;
}

function centerOf(element: Element | null, fallbackX: number, fallbackY: number) {
  if (!(element instanceof HTMLElement)) return { x: fallbackX, y: fallbackY };
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: fallbackX, y: fallbackY };
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function applyTargetTone(target: ToneTarget, rgb: Rgb) {
  const root = document.documentElement;
  const dark = isDark(rgb);
  const ink = dark ? "#FBF3E6" : "#111111";
  root.style.setProperty(`--ruth-home-header-${target}-ink`, ink);
  root.style.setProperty(`--ruth-home-header-${target}-surface`, cssColor(rgb));

  if (target === "logo") {
    root.style.setProperty("--ruth-home-header-logo-invert", dark ? "1" : "0");
    root.style.setProperty("--ruth-home-header-ink", ink);
    root.style.setProperty("--ruth-home-header-invert", dark ? "1" : "0");
    root.style.setProperty("--ruth-home-header-surface", cssColor(rgb));
    root.dataset.homeHeaderTone = dark ? "dark" : "light";
    window.dispatchEvent(
      new CustomEvent("ruth:home-header-tone", { detail: { color: cssColor(rgb) } }),
    );
  }
}

function applyHomeMediaTop(rgb: Rgb) {
  const color = cssColor(rgb);
  document.documentElement.style.setProperty("--ruth-home-media-top", color);
  window.dispatchEvent(new CustomEvent("ruth:home-media-top-tone", { detail: { color } }));
}

function clearToneVariables() {
  const root = document.documentElement;
  const properties = [
    "--ruth-home-header-menu-ink",
    "--ruth-home-header-menu-surface",
    "--ruth-home-header-logo-ink",
    "--ruth-home-header-logo-surface",
    "--ruth-home-header-logo-invert",
    "--ruth-home-header-search-ink",
    "--ruth-home-header-search-surface",
    "--ruth-home-header-account-ink",
    "--ruth-home-header-account-surface",
    "--ruth-home-header-cart-ink",
    "--ruth-home-header-cart-surface",
    "--ruth-home-header-ink",
    "--ruth-home-header-invert",
    "--ruth-home-header-surface",
    "--ruth-home-media-top",
  ];
  properties.forEach((property) => root.style.removeProperty(property));
  delete root.dataset.homeHeaderTone;
}

export function HomeHeroVisibleTone() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;

    let frame = 0;
    let sampleToken = 0;
    let timer = 0;

    const sync = async () => {
      frame = 0;
      const token = ++sampleToken;
      const header = document.querySelector<HTMLElement>(".ruth-zara-header");
      if (!header || header.dataset.menuOpen === "true") return;

      const headerRect = header.getBoundingClientRect();
      const fallbackY = clamp(
        headerRect.top + Math.max(8, headerRect.height * 0.5),
        1,
        Math.max(1, window.innerHeight - 1),
      );
      const viewportWidth = Math.max(1, window.innerWidth);

      const targets: Array<{ target: ToneTarget; point: { x: number; y: number } }> = [
        {
          target: "menu",
          point: centerOf(
            document.querySelector(".ruth-zara-menu-button:not(.ruth-zara-menu-button--menu-open)"),
            Math.min(48, viewportWidth * 0.06),
            fallbackY,
          ),
        },
        {
          target: "logo",
          point: centerOf(
            document.querySelector(".ruth-zara-header .header-wordmark-link"),
            viewportWidth / 2,
            fallbackY,
          ),
        },
        {
          target: "search",
          point: centerOf(
            document.querySelector('.ruth-zara-header button[aria-label="Ara"]'),
            viewportWidth - 116,
            fallbackY,
          ),
        },
        {
          target: "account",
          point: centerOf(
            document.querySelector('.ruth-zara-header button[aria-label="Hesap menüsü"]'),
            viewportWidth - 76,
            fallbackY,
          ),
        },
        {
          target: "cart",
          point: centerOf(
            document.querySelector('.ruth-zara-header button[aria-label^="Sepet"]'),
            viewportWidth - 36,
            fallbackY,
          ),
        },
      ];

      const [samples, mediaTop] = await Promise.all([
        Promise.all(
          targets.map(async ({ target, point }) => ({
            target,
            rgb: await samplePoint(point.x, point.y),
          })),
        ),
        samplePoint(viewportWidth / 2, 1),
      ]);
      if (token !== sampleToken) return;

      samples.forEach(({ target, rgb }) => applyTargetTone(target, rgb));
      applyHomeMediaTop(mediaTop);
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(() => void sync());
    };

    applyTargetTone("menu", FALLBACK_COLOR);
    applyTargetTone("logo", FALLBACK_COLOR);
    applyTargetTone("search", FALLBACK_COLOR);
    applyTargetTone("account", FALLBACK_COLOR);
    applyTargetTone("cart", FALLBACK_COLOR);
    applyHomeMediaTop(FALLBACK_COLOR);
    schedule();

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("pageshow", schedule);
    window.addEventListener("ruth:home-hero-media-changed", schedule);
    timer = window.setInterval(schedule, 420);

    const heroRoot = document.querySelector("#home-editorial");
    const observer = new MutationObserver(schedule);
    if (heroRoot) {
      observer.observe(heroRoot, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src", "srcset", "class"],
      });
    }

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("pageshow", schedule);
      window.removeEventListener("ruth:home-hero-media-changed", schedule);
      sampleToken += 1;
      clearToneVariables();
    };
  }, [pathname]);

  return null;
}