"use client";

import { useLayoutEffect } from "react";

const SOURCE_COLORS: Array<[RegExp, string]> = [
  [/instagram|^ig$/i, "#E1306C"],
  [/facebook|meta|^fb$/i, "#1877F2"],
  [/tiktok|^tt$/i, "#111111"],
  [/google/i, "#4285F4"],
  [/organik|organic/i, "#34A853"],
  [/yönlendirme|referral/i, "#F59E0B"],
  [/e-posta|email|newsletter/i, "#EA4335"],
  [/doğrudan|direct/i, "#55606F"],
  [/diğer|other/i, "#9CA3AF"],
];

function sourceColor(label: string) {
  const normalized = String(label || "").trim();
  return SOURCE_COLORS.find(([pattern]) => pattern.test(normalized))?.[1] || "#9CA3AF";
}

function applyColors() {
  document.querySelectorAll<HTMLElement>('[data-ruth-video-legend="true"] > *').forEach((row) => {
    const children = Array.from(row.children) as HTMLElement[];
    const label = children[1]?.textContent || row.textContent || "";
    const color = sourceColor(label);
    if (children[0]) children[0].style.background = color;
    if (children[1]) children[1].style.color = color;
  });

  document.querySelectorAll<SVGPathElement>('svg[data-ruth-video-session-ring="true"] path[aria-label]').forEach((path) => {
    const label = String(path.getAttribute("aria-label") || "").split(":")[0] || "";
    path.setAttribute("stroke", sourceColor(label));
  });

  document.querySelectorAll<HTMLElement>('[data-ruth-ring-tooltip="true"] > div:first-child').forEach((title) => {
    title.style.color = sourceColor(title.textContent || "");
  });
}

export function DashboardSessionSourceSemanticColors() {
  useLayoutEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        applyColors();
      });
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-ruth-video-legend", "data-ruth-video-session-ring", "aria-label"],
    });

    applyColors();
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
