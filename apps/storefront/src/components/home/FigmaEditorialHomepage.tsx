"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ruthMotion, ruthTransition } from "@ruth-commerce/ui/motion";
import type { ThemeCustomizerSettings } from "@/lib/themeCustomizer";
import type { Collection, Product } from "@/types/site";
import styles from "./figma-editorial-homepage.module.css";

type EditorialMedia = {
  id: string;
  type: "video" | "image";
  src: string;
  logo: boolean;
  tone: "light" | "dark";
  label: string;
};

const MEDIA: EditorialMedia[] = [
  {
    id: "home-01",
    type: "video",
    src: "/home/editorial/home-01.mp4",
    logo: true,
    tone: "dark",
    label: "Ruth Istanbul editoryal video 1",
  },
  {
    id: "home-02",
    type: "image",
    src: "/home/editorial/home-02.webp",
    logo: true,
    tone: "light",
    label: "Ruth Istanbul editoryal fotoğraf 2",
  },
  {
    id: "home-03",
    type: "video",
    src: "/home/editorial/home-03.mp4",
    logo: false,
    tone: "dark",
    label: "Ruth Istanbul editoryal video 3",
  },
  {
    id: "home-04",
    type: "image",
    src: "/home/editorial/home-04.webp",
    logo: true,
    tone: "light",
    label: "Ruth Istanbul editoryal fotoğraf 4",
  },
];

function EditorialSection({
  item,
  index,
  register,
}: {
  item: EditorialMedia;
  index: number;
  register: (index: number, element: HTMLElement | null) => void;
}) {
  const reducedMotion = useReducedMotion();
  const localRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: localRef,
    offset: ["start end", "end start"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.14, 0.72, 1], [0.5, 1, 1, 0.12]);
  const y = useTransform(scrollYProgress, [0, 0.18, 0.76, 1], [34, 0, 0, -44]);
  const scale = useTransform(scrollYProgress, [0, 0.18, 0.76, 1], [1.025, 1, 1, 0.985]);

  const setSectionRef = (element: HTMLElement | null) => {
    localRef.current = element;
    register(index, element);
  };

  return (
    <section ref={setSectionRef} className={styles.storySection} aria-label={item.label}>
      <motion.div
        className={styles.media}
        style={reducedMotion ? undefined : { opacity, y, scale }}
      >
        {item.type === "video" ? (
          <video
            src={item.src}
            autoPlay
            muted
            loop
            playsInline
            preload={index === 0 ? "auto" : "metadata"}
            aria-label={item.label}
          />
        ) : (
          <img
            src={item.src}
            alt={item.label}
            loading={index === 0 ? "eager" : "lazy"}
          />
        )}
      </motion.div>
    </section>
  );
}

export default function FigmaEditorialHomepage({
  products: _products,
  collections: _collections,
  themeSettings: _themeSettings,
}: {
  products: Product[];
  collections: Collection[];
  themeSettings: ThemeCustomizerSettings;
}) {
  const reducedMotion = useReducedMotion();
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pastStory, setPastStory] = useState(false);

  useEffect(() => {
    const observers = sectionRefs.current.map((element, index) => {
      if (!element) return null;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.42) setActiveIndex(index);
        },
        { threshold: [0.42, 0.6, 0.8] },
      );
      observer.observe(element);
      return observer;
    });

    const onScroll = () => {
      const last = sectionRefs.current[MEDIA.length - 1];
      if (!last) return;
      setPastStory(last.getBoundingClientRect().bottom < window.innerHeight * 0.3);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observers.forEach((observer) => observer?.disconnect());
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const active = MEDIA[activeIndex] || MEDIA[0];
  const logoVisible = active.logo && !pastStory;

  return (
    <div className={styles.page}>
      <motion.div
        className={styles.floatingLogo}
        data-tone={active.tone}
        aria-hidden="true"
        initial={false}
        animate={{
          opacity: logoVisible ? 1 : 0,
          y: logoVisible ? 0 : ruthMotion.distance.standard,
        }}
        transition={
          reducedMotion
            ? { duration: ruthMotion.duration.none }
            : ruthTransition("slow")
        }
      >
        RUTH
      </motion.div>

      <div className={styles.story}>
        {MEDIA.map((item, index) => (
          <EditorialSection
            key={item.id}
            item={item}
            index={index}
            register={(currentIndex, element) => {
              sectionRefs.current[currentIndex] = element;
            }}
          />
        ))}
      </div>
    </div>
  );
}
