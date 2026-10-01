"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { StoreDesignEditableMedia } from "@/components/theme/StoreDesignEditableMedia";
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
              <StoreDesignEditableMedia editorId={HOME_HERO_MOBILE_IMAGE_ID} themeId={HOME_HERO_MOBILE_IMAGE_ID} aliases={["section:home-hero::auto::0.2.0.0.0.0"]} editorLabel="Ana sayfa hero medyası · Mobil" src={heroImages.mobile} alt={slide.alt} className="h-full w-full object-cover object-center md:hidden" priority onReady={notifyHeroMediaReady} data-home-editorial-media />
              <StoreDesignEditableMedia editorId={HOME_HERO_DESKTOP_IMAGE_ID} themeId={HOME_HERO_DESKTOP_IMAGE_ID} aliases={["section:home-hero::auto::0.2.0.0.0.1"]} editorLabel="Ana sayfa hero medyası · Masaüstü" src={heroImages.desktop} alt={slide.alt} className="hidden h-full w-full object-cover object-center md:block" priority onReady={notifyHeroMediaReady} data-home-editorial-media />
            </div>
          ) : slide.kind === "image" ? (
            <div className="block h-full w-full">
              <StoreDesignEditableMedia editorId={HOME_EDITORIAL_IMAGE_ID} themeId={HOME_EDITORIAL_IMAGE_ID} aliases={["section:home-hero::auto::0.4.0.0.0.1", "section:home-hero::auto::0.4.0.0.0"]} editorLabel="Ana sayfa editoryal medyası" src={editorialImage} type={editorialImageType} alt={slide.alt} className="h-full w-full object-cover object-center" data-home-editorial-media />
            </div>
          ) : (
            <StoreDesignEditableMedia editorId={HOME_EDITORIAL_VIDEO_ID} themeId={HOME_EDITORIAL_VIDEO_ID} aliases={["section:home-hero::auto::0.3.0.0.0"]} editorLabel="Ana sayfa ikinci editoryal medyası" src={editorialVideo} type={editorialVideoType} alt={slide.label} className="h-full w-full object-cover object-center" data-home-editorial-media />
          )}
        </motion.div>

      </div>
    </div>
  );
}



const HORIZONTAL_CARD_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

type HorizontalStoryPanel = {
  label: string;
  title: string;
  description: string;
  cardIds: [string, string];
};

const HORIZONTAL_STORY_PANELS: HorizontalStoryPanel[] = [
  {
    label: "ROSTA / 01",
    title: "Kahve, Karakterle Başlar.",
    description: "Doğru çekirdek, doğru kavrum ve net bir profil. ROSTA’da her fincanın kendine ait bir karakteri var.",
    cardIds: ["home-horizontal-card-1-1", "home-horizontal-card-1-2"],
  },
  {
    label: "ROSTA / 02",
    title: "Kaynağına Sadık.",
    description: "Çekirdeğin coğrafyasını, işleme yöntemini ve aromatik yapısını fincanda mümkün olduğunca net koruyoruz.",
    cardIds: ["home-horizontal-card-2-1", "home-horizontal-card-2-2"],
  },
  {
    label: "ROSTA / 03",
    title: "Kavrumda Denge.",
    description: "Tek bir reçete yerine, her çekirdeğin yapısına göre geliştirilen dengeli ve karakter odaklı kavrumlar.",
    cardIds: ["home-horizontal-card-3-1", "home-horizontal-card-3-2"],
  },
  {
    label: "ROSTA / 04",
    title: "Sade. Net. ROSTA.",
    description: "Gereksiz karmaşa yok. İyi çekirdek, doğru kavrum ve güçlü bir kahve deneyimi.",
    cardIds: ["home-horizontal-card-4-1", "home-horizontal-card-4-2"],
  },
];

function HorizontalStoryMedia({
  id,
  media,
}: {
  id: string;
  media: { src: string; mediaType: HomepageMediaType };
}) {
  return (
    <div className="home-horizontal-story-media h-full w-full" aria-label="Fotoğraf alanı">
      <StoreDesignEditableMedia editorId={id} themeId={id} editorLabel="Yatay hikaye medyası" src={media.src} type={media.mediaType} className="h-full w-full object-cover" />
    </div>
  );
}

const HORIZONTAL_CARD_CLASSES = [
  ["red", "orange"],
  ["blue", "cyan"],
  ["green", "emerald"],
  ["pink", "light-pink"],
] as const;

function HorizontalStoryPanelView({
  panel,
  index,
  themeSettings,
  mobileViewport,
}: {
  panel: HorizontalStoryPanel;
  index: number;
  themeSettings: ThemeCustomizerSettings;
  mobileViewport: boolean;
}) {
  const firstCardId = panel.cardIds[0];
  const secondCardId = panel.cardIds[1];
  const firstResolved = homepageDeviceMedia(themeSettings, firstCardId, HORIZONTAL_CARD_PLACEHOLDER);
  const secondResolved = homepageDeviceMedia(themeSettings, secondCardId, HORIZONTAL_CARD_PLACEHOLDER);
  const firstMedia = mobileViewport ? firstResolved.mobile : firstResolved.desktop;
  const secondMedia = mobileViewport ? secondResolved.mobile : secondResolved.desktop;
  const [firstClass, secondClass] = HORIZONTAL_CARD_CLASSES[index] || HORIZONTAL_CARD_CLASSES[0];

  return (
    <article className="home-horizontal-story-panel panel h-[100svh] w-screen flex-none">
      <div className="home-horizontal-story-panel-inner panel-inner">
        <div className="home-horizontal-story-copy">
          <div
            className="home-horizontal-story-label label"
            data-theme-id={`home-horizontal-label-${index + 1}`}
            data-theme-label="Yatay hikaye üst etiketi"
          >
            {panel.label}
          </div>
          <h2
            className="home-horizontal-story-title title"
            data-theme-id={`home-horizontal-title-${index + 1}`}
            data-theme-label="Yatay hikaye başlığı"
          >
            {panel.title}
          </h2>
          <p
            className="home-horizontal-story-desc desc"
            data-theme-id={`home-horizontal-desc-${index + 1}`}
            data-theme-label="Yatay hikaye açıklaması"
          >
            {panel.description}
          </p>
        </div>

        <div className="home-horizontal-story-cards cards">
          <div className={`home-horizontal-story-card card ${firstClass}`}>
            <HorizontalStoryMedia id={firstCardId} media={firstMedia} />
          </div>
          <div className={`home-horizontal-story-card card ${secondClass}`}>
            <HorizontalStoryMedia id={secondCardId} media={secondMedia} />
          </div>
        </div>
      </div>
    </article>
  );
}

function HorizontalPortfolioStory({
  themeSettings,
  mobileViewport,
}: {
  themeSettings: ThemeCustomizerSettings;
  mobileViewport: boolean;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const wrapper = wrapperRef.current;
    if (!section || !wrapper) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const panels = gsap.utils.toArray<HTMLElement>(".panel", section);
      const getScrollDistance = () => wrapper.scrollWidth - window.innerWidth;

      const scrollTween = gsap.to(wrapper, {
        x: () => -(getScrollDistance()),
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () => "+=" + getScrollDistance(),
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });

      panels.forEach((panel) => {
        const title = panel.querySelector(".title");
        const desc = panel.querySelector(".desc");
        const cards = panel.querySelector(".cards");

        if (title) {
          gsap.from(title, {
            y: 80,
            opacity: 0,
            scrollTrigger: {
              trigger: panel,
              containerAnimation: scrollTween,
              start: "left center",
            },
          });
        }

        if (desc) {
          gsap.from(desc, {
            y: 40,
            opacity: 0,
            delay: 0.1,
            scrollTrigger: {
              trigger: panel,
              containerAnimation: scrollTween,
              start: "left center",
            },
          });
        }

        if (cards) {
          gsap.from(cards, {
            scale: 0.8,
            rotate: -10,
            opacity: 0,
            scrollTrigger: {
              trigger: panel,
              containerAnimation: scrollTween,
              start: "left center",
            },
          });
        }
      });
    }, section);

    const refresh = () => ScrollTrigger.refresh();
    const frame = window.requestAnimationFrame(refresh);
    window.addEventListener("load", refresh);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("load", refresh);
      ctx.revert();
    };
  }, [mobileViewport]);

  return (
    <section
      ref={sectionRef}
      className="home-horizontal-editorial horizontal-section relative h-[100svh] overflow-hidden bg-carbon"
      aria-label="ROSTA yatay hikaye"
    >
      <style>{`
        .home-horizontal-story-wrapper{
          display:flex;
          width:400vw;
          height:100svh;
        }
        .home-horizontal-story-panel{
          width:100vw;
          height:100svh;
          display:flex;
          align-items:center;
          padding:60px;
          background:var(--rosta-carbon);
          color:var(--rosta-cream);
        }
        .home-horizontal-story-panel-inner{
          width:100%;
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:60px;
          align-items:center;
        }
        .home-horizontal-story-copy{
          padding-top:92px;
        }
        .home-horizontal-story-label{
          letter-spacing:.3em;
          font-size:12px;
          opacity:.5;
          margin-bottom:20px;
          font-family:var(--font-body);
        }
        .home-horizontal-story-title{
          margin:0;
          max-width:720px;
          font-family:var(--font-heading)!important;
          font-size:clamp(3rem,7vw,7rem);
          font-weight:900!important;
          font-variation-settings:"wght" 900!important;
          line-height:.9;
          letter-spacing:-.055em;
        }
        .home-horizontal-story-desc{
          margin:24px 0 0;
          opacity:.6;
          max-width:500px;
          line-height:1.6;
          color:var(--rosta-cream);
          font-family:var(--font-body);
          font-size:clamp(.95rem,1.2vw,1.15rem);
        }
        .home-horizontal-story-cards{
          position:relative;
          height:500px;
        }
        .home-horizontal-story-card.card{
          position:absolute;
          width:320px;
          height:420px;
          border-radius:30px;
          overflow:hidden;
          transition:transform .35s cubic-bezier(.2,.8,.2,1),
                     box-shadow .35s ease,
                     filter .35s ease;
          will-change:transform;
          transform-origin:center;
          box-shadow:0 10px 30px rgba(0,0,0,.3);
          background:rgba(255,255,255,.05);
          border:1px solid rgba(255,255,255,.1);
        }
        .home-horizontal-story-card.card:hover{
          transform:translateY(-18px) scale(1.08) rotate(6deg);
          box-shadow:0 40px 120px rgba(0,0,0,.7),
                     0 0 50px rgba(255,255,255,.18);
          filter:brightness(1.2) saturate(1.3);
          z-index:10;
        }
        .home-horizontal-story-card.red{transform:rotate(-10deg);left:6%;top:6%}
        .home-horizontal-story-card.orange{transform:rotate(8deg);opacity:.8;right:6%;top:12%}
        .home-horizontal-story-card.blue{transform:rotate(10deg);left:6%;top:6%}
        .home-horizontal-story-card.cyan{transform:rotate(-6deg);opacity:.8;right:6%;top:12%}
        .home-horizontal-story-card.green{transform:rotate(-12deg);left:6%;top:6%}
        .home-horizontal-story-card.emerald{transform:rotate(5deg);opacity:.8;right:6%;top:12%}
        .home-horizontal-story-card.pink{transform:rotate(8deg);left:6%;top:6%}
        .home-horizontal-story-card.light-pink{transform:rotate(-8deg);opacity:.8;right:6%;top:12%}
        .home-horizontal-story-media,
        .home-horizontal-story-media :is(img,video){
          display:block;
          width:100%;
          height:100%;
        }
        @media(max-width:767px){
          .home-horizontal-story-panel{
            padding:28px 22px 34px;
          }
          .home-horizontal-story-panel-inner{
            height:100%;
            grid-template-columns:1fr;
            grid-template-rows:auto 1fr;
            gap:22px;
            align-content:center;
          }
          .home-horizontal-story-copy{
            align-self:end;
            padding-top:84px;
          }
          .home-horizontal-story-label{
            margin-bottom:12px;
            font-size:10px;
          }
          .home-horizontal-story-title{
            font-size:clamp(2.8rem,13vw,4.6rem);
            line-height:.88;
          }
          .home-horizontal-story-desc{
            margin-top:16px;
            max-width:88vw;
            font-size:.95rem;
            line-height:1.5;
          }
          .home-horizontal-story-cards{
            align-self:start;
            height:42svh;
            min-height:300px;
          }
          .home-horizontal-story-card.card{
            width:min(58vw,260px);
            height:min(36svh,330px);
            border-radius:22px;
          }
          .home-horizontal-story-card.red,
          .home-horizontal-story-card.blue,
          .home-horizontal-story-card.green,
          .home-horizontal-story-card.pink{
            left:4%;
            top:5%;
          }
          .home-horizontal-story-card.orange,
          .home-horizontal-story-card.cyan,
          .home-horizontal-story-card.emerald,
          .home-horizontal-story-card.light-pink{
            right:4%;
            top:13%;
          }
        }
      `}</style>

      <div ref={wrapperRef} className="home-horizontal-story-wrapper horizontal-wrapper">
        {HORIZONTAL_STORY_PANELS.map((panel, index) => (
          <HorizontalStoryPanelView
            key={panel.label}
            panel={panel}
            index={index}
            themeSettings={themeSettings}
            mobileViewport={mobileViewport}
          />
        ))}
      </div>
    </section>
  );
}

function HorizontalStoryOutro() {
  return (
    <section className="home-horizontal-story-outro contact bg-carbon text-cream">
      <style>{`
        .home-horizontal-story-outro{
          min-height:100svh;
          display:flex;
          align-items:center;
          justify-content:center;
          text-align:center;
          padding:96px 60px 60px;
          background:var(--rosta-carbon);
          color:var(--rosta-cream);
        }
        .home-horizontal-story-outro-inner{
          width:min(100%,1200px);
        }
        .home-horizontal-story-outro-label{
          margin-bottom:20px;
          font-family:var(--font-body);
          font-size:12px;
          letter-spacing:.3em;
          opacity:.5;
        }
        .home-horizontal-story-outro-title{
          margin:0 auto;
          max-width:1050px;
          font-family:var(--font-heading)!important;
          font-size:clamp(3rem,7vw,7rem);
          font-weight:900!important;
          font-variation-settings:"wght" 900!important;
          line-height:.9;
          letter-spacing:-.055em;
        }
        .home-horizontal-story-outro-desc{
          margin:28px auto 0;
          max-width:500px;
          font-family:var(--font-body);
          font-size:clamp(.95rem,1.2vw,1.15rem);
          line-height:1.6;
          opacity:.6;
        }
        .home-horizontal-story-outro-cta{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          margin-top:30px;
          padding:15px 35px;
          border:1px solid color-mix(in srgb,var(--rosta-cream) 20%,transparent);
          border-radius:999px;
          color:var(--rosta-cream);
          background:transparent;
          font-family:var(--font-body);
          font-size:.92rem;
          text-decoration:none;
          transition:background-color .25s ease,color .25s ease,border-color .25s ease;
        }
        .home-horizontal-story-outro-cta:hover{
          background:var(--rosta-cream);
          color:var(--rosta-carbon);
          border-color:var(--rosta-cream);
        }
        @media(max-width:767px){
          .home-horizontal-story-outro{
            padding:92px 22px 44px;
          }
          .home-horizontal-story-outro-title{
            font-size:clamp(3rem,14vw,5.2rem);
            line-height:.88;
          }
          .home-horizontal-story-outro-desc{
            margin-top:20px;
            max-width:88vw;
          }
        }
      `}</style>
      <div className="home-horizontal-story-outro-inner">
        <div
          className="home-horizontal-story-outro-label"
          data-theme-id="home-horizontal-outro-label"
          data-theme-label="Yatay hikaye kapanış etiketi"
        >
          ROSTA COFFEE CO.
        </div>
        <h2
          className="home-horizontal-story-outro-title"
          data-theme-id="home-horizontal-outro-title"
          data-theme-label="Yatay hikaye kapanış başlığı"
        >
          Sıradaki Fincanını Seç.
        </h2>
        <p
          className="home-horizontal-story-outro-desc"
          data-theme-id="home-horizontal-outro-desc"
          data-theme-label="Yatay hikaye kapanış açıklaması"
        >
          Her fincanın bir karakteri var. Seninkini keşfet.
        </p>
        <a
          href="/collections"
          className="home-horizontal-story-outro-cta"
          data-theme-id="home-horizontal-outro-cta"
          data-theme-label="Yatay hikaye kapanış butonu"
        >
          Kahveleri Keşfet
        </a>
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
    <HorizontalPortfolioStory themeSettings={liveThemeSettings} mobileViewport={mobileViewport} />
    <HorizontalStoryOutro />
    </>
  );
}
