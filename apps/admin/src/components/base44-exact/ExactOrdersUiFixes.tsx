"use client";

import { useEffect } from "react";

const ORDER_UI_SCOPE = '[data-exact-base44-page="orders-v2"], aside[role="dialog"]';

function normalized(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
}

function decorateManualOrders() {
  const root = document.querySelector<HTMLElement>('[data-exact-base44-page="orders-v2"]');
  if (!root) return;

  for (const node of Array.from(root.querySelectorAll<HTMLElement>("p"))) {
    const text = (node.childNodes[0]?.textContent || node.textContent || "").trim();
    if (!/^#MAN/i.test(text) || node.querySelector('[data-manual-order-badge="true"]')) continue;

    node.classList.add("flex", "flex-wrap", "items-center", "gap-1.5");
    const badge = document.createElement("span");
    badge.dataset.manualOrderBadge = "true";
    badge.textContent = "Manuel";
    badge.className = "inline-flex rounded-full bg-accent-soft px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-accent";
    node.appendChild(badge);
  }
}

function updateMailProgressLabels() {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('aside[role="dialog"]'));
  const orderDialog = dialogs.find((node) => node.querySelector("h2")?.textContent?.trim().startsWith("Sipariş #"));
  if (!orderDialog) return;

  const sections = Array.from(orderDialog.querySelectorAll<HTMLElement>("section"));
  const section = sections.find((node) => normalized(node.textContent).includes("müşteriye gönderilen mailler"));
  if (!section) return;

  const grids = Array.from(section.querySelectorAll<HTMLElement>("div.grid"));
  const progressGrid = grids.find((node) => node.classList.contains("grid-cols-4"));
  if (!progressGrid) return;

  const stages = Array.from(progressGrid.children)
    .filter((node): node is HTMLElement => node instanceof HTMLElement && node.classList.contains("flex") && node.classList.contains("flex-col"));
  if (!stages.length) return;

  const sentIndexes = stages.flatMap((stage, index) => {
    const dot = stage.querySelector<HTMLElement>("span.rounded-full");
    return dot?.classList.contains("bg-accent") ? [index] : [];
  });
  const latestSent = sentIndexes.length ? Math.max(...sentIndexes) : -1;
  if (latestSent < 0) return;

  stages.forEach((stage, index) => {
    if (!sentIndexes.includes(index)) return;
    const status = Array.from(stage.querySelectorAll<HTMLElement>("span"))
      .find((node) => ["gönderildi", "tamamlandı", "gönderilemedi", "bekliyor"].includes(normalized(node.textContent)));
    if (!status) return;
    const next = index < latestSent ? "Tamamlandı" : "Gönderildi";
    if (status.textContent !== next) status.textContent = next;
  });
}

function relevantMutation(mutation: MutationRecord) {
  const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
  if (target?.closest(ORDER_UI_SCOPE)) return true;
  for (const node of mutation.addedNodes) {
    if (!(node instanceof Element)) continue;
    if (node.matches(ORDER_UI_SCOPE) || node.querySelector(ORDER_UI_SCOPE)) return true;
  }
  return false;
}

export function ExactOrdersUiFixes() {
  useEffect(() => {
    let frame = 0;
    const syncUi = () => {
      frame = 0;
      decorateManualOrders();
      updateMailProgressLabels();
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncUi);
    };

    schedule();
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(relevantMutation)) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
