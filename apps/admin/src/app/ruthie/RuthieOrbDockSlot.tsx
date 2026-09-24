"use client";

import { createPortal } from "react-dom";
import { useLayoutEffect, useState } from "react";

const DOCK_LAYOUT_MIGRATION_KEY = "ruthie.quickVoice.dockLayout.v11";
const ORB_BUTTON_SELECTOR = 'button[data-phase][data-dragging][data-gliding]';
const PAGE_SELECTOR = '[data-exact-base44-page="overview-v4"]';
const DOCK_ORB_Z_INDEX = "49";
const FLOATING_ORB_Z_INDEX = "2147483600";

export function RuthieOrbDockSlot() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const page = document.querySelector<HTMLElement>(PAGE_SELECTOR);
    if (!page) return;
    const previousPosition = page.style.position;
    if (window.getComputedStyle(page).position === "static") page.style.position = "relative";
    setHost(page);
    return () => {
      setHost(null);
      page.style.position = previousPosition;
    };
  }, []);

  useLayoutEffect(() => {
    if (!host) return;

    try {
      if (window.localStorage.getItem(DOCK_LAYOUT_MIGRATION_KEY) !== "1") {
        window.localStorage.removeItem("ruthie.quickVoice.position.v1.mobile");
        window.localStorage.removeItem("ruthie.quickVoice.position.v1.desktop");
        window.localStorage.setItem(DOCK_LAYOUT_MIGRATION_KEY, "1");
      }
    } catch {}

    const dock = host.querySelector<HTMLElement>("[data-ruthie-orb-dock]");
    if (!dock) return;

    let probeFrame: number | null = null;
    let probeCount = 0;

    const findOrbLayer = () => {
      const button = document.querySelector<HTMLButtonElement>(ORB_BUTTON_SELECTOR);
      return button?.parentElement instanceof HTMLElement ? button.parentElement : null;
    };

    const seatOrb = () => {
      const layer = findOrbLayer();
      if (!layer) return;
      if (layer.parentElement !== dock) dock.appendChild(layer);
      layer.style.position = "absolute";
      layer.style.left = "0";
      layer.style.top = "0";
      layer.style.zIndex = DOCK_ORB_Z_INDEX;
      layer.style.setProperty("--orb-x", "0px");
      layer.style.setProperty("--orb-y", "0px");
    };

    const releaseOrb = () => {
      const layer = findOrbLayer();
      if (!layer || layer.parentElement === document.body) {
        if (layer) layer.style.zIndex = FLOATING_ORB_Z_INDEX;
        return;
      }
      const rect = layer.getBoundingClientRect();
      document.body.appendChild(layer);
      layer.style.position = "fixed";
      layer.style.left = "0";
      layer.style.top = "0";
      layer.style.zIndex = FLOATING_ORB_Z_INDEX;
      layer.style.setProperty("--orb-x", `${rect.left.toFixed(2)}px`);
      layer.style.setProperty("--orb-y", `${rect.top.toFixed(2)}px`);
    };

    const syncMode = () => {
      const button = document.querySelector<HTMLButtonElement>(ORB_BUTTON_SELECTOR);
      const listening = button?.dataset.listening === "true";
      if (listening) {
        // During voice activation the orb returns to the body layer so page
        // stacking/overflow cannot hide it. Its screen position is preserved.
        releaseOrb();
        return;
      }
      if (dock.dataset.state === "occupied") seatOrb();
      else releaseOrb();
    };

    const probeForOrb = () => {
      probeCount += 1;
      if (findOrbLayer()) {
        syncMode();
        probeFrame = null;
        return;
      }
      if (probeCount < 120) probeFrame = window.requestAnimationFrame(probeForOrb);
      else probeFrame = null;
    };

    const observer = new MutationObserver(syncMode);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-state", "data-listening"],
      childList: true,
      subtree: true,
    });
    probeFrame = window.requestAnimationFrame(probeForOrb);

    return () => {
      observer.disconnect();
      if (probeFrame !== null) window.cancelAnimationFrame(probeFrame);
      const layer = findOrbLayer();
      if (layer) {
        const rect = layer.getBoundingClientRect();
        if (layer.parentElement !== document.body) document.body.appendChild(layer);
        layer.style.position = "fixed";
        layer.style.left = "0";
        layer.style.top = "0";
        layer.style.setProperty("--orb-x", `${rect.left.toFixed(2)}px`);
        layer.style.setProperty("--orb-y", `${rect.top.toFixed(2)}px`);
        layer.style.removeProperty("z-index");
      }
    };
  }, [host]);

  if (!host) return null;

  return createPortal(
    <div
      data-ruthie-orb-dock
      data-state="occupied"
      aria-hidden="true"
      className="group pointer-events-none absolute right-[36px] top-[-18px] z-[49] h-[132px] w-[132px] rounded-full lg:right-[166px] lg:top-[-52px] lg:h-[150px] lg:w-[150px]"
    >
      <span className="absolute bottom-[20px] left-1/2 h-[4px] w-8 -translate-x-1/2 rounded-full bg-accent/22 opacity-40 blur-[1px] transition-[opacity,transform] duration-300 group-data-[state=empty]:opacity-0 group-data-[state=near]:opacity-0" />
      <span className="absolute left-1/2 top-1/2 h-[132px] w-[132px] -translate-x-1/2 -translate-y-1/2 scale-[0.96] rounded-full border border-dashed border-accent/38 bg-accent/[0.02] opacity-0 transition-[opacity,transform,border-color,box-shadow,background-color] duration-300 ease-out group-data-[state=empty]:scale-100 group-data-[state=empty]:opacity-72 group-data-[state=near]:scale-[1.04] group-data-[state=near]:border-accent/76 group-data-[state=near]:bg-accent/[0.05] group-data-[state=near]:opacity-100 group-data-[state=near]:shadow-[0_0_18px_hsl(var(--accent)/0.16)] lg:h-[150px] lg:w-[150px]" />
      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 scale-75 rounded-full bg-accent/42 opacity-0 transition-[opacity,transform] duration-300 group-data-[state=empty]:scale-100 group-data-[state=empty]:opacity-42 group-data-[state=near]:scale-125 group-data-[state=near]:opacity-88" />
    </div>,
    host,
  );
}
