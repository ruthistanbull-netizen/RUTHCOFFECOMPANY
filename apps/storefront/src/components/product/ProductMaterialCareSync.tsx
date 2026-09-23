"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

type MaterialCareResponse = {
  ok?: boolean;
  material?: string;
  coating?: string;
  care?: string;
};

function normalized(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

function setSummaryLabel(summary: HTMLElement) {
  const textNode = [...summary.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    textNode.textContent = "Ürün Bilgisi";
    return;
  }
  summary.prepend(document.createTextNode("Ürün Bilgisi"));
}

export function ProductMaterialCareSync() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/products/")) return;
    const slug = decodeURIComponent(pathname.split("/").filter(Boolean)[1] || "");
    if (!slug) return;

    const controller = new AbortController();
    let observer: MutationObserver | null = null;

    const run = async () => {
      try {
        const response = await fetch(
          `/api/products/material-care?slug=${encodeURIComponent(slug)}`,
          { cache: "force-cache", signal: controller.signal },
        );
        if (!response.ok) return;
        const data = (await response.json()) as MaterialCareResponse;
        if (!data.ok || controller.signal.aborted) return;

        const content = [
          `Çekirdek / İçerik: ${data.material || "—"}`,
          `Kavrum: ${data.coating || "—"}`,
          `Saklama / Kullanım: ${data.care || "—"}`,
        ].join("\n");

        const apply = () => {
          document
            .querySelectorAll<HTMLElement>(".product-desktop-details details")
            .forEach((detail) => {
              const summary = detail.querySelector<HTMLElement>("summary");
              if (!summary) return;
              const label = normalized(summary.textContent);
              if (label !== "materyal" && label !== "materyal ve bakım" && label !== "ürün bilgisi") return;
              setSummaryLabel(summary);
              const paragraph = detail.querySelector<HTMLElement>("p");
              if (paragraph && paragraph.textContent !== content) paragraph.textContent = content;
            });

          document
            .querySelectorAll<HTMLButtonElement>(".product-mobile-detail-tabs button")
            .forEach((button) => {
              const label = normalized(button.textContent);
              if (label === "materyal" || label === "materyal ve bakım" || label === "ürün bilgisi") {
                button.textContent = "Ürün Bilgisi";
              }
            });

          const mobileContent = document.querySelector<HTMLElement>(
            "#product-detail-material p",
          );
          if (mobileContent && mobileContent.textContent !== content) {
            mobileContent.textContent = content;
          }
        };

        apply();
        observer = new MutationObserver(apply);
        observer.observe(document.body, { childList: true, subtree: true });
      } catch (error) {
        if ((error as Error).name !== "AbortError") observer?.disconnect();
      }
    };

    void run();
    return () => {
      controller.abort();
      observer?.disconnect();
    };
  }, [pathname]);

  return (
    <style>{`
      .product-desktop-details p,
      .product-mobile-detail-copy p {
        white-space: pre-line !important;
      }
    `}</style>
  );
}
