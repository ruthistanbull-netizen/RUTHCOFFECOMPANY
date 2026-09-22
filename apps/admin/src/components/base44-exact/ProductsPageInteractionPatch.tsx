"use client";

import { type MouseEvent as ReactMouseEvent, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAcceptedAdminResourceRevision } from "@/lib/useAcceptedAdminResourceRevision";
import { ExactProductsPopupHost } from "./ExactProductsPopupHost";

function normalizeProductsPage(scope: HTMLElement) {
  const root = scope.querySelector<HTMLElement>('[data-base44-exact-page="products"]');
  if (!root) return;

  const sortSelect = root.querySelector<HTMLSelectElement>('select[aria-label="Ürünleri sırala"]');
  if (sortSelect) {
    if (sortSelect.value !== "default") {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      setter?.call(sortSelect, "default");
      sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
    sortSelect.style.display = "none";
    sortSelect.setAttribute("aria-hidden", "true");
    sortSelect.tabIndex = -1;
  }

  const densityButtons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
  const normalButton = densityButtons.find((button) => button.textContent?.trim() === "Normal");
  const compactButton = densityButtons.find((button) => button.textContent?.trim() === "Kompakt");
  const densityControl = normalButton?.parentElement || null;
  if (normalButton && compactButton && densityControl && compactButton.parentElement === densityControl) {
    if (!normalButton.classList.contains("bg-surface-primary")) normalButton.click();
    densityControl.style.display = "none";
    densityControl.setAttribute("aria-hidden", "true");
  }

  root.querySelectorAll<HTMLDetailsElement>("details").forEach((details) => {
    const summary = details.querySelector<HTMLElement>("summary");
    if (!summary?.getAttribute("aria-label")?.endsWith(" işlemleri")) return;
    details.style.display = "none";
    details.setAttribute("aria-hidden", "true");
  });

  root.querySelectorAll<HTMLElement>(".group.relative").forEach((card) => {
    const selectable = Boolean(card.querySelector('input[type="checkbox"]'));
    card.style.cursor = selectable ? "pointer" : "";
    card.dataset.bulkSelectableCard = selectable ? "true" : "false";
  });
}

export function ProductsPageInteractionPatch() {
  const router = useRouter();
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const productsRevision = useAcceptedAdminResourceRevision("products");

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;

    const observer = new MutationObserver(() => normalizeProductsPage(scope));
    observer.observe(scope, { childList: true, subtree: true });
    normalizeProductsPage(scope);

    return () => observer.disconnect();
  }, []);

  const handlePageInteraction = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const root = target.closest<HTMLElement>('[data-base44-exact-page="products"]');
    const card = target.closest<HTMLElement>(".group.relative");
    const checkbox = card?.querySelector<HTMLInputElement>('input[type="checkbox"]') || null;

    if (root && card && checkbox && !checkbox.disabled) {
      if (target === checkbox || target.closest("label")?.contains(checkbox)) return;
      event.preventDefault();
      event.stopPropagation();
      checkbox.click();
      return;
    }

    const link = target.closest<HTMLAnchorElement>("a[href]");
    const href = link?.getAttribute("href") || "";
    if (!href.startsWith("/products/studio")) return;

    event.preventDefault();
    event.stopPropagation();
    router.push(href);
  };

  return (
    <div
      ref={scopeRef}
      style={{ display: "contents" }}
      onClickCapture={handlePageInteraction}
      data-products-live-revision={productsRevision}
    >
      <ExactProductsPopupHost />
    </div>
  );
}
