"use client";
import { StoreDesignEditableMedia } from "@/components/theme/StoreDesignEditableMedia";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type StoreDesignSlide = {
  id: string;
  title?: string;
  body?: string;
  url?: string;
  type?: "image" | "video";
  posterUrl?: string;
  ctaHref?: string;
  ctaLabel?: string;
};

type Props = {
  slides: StoreDesignSlide[];
  autoplay?: boolean;
  transition?: "slide" | "fade";
  intervalMs?: number;
};

function safeInterval(value: number | undefined) {
  return Math.min(15000, Math.max(2500, Number.isFinite(value) ? Number(value) : 5000));
}

export function StoreDesignSlideshow({
  slides,
  autoplay = false,
  transition = "slide",
  intervalMs,
}: Props) {
  const validSlides = useMemo(() => slides.filter((slide) => slide.url), [slides]);
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (index >= validSlides.length) setIndex(0);
  }, [index, validSlides.length]);

  useEffect(() => {
    if (!autoplay || reducedMotion || validSlides.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % validSlides.length);
    }, safeInterval(intervalMs));
    return () => window.clearInterval(timer);
  }, [autoplay, intervalMs, reducedMotion, validSlides.length]);

  if (!validSlides.length) return null;
  const current = validSlides[index]!;
  const go = (next: number) => setIndex((next + validSlides.length) % validSlides.length);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-current/10">
      <div className={transition === "fade" ? "relative min-h-[320px]" : "relative"}>
        {validSlides.map((slide, slideIndex) => {
          const active = slideIndex === index;
          return (
            <article
              key={slide.id}
              data-editor-id={`block:${slide.id}`}
              data-editor-type="slide"
              data-editor-label={slide.title || `Slayt ${slideIndex + 1}`}
              aria-hidden={!active}
              className={
                transition === "fade"
                  ? `absolute inset-0 transition-opacity duration-500 ${active ? "z-10 opacity-100" : "pointer-events-none opacity-0"}`
                  : active ? "block" : "hidden"
              }
            >
              {slide.type === "video" ? (
                <StoreDesignEditableMedia editorId={`block:${slide.id}` + ".media"} aliases={[`block:${slide.id}`]} src={slide.url || ""}  type="video" poster={slide.posterUrl} className="aspect-[16/10] w-full object-cover" muted loop autoPlay={active && !reducedMotion} />
              ) : (
                <StoreDesignEditableMedia editorId={`block:${slide.id}` + ".media"} aliases={[`block:${slide.id}`]} src={slide.url || ""}  alt={slide.title || ""} className="aspect-[16/10] w-full object-cover" autoPlay={active && !reducedMotion} />
              )}
              {(slide.title || slide.body || slide.ctaHref) ? (
                <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-6 text-white md:p-9">
                  {slide.title ? <h3 className="font-heading text-2xl md:text-3xl">{slide.title}</h3> : null}
                  {slide.body ? <p className="mt-2 max-w-xl text-sm leading-6 text-white/80">{slide.body}</p> : null}
                  {slide.ctaHref ? <Link href={slide.ctaHref} className="mt-5 inline-flex rounded-full border border-white/70 px-4 py-2 text-[9px] uppercase tracking-[0.12em]">{slide.ctaLabel || "Keşfet"}</Link> : null}
                </div>
              ) : null}
            </article>
          );
        })}
        {transition === "fade" ? <div className="aspect-[16/10]" aria-hidden="true" /> : null}
      </div>

      {validSlides.length > 1 ? (
        <>
          <button type="button" onClick={() => go(index - 1)} className="absolute left-3 top-1/2 z-30 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow-sm" aria-label="Önceki slayt">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => go(index + 1)} className="absolute right-3 top-1/2 z-30 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow-sm" aria-label="Sonraki slayt">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-1.5">
            {validSlides.map((slide, slideIndex) => (
              <button key={slide.id} type="button" onClick={() => go(slideIndex)} className={`h-1.5 rounded-full bg-white transition-[width,opacity] ${slideIndex === index ? "w-5 opacity-100" : "w-1.5 opacity-55"}`} aria-label={`${slideIndex + 1}. slayta git`} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
