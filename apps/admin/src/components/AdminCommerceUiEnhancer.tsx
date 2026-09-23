"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { adminRequest } from "@/lib/adminApi";

type AverageBasketResponse = { averageItems?: number };

function formatAverageItems(value: number) {
  const rounded = Number(value || 0);
  const text = rounded.toLocaleString("tr-TR", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
    maximumFractionDigits: 1,
  });
  return `${text} ürün`;
}

function normalizeMembershipText(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text;
    const value = text.nodeValue?.trim().toLocaleLowerCase("tr-TR");
    if (value === "ikas üyesi" || value === "site üyesi") text.nodeValue = "Üye";
    return;
  }
  if (!(node instanceof Element)) return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    const value = text.nodeValue?.trim().toLocaleLowerCase("tr-TR");
    if (value === "ikas üyesi" || value === "site üyesi") text.nodeValue = "Üye";
  }
}

const ORDER_STATUS_STYLES: Record<string, { label: string; background: string; text: string; dot: string }> = {
  "yeni sipariş": { label: "Yeni Sipariş", background: "#fff4bd", text: "#8a6a00", dot: "#d7a900" },
  "hazırlanıyor": { label: "Hazırlanıyor", background: "#dbeafe", text: "#1d4ed8", dot: "#2563eb" },
  "kargoya hazır": { label: "Kargoya Hazır", background: "#dcfce7", text: "#2f7d4f", dot: "#4a965b" },
  "gönderildi": { label: "Gönderildi", background: "#bbf7d0", text: "#166534", dot: "#15803d" },
  "teslim edildi": { label: "Teslim Edildi", background: "#fce7f3", text: "#be185d", dot: "#ec4899" },
  "değerlendirildi": { label: "Değerlendirildi", background: "#f5d0fe", text: "#a21caf", dot: "#c026d3" },
};

const normalizeStatusLabel = (value: string) => value
  .trim()
  .toLocaleLowerCase("tr-TR")
  .replace(/\s+/g, " ");

function setBadgeLabel(badge: HTMLElement, label: string) {
  const textNode = Array.from(badge.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue?.trim());
  if (textNode) {
    textNode.nodeValue = ` ${label}`;
    return;
  }
  badge.appendChild(document.createTextNode(` ${label}`));
}

function normalizeStatusBadge(badge: HTMLElement) {
  const current = normalizeStatusLabel(badge.textContent || "");
  const aliases: Record<string, string> = {
    "yeni sipariş": "yeni sipariş",
    "yeni order": "yeni sipariş",
    "hazırlanıyor": "hazırlanıyor",
    "kargoya hazır": "kargoya hazır",
    "kargoya hazırlanıyor": "kargoya hazır",
    "gönderildi": "gönderildi",
    "teslim edildi": "teslim edildi",
    "reviewed": "değerlendirildi",
    "değerlendirildi": "değerlendirildi",
    "degerlendirildi": "değerlendirildi",
  };
  const key = aliases[current];
  if (!key) return;
  const style = ORDER_STATUS_STYLES[key];
  if (!style) return;

  setBadgeLabel(badge, style.label);
  badge.style.backgroundColor = style.background;
  badge.style.color = style.text;
  badge.dataset.orderStatusTone = key;
  const dot = badge.querySelector<HTMLElement>("span.rounded-full");
  if (dot) dot.style.backgroundColor = style.dot;
}

function normalizeReviewedOrderEditor(root: Node) {
  if (!(root instanceof Element)) return;
  const badges = Array.from(root.querySelectorAll<HTMLElement>("span.rounded-full"));
  const reviewedBadge = badges.find((badge) => normalizeStatusLabel(badge.textContent || "") === "değerlendirildi");
  if (!reviewedBadge) return;

  root.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
    const fieldText = select.parentElement?.textContent?.trim().toLocaleLowerCase("tr-TR") || "";
    if (!fieldText.includes("sipariş durumu")) return;
    if (select.value === "delivered") return;
    select.value = "delivered";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function normalizeStatusColors(root: Node) {
  if (!(root instanceof Element)) return;
  if (root.matches("span.rounded-full")) normalizeStatusBadge(root as HTMLElement);
  root.querySelectorAll<HTMLElement>("span.rounded-full").forEach(normalizeStatusBadge);
  normalizeReviewedOrderEditor(root);
}

function normalizeRoot(root: Node) {
  normalizeMembershipText(root);
  normalizeStatusColors(root);
}

function findAverageBasketCard() {
  const labels = Array.from(document.querySelectorAll<HTMLElement>("article span"));
  const label = labels.find((element) => element.textContent?.trim() === "Ortalama Sepet");
  return label?.closest<HTMLElement>("article") || null;
}

export function AdminCommerceUiEnhancer() {
  const pathname = usePathname();
  const averageItemsRef = useRef<number | null>(null);
  const amountTextRef = useRef("");
  const requestSequenceRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const pendingRootsRef = useRef<Set<Node>>(new Set());

  useEffect(() => {
    const flush = () => {
      frameRef.current = null;
      const roots = [...pendingRootsRef.current];
      pendingRootsRef.current.clear();
      roots.forEach(normalizeRoot);
    };

    const schedule = (root: Node) => {
      pendingRootsRef.current.add(root);
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(flush);
    };

    schedule(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          if (mutation.target.parentNode) schedule(mutation.target.parentNode);
          continue;
        }
        mutation.addedNodes.forEach(schedule);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    return () => {
      observer.disconnect();
      pendingRootsRef.current.clear();
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/") return;

    let disposed = false;
    let mutationFrame: number | null = null;

    const decorateCard = () => {
      const card = findAverageBasketCard();
      if (!card) return;
      const valueNode = Array.from(card.querySelectorAll<HTMLElement>("div"))
        .find((element) => element.classList.contains("font-bold") && element.classList.contains("text-2xl"));
      if (!valueNode) return;

      const currentText = valueNode.textContent?.trim() || "";
      if (currentText && !currentText.endsWith("ürün")) amountTextRef.current = currentText;
      const averageItems = averageItemsRef.current;
      if (averageItems == null) return;

      const itemText = formatAverageItems(averageItems);
      if (valueNode.textContent !== itemText) valueNode.textContent = itemText;
      let detail = card.querySelector<HTMLElement>("[data-average-order-amount]");
      if (!detail) {
        detail = document.createElement("p");
        detail.dataset.averageOrderAmount = "true";
        detail.className = "mt-1.5 text-[11px] font-medium text-muted";
        valueNode.insertAdjacentElement("afterend", detail);
      }
      const detailText = `Ort. sipariş tutarı ${amountTextRef.current || "₺0"}`;
      if (detail.textContent !== detailText) detail.textContent = detailText;
    };

    const scheduleDecorate = () => {
      if (mutationFrame !== null) return;
      mutationFrame = window.requestAnimationFrame(() => {
        mutationFrame = null;
        decorateCard();
      });
    };

    const load = async () => {
      const select = document.querySelector<HTMLSelectElement>('select[aria-label="Tarih aralığı"]');
      const range = select?.value || "today";
      const sequence = ++requestSequenceRef.current;
      try {
        const response = await adminRequest<AverageBasketResponse>(`/api/dashboard/average-basket?range=${encodeURIComponent(range)}`, {
          ttlMs: 45_000,
          staleMs: 20 * 60_000,
        });
        if (disposed || sequence !== requestSequenceRef.current) return;
        averageItemsRef.current = Number(response.averageItems || 0);
        scheduleDecorate();
      } catch {
        if (disposed || sequence !== requestSequenceRef.current) return;
        averageItemsRef.current = 0;
        scheduleDecorate();
      }
    };

    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || target.getAttribute("aria-label") !== "Tarih aralığı") return;
      amountTextRef.current = "";
      void load();
    };

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length > 0)) scheduleDecorate();
    });
    observer.observe(document.body, { subtree: true, childList: true });
    document.addEventListener("change", onChange, true);
    scheduleDecorate();
    void load();

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("change", onChange, true);
      if (mutationFrame !== null) window.cancelAnimationFrame(mutationFrame);
    };
  }, [pathname]);

  return null;
}
