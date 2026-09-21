"use client";

import { useEffect } from "react";

export function ThemeEditorHomeScrollBridge() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("themeEditor") !== "1") return;
    if (window.parent === window) return;

    let frame = 0;
    const postScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        window.parent.postMessage({
          type: "RUTH_THEME_EDITOR_SCROLL_STATE",
          pathname: window.location.pathname,
          scrollY: window.scrollY,
        }, "*");
      });
    };

    const scrollToSection = (sectionId: string, behavior: ScrollBehavior = "smooth") => {
      const target = document.querySelector(`[data-theme-section-id="${CSS.escape(sectionId)}"]`) as HTMLElement | null;
      if (!target) return false;
      target.scrollIntoView({ behavior, block: "start" });
      window.setTimeout(postScroll, behavior === "smooth" ? 420 : 40);
      return true;
    };

    const scrollToIndex = (index: number, behavior: ScrollBehavior = "smooth") => {
      const sections = Array.from(document.querySelectorAll("[data-theme-section-id]")) as HTMLElement[];
      const target = sections[index];
      if (!target) return false;
      target.scrollIntoView({ behavior, block: "start" });
      window.setTimeout(postScroll, behavior === "smooth" ? 420 : 40);
      return true;
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      if (event.data.type === "RUTH_THEME_EDITOR_RESTORE_SCROLL") {
        const y = Number(event.data.scrollY || 0);
        if (Number.isFinite(y) && y > 0) {
          window.scrollTo({ top: y, behavior: "auto" });
          window.setTimeout(postScroll, 30);
        }
        return;
      }
      if (event.data.type === "RUTH_THEME_EDITOR_SCROLL_SECTION" && typeof event.data.sectionId === "string") {
        scrollToSection(event.data.sectionId, event.data.behavior === "auto" ? "auto" : "smooth");
        return;
      }
      if (event.data.type === "RUTH_THEME_EDITOR_SCROLL_SECTION_INDEX") {
        const index = Number(event.data.index);
        if (Number.isInteger(index) && index >= 0) {
          scrollToIndex(index, event.data.behavior === "auto" ? "auto" : "smooth");
        }
      }
    };

    postScroll();
    window.addEventListener("scroll", postScroll, { passive: true });
    window.addEventListener("message", onMessage);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", postScroll);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return null;
}
