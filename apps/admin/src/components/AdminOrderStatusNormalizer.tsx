"use client";

import { useEffect } from "react";

const ORDER_STATUS_STYLES: Record<string, { label: string; background: string; text: string; dot: string }> = {
  "yeni sipariş": { label: "Yeni Sipariş", background: "#fff4bd", text: "#8a6a00", dot: "#d7a900" },
  "hazırlanıyor": { label: "Hazırlanıyor", background: "#dbeafe", text: "#1d4ed8", dot: "#2563eb" },
  "kargoya hazır": { label: "Kargoya Hazır", background: "#dcfce7", text: "#2f7d4f", dot: "#4a965b" },
  "gönderildi": { label: "Gönderildi", background: "#bbf7d0", text: "#166534", dot: "#15803d" },
  "teslim edildi": { label: "Teslim Edildi", background: "#fce7f3", text: "#be185d", dot: "#ec4899" },
  "değerlendirildi": { label: "Değerlendirildi", background: "#f5d0fe", text: "#a21caf", dot: "#c026d3" },
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
