"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "framer-motion";

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

const navLinks = [
  { label: "STÜDYO", href: "#hero" },
  { label: "HİZMETLER", href: "#services" },
  { label: "SÜREÇ", href: "#process" },
  { label: "İLETİŞİM", href: "#contact" },
];

function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50"
        style={{ mixBlendMode: "difference" }}
      >
        <div className="flex items-center justify-between px-5 sm:px-8 py-5">
          <a
            href="#hero"
            className="font-display font-bold uppercase tracking-tight text-lg sm:text-xl leading-none"
            style={{ color: C.cream }}
          >
            ROSTA<span className="text-[0.7em] align-top">.</span>Studio
          </a>

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

          <button
            type="button"
            aria-label="Menü"
            onClick={() => setOpen(true)}
            className="md:hidden flex flex-col gap-[5px] p-1"
          >
            <span className="block w-6 h-[2px]" style={{ background: C.cream }} />
            <span className="block w-6 h-[2px]" style={{ background: C.cream }} />
            <span className="block w-4 h-[2px] ml-auto" style={{ background: C.cream }} />
          </button>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[160] bg-[#111111] flex flex-col md:hidden"
          >
            <div className="flex items-center justify-between px-5 py-5">
              <span className="font-display font-bold uppercase text-lg" style={{ color: C.cream }}>
                ROSTA.Studio
              </span>
              <button type="button" aria-label="Kapat" onClick={() => setOpen(false)} className="p-2">
                <span className="block w-7 h-[2px] rotate-45" style={{ background: C.cream }} />
                <span className="block w-7 h-[2px] -rotate-45 -mt-[2px]" style={{ background: C.cream }} />
              </button>
            </div>

            <nav className="flex flex-col px-5 mt-10 gap-1">
              {navLinks.map((l, i) => (
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

            <div className="mt-auto px-5 pb-8 font-mono-tech text-[10px] uppercase tracking-[0.2em]" style={{ color: C.kraft }}>
              İST/TR · KAHVE SİSTEMİ · KUR. 2026
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Hero() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const rostaX = useTransform(scrollYProgress, [0, 1], ["0vw", "-65vw"]);
  const studioX = useTransform(scrollYProgress, [0, 1], ["0vw", "65vw"]);
  const fade = useTransform(scrollYProgress, [0, 0.55], [1, 0]);
  const lineScale = useTransform(scrollYProgress, [0, 1], [1, 0]);

  const headStyle = {
    color: C.cream,
    fontSize: "clamp(4.5rem, 21vw, 21rem)",
    lineHeight: 0.82,
    letterSpacing: "-0.04em",
  };

  return (
    <section id="hero" ref={ref} className="relative h-[150vh] bg-[#111111]">
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
              style={{ x: rostaX, ...headStyle }}
              className="font-display font-bold uppercase select-none"
            >
              ROSTA.
            </motion.div>
          </div>
          <div className="overflow-hidden -mt-[1.2vw]">
            <motion.div
              style={{ x: studioX, ...headStyle }}
              className="font-display font-bold uppercase select-none"
            >
              STUDIO
            </motion.div>
          </div>
        </div>

        <motion.div
          style={{ opacity: fade }}
          className="absolute bottom-28 left-5 sm:left-8 right-5 sm:right-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6"
        >
          <div className="font-mono-tech text-[11px] sm:text-xs uppercase tracking-[0.22em]" style={{ color: "rgba(251,243,230,0.8)" }}>
            KAHVE <span style={{ color: C.brick }}>/</span> İŞLETME <span style={{ color: C.brick }}>/</span> DENEYİM
          </div>
          <p className="max-w-md font-body text-sm sm:text-base leading-relaxed" style={{ color: "rgba(251,243,230,0.7)" }}>
            Kahve işletmelerini fikirden gerçek deneyime dönüştürüyoruz.
          </p>
        </motion.div>

        <motion.div style={{ opacity: fade }} className="absolute bottom-10 left-5 sm:left-8 right-5 sm:right-8 flex items-end justify-between">
          <a href="#contact" className="group font-display uppercase text-lg sm:text-xl tracking-tight" style={{ color: C.cream }}>
            BİRLİKTE ÇALIŞALIM{" "}
            <span className="inline-block group-hover:translate-x-1 group-hover:-translate-y-[2px] transition-transform" style={{ color: C.brick }}>↘</span>
          </a>
          <div className="hidden sm:block w-24 h-[2px] overflow-hidden" style={{ background: "rgba(251,243,230,0.2)" }}>
            <motion.div style={{ scaleX: lineScale, transformOrigin: "left", background: C.brick }} className="w-full h-full" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function MarqueeRow({ items, direction = -1, speed = 1, className = "" }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const rawVelocity = useVelocity(scrollYProgress);
  const smoothVel = useSpring(rawVelocity, { stiffness: 80, damping: 20 });
  const skew = useTransform(smoothVel, [-2, 2], [5, -5]);
  const row = [...items, ...items];
  const duration = `${24 / speed}s`;
  const animName = direction === -1 ? "rosta-marquee-left" : "rosta-marquee-right";

  return (
    <div ref={ref} className={`overflow-hidden whitespace-nowrap ${className}`}>
      <motion.div style={{ skew }}>
        <div
          className="rosta-marquee inline-flex"
          style={{ animation: `${animName} ${duration} linear infinite` }}
        >
          {row.map((it, i) => (
            <span key={i} className="mx-5 sm:mx-8">
              {it}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

const Brick = ({ children }) => <span style={{ color: C.brick }}>{children}</span>;

function MarqueeOne() {
  const head = "font-display uppercase font-bold leading-[0.9] tracking-[-0.03em]";
  const size = "text-[12vw] sm:text-[10vw]";

  return (
    <section className="relative bg-[#111111] py-14 sm:py-20 grain">
      <div className="px-5 sm:px-8 mb-7 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / 02</span>
        <span>ROSTA.STUDIO</span>
      </div>
      <div className="flex flex-col gap-3 sm:gap-5" style={{ color: C.cream }}>
        <MarqueeRow
          direction={-1}
          className={`${head} ${size}`}
          items={[<>BAR KURULUMU</>, <Brick key="b1">—</Brick>, "BAR KURULUMU", <Brick key="b2">—</Brick>, "BAR KURULUMU", <Brick key="b3">—</Brick>]}
        />
        <MarqueeRow
          direction={1}
          className={`${head} ${size}`}
          items={["REÇETE", <Brick key="u1">ÜRÜN</Brick>, "MENÜ", <Brick key="d1">DENEYİM</Brick>, "REÇETE", <Brick key="u2">ÜRÜN</Brick>]}
        />
        <MarqueeRow
          direction={-1}
          className={`${head} ${size}`}
          items={[<Brick key="m1">MARKA</Brick>, "KONSEPT", "KAHVE", "MEKAN", <Brick key="m2">MARKA</Brick>]}
        />
      </div>
    </section>
  );
}

function WhoWeAre() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const leftX = useTransform(scrollYProgress, [0, 0.45], ["-110%", "0%"]);
  const rightX = useTransform(scrollYProgress, [0.1, 0.55], ["110%", "0%"]);
  const words = ["BAR.", "ÜRÜN.", "MARKA.", "DENEYİM."];

  return (
    <section ref={ref} className="relative bg-[#FBF3E6] py-20 sm:py-28 overflow-hidden">
      <div className="px-5 sm:px-8 mb-10 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / 03</span>
        <span>BİZ KİMİZ</span>
      </div>
      <div className="px-5 sm:px-8">
        <div className="overflow-hidden">
          <motion.h2 style={{ x: leftX }}>
            <span style={{ color: C.carbon, fontSize: "clamp(2rem, 6.4vw, 6.5rem)" }} className="font-display uppercase font-bold leading-[0.95] block">
              KAHVEYİ SADECE SERVİS EDİLEN
            </span>
          </motion.h2>
        </div>
        <div className="overflow-hidden">
          <motion.h2 style={{ x: rightX }}>
            <span style={{ color: C.carbon, fontSize: "clamp(2rem, 6.4vw, 6.5rem)" }} className="font-display uppercase font-bold leading-[0.95] block">
              BİR ÜRÜN OLARAK <span style={{ color: C.brick }}>GÖRMÜYORUZ.</span>
            </span>
          </motion.h2>
        </div>

        <div className="mt-10 sm:mt-16 grid grid-cols-2 sm:grid-cols-4 gap-y-8 gap-x-4">
          {words.map((w, i) => (
            <motion.div
              key={w}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="font-display uppercase font-bold leading-none tracking-[-0.03em]"
              style={{ color: C.carbon, fontSize: "clamp(2.5rem, 7vw, 6rem)" }}
            >
              {w}
            </motion.div>
          ))}
        </div>

        <p className="mt-10 sm:mt-16 max-w-2xl font-body text-base sm:text-lg leading-relaxed" style={{ color: C.carbon }}>
          ROSTA.Studio; kahve işletmelerinin ürününden servis akışına, marka dilinden bar sistemine kadar bütün deneyimini birlikte kurar.
        </p>
      </div>
    </section>
  );
}

function ServiceBlock({ index, title, subline, description, image, side = "left" }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const imgScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.6, 1, 1.05]);
  const imgWidth = useTransform(scrollYProgress, [0, 0.5], ["60%", "100%"]);
  const titleX = useTransform(
    scrollYProgress,
    [0, 0.5],
    [side === "left" ? "-60vw" : "60vw", "0vw"],
  );
  const numOpacity = useTransform(scrollYProgress, [0, 0.3, 0.8, 1], [0.2, 1, 1, 0.3]);
  const num = `0${index}`;

  return (
    <div ref={ref} className="relative">
      <motion.div
        style={{ opacity: numOpacity }}
        className="absolute top-6 left-5 sm:left-8 font-mono-tech text-[10px] uppercase tracking-[0.25em] z-20"
      >
        <span style={{ color: C.kraft }}>HİZMET / {num}</span>
      </motion.div>

      <div className="relative h-[130vh]">
        <div className="sticky top-0 h-screen flex flex-col justify-center overflow-hidden">
          <div className="absolute top-1/2 -translate-y-1/2 left-5 sm:left-8 pointer-events-none">
            <span
              className="font-display font-bold leading-none"
              style={{ color: "rgba(201,74,64,0.14)", fontSize: "clamp(12rem, 40vw, 38rem)" }}
            >
              {num}
            </span>
          </div>

          <motion.div
            style={{ width: imgWidth, scale: imgScale }}
            className="relative h-[42vh] sm:h-[60vh] mx-auto overflow-hidden self-center"
          >
            <StudioImage src={image} alt="" className="w-full h-full" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(17,17,17,0.15), rgba(17,17,17,0.55))" }} />
          </motion.div>

          <motion.div style={{ x: titleX }} className="px-5 sm:px-8 mt-6 sm:mt-8">
            <h3
              className="font-display uppercase font-bold leading-[0.86] tracking-[-0.04em]"
              style={{ color: C.cream, fontSize: "clamp(2.8rem, 11vw, 11rem)" }}
            >
              {title}
            </h3>
          </motion.div>

          <div className="px-5 sm:px-8 mt-4 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 max-w-5xl">
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

function Services() {
  return (
    <section id="services" className="relative bg-[#111111] grain">
      <div className="px-5 sm:px-8 py-7 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / 04</span>
        <span>HİZMETLER</span>
      </div>

      <ServiceBlock
        index={1}
        side="left"
        title={<>BAR<br />KURULUMU</>}
        subline="AKIŞ / EKİPMAN / ÇALIŞMA ALANI"
        description="Bar akışını, ekipmanı ve çalışma düzenini işletmenin gerçek ihtiyaçlarına göre oluşturuyoruz."
        image="https://media.base44.com/images/public/6abc5148a8d8f7bdd9a2ee6f/70c0e45c9_generated_e8a15d6f.jpg"
      />
      <ServiceBlock
        index={2}
        side="right"
        title={<>REÇETE &<br />ÜRÜN GELİŞTİRME</>}
        subline="KAHVE / İÇECEK / MENÜ"
        description="Menüyü doldurmak yerine markanın karakterini taşıyan ürünler geliştiriyoruz."
        image="https://media.base44.com/images/public/6abc5148a8d8f7bdd9a2ee6f/87ba1f368_generated_5cb9b9d2.jpg"
      />
      <ServiceBlock
        index={3}
        side="left"
        title={<>MARKA &<br />KONSEPT</>}
        subline="KİMLİK / MEKÂN / DENEYİM"
        description="İsimden görsel dile, menüden müşterinin mekânda hissettiği deneyime kadar bütün yapıyı birlikte tasarlıyoruz."
        image="https://media.base44.com/images/public/6abc5148a8d8f7bdd9a2ee6f/e11718cca_generated_42ef871f.jpg"
      />
    </section>
  );
}

function StreetText() {
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
    <section ref={ref} className="relative bg-[#111111] py-20 sm:py-28 overflow-hidden grain">
      <div className="px-5 sm:px-8 mb-8 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / 05</span>
        <span>ROSTA / MANİFESTO</span>
      </div>
      <div className="pl-[6vw]">
        <motion.div style={{ x: leftX }} className={line}>
          <span style={size}>İYİ KAHVE</span>
        </motion.div>
        <motion.div style={{ x: rightX }} className={`${line} pl-[18vw]`}>
          <span style={size}>SADECE</span>
        </motion.div>
        <motion.div style={{ x: midX }} className={`${line} pl-[4vw]`}>
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

function Stage({ n, t, d, side }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const x = useTransform(scrollYProgress, [0, 0.5], [side === "left" ? "-40vw" : "40vw", "0vw"]);
  const opacity = useTransform(scrollYProgress, [0, 0.35, 0.75, 1], [0.2, 1, 1, 0.3]);

  return (
    <div ref={ref} className="relative min-h-[52vh] sm:min-h-[58vh] flex items-center">
      <motion.div style={{ x, opacity }} className={`px-5 sm:px-8 w-full ${side === "right" ? "sm:pl-[40vw]" : "sm:pr-[40vw]"}`}>
        <div className="flex items-baseline gap-5 sm:gap-8">
          <span className="font-display font-bold leading-none" style={{ color: C.brick, fontSize: "clamp(3rem, 8vw, 7rem)" }}>{n}</span>
          <h3 className="font-display uppercase font-bold leading-[0.9] tracking-[-0.03em]" style={{ color: C.cream, fontSize: "clamp(2.4rem, 9vw, 9rem)" }}>
            {t}
          </h3>
        </div>
        <p className={`mt-4 max-w-md font-body text-sm sm:text-base leading-relaxed ${side === "right" ? "sm:ml-auto" : ""}`} style={{ color: "rgba(251,243,230,0.7)" }}>
          {d}
        </p>
      </motion.div>
    </div>
  );
}

function Process() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const lineScaleY = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section id="process" ref={ref} className="relative bg-[#111111] py-20 sm:py-24 overflow-hidden grain">
      <div className="px-5 sm:px-8 mb-10 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / 06</span>
        <span>SÜREÇ</span>
      </div>
      <div className="px-5 sm:px-8 mb-14 sm:mb-16">
        <h2 className="font-display uppercase font-bold leading-[0.86] tracking-[-0.04em]" style={{ color: C.cream, fontSize: "clamp(2.6rem, 10vw, 10rem)" }}>
          BİZ NASIL<br />ÇALIŞIYORUZ?
        </h2>
      </div>
      <div className="relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2" style={{ background: "rgba(201,74,64,0.15)" }}>
          <motion.div style={{ scaleY: lineScaleY, transformOrigin: "top", background: C.brick }} className="w-full h-full" />
        </div>
        <div className="flex flex-col">
          {stages.map((s) => <Stage key={s.n} {...s} />)}
        </div>
      </div>
    </section>
  );
}

function BigImage() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const width = useTransform(scrollYProgress, [0.1, 0.5], ["60%", "100%"]);
  const scale = useTransform(scrollYProgress, [0.1, 0.5], [1, 1.08]);
  const cornerOpacity = useTransform(scrollYProgress, [0.4, 0.6], [0, 1]);
  const corner = "absolute font-mono-tech text-[10px] uppercase tracking-[0.25em]";

  return (
    <section ref={ref} className="relative h-[150vh] bg-[#111111]">
      <div className="sticky top-0 h-screen flex items-center justify-center overflow-hidden grain">
        <motion.div style={{ width, scale }} className="relative h-[62vh] sm:h-[82vh] overflow-hidden">
          <StudioImage
            src="https://media.base44.com/images/public/6abc5148a8d8f7bdd9a2ee6f/ee0e38c8f_generated_5fe6b1a5.jpg"
            alt="ROSTA.Studio kahve barı çalışma akışı"
            className="w-full h-full"
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(17,17,17,0.25), rgba(17,17,17,0.45))" }} />
          <motion.div style={{ opacity: cornerOpacity }}>
            <div className={corner} style={{ color: C.cream, top: "1.2rem", left: "1.2rem" }}>ROSTA.STUDIO</div>
            <div className={corner} style={{ color: C.cream, top: "1.2rem", right: "1.2rem" }}>İSTANBUL</div>
            <div className={corner} style={{ color: C.cream, bottom: "1.2rem", left: "1.2rem" }}>KAHVE / MARKA / İŞLETME</div>
            <div className={corner} style={{ color: C.cream, bottom: "1.2rem", right: "1.2rem" }}>KUR. 2026</div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

const phrases = [
  { word: "İŞLEVSEL.", sub: "Her karar çalışmayı kolaylaştırmak için alınır.", side: "left" },
  { word: "KARAKTERLİ.", sub: "Marka, tekrar edilebilir bir karaktere sahip olmalı.", side: "right" },
  { word: "SADE.", sub: "Gereksiz hiçbir şey sahnede kalmaz.", side: "left" },
];

function Phrase({ word, sub, side, index }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const x = useTransform(scrollYProgress, [0, 0.5], [side === "left" ? "-70vw" : "70vw", "0vw"]);
  const opacity = useTransform(scrollYProgress, [0, 0.4, 0.7, 1], [0, 1, 1, 0]);

  return (
    <div ref={ref} className="relative h-[65vh] sm:h-[72vh] flex items-center overflow-hidden">
      <motion.div style={{ x, opacity }} className="px-5 sm:px-8 w-full">
        <div className="font-mono-tech text-[10px] uppercase tracking-[0.25em] mb-3" style={{ color: C.brick }}>
          İLKE / 0{index + 1}
        </div>
        <h2
          className="font-display uppercase font-bold leading-[0.84] tracking-[-0.04em]"
          style={{ color: C.cream, fontSize: "clamp(3.5rem, 18vw, 18rem)" }}
        >
          {word}
        </h2>
        <p className="mt-4 max-w-sm font-body text-sm sm:text-base" style={{ color: "rgba(251,243,230,0.65)" }}>
          {sub}
        </p>
      </motion.div>
    </div>
  );
}

function Principles() {
  return (
    <section className="relative bg-[#111111] grain">
      <div className="px-5 sm:px-8 py-7 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: C.kraft }}>
        <span>BÖLÜM / 08</span>
        <span>ROSTA İLKELERİ</span>
      </div>
      {phrases.map((p, i) => <Phrase key={p.word} {...p} index={i} />)}
    </section>
  );
}

function MarqueeTwo() {
  const head = "font-display uppercase font-bold leading-[0.9] tracking-[-0.03em]";
  const size = "text-[7vw] sm:text-[6vw]";

  return (
    <section className="relative bg-[#111111] py-12 sm:py-16 grain border-y" style={{ borderColor: "rgba(251,243,230,0.08)" }}>
      <div className="flex flex-col gap-2 sm:gap-3" style={{ color: C.cream }}>
        <MarqueeRow
          direction={-1}
          speed={1.6}
          className={`${head} ${size}`}
          items={["KAHVE", <Brick key="s1">/</Brick>, "İŞLETME", <Brick key="s2">/</Brick>, "MARKA", <Brick key="s3">/</Brick>, "BAR", <Brick key="s4">/</Brick>, "MENÜ", <Brick key="s5">/</Brick>, "DENEYİM", <Brick key="s6">/</Brick>]}
        />
        <MarqueeRow
          direction={1}
          speed={1.6}
          className={`${head} ${size}`}
          items={["ROSTA.STUDIO", <Brick key="t1">—</Brick>, "İSTANBUL", <Brick key="t2">—</Brick>, "ROSTA.STUDIO", <Brick key="t3">—</Brick>, "İSTANBUL", <Brick key="t4">—</Brick>]}
        />
      </div>
    </section>
  );
}

function FinalCTA() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end end"],
  });
  const line1Y = useTransform(scrollYProgress, [0, 0.4], ["40%", "0%"]);
  const line2Opacity = useTransform(scrollYProgress, [0.3, 0.6], [0, 1]);
  const line2Y = useTransform(scrollYProgress, [0.3, 0.6], ["30%", "0%"]);
  const ctaOpacity = useTransform(scrollYProgress, [0.55, 0.85], [0, 1]);
  const head = "font-display uppercase font-bold leading-[0.84] tracking-[-0.04em]";
  const big = { fontSize: "clamp(3rem, 13vw, 13rem)", color: C.cream };

  return (
    <section id="contact" ref={ref} className="relative bg-[#C94A40] min-h-screen flex flex-col justify-center overflow-hidden grain">
      <div className="px-5 sm:px-8 py-7 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.25em]" style={{ color: "rgba(251,243,230,0.7)" }}>
        <span>BÖLÜM / 10</span>
        <span>İLETİŞİM</span>
      </div>

      <div className="px-5 sm:px-8">
        <motion.div style={{ y: line1Y }}>
          <h2 className={head} style={big}>BİR KAHVE</h2>
          <h2 className={head} style={big}>İŞLETMESİ</h2>
          <h2 className={head} style={big}>KURUYORSUN?</h2>
        </motion.div>

        <motion.div style={{ opacity: line2Opacity, y: line2Y }} className="mt-6 sm:mt-8">
          <h2 className={head} style={big}>VAR OLANI</h2>
          <h2 className={head} style={big}>DAHA İYİ</h2>
          <h2 className={head} style={big}>HALE GETİRELİM.</h2>
        </motion.div>

        <motion.div style={{ opacity: ctaOpacity }} className="mt-10 sm:mt-14">
          <div className="font-mono-tech text-[11px] uppercase tracking-[0.22em] mb-3" style={{ color: "rgba(251,243,230,0.7)" }}>
            ROSTA.Studio
          </div>
          <a
            href="mailto:studio@rosta.coffee"
            className="group inline-block font-display uppercase font-bold leading-[0.9] tracking-[-0.03em] relative"
            style={{ fontSize: "clamp(2.4rem, 9vw, 9rem)", color: C.cream }}
          >
            PROJENİ ANLAT{" "}
            <span className="inline-block transition-transform duration-300 group-hover:translate-x-2 group-hover:-translate-y-2">↗</span>
            <span className="absolute left-0 -bottom-2 h-[3px] w-full origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-out" style={{ background: C.cream }} />
          </a>

          <div className="mt-10 sm:mt-16 flex flex-col sm:flex-row gap-4 sm:gap-10 font-mono-tech text-[10px] uppercase tracking-[0.22em]" style={{ color: "rgba(251,243,230,0.7)" }}>
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
  useEffect(() => {
    const previous = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = previous;
    };
  }, []);

  return (
    <main className="rosta-studio-exact bg-[#111111]">
      <Nav />
      <Hero />
      <MarqueeOne />
      <WhoWeAre />
      <Services />
      <StreetText />
      <Process />
      <BigImage />
      <Principles />
      <MarqueeTwo />
      <FinalCTA />
    </main>
  );
}
