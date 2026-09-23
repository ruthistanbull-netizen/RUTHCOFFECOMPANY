"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { exactMobileNav } from "@/components/base44-exact/nav-config";

const TAP_DISTANCE = 12;
const PREMIUM_UI_SCOPE = 'aside[role="dialog"], [data-exact-base44-page="product-studio"], [data-variant-studio-layer], [data-variant-studio-modal]';

function cleanText(value: string | null | undefined) {
  return String(value || "").trim();
}

function isBlank(value: string) {
  return !value || value === "—" || value === "-";
}

function buttonByText(root: ParentNode, text: string) {
  return [...root.querySelectorAll<HTMLButtonElement>("button")].find((button) => cleanText(button.textContent) === text) || null;
}

function cardByTitle(root: ParentNode, title: string) {
  const heading = [...root.querySelectorAll<HTMLElement>("h2,h3")].find((node) => cleanText(node.textContent) === title);
  return heading?.closest<HTMLElement>("section") || null;
}

function valueByLabel(root: ParentNode, label: string) {
  const labelNode = [...root.querySelectorAll<HTMLElement>("p")].find((node) => cleanText(node.textContent).toLocaleLowerCase("tr-TR") === label.toLocaleLowerCase("tr-TR"));
  return labelNode?.parentElement?.children?.[1] as HTMLElement | undefined;
}

function syncFriendlyCustomerSummary() {
  const original = document.querySelector<HTMLElement>("[data-friendly-customer-summary]");
  if (!original) return;

  const dialog = original.closest<HTMLElement>('aside[role="dialog"]');
  if (!dialog) return;
  const customerCard = cardByTitle(dialog, "Müşteri");
  const customerBody = customerCard?.lastElementChild as HTMLElement | null;
  if (!customerBody) return;

  original.dataset.relocated = "true";
  let clone = customerBody.querySelector<HTMLElement>("[data-premium-customer-summary]");
  if (!clone) {
    clone = document.createElement("div");
    clone.dataset.premiumCustomerSummary = "true";
    clone.className = "mt-3 grid grid-cols-2 gap-2 border-t border-border-subtle pt-3";
    customerBody.appendChild(clone);
  }
  const next = original.innerHTML;
  if (clone.innerHTML !== next) clone.innerHTML = next;
}

function friendlyShippingStatus(current: string) {
  const normalized = current.toLocaleLowerCase("tr-TR").replaceAll("_", " ");
  if (isBlank(current)) return "Kargo kodu oluşturuldu";
  if (["delivered", "teslim edildi"].includes(normalized)) return "Teslim edildi";
  if (["out for delivery", "dağıtımda"].includes(normalized)) return "Dağıtımda";
  if (["shipped", "in transit", "gönderildi", "kargoya verildi", "kargoda"].includes(normalized)) return "Kargoda";
  if (["created", "label created", "ready", "ready to ship", "kargoya hazır", "kod oluşturuldu"].includes(normalized)) return "Kargo kodu oluşturuldu";
  if (["failed", "error", "hata", "başarısız"].some((entry) => normalized.includes(entry))) return "Kargo işlemi hatalı";
  if (["cancelled", "canceled", "iptal", "iptal edildi"].some((entry) => normalized.includes(entry))) return "Kargo işlemi iptal edildi";
  return current.replaceAll("_", " ");
}

function syncShippingStatus() {
  const dialogs = [...document.querySelectorAll<HTMLElement>('aside[role="dialog"]')];
  for (const dialog of dialogs) {
    if (!dialog.querySelector("h2")?.textContent?.trim().startsWith("Sipariş #")) continue;
    const shippingCard = cardByTitle(dialog, "Kargo ve Teslimat");
    if (!shippingCard) continue;

    const status = valueByLabel(shippingCard, "Kargo Durumu");
    if (!status) continue;
    const createCodeButton = buttonByText(shippingCard, "Kargo Kodu Oluştur");
    if (createCodeButton) {
      status.textContent = "Kargo kodu bekleniyor";
      const delivered = valueByLabel(shippingCard, "Teslim Zamanı");
      if (delivered) delivered.textContent = "—";
      continue;
    }
    const current = cleanText(status.textContent);
    const next = friendlyShippingStatus(current);
    if (current !== next) status.textContent = next;
  }
}

function decorateVariantCards() {
  document.querySelectorAll<HTMLButtonElement>('button[aria-label="Varyant görsellerini düzenle"]').forEach((button) => {
    const card = button.parentElement as HTMLElement | null;
    if (card) card.dataset.variantStudioCard = "true";
  });
}

function decorateVariantPopups() {
  const headings = [...document.querySelectorAll<HTMLElement>("h3")].filter((heading) => {
    const text = cleanText(heading.textContent);
    return text === "Yeni varyant ekle" || text === "Varyant görselleri";
  });

  for (const heading of headings) {
    const titleBlock = heading.parentElement;
    const handle = titleBlock?.parentElement as HTMLElement | null;
    const modal = handle?.parentElement as HTMLElement | null;
    if (!handle || !modal || !modal.querySelector('button[aria-label="Kapat"]')) continue;

    const kind = cleanText(heading.textContent) === "Yeni varyant ekle" ? "add" : "media";
    modal.dataset.variantStudioModal = kind;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    handle.dataset.popupDragHandle = "true";
    if (modal.parentElement) modal.parentElement.dataset.variantStudioLayer = "true";

    const saveText = kind === "add" ? "Varyantları ekle" : "Görsel sırasını kaydet";
    const save = buttonByText(modal, saveText);
    const footer = save?.parentElement as HTMLElement | null;
    if (footer) footer.dataset.stickyPopupFooter = "true";

    if (kind === "add") {
      const content = [...modal.children].find((child) => child !== handle && child !== footer) as HTMLElement | undefined;
      if (content) content.dataset.popupScrollBody = "true";
    }
  }
}

function decorate() {
  syncFriendlyCustomerSummary();
  syncShippingStatus();
  decorateVariantCards();
  decorateVariantPopups();
}

function elementCanAffectPremiumUi(element: Element | null) {
  if (!element) return false;
  return Boolean(
    element.matches(PREMIUM_UI_SCOPE)
    || element.closest(PREMIUM_UI_SCOPE)
    || element.querySelector(PREMIUM_UI_SCOPE),
  );
}

function mutationCanAffectPremiumUi(mutation: MutationRecord) {
  const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
  if (elementCanAffectPremiumUi(target)) return true;
  for (const node of mutation.addedNodes) {
    if (node instanceof Element && elementCanAffectPremiumUi(node)) return true;
  }
  return false;
}

export function PremiumPanelInteractionEnhancer() {
  const router = useRouter();

  useEffect(() => {
    let dockTap: { pointerId: number; index: number; x: number; y: number } | null = null;
    let scheduled = 0;

    const scheduleDecorate = () => {
      if (scheduled) return;
      scheduled = window.requestAnimationFrame(() => {
        scheduled = 0;
        decorate();
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      const dockButton = event.target.closest<HTMLButtonElement>('nav[aria-label="ROSTA Coffee Co. mobil menü"] button[data-dock-index]');
      if (!dockButton) return;
      const index = Number(dockButton.dataset.dockIndex);
      if (!Number.isFinite(index)) return;
      dockTap = { pointerId: event.pointerId, index, x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!dockTap || dockTap.pointerId !== event.pointerId) return;
      const tap = dockTap;
      dockTap = null;
      const distance = Math.hypot(event.clientX - tap.x, event.clientY - tap.y);
      if (distance > TAP_DISTANCE) return;
      const item = exactMobileNav[tap.index];
      if (!item) return;
      const destination = item.path.split("?")[0] || "/";
      if (window.location.pathname !== destination || item.path.includes("?")) router.push(item.path);
    };

    const onPointerCancel = () => {
      dockTap = null;
    };

    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    document.addEventListener("pointerup", onPointerUp, { capture: true, passive: true });
    document.addEventListener("pointercancel", onPointerCancel, { capture: true, passive: true });

    // Initial pass is enough for already-mounted detail/studio surfaces. After
    // that, ignore unrelated panel mutations (metrics, toasts, lists, typing)
    // and only re-run when an order dialog or product studio actually changes.
    scheduleDecorate();
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(mutationCanAffectPremiumUi)) scheduleDecorate();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      if (scheduled) window.cancelAnimationFrame(scheduled);
    };
  }, [router]);

  return null;
}
