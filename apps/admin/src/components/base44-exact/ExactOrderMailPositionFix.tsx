"use client";

import { useEffect } from "react";

function findOrderBody() {
  const dialogs = [...document.querySelectorAll<HTMLElement>('aside[role="dialog"]')];
  const dialog = dialogs.find((node) => node.querySelector("h2")?.textContent?.trim().startsWith("Sipariş #"));
  return dialog?.querySelector<HTMLElement>(":scope > div.flex-1") || null;
}

function findOrderDrawer() {
  return findOrderBody()?.closest<HTMLElement>('aside[role="dialog"]') || null;
}

function clearOrderQueryBeforeClose() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("order")) return;
  url.searchParams.delete("order");
  const query = url.searchParams.toString();
  const nextUrl = `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

function topLevelSection(content: HTMLElement, node: HTMLElement | null) {
  let current = node;
  while (current?.parentElement && current.parentElement !== content) current = current.parentElement;
  return current?.parentElement === content ? current : null;
}

function findOperationCard(content: HTMLElement) {
  const title = [...content.querySelectorAll<HTMLElement>("h2,h3,p,span")]
    .find((node) => node.textContent?.trim() === "Operasyon Durumu");
  return topLevelSection(content, title || null);
}

function findMailCard(body: HTMLElement) {
  const label = [...body.querySelectorAll<HTMLElement>("p")]
    .find((node) => {
      if (node.closest("[data-order-mail-position]")) return false;
      return node.textContent?.trim() === "Müşteriye gönderilen mailler";
    });
  return label?.closest<HTMLElement>("section") || null;
}

export function ExactOrderMailPositionFix() {
  useEffect(() => {
    let frame = 0;

    const sync = () => {
      frame = 0;
      const body = findOrderBody();
      const content = body?.firstElementChild as HTMLElement | null;
      if (!body || !content) return;

      const operation = findOperationCard(content);
      const source = findMailCard(body);
      if (!operation || !source) return;

      let slot = content.querySelector<HTMLElement>("[data-order-mail-position]");
      if (!slot) {
        slot = document.createElement("div");
        slot.dataset.orderMailPosition = "true";
        content.insertBefore(slot, operation);
      } else if (slot.nextElementSibling !== operation) {
        content.insertBefore(slot, operation);
      }
      slot.style.removeProperty("display");
      slot.removeAttribute("hidden");

      const signature = `${source.className}::${source.innerHTML}`;
      if (slot.dataset.mailSignature !== signature || !slot.querySelector("[data-order-mail-visible-copy]")) {
        const clone = source.cloneNode(true) as HTMLElement;
        clone.style.removeProperty("display");
        clone.removeAttribute("hidden");
        clone.classList.remove("mb-5");
        clone.setAttribute("data-order-mail-visible-copy", "true");
        slot.replaceChildren(clone);
        slot.dataset.mailSignature = signature;
      } else {
        const visibleCopy = slot.querySelector<HTMLElement>("[data-order-mail-visible-copy]");
        visibleCopy?.style.removeProperty("display");
        visibleCopy?.removeAttribute("hidden");
      }

      source.style.display = "none";
      source.setAttribute("data-order-mail-hidden-source", "true");
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(sync);
    };

    const prepareClose = (event: PointerEvent) => {
      const drawer = findOrderDrawer();
      if (!drawer) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const closeButton = target.closest<HTMLButtonElement>('button[aria-label="Kapat"]');
      const backdrop = drawer.previousElementSibling;
      const isCloseButton = Boolean(closeButton && drawer.contains(closeButton));
      const isBackdrop = target === backdrop;
      if (!isCloseButton && !isBackdrop) return;

      clearOrderQueryBeforeClose();
      drawer.setAttribute("data-order-close-pending", "true");
    };

    const prepareEscapeClose = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !findOrderDrawer()) return;
      clearOrderQueryBeforeClose();
    };

    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener("pointerdown", prepareClose, true);
    window.addEventListener("keydown", prepareEscapeClose, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", prepareClose, true);
      window.removeEventListener("keydown", prepareEscapeClose, true);
      if (frame) window.cancelAnimationFrame(frame);
      document.querySelectorAll<HTMLElement>("[data-order-mail-hidden-source]").forEach((node) => {
        node.style.display = "";
        node.removeAttribute("data-order-mail-hidden-source");
      });
      document.querySelectorAll<HTMLElement>("[data-order-mail-position]").forEach((node) => node.remove());
    };
  }, []);

  return null;
}
