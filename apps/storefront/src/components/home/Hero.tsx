"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { ROSTA_HOME_WORDMARK_SRC } from "@/components/brand/rostaWordmark";
import {
  HOME_HERO_DESKTOP_IMAGE_ID,
  HOME_HERO_MOBILE_IMAGE_ID,
  homepageHeroImages,
  type HomepageHeroImages,
} from "@/lib/themeMedia";
import type { ThemeCustomizerSettings } from "@/lib/themeCustomizer";

const HOME_EDITORIAL_IMAGE_ID = "home-editorial-image-2";

const EDITORIAL_SLIDES = [
  {
    kind: "hero-image",
    alt: "Rosta Coffee Co ana sayfa görseli",
    priority: true,
  },
  {
    kind: "video",
    label: "Rosta Coffee Co kahve hazırlama videosu",
  },
  {
    kind: "image",
    alt: "Rosta Coffee Co kahve hazırlama editoryali",
    priority: false,
  },
] as const;

type EditorialSlide = (typeof EDITORIAL_SLIDES)[number];
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
  window.dispatchEvent(new Event("rosta:home-hero-media-changed"));
}

function EditorialMedia({
  slide,
  index,
  heroImages,
  editorialVideo,
  editorialImage,
}: {
  slide: EditorialSlide;
  index: number;
  heroImages: HomepageHeroImages;
  editorialVideo: string;
  editorialImage: string;
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
    : "absolute inset-x-[2vw] inset-y-[1svh] overflow-hidden lg:bottom-[32px] lg:left-[7vw] lg:right-[7vw] lg:top-[52px]";

  return (
    <div
      ref={ref}
      className={`home-editorial-slide relative h-[108svh] ${index ? "-mt-[8svh]" : ""}`}
      data-editorial-kind={slide.kind}
    >
      <div className="sticky top-0 h-[100svh] min-h-[560px] overflow-hidden bg-ivory lg:min-h-[700px]">
        <motion.div
          className={wrapperClass}
          style={reduceMotion ? undefined : { y, scale, opacity, willChange: "transform, opacity" }}
        >
          {slide.kind === "hero-image" ? (
            <div className="h-full w-full">
              <img
                key={`hero-mobile:${heroImages.mobile}`}
                src={heroImages.mobile}
                alt={slide.alt}
                className="h-full w-full object-cover object-center md:hidden"
                loading="eager"
                fetchPriority="high"
                decoding="async"
                draggable={false}
                onLoad={notifyHeroMediaReady}
                data-home-editorial-media
                data-theme-id={HOME_HERO_MOBILE_IMAGE_ID}
                data-theme-label="Ana sayfa hero görseli · Mobil"
              />
              <img
                key={`hero-desktop:${heroImages.desktop}`}
                src={heroImages.desktop}
                alt={slide.alt}
                className="hidden h-full w-full object-cover object-center md:block"
                loading="eager"
                fetchPriority="high"
                decoding="async"
                draggable={false}
                onLoad={notifyHeroMediaReady}
                data-home-editorial-media
                data-theme-id={HOME_HERO_DESKTOP_IMAGE_ID}
                data-theme-label="Ana sayfa hero görseli · Masaüstü"
              />
            </div>
          ) : slide.kind === "image" ? (
            <picture className="block h-full w-full">
              <source media="(min-width: 768px)" srcSet={editorialImage} />
              <img
                src={editorialImage}
                alt={slide.alt}
                className="h-full w-full object-cover object-center"
                loading="lazy"
                fetchPriority="auto"
                decoding="async"
                draggable={false}
                data-home-editorial-media
                data-theme-id={HOME_EDITORIAL_IMAGE_ID}
                data-theme-label="Ana sayfa editoryal görseli"
              />
            </picture>
          ) : (
            <video
              className="h-full w-full object-cover object-center"
              src={editorialVideo}
              aria-label={slide.label}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              data-home-editorial-media
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default function Hero({
  heroImages,
  editorialVideo,
  editorialImage,
}: {
  heroImages: HomepageHeroImages;
  editorialVideo: string;
  editorialImage: string;
}) {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const wordmarkRef = useRef<HTMLDivElement | null>(null);
  const [wordmarkColor, setWordmarkColor] = useState("#FBF3E6");
  const [wordmarkVisible, setWordmarkVisible] = useState(true);
  const [liveHeroImages, setLiveHeroImages] = useState(heroImages);

  useEffect(() => {
    setLiveHeroImages(heroImages);
  }, [heroImages.desktop, heroImages.mobile]);

  useEffect(() => {
    notifyHeroMediaReady();
  }, [liveHeroImages.desktop, liveHeroImages.mobile]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("themeEditor") !== "1") return;
    if (window.parent === window) return;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      if (event.data.type !== "RUTH_THEME_EDITOR_SETTINGS" || !event.data.settings) return;
      setLiveHeroImages(homepageHeroImages(event.data.settings as ThemeCustomizerSettings));
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

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
        setWordmarkColor(luminance > 148 ? "#111111" : "#FBF3E6");
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("rosta:home-hero-media-changed", update);
    timer = window.setInterval(update, 420);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("rosta:home-hero-media-changed", update);
    };
  }, []);

  const slides: EditorialSlide[] = [
    { kind: "hero-image", alt: "Rosta Coffee Co ana sayfa görseli", priority: true },
    {
      kind: "video",
      label: "Rosta Coffee Co kahve hazırlama videosu",
    },
    {
      kind: "image",
      alt: "Rosta Coffee Co kahve hazırlama editoryali",
      priority: false,
    },
  ];

  return (
    <section
      ref={sectionRef}
      id="home-editorial"
      aria-label="Rosta Coffee Co ana sayfa editoryali"
      className="relative overflow-clip bg-ivory"
    >
      <style>{`
        .home-editorial-wordmark{box-sizing:border-box;pointer-events:none;position:fixed;left:0;top:calc(100svh - clamp(184px,38vw,236px));z-index:40;width:min(100vw,1208px);max-width:100vw;height:auto;aspect-ratio:1208/512;user-select:none;transition:background-color .24s ease,opacity .28s ease,visibility .28s ease}.home-editorial-wordmark[data-visible="false"]{opacity:0!important;visibility:hidden}@media(min-width:1024px){.home-editorial-wordmark{right:1vw;left:auto;top:45vh;width:56vw;max-width:98vw;height:auto;aspect-ratio:1208/512}}
      `}</style>
      <motion.div
        ref={wordmarkRef}
        role="img"
        aria-label="Rosta Coffee Co"
        className="home-editorial-wordmark"
        data-visible={wordmarkVisible ? "true" : "false"}
        style={{
          backgroundColor: wordmarkColor,
          WebkitMaskImage: `url(${ROSTA_HOME_WORDMARK_SRC})`,
          maskImage: `url(${ROSTA_HOME_WORDMARK_SRC})`,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
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
          key={`${slide.kind}-${index}`}
          slide={slide}
          index={index}
          heroImages={liveHeroImages}
          editorialVideo={editorialVideo}
          editorialImage={editorialImage}
        />
      ))}
    </section>
  );
}
