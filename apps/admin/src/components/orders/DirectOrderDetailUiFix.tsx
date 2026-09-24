"use client";

import { useEffect } from "react";
import { adminRequest } from "@/lib/adminApi";

const STATUS_TRANSLATIONS: Record<string, string> = {
  awaiting_payment: "Ödeme bekleniyor",
  pending: "Ödeme bekleniyor",
  waiting: "Ödeme bekleniyor",
  created: "Yeni sipariş",
  new: "Yeni sipariş",
  paid: "Yeni sipariş",
  confirmed: "Yeni sipariş",
  in_production: "Hazırlanıyor",
  preparing: "Hazırlanıyor",
  processing: "Hazırlanıyor",
  queued: "Hazırlanıyor",
  quality_control: "Kalite kontrol",
  ready: "Kargoya hazır",
  prepared: "Kargoya hazır",
  ready_to_ship: "Kargoya hazır",
  label_created: "Kargoya hazır",
  shipped: "Gönderildi",
  in_transit: "Kargoda",
  out_for_delivery: "Dağıtımda",
  delivered: "Teslim edildi",
  completed: "Teslim edildi",
  fulfilled: "Teslim edildi",
  cancelled: "İptal edildi",
  canceled: "İptal edildi",
};

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLocaleLowerCase("tr-TR");
}

function findCard(root: HTMLElement, title: string) {
  const heading = Array.from(root.querySelectorAll<HTMLElement>("h2,h3"))
    .find((node) => node.textContent?.trim() === title);
  return heading?.closest<HTMLElement>("section") || null;
}

function translateFulfillment(statusCard: HTMLElement | null) {
  if (!statusCard) return;

  const label = Array.from(statusCard.querySelectorAll<HTMLElement>("p"))
    .find((node) => {
      const text = normalize(node.textContent);
      return text === "fulfillment" || text === "sipariş süreci";
    });
  if (!label?.parentElement) return;

  if (label.textContent !== "Sipariş süreci") label.textContent = "Sipariş süreci";

  const value = label.parentElement.children[1] as HTMLElement | undefined;
  if (!value) return;

  const translated = STATUS_TRANSLATIONS[normalize(value.textContent)];
  if (translated && value.textContent?.trim() !== translated) value.textContent = translated;
}

function formatMoney(value: number, currency = "TRY") {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

type AppliedDiscount = {
  id?: string;
  code?: string | null;
  name?: string | null;
  source?: string | null;
  discount?: number | string | null;
};

type DiscountOrder = {
  currency?: string | null;
  coupon_code?: string | null;
  coupon_discount_total?: number | string | null;
  reward_discount_total?: number | string | null;
  applied_discounts?: AppliedDiscount[] | null;
  order_items?: Array<{
    quantity?: number | null;
    unit_price?: number | null;
    total_price?: number | null;
    original_unit_price?: number | null;
    has_price_reduction?: boolean;
  }>;
};

function addDiscountLabel(container: HTMLElement, text: string) {
  const key = text.trim();
  if (!key) return;
  const exists = Array.from(container.querySelectorAll<HTMLElement>("[data-ruth-discount-label]"))
    .some((node) => node.dataset.ruthDiscountLabel === key);
  if (exists) return;

  const wrapper = document.createElement("div");
  wrapper.dataset.ruthDiscountLabel = key;
  wrapper.className = "mt-1 flex flex-wrap justify-end gap-1 text-[9px] leading-tight text-accent";
  const label = document.createElement("span");
  label.className = "rounded-full bg-accent/10 px-1.5 py-0.5 font-medium";
  label.textContent = key;
  wrapper.appendChild(label);
  container.appendChild(wrapper);
}

async function syncDiscountLabels(productsCard: HTMLElement, orderId: string) {
  try {
    const result = await adminRequest<{ order?: DiscountOrder }>(`/api/orders/detail?order_id=${encodeURIComponent(orderId)}`, {
      hardRefresh: true,
      force: true,
      ttlMs: 0,
      staleMs: 0,
    });
    const order = result.order;
    if (!order) return;

    const currency = order.currency || "TRY";
    const applied = Array.isArray(order.applied_discounts) ? order.applied_discounts : [];
    const automaticNames = applied
      .filter((entry) => normalize(entry.source) === "automatic" && entry.name)
      .map((entry) => String(entry.name));
    const couponEntries = applied.filter((entry) => ["coupon", "campaign", "review"].includes(normalize(entry.source)) && entry.name);
    const hasPoints = Number(order.reward_discount_total || 0) > 0;
    const rows = Array.from(productsCard.querySelectorAll<HTMLElement>(".flex.items-center.gap-3"))
      .filter((row) => row.querySelector("img") || row.textContent?.includes("adet"));
    const itemData = Array.isArray(order.order_items) ? order.order_items : [];

    rows.forEach((row, index) => {
      const right = row.querySelector<HTMLElement>(":scope > .shrink-0.text-right");
      if (!right) return;
      const item = itemData[index];
      if (!item) return;
      const qty = Math.max(1, Number(item.quantity || 1));
      const original = Math.max(Number(item.original_unit_price || 0), Number(item.unit_price || 0));
      const current = Number(item.unit_price || 0);
      const reduced = Boolean(item.has_price_reduction && original > current + 0.001);

      if (reduced) {
        const amount = Math.max(0, (original - current) * qty);
        const matchingNames = automaticNames.length ? [...new Set(automaticNames)].join(" + ") : "Mağaza indirimi";
        addDiscountLabel(right, `${matchingNames} · −${formatMoney(amount, currency)}`);
      }

      if (couponEntries.length) {
        const couponLabel = [...new Set(couponEntries.map((entry) => {
          const name = String(entry.name || "Kupon indirimi");
          const code = String(entry.code || order.coupon_code || "").trim();
          return code ? `${name} (${code})` : name;
        }))].join(" + ");
        addDiscountLabel(right, couponLabel);
      }

      if (hasPoints) {
        addDiscountLabel(right, `ROSTA Points · −${formatMoney(Number(order.reward_discount_total || 0), currency)}`);
      }
    });
  } catch {
    // Discount labels are supplementary; never block the order detail page.
  }
}

function syncOrderDetailUi(root: HTMLElement) {
  const productsCard = findCard(root, "Sipariş Ürünleri");
  const statusCard = findCard(root, "Sipariş Durumu");

  if (productsCard && statusCard) {
    const parent = statusCard.parentElement;
    if (parent && productsCard.parentElement === parent && productsCard.nextElementSibling !== statusCard) {
      parent.insertBefore(productsCard, statusCard);
    }
  }

  translateFulfillment(statusCard);
  return productsCard;
}

export function DirectOrderDetailUiFix() {
  useEffect(() => {
    let frame = 0;
    let discountSyncInFlight = false;
    let discountSyncAt = 0;

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const root = document.querySelector<HTMLElement>('[data-exact-base44-page="order-detail-direct"]');
        if (!root) return;
        const productsCard = syncOrderDetailUi(root);
        if (!productsCard || discountSyncInFlight || Date.now() - discountSyncAt < 2500) return;
        const orderId = window.location.pathname.match(/\/orders\/([^/]+)/)?.[1];
        if (!orderId) return;
        discountSyncInFlight = true;
        void syncDiscountLabels(productsCard, orderId).finally(() => {
          discountSyncAt = Date.now();
          discountSyncInFlight = false;
        });
      });
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
