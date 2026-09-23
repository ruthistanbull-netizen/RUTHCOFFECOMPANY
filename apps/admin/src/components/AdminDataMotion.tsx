"use client";

import { useEffect } from "react";

const METRIC_SELECTOR = [
  "[data-animate-number]",
  ".cr-analytics-card > strong",
  ".cr-metric > strong",
  ".cr-finance-card strong",
  ".cr-kpi-card > strong",
  ".cr-stat-card > strong",
  ".cr-summary-card > strong",
].join(",");
const COUNT_UP_DURATION_MS = 380;

const animationFrames = new WeakMap<HTMLElement, number>();
const lastValues = new WeakMap<HTMLElement, number>();

function parseLocalizedNumber(text: string) {
  const trimmed = text.trim();
  if (!trimmed || trimmed === "—" || trimmed === "-") return null;

  const prefixMatch = trimmed.match(/^[^\d+\-]*/)?.[0] || "";
  const suffixMatch = trimmed.match(/[^\d.,]*$/)?.[0] || "";
  const affixes = `${prefixMatch}${suffixMatch}`.replace(/\s/g, "");
  if (/[a-zçğıöşü]/i.test(affixes.replace(/TL|TRY/gi, ""))) return null;

  const numericPart = trimmed
    .slice(prefixMatch.length, trimmed.length - suffixMatch.length)
    .replace(/\s/g, "");
  if (!/^[+\-]?[\d.,]+$/.test(numericPart)) return null;

  const comma = numericPart.lastIndexOf(",");
  const dot = numericPart.lastIndexOf(".");
  let normalized = numericPart;
  let decimals = 0;

  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    decimals = Math.min(2, numericPart.length - Math.max(comma, dot) - 1);
    normalized = numericPart.split(thousandsSeparator).join("").replace(decimalSeparator, ".");
  } else if (comma >= 0) {
    const digitsAfter = numericPart.length - comma - 1;
    if (digitsAfter > 0 && digitsAfter <= 2) {
      decimals = digitsAfter;
      normalized = numericPart.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = numericPart.replace(/,/g, "");
    }
  } else if (dot >= 0) {
    const digitsAfter = numericPart.length - dot - 1;
    if (digitsAfter > 0 && digitsAfter !== 3 && digitsAfter <= 2) {
      decimals = digitsAfter;
      normalized = numericPart.replace(/,/g, "");
    } else {
      normalized = numericPart.replace(/\./g, "");
    }
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  const formatter = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return {
    value,
    format: (next: number) => `${prefixMatch}${formatter.format(next)}${suffixMatch}`,
  };
}

function processMetric(element: HTMLElement, reducedMotion: boolean) {
  const text = element.textContent?.trim() || "";
  const currentFrame = animationFrames.get(element);
  if (currentFrame) window.cancelAnimationFrame(currentFrame);

  if (!text || text === "—" || text === "-") {
    element.classList.add("cr-number-skeleton");
    element.classList.remove("cr-number-revealed");
    return;
  }

  const parsed = parseLocalizedNumber(text);
  element.classList.remove("cr-number-skeleton");
  if (!parsed) return;

  const previous = lastValues.get(element);
  if (previous === parsed.value) return;
  lastValues.set(element, parsed.value);
  element.setAttribute("aria-label", text);

  if (reducedMotion) {
    element.textContent = parsed.format(parsed.value);
    element.classList.add("cr-number-revealed");
    return;
  }

  const from = previous ?? 0;
  const difference = parsed.value - from;
  const startedAt = performance.now();
  element.dataset.crNumberAnimating = "1";
  element.classList.remove("cr-number-revealed");

  const frame = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / COUNT_UP_DURATION_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = parsed.format(from + difference * eased);
    if (progress < 1) {
      animationFrames.set(element, window.requestAnimationFrame(frame));
      return;
    }
    element.textContent = parsed.format(parsed.value);
    element.dataset.crNumberAnimating = "0";
    element.classList.add("cr-number-revealed");
    animationFrames.delete(element);
  };

  animationFrames.set(element, window.requestAnimationFrame(frame));
}

function scan(root: ParentNode, reducedMotion: boolean) {
  if (root instanceof HTMLElement && root.matches(METRIC_SELECTOR) && root.dataset.crNumberAnimating !== "1") {
    processMetric(root, reducedMotion);
  }
  root.querySelectorAll<HTMLElement>(METRIC_SELECTOR).forEach((element) => {
    if (element.dataset.crNumberAnimating !== "1") processMetric(element, reducedMotion);
  });
}

export function AdminDataMotion() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let queued = false;

    const scheduleScan = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        scan(document, media.matches);
      });
    };

    scheduleScan();
    const observer = new MutationObserver((mutations) => {
      if (mutations.every((mutation) => {
        const parent = mutation.target.parentElement;
        return parent?.dataset.crNumberAnimating === "1";
      })) return;
      scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    media.addEventListener("change", scheduleScan);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", scheduleScan);
      document.querySelectorAll<HTMLElement>(METRIC_SELECTOR).forEach((element) => {
        const frame = animationFrames.get(element);
        if (frame) window.cancelAnimationFrame(frame);
      });
    };
  }, []);

  return null;
}
