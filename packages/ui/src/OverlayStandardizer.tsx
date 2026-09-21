"use client";

import * as React from "react";

type OverlayKind = "dialog" | "drawer" | "popover" | "fullscreen";

const SURFACE_SELECTOR = [
  ".ruth-modal",
  ".ruth-drawer",
  ".ruth-popover",
  ".ruth-fullscreen-overlay",
  "[role='dialog']",
  "[role='alertdialog']",
  "[aria-modal='true']",
  "[role='menu'][data-state='open']",
  "[role='listbox'][data-state='open']",
  "[data-side][data-state='open']",
  "[class*='popover'][class*='content']",
  "[class*='dropdown'][class*='content']",
  "[data-ruth-overlay-surface]",
].join(",");

const SKIP_SELECTOR = [
  "[data-ruth-overlay-unstyled]",
  ".ruth-zara-menu-surface",
  ".product-gallery-frame",
  "[data-product-page-swipe-ignore]",
].join(",");

function overlayKind(element: HTMLElement): OverlayKind {
  if (element.classList.contains("ruth-modal")) return "dialog";
  if (element.classList.contains("ruth-drawer")) return "drawer";
  if (element.classList.contains("ruth-popover")) return "popover";
  if (element.classList.contains("ruth-fullscreen-overlay")) return "fullscreen";

  const role = element.getAttribute("role");
  if (role === "menu" || role === "listbox") return "popover";

  const descriptor = `${element.className || ""} ${element.getAttribute("aria-label") || ""}`.toLocaleLowerCase("tr-TR");
  if (/popover|dropdown|context-menu|account-menu|hesap-men[uü]s[uü]/.test(descriptor)) return "popover";
  if (/drawer|sheet|cart|sepet|sidebar|yan panel/.test(descriptor)) return "drawer";
  if (/fullscreen|lightbox|tam ekran/.test(descriptor)) return "fullscreen";

  const rect = element.getBoundingClientRect();
  const viewportWidth = Math.max(window.innerWidth, 1);
  const viewportHeight = Math.max(window.innerHeight, 1);
  if (rect.width > viewportWidth * 0.9 && rect.height > viewportHeight * 0.9) return "fullscreen";
  if (rect.height > viewportHeight * 0.62 && rect.width < viewportWidth * 0.68) return "drawer";
  if (rect.width > 0 && rect.width < Math.min(390, viewportWidth * 0.72) && rect.height < viewportHeight * 0.68) {
    return "popover";
  }
  return "dialog";
}

function markBackdrop(surface: HTMLElement) {
  let ancestor = surface.parentElement;
  while (ancestor && ancestor !== document.body) {
    const style = window.getComputedStyle(ancestor);
    const rect = ancestor.getBoundingClientRect();
    const coversViewport =
      style.position === "fixed" &&
      rect.width >= window.innerWidth * 0.9 &&
      rect.height >= window.innerHeight * 0.9;

    if (ancestor.classList.contains("ruth-overlay") || coversViewport) {
      ancestor.dataset.ruthOverlayBackdrop = "true";
      return;
    }
    ancestor = ancestor.parentElement;
  }
}

function markPopoverItems(surface: HTMLElement) {
  surface.querySelectorAll<HTMLElement>("a, button, [role='menuitem'], [role='option']").forEach((item) => {
    if (
      item.matches("[aria-label*='kapat' i], [aria-label*='close' i], .ruth-overlay__close") ||
      item.closest("[data-ruth-overlay-unstyled]")
    ) {
      return;
    }
    item.dataset.ruthOverlayItem = "true";
  });
}

function standardizeSurface(element: Element) {
  if (!(element instanceof HTMLElement)) return;
  if (element.matches(SKIP_SELECTOR) || element.closest(SKIP_SELECTOR)) return;

  const kind = (element.dataset.ruthOverlaySurface as OverlayKind | undefined) || overlayKind(element);
  element.dataset.ruthOverlaySurface = kind;

  if (kind !== "fullscreen") markBackdrop(element);
  if (kind === "popover") markPopoverItems(element);
}

function scan() {
  document.querySelectorAll(SURFACE_SELECTOR).forEach(standardizeSurface);
}

export function OverlayStandardizer() {
  React.useEffect(() => {
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(scan);
    };
    const onResize = () => schedule();

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "role", "aria-modal", "data-state", "style"],
    });
    window.addEventListener("resize", onResize);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return null;
}
