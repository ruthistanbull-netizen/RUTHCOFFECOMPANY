"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { useAuth } from "@/components/auth/AuthProvider";

type AppliedDiscount = {
  name?: string | null;
  source?: string | null;
};

type QuoteResponse = {
  ok?: boolean;
  quote?: {
    automaticDiscountTotal?: number | string | null;
    appliedDiscounts?: AppliedDiscount[] | null;
  };
};

const GENERIC_LABEL = "Otomatik ürün/kampanya indirimi";

export function CheckoutDiscountLabelEnhancer() {
  const { items, isReady } = useCart();
  const { user, session } = useAuth();

  useEffect(() => {
    if (!isReady || !items.length) return;
    let cancelled = false;
    let discountLabel = "";

    const applyLabel = () => {
      if (!discountLabel) return;
      const nodes = Array.from(document.querySelectorAll<HTMLElement>("span"));
      nodes
        .filter((node) => node.dataset.ruthDiscountLabelResolved !== "true")
        .filter((node) => node.textContent?.trim() === GENERIC_LABEL)
        .forEach((node) => {
          node.textContent = discountLabel;
          node.dataset.ruthDiscountLabelResolved = "true";
        });
    };

    const observer = new MutationObserver(() => applyLabel());
    observer.observe(document.body, { childList: true, subtree: true });

    const sync = async () => {
      try {
        const response = await fetch("/api/discounts/quote", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          cache: "no-store",
          body: JSON.stringify({
            items: items.map((item) => ({
              key: item.key,
              id: item.id,
              slug: item.slug,
              quantity: item.quantity,
            })),
            customerEmail: user?.email || null,
            rewards: { useRuthPoints: false, requestedDiscount: 0, pointsUsed: 0 },
          }),
        });
        const data = (await response.json()) as QuoteResponse;
        if (cancelled || !response.ok || !data.ok) return;

        const automaticTotal = Number(data.quote?.automaticDiscountTotal || 0);
        if (automaticTotal <= 0) return;

        const names = [...new Set(
          (data.quote?.appliedDiscounts || [])
            .filter((entry) => String(entry.source || "").toLowerCase() === "automatic" && String(entry.name || "").trim())
            .map((entry) => String(entry.name).trim()),
        )];
        if (!names.length) return;

        discountLabel = names.join(" + ");
        applyLabel();
      } catch {
        // Görsel etiket iyileştirmesi ödeme akışını engellemez.
      }
    };

    void sync();
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [isReady, items, session?.access_token, user?.email]);

  return null;
}
