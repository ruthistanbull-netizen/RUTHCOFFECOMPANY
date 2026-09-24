"use client";

import { useEffect } from "react";

const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;
const IPHONE_FRAME = { width: 429, height: 888 } as const;

function rootElement() {
  return document.querySelector("[data-theme-customizer-v4]") as HTMLElement | null;
}

function previewStage(root: HTMLElement) {
  return root.querySelector("main") as HTMLElement | null;
}

function previewShell(stage: HTMLElement) {
  return stage.firstElementChild instanceof HTMLElement ? stage.firstElementChild : null;
}

function currentDevice(shell: HTMLElement): "desktop" | "mobile" {
  return shell.className.includes("w-[430px]") || shell.className.includes("max-h-[820px]") ? "mobile" : "desktop";
}

function ensureIphoneHardware(shell: HTMLElement, mobile: boolean) {
  shell.querySelectorAll("[data-ruth-iphone-hardware]").forEach((node) => {
    if (!mobile) node.remove();
  });
  if (!mobile || shell.querySelector("[data-ruth-iphone-hardware]")) return;

  const parts = [
    ["mute", "ruth-iphone-mute"],
    ["volume-up", "ruth-iphone-volume-up"],
    ["volume-down", "ruth-iphone-volume-down"],
    ["power", "ruth-iphone-power"],
  ] as const;

  for (const [name, className] of parts) {
    const part = document.createElement("span");
    part.setAttribute("aria-hidden", "true");
    part.setAttribute("data-ruth-iphone-hardware", name);
    part.className = className;
    shell.appendChild(part);
  }
}

function fitPreview() {
  const root = rootElement();
  if (!root) return;
  const stage = previewStage(root);
  if (!stage) return;
  const shell = previewShell(stage);
  if (!shell) return;

  const device = currentDevice(shell);
  const frame = device === "mobile" ? IPHONE_FRAME : DESKTOP_VIEWPORT;
  const rect = stage.getBoundingClientRect();
  const compactToolbar = window.innerWidth < 640 ? 54 : 0;
  const availableWidth = Math.max(180, rect.width - 24);
  const availableHeight = Math.max(180, rect.height - 24 - compactToolbar);
  const scale = Math.max(0.18, Math.min(1, availableWidth / frame.width, availableHeight / frame.height));

  root.dataset.ruthPreviewDevice = device;
  shell.dataset.ruthPreviewShell = device;
  shell.style.setProperty("--ruth-preview-scale", String(scale));
  ensureIphoneHardware(shell, device === "mobile");
}

export function ThemeEditorDevicePreview() {
  useEffect(() => {
    let stopped = false;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let observedStage: HTMLElement | null = null;

    const schedule = () => {
      if (stopped) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        fitPreview();
        const root = rootElement();
        const stage = root ? previewStage(root) : null;
        if (stage && stage !== observedStage) {
          resizeObserver?.disconnect();
          resizeObserver = new ResizeObserver(schedule);
          resizeObserver.observe(stage);
          observedStage = stage;
        }
      });
    };

    schedule();
    const root = rootElement();
    const observer = new MutationObserver(schedule);
    if (root) observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });

    document.addEventListener("click", schedule, true);
    window.addEventListener("resize", schedule);

    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener("click", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <style>{`
      [data-theme-customizer-v4] main > [data-ruth-preview-shell] {
        flex: 0 0 auto !important;
        max-width: none !important;
        max-height: none !important;
        transform: scale(var(--ruth-preview-scale, 1)) !important;
        transform-origin: center center !important;
        transition: transform .22s ease, border-radius .22s ease, box-shadow .22s ease !important;
      }

      [data-theme-customizer-v4] main > [data-ruth-preview-shell="desktop"] {
        width: ${DESKTOP_VIEWPORT.width}px !important;
        height: ${DESKTOP_VIEWPORT.height}px !important;
        padding: 0 !important;
        overflow: hidden !important;
        border: 1px solid var(--ruth-color-border-subtle) !important;
        border-radius: 16px !important;
        background: var(--rosta-carbon) !important;
        box-shadow: 0 18px 55px color-mix(in srgb, var(--rosta-carbon) 58%, transparent) !important;
      }

      [data-theme-customizer-v4] main > [data-ruth-preview-shell="mobile"] {
        box-sizing: border-box !important;
        width: ${IPHONE_FRAME.width}px !important;
        height: ${IPHONE_FRAME.height}px !important;
        padding: 12px !important;
        overflow: visible !important;
        border: 6px solid var(--rosta-carbon) !important;
        border-radius: 62px !important;
        background: var(--rosta-carbon) !important;
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--rosta-cream) 20%, transparent) inset,
          0 22px 65px color-mix(in srgb, var(--rosta-carbon) 72%, transparent),
          0 3px 10px color-mix(in srgb, var(--rosta-carbon) 52%, transparent) !important;
      }

      [data-theme-customizer-v4] main > [data-ruth-preview-shell="mobile"] iframe {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        border-radius: 44px !important;
        background: #fff !important;
      }

      [data-theme-customizer-v4] main > [data-ruth-preview-shell="mobile"]::before {
        content: "";
        position: absolute;
        z-index: 20;
        top: 27px;
        left: 50%;
        width: 118px;
        height: 34px;
        transform: translateX(-50%);
        border-radius: 999px;
        background: var(--rosta-carbon);
        box-shadow: 0 1px 1px color-mix(in srgb, var(--rosta-cream) 8%, transparent) inset, 0 1px 3px color-mix(in srgb, var(--rosta-carbon) 62%, transparent);
        pointer-events: none;
      }

      [data-theme-customizer-v4] main > [data-ruth-preview-shell="mobile"]::after {
        content: "";
        position: absolute;
        z-index: 20;
        bottom: 27px;
        left: 50%;
        width: 128px;
        height: 5px;
        transform: translateX(-50%);
        border-radius: 999px;
        background: var(--rosta-cream);
        mix-blend-mode: difference;
        opacity: .88;
        pointer-events: none;
      }

      [data-theme-customizer-v4] .ruth-iphone-mute,
      [data-theme-customizer-v4] .ruth-iphone-volume-up,
      [data-theme-customizer-v4] .ruth-iphone-volume-down,
      [data-theme-customizer-v4] .ruth-iphone-power {
        position: absolute;
        z-index: 3;
        display: block;
        width: 4px;
        background: linear-gradient(180deg, var(--rosta-carbon-soft), var(--rosta-carbon));
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--rosta-cream) 8%, transparent) inset;
        pointer-events: none;
      }

      [data-theme-customizer-v4] .ruth-iphone-mute {
        left: -9px;
        top: 148px;
        height: 32px;
        border-radius: 3px 0 0 3px;
      }
      [data-theme-customizer-v4] .ruth-iphone-volume-up {
        left: -9px;
        top: 201px;
        height: 62px;
        border-radius: 3px 0 0 3px;
      }
      [data-theme-customizer-v4] .ruth-iphone-volume-down {
        left: -9px;
        top: 278px;
        height: 62px;
        border-radius: 3px 0 0 3px;
      }
      [data-theme-customizer-v4] .ruth-iphone-power {
        right: -9px;
        top: 226px;
        height: 96px;
        border-radius: 0 3px 3px 0;
      }

      @media (max-width: 639px) {
        [data-theme-customizer-v4] > header > div:nth-child(2) > div:has(button[aria-label="Masaüstü önizleme"]) {
          position: fixed !important;
          z-index: 2147483635 !important;
          top: 70px !important;
          left: 50% !important;
          display: flex !important;
          transform: translateX(-50%) !important;
          gap: 3px !important;
          padding: 4px !important;
          border: 1px solid var(--ruth-color-border-subtle) !important;
          border-radius: 11px !important;
          background: color-mix(in srgb, var(--rosta-carbon-soft) 96%, transparent) !important;
          box-shadow: 0 7px 24px color-mix(in srgb, var(--rosta-carbon) 52%, transparent) !important;
          backdrop-filter: blur(14px) !important;
          -webkit-backdrop-filter: blur(14px) !important;
        }

        [data-theme-customizer-v4] button[aria-label="Masaüstü önizleme"],
        [data-theme-customizer-v4] button[aria-label="Mobil önizleme"] {
          display: inline-flex !important;
          width: auto !important;
          min-width: 82px !important;
          height: 32px !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 6px !important;
          padding: 0 9px !important;
          font-size: 9px !important;
          font-weight: 600 !important;
          white-space: nowrap !important;
        }

        [data-theme-customizer-v4] button[aria-label="Masaüstü önizleme"]::after { content: "Masaüstü"; }
        [data-theme-customizer-v4] button[aria-label="Mobil önizleme"]::after { content: "Telefon"; }

        [data-theme-customizer-v4] main {
          padding-top: 58px !important;
        }
      }
    `}</style>
  );
}
