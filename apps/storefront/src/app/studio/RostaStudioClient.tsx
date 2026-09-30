"use client";

import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { useRef } from "react";
import styles from "./studio.module.css";

const EASE = [0.22, 1, 0.36, 1] as const;

function TechLabel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`${styles.tech} ${className}`}>{children}</span>;
}

function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const rostaX = useTransform(scrollYProgress, [0, 1], ["0vw", "-15vw"]);
  const studioX = useTransform(scrollYProgress, [0, 1], ["0vw", "15vw"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.78, 1], [1, 0.88, 0]);

  return (
    <section ref={ref} className={styles.hero} id="studio">
      <div className={styles.heroMeta}>
        <TechLabel>ROSTA / STUDIO</TechLabel>
        <TechLabel>KAHVE SİSTEMİ</TechLabel>
        <TechLabel>KUR. 2026</TechLabel>
      </div>

      <motion.div
        className={styles.heroType}
        style={{ opacity: reducedMotion ? 1 : heroOpacity }}
      >
        <motion.div
          className={`${styles.heroWord} ${styles.display}`}
          initial={reducedMotion ? false : { x: "-12vw", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1, ease: EASE }}
          style={{ x: reducedMotion ? 0 : rostaX }}
        >
          ROSTA.
        </motion.div>
        <motion.div
          className={`${styles.heroWord} ${styles.heroWordRight} ${styles.display}`}
          initial={reducedMotion ? false : { x: "12vw", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.08, ease: EASE }}
          style={{ x: reducedMotion ? 0 : studioX }}
        >
          STUDIO
        </motion.div>
      </motion.div>

      <div className={styles.heroBottom}>
        <div>
          <TechLabel>KAHVE / İŞLETME / DENEYİM</TechLabel>
          <motion.p
            className={styles.heroCopy}
            initial={reducedMotion ? false : { y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.42, ease: EASE }}
          >
            Kahve işletmelerini fikirden gerçek deneyime dönüştürüyoruz.
          </motion.p>
        </div>
        <a href="#hizmetler" className={styles.heroCta}>
          BİRLİKTE ÇALIŞALIM <span aria-hidden="true">↘</span>
        </a>
      </div>

      <a href="#yaklasim" className={styles.scrollCue} aria-label="Aşağı kaydır">
        <span />
      </a>
    </section>
  );
}

function MarqueeRow({
  text,
  direction,
  accent,
  speed = 1,
}: {
  text: string;
  direction: "left" | "right";
  accent?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const distance = direction === "left" ? -12 * speed : 12 * speed;
  const x = useTransform(
    scrollYProgress,
    [0, 1],
    direction === "left" ? ["4%", `${distance}%`] : ["-10%", `${distance - 2}%`],
  );

  const chunks = Array.from({ length: 3 }, (_, index) => (
    <span key={index}>
      {accent && text.includes(accent) ? (
        <>
          {text.split(accent)[0]}
          <em>{accent}</em>
          {text.split(accent).slice(1).join(accent)}
        </>
      ) : (
        text
      )}
      <span className={styles.marqueeGap} aria-hidden="true"> — </span>
    </span>
  ));

  return (
    <div ref={ref} className={styles.marqueeViewport} aria-hidden="true">
      <motion.div
        className={`${styles.marqueeTrack} ${styles.display}`}
        style={{ x: reducedMotion ? 0 : x }}
      >
        {chunks}
      </motion.div>
    </div>
  );
}

function MarqueeOne() {
  return (
    <section className={styles.marqueeSection} aria-label="ROSTA Studio hizmetleri">
      <MarqueeRow
        text="BAR KURULUMU"
        direction="left"
        speed={1.05}
      />
      <MarqueeRow
        text="REÇETE / ÜRÜN / MENÜ / DENEYİM"
        direction="right"
        accent="ÜRÜN"
        speed={0.9}
      />
      <MarqueeRow
        text="MARKA / KONSEPT / KAHVE / MEKÂN"
        direction="left"
        accent="KONSEPT"
        speed={1.15}
      />
    </section>
  );
}

function WhoWeAre() {
  const reducedMotion = useReducedMotion();
  const words = ["BAR.", "ÜRÜN.", "MARKA.", "DENEYİM."];

  return (
    <section className={styles.who} id="yaklasim">
      <div className={styles.sectionMeta}>
        <TechLabel>ROSTA / STUDIO</TechLabel>
        <TechLabel>YAKLAŞIM / 001</TechLabel>
      </div>

      <div className={styles.whoStatement}>
        <motion.p
          className={`${styles.whoLine} ${styles.display}`}
          initial={reducedMotion ? false : { x: "-10vw", opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          KAHVEYİ SADECE SERVİS EDİLEN
        </motion.p>
        <motion.p
          className={`${styles.whoLine} ${styles.whoLineRight} ${styles.display}`}
          initial={reducedMotion ? false : { x: "10vw", opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.8, ease: EASE }}
        >
          BİR ÜRÜN OLARAK GÖRMÜYORUZ.
        </motion.p>
      </div>

      <div className={styles.whoWords}>
        {words.map((word, index) => (
          <motion.span
            key={word}
            className={`${styles.whoWord} ${styles.display}`}
            initial={
              reducedMotion
                ? false
                : { x: index % 2 === 0 ? "-8vw" : "8vw", opacity: 0 }
            }
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.55 }}
            transition={{ duration: 0.72, ease: EASE }}
          >
            {word}
          </motion.span>
        ))}
      </div>

      <p className={styles.whoCopy}>
        ROSTA.Studio; kahve işletmelerinin ürününden servis akışına, marka
        dilinden bar sistemine kadar bütün deneyimini birlikte kurar.
      </p>
    </section>
  );
}

const services = [
  {
    number: "01",
    title: ["BAR", "KURULUMU"],
    label: "AKIŞ / EKİPMAN / ÇALIŞMA ALANI",
    copy:
      "Bar akışını, ekipmanı ve çalışma düzenini işletmenin gerçek ihtiyaçlarına göre oluşturuyoruz.",
    image: "/home/rosta-espresso.webp",
    alt: "ROSTA Studio bar kurulumu",
    direction: "left" as const,
    tone: "dark" as const,
  },
  {
    number: "02",
    title: ["REÇETE &", "ÜRÜN GELİŞTİRME"],
    label: "KAHVE / İÇECEK / MENÜ",
    copy:
      "Menüyü doldurmak yerine markanın karakterini taşıyan ürünler geliştiriyoruz.",
    image: "/home/rosta-under-hero-photo.jpg",
    alt: "ROSTA Studio reçete ve ürün geliştirme",
    direction: "right" as const,
    tone: "light" as const,
  },
  {
    number: "03",
    title: ["MARKA &", "KONSEPT"],
    label: "KİMLİK / MEKÂN / DENEYİM",
    copy:
      "İsimden görsel dile, menüden müşterinin mekânda hissettiği deneyime kadar bütün yapıyı birlikte tasarlıyoruz.",
    image: "/home/rosta-under-hero-v4.jpg",
    alt: "ROSTA Studio marka ve konsept geliştirme",
    direction: "left" as const,
    tone: "dark" as const,
  },
];

function ServiceBlock({
  service,
}: {
  service: (typeof services)[number];
}) {
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const titleX = useTransform(
    scrollYProgress,
    [0.12, 0.48, 0.86],
    service.direction === "left"
      ? ["-12vw", "0vw", "4vw"]
      : ["12vw", "0vw", "-4vw"],
  );
  const imageScale = useTransform(scrollYProgress, [0.1, 0.82], [0.94, 1.06]);

  return (
    <section
      ref={ref}
      className={`${styles.service} ${
        service.tone === "light" ? styles.serviceLight : styles.serviceDark
      }`}
    >
      <div className={styles.serviceSticky}>
        <div className={styles.serviceMeta}>
          <TechLabel>ROSTA/STUDIO HİZMET</TechLabel>
          <TechLabel>{service.number} / 03</TechLabel>
        </div>

        <motion.div
          className={styles.serviceImage}
          style={{ scale: reducedMotion ? 1 : imageScale }}
        >
          <Image
            src={service.image}
            alt={service.alt}
            fill
            sizes="(max-width: 768px) 92vw, 62vw"
            className={styles.coverImage}
          />
          <div className={styles.imageShade} />
        </motion.div>

        <motion.div
          className={styles.serviceTitleWrap}
          style={{ x: reducedMotion ? 0 : titleX }}
        >
          <div className={`${styles.serviceNumber} ${styles.tech}`}>
            {service.number}
          </div>
          <h2 className={`${styles.serviceTitle} ${styles.display}`}>
            {service.title.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h2>
        </motion.div>

        <div className={styles.serviceCopyWrap}>
          <TechLabel>{service.label}</TechLabel>
          <p>{service.copy}</p>
        </div>
      </div>
    </section>
  );
}

function Services() {
  return (
    <div id="hizmetler">
      {services.map((service) => (
        <ServiceBlock key={service.number} service={service} />
      ))}
    </div>
  );
}

function StreetText() {
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const left = useTransform(scrollYProgress, [0, 1], ["-5vw", "7vw"]);
  const right = useTransform(scrollYProgress, [0, 1], ["7vw", "-7vw"]);

  return (
    <section ref={ref} className={styles.streetText}>
      <motion.div
        className={`${styles.streetLine} ${styles.display}`}
        style={{ x: reducedMotion ? 0 : left }}
      >
        İYİ KAHVE
      </motion.div>
      <motion.div
        className={`${styles.streetLine} ${styles.streetLineRight} ${styles.display}`}
        style={{ x: reducedMotion ? 0 : right }}
      >
        SADECE
      </motion.div>
      <motion.div
        className={`${styles.streetLine} ${styles.streetAccent} ${styles.display}`}
        style={{ x: reducedMotion ? 0 : left }}
      >
        BAŞLANGIÇ.
      </motion.div>
    </section>
  );
}

const processStages = [
  {
    number: "01",
    title: "KEŞİF",
    copy:
      "İşletmenin hikâyesi, ihtiyacı ve potansiyelini anlamak için başlangıçta dinler, gözlemler ve yerinde inceleriz.",
  },
  {
    number: "02",
    title: "YÖN",
    copy:
      "Doğru bar, ürün ve marka stratejisini birlikte netleştiririz. Nereye gideceğimizi belirleriz.",
  },
  {
    number: "03",
    title: "GELİŞTİRME",
    copy:
      "Reçeteler, menü, görsel dil ve bar düzeni üzerinde çalışır, prototipleri test ederiz.",
  },
  {
    number: "04",
    title: "UYGULAMA",
    copy:
      "Sahada kurar, ekibi eğitir ve açılıştan sonra deneyimi ayakta tutarız.",
  },
];

function Process() {
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 70%", "end 60%"],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 28,
    mass: 0.4,
  });

  return (
    <section ref={ref} className={styles.process} id="surec">
      <div className={styles.sectionMeta}>
        <TechLabel>SÜREÇ / 001</TechLabel>
        <TechLabel>ROSTA.STUDIO</TechLabel>
      </div>

      <h2 className={`${styles.processHeading} ${styles.display}`}>
        <span>BİZ NASIL</span>
        <span>ÇALIŞIYORUZ?</span>
      </h2>

      <div className={styles.processList}>
        <motion.div
          className={styles.processRail}
          style={{ scaleY: reducedMotion ? 1 : progress }}
        />
        {processStages.map((stage, index) => (
          <motion.article
            key={stage.number}
            className={styles.processStage}
            initial={
              reducedMotion
                ? false
                : { x: index % 2 === 0 ? "-7vw" : "7vw", opacity: 0 }
            }
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.48 }}
            transition={{ duration: 0.72, ease: EASE }}
          >
            <div className={`${styles.processNumber} ${styles.tech}`}>
              {stage.number}
            </div>
            <h3 className={`${styles.processTitle} ${styles.display}`}>
              {stage.title}
            </h3>
            <p>{stage.copy}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

function BigMedia() {
  const ref = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const width = useTransform(scrollYProgress, [0, 0.82], ["62%", "100%"]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.06]);
  const radius = useTransform(scrollYProgress, [0, 0.72], [18, 0]);

  return (
    <section ref={ref} className={styles.bigMedia}>
      <div className={styles.bigMediaSticky}>
        <motion.div
          className={styles.bigMediaFrame}
          style={{
            width: reducedMotion ? "100%" : width,
            scale: reducedMotion ? 1 : scale,
            borderRadius: reducedMotion ? 0 : radius,
          }}
        >
          <video
            className={styles.bigMediaVideo}
            src="/home/rosta-under-hero-video.mp4"
            poster="/home/rosta-under-hero-photo.jpg"
            autoPlay={reducedMotion !== true}
            muted
            loop={reducedMotion !== true}
            playsInline
            preload="metadata"
            aria-label="ROSTA Studio kahve barı görüntüsü"
          />
          <div className={styles.imageShade} />
          <div className={styles.bigMediaCorners}>
            <TechLabel>ROSTA.STUDIO</TechLabel>
            <TechLabel>İSTANBUL</TechLabel>
            <TechLabel>KAHVE / MARKA / İŞLETME</TechLabel>
            <TechLabel>KUR. 2026</TechLabel>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

const principles = [
  ["İŞLEVSEL.", "Her karar çalışmayı kolaylaştırmak için alınır."],
  ["KARAKTERLİ.", "Marka, tekrar edilebilir bir karaktere sahip olmalı."],
  ["SADE.", "Gereksiz hiçbir şey sahnede kalmaz."],
] as const;

function Principles() {
  const reducedMotion = useReducedMotion();

  return (
    <section className={styles.principles}>
      <div className={styles.sectionMeta}>
        <TechLabel>ROSTA / İLKELER</TechLabel>
        <TechLabel>03 MADDE</TechLabel>
      </div>

      {principles.map(([title, copy], index) => (
        <motion.article
          key={title}
          className={styles.principle}
          initial={
            reducedMotion
              ? false
              : { x: index % 2 === 0 ? "-9vw" : "9vw", opacity: 0 }
          }
          whileInView={{ x: 0, opacity: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.78, ease: EASE }}
        >
          <h2 className={`${styles.principleTitle} ${styles.display}`}>
            {title}
          </h2>
          <p>{copy}</p>
        </motion.article>
      ))}
    </section>
  );
}

function MarqueeTwo() {
  return (
    <section className={`${styles.marqueeSection} ${styles.marqueeSectionCompact}`}>
      <MarqueeRow
        text="KAHVE / İŞLETME / MARKA / BAR / MENÜ / DENEYİM /"
        direction="left"
        speed={1.25}
      />
      <MarqueeRow
        text="ROSTA.STUDIO — İSTANBUL — ROSTA.STUDIO — İSTANBUL"
        direction="right"
        accent="ROSTA.STUDIO"
        speed={1.15}
      />
    </section>
  );
}

function FinalCTA() {
  const reducedMotion = useReducedMotion();
  const lines = [
    "BİR KAHVE",
    "İŞLETMESİ",
    "KURUYORSUN?",
    "VAR OLANI",
    "DAHA İYİ",
    "HALE GETİRELİM.",
  ];

  return (
    <section className={styles.finalCta} id="iletisim">
      <div className={styles.finalCopy}>
        {lines.map((line, index) => (
          <motion.span
            key={line}
            className={`${styles.finalLine} ${styles.display} ${
              index === 5 ? styles.finalAccent : ""
            }`}
            initial={
              reducedMotion
                ? false
                : { x: index % 2 === 0 ? "-9vw" : "9vw", opacity: 0 }
            }
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true, amount: 0.65 }}
            transition={{ duration: 0.68, ease: EASE }}
          >
            {line}
          </motion.span>
        ))}
      </div>

      <div className={styles.finalAction}>
        <div>
          <TechLabel>ROSTA.STUDIO</TechLabel>
          <p>Kahve işletmeleri için.</p>
        </div>
        <Link href="/contact" className={styles.projectLink}>
          PROJENİ ANLAT <span aria-hidden="true">↗</span>
        </Link>
      </div>

      <div className={styles.finalMeta}>
        <TechLabel>ROSTA / STUDIO</TechLabel>
        <TechLabel>İST / TR</TechLabel>
        <TechLabel>KAHVE SİSTEMİ</TechLabel>
        <TechLabel>PROJE 001</TechLabel>
        <TechLabel>KUR. 2026</TechLabel>
      </div>
    </section>
  );
}

export function RostaStudioClient() {
  return (
    <div className={styles.studioPage}>
      <Hero />
      <MarqueeOne />
      <WhoWeAre />
      <Services />
      <StreetText />
      <Process />
      <BigMedia />
      <Principles />
      <MarqueeTwo />
      <FinalCTA />
    </div>
  );
}
