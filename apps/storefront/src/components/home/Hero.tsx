"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { ROSTA_WORDMARK_SRC } from "@/components/brand/rostaWordmark";
import type { HomepageHeroImages } from "@/lib/themeMedia";

const HOME_HERO_IMAGE_ID = "home-hero-image-1";
const HOME_EDITORIAL_IMAGE_ID = "home-editorial-image-2";

type EditorialSlide =
  | {
      kind: "image";
      desktopSrc: string;
      mobileSrc: string;
      alt: string;
      priority: boolean;
    }
  | {
      kind: "video";
      src: string;
      label: string;
    };

const EDITORIAL_SLIDES: EditorialSlide[] = [
  {
    kind: "video",
    src: "https://raw.githubusercontent.com/ruthistanbull-netizen/RUTHCOFFECOMPANY/main/PinLoad_Good_coffee_good_mood._We_had_fun_capturing_Bayt_Al-Mocha_s_cappuccino_in_s_1789952989772.mp4",
    label: "Rosta Coffee Co kahve hazırlama videosu",
  },
  {
    kind: "video",
    src: "/home/rosta-coffee-video-v4.mp4",
    label: "Rosta Coffee Co kahve videosu",
  },
];

type SampledMedia = HTMLImageElement | HTMLVideoElement;

function sourceSize(media: SampledMedia) {
  if (media instanceof HTMLVideoElement) {
    return { width: media.videoWidth, height: media.videoHeight };
  }
  return { width: media.naturalWidth, height: media.naturalHeight };
}

function sampleMediaTone(media: SampledMedia, viewportX: number, viewportY: number) {
  const rect = media.getBoundingClientRect();
  const source = sourceSize(media);
  if (!rect.width || !rect.height || !source.width || !source.height) return null;

  const scale = Math.max(rect.width / source.width, rect.height / source.height);
  const renderedWidth = source.width * scale;
  const renderedHeight = source.height * scale;
  const cropX = (renderedWidth - rect.width) / 2;
  const cropY = (renderedHeight - rect.height) / 2;
  const sourceX = Math.max(0, Math.min(source.width - 1, (viewportX - rect.left + cropX) / Math.max(scale, 0.0001)));
  const sourceY = Math.max(0, Math.min(source.height - 1, (viewportY - rect.top + cropY) / Math.max(scale, 0.0001)));
  const sampleWidth = Math.max(1, Math.min(source.width - sourceX, source.width * 0.24));
  const sampleHeight = Math.max(1, Math.min(source.height - sourceY, source.height * 0.1));

  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 10;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  try {
    context.drawImage(
      media,
      Math.max(0, sourceX - sampleWidth / 2),
      Math.max(0, sourceY - sampleHeight / 2),
      sampleWidth,
      sampleHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0;
    let samples = 0;
    for (let index = 0; index < pixels.length; index += 16) {
      const alpha = pixels[index + 3] || 0;
      if (alpha < 30) continue;
      total += (pixels[index] || 0) * 0.2126
        + (pixels[index + 1] || 0) * 0.7152
        + (pixels[index + 2] || 0) * 0.0722;
      samples += 1;
    }
    return samples ? total / samples : null;
  } catch {
    return null;
  }
}

function notifyHeroMediaReady() {
  window.dispatchEvent(new Event("ruth:home-hero-media-changed"));
}

function EditorialMedia({
  slide,
  index,
}: {
  slide: EditorialSlide;
  index: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const progress = useSpring(scrollYProgress, { stiffness: 72, damping: 32, mass: 0.48 });
  const scale = useTransform(progress, [0, 1], [1.012, 0.996]);
  const y = useTransform(progress, [0, 1], ["1.5%", "-1%"]);
  const opacity = useTransform(progress, [0, 0.82, 1], [1, 1, 0.96]);
  const wrapperClass = index === 0
    ? "absolute inset-0 overflow-hidden"
    : index === 1
      ? "absolute inset-0 overflow-hidden lg:flex lg:items-center lg:justify-center lg:px-[8vw] lg:py-[6svh]"
      : "absolute inset-x-[8vw] inset-y-[1svh] overflow-hidden lg:bottom-[32px] lg:left-[34vw] lg:right-[34vw] lg:top-[52px]";

  return (
    <div
      ref={ref}
      className={
        index === 1
          ? "home-editorial-slide relative h-[100svh] lg:-mt-[8svh] lg:h-[108svh]"
          : `home-editorial-slide relative h-[108svh] ${index ? "-mt-[8svh]" : ""}`
      }
      data-editorial-kind={slide.kind}
    >
      <div className="sticky top-0 h-[100svh] min-h-[560px] overflow-hidden bg-ivory lg:min-h-[700px]">
        <motion.div
          className={wrapperClass}
          style={
            reduceMotion
              ? undefined
              : index === 0
                ? { opacity, willChange: "opacity" }
                : { y, scale, opacity, willChange: "transform, opacity" }
          }
        >
          {slide.kind === "image" ? (
            <picture className="block h-full w-full">
              <source media="(min-width: 768px)" srcSet={slide.desktopSrc} />
              <img
                src={slide.mobileSrc}
                alt={slide.alt}
                className={index === 1 ? "h-full w-full object-contain object-center" : "h-full w-full object-cover object-center [image-rendering:auto]"}
                loading={slide.priority ? "eager" : "lazy"}
                fetchPriority={slide.priority ? "high" : "auto"}
                decoding="async"
                draggable={false}
                onLoad={notifyHeroMediaReady}
                onError={(event) => {
                  if (index !== 0 || event.currentTarget.dataset.fallbackApplied === "1") {
                    event.currentTarget.style.display = "none";
                    return;
                  }
                  const fallback = "/home/rosta-hero-v6?v=20260921-original-avif";
                  event.currentTarget.dataset.fallbackApplied = "1";
                  event.currentTarget.src = fallback;
                  event.currentTarget.srcset = fallback;
                  const picture = event.currentTarget.closest("picture");
                  picture?.querySelectorAll("source").forEach((source) => {
                    source.srcset = fallback;
                  });
                }}
                data-home-editorial-media
                data-theme-id={index === 0 ? HOME_HERO_IMAGE_ID : HOME_EDITORIAL_IMAGE_ID}
                data-theme-label={index === 0 ? "Ana sayfa hero görseli" : "Ana sayfa editoryal görseli"}
              />
            </picture>
          ) : (
            <video
              className={index === 1
                ? "h-full w-full object-cover object-center lg:h-[84svh] lg:w-auto lg:max-w-[52vw]"
                : "h-full w-full object-cover object-center"}
              src={slide.src}
              aria-label={slide.label}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              onLoadedData={notifyHeroMediaReady}
              data-home-editorial-media
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default function Hero({ heroImages }: { heroImages: HomepageHeroImages }) {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const wordmarkRef = useRef<HTMLDivElement | null>(null);
  const [wordmarkColor, setWordmarkColor] = useState("#111111");
  const [wordmarkVisible, setWordmarkVisible] = useState(true);

  const slides: EditorialSlide[] = [
    {
      kind: "image",
      desktopSrc: heroImages.desktop,
      mobileSrc: heroImages.mobile,
      alt: "",
      priority: true,
    },
    ...EDITORIAL_SLIDES,
  ];

  useEffect(() => {
    let frame = 0;
    let timer = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const section = sectionRef.current;
        const wordmark = wordmarkRef.current;
        if (!section || !wordmark) return;
        const sectionRect = section.getBoundingClientRect();
        const scrollStory = document.querySelector<HTMLElement>(".scroll-story-section");
        const scrollStoryHasEntered = scrollStory ? scrollStory.getBoundingClientRect().top <= window.innerHeight : false;
        const visible = sectionRect.bottom > 0 && sectionRect.top < window.innerHeight && !scrollStoryHasEntered;
        setWordmarkVisible(visible);
        if (!visible) return;
        const wordmarkRect = wordmark.getBoundingClientRect();
        const pointX = wordmarkRect.left + wordmarkRect.width / 2;
        const pointY = wordmarkRect.top + wordmarkRect.height / 2;
        const media = document.elementsFromPoint(pointX, pointY).find(
          (element): element is SampledMedia =>
            (element instanceof HTMLImageElement || element instanceof HTMLVideoElement)
            && element.hasAttribute("data-home-editorial-media"),
        );
        if (!media) return;
        const luminance = sampleMediaTone(media, pointX, pointY);
        if (luminance == null) return;
        setWordmarkColor(luminance > 148 ? "#111111" : "#ffffff");
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("ruth:home-hero-media-changed", update);
    timer = window.setInterval(update, 420);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("ruth:home-hero-media-changed", update);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="home-editorial"
      aria-label="Rosta Coffee Co ana sayfa editoryali"
      className="relative overflow-clip bg-ivory"
    >
      <style>{`
        .home-editorial-wordmark{box-sizing:border-box;pointer-events:none;position:fixed;left:5vw;top:calc(100svh - clamp(170px,43vw,220px));z-index:40;width:90vw;max-width:90vw;height:clamp(76px,23vw,118px);user-select:none;transition:background-color .24s ease,opacity .28s ease,visibility .28s ease}.home-editorial-wordmark[data-visible="false"]{opacity:0!important;visibility:hidden}@media(min-width:1024px){.home-editorial-wordmark{right:1vw;left:auto;top:45vh;width:56vw;max-width:98vw;height:clamp(102px,9.8vw,178px)}}
      `}</style>
      <motion.div
        ref={wordmarkRef}
        role="img"
        aria-label="Rosta"
        className="home-editorial-wordmark"
        data-visible={wordmarkVisible ? "true" : "false"}
        style={{
          backgroundColor: wordmarkColor,
          WebkitMaskImage: `url(${ROSTA_WORDMARK_SRC})`,
          maskImage: `url(${ROSTA_WORDMARK_SRC})`,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          willChange: "opacity, background-color",
        }}
        initial={reduceMotion ? false : { opacity: 0, scale: 0.995 }}
        animate={{ opacity: wordmarkVisible ? 1 : 0, scale: 1 }}
        transition={{
          duration: reduceMotion ? 0 : 0.45,
          delay: reduceMotion ? 0 : 0.04,
          ease: [0.22, 1, 0.36, 1],
        }}
      />

      {slides.map((slide, index) => (
        <EditorialMedia
          key={slide.kind === "video" ? slide.src : `image-${index}`}
          slide={slide}
          index={index}
        />
      ))}
    </section>
  );
}
