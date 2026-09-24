"use client";

import { useEffect } from "react";

const ROOT_SELECTOR = '[data-ruth-mobile-quarter-menu="true"]';
const SUB_ARC_SELECTOR = 'circle[class*="subAccentArc"]';
const MAIN_ARC_SELECTOR = 'circle[class*="accentWedge"]';
const FINALIZE_MS = 930;

function accentColor(root: HTMLElement, strong = false) {
  const css = getComputedStyle(root);
  return css.getPropertyValue(strong ? "--quarter-menu-accent-strong" : "--quarter-menu-accent").trim()
    || (strong ? "#e2c76b" : "#c9a23a");
}

function fixMainArc(root: HTMLElement) {
  const circle = root.querySelector<SVGCircleElement>(MAIN_ARC_SELECTOR);
  if (!circle || circle.dataset.ruthMainArcTimer) return;

  const mainGroups = Array.from(root.querySelectorAll<SVGGElement>('svg > g[role="button"]'));
  const featuredGroup = mainGroups[1];
  const featuredPath = featuredGroup?.querySelector<SVGPathElement>(':scope > path[class*="mainSegment"]');
  if (!featuredPath) return;

  circle.dataset.ruthMainArcTimer = "1";
  window.setTimeout(() => {
    if (!root.isConnected || !circle.isConnected || !featuredPath.isConnected) return;
    const color = accentColor(root);

    // The source CodePen dash is only used for the opening motion. Once it has
    // settled, lock the gold area to the exact middle 30° sector so it sits
    // perfectly under the featured top-level icon and label on every viewport.
    featuredPath.style.fill = color;
    featuredPath.style.stroke = color;
    featuredPath.style.strokeWidth = "0";
    circle.style.opacity = "0";
  }, FINALIZE_MS);
}

function fixSubArc(circle: SVGCircleElement) {
  const clip = circle.getAttribute("clip-path");
  const rotateGroup = circle.parentElement;
  const motionGroup = rotateGroup?.parentElement;
  const itemGroup = motionGroup?.parentElement;

  if (clip && itemGroup instanceof SVGGElement) {
    // Keep the submenu sector mask fixed in its final slot while the animated
    // circle translates/rotates into place. The mask must not rotate with it.
    itemGroup.setAttribute("clip-path", clip);
    circle.removeAttribute("clip-path");
  }

  circle.style.vectorEffect = "none";

  const targetGroup = itemGroup instanceof SVGGElement ? itemGroup : null;
  const hitPath = targetGroup?.querySelector<SVGPathElement>('path[class*="subHitSegment"]');
  if (!hitPath) return;

  const active = circle.getAttribute("class")?.includes("subAccentArcActive") ?? false;
  const timerKey = active ? "ruthArcActiveTimer" : "ruthArcTimer";
  if (hitPath.dataset[timerKey]) return;
  hitPath.dataset[timerKey] = "1";

  window.setTimeout(() => {
    if (!hitPath.isConnected || !circle.isConnected) return;
    const root = circle.closest(ROOT_SELECTOR) as HTMLElement | null;
    if (!root) return;
    const color = accentColor(root, active);

    // Preserve the reveal animation, then overpaint with the exact submenu
    // sector geometry. This removes the short/offset edge on 1-, 2- and
    // multi-item submenus and keeps every gold slice centered on its label.
    hitPath.style.fill = color;
    hitPath.style.stroke = color;
    hitPath.style.strokeWidth = "0";
  }, FINALIZE_MS);
}

function fixAll() {
  const root = document.querySelector<HTMLElement>(ROOT_SELECTOR);
  if (!root) return;
  fixMainArc(root);
  root.querySelectorAll<SVGCircleElement>(SUB_ARC_SELECTOR).forEach(fixSubArc);
}

export function AdminMobileMudrenokSubmenuArcFix() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        fixAll();
      });
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "clip-path"],
    });

    schedule();
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
