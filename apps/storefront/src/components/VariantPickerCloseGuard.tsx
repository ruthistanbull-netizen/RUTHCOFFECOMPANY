"use client";

import { useEffect } from "react";

export function VariantPickerCloseGuard() {
  useEffect(() => {
    const closeFromControl = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const closeButton = target.closest<HTMLElement>(
        '[aria-label="Ürün seçeneklerini kapat"]',
      );
      if (!closeButton) return;

      const backdrop = document.querySelector<HTMLButtonElement>(
        ".product-variant-backdrop",
      );
      if (!backdrop) return;

      event.preventDefault();
      event.stopPropagation();
      backdrop.click();
    };

    document.addEventListener("pointerup", closeFromControl, true);
    return () => document.removeEventListener("pointerup", closeFromControl, true);
  }, []);

  return null;
}
