"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { RostaHomeWordmark } from "@/components/brand/RostaHomeWordmark";
import {
  HOME_EDITORIAL_IMAGE_ID,
  HOME_EDITORIAL_VIDEO_ID,
  HOME_HERO_DESKTOP_IMAGE_ID,
  HOME_HERO_MOBILE_IMAGE_ID,
  homepageDeviceMedia,
  homepageHeroImages,
  type HomepageHeroImages,
  type HomepageMediaType,
} from "@/lib/themeMedia";
import type { ThemeCustomizerSettings } from "@/lib/themeCustomizer";

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

function contrastInk(luminance: number | null, fallback = "#111111") {
  if (luminance == null) return fallback;
  return luminance >= 118 ? "#111111" : "#FBF3E6";
}

function editorialMediaAtPoint(x: number, y: number) {
  return document.elementsFromPoint(x, y).find(
    (element): element is SampledMedia =>
      (element instanceof HTMLImageElement || element instanceof HTMLVideoElement)
      && element.hasAttribute("data-home-editorial-media")
      && window.getComputedStyle(element).display !== "none"
      && window.getComputedStyle(element).visibility !== "hidden",
  ) || null;
}

function sampleToneAtPoint(x: number, y: number) {
  const media = editorialMediaAtPoint(x, y);
  return media ? sampleMediaTone(media, x, y) : null;
}

function sampleToneAcrossRect(rect: DOMRect) {
  const points = [
    [0.18, 0.24],
    [0.5, 0.24],
    [0.82, 0.24],
    [0.24, 0.58],
    [0.5, 0.58],
    [0.76, 0.58],
    [0.28, 0.82],
    [0.5, 0.82],
    [0.72, 0.82],
  ] as const;
  const tones = points
    .map(([rx, ry]) => sampleToneAtPoint(rect.left + rect.width * rx, rect.top + rect.height * ry))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!tones.length) return null;
  tones.sort((a, b) => a - b);
  return tones[Math.floor(tones.length / 2)] ?? null;
}

function isVideoMediaSource(value: string) {
  return /\.(mp4|m4v|mov|webm)(?:$|[?#])/i.test(value || "");
}

function EditorialMedia({
  slide,
  index,
  heroImages,
  editorialVideo,
  editorialVideoType,
  editorialImage,
  editorialImageType,
}: {
  slide: EditorialSlide;
  index: number;
  heroImages: HomepageHeroImages;
  editorialVideo: string;
  editorialVideoType: HomepageMediaType;
  editorialImage: string;
  editorialImageType: HomepageMediaType;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const progress = useSpring(scrollYProgress, { stiffness: 92, damping: 30, mass: 0.42 });
  const scale = useTransform(
    progress,
    [0, 0.16, 0.5, 1],
    index === 0 ? [1, 0.975, 0.925, 0.88] : [1, 0.985, 0.955, 0.925],
  );
  const y = useTransform(progress, [0, 0.5, 1], ["0%", "-0.65%", "-1.35%"]);
  const opacity = useTransform(progress, [0, 0.78, 1], [1, 1, 0.96]);
  const wrapperClass = index === 0
    ? "absolute inset-0 overflow-hidden"
    : "absolute inset-x-[2vw] inset-y-[1svh] overflow-hidden lg:bottom-[32px] lg:left-[7vw] lg:right-[7vw] lg:top-[52px]";

  return (
    <div
      ref={ref}
      className={`home-editorial-slide relative h-[108svh] ${index ? "-mt-[8svh]" : ""}`}
      data-editorial-kind={slide.kind}
    >
      <div className="sticky top-0 h-[100svh] min-h-[560px] overflow-hidden bg-carbon lg:min-h-[700px]">
        <motion.div
          className={wrapperClass}
          style={reduceMotion ? undefined : { y, scale, opacity, willChange: "transform, opacity" }}
        >
          {slide.kind === "hero-image" ? (
            <div className="h-full w-full">
              {isVideoMediaSource(heroImages.mobile) ? (
                <video
                  key={`hero-mobile-video:${heroImages.mobile}`}
                  src={heroImages.mobile}
                  className="h-full w-full object-cover object-center md:hidden"
                  aria-label={slide.alt}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  disablePictureInPicture
                  onLoadedData={notifyHeroMediaReady}
                  data-home-editorial-media
                  data-theme-id={HOME_HERO_MOBILE_IMAGE_ID}
                  data-theme-label="Ana sayfa hero medyası · Mobil"
                />
              ) : (
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
                  data-theme-label="Ana sayfa hero medyası · Mobil"
                />
              )}
              {isVideoMediaSource(heroImages.desktop) ? (
                <video
                  key={`hero-desktop-video:${heroImages.desktop}`}
                  src={heroImages.desktop}
                  className="hidden h-full w-full object-cover object-center md:block"
                  aria-label={slide.alt}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  disablePictureInPicture
                  onLoadedData={notifyHeroMediaReady}
                  data-home-editorial-media
                  data-theme-id={HOME_HERO_DESKTOP_IMAGE_ID}
                  data-theme-label="Ana sayfa hero medyası · Masaüstü"
                />
              ) : (
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
                  data-theme-label="Ana sayfa hero medyası · Masaüstü"
                />
              )}
            </div>
          ) : slide.kind === "image" ? (
            editorialImageType === "video" ? (
              <video
                className="h-full w-full object-cover object-center"
                src={editorialImage}
                aria-label={slide.alt}
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                disablePictureInPicture
                data-home-editorial-media
                data-theme-id={HOME_EDITORIAL_IMAGE_ID}
                data-theme-label="Ana sayfa editoryal medyası"
              />
            ) : (
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
                  data-theme-label="Ana sayfa editoryal medyası"
                />
              </picture>
            )
          ) : (
            editorialVideoType === "video" ? (
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
                data-theme-id={HOME_EDITORIAL_VIDEO_ID}
                data-theme-label="Ana sayfa ikinci editoryal medyası"
              />
            ) : (
              <img
                src={editorialVideo}
                alt={slide.label}
                className="h-full w-full object-cover object-center"
                loading="lazy"
                decoding="async"
                draggable={false}
                data-home-editorial-media
                data-theme-id={HOME_EDITORIAL_VIDEO_ID}
                data-theme-label="Ana sayfa ikinci editoryal medyası"
              />
            )
          )}
        </motion.div>

      </div>
    </div>
  );
}


function HorizontalPhotoRail({
  src,
  mediaType,
}: {
  src: string;
  mediaType: HomepageMediaType;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const smooth = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 30,
    mass: 0.32,
    restDelta: 0.0001,
    restSpeed: 0.0001,
  });
  const x = useTransform(reduceMotion ? scrollYProgress : smooth, [0, 1], ["0%", "-66.666667%"]);
  const panels = [
    { position: "30% center", lines: [] as string[] },
    { position: "50% center", lines: ["Doğru Çekirdek,", "Güçlü Deneyim"] },
    { position: "70% center", lines: ["Kahveyi sadeleştir,", "karakterini koru."] },
  ];

  return (
    <section ref={ref} className="home-horizontal-editorial relative h-[300svh] bg-carbon">
      <style>{`
        .home-horizontal-editorial-copy{
          color:var(--rosta-brick-b);
          font-family:var(--font-heading)!important;
          font-weight:900!important;
          font-variation-settings:"wght" 900!important;
          font-synthesis:weight!important;
          letter-spacing:-.045em;
          line-height:.92;
          text-shadow:0 8px 30px rgba(0,0,0,.18)
        }
        .home-horizontal-editorial-copy p{
          margin:0;
          font-size:clamp(2.6rem,11vw,5.8rem);
          line-height:.9
        }
        .home-horizontal-editorial-copy span{
          display:block;
          white-space:nowrap
        }
        @media(min-width:768px){
          .home-horizontal-editorial-copy p{
            font-size:clamp(3.2rem,5.6vw,6.6rem)
          }
        }
      `}</style>
      <div className="sticky top-0 h-[100svh] overflow-hidden bg-carbon">
        <motion.div className="flex h-full w-[300vw] flex-nowrap" style={{ x, willChange: "transform" }}>
          {panels.map((panel, index) => (
            <div key={`${panel.position}-${index}`} className="relative h-full w-screen flex-none overflow-hidden">
              {mediaType === "video" ? (
                <video
                  src={src}
                  className="h-full w-full object-cover"
                  style={{ objectPosition: panel.position }}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload={index === 0 ? "auto" : "metadata"}
                  aria-label="Rosta Coffee Co yatay editoryal medya"
                />
              ) : (
                <img
                  src={src}
                  alt="Rosta Coffee Co yatay editoryal medya"
                  className="h-full w-full object-cover"
                  style={{ objectPosition: panel.position }}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              )}

              {panel.lines.length > 0 ? (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-[6vw]">
                  <div className="home-horizontal-editorial-copy text-center">
                    <p>
                      {panel.lines.map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export default function Hero({
  heroImages,
  editorialVideo,
  editorialImage,
  themeSettings,
}: {
  heroImages: HomepageHeroImages;
  editorialVideo: string;
  editorialImage: string;
  themeSettings: ThemeCustomizerSettings;
}) {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const wordmarkRef = useRef<HTMLDivElement | null>(null);
  const [wordmarkColor, setWordmarkColor] = useState("#111111");
  const [wordmarkVisible, setWordmarkVisible] = useState(true);
  const [liveHeroImages, setLiveHeroImages] = useState(heroImages);
  const [liveThemeSettings, setLiveThemeSettings] = useState(themeSettings);
  const [mobileViewport, setMobileViewport] = useState(false);

  useEffect(() => {
    setLiveHeroImages(heroImages);
  }, [heroImages.desktop, heroImages.mobile]);

  useEffect(() => {
    setLiveThemeSettings(themeSettings);
  }, [themeSettings]);

  useEffect(() => {
    const update = () => setMobileViewport(window.innerWidth < 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    notifyHeroMediaReady();
  }, [liveHeroImages.desktop, liveHeroImages.mobile]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("themeEditor") !== "1") return;
    if (window.parent === window) return;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      if (event.data.type !== "RUTH_THEME_EDITOR_SETTINGS" || !event.data.settings) return;
      const nextSettings = event.data.settings as ThemeCustomizerSettings;
      setLiveThemeSettings(nextSettings);
      setLiveHeroImages(homepageHeroImages(nextSettings));
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const section = sectionRef.current;
        const wordmark = wordmarkRef.current;
        if (!section || !wordmark) return;

        const sectionRect = section.getBoundingClientRect();
        const horizontalRail = document.querySelector<HTMLElement>(".home-horizontal-editorial");
        const horizontalRailHasEntered = horizontalRail ? horizontalRail.getBoundingClientRect().top <= window.innerHeight : false;
        const scrollStory = document.querySelector<HTMLElement>(".scroll-story-section");
        const scrollStoryHasEntered = scrollStory ? scrollStory.getBoundingClientRect().top <= window.innerHeight : false;
        const visible = sectionRect.bottom > 0 && sectionRect.top < window.innerHeight && !horizontalRailHasEntered && !scrollStoryHasEntered;
        setWordmarkVisible(visible);
        if (!visible) return;

        const wordmarkTone = sampleToneAcrossRect(wordmark.getBoundingClientRect());
        setWordmarkColor(contrastInk(wordmarkTone, "#111111"));
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("rosta:home-hero-media-changed", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("rosta:home-hero-media-changed", update);
    };
  }, []);

  const editorialVideoMedia = homepageDeviceMedia(liveThemeSettings, HOME_EDITORIAL_VIDEO_ID, editorialVideo);
  const editorialImageMedia = homepageDeviceMedia(liveThemeSettings, HOME_EDITORIAL_IMAGE_ID, editorialImage);
  const activeEditorialVideo = mobileViewport ? editorialVideoMedia.mobile : editorialVideoMedia.desktop;
  const activeEditorialImage = mobileViewport ? editorialImageMedia.mobile : editorialImageMedia.desktop;

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
    <>
    <section
      ref={sectionRef}
      id="home-editorial"
      aria-label="Rosta Coffee Co ana sayfa editoryali"
      className="relative overflow-clip bg-carbon"
    >
      <style>{`
        .home-editorial-wordmark{box-sizing:border-box;pointer-events:none;position:fixed;left:0;top:calc(100svh - clamp(184px,38vw,236px) + 20px);z-index:40;width:min(100vw,1208px);max-width:100vw;height:auto;aspect-ratio:3175/1343;user-select:none;transition:color .24s ease,opacity .28s ease,visibility .28s ease}.home-editorial-wordmark[data-visible="false"]{opacity:0!important;visibility:hidden}.home-editorial-wordmark svg{display:block;width:100%;height:100%;overflow:visible}@media(min-width:1024px){.home-editorial-wordmark{right:1vw!important;left:auto!important;top:calc(47vh + 18px)!important;width:44.8vw!important;max-width:44.8vw!important;height:auto!important;aspect-ratio:3175/1343}}
      `}</style>
      <motion.div
        ref={wordmarkRef}
        role="img"
        aria-label="Rosta Coffee Co"
        className="home-editorial-wordmark"
        data-theme-editor-ignore="true"
        data-visible={wordmarkVisible ? "true" : "false"}
        style={{ color: wordmarkColor }}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: wordmarkVisible ? 1 : 0 }}
        transition={{
          duration: reduceMotion ? 0 : 0.45,
          delay: reduceMotion ? 0 : 0.04,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <RostaHomeWordmark className="h-full w-full" />
      </motion.div>

      {slides.map((slide, index) => (
        <EditorialMedia
          key={`${slide.kind}-${index}`}
          slide={slide}
          index={index}
          heroImages={liveHeroImages}
          editorialVideo={activeEditorialVideo.src}
          editorialVideoType={activeEditorialVideo.mediaType}
          editorialImage={activeEditorialImage.src}
          editorialImageType={activeEditorialImage.mediaType}
        />
      ))}
    </section>
    <HorizontalPhotoRail src={activeEditorialImage.src} mediaType={activeEditorialImage.mediaType} />
    </>
  );
}
