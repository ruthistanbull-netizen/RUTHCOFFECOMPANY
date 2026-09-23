"use client";

import { useEffect, useRef } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  normalizeThemeSectionSettings,
  themeSectionPage,
  type ThemeSectionSettings,
} from "@ruth-commerce/commerce-core/theme-sections";

type ScrollStateMessage = {
  type?: string;
  scrollY?: number;
  pathname?: string;
};

function previewFrame() {
  return document.querySelector("[data-theme-customizer-v4] iframe") as HTMLIFrameElement | null;
}

function currentPreviewPath() {
  const frame = previewFrame();
  if (!frame?.src) return "/";
  try {
    return new URL(frame.src).pathname || "/";
  } catch {
    return "/";
  }
}

function isSectionTitleButton(button: HTMLButtonElement) {
  if (!button.closest("[data-theme-sections-panel]")) return false;
  if (!button.className.includes("min-w-0") || !button.className.includes("text-left")) return false;
  const row = button.parentElement;
  return Boolean(row?.className.includes("group") && row?.className.includes("min-h-[46px]"));
}

function sectionIndex(button: HTMLButtonElement) {
  const row = button.parentElement;
  const list = row?.parentElement;
  if (!row || !list) return -1;
  const rows = Array.from(list.children).filter((node) =>
    node instanceof HTMLElement && node.className.includes("group") && node.className.includes("min-h-[46px]"),
  );
  return rows.indexOf(row);
}

export function ThemeEditorSectionNavigator() {
  const settingsRef = useRef<ThemeSectionSettings | null>(null);
  const scrollRef = useRef<Record<string, number>>({});
  const selectedSectionRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void adminRequest<{ settings?: unknown }>(`/api/theme-sections?t=${Date.now()}`, { force: true })
      .then((result) => {
        if (!active) return;
        settingsRef.current = normalizeThemeSectionSettings(result.settings);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent<ScrollStateMessage>) => {
      const frameWindow = previewFrame()?.contentWindow;
      if (frameWindow && event.source !== frameWindow) return;
      if (!event.data || typeof event.data !== "object") return;
      if (event.data.type !== "RUTH_THEME_EDITOR_SCROLL_STATE") return;
      const y = Number(event.data.scrollY || 0);
      const pathname = typeof event.data.pathname === "string" ? event.data.pathname : currentPreviewPath();
      if (Number.isFinite(y)) scrollRef.current[pathname] = Math.max(0, y);
    };

    const restore = () => {
      const frame = previewFrame();
      if (!frame?.contentWindow) return;
      const pathname = currentPreviewPath();
      const sectionId = selectedSectionRef.current;
      const y = scrollRef.current[pathname] || 0;
      const send = () => {
        if (sectionId) {
          frame.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_SCROLL_SECTION", sectionId, behavior: "auto" }, "*");
        } else if (y > 0) {
          frame.contentWindow?.postMessage({ type: "RUTH_THEME_EDITOR_RESTORE_SCROLL", scrollY: y }, "*");
        }
      };
      window.setTimeout(send, 20);
      window.setTimeout(send, 120);
      window.setTimeout(send, 320);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest("button") as HTMLButtonElement | null;
      if (!button || !isSectionTitleButton(button)) return;

      const index = sectionIndex(button);
      if (index < 0) return;
      const settings = settingsRef.current;
      const pathname = currentPreviewPath();
      const page = settings ? themeSectionPage(settings, pathname) : null;
      const sectionId = page?.sections[index]?.id || "";
      selectedSectionRef.current = sectionId || null;

      const frame = previewFrame();
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage(
        sectionId
          ? { type: "RUTH_THEME_EDITOR_SCROLL_SECTION", sectionId, behavior: "smooth" }
          : { type: "RUTH_THEME_EDITOR_SCROLL_SECTION_INDEX", index, behavior: "smooth" },
        "*",
      );
    };

    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);

    const timer = window.setInterval(() => {
      const frame = previewFrame();
      if (!frame || frame.dataset.ruthScrollRestoreBound === "1") return;
      frame.dataset.ruthScrollRestoreBound = "1";
      frame.addEventListener("load", restore);
    }, 300);

    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      window.clearInterval(timer);
      const frame = previewFrame();
      frame?.removeEventListener("load", restore);
    };
  }, []);

  return null;
}
