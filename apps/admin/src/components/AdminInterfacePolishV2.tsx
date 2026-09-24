"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const EARRING_USAGE_VALUE = "Standart küpe ölçüsüdür. Rahat ve günlük kullanım için uygundur.";
const EARRING_OPTION_VALUE = "__ruth_earring_usage__";

function setNativeControlValue(element: HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
}

function addOption(select: HTMLSelectElement, value: string, label: string) {
  if ([...select.options].some((option) => option.value === value)) return;
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  const customOption = [...select.options].find((item) => item.value === "custom" || item.value === "__custom__");
  if (customOption) select.insertBefore(option, customOption);
  else select.appendChild(option);
}

function syncProductEditorTweaks(scope: ParentNode = document) {
  const directRoot = scope instanceof HTMLElement && scope.matches('[data-exact-base44-page="product-studio"]')
    ? scope
    : null;
  const roots = directRoot
    ? [directRoot]
    : Array.from(scope.querySelectorAll<HTMLElement>('[data-exact-base44-page="product-studio"]'));

  roots.forEach((root) => {
    root.querySelectorAll<HTMLLabelElement>("label").forEach((label) => {
      const text = String(label.textContent || "").replace("*", "").trim();
      const field = label.parentElement;
      if (!field) return;

      if (text === "Kısa açıklama") {
        field.dataset.ruthHideShortDescription = "true";
        return;
      }

      const select = field.querySelector<HTMLSelectElement>("select");
      if (!select) return;

      if (text === "Ölçü ve kullanım şablonu") {
        addOption(select, EARRING_USAGE_VALUE, "Küpe · standart kullanım");
        return;
      }

      if (text !== "Ölçü ve kullanım") return;

      addOption(select, EARRING_OPTION_VALUE, "Küpe · standart kullanım");
      if (select.dataset.ruthEarringBound === "true") return;
      select.dataset.ruthEarringBound = "true";

      select.addEventListener("change", () => {
        if (select.value !== EARRING_OPTION_VALUE) {
          delete select.dataset.ruthEarringActive;
          return;
        }

        select.dataset.ruthEarringActive = "true";
        setNativeControlValue(select, "custom");

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const currentField = label.parentElement;
            const textarea = currentField?.querySelector<HTMLTextAreaElement>("textarea");
            if (!textarea) return;
            setNativeControlValue(textarea, EARRING_USAGE_VALUE);
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));

            window.requestAnimationFrame(() => {
              if (!select.isConnected || select.dataset.ruthEarringActive !== "true") return;
              addOption(select, EARRING_OPTION_VALUE, "Küpe · standart kullanım");
              setNativeControlValue(select, EARRING_OPTION_VALUE);
            });
          });
        });
      }, true);
    });
  });
}

export function AdminInterfacePolishV2() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const productEditorActive = pathname.startsWith("/products/studio")
    || (pathname === "/products" && searchParams.get("productModal") === "1");

  useEffect(() => {
    if (!productEditorActive) return;

    let syncFrame = 0;
    let findFrame = 0;
    let attempts = 0;
    let observer: MutationObserver | null = null;
    let host: HTMLElement | null = null;

    const scheduleSync = () => {
      if (syncFrame || !host) return;
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = 0;
        if (host?.isConnected) syncProductEditorTweaks(host);
      });
    };

    const attachScopedObserver = () => {
      findFrame = 0;
      const modal = document.querySelector<HTMLElement>(
        '[data-exact-workspace-modal][data-workspace-kind="product"]',
      );
      const studio = modal?.querySelector<HTMLElement>('[data-exact-base44-page="product-studio"]')
        || document.querySelector<HTMLElement>('[data-exact-base44-page="product-studio"]');

      if (!studio) {
        attempts += 1;
        if (attempts < 90) findFrame = window.requestAnimationFrame(attachScopedObserver);
        return;
      }

      host = modal || studio;
      syncProductEditorTweaks(host);
      observer = new MutationObserver(scheduleSync);
      observer.observe(host, { childList: true, subtree: true });
    };

    findFrame = window.requestAnimationFrame(attachScopedObserver);
    return () => {
      observer?.disconnect();
      if (syncFrame) window.cancelAnimationFrame(syncFrame);
      if (findFrame) window.cancelAnimationFrame(findFrame);
    };
  }, [productEditorActive]);

  return (
    <style>{`
      [data-ruth-hide-short-description="true"] {
        display: none !important;
      }

      /* Product workspace: mobile is a real one-column editor, never a squeezed desktop grid. */
      @media (max-width: 767px) {
        [data-exact-workspace-modal][data-workspace-kind="product"] {
          width: 100vw !important;
          max-width: 100vw !important;
          height: calc(100dvh - max(env(safe-area-inset-top), 28px)) !important;
          max-height: calc(100dvh - max(env(safe-area-inset-top), 28px)) !important;
          border-radius: 26px 26px 0 0 !important;
          overflow: hidden !important;
        }

        [data-exact-workspace-modal][data-workspace-kind="product"] [data-product-workspace-toolbar] {
          min-height: 0 !important;
          display: block !important;
          padding: 7px 10px 9px !important;
        }

        [data-exact-workspace-modal][data-workspace-kind="product"] [data-product-workspace-actions] {
          width: 100% !important;
          overflow: visible !important;
        }

        [data-exact-workspace-modal][data-workspace-kind="product"] [data-product-workspace-actions] > div {
          width: 100% !important;
          min-width: 0 !important;
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 7px !important;
        }

        [data-exact-workspace-modal][data-workspace-kind="product"] [data-product-workspace-actions] button {
          width: 100% !important;
          min-width: 0 !important;
          min-height: 42px !important;
          padding: 8px 10px !important;
          font-size: 12px !important;
          line-height: 1.15 !important;
          white-space: normal !important;
          border-radius: 14px !important;
        }

        [data-exact-workspace-modal][data-workspace-kind="product"] > div:last-child {
          padding: 8px 10px max(18px, env(safe-area-inset-bottom)) !important;
          overflow-x: hidden !important;
        }

        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          overflow-x: hidden !important;
        }

        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] > div:first-child {
          display: block !important;
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
        }

        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] > div:first-child > div:first-child {
          display: none !important;
        }

        /* This overrides the legacy repeat(4, 1fr) rule that caused the four thin columns. */
        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] > div:first-child > div:last-child {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          grid-template-columns: none !important;
          gap: 0 !important;
          padding: 0 0 14px !important;
          overflow: visible !important;
        }

        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] > div:first-child > div:last-child > * {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          margin-bottom: 11px !important;
        }

        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] > div:first-child > div:last-child button {
          max-width: 100% !important;
          font-size: inherit !important;
        }

        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] article,
        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] section,
        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] form,
        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] .grid,
        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] .flex {
          max-width: 100% !important;
          min-width: 0 !important;
        }

        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] img,
        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] input,
        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] textarea,
        [data-workspace-kind="product"] [data-exact-base44-page="product-studio"] select {
          max-width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }
      }

      /* Desktop brand: keep the ROSTA wordmark fully inside the sidebar header. */
      @media (min-width: 1024px) {
        aside[class*="z-sidebar"] > div:first-child {
          overflow: hidden !important;
          padding-left: 12px !important;
          padding-right: 12px !important;
        }

        aside[class*="z-sidebar"] > div:first-child > a[href="/"] {
          width: 100% !important;
          height: 100% !important;
          transform: none !important;
        }

        aside[class*="z-sidebar"] img[alt="ROSTA Coffee Co."] {
          width: 100% !important;
          max-width: 202px !important;
          height: 100% !important;
          max-height: 58px !important;
          object-fit: contain !important;
          object-position: center !important;
          transform: none !important;
        }

        aside[class*="z-sidebar"] > div:first-child > a[href="/"] > div:first-child {
          transform: none !important;
        }
      }
    `}</style>
  );
}