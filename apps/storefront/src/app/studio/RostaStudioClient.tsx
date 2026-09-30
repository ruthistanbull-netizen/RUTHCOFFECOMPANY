"use client";

import React, { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useScroll,
  useTransform,
  useVelocity,
  useSpring,
  useInView,
} from "framer-motion";
import { useOverlayBehavior, usePrefersReducedMotion } from "@ruth-commerce/ui";
import { ruthMotion } from "@ruth-commerce/ui/motion";

const C = {
  carbon: "#111111",
  cream: "#FBF3E6",
  brick: "#C94A40",
  kraft: "#C8A77D",
};

function StudioImage({ src, alt = "", className = "" }) {
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

function StudioArrow({ down = false }: { down?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="inline-block h-[0.75em] w-[0.75em]" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d={down ? "M4 4L20 20M4 20H20V4" : "M4 20L20 4M4 4H20V20"} />
    </svg>
  );
}

const navLinks = [
  { label: "STÜDYO", href: "#hero" },
  { label: "HİZMETLER", href: "#services" },
  { label: "SÜREÇ", href: "#process" },
  { label: "İLETİŞİM", href: "#contact" },
];

const menuLinks = [{ label: "ANASAYFA", href: "/" }, ...navLinks];

function Nav({ reduceMotion }: { reduceMotion: boolean }) {
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
              ROSTA<span className="text-[0.7em] align-top">.</span>Studio
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
            aria-label="Stüdyo menüsü"
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
                ROSTA.Studio
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
                    0{i + 1}
                  </span>
                  {l.label}
                </a>
              ))}
            </nav>

            <div className="mt-auto shrink-0 px-5 pb-8 font-mono-tech text-[10px] uppercase tracking-[0.2em]" style={{ color: C.kraft }}>
              İST/TR · KAHVE SİSTEMİ · KUR. 2026
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Hero({ reduceMotion }: { reduceMotion: boolean }) {
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
    <section id="hero" ref={ref} className="relative h-[180vh] bg-[#111111]">
      <div className="sticky top-0 h-screen overflow-hidden flex flex-col justify-center grain">
        <div
          className="absolute top-24 left-5 sm:left-8 right-5 sm:right-8 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]"
          style={{ color: C.kraft }}
        >
          <span>ROSTA / STUDIO</span>
          <span className="hidden sm:inline">KAHVE SİSTEMİ</span>
          <span>KUR. 2026</span>
        </div>

        <div className="relative w-full px-5 sm:px-8">
          <div className="overflow-hidden">
            <motion.div
              style={{ x: reduceMotion ? 0 : rostaX, ...headStyle }}
              className="font-display font-bold uppercase select-none"
            >
              ROSTA.
            </motion.div>
          </div>
          <div className="overflow-hidden -mt-[1.2vw]">
            <motion.div
              style={{ x: reduceMotion ? 0 : studioX, ...headStyle }}
              className="font-display font-bold uppercase select-none"
            >
              STUDIO
            </motion.div>
          </div>
        </div>

        <motion.div
          style={{ opacity: reduceMotion ? 1 : fade }}
          className="absolute bottom-28 left-5 sm:left-8 right-5 sm:right-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6"
        >
          <div className="font-mono-tech text-[11px] sm:text-xs uppercase tracking-[0.22em]" style={{ color: "rgba(251,243,230,0.8)" }}>
            KAHVE <span style={{ color: C.brick }}>/</span> İŞLETME <span style={{ color: C.brick }}>/</span> DENEYİM
          </div>
          <p className="max-w-md font-body text-sm sm:text-base leading-relaxed" style={{ color: "rgba(251,243,230,0.7)" }}>
            Kahve işletmelerini fikirden gerçek deneyime dönüştürüyoruz.
          </p>
        </motion.div>

        <motion.div style={{ opacity: reduceMotion ? 1 : fade }} className="absolute bottom-10 left-5 sm:left-8 right-5 sm:right-8 flex items-end justify-between">
          <a href="#contact" className="group font-display uppercase text-lg sm:text-xl tracking-tight" style={{ color: C.cream }}>
            BİRLİKTE ÇALIŞALIM{" "}
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

function MarqueeRow({ items, direction = -1, speed = 1, className = "", reduceMotion }) {
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

const Brick = ({ children }) => <span style={{ color: C.brick }}>{children}</span>;

function MarqueeOne({ reduceMotion }: { reduceMotion: boolean }) {
  const head = "font-display uppercase font-bold leading-[0.9] tracking-[-0.03em]";
  const size = "text-[12vw] sm:text-[10vw]";

  return (
    <section className="relative bg-[#111111] py-20 sm:py-28 grain">
      <div className="px-5 sm:px-8 mb-10 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / 02</span>
        <span>ROSTA.STUDIO</span>
      </div>
      <div className="flex flex-col gap-3 sm:gap-5" style={{ color: C.cream }}>
        <MarqueeRow
          reduceMotion={reduceMotion}
          direction={-1}
          className={`${head} ${size}`}
          items={[<>BAR KURULUMU</>, <Brick key="b1">—</Brick>, "BAR KURULUMU", <Brick key="b2">—</Brick>, "BAR KURULUMU", <Brick key="b3">—</Brick>]}
        />
        <MarqueeRow
          reduceMotion={reduceMotion}
          direction={1}
          className={`${head} ${size}`}
          items={["REÇETE", <Brick key="u1">ÜRÜN</Brick>, "MENÜ", <Brick key="d1">DENEYİM</Brick>, "REÇETE", <Brick key="u2">ÜRÜN</Brick>]}
        />
        <MarqueeRow
          reduceMotion={reduceMotion}
          direction={-1}
          className={`${head} ${size}`}
          items={[<Brick key="m1">MARKA</Brick>, "KONSEPT", "KAHVE", "MEKAN", <Brick key="m2">MARKA</Brick>]}
        />
      </div>
    </section>
  );
}

function WhoWeAre({ reduceMotion }: { reduceMotion: boolean }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const leftX = useTransform(scrollYProgress, [0, 0.45, 1], ["-110%", "0%", "0%"]);
  const rightX = useTransform(scrollYProgress, [0, 0.1, 0.55, 1], ["110%", "110%", "0%", "0%"]);
  const words = ["BAR.", "ÜRÜN.", "MARKA.", "DENEYİM."];

  return (
    <section ref={ref} className="relative bg-[#FBF3E6] py-28 sm:py-40 overflow-hidden">
      <div className="px-5 sm:px-8 mb-16 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / 03</span>
        <span>BİZ KİMİZ</span>
      </div>
      <div className="px-5 sm:px-8">
        <div className="overflow-hidden">
          <motion.h2 style={{ x: reduceMotion ? 0 : leftX }}>
            <span style={{ color: C.carbon, fontSize: "clamp(2rem, 6.4vw, 6.5rem)" }} className="font-display uppercase font-bold leading-[0.95] block">
              KAHVEYİ SADECE SERVİS EDİLEN
            </span>
          </motion.h2>
        </div>
        <div className="overflow-hidden">
          <motion.h2 style={{ x: reduceMotion ? 0 : rightX }}>
            <span style={{ color: C.carbon, fontSize: "clamp(2rem, 6.4vw, 6.5rem)" }} className="font-display uppercase font-bold leading-[0.95] block">
              BİR ÜRÜN OLARAK <span style={{ color: C.brick }}>GÖRMÜYORUZ.</span>
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
          ROSTA.Studio; kahve işletmelerinin ürününden servis akışına, marka dilinden bar sistemine kadar bütün deneyimini birlikte kurar.
        </p>
      </div>
    </section>
  );
}

function ServiceBlock({ index, title, subline, description, image, side = "left", reduceMotion }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const imgScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.6, 1, 1.05]);
  const imgWidth = useTransform(scrollYProgress, [0, 0.5, 1], ["60%", "100%", "100%"]);
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
        <span style={{ color: C.kraft }}>HİZMET / {num}</span>
      </motion.div>

      <div className="relative h-[160vh]">
        <div className="sticky top-0 h-screen flex flex-col justify-center overflow-hidden">
          <div className="studio-media-slot relative h-[42vh] sm:h-[60vh] w-full min-h-0">
            <motion.div
              style={{ width: reduceMotion ? "100%" : imgWidth, scale: reduceMotion ? 1 : imgScale, x: "-50%" }}
              className="studio-media-frame absolute left-1/2 top-0 h-full overflow-hidden"
            >
              <StudioImage src={image} alt="" className="w-full h-full" />
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

const services = [
  {
    title: <>MENÜ GELİŞTİRME<br />& KURGU</>,
    subline: "ÜRÜN KARMASI / MENÜ / DENEYİM",
    description: "İşletmenin konseptine ve misafir profiline uygun, mutfak ile barı aynı hikâyede buluşturan dengeli ve uygulanabilir menüler kurguluyoruz.",
  },
  {
    title: <>REÇETE &<br />ÜRÜN GELİŞTİRME</>,
    subline: "LEZZET / STANDART / YARATICILIK",
    description: "Markanın karakterini taşıyan yiyecek ve içecekler geliştiriyor; ölçüsü, tekniği ve sunumu net reçetelerle her serviste aynı kaliteyi hedefliyoruz.",
  },
  {
    title: <>MALİYETLENDİRME<br />& FİYATLANDIRMA</>,
    subline: "PORSİYON / MALİYET / KARLILIK",
    description: "Reçete ve porsiyon maliyetlerini hesaplıyor, fireyi görünür kılıyor ve işletmenin hedefleriyle uyumlu, sürdürülebilir satış fiyatları oluşturuyoruz.",
  },
  {
    title: <>BAR & MUTFAK<br />KURULUMU</>,
    subline: "YERLEŞİM / EKİPMAN / ALTYAPI",
    description: "Bar ve mutfağın yerleşimini, ekipmanını ve çalışma alanlarını birlikte planlıyor; üretimden servise hızlı, güvenli ve verimli bir düzen kuruyoruz.",
  },
  {
    title: <>KAHVE<br />PROGRAMI</>,
    subline: "ÇEKİRDEK / DEMLEME / KALİTE",
    description: "Çekirdek seçiminden espresso ve demleme reçetelerine, ekipman ayarından kalite takibine kadar işletmeye özel bir kahve programı oluşturuyoruz.",
  },
  {
    title: <>OPERASYON &<br />İŞ AKIŞI</>,
    subline: "HAZIRLIK / SERVİS / DÜZEN",
    description: "Hazırlık, üretim, servis ve kapanış adımlarını netleştiriyor; görev dağılımı ve çalışma standartlarıyla günlük operasyonu daha akıcı hâle getiriyoruz.",
  },
  {
    title: <>PERSONEL<br />EĞİTİMİ</>,
    subline: "TEKNİK / SERVİS / EKİP",
    description: "Ekibi kahve, ürün hazırlama, hijyen ve servis konusunda sahada eğitiyor; bilgiyi günlük pratiğe taşıyan ortak bir çalışma dili oluşturuyoruz.",
  },
  {
    title: <>TEDARİK & EKİPMAN<br />DANIŞMANLIĞI</>,
    subline: "İHTİYAÇ / SEÇİM / TEDARİK",
    description: "İşletmenin kapasitesine ve bütçesine uygun ürün, ekipman ve tedarikçileri değerlendiriyor; satın alma ve tedarik kararlarını gerçek ihtiyaçlarla eşleştiriyoruz.",
  },
  {
    title: <>MARKA & KONSEPT<br />GELİŞTİRME</>,
    subline: "KİMLİK / MEKÂN / DENEYİM",
    description: "Markanın konumunu, dilini ve konseptini netleştiriyor; menü, mekân ve servis deneyiminin aynı karakteri taşımasını sağlıyoruz.",
  },
  {
    title: <>AÇILIŞ & YENİDEN<br />YAPILANDIRMA</>,
    subline: "PLANLAMA / AÇILIŞ / DÖNÜŞÜM",
    description: "Yeni işletmelerde açılış hazırlığını uçtan uca planlıyor; mevcut işletmelerde ürün, ekip ve operasyonu inceleyerek gelişim adımlarını birlikte uyguluyoruz.",
  },
];

const serviceImages = [
  "https://media.base44.com/images/public/6abc5148a8d8f7bdd9a2ee6f/70c0e45c9_generated_e8a15d6f.jpg",
  "https://media.base44.com/images/public/6abc5148a8d8f7bdd9a2ee6f/87ba1f368_generated_5cb9b9d2.jpg",
  "https://media.base44.com/images/public/6abc5148a8d8f7bdd9a2ee6f/e11718cca_generated_42ef871f.jpg",
];

function Services({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <section id="services" className="relative bg-[#111111] grain">
      <div className="px-5 sm:px-8 py-10 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / 04</span>
        <span>HİZMETLER</span>
      </div>
      {services.map((service, i) => (
        <ServiceBlock
          key={service.subline}
          index={i + 1}
          side={i % 2 === 0 ? "left" : "right"}
          {...service}
          reduceMotion={reduceMotion}
          image={serviceImages[i % serviceImages.length]}
        />
      ))}
    </section>
  );
}

function StreetText({ reduceMotion }: { reduceMotion: boolean }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const leftX = useTransform(scrollYProgress, [0, 1], ["10vw", "-25vw"]);
  const rightX = useTransform(scrollYProgress, [0, 1], ["-10vw", "20vw"]);
  const midX = useTransform(scrollYProgress, [0, 1], ["-8vw", "12vw"]);
  const line = "font-display uppercase font-bold leading-[0.82] tracking-[-0.04em]";
  const size = { fontSize: "clamp(3rem, 13vw, 13rem)", color: C.cream };

  return (
    <section ref={ref} className="relative bg-[#111111] py-28 sm:py-40 overflow-hidden grain">
      <div className="px-5 sm:px-8 mb-12 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / 05</span>
        <span>ROSTA / MANİFESTO</span>
      </div>
      <div className="pl-[6vw]">
        <motion.div style={{ x: reduceMotion ? 0 : leftX }} className={line}>
          <span style={size}>İYİ KAHVE</span>
        </motion.div>
        <motion.div style={{ x: reduceMotion ? 0 : rightX }} className={`${line} pl-[18vw]`}>
          <span style={size}>SADECE</span>
        </motion.div>
        <motion.div style={{ x: reduceMotion ? 0 : midX }} className={`${line} pl-[4vw]`}>
          <span style={size}><span style={{ color: C.brick }}>BAŞLANGIÇ.</span></span>
        </motion.div>
      </div>
    </section>
  );
}

const stages = [
  { n: "01", t: "KEŞİF", d: "İşletmenin hikâyesi, ihtiyacı ve potansiyelini anlamak için başlangıçta dinler, gözlemler ve yerinde inceleriz.", side: "left" },
  { n: "02", t: "YÖN", d: "Doğru bar, ürün ve marka stratejisini birlikte netleştiririz. Nereye gideceğimizi belirleriz.", side: "right" },
  { n: "03", t: "GELİŞTİRME", d: "Reçeteler, menü, görsel dil ve bar düzeni üzerinde çalışır, prototipleri test ederiz.", side: "left" },
  { n: "04", t: "UYGULAMA", d: "Sahada kurar, ekibi eğitir ve açılıştan sonra deneyimi ayakta tutarız.", side: "right" },
];

function Stage({ n, t, d, side, reduceMotion }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const x = useTransform(scrollYProgress, [0, 0.5, 1], [side === "left" ? "-40vw" : "40vw", "0vw", "0vw"]);
  const opacity = useTransform(scrollYProgress, [0, 0.35, 0.75, 1], [0.2, 1, 1, 0.3]);

  return (
    <div ref={ref} className="relative min-h-[70vh] flex items-center">
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

function Process({ reduceMotion }: { reduceMotion: boolean }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const lineScaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="process" ref={ref} className="relative bg-[#111111] py-24 sm:py-32 overflow-hidden grain">
      <div className="px-5 sm:px-8 mb-16 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / 06</span>
        <span>SÜREÇ</span>
      </div>
      <div className="px-5 sm:px-8 mb-24">
        <h2 className="font-display uppercase font-bold leading-[0.86] tracking-[-0.04em]" style={{ color: C.cream, fontSize: "clamp(2.6rem, 10vw, 10rem)" }}>
          BİZ NASIL<br />ÇALIŞIYORUZ?
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

function BigImage({ reduceMotion }: { reduceMotion: boolean }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const width = useTransform(scrollYProgress, [0, 0.1, 0.5, 1], ["60%", "60%", "100%", "100%"]);
  const scale = useTransform(scrollYProgress, [0, 0.1, 0.5, 1], [1, 1, 1.08, 1.08]);
  const cornerOpacity = useTransform(scrollYProgress, [0, 0.4, 0.6, 1], [0, 0, 1, 1]);
  const corner = "absolute font-mono-tech text-[10px] uppercase tracking-[0.25em]";

  return (
    <section ref={ref} className="relative h-[200vh] bg-[#111111]">
      <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden grain">
        <div className="studio-media-slot relative h-[70vh] sm:h-[88vh] w-full">
        <motion.div style={{ width: reduceMotion ? "100%" : width, scale: reduceMotion ? 1 : scale, x: "-50%" }} className="studio-media-frame absolute left-1/2 top-0 h-full overflow-hidden">
          <StudioImage
            src="https://media.base44.com/images/public/6abc5148a8d8f7bdd9a2ee6f/ee0e38c8f_generated_5fe6b1a5.jpg"
            alt="ROSTA.Studio kahve barı çalışma akışı"
            className="w-full h-full"
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(17,17,17,0.25), rgba(17,17,17,0.45))" }} />
          <motion.div style={{ opacity: reduceMotion ? 1 : cornerOpacity }}>
            <div className={corner} style={{ color: C.cream, top: "1.2rem", left: "1.2rem" }}>ROSTA.STUDIO</div>
            <div className={corner} style={{ color: C.cream, top: "1.2rem", right: "1.2rem" }}>İSTANBUL</div>
            <div className={corner} style={{ color: C.cream, bottom: "1.2rem", left: "1.2rem" }}>KAHVE / MARKA / İŞLETME</div>
            <div className={corner} style={{ color: C.cream, bottom: "1.2rem", right: "1.2rem" }}>KUR. 2026</div>
          </motion.div>
        </motion.div>
        </div>
      </div>
    </section>
  );
}

const phrases = [
  { word: "İŞLEVSEL.", sub: "Her karar çalışmayı kolaylaştırmak için alınır.", side: "left" },
  { word: "KARAKTERLİ.", sub: "Marka, tekrar edilebilir bir karaktere sahip olmalı.", side: "right" },
  { word: "SADE.", sub: "Gereksiz hiçbir şey sahnede kalmaz.", side: "left" },
];

function Phrase({ word, sub, side, index, reduceMotion }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const x = useTransform(scrollYProgress, [0, 0.5, 1], [side === "left" ? "-70vw" : "70vw", "0vw", "0vw"]);
  const opacity = useTransform(scrollYProgress, [0, 0.4, 0.7, 1], [0, 1, 1, 0]);

  return (
    <div ref={ref} className="relative h-[90vh] flex items-center overflow-hidden">
      <motion.div style={{ x: reduceMotion ? 0 : x, opacity: reduceMotion ? 1 : opacity }} className="px-5 sm:px-8 w-full">
        <div className="font-mono-tech text-[10px] uppercase tracking-[0.25em] mb-3" style={{ color: C.brick }}>
          İLKE / 0{index + 1}
        </div>
        <h2
          className="font-display uppercase font-bold leading-[0.84] tracking-[-0.04em]"
          style={{ color: C.cream, fontSize: "clamp(3.5rem, 18vw, 18rem)" }}
        >
          {word}
        </h2>
        <p className="mt-5 max-w-sm font-body text-sm sm:text-base" style={{ color: "rgba(251,243,230,0.65)" }}>
          {sub}
        </p>
      </motion.div>
    </div>
  );
}

function Principles({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <section className="relative bg-[#111111] grain">
      <div className="px-5 sm:px-8 py-10 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / 08</span>
        <span>ROSTA İLKELERİ</span>
      </div>
      {phrases.map((p, i) => <Phrase key={p.word} {...p} index={i} reduceMotion={reduceMotion} />)}
    </section>
  );
}

function MarqueeTwo({ reduceMotion }: { reduceMotion: boolean }) {
  const head = "font-display uppercase font-bold leading-[0.9] tracking-[-0.03em]";
  const size = "text-[7vw] sm:text-[6vw]";

  return (
    <section className="relative bg-[#111111] py-16 sm:py-20 grain border-y" style={{ borderColor: "rgba(251,243,230,0.08)" }}>
      <div className="flex flex-col gap-2 sm:gap-3" style={{ color: C.cream }}>
        <MarqueeRow
          reduceMotion={reduceMotion}
          direction={-1}
          speed={1.6}
          className={`${head} ${size}`}
          items={["KAHVE", <Brick key="s1">/</Brick>, "İŞLETME", <Brick key="s2">/</Brick>, "MARKA", <Brick key="s3">/</Brick>, "BAR", <Brick key="s4">/</Brick>, "MENÜ", <Brick key="s5">/</Brick>, "DENEYİM", <Brick key="s6">/</Brick>]}
        />
        <MarqueeRow
          reduceMotion={reduceMotion}
          direction={1}
          speed={1.6}
          className={`${head} ${size}`}
          items={["ROSTA.STUDIO", <Brick key="t1">—</Brick>, "İSTANBUL", <Brick key="t2">—</Brick>, "ROSTA.STUDIO", <Brick key="t3">—</Brick>, "İSTANBUL", <Brick key="t4">—</Brick>]}
        />
      </div>
    </section>
  );
}

function FinalCTA({ reduceMotion }: { reduceMotion: boolean }) {
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
        <span>BÖLÜM / 10</span>
        <span>İLETİŞİM</span>
      </div>

      <div className="px-5 sm:px-8">
        <motion.div style={{ y: reduceMotion ? 0 : line1Y }}>
          <h2 className={head} style={big}>BİR KAHVE</h2>
          <h2 className={head} style={big}>İŞLETMESİ</h2>
          <h2 className={head} style={big}>KURUYORSUN?</h2>
        </motion.div>

        <motion.div style={{ opacity: reduceMotion ? 1 : line2Opacity, y: reduceMotion ? 0 : line2Y }} className="mt-8">
          <h2 className={head} style={big}>VAR OLANI</h2>
          <h2 className={head} style={big}>DAHA İYİ</h2>
          <h2 className={head} style={big}>HALE GETİRELİM.</h2>
        </motion.div>

        <motion.div style={{ opacity: reduceMotion ? 1 : ctaOpacity }} className="mt-14 sm:mt-20">
          <div className="font-mono-tech text-[11px] uppercase tracking-[0.22em] mb-3" style={{ color: "rgba(251,243,230,0.7)" }}>
            ROSTA.Studio
          </div>
          <a
            href="mailto:studio@rosta.coffee"
            className="group inline-block font-display uppercase font-bold leading-[0.9] tracking-[-0.03em] relative"
            style={{ fontSize: "clamp(2.4rem, 9vw, 9rem)", color: C.cream }}
          >
            PROJENİ ANLAT{" "}
            <span className="studio-contact-arrow inline-block transition-transform duration-300 group-hover:translate-x-2 group-hover:-translate-y-2"><StudioArrow /></span>
            <span className="studio-contact-underline absolute left-0 -bottom-2 h-[3px] w-full origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out" style={{ background: C.cream }} />
          </a>

          <div className="mt-16 sm:mt-24 flex flex-col sm:flex-row flex-wrap gap-4 sm:gap-10 font-mono-tech text-[10px] uppercase tracking-[0.22em]" style={{ color: "rgba(251,243,230,0.7)" }}>
            <span>ROSTA / STUDIO</span>
            <span>İST / TR</span>
            <span>KAHVE SİSTEMİ</span>
            <span>PROJE 001</span>
            <span>KUR. 2026</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export function RostaStudioClient() {
  const reduceMotion = usePrefersReducedMotion();

  return (
    <main className="rosta-studio-exact bg-[#111111]">
      <Nav reduceMotion={reduceMotion} />
      <Hero reduceMotion={reduceMotion} />
      <MarqueeOne reduceMotion={reduceMotion} />
      <WhoWeAre reduceMotion={reduceMotion} />
      <Services reduceMotion={reduceMotion} />
      <StreetText reduceMotion={reduceMotion} />
      <Process reduceMotion={reduceMotion} />
      <BigImage reduceMotion={reduceMotion} />
      <Principles reduceMotion={reduceMotion} />
      <MarqueeTwo reduceMotion={reduceMotion} />
      <FinalCTA reduceMotion={reduceMotion} />
    </main>
  );
}
