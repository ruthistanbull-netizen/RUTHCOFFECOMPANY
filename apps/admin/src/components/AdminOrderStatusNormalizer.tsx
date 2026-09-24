"use client";

import { useEffect } from "react";

const ORDER_STATUS_STYLES: Record<string, { label: string; background: string; text: string; dot: string }> = {
  "yeni sipariş": { label: "Yeni Sipariş", background: "#E3F8ED", text: "#147B63", dot: "#1BA786" },
  "hazırlanıyor": { label: "Hazırlanıyor", background: "#EBF3FF", text: "#1C71D9", dot: "#4F94E8" },
  "kargoya hazır": { label: "Kargoya Hazır", background: "#F6EBC6", text: "#3B2D0D", dot: "#C9A33B" },
  "gönderildi": { label: "Gönderildi", background: "#F6EBC6", text: "#3B2D0D", dot: "#C9A33B" },
  "teslim edildi": { label: "Teslim Edildi", background: "#E3F8ED", text: "#147B63", dot: "#1BA786" },
  "değerlendirildi": { label: "Değerlendirildi", background: "#EBECF0", text: "#60636C", dot: "#858993" },
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}

function normalizeBadge(badge: HTMLElement) {
  if (badge.dataset.ruthOrderStatusNormalized === "true") return;

  const key = normalize(badge.textContent || "");
  const aliases: Record<string, string> = {
    reviewed: "değerlendirildi",
    degerlendirildi: "değerlendirildi",
  };
  const style = ORDER_STATUS_STYLES[aliases[key] || key];
  if (!style) return;

  const textNode = Array.from(badge.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.nodeValue?.trim()),
  );
  if (textNode) {
    textNode.nodeValue = ` ${style.label}`;
  } else {
    badge.appendChild(document.createTextNode(` ${style.label}`));
  }

  badge.style.backgroundColor = style.background;
  badge.style.color = style.text;
  badge.dataset.ruthOrderStatusNormalized = "true";
  badge.dataset.ruthOrderStatus = aliases[key] || key;

  const dot = badge.querySelector<HTMLElement>("span.rounded-full");
  if (dot) dot.style.backgroundColor = style.dot;
}

function scan(root: Node) {
  if (!(root instanceof Element)) return;
  if (root.matches("span.rounded-full")) normalizeBadge(root as HTMLElement);
  root.querySelectorAll<HTMLElement>("span.rounded-full").forEach(normalizeBadge);
}

export function AdminOrderStatusNormalizer() {
  useEffect(() => {
    scan(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(scan);
      }
    });

    observer.observe(document.body, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
