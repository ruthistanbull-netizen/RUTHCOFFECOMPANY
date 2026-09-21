"use client";

import { useEffect } from "react";

export function ThemeEditorNativeNavigation() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("themeEditor") !== "1") return;

    const onMouseDown = (event: MouseEvent) => {
      if (event.detail < 2) return;
      const raw = event.target instanceof Element ? event.target : null;
      if (!raw) return;

      const anchor = raw.closest("a[href]") as HTMLAnchorElement | null;
      if (anchor) {
        const originalHref = anchor.getAttribute("href") || "";
        const target = new URL(originalHref, window.location.href);
        if (target.origin === window.location.origin) {
          const current = new URL(window.location.href);
          target.searchParams.set("themeEditor", "1");
          target.searchParams.set("themePreview", String(Date.now()));
          const draft = current.searchParams.get("themeSectionsPreview");
          if (draft) target.searchParams.set("themeSectionsPreview", draft);
          anchor.setAttribute("href", target.toString());
          window.parent.postMessage(
            { type: "RUTH_THEME_EDITOR_NAVIGATED", pathname: target.pathname },
            "*",
          );
          window.setTimeout(() => {
            if (document.contains(anchor)) anchor.setAttribute("href", originalHref);
          }, 180);
        }
        anchor.setAttribute("data-ruth-theme-editor-ui", "true");
        window.setTimeout(() => anchor.removeAttribute("data-ruth-theme-editor-ui"), 180);
        return;
      }

      const control = raw.closest("button,[role='button'],summary") as HTMLElement | null;
      if (!control) return;
      control.setAttribute("data-ruth-theme-editor-ui", "true");
      window.setTimeout(() => control.removeAttribute("data-ruth-theme-editor-ui"), 120);
    };

    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, []);

  return null;
}
