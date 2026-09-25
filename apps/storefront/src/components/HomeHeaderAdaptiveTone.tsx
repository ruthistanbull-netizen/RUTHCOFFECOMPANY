"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

type HeaderTone = {
  ink: "#111111" | "#FBF3E6";
  invert: "0" | "1";
  surface: string;
};

type SampleStats = {
  light: number;
  dark: number;
  red: number;
  green: number;
  blue: number;
  weight: number;
};

const LIGHT_INK = "#111111" as const;
const DARK_INK = "#FBF3E6" as const;
const FALLBACK_SURFACE = "rgb(251 243 230)";
const VIDEO_SAMPLE_POINTS = [0.06, 0.2, 0.36, 0.52, 0.68, 0.84, 0.96] as const;
const imageSourceCache = new Map<string, Promise<HTMLImageElement | null>>();
const videoToneCache = new Map<string, Promise<HeaderTone>>();

function sourceOf(media: HTMLImageElement | HTMLVideoElement) {
  return String(media.currentSrc || media.getAttribute("src") || "").trim();
}

function emptyStats(): SampleStats {
  return { light: 0, dark: 0, red: 0, green: 0, blue: 0, weight: 0 };
}

function addPixels(stats: SampleStats, pixels: Uint8ClampedArray) {
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = (pixels[index + 3] || 0) / 255;
    if (alpha < 0.08) continue;
    const red = pixels[index] || 0;
    const green = pixels[index + 1] || 0;
    const blue = pixels[index + 2] || 0;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    if (luminance >= 148) stats.light += alpha;
    else stats.dark += alpha;
    stats.red += red * alpha;
    stats.green += green * alpha;
    stats.blue += blue * alpha;
    stats.weight += alpha;
  }
}

function toneFromStats(stats: SampleStats, fallback: HeaderTone): HeaderTone {
  if (!stats.weight) return fallback;
  // Choose ink by the majority of sampled pixels, not by one hotspot.
  const lightBackground = stats.light >= stats.dark;
  const red = Math.round(stats.red / stats.weight);
  const green = Math.round(stats.green / stats.weight);
  const blue = Math.round(stats.blue / stats.weight);
  return {
    ink: lightBackground ? LIGHT_INK : DARK_INK,
    invert: lightBackground ? "0" : "1",
    surface: `rgb(${red} ${green} ${blue})`,
  };
}

function fallbackTone(): HeaderTone {
  return { ink: LIGHT_INK, invert: "0", surface: FALLBACK_SURFACE };
}

function mediaAtHeaderProbe(x: number, y: number) {
  const stack = document.elementsFromPoint(x, y);
  return stack.find((element): element is HTMLImageElement | HTMLVideoElement => {
    if (!(element instanceof HTMLImageElement || element instanceof HTMLVideoElement)) return false;
    if (!element.hasAttribute("data-home-editorial-media")) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.02;
  }) || null;
}

function dominantHeaderMedia(header: HTMLElement) {
  const rect = header.getBoundingClientRect();
  const y = Math.max(1, Math.min(window.innerHeight - 1, rect.top + rect.height * 0.55));
  const xs = [0.06, 0.2, 0.38, 0.5, 0.62, 0.8, 0.94].map((ratio) =>
    Math.max(1, Math.min(window.innerWidth - 1, window.innerWidth * ratio)),
  );
  const counts = new Map<HTMLImageElement | HTMLVideoElement, number>();
  for (const x of xs) {
    const media = mediaAtHeaderProbe(x, y);
    if (media) counts.set(media, (counts.get(media) || 0) + 1);
  }
  let winner: HTMLImageElement | HTMLVideoElement | null = null;
  let winnerCount = 0;
  for (const [media, count] of counts) {
    if (count > winnerCount) {
      winner = media;
      winnerCount = count;
    }
  }
  return winner;
}

function elementBelowHeader(header: HTMLElement) {
  const rect = header.getBoundingClientRect();
  const x = Math.max(1, Math.min(window.innerWidth - 1, window.innerWidth / 2));
  const y = Math.max(1, Math.min(window.innerHeight - 1, rect.top + rect.height * 0.55));
  return document.elementsFromPoint(x, y).find((element) => {
    if (element === header || header.contains(element)) return false;
    if (element.closest(".ruth-zara-menu-button,.ruth-zara-menu-surface")) return false;
    if (element.closest(".home-editorial-wordmark")) return false;
    return true;
  }) || null;
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

function backgroundTone(element: Element | null): HeaderTone | null {
  let current = element instanceof HTMLElement ? element : element?.parentElement || null;
  while (current) {
    const rgb = parseRgb(window.getComputedStyle(current).backgroundColor);
    if (rgb) {
      const luminance = rgb.red * 0.2126 + rgb.green * 0.7152 + rgb.blue * 0.0722;
      const lightBackground = luminance >= 148;
      return {
        ink: lightBackground ? LIGHT_INK : DARK_INK,
        invert: lightBackground ? "0" : "1",
        surface: `rgb(${Math.round(rgb.red)} ${Math.round(rgb.green)} ${Math.round(rgb.blue)})`,
      };
    }
    current = current.parentElement;
  }
  return null;
}

function loadImageSource(src: string) {
  const cached = imageSourceCache.get(src);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
  imageSourceCache.set(src, pending);
  return pending;
}

function sampleImageHeaderBand(
  source: HTMLImageElement,
  rendered: HTMLImageElement,
  header: HTMLElement,
): HeaderTone {
  const fallback = backgroundTone(rendered) || fallbackTone();
  const mediaRect = rendered.getBoundingClientRect();
  const headerRect = header.getBoundingClientRect();
  const sourceWidth = source.naturalWidth;
  const sourceHeight = source.naturalHeight;
  if (!mediaRect.width || !mediaRect.height || !sourceWidth || !sourceHeight) return fallback;

  const top = Math.max(mediaRect.top, headerRect.top);
  const bottom = Math.min(mediaRect.bottom, headerRect.bottom);
  if (bottom <= top) return fallback;

  const scale = Math.max(mediaRect.width / sourceWidth, mediaRect.height / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const cropX = (renderedWidth - mediaRect.width) / 2;
  const cropY = (renderedHeight - mediaRect.height) / 2;

  const sourceX = Math.max(0, cropX / scale);
  const sourceY = Math.max(0, (top - mediaRect.top + cropY) / scale);
  const sourceBandWidth = Math.min(sourceWidth - sourceX, mediaRect.width / scale);
  const sourceBandHeight = Math.min(sourceHeight - sourceY, (bottom - top) / scale);

  const canvas = document.createElement("canvas");
  canvas.width = 56;
  canvas.height = 12;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return fallback;

  try {
    context.drawImage(
      source,
      sourceX,
      sourceY,
      Math.max(1, sourceBandWidth),
      Math.max(1, sourceBandHeight),
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const stats = emptyStats();
    addPixels(stats, context.getImageData(0, 0, canvas.width, canvas.height).data);
    return toneFromStats(stats, fallback);
  } catch {
    return fallback;
  }
}

function waitFor(target: HTMLVideoElement, event: "loadeddata" | "seeked", timeoutMs: number) {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      target.removeEventListener(event, finish);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    target.addEventListener(event, finish, { once: true });
  });
}

function sampleWholeVideoFrame(video: HTMLVideoElement, stats: SampleStats) {
  if (!video.videoWidth || !video.videoHeight) return;
  const canvas = document.createElement("canvas");
  canvas.width = 28;
  canvas.height = 16;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    addPixels(stats, context.getImageData(0, 0, canvas.width, canvas.height).data);
  } catch {
    // CORS or decoder restrictions: caller falls back to the page surface.
  }
}

function analyzeVideoSource(src: string) {
  const cached = videoToneCache.get(src);
  if (cached) return cached;

  const pending = new Promise<HeaderTone>(async (resolve) => {
    const fallback = fallbackTone();
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = src;

    await waitFor(video, "loadeddata", 5000);
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const stats = emptyStats();

    if (!duration) {
      sampleWholeVideoFrame(video, stats);
      resolve(toneFromStats(stats, fallback));
      video.removeAttribute("src");
      video.load();
      return;
    }

    for (const ratio of VIDEO_SAMPLE_POINTS) {
      const target = Math.min(Math.max(0, duration * ratio), Math.max(0, duration - 0.04));
      try {
        video.currentTime = target;
        await waitFor(video, "seeked", 1400);
        sampleWholeVideoFrame(video, stats);
      } catch {
        // Keep the successful frames; majority voting remains stable.
      }
    }

    resolve(toneFromStats(stats, fallback));
    video.removeAttribute("src");
    video.load();
  });

  videoToneCache.set(src, pending);
  return pending;
}

export function HomeHeaderAdaptiveTone() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;

    const root = document.documentElement;
    let frame = 0;
    let activeKey = "";
    let lastSignature = "";
    let disposed = false;

    const apply = (tone: HeaderTone) => {
      if (disposed) return;
      const signature = `${tone.ink}|${tone.invert}|${tone.surface}`;
      if (signature === lastSignature) return;
      lastSignature = signature;
      root.style.setProperty("--ruth-home-header-ink", tone.ink);
      root.style.setProperty("--ruth-home-header-menu-ink", tone.ink);
      root.style.setProperty("--ruth-home-header-search-ink", tone.ink);
      root.style.setProperty("--ruth-home-header-account-ink", tone.ink);
      root.style.setProperty("--ruth-home-header-cart-ink", tone.ink);
      root.style.setProperty("--ruth-home-header-invert", tone.invert);
      root.style.setProperty("--ruth-home-header-surface", tone.surface);
      root.dataset.homeHeaderTone = tone.ink === LIGHT_INK ? "dark" : "light";
    };

    const sync = () => {
      frame = 0;
      const header = document.querySelector<HTMLElement>(".ruth-zara-header");
      if (!header) return;

      const media = dominantHeaderMedia(header);
      if (media) {
        const src = sourceOf(media);
        if (!src) {
          apply(backgroundTone(media) || fallbackTone());
          return;
        }

        if (media instanceof HTMLVideoElement) {
          const key = `video:${src}`;
          activeKey = key;
          void analyzeVideoSource(src).then((tone) => {
            if (!disposed && activeKey === key) apply(tone);
          });
          return;
        }

        const mediaRect = media.getBoundingClientRect();
        const key = `image:${src}:${Math.round(mediaRect.top / 8)}:${Math.round(mediaRect.height / 8)}`;
        activeKey = key;
        void loadImageSource(src).then((source) => {
          if (disposed || activeKey !== key) return;
          apply(source ? sampleImageHeaderBand(source, media, header) : backgroundTone(media) || fallbackTone());
        });
        return;
      }

      activeKey = "background";
      apply(backgroundTone(elementBelowHeader(header)) || fallbackTone());
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };

    apply(fallbackTone());
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("rosta:home-hero-media-changed", schedule);

    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("rosta:home-hero-media-changed", schedule);
      [
        "--ruth-home-header-ink",
        "--ruth-home-header-menu-ink",
        "--ruth-home-header-search-ink",
        "--ruth-home-header-account-ink",
        "--ruth-home-header-cart-ink",
        "--ruth-home-header-invert",
        "--ruth-home-header-surface",
      ].forEach((name) => root.style.removeProperty(name));
      delete root.dataset.homeHeaderTone;
    };
  }, [pathname]);

  return (
    <style>{`
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

      html.ruth-home-page-active .ruth-zara-header .ruth-zara-header-inner {
        color: var(--ruth-home-header-ink, #111111) !important;
        mix-blend-mode: normal !important;
      }

      html.ruth-home-page-active .ruth-zara-header button,
      html.ruth-home-page-active .ruth-zara-header a,
      html.ruth-home-page-active .ruth-zara-header svg {
        color: inherit !important;
        stroke: currentColor !important;
        mix-blend-mode: normal !important;
      }

      html.ruth-home-page-active:has(.ruth-zara-header[data-menu-open="false"])
        .ruth-zara-menu-button {
        color: var(--ruth-home-header-ink, #111111) !important;
        mix-blend-mode: normal !important;
      }

      html.ruth-home-page-active .ruth-zara-menu-button .ruth-zara-hamburger__line {
        background: currentColor !important;
      }

      html.ruth-home-page-active .ruth-zara-header .header-wordmark {
        filter: brightness(0) invert(var(--ruth-home-header-invert, 0)) !important;
      }
    `}</style>
  );
}
