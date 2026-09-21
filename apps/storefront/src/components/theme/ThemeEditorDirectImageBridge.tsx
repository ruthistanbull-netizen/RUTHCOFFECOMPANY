"use client";

import { useEffect, useRef } from "react";

type EditorMessage = {
  type?: string;
  id?: string;
  selector?: string;
  imageSrc?: string;
  src?: string;
  settings?: unknown;
};

function isHeroImageId(id: string) {
  return /^home-hero-image-\d+(?:--(?:desktop|mobile)-image)?$/.test(id);
}

function validImageSrc(value: unknown) {
  const src = typeof value === "string" ? value.trim() : "";
  if (!src) return "";
  if (src.startsWith("/") && !src.startsWith("//")) return src;
  try {
    const url = new URL(src);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function applyImage(id: string, src: string) {
  if (isHeroImageId(id)) return;
  let target: Element | null = null;
  try {
    target = document.querySelector(`[data-theme-id="${CSS.escape(id)}"]`);
  } catch {
    return;
  }
  if (!target) return;

  const image = target instanceof HTMLImageElement
    ? target
    : target.querySelector("img");
  if (!(image instanceof HTMLImageElement)) return;

  if (image.getAttribute("src") !== src) image.setAttribute("src", src);
  if (image.getAttribute("srcset") !== src) image.setAttribute("srcset", src);
  if (image.src !== src) image.src = src;
  if (image.srcset !== src) image.srcset = src;
  image.removeAttribute("sizes");

  const picture = image.closest("picture");
  if (picture) {
    for (const source of Array.from(picture.querySelectorAll("source"))) {
      if (source.getAttribute("srcset") !== src) source.setAttribute("srcset", src);
      if (source.srcset !== src) source.srcset = src;
      source.removeAttribute("sizes");
    }
  }
}

function imageOverridesFromSettings(settings: unknown) {
  const raw = settings && typeof settings === "object" ? settings as Record<string, any> : {};
  const editor = raw.editor && typeof raw.editor === "object" ? raw.editor as Record<string, any> : {};
  const pages = editor.pages && typeof editor.pages === "object" ? editor.pages as Record<string, any> : {};
  const pathname = window.location.pathname || "/";
  const pageKeys = ["/__global__", pathname];
  const result: Array<[string, string]> = [];

  for (const key of pageKeys) {
    const page = pages[key];
    const overrides = Array.isArray(page?.overrides) ? page.overrides : [];
    for (const item of overrides) {
      const id = typeof item?.id === "string" ? item.id.trim() : "";
      const src = validImageSrc(item?.imageSrc);
      if (id && src && !isHeroImageId(id)) result.push([id, src]);
    }
  }

  return result;
}

export function ThemeEditorDirectImageBridge() {
  const overridesRef = useRef(new Map<string, string>());
  const directIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("themeEditor") !== "1") return;

    let timer = 0;
    let frame = 0;

    const applyAll = () => {
      for (const [id, src] of overridesRef.current) applyImage(id, src);
    };

    const schedule = (delay = 16) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(applyAll, delay);
    };

    const burst = () => {
      applyAll();
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(applyAll);
      window.setTimeout(applyAll, 40);
      window.setTimeout(applyAll, 120);
      window.setTimeout(applyAll, 320);
      window.setTimeout(applyAll, 700);
      window.setTimeout(applyAll, 1200);
      window.setTimeout(applyAll, 2000);
    };

    const onMessage = (event: MessageEvent<EditorMessage>) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;

      if (event.data.type === "RUTH_THEME_EDITOR_IMAGE_OVERRIDE") {
        const id = typeof event.data.id === "string" ? event.data.id.trim() : "";
        const imageSrc = validImageSrc(event.data.imageSrc ?? event.data.src);
        if (!id || !imageSrc || isHeroImageId(id)) return;
        directIdsRef.current.add(id);
        overridesRef.current.set(id, imageSrc);
        burst();
        return;
      }

      if (event.data.type === "RUTH_THEME_EDITOR_SETTINGS" && event.data.settings) {
        let changed = false;
        for (const [id, src] of imageOverridesFromSettings(event.data.settings)) {
          if (directIdsRef.current.has(id)) continue;
          if (overridesRef.current.get(id) !== src) {
            overridesRef.current.set(id, src);
            changed = true;
          }
        }
        if (changed) burst();
      }
    };

    const observer = new MutationObserver((mutations) => {
      if (!overridesRef.current.size) return;
      const relevant = mutations.some((mutation) =>
        mutation.type === "childList" ||
        (mutation.type === "attributes" && (mutation.attributeName === "src" || mutation.attributeName === "srcset" || mutation.attributeName === "sizes")),
      );
      if (relevant) schedule(8);
    });

    window.addEventListener("message", onMessage);
    window.addEventListener("resize", applyAll);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "srcset", "sizes"],
    });

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("resize", applyAll);
      observer.disconnect();
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
