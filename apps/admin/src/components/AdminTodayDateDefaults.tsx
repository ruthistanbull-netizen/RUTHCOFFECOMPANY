"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

type TrackedSelect = HTMLSelectElement & {
  _valueTracker?: { setValue: (value: string) => void };
};

function supportsToday(select: HTMLSelectElement) {
  return Array.from(select.options).some((option) => option.value === "today");
}

function setReactSelectValue(select: TrackedSelect, value: string) {
  const previous = select.value;
  if (previous === value) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  select._valueTracker?.setValue(previous);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

export function AdminTodayDateDefaults() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    let disposed = false;
    let userChangedRange = false;
    const handled = new WeakSet<HTMLSelectElement>();
    const timers = new Set<number>();

    const schedule = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
    };

    const synchronize = (select: HTMLSelectElement) => {
      if (disposed || userChangedRange || !select.isConnected || select.disabled || !supportsToday(select) || handled.has(select)) return;
      handled.add(select);
      let attempt = 0;
      const apply = () => {
        if (disposed || userChangedRange || !select.isConnected || select.value === "today") return;
        setReactSelectValue(select as TrackedSelect, "today");
        attempt += 1;
        if (attempt < 3) schedule(apply, 70 * attempt);
      };
      apply();
    };

    const scanNode = (node: Node) => {
      if (disposed || userChangedRange) return;
      if (node instanceof HTMLSelectElement) synchronize(node);
      if (node instanceof Element) node.querySelectorAll<HTMLSelectElement>("select").forEach(synchronize);
    };

    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement) || !supportsToday(target)) return;
      if (event.isTrusted) userChangedRange = true;
    };

    document.addEventListener("change", onChange, true);
    scanNode(document.body);

    // Önceden her DOM mutation'ında paneldeki bütün select'ler tekrar taranıyordu.
    // Sadece yeni eklenen subtree'leri işle; route değişiminde effect zaten yenilenir.
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) mutation.addedNodes.forEach(scanNode);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("change", onChange, true);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, [pathname]);

  return null;
}
