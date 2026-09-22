"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { adminRequest } from "@/lib/adminApi";

type OrderItem = {
  product_id?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
};

type Order = {
  id: string;
  currency?: string | null;
  order_items?: OrderItem[];
};

type DiscountPricing = {
  productId: string;
  originalPrice: number;
  discountedPrice: number;
  hasDiscount: boolean;
};

function money(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function findOrderBody() {
  const dialogs = [...document.querySelectorAll<HTMLElement>('aside[role="dialog"]')];
  const dialog = dialogs.find((node) => node.querySelector("h2")?.textContent?.trim().startsWith("Sipariş #"));
  return dialog?.querySelector<HTMLElement>(":scope > div.flex-1") || null;
}

function findProductsCard(body: HTMLElement) {
  const heading = [...body.querySelectorAll<HTMLElement>("h2,h3")].find((node) => node.textContent?.trim() === "Sipariş Ürünleri");
  return heading?.closest<HTMLElement>("section") || null;
}

export function ExactOrderDiscountPriceFix() {
  const orderId = useSearchParams().get("order") || "";
  const [order, setOrder] = useState<Order | null>(null);
  const [discounts, setDiscounts] = useState<Record<string, DiscountPricing>>({});

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setDiscounts({});
      return;
    }

    let cancelled = false;
    void Promise.all([
      adminRequest<{ orders?: Order[] }>("/api/orders?range=all&payment=all&q=", {
        force: true,
        ttlMs: 0,
        staleMs: 0,
      }),
      adminRequest<{ pricing?: DiscountPricing[] }>("/api/products/discount-pricing", {
        force: true,
        ttlMs: 0,
        staleMs: 0,
      }),
    ]).then(([ordersResult, pricingResult]) => {
      if (cancelled) return;
      setOrder((ordersResult.orders || []).find((entry) => String(entry.id) === orderId) || null);
      setDiscounts(Object.fromEntries((pricingResult.pricing || []).map((entry) => [String(entry.productId), entry])));
    }).catch(() => {
      if (!cancelled) {
        setOrder(null);
        setDiscounts({});
      }
    });

    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    if (!order?.order_items?.length) return;

    const sync = () => {
      const body = findOrderBody();
      if (!body) return;
      const productsCard = findProductsCard(body);
      if (!productsCard) return;

      const names = [...productsCard.querySelectorAll<HTMLElement>("p.truncate.text-sm.font-medium.text-main")];
      names.forEach((nameNode, index) => {
        const item = order.order_items?.[index];
        const row = nameNode.closest<HTMLElement>("div.flex.items-center.gap-3");
        if (!item || !row) return;

        const priceBox = [...row.children].find(
          (child) => child instanceof HTMLElement && child.classList.contains("text-right"),
        ) as HTMLElement | undefined;
        if (!priceBox) return;

        const pricing = item.product_id ? discounts[String(item.product_id)] : undefined;
        const originalUnit = Number(pricing?.originalPrice || item.unit_price || 0);
        const discountedUnit = Number(pricing?.discountedPrice || item.unit_price || 0);
        const quantity = Math.max(1, Number(item.quantity || 1));
        const hasDiscount = Boolean(
          pricing?.hasDiscount
          && originalUnit > discountedUnit + 0.001,
        );

        let block = priceBox.querySelector<HTMLElement>("[data-order-discount-price]");
        [...priceBox.children].forEach((child) => {
          if (!(child instanceof HTMLElement) || child === block) return;
          child.style.display = hasDiscount ? "none" : "";
        });

        if (!hasDiscount) {
          block?.remove();
          return;
        }

        if (!block) {
          block = document.createElement("div");
          block.dataset.orderDiscountPrice = "true";
          priceBox.append(block);
        }

        const currency = order.currency || "TRY";
        const originalTotal = originalUnit * quantity;
        const discountedTotal = discountedUnit * quantity;
        const signature = `${originalTotal}|${discountedTotal}|${quantity}|${discountedUnit}|${currency}`;
        if (block.dataset.signature === signature) return;

        block.dataset.signature = signature;
        block.replaceChildren();

        const original = document.createElement("p");
        original.className = "text-[10px] text-subtle line-through";
        original.textContent = money(originalTotal, currency);

        const discounted = document.createElement("p");
        discounted.className = "text-sm font-semibold text-main";
        discounted.textContent = money(discountedTotal, currency);

        const unit = document.createElement("p");
        unit.className = "text-[10px] text-muted";
        unit.textContent = `${quantity} adet · ${money(discountedUnit, currency)}`;

        block.append(original, discounted, unit);
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [discounts, order]);

  return null;
}
