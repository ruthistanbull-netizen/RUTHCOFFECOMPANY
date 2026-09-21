"use client";

import { useEffect } from "react";

const COOKIE_NAME = "ruth_product_source";

function normalizedCatalogSource(pathname: string) {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  if (/^\/collections\/[^/]+$/i.test(path)) return path;
  if (/^\/category\/[^/]+$/i.test(path)) return path;
  if (/^\/categories\/[^/]+$/i.test(path)) return path;
  return "";
}

function productHrefFromTarget(target: Element) {
  const anchor = target.closest<HTMLAnchorElement>('a[href^="/products/"]');
  if (anchor) return anchor.getAttribute("href") || "";

  const productRoot = target.closest<HTMLElement>(".product-card-root, article");
  return productRoot?.querySelector<HTMLAnchorElement>('a[href^="/products/"]')?.getAttribute("href") || "";
}

function writeSourceCookie(source: string) {
  if (!source) {
    document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(source)}; Path=/; Max-Age=3600; SameSite=Lax`;
}

// Keep product swipe navigation scoped to the catalog context that opened the product.
export function ProductNavigationContextCapture() {
  useEffect(() => {
    const captureProductNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const href = productHrefFromTarget(target);
      if (!href.startsWith("/products/")) return;
      writeSourceCookie(normalizedCatalogSource(window.location.pathname));
    };

    document.addEventListener("click", captureProductNavigation, true);
    return () => document.removeEventListener("click", captureProductNavigation, true);
  }, []);

  return null;
}
