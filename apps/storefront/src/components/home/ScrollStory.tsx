"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { storySlides as defaultStorySlides } from "@/data/storySlides";

type StorySlide = (typeof defaultStorySlides)[number];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
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

export default function ScrollStory({ images }: { images?: string[] | null }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [liveImages, setLiveImages] = useState<string[] | null | undefined>(images);
  const slides = useMemo(() => buildSlides(liveImages), [liveImages]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setLiveImages(images);
  }, [images]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("themeEditor") !== "1") return;
    if (window.parent === window) return;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      if (event.data.type !== "RUTH_THEME_EDITOR_SETTINGS" || !event.data.settings) return;
      const next = scrollImagesFromSettings(event.data.settings);
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
                  key={`img-${slide.image}-${index}`}
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
                  {isVideoMediaSource(slide.image) ? (
                    <video
                      src={slide.image}
                      aria-label={slide.title}
                      className="h-full w-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload={index <= 1 ? "auto" : "metadata"}
                      disablePictureInPicture
                    />
                  ) : (
                    <img
                      src={slide.image}
                      alt={slide.title}
                      className="h-full w-full object-cover"
                      loading={index <= 1 ? "eager" : "lazy"}
                    />
                  )}
                </Link>
              );
            })}
          </motion.div>
        </div>

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
          className="pointer-events-none absolute right-3 top-[47%] z-20 flex -translate-y-1/2 flex-col items-center gap-1.5 md:right-8 md:top-1/2 md:gap-2"
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
                  color: "var(--ink)",
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
