"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ProductCard from "@/components/ProductCard";
import type { Product } from "@/types/site";

type SliderLayout = { desktopItems: number; mobileItems: number; gap: number };

function normalizeLayout(desktopItems: number, mobileItems: number, gap: number): SliderLayout {
  return {
    desktopItems: Math.max(1, Math.round(Number(desktopItems) || 4)),
    mobileItems: Math.max(1, Math.round(Number(mobileItems) || 2)),
    gap: Math.max(0, Number(gap) || 0),
  };
}

function itemBasis(items: number, gap: number) {
  const safeItems = Math.max(1, Math.round(items));
  const gapShare = safeItems > 1 ? (gap * (safeItems - 1)) / safeItems : 0;
  return `calc(${100 / safeItems}% - ${gapShare}px)`;
}

export function ThemeProductSlider({ products, desktopItems, mobileItems, gap, showArrows = true }: { products: Product[]; desktopItems: number; mobileItems: number; gap: number; showArrows?: boolean }) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<SliderLayout>(() => normalizeLayout(desktopItems, mobileItems, gap));

  useEffect(() => {
    setLayout(normalizeLayout(desktopItems, mobileItems, gap));
  }, [desktopItems, mobileItems, gap]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("themeEditor") !== "1") return;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      if (event.data.type !== "RUTH_THEME_EDITOR_SECTION_DRAFT_LOCAL" || !event.data.settings) return;

      const root = railRef.current?.closest("[data-theme-section-id]") as HTMLElement | null;
      const sectionId = root?.getAttribute("data-theme-section-id") || "";
      if (!sectionId) return;

      const pages = event.data.settings?.pages;
      const page = pages && typeof pages === "object" ? pages[event.data.path] : null;
      const sections = Array.isArray(page?.sections) ? page.sections : [];
      const section = sections.find((item: any) => item?.id === sectionId);
      if (!section) return;

      setLayout(normalizeLayout(
        section.desktopItems ?? desktopItems,
        section.mobileItems ?? mobileItems,
        section.gap ?? gap,
      ));
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [desktopItems, mobileItems, gap]);

  const mobileBasis = useMemo(() => itemBasis(layout.mobileItems, layout.gap), [layout.mobileItems, layout.gap]);
  const desktopBasis = useMemo(() => itemBasis(layout.desktopItems, layout.gap), [layout.desktopItems, layout.gap]);

  const move = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.max(rail.clientWidth * 0.9, 240), behavior: "smooth" });
  };

  return (
    <div className="relative w-full min-w-0 overflow-hidden px-4 md:px-6 lg:px-8">
      {showArrows ? <>
        <button type="button" onClick={() => move(-1)} aria-label="Önceki ürünler" className="absolute left-6 top-[38%] z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-kraft/40 bg-carbon-soft text-cream shadow-sm active:bg-espresso focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick md:grid lg:left-10"><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" onClick={() => move(1)} aria-label="Sonraki ürünler" className="absolute right-6 top-[38%] z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-kraft/40 bg-carbon-soft text-cream shadow-sm active:bg-espresso focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick md:grid lg:right-10"><ChevronRight className="h-4 w-4" /></button>
      </> : null}

      <div
        ref={railRef}
        className="theme-product-rail flex w-full min-w-0 flex-nowrap items-start overflow-x-auto overflow-y-hidden pb-3"
        style={{
          gap: layout.gap,
          ["--theme-mobile-basis" as string]: mobileBasis,
          ["--theme-desktop-basis" as string]: desktopBasis,
        }}
      >
        {products.map((product, index) => (
          <div key={product.id} className="theme-product-slide min-w-0 shrink-0 snap-start">
            <ProductCard product={product} index={index} showShortDescription={false} />
          </div>
        ))}
      </div>

      <style jsx>{`
        .theme-product-rail {
          flex-direction: row !important;
          flex-wrap: nowrap !important;
          align-items: flex-start;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
          overscroll-behavior-y: none;
          scroll-padding-inline: 0;
        }
        .theme-product-rail::-webkit-scrollbar { display: none; }
        .theme-product-slide {
          flex: 0 0 var(--theme-mobile-basis) !important;
          width: var(--theme-mobile-basis) !important;
          max-width: var(--theme-mobile-basis) !important;
          min-width: 0 !important;
          scroll-snap-align: start;
          scroll-snap-stop: always;
        }
        .theme-product-slide > :global(*) {
          width: 100% !important;
          min-width: 0 !important;
          max-width: 100% !important;
        }
        @media (min-width: 768px) {
          .theme-product-slide {
            flex-basis: var(--theme-desktop-basis) !important;
            width: var(--theme-desktop-basis) !important;
            max-width: var(--theme-desktop-basis) !important;
          }
        }
      `}</style>
    </div>
  );
}
