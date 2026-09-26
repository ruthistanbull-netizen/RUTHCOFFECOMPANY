"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { storySlides as defaultStorySlides } from "@/data/storySlides";
import { homeScrollMediaId, homepageDeviceMedia } from "@/lib/themeMedia";
import type { ThemeCustomizerSettings } from "@/lib/themeCustomizer";

type StorySlide = (typeof defaultStorySlides)[number];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function smootherstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function scrollCueProgress(rawPosition: number, slideIndex: number) {
  // The media itself starts changing at local progress 0.68. Start the text
  // there too and spread the entrance across almost a full viewport of scroll,
  // so it never jumps in on a single wheel gesture.
  const start = slideIndex - 0.32;
  const duration = 0.92;
  return smootherstep((rawPosition - start) / duration);
}

function scrollCueOpacity(rawPosition: number, slideIndex: number) {
  const enter = scrollCueProgress(rawPosition, slideIndex);
  const leaveStart = slideIndex + 0.52;
  const leaveDuration = 0.22;
  const leave = 1 - smootherstep((rawPosition - leaveStart) / leaveDuration);
  return clamp(Math.min(enter, leave), 0, 1);
}

function cleanImage(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isVideoMediaSource(value: string) {
  return /\.(mp4|m4v|mov|webm)(?:$|[?#])/i.test(value || "");
}

function buildSlides(images: string[] | undefined | null): StorySlide[] {
  if (!images?.length) return defaultStorySlides;

  return defaultStorySlides.map((slide, index) => ({
    ...slide,
    image: images[index] || slide.image,
  }));
}

function scrollImagesFromSettings(settings: unknown) {
  const raw = settings && typeof settings === "object" ? settings as Record<string, any> : {};
  const homepageImages = raw.homepageImages && typeof raw.homepageImages === "object"
    ? raw.homepageImages as Record<string, any>
    : {};
  if (!Array.isArray(homepageImages.scrollImages)) return null;
  return homepageImages.scrollImages.map(cleanImage);
}

export default function ScrollStory({
  images,
  themeSettings,
}: {
  images?: string[] | null;
  themeSettings: ThemeCustomizerSettings;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [liveImages, setLiveImages] = useState<string[] | null | undefined>(images);
  const [liveThemeSettings, setLiveThemeSettings] = useState(themeSettings);
  const [mobileViewport, setMobileViewport] = useState(false);
  const slides = useMemo(() => buildSlides(liveImages), [liveImages]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setLiveImages(images);
  }, [images]);

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
    if (new URLSearchParams(window.location.search).get("themeEditor") !== "1") return;
    if (window.parent === window) return;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      if (event.data.type !== "RUTH_THEME_EDITOR_SETTINGS" || !event.data.settings) return;
      const nextSettings = event.data.settings as ThemeCustomizerSettings;
      const next = scrollImagesFromSettings(nextSettings);
      setLiveThemeSettings(nextSettings);
      if (next) setLiveImages(next);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      const element = sectionRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
      const scrollable = Math.max(1, rect.height - viewportHeight);
      const nextProgress = clamp(-rect.top / scrollable, 0, 1);

      setProgress(nextProgress);
    };

    const requestUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    window.addEventListener("orientationchange", requestUpdate);
    document.addEventListener("visibilitychange", requestUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      window.removeEventListener("orientationchange", requestUpdate);
      document.removeEventListener("visibilitychange", requestUpdate);
    };
  }, []);

  const maxPosition = Math.max(1, slides.length - 1);
  const rawPosition = progress * maxPosition;
  const currentIndex = clamp(Math.floor(rawPosition), 0, slides.length - 1);
  const nextIndex = clamp(currentIndex + 1, 0, slides.length - 1);

  const localProgress = rawPosition - currentIndex;
  const transitionProgress = currentIndex >= slides.length - 1
    ? 0
    : smoothstep((localProgress - 0.68) / 0.32);

  const sectionHeight = `${Math.max(slides.length, 3) * 100}svh`;
  const scrollLetters = "KAYDIR".split("");
  const activeLetterIndex = clamp(Math.round(progress * (scrollLetters.length - 1)), 0, scrollLetters.length - 1);

  const secondCueProgress = scrollCueProgress(rawPosition, 1);
  const secondCueOpacity = scrollCueOpacity(rawPosition, 1);
  const thirdCueProgress = scrollCueProgress(rawPosition, 2);
  const thirdCueOpacity = scrollCueOpacity(rawPosition, 2);

  const secondCueX = -Math.round((1 - secondCueProgress) * (mobileViewport ? 150 : 230));
  const thirdCueX = mobileViewport
    ? Math.round((1 - thirdCueProgress) * 165)
    : -Math.round((1 - thirdCueProgress) * 230);
  const secondCueScale = 0.965 + secondCueProgress * 0.035;
  const thirdCueScale = 0.965 + thirdCueProgress * 0.035;

  return (
    <section
      ref={sectionRef}
      className="scroll-story-section scroll-story-same-animation relative bg-carbon text-cream"
      style={{ height: sectionHeight }}
    >
      <div className="scroll-story-sticky sticky top-0 flex h-[100svh] min-h-[560px] items-center justify-center overflow-hidden">
        <div
          className="relative -mt-12 md:mt-0"
          style={{
            width: "clamp(240px, 38vw, 420px)",
            height: "clamp(240px, 38vw, 420px)",
          }}
        >
          <motion.div
            className="h-full w-full"
            style={{ willChange: "transform" }}
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 6.2, ease: "easeInOut" }}
          >
            {slides.map((slide, index) => {
              const resolvedMedia = homepageDeviceMedia(liveThemeSettings, homeScrollMediaId(index), slide.image);
              const activeMedia = mobileViewport ? resolvedMedia.mobile : resolvedMedia.desktop;
              const isCurrent = index === currentIndex;
              const isNext = index === nextIndex && nextIndex !== currentIndex;
              const opacity = isCurrent ? 1 - transitionProgress : isNext ? transitionProgress : 0;
              const scale = isCurrent
                ? 1 - transitionProgress * 0.035
                : isNext
                  ? 0.965 + transitionProgress * 0.035
                  : 0.965;

              return (
                <Link
                  key={`img-${activeMedia.src}-${index}`}
                  href={slide.href}
                  aria-label={`${slide.title} ürününü incele`}
                  className="absolute inset-0 overflow-hidden rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brick"
                  style={{
                    opacity,
                    transform: `scale(${scale})`,
                    boxShadow: "0 30px 80px color-mix(in srgb, var(--rosta-carbon) 72%, transparent)",
                    willChange: "transform, opacity",
                    pointerEvents: opacity > 0.5 ? "auto" : "none",
                    cursor: "pointer",
                  }}
                >
                  {activeMedia.mediaType === "video" ? (
                    <video
                      src={activeMedia.src}
                      aria-label={slide.title}
                      className="h-full w-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload={index <= 1 ? "auto" : "metadata"}
                      disablePictureInPicture
                      data-theme-id={homeScrollMediaId(index)}
                      data-theme-label={`Kayan medya ${index + 1}`}
                    />
                  ) : (
                    <img
                      src={activeMedia.src}
                      alt={slide.title}
                      className="h-full w-full object-cover"
                      loading={index <= 1 ? "eager" : "lazy"}
                      data-theme-id={homeScrollMediaId(index)}
                      data-theme-label={`Kayan medya ${index + 1}`}
                    />
                  )}
                </Link>
              );
            })}
          </motion.div>
        </div>

        {slides.length > 1 ? (
          <div
            className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
            aria-hidden="true"
          >
            <div
              className="absolute left-[8vw] top-[37%] max-w-[80vw] md:left-[8.5vw] md:top-[40%] md:max-w-[43vw]"
              style={{
                opacity: secondCueOpacity,
                transform: `translate3d(${secondCueX}px, 0, 0) scale(${secondCueScale})`,
                transformOrigin: "left center",
                willChange: "transform, opacity",
              }}
            >
              <p
                className="m-0 font-black"
                style={{
                  color: "var(--rosta-brick-b)",
                  fontFamily: "var(--font-heading)",
                  fontSize: "clamp(2rem, 5.1vw, 5.6rem)",
                  fontWeight: 900,
                  fontVariationSettings: '"wght" 900',
                  lineHeight: 0.94,
                  letterSpacing: "-0.04em",
                }}
              >
                <span className="block">Doğru Çekirdek,</span>
                <span className="block">Güçlü Deneyim</span>
              </p>
            </div>

            {slides.length > 2 ? (
              <div
                className="absolute top-[42%] max-w-[80vw] md:left-[8.5vw] md:right-auto md:top-[42%] md:max-w-[45vw]"
                style={{
                  left: mobileViewport ? "auto" : undefined,
                  right: mobileViewport ? "8vw" : undefined,
                  opacity: thirdCueOpacity,
                  transform: `translate3d(${thirdCueX}px, 0, 0) scale(${thirdCueScale})`,
                  transformOrigin: mobileViewport ? "right center" : "left center",
                  willChange: "transform, opacity",
                  textAlign: mobileViewport ? "right" : "left",
                }}
              >
                <p
                  className="m-0 font-black"
                  style={{
                    color: "var(--rosta-brick-b)",
                    fontFamily: "var(--font-heading)",
                    fontSize: "clamp(1.8rem, 4.6vw, 5rem)",
                    fontWeight: 900,
                    fontVariationSettings: '"wght" 900',
                    lineHeight: 0.98,
                    letterSpacing: "-0.04em",
                  }}
                >
                  Kahveyi sadeleştir, karakterini koru.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-[29%] flex justify-center px-6 md:bottom-[25%]">
          {slides.map((slide, index) => {
            const isCurrent = index === currentIndex;
            const isNext = index === nextIndex && nextIndex !== currentIndex;
            const opacity = isCurrent ? 1 - transitionProgress : isNext ? transitionProgress : 0;
            const y = isCurrent ? -transitionProgress * 24 : isNext ? (1 - transitionProgress) * 24 : 24;

            return (
              <div
                key={`text-${index}`}
                className="absolute max-w-2xl px-6 text-center"
                style={{
                  opacity,
                  transform: `translateY(${y}px)`,
                  willChange: "transform, opacity",
                }}
              >
                <h2
                  className="font-heading font-editorial text-balance"
                  style={{
                    fontSize: "clamp(1.3rem, 3.5vw, 2.2rem)",
                    color: "var(--rosta-cream)",
                    lineHeight: 1.4,
                    letterSpacing: "0.01em",
                  }}
                >
                  {slide.title}
                </h2>
                <p className="mx-auto mt-4 max-w-lg leading-7 text-cream/70">{slide.body}</p>
                <div className="mx-auto mt-4 h-px" style={{ width: 40, background: "var(--rosta-brick-b)" }} />
              </div>
            );
          })}
        </div>

        <div
          className="pointer-events-none absolute right-4 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1.5 md:right-8 md:gap-2"
          aria-hidden="true"
        >
          {scrollLetters.map((letter, index) => {
            const isActive = index === activeLetterIndex;
            return (
              <motion.span
                key={`${letter}-${index}`}
                animate={{
                  scale: isActive ? 1.55 : 1,
                  opacity: isActive ? 1 : 0.42,
                }}
                transition={{ type: "spring", stiffness: 360, damping: 24, mass: 0.55 }}
                className="font-heading block text-center font-medium uppercase"
                style={{
                  width: "1.5rem",
                  color: "var(--rosta-cream)",
                  fontSize: "clamp(0.72rem, 1.2vw, 0.9rem)",
                  lineHeight: 1,
                  letterSpacing: 0,
                  transformOrigin: "center",
                }}
              >
                {letter}
              </motion.span>
            );
          })}
        </div>

        <motion.div
          style={{ scaleX: progress, background: "var(--gold)" }}
          className="absolute bottom-0 left-0 h-px w-full origin-left"
        />
      </div>
    </section>
  );
}
