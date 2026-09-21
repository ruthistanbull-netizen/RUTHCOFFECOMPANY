"use client";

import { useEffect } from "react";

function currentSlug() {
  const match = window.location.pathname.match(/^\/products\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function normalizeCode(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function structuredProductCode() {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]');

  const findProduct = (value: unknown): string => {
    if (!value || typeof value !== "object") return "";
    if (Array.isArray(value)) {
      for (const item of value) {
        const code = findProduct(item);
        if (code) return code;
      }
      return "";
    }

    const record = value as Record<string, unknown>;
    const type = record["@type"];
    const isProduct = Array.isArray(type)
      ? type.some((entry) => String(entry).toLowerCase() === "product")
      : String(type || "").toLowerCase() === "product";

    if (isProduct) {
      const code = normalizeCode(record.sku);
      if (code) return code;
    }

    const graph = record["@graph"];
    return graph ? findProduct(graph) : "";
  };

  for (const script of scripts) {
    try {
      const code = findProduct(JSON.parse(script.textContent || "null"));
      if (code) return code;
    } catch {
      // Ignore unrelated or malformed structured-data blocks.
    }
  }

  return "";
}

function makeMount(tag: "p" | "span" = "p") {
  const mount = document.createElement(tag);
  mount.dataset.ruthStorefrontProductCode = "true";
  mount.className = "ruth-storefront-product-code";
  mount.hidden = true;
  return mount;
}

function ensureDesktopMount(title: HTMLElement) {
  let mount = title.parentElement?.querySelector<HTMLElement>("[data-ruth-storefront-product-code]") || null;
  if (!mount) {
    mount = makeMount("p");
    title.insertAdjacentElement("afterend", mount);
  } else if (title.nextElementSibling !== mount) {
    title.insertAdjacentElement("afterend", mount);
  }
  mount.dataset.ruthProductCodePlacement = "desktop";
  return mount;
}

function ensureMobileMount(title: HTMLElement) {
  let mount = title.querySelector<HTMLElement>(":scope > [data-ruth-storefront-product-code]") || null;
  if (!mount) {
    mount = makeMount("span");
    title.append(mount);
  }
  mount.dataset.ruthProductCodePlacement = "mobile";
  return mount;
}

function resolveMount() {
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  if (mobile) {
    const mobileTitle = document.querySelector<HTMLElement>(
      ".product-purchase-mobile .product-mobile-buy-row > h1",
    );
    if (mobileTitle) return ensureMobileMount(mobileTitle);
  }

  const title = document.querySelector<HTMLElement>(".product-title");
  return title ? ensureDesktopMount(title) : null;
}

function showCode(mount: HTMLElement, code: string) {
  const normalized = normalizeCode(code);
  if (!normalized) return false;
  const text = `ÜRÜN KODU · ${normalized}`;
  if (mount.textContent !== text) mount.textContent = text;
  mount.hidden = false;
  mount.removeAttribute("aria-hidden");
  return true;
}

export function StorefrontProductCode() {
  useEffect(() => {
    const initialSlug = currentSlug();
    const initialCode = structuredProductCode();
    const codeBySlug = new Map<string, string>();
    if (initialSlug && initialCode) codeBySlug.set(initialSlug, initialCode);

    let lastSlug = "";
    let frame = 0;
    let request: AbortController | null = null;

    const load = async (slug: string, mount: HTMLElement) => {
      request?.abort();
      request = new AbortController();
      try {
        const response = await fetch(`/api/products/${encodeURIComponent(slug)}/browser-window`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: request.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("product-code-fetch-failed");
        const payload = await response.json() as {
          window?: {
            current?: {
              product_code?: string | null;
              sku?: string | null;
              variants?: Array<{ sku?: string | null }> | null;
            } | null;
          } | null;
        };
        const current = payload.window?.current;
        const code = normalizeCode(
          current?.product_code || current?.variants?.find((variant) => normalizeCode(variant?.sku))?.sku || current?.sku,
        );
        if (slug !== currentSlug()) return;
        if (code) codeBySlug.set(slug, code);
        if (showCode(mount, code)) return;

        const cached = codeBySlug.get(slug) || (slug === initialSlug ? initialCode : "");
        if (showCode(mount, cached)) return;
        mount.hidden = true;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const cached = codeBySlug.get(slug) || (slug === initialSlug ? initialCode : "");
        if (showCode(mount, cached)) return;
        mount.hidden = true;
      }
    };

    const sync = () => {
      frame = 0;
      const slug = currentSlug();
      const mount = slug ? resolveMount() : null;
      if (!slug || !mount) {
        if (!slug) {
          document.querySelectorAll<HTMLElement>("[data-ruth-storefront-product-code]").forEach((node) => node.remove());
          lastSlug = "";
        }
        return;
      }

      document.querySelectorAll<HTMLElement>("[data-ruth-storefront-product-code]").forEach((node) => {
        if (node !== mount) node.remove();
      });

      const cached = codeBySlug.get(slug) || (slug === initialSlug ? initialCode : "");
      if (showCode(mount, cached) && slug === lastSlug) return;

      if (slug !== lastSlug) {
        lastSlug = slug;
        if (!showCode(mount, cached)) mount.hidden = true;
        void load(slug, mount);
        return;
      }

      if (mount.hidden) void load(slug, mount);
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const interval = window.setInterval(schedule, 350);
    const media = window.matchMedia("(max-width: 767px)");
    media.addEventListener("change", schedule);
    window.addEventListener("popstate", schedule);
    window.addEventListener("pageshow", schedule);
    schedule();

    return () => {
      observer.disconnect();
      request?.abort();
      window.clearInterval(interval);
      media.removeEventListener("change", schedule);
      window.removeEventListener("popstate", schedule);
      window.removeEventListener("pageshow", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      document.querySelectorAll<HTMLElement>("[data-ruth-storefront-product-code]").forEach((node) => node.remove());
    };
  }, []);

  return (
    <style>{`
      .ruth-storefront-product-code {
        display: block;
        margin: 7px 0 0 !important;
        color: var(--muted-foreground) !important;
        font-family: var(--font-body) !important;
        font-size: 8px !important;
        font-weight: 500 !important;
        line-height: 1.25 !important;
        letter-spacing: .12em !important;
        text-transform: uppercase !important;
      }
      .ruth-storefront-product-code[hidden] {
        display: none !important;
      }
      @media (max-width: 767px) {
        .product-purchase-mobile .product-mobile-buy-row > h1 {
          min-width: 0;
        }
        .ruth-storefront-product-code[data-ruth-product-code-placement="mobile"] {
          display: block !important;
          width: max-content;
          max-width: 100%;
          margin: 3px 0 0 !important;
          padding: 0 !important;
          color: var(--muted-foreground) !important;
          font-size: 7.5px !important;
          font-weight: 500 !important;
          line-height: 1.15 !important;
          letter-spacing: .09em !important;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ruth-storefront-product-code[data-ruth-product-code-placement="mobile"][hidden] {
          display: none !important;
        }
      }
    `}</style>
  );
}
