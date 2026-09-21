"use client";

import { useEffect } from "react";

const SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "[role='button']",
  ".premium-touch",
  ".product-card-root",
  ".collection-card-link",
].join(",");

function clickableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest(SELECTOR) as HTMLElement | null;
}

function syncRuthieOfferPoints() {
  const modal = document.querySelector<HTMLElement>(".ruthie-offer-modal");
  if (!modal) return;

  const cta = modal.querySelector<HTMLElement>(".ruthie-offer-cta");
  const isGuestOffer = cta?.textContent?.includes("Hemen Katıl") ?? false;
  if (!isGuestOffer) return;

  const heading = modal.querySelector<HTMLElement>(".ruthie-offer-copy h2")?.textContent || "";
  const match = heading.match(/([\d.,]+)\s+Ruthie\s+Points/i);
  if (!match) return;

  const points = match[1];
  const balance = modal.querySelector<HTMLElement>(".ruthie-offer-balance");
  const balanceLabel = balance?.querySelector<HTMLElement>("span");
  const balanceValue = balance?.querySelector<HTMLElement>("strong");

  if (balanceLabel && balanceLabel.textContent?.trim() !== "Üyelik hediyesi") {
    balanceLabel.textContent = "Üyelik hediyesi";
  }
  if (balanceValue && balanceValue.textContent?.trim() !== `${points} puan`) {
    balanceValue.textContent = `${points} puan`;
  }

  const sectionHead = modal.querySelector<HTMLElement>(".ruthie-offer-section-head");
  const sectionLabel = sectionHead?.querySelector<HTMLElement>("div:first-child > span");
  const sectionValue = sectionHead?.querySelector<HTMLElement>(".ruthie-offer-value strong");
  const sectionNote = sectionHead?.querySelector<HTMLElement>(".ruthie-offer-value small");

  if (sectionLabel && sectionLabel.textContent?.trim() !== "Üyelik hediyesi") {
    sectionLabel.textContent = "Üyelik hediyesi";
  }
  if (sectionValue && sectionValue.textContent?.trim() !== points) {
    sectionValue.textContent = points;
  }
  if (sectionNote && sectionNote.textContent?.trim() !== "Üye olunca hesabına eklenir") {
    sectionNote.textContent = "Üye olunca hesabına eklenir";
  }
}

export function PremiumInteractions() {
  useEffect(() => {
    let activeElement: HTMLElement | null = null;
    let clearTimer: number | null = null;
    let rewardFrame = 0;

    const scheduleRewardSync = () => {
      if (rewardFrame) return;
      rewardFrame = window.requestAnimationFrame(() => {
        rewardFrame = 0;
        syncRuthieOfferPoints();
      });
    };

    const clear = () => {
      if (clearTimer) {
        window.clearTimeout(clearTimer);
        clearTimer = null;
      }

      if (!activeElement) return;
      activeElement.classList.remove("ruth-pressing");
      activeElement.classList.add("ruth-releasing");

      const element = activeElement;
      activeElement = null;

      clearTimer = window.setTimeout(() => {
        element.classList.remove("ruth-releasing");
        clearTimer = null;
      }, 360);
    };

    const onPointerDown = (event: PointerEvent) => {
      const element = clickableTarget(event.target);
      if (!element) return;

      activeElement?.classList.remove("ruth-pressing", "ruth-releasing");
      activeElement = element;
      element.classList.remove("ruth-releasing");
      element.classList.add("ruth-pressing");
    };

    const onPointerUp = () => {
      clear();
      scheduleRewardSync();
    };
    const onPointerCancel = () => clear();
    const onPointerLeave = (event: PointerEvent) => {
      if (activeElement && event.target === activeElement) clear();
    };
    const onOpenRewards = () => {
      window.setTimeout(scheduleRewardSync, 0);
      window.setTimeout(scheduleRewardSync, 80);
    };

    const observer = new MutationObserver((records) => {
      const touchesRewards = records.some((record) => {
        if (record.target instanceof Element && record.target.closest(".ruthie-offer-modal")) return true;
        return Array.from(record.addedNodes).some((node) =>
          node instanceof Element && (node.matches(".ruthie-offer-modal") || Boolean(node.querySelector(".ruthie-offer-modal"))),
        );
      });
      if (touchesRewards) scheduleRewardSync();
    });

    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true });
    window.addEventListener("pointercancel", onPointerCancel, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    window.addEventListener("ruth-open-rewards", onOpenRewards);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("ruth-open-rewards", onOpenRewards);
      observer.disconnect();
      if (clearTimer) window.clearTimeout(clearTimer);
      if (rewardFrame) window.cancelAnimationFrame(rewardFrame);
    };
  }, []);

  return (
    <style>{`
      .site-app-shell .text-gold-dark {
        color: color-mix(in srgb, var(--ink) 90%, var(--gold)) !important;
      }

      .site-app-shell .text-muted-ruth {
        color: color-mix(in srgb, var(--ink) 88%, var(--ivory)) !important;
      }

      @media (hover: hover) and (pointer: fine) {
        .site-app-shell :where(
          button:not([disabled]),
          a[href],
          [role='button'],
          .premium-touch,
          .product-card-root,
          .collection-card-link
        ) {
          --ruth-premium-press-scale: .965;
          transform-origin: center;
        }

        .site-app-shell :where(.product-card-root, .collection-card-link) {
          --ruth-premium-press-scale: .985;
        }

        .site-app-shell .ruth-pressing {
          scale: var(--ruth-premium-press-scale) !important;
          transition: scale 72ms cubic-bezier(.2,.8,.2,1), filter 72ms ease !important;
          filter: brightness(.985);
        }

        .site-app-shell .ruth-releasing {
          animation: ruth-premium-release 300ms cubic-bezier(.16,1,.3,1) both;
        }

        .site-app-shell .rewards-panel.ruthie-offer-modal {
          width: min(520px, 100vw) !important;
        }

        .site-app-shell .ruthie-offer-modal .ruthie-offer-copy {
          padding: 44px 42px 40px !important;
        }

        .site-app-shell .ruthie-offer-modal .ruthie-offer-details {
          padding: 26px 42px calc(38px + env(safe-area-inset-bottom)) !important;
        }

        .site-app-shell .ruthie-offer-modal .ruthie-offer-brand {
          min-height: 64px !important;
          margin-bottom: 26px !important;
        }

        .site-app-shell .ruthie-offer-modal .ruthie-offer-brand img {
          width: auto !important;
          height: 50px !important;
          max-width: 250px !important;
          object-fit: contain !important;
          object-position: left center !important;
        }
      }

      @keyframes ruth-premium-release {
        0% { scale: var(--ruth-premium-press-scale); filter: brightness(.985); }
        58% { scale: 1.012; filter: brightness(1); }
        100% { scale: 1; filter: brightness(1); }
      }

      @media (prefers-reduced-motion: reduce) {
        .site-app-shell .ruth-pressing,
        .site-app-shell .ruth-releasing {
          animation: none !important;
          scale: 1 !important;
          filter: none !important;
        }
      }
    `}</style>
  );
}
