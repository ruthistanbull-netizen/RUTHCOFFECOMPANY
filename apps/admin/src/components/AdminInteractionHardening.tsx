"use client";

import { useEffect } from "react";

function iconLabel(button: HTMLButtonElement) {
  const iconClass = button.querySelector("svg")?.getAttribute("class") || "";
  if (iconClass.includes("lucide-pencil")) return "Düzenle";
  if (iconClass.includes("lucide-map-pin")) return "Teslimat detayını aç";
  if (iconClass.includes("lucide-refresh-cw")) return "Durumu yenile";
  if (iconClass.includes("lucide-arrow-right") || iconClass.includes("lucide-circle-dollar-sign")) return "Detayı aç";
  if (iconClass.includes("lucide-trash")) return "Sil";
  if (iconClass.includes("lucide-arrow-up")) return "Yukarı taşı";
  if (iconClass.includes("lucide-arrow-down")) return "Aşağı taşı";
  if (iconClass.includes("lucide-x")) return "Kapat";
  return "İşlemi aç";
}

function hasAccessibleName(button: HTMLButtonElement) {
  return Boolean(
    button.getAttribute("aria-label") ||
    button.getAttribute("aria-labelledby") ||
    button.getAttribute("title") ||
    button.textContent?.trim(),
  );
}

function enhanceControls(root: ParentNode = document) {
  root.querySelectorAll<HTMLButtonElement>("button.cr-icon-button, .cr-notice > button, .cr-search-field > button").forEach((button) => {
    if (!hasAccessibleName(button)) button.setAttribute("aria-label", iconLabel(button));
  });

  root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
    if (input.getAttribute("aria-label") || input.getAttribute("aria-labelledby")) return;
    const orderReference = input
      .closest(".cr-shipping-card")
      ?.querySelector(".cr-shipping-card__identity small")
      ?.textContent
      ?.trim();
    input.setAttribute("aria-label", orderReference ? `${orderReference} siparişini seç` : "Siparişi seç");
  });
}

function closeOrderDrawerAfterRouteSync() {
  const close = () => {
    if (new URL(window.location.href).searchParams.has("order")) return;
    document
      .querySelector<HTMLButtonElement>('.ruth-drawer button[aria-label="Kapat"]')
      ?.click();
  };

  window.requestAnimationFrame(close);
  window.setTimeout(close, 50);
  window.setTimeout(close, 180);
  window.setTimeout(close, 420);
}

export function AdminInteractionHardening() {
  useEffect(() => {
    enhanceControls();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) enhanceControls(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const clearDrawerRouteState = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !document.querySelector(".ruth-drawer")) return;
      const url = new URL(window.location.href);
      if (!url.searchParams.has("order")) return;
      url.searchParams.delete("order");
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, "", next);
      window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
      closeOrderDrawerAfterRouteSync();
    };
    window.addEventListener("keydown", clearDrawerRouteState, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", clearDrawerRouteState, true);
    };
  }, []);

  return null;
}
