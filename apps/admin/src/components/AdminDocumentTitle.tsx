"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const HUB_ROUTES = new Set([
  "/",
  "/login",
  "/profiles",
  "/forgot-password",
  "/reset-password",
  "/auth/login",
  "/auth/forgot-password",
  "/auth/reset-password",
]);

function titleForPath(pathname: string) {
  if (HUB_ROUTES.has(pathname)) return "RR HUB";
  if (pathname === "/ruth" || pathname.startsWith("/ruth/")) return "Ruth Istanbul";
  return "ROSTA Coffee Co.";
}

export function AdminDocumentTitle() {
  const pathname = usePathname();

  useEffect(() => {
    const title = titleForPath(pathname);

    const applyTitle = () => {
      if (document.title !== title) document.title = title;
    };

    applyTitle();

    // Next.js metadata updates can run after client navigation. Keep the tab
    // title aligned with the active RR HUB workspace instead of falling back
    // to the root "RR HUB" title.
    const titleElement = document.querySelector("title");
    const observer = titleElement
      ? new MutationObserver(() => {
          window.queueMicrotask(applyTitle);
        })
      : null;

    if (titleElement && observer) {
      observer.observe(titleElement, { childList: true, characterData: true, subtree: true });
    }

    const onPageShow = () => applyTitle();
    window.addEventListener("pageshow", onPageShow);

    return () => {
      observer?.disconnect();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [pathname]);

  return null;
}
