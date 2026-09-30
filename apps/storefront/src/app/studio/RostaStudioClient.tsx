"use client";

import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { usePrefersReducedMotion } from "@ruth-commerce/ui";
import { C, StudioImage, Nav, Hero, MarqueeRow, Brick, WhoWeAre, ServiceBlock, Process, FinalCTA } from "@/components/business/BusinessEditorialPrimitives";

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
