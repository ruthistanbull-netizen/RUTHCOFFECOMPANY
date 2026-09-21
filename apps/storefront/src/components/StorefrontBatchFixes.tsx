"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const COMPACT_COPY_SELECTOR = "a,button,p,span,h2,h3";

function tagCompactAuthCopy(root: ParentNode = document) {
  const candidates: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches(COMPACT_COPY_SELECTOR)) {
    candidates.push(root);
  }
  if ("querySelectorAll" in root) {
    candidates.push(
      ...Array.from(root.querySelectorAll<HTMLElement>(COMPACT_COPY_SELECTOR)),
    );
  }

  for (const element of candidates) {
    const text = (element.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("tr-TR");
    const inAccountPopover = Boolean(element.closest(".ruth-account-popover"));
    const accountAction =
      inAccountPopover && (text === "giriş yap" || text === "kayıt ol");
    const discountLogin = text.includes("indirimlerini görmek için giriş yap");
    element.classList.toggle(
      "ruth-compact-auth-copy",
      accountAction || discountLogin,
    );
  }
}

export function StorefrontBatchFixes() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const headerInk =
      pathname === "/" ? "var(--ruth-home-header-ink, #111111)" : "#111111";
    root.style.setProperty("--ruth-header-left-ink", headerInk);
    root.style.setProperty("--ruth-header-right-ink", headerInk);

    if (pathname.startsWith("/products/")) {
      return () => {
        root.style.removeProperty("--ruth-header-left-ink");
        root.style.removeProperty("--ruth-header-right-ink");
      };
    }

    tagCompactAuthCopy();
    const pending = new Set<ParentNode>();
    let frame = 0;

    const flush = () => {
      frame = 0;
      pending.forEach((node) => tagCompactAuthCopy(node));
      pending.clear();
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof Element) pending.add(node);
        }
      }
      if (pending.size && !frame) frame = window.requestAnimationFrame(flush);
    });
    observer.observe(document.body, { subtree: true, childList: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      pending.clear();
      root.style.removeProperty("--ruth-header-left-ink");
      root.style.removeProperty("--ruth-header-right-ink");
    };
  }, [pathname]);

  return (
    <style>{`
      @media (min-width: 1024px) {
        .home-editorial-wordmark {
          right: 2vw !important;
          left: auto !important;
          top: 34vh !important;
          width: 52vw !important;
          max-width: 52vw !important;
          height: min(48vh, 31vw) !important;
          max-height: 48vh !important;
          overflow: visible !important;
        }

        .home-editorial-wordmark img {
          width: 100% !important;
          height: 100% !important;
          object-fit: contain !important;
          object-position: right center !important;
        }

        html:not(.ruth-product-page-active) .ruth-zara-menu-button {
          color: var(--ruth-header-left-ink, #111111) !important;
          mix-blend-mode: normal !important;
        }

        html:not(.ruth-product-page-active) .ruth-zara-header-inner > div:last-child {
          color: var(--ruth-header-right-ink, #111111) !important;
          mix-blend-mode: normal !important;
        }

        html:not(.ruth-product-page-active) .ruth-zara-header-inner > div:last-child svg,
        html:not(.ruth-product-page-active) .ruth-zara-menu-button span {
          color: inherit !important;
          border-color: currentColor !important;
        }
      }

      @media (max-width: 1023px) {
        .ruth-zara-menu-logo {
          transform: translateX(20px) !important;
        }

        .ruth-zara-menu-close {
          color: #111111 !important;
        }
      }

      .ruth-account-action,
      .ruth-compact-auth-copy {
        font-size: 0.65rem !important;
        line-height: 1.35 !important;
        letter-spacing: 0.12em !important;
      }

      .ruth-account-popover .ruth-account-action {
        min-height: 38px !important;
        padding-top: 10px !important;
        padding-bottom: 10px !important;
      }

      :where(
        .product-card-current,
        .product-card-compare,
        .product-card-sale-pill,
        .product-price,
        .product-detail-sale-pill,
        .product-purchase-price,
        .product-purchase-mobile-price,
        .product-variant-picker [class*="price"]
      ) {
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
        font-weight: 400 !important;
        letter-spacing: 0.005em !important;
        font-variant-numeric: tabular-nums !important;
      }

      .product-card-sale-pill strong,
      .product-card-sale-pill em,
      .product-detail-sale-pill strong,
      .product-detail-sale-pill em {
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
        font-size: 15px !important;
        font-weight: 500 !important;
        line-height: 1 !important;
      }

      html.ruth-variant-picker-open .product-gallery-expand,
      html.ruth-variant-picker-open .product-gallery-arrow,
      html.ruth-variant-picker-open .product-gallery-progress {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      html.ruth-variant-picker-open .product-variant-picker {
        isolation: isolate !important;
      }

      html.ruth-variant-picker-open .product-variant-picker [aria-label="Ürün seçeneklerini kapat"] {
        position: relative !important;
        z-index: 2147483646 !important;
        display: grid !important;
        pointer-events: auto !important;
        touch-action: manipulation !important;
        cursor: pointer !important;
      }
    `}</style>
  );
}
