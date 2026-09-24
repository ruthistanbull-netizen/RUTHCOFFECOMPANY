"use client";

import { useEffect } from "react";

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR");
}

function hideSavedViewRows(root: ParentNode = document) {
  const controls = root.querySelectorAll<HTMLElement>("button, select");
  controls.forEach((control) => {
    const text = normalize(control.textContent || "");
    const aria = normalize(control.getAttribute("aria-label") || "");
    const isSavedViewControl = text.includes("görünümü kaydet")
      || text.includes("kaydedilmiş görünümler")
      || aria.includes("kaydedilmiş")
      || aria.includes("görünüm");
    if (!isSavedViewControl) return;

    const row = control.closest<HTMLElement>(".border-t")
      || control.closest<HTMLElement>("[data-saved-view-row]")
      || control.parentElement?.parentElement;
    if (!row) return;
    row.dataset.adminSavedViewRowHidden = "true";
    row.style.setProperty("display", "none", "important");
  });
}

export function AdminSavedViewControlsCleaner() {
  useEffect(() => {
    hideSavedViewRows();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) hideSavedViewRows(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <style>{`
      body [data-admin-saved-view-row-hidden="true"] {
        display: none !important;
      }

      /* Chromium :has fallback path for rows rendered before hydration. */
      body .border-t:has(button .lucide-bookmark-plus),
      body .border-t:has(button:has(.lucide-bookmark-plus)) {
        display: none !important;
      }
    `}</style>
  );
}
