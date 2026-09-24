"use client";

import { usePathname } from "next/navigation";
import { CalendarDays, Filter } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";

type Range = "all" | "today" | "7d" | "30d";

const options: Array<{ value: Range; label: string }> = [
  { value: "all", label: "Tümü" },
  { value: "today", label: "Bugün" },
  { value: "7d", label: "7 Gün" },
  { value: "30d", label: "30 Gün" },
];

function ageInDays(text: string) {
  if (/\b\d+\s*dk önce\b/i.test(text) || /\b\d+\s*sa önce\b/i.test(text)) return 0;
  const dayMatch = text.match(/\b(\d+)\s*gün önce\b/i);
  if (dayMatch) return Number(dayMatch[1] || 0);
  return Number.POSITIVE_INFINITY;
}

function threshold(range: Range) {
  if (range === "today") return 0;
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  return Number.POSITIVE_INFINITY;
}

function restore(page: HTMLElement) {
  page.querySelectorAll<HTMLElement>("[data-ruth-order-range-hidden='1']").forEach((node) => {
    node.style.removeProperty("display");
    delete node.dataset.ruthOrderRangeHidden;
  });
}

function applyRange(page: HTMLElement, range: Range) {
  restore(page);
  if (range === "all") return;
  const maxDays = threshold(range);
  const candidates = Array.from(page.querySelectorAll<HTMLElement>("tbody tr, [data-order-mobile-card]"));
  candidates.forEach((node) => {
    const text = node.innerText || "";
    if (!text.includes("#") || !/(?:\d+\s*dk önce|\d+\s*sa önce|\d+\s*gün önce)/i.test(text)) return;
    if (ageInDays(text) <= maxDays) return;
    node.style.setProperty("display", "none", "important");
    node.dataset.ruthOrderRangeHidden = "1";
  });
}

export function AdminOrderDateFilterEnhancer() {
  const pathname = usePathname();
  const [range, setRange] = useState<Range>("all");
  const [host, setHost] = useState<HTMLElement | null>(null);
  const activeLabel = useMemo(() => options.find((option) => option.value === range)?.label || "Tümü", [range]);

  useEffect(() => {
    if (pathname !== "/orders") {
      setHost(null);
      setRange("all");
      return;
    }

    let pageObserver: MutationObserver | null = null;
    let locateObserver: MutationObserver | null = null;
    let frame = 0;

    const attach = () => {
      const page = document.querySelector<HTMLElement>("[data-exact-base44-page='orders-v2']");
      if (!page) return false;
      const search = page.querySelector<HTMLInputElement>("input[placeholder^='Sipariş no']");
      const wrapper = search?.parentElement?.parentElement;
      if (!wrapper) return false;

      let nextHost = page.querySelector<HTMLElement>("[data-ruth-orders-date-filter-host='1']");
      if (!nextHost) {
        nextHost = document.createElement("div");
        nextHost.dataset.ruthOrdersDateFilterHost = "1";
        wrapper.parentElement?.insertBefore(nextHost, wrapper);
      }
      setHost(nextHost);
      locateObserver?.disconnect();

      pageObserver?.disconnect();
      pageObserver = new MutationObserver((mutations) => {
        if (!mutations.some((mutation) => mutation.addedNodes.length || mutation.removedNodes.length)) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => applyRange(page, range));
      });
      pageObserver.observe(page, { childList: true, subtree: true });
      applyRange(page, range);
      return true;
    };

    if (!attach()) {
      // Eski sürüm 700 ms interval ile sayfa açık kaldığı sürece DOM'u tekrar tekrar
      // arıyordu. Sadece host oluşana kadar mutation dinle, bulunca tamamen bırak.
      locateObserver = new MutationObserver(() => { attach(); });
      locateObserver.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      locateObserver?.disconnect();
      pageObserver?.disconnect();
      cancelAnimationFrame(frame);
      const page = document.querySelector<HTMLElement>("[data-exact-base44-page='orders-v2']");
      if (page) restore(page);
      document.querySelector<HTMLElement>("[data-ruth-orders-date-filter-host='1']")?.remove();
    };
  }, [pathname, range]);

  useEffect(() => {
    if (pathname !== "/orders") return;
    const page = document.querySelector<HTMLElement>("[data-exact-base44-page='orders-v2']");
    if (page) applyRange(page, range);
  }, [pathname, range]);

  if (pathname !== "/orders" || !host) return null;

  return createPortal(
    <section className="mb-3 rounded-[var(--radius-card)] bg-surface-primary p-3 shadow-card" aria-label="Sipariş tarih filtresi">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><Filter className="h-3.5 w-3.5 text-accent" /><p className="text-xs font-semibold text-main">Filtreler</p></div>
        <div className="flex items-center gap-1 text-[10px] text-subtle"><CalendarDays className="h-3 w-3" /> {activeLabel}</div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {options.map((option) => (
          <button key={option.value} type="button" onClick={() => setRange(option.value)} className={`h-9 rounded-[var(--radius-control)] border px-2 text-[11px] font-semibold transition-colors duration-100 ${range === option.value ? "border-accent bg-accent-soft text-accent" : "border-border-subtle bg-surface-secondary text-muted hover:bg-surface-tertiary hover:text-main"}`}>
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[9px] text-subtle">Durum ve ödeme filtreleriyle birlikte çalışır; yalnızca listedeki siparişleri tarih aralığına göre daraltır.</p>
    </section>,
    host,
  );
}
