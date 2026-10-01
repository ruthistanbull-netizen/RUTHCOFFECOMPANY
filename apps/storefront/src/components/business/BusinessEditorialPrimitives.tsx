"use client";

import React, { useRef, useState } from "react";
import { AnimatePresence, motion, useScroll, useTransform, useVelocity, useSpring, useInView } from "framer-motion";
import { useOverlayBehavior } from "@ruth-commerce/ui";
import { ruthMotion } from "@ruth-commerce/ui/motion";

export const C = {
  carbon: "#111111",
  cream: "#FBF3E6",
  brick: "#C94A40",
  kraft: "#C8A77D",
};

export function StudioImage({ src, alt = "", className = "" }: { src: string; alt?: string; className?: string }) {
  return (
    <img
      src={src}
      alt={typeof alt === "string" ? alt : ""}
      className={`${className} object-cover`}
      loading="lazy"
      decoding="async"
    />
  );
}

export function StudioArrow({ down = false }: { down?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="inline-block h-[0.75em] w-[0.75em]" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d={down ? "M4 4L20 20M4 20H20V4" : "M4 20L20 4M4 4H20V20"} />
    </svg>
  );
}

const studioNavLinks = [
  { label: "STÜDYO", href: "#hero" },
  { label: "HİZMETLER", href: "#services" },
  { label: "SÜREÇ", href: "#process" },
  { label: "İLETİŞİM", href: "#contact" },
];

const studioMenuLinks = [{ label: "ANASAYFA", href: "/" }, ...studioNavLinks];

type EditorialLink = { label: string; href: string };

export function Nav({
  reduceMotion,
  navLinks = studioNavLinks,
  menuLinks = studioMenuLinks,
  wordmark = <>ROSTA<span className="text-[0.7em] align-top">.</span>Studio</>,
  drawerTitle = "ROSTA.Studio",
  menuLabel = "Stüdyo menüsü",
  footerText = "İST/TR · KAHVE SİSTEMİ · KUR. 2026",
}: {
  reduceMotion: boolean;
  navLinks?: readonly EditorialLink[];
  menuLinks?: readonly EditorialLink[];
  wordmark?: React.ReactNode;
  drawerTitle?: string;
  menuLabel?: string;
  footerText?: string;
}) {
  const [open, setOpen] = useState(false);
  const { containerRef } = useOverlayBehavior({
    active: open,
    onClose: () => setOpen(false),
    dismissalPolicy: "explicit-dismiss",
    fullscreen: true,
  });

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50"
        style={{ mixBlendMode: "difference" }}
      >
        <div className="flex items-center justify-between px-5 sm:px-8 py-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <button
              type="button"
              aria-label="Menü"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              className="flex h-11 w-11 flex-col justify-center gap-[7px] p-0"
            >
              <span className="block h-px w-10" style={{ background: C.cream }} />
              <span className="block h-px w-10" style={{ background: C.cream }} />
            </button>

            <a
              href="#hero"
              className="font-display font-bold uppercase tracking-tight text-lg sm:text-xl leading-none"
              style={{ color: C.cream }}
            >
              {wordmark}
            </a>
          </div>

          <nav className="hidden md:flex items-center gap-7">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="font-mono-tech text-[11px] uppercase tracking-[0.18em] hover:opacity-60 transition-opacity"
                style={{ color: C.cream }}
              >
                {l.label}
              </a>
            ))}
          </nav>

        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label={menuLabel}
            tabIndex={-1}
            data-ruth-overlay-unstyled="true"
            initial={reduceMotion ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: reduceMotion ? 0 : "100%" }}
            transition={{ type: "tween", duration: reduceMotion ? ruthMotion.duration.none : 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="studio-drawer fixed inset-0 z-[160] bg-[#111111] flex flex-col"
          >
            <div className="flex shrink-0 items-center justify-between px-5 py-5">
              <span className="font-display font-bold uppercase text-lg" style={{ color: C.cream }}>
                {drawerTitle}
              </span>
              <button type="button" aria-label="Kapat" data-autofocus onClick={() => setOpen(false)} className="flex h-11 w-11 flex-col items-center justify-center p-2">
                <span className="block w-7 h-[2px] rotate-45" style={{ background: C.cream }} />
                <span className="block w-7 h-[2px] -rotate-45 -mt-[2px]" style={{ background: C.cream }} />
              </button>
            </div>

            <nav className="flex shrink-0 flex-col px-5 mt-10 mb-8 gap-1">
              {menuLinks.map((l, i) => (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="font-display uppercase text-6xl font-bold leading-[1.05] tracking-tight"
                  style={{ color: C.cream }}
                >
                  <span className="font-mono-tech text-xs mr-3 align-middle" style={{ color: C.brick }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {l.label}
                </a>
              ))}
            </nav>

            <div className="mt-auto shrink-0 px-5 pb-8 font-mono-tech text-[10px] uppercase tracking-[0.2em]" style={{ color: C.kraft }}>
              {footerText}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function Hero({
  reduceMotion,
  words = ["ROSTA.", "STUDIO"],
  title,
  eyebrow = "ROSTA / STUDIO",
  systemLabel = "KAHVE SİSTEMİ",
  yearLabel = "KUR. 2026",
  subline = <>KAHVE <span style={{ color: C.brick }}>/</span> İŞLETME <span style={{ color: C.brick }}>/</span> DENEYİM</>,
  description = "Kahve işletmelerini fikirden gerçek deneyime dönüştürüyoruz.",
  actionLabel = "BİRLİKTE ÇALIŞALIM",
  actionHref = "#contact",
}: {
  reduceMotion: boolean;
  words?: readonly [string, string];
  title?: string;
  eyebrow?: string;
  systemLabel?: string;
  yearLabel?: string;
  subline?: React.ReactNode;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0%", "end 0%"],
  });

  const rostaX = useTransform(scrollYProgress, [0, 1], ["0vw", "-65vw"]);
  const studioX = useTransform(scrollYProgress, [0, 1], ["0vw", "65vw"]);
  const fade = useTransform(scrollYProgress, [0, 0.55, 1], [1, 0, 0]);
  const lineScale = useTransform(scrollYProgress, [0, 1], [1, 0]);

  const headStyle = {
    color: C.cream,
    fontSize: "clamp(4.5rem, 21vw, 21rem)",
    lineHeight: 0.82,
    letterSpacing: "-0.04em",
  };

  return (
    <section id="hero" ref={ref} className="business-hero relative h-[180vh] bg-[#111111]">
      {title ? <h1 className="sr-only">{title}</h1> : null}
      <div className="business-hero-sticky sticky top-0 h-screen overflow-hidden flex flex-col justify-center grain">
        <div
          className="absolute top-24 left-5 sm:left-8 right-5 sm:right-8 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]"
          style={{ color: C.kraft }}
        >
          <span>{eyebrow}</span>
          <span className="hidden sm:inline">{systemLabel}</span>
          <span>{yearLabel}</span>
        </div>

        <div className="relative w-full px-5 sm:px-8">
          <div className="overflow-hidden">
            <motion.div
              style={{ x: reduceMotion ? 0 : rostaX, ...headStyle }}
              className="font-display font-bold uppercase select-none"
            >
              {words[0]}
            </motion.div>
          </div>
          <div className="overflow-hidden -mt-[1.2vw]">
            <motion.div
              style={{ x: reduceMotion ? 0 : studioX, ...headStyle }}
              className="font-display font-bold uppercase select-none"
            >
              {words[1]}
            </motion.div>
          </div>
        </div>

        <motion.div
          style={{ opacity: reduceMotion ? 1 : fade }}
          className="business-hero-copy absolute bottom-28 left-5 sm:left-8 right-5 sm:right-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6"
        >
          <div className="font-mono-tech text-[11px] sm:text-xs uppercase tracking-[0.22em]" style={{ color: "rgba(251,243,230,0.8)" }}>
            {subline}
          </div>
          <p className="max-w-md font-body text-sm sm:text-base leading-relaxed" style={{ color: "rgba(251,243,230,0.7)" }}>
            {description}
          </p>
        </motion.div>

        <motion.div style={{ opacity: reduceMotion ? 1 : fade }} className="absolute bottom-10 left-5 sm:left-8 right-5 sm:right-8 flex items-end justify-between">
          <a href={actionHref} className="group font-display uppercase text-lg sm:text-xl tracking-tight" style={{ color: C.cream }}>
            {actionLabel}{" "}
            <span className="studio-hero-arrow inline-block group-hover:translate-x-1 group-hover:-translate-y-[2px] transition-transform" style={{ color: C.brick }}><StudioArrow down /></span>
          </a>
          <div className="hidden sm:block w-24 h-[2px] overflow-hidden" style={{ background: "rgba(251,243,230,0.2)" }}>
            <motion.div style={{ scaleX: reduceMotion ? 1 : lineScale, transformOrigin: "left", background: C.brick }} className="w-full h-full" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function MarqueeRow({ items, direction = -1, speed = 1, className = "", reduceMotion }: {
  items: readonly React.ReactNode[];
  direction?: -1 | 1;
  speed?: number;
  className?: string;
  reduceMotion: boolean;
}) {
  const ref = useRef(null);
  const visible = useInView(ref, { margin: "100px" });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const velocity = useVelocity(scrollYProgress);
  const smoothVelocity = useSpring(velocity, { stiffness: 80, damping: 20 });
  const skew = useTransform(smoothVelocity, [-2, 2], [5, -5]);
  const row = [...items, ...items];
  const duration = `${24 / speed}s`;
  const animName = direction === -1 ? "rosta-marquee-left" : "rosta-marquee-right";

  return (
    <div ref={ref} className={`studio-marquee-row overflow-hidden whitespace-nowrap ${className}`}>
      <motion.div style={{ skew: reduceMotion ? 0 : skew }}>
        <div
          className="rosta-marquee inline-flex"
          style={{
            animation: reduceMotion ? "none" : `${animName} ${duration} linear infinite`,
            animationPlayState: visible ? "running" : "paused",
            willChange: visible && !reduceMotion ? "transform" : "auto",
          }}
        >
          {row.map((it, i) => (
            <span key={i} className="mx-6 sm:mx-10">{it}</span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export const Brick = ({ children }: { children: React.ReactNode }) => <span style={{ color: C.brick }}>{children}</span>;

const studioWords = ["BAR.", "ÜRÜN.", "MARKA.", "DENEYİM."];

export function WhoWeAre({
  reduceMotion,
  firstLine = "KAHVEYİ SADECE SERVİS EDİLEN",
  secondLine = <>BİR ÜRÜN OLARAK <span style={{ color: C.brick }}>GÖRMÜYORUZ.</span></>,
  words = studioWords,
  description = "ROSTA.Studio; kahve işletmelerinin ürününden servis akışına, marka dilinden bar sistemine kadar bütün deneyimini birlikte kurar.",
  sectionNumber = "03",
  label = "BİZ KİMİZ",
}: {
  reduceMotion: boolean;
  firstLine?: React.ReactNode;
  secondLine?: React.ReactNode;
  words?: readonly string[];
  description?: string;
  sectionNumber?: string;
  label?: string;
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const leftX = useTransform(scrollYProgress, [0, 0.45, 1], ["-110%", "0%", "0%"]);
  const rightX = useTransform(scrollYProgress, [0, 0.1, 0.55, 1], ["110%", "110%", "0%", "0%"]);

  return (
    <section ref={ref} className="relative bg-[#FBF3E6] py-28 sm:py-40 overflow-hidden">
      <div className="px-5 sm:px-8 mb-16 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / {sectionNumber}</span>
        <span>{label}</span>
      </div>
      <div className="px-5 sm:px-8">
        <div className="overflow-hidden">
          <motion.h2 style={{ x: reduceMotion ? 0 : leftX }}>
            <span style={{ color: C.carbon, fontSize: "clamp(2rem, 6.4vw, 6.5rem)" }} className="font-display uppercase font-bold leading-[0.95] block">
              {firstLine}
            </span>
          </motion.h2>
        </div>
        <div className="overflow-hidden">
          <motion.h2 style={{ x: reduceMotion ? 0 : rightX }}>
            <span style={{ color: C.carbon, fontSize: "clamp(2rem, 6.4vw, 6.5rem)" }} className="font-display uppercase font-bold leading-[0.95] block">
              {secondLine}
            </span>
          </motion.h2>
        </div>

        <div className="mt-16 sm:mt-24 grid grid-cols-2 sm:grid-cols-4 gap-y-8 gap-x-4">
          {words.map((w, i) => (
            <motion.div
              key={w}
              initial={reduceMotion ? false : { opacity: 0, y: 40 }}
              animate={reduceMotion ? { opacity: 1, y: 0 } : undefined}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: reduceMotion ? 0 : i * 0.08, duration: reduceMotion ? ruthMotion.duration.none : 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="font-display uppercase font-bold leading-none tracking-[-0.03em]"
              style={{ color: C.carbon, fontSize: "clamp(2.5rem, 7vw, 6rem)" }}
            >
              {w}
            </motion.div>
          ))}
        </div>

        <p className="mt-16 sm:mt-24 max-w-2xl font-body text-base sm:text-lg leading-relaxed" style={{ color: C.carbon }}>
          {description}
        </p>
      </div>
    </section>
  );
}

export function ServiceBlock({ index, title, subline, description, image, imageAlt = "", side = "left", reduceMotion, label = "HİZMET" }: {
  index: number;
  title: React.ReactNode;
  subline: string;
  description: React.ReactNode;
  image: string;
  imageAlt?: string;
  side?: "left" | "right";
  reduceMotion: boolean;
  label?: string;
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const imgScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.6, 1, 1.05]);
  const imgWidth = useTransform(scrollYProgress, [0, 0.5, 1], ["60%", "100%", "100%"]);
  const imageStyle = {
    "--business-image-width": reduceMotion ? "100%" : imgWidth,
    scale: reduceMotion ? 1 : imgScale,
    x: "-50%",
  };
  const titleX = useTransform(
    scrollYProgress,
    [0, 0.5, 1],
    [side === "left" ? "-60vw" : "60vw", "0vw", "0vw"],
  );
  const numOpacity = useTransform(scrollYProgress, [0, 0.3, 0.8, 1], [0.2, 1, 1, 0.3]);
  const numberX = useTransform(scrollYProgress, [0, 0.5, 1], [side === "left" ? "-80vw" : "80vw", "0vw", "0vw"]);
  const numberOpacity = useTransform(scrollYProgress, [0, 0.35, 1], [0, 1, 1]);
  const num = String(index).padStart(2, "0");

  return (
    <div ref={ref} className="studio-service relative">
      <motion.div
        style={{ opacity: reduceMotion ? 1 : numOpacity }}
        className="absolute top-6 left-5 sm:left-8 font-mono-tech text-[10px] uppercase tracking-[0.25em] z-20"
      >
        <span style={{ color: C.kraft }}>{label} / {num}</span>
      </motion.div>

      <div className="business-service-track relative h-[160vh]">
        <div className="business-service-sticky sticky top-0 h-screen flex flex-col justify-center overflow-hidden">
          <div className="studio-media-slot relative h-[42vh] sm:h-[60vh] w-full min-h-0">
            <motion.div
              style={imageStyle}
              className="studio-media-frame absolute left-1/2 top-0 h-full overflow-hidden"
            >
              <StudioImage src={image} alt={imageAlt} className="w-full h-full" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(17,17,17,0.15), rgba(17,17,17,0.55))" }} />
            </motion.div>
          </div>

          <div className="relative isolate z-10 shrink-0 px-5 sm:px-8 mt-8 sm:mt-10">
            <motion.span
              aria-hidden="true"
              className="studio-service-number absolute left-5 sm:left-8 top-1/2 pointer-events-none font-display font-bold leading-none"
              style={{ x: reduceMotion ? 0 : numberX, y: "-50%", opacity: reduceMotion ? 1 : numberOpacity, color: "rgba(201,74,64,0.14)", fontSize: "clamp(12rem, 40vw, 38rem)" }}
            >{num}</motion.span>
            <motion.h3
              className="relative z-10 font-display uppercase font-bold leading-[0.86] tracking-[-0.04em]"
              style={{ x: reduceMotion ? 0 : titleX, color: C.cream, fontSize: "clamp(2.8rem, 11vw, 11rem)" }}
            >
              {title}
            </motion.h3>
          </div>

          <div className="shrink-0 px-5 sm:px-8 mt-5 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 max-w-5xl">
            <div className="font-mono-tech text-[11px] uppercase tracking-[0.22em]" style={{ color: C.brick }}>
              {subline}
            </div>
            <p className="max-w-md font-body text-sm sm:text-base leading-relaxed" style={{ color: "rgba(251,243,230,0.75)" }}>
              {description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export type EditorialStage = { n: string; t: string; d: string; side: "left" | "right" };

const studioStages: readonly EditorialStage[] = [
  { n: "01", t: "KEŞİF", d: "İşletmenin hikâyesi, ihtiyacı ve potansiyelini anlamak için başlangıçta dinler, gözlemler ve yerinde inceleriz.", side: "left" },
  { n: "02", t: "YÖN", d: "Doğru bar, ürün ve marka stratejisini birlikte netleştiririz. Nereye gideceğimizi belirleriz.", side: "right" },
  { n: "03", t: "GELİŞTİRME", d: "Reçeteler, menü, görsel dil ve bar düzeni üzerinde çalışır, prototipleri test ederiz.", side: "left" },
  { n: "04", t: "UYGULAMA", d: "Sahada kurar, ekibi eğitir ve açılıştan sonra deneyimi ayakta tutarız.", side: "right" },
];

function Stage({ n, t, d, side, reduceMotion }: EditorialStage & { reduceMotion: boolean }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const x = useTransform(scrollYProgress, [0, 0.5, 1], [side === "left" ? "-40vw" : "40vw", "0vw", "0vw"]);
  const opacity = useTransform(scrollYProgress, [0, 0.35, 0.75, 1], [0.2, 1, 1, 0.3]);

  return (
    <div ref={ref} className="business-process-stage relative min-h-[70vh] flex items-center">
      <motion.div style={{ x: reduceMotion ? 0 : x, opacity: reduceMotion ? 1 : opacity }} className={`px-5 sm:px-8 w-full ${side === "right" ? "sm:pl-[40vw]" : "sm:pr-[40vw]"}`}>
        <div className="flex items-baseline gap-5 sm:gap-8">
          <span className="font-display font-bold leading-none" style={{ color: C.brick, fontSize: "clamp(3rem, 8vw, 7rem)" }}>{n}</span>
          <h3 className="font-display uppercase font-bold leading-[0.9] tracking-[-0.03em]" style={{ color: C.cream, fontSize: "clamp(2.4rem, 9vw, 9rem)" }}>
            {t}
          </h3>
        </div>
        <p className={`mt-5 max-w-md font-body text-sm sm:text-base leading-relaxed ${side === "right" ? "sm:ml-auto" : ""}`} style={{ color: "rgba(251,243,230,0.7)" }}>
          {d}
        </p>
      </motion.div>
    </div>
  );
}

export function Process({
  reduceMotion,
  stages = studioStages,
  heading = <>BİZ NASIL<br />ÇALIŞIYORUZ?</>,
  sectionNumber = "06",
  label = "SÜREÇ",
}: {
  reduceMotion: boolean;
  stages?: readonly EditorialStage[];
  heading?: React.ReactNode;
  sectionNumber?: string;
  label?: string;
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const lineScaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="process" ref={ref} className="business-process relative bg-[#111111] py-24 sm:py-32 overflow-hidden grain">
      <div className="px-5 sm:px-8 mb-16 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / {sectionNumber}</span>
        <span>{label}</span>
      </div>
      <div className="px-5 sm:px-8 mb-24">
        <h2 className="font-display uppercase font-bold leading-[0.86] tracking-[-0.04em]" style={{ color: C.cream, fontSize: "clamp(2.6rem, 10vw, 10rem)" }}>
          {heading}
        </h2>
      </div>
      <div className="relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2" style={{ background: "rgba(201,74,64,0.15)" }}>
          <motion.div style={{ scaleY: reduceMotion ? 1 : lineScaleY, transformOrigin: "top", background: C.brick }} className="w-full h-full" />
        </div>
        <div className="flex flex-col">
          {stages.map((s) => <Stage key={s.n} {...s} reduceMotion={reduceMotion} />)}
        </div>
      </div>
    </section>
  );
}

const studioFirstLines = ["BİR KAHVE", "İŞLETMESİ", "KURUYORSUN?"];
const studioSecondLines = ["VAR OLANI", "DAHA İYİ", "HALE GETİRELİM."];
const studioMeta = ["ROSTA / STUDIO", "İST / TR", "KAHVE SİSTEMİ", "PROJE 001", "KUR. 2026"];

export function FinalCTA({
  reduceMotion,
  firstLines = studioFirstLines,
  secondLines = studioSecondLines,
  sectionNumber = "10",
  brand = "ROSTA.Studio",
  actionLabel = "PROJENİ ANLAT",
  actionHref = "mailto:studio@rosta.coffee",
  description,
  secondaryLink,
  meta = studioMeta,
}: {
  reduceMotion: boolean;
  firstLines?: readonly string[];
  secondLines?: readonly string[];
  sectionNumber?: string;
  brand?: string;
  actionLabel?: string;
  actionHref?: string;
  description?: string;
  secondaryLink?: EditorialLink;
  meta?: readonly string[];
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 100%", "end 100%"],
  });
  // Explicit end frames preserve the clamped reference curves on native ViewTimeline.
  const line1Y = useTransform(scrollYProgress, [0, 0.4, 1], ["40%", "0%", "0%"]);
  const line2Opacity = useTransform(scrollYProgress, [0, 0.3, 0.6, 1], [0, 0, 1, 1]);
  const line2Y = useTransform(scrollYProgress, [0, 0.3, 0.6, 1], ["30%", "30%", "0%", "0%"]);
  const ctaOpacity = useTransform(scrollYProgress, [0, 0.55, 0.85, 1], [0, 0, 1, 1]);
  const head = "font-display uppercase font-bold leading-[0.84] tracking-[-0.04em]";
  const big = { fontSize: "clamp(3rem, 13vw, 13rem)", color: C.cream };

  return (
    <section id="contact" ref={ref} className="relative bg-[#C94A40] studio-contact min-h-screen flex flex-col justify-center overflow-x-clip grain pb-12">
      <div className="px-5 sm:px-8 py-10 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: "rgba(251,243,230,0.7)" }}>
        <span>BÖLÜM / {sectionNumber}</span>
        <span>İLETİŞİM</span>
      </div>

      <div className="px-5 sm:px-8">
        <motion.div style={{ y: reduceMotion ? 0 : line1Y }}>
          {firstLines.map((line) => <h2 key={line} className={head} style={big}>{line}</h2>)}
        </motion.div>

        <motion.div style={{ opacity: reduceMotion ? 1 : line2Opacity, y: reduceMotion ? 0 : line2Y }} className="mt-8">
          {secondLines.map((line) => <h2 key={line} className={head} style={big}>{line}</h2>)}
        </motion.div>

        <motion.div style={{ opacity: reduceMotion ? 1 : ctaOpacity }} className="mt-14 sm:mt-20">
          <div className="font-mono-tech text-[11px] uppercase tracking-[0.22em] mb-3" style={{ color: "rgba(251,243,230,0.7)" }}>
            {brand}
          </div>
          {description ? <p className="business-contact-copy mb-6 max-w-2xl font-body text-base sm:text-lg leading-relaxed" style={{ color: C.cream }}>{description}</p> : null}
          <a
            href={actionHref}
            className="group inline-block font-display uppercase font-bold leading-[0.9] tracking-[-0.03em] relative"
            style={{ fontSize: "clamp(2.4rem, 9vw, 9rem)", color: C.cream }}
          >
            {actionLabel}{" "}
            <span className="studio-contact-arrow inline-block transition-transform duration-300 group-hover:translate-x-2 group-hover:-translate-y-2"><StudioArrow /></span>
            <span className="studio-contact-underline absolute left-0 -bottom-2 h-[3px] w-full origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out" style={{ background: C.cream }} />
          </a>
          {secondaryLink ? <a href={secondaryLink.href} className="business-inline-link mt-6 font-mono-tech text-xs uppercase tracking-wider" style={{ color: C.cream }}>{secondaryLink.label} <StudioArrow /></a> : null}

          <div className="mt-16 sm:mt-24 flex flex-col sm:flex-row flex-wrap gap-4 sm:gap-10 font-mono-tech text-[10px] uppercase tracking-[0.22em]" style={{ color: "rgba(251,243,230,0.7)" }}>
            {meta.map((item) => <span key={item}>{item}</span>)}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
