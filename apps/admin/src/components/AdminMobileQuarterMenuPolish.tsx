"use client";

import { useEffect } from "react";

const SVG_NS = "http://www.w3.org/2000/svg";

function splitLabel(label: string) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1 || label.length <= 11) return [label];

  let bestIndex = 1;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const left = words.slice(0, index).join(" ");
    const right = words.slice(index).join(" ");
    const diff = Math.abs(left.length - right.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  }
  return [words.slice(0, bestIndex).join(" "), words.slice(bestIndex).join(" ")];
}

function fontSizeFor(lines: string[]) {
  const longest = Math.max(0, ...lines.map((line) => line.length));
  if (longest <= 8) return 8.2;
  if (longest <= 10) return 7.9;
  if (longest <= 12) return 7.5;
  if (longest <= 14) return 7.1;
  return 6.6;
}

function decorateSubmenuLabels(menu: HTMLElement) {
  menu.querySelectorAll<SVGGElement>('svg g[role="button"]').forEach((group) => {
    const title = group.querySelector(":scope > title");
    const icon = group.querySelector<SVGSVGElement>(":scope > svg");
    if (!title || !icon || group.querySelector('[data-quarter-submenu-label="true"]')) return;

    const label = title.textContent?.trim();
    if (!label) return;

    const x = Number(icon.getAttribute("x") || 0);
    const y = Number(icon.getAttribute("y") || 0);
    const width = Number(icon.getAttribute("width") || 15);
    const height = Number(icon.getAttribute("height") || 15);
    const centerX = x + width / 2;
    const centerY = y + height / 2;

    /* Match the main-heading visual rhythm: icon slightly above the slot center,
       then a compact, centered label block below it. The previous -7/+8.5 offsets
       made two-line submenu labels look crowded and uneven around the arc. */
    if (!icon.hasAttribute("data-quarter-submenu-icon-positioned")) {
      icon.setAttribute("y", String(y - 8.5));
      icon.setAttribute("data-quarter-submenu-icon-positioned", "true");
    }

    const lines = splitLabel(label);
    const fontSize = fontSizeFor(lines);
    const lineGap = lines.length > 1 ? Math.max(8.1, fontSize + 0.9) : 0;
    const textCenterY = centerY + 11.25;
    const firstLineY = textCenterY - ((lines.length - 1) * lineGap) / 2;

    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("data-quarter-submenu-label", "true");
    text.setAttribute("x", String(centerX));
    text.setAttribute("y", String(firstLineY));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("font-family", "var(--font-body)");
    text.setAttribute("font-size", String(fontSize));
    text.setAttribute("font-weight", "720");
    text.setAttribute("letter-spacing", "-0.02em");
    text.setAttribute("fill", "var(--quarter-menu-white)");
    text.setAttribute("pointer-events", "none");

    lines.forEach((line, index) => {
      const tspan = document.createElementNS(SVG_NS, "tspan");
      tspan.setAttribute("x", String(centerX));
      tspan.setAttribute("dy", index === 0 ? "0" : String(lineGap));
      tspan.textContent = line;
      text.appendChild(tspan);
    });

    group.insertBefore(text, title);
  });
}

export function AdminMobileQuarterMenuPolish() {
  useEffect(() => {
    let menuObserver: MutationObserver | null = null;
    let bodyObserver: MutationObserver | null = null;
    let frame = 0;

    const attachToMenu = () => {
      const menu = document.querySelector<HTMLElement>("[data-ruth-mobile-quarter-menu]");
      if (!menu || menuObserver) return false;
      decorateSubmenuLabels(menu);
      menuObserver = new MutationObserver((mutations) => {
        if (!mutations.some((mutation) => mutation.addedNodes.length || mutation.removedNodes.length)) return;
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          decorateSubmenuLabels(menu);
        });
      });
      menuObserver.observe(menu, { childList: true, subtree: true });
      bodyObserver?.disconnect();
      bodyObserver = null;
      return true;
    };

    if (!attachToMenu()) {
      bodyObserver = new MutationObserver(() => { attachToMenu(); });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      bodyObserver?.disconnect();
      menuObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
