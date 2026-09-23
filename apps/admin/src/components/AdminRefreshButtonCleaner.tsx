"use client";

import { useEffect } from "react";

const REFRESH_PATTERNS = [
  /^yenile$/i,
  /^refresh$/i,
  /^verileri yenile$/i,
  /^listeyi yenile$/i,
  /^durumu yenile$/i,
  /^sayfayı yenile$/i,
  /^önizlemeyi yenile$/i,
  /^tekrar yenile$/i,
];

function normalize(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isRefreshControl(element: HTMLElement) {
  if (element.dataset.keepRefreshControl === "true") return false;
  const values = [
    normalize(element.textContent),
    normalize(element.getAttribute("aria-label")),
    normalize(element.getAttribute("title")),
  ].filter(Boolean);
  return values.some((value) => REFRESH_PATTERNS.some((pattern) => pattern.test(value)));
}

function clean(root: ParentNode = document) {
  const candidates: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches("button,a,[role='button']")) candidates.push(root);
  root.querySelectorAll<HTMLElement>("button,a,[role='button']").forEach((element) => candidates.push(element));
  for (const element of candidates) {
    if (!isRefreshControl(element)) continue;
    element.hidden = true;
    element.dataset.redundantRefreshControl = "true";
    element.setAttribute("aria-hidden", "true");
    element.tabIndex = -1;
  }
}

export function AdminRefreshButtonCleaner() {
  useEffect(() => {
    clean();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement) clean(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
