"use client";

import Link from "next/link";
import { useRostaPointsSettings } from "@/lib/useRostaPointsSettings";

type Props = {
  sectionId: string;
  settings?: Record<string, unknown>;
  desktopSrc?: string;
  mobileSrc?: string;
  mediaType?: "image" | "video";
  posterUrl?: string;
  desktopPosition?: string;
  mobilePosition?: string;
  backgroundColor?: string;
  textColor?: string;
  paddingY?: number;
};

function text(settings: Record<string, unknown>, key: string, fallback = "", max = 1200) {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function safeHref(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  if ((raw.startsWith("/") && !raw.startsWith("//")) || raw.startsWith("#")) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function formatPoints(value: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.max(0, Math.floor(value || 0)));
}

export function StoreDesignRewardsPromo({
  sectionId,
  settings = {},
  desktopSrc,
  mobileSrc,
  mediaType,
  posterUrl,
  desktopPosition,
  mobilePosition,
  backgroundColor,
  textColor,
  paddingY = 72,
}: Props) {
  const rewards = useRostaPointsSettings();
  const title = text(settings, "title", "Points Ayrıcalıkları", 220);
  const body = text(
    settings,
    "body",
    "Alışverişlerinden puan kazan, hesabındaki puanları sonraki siparişlerinde kullan.",
    1200,
  );
  const linkLabel = text(settings, "linkLabel", "Programa Katıl", 100);
  const linkHref = safeHref(settings.linkHref) || "/register?redirect=/account";
  const layout = text(settings, "layout", "split") === "card" ? "card" : "split";
  const showSignupPoints = settings.showSignupPoints !== false;
  const showEarnRate = settings.showEarnRate !== false;
  const mediaSrc = desktopSrc || "";
  const mobileMediaSrc = mobileSrc || mediaSrc;

  const media = mediaSrc ? (
    mediaType === "video" ? (
      <video
        className="v2-rewards-promo-media h-full w-full object-cover"
        poster={posterUrl}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        style={{
          ["--rewards-pos-desktop" as string]: desktopPosition || "50% 50%",
          ["--rewards-pos-mobile" as string]: mobilePosition || desktopPosition || "50% 50%",
        }}
      >
        {mobileSrc ? <source media="(max-width: 767px)" src={mobileMediaSrc} /> : null}
        <source src={mediaSrc} />
      </video>
    ) : (
      <picture className="block h-full">
        {mobileSrc ? <source media="(max-width: 767px)" srcSet={mobileMediaSrc} /> : null}
        <img
          src={mediaSrc}
          alt=""
          className="v2-rewards-promo-media h-full w-full object-cover"
          style={{
            ["--rewards-pos-desktop" as string]: desktopPosition || "50% 50%",
            ["--rewards-pos-mobile" as string]: mobilePosition || desktopPosition || "50% 50%",
          }}
        />
      </picture>
    )
  ) : null;

  return (
    <section
      data-theme-section-id={sectionId}
      data-editor-id={`section:${sectionId}`}
      data-editor-type="rewards-promo"
      data-editor-label={title}
      className="px-5 md:px-8"
      style={{
        background: backgroundColor || "transparent",
        color: textColor || "inherit",
        paddingTop: paddingY,
        paddingBottom: paddingY,
      }}
    >
      <div className={layout === "split" ? "mx-auto grid max-w-7xl overflow-hidden rounded-[28px] border border-current/10 md:grid-cols-2" : "mx-auto max-w-4xl overflow-hidden rounded-[28px] border border-current/10"}>
        {media ? (
          <div className={layout === "split" ? "min-h-[320px] overflow-hidden md:min-h-[460px]" : "aspect-[16/8] overflow-hidden"}>
            {media}
          </div>
        ) : null}

        <div className="flex flex-col justify-center p-7 md:p-10">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-brick">Points</p>
          <h2 className="mt-3 font-heading text-[clamp(2rem,5vw,4rem)] leading-[0.98]">{title}</h2>
          {body ? <p className="mt-5 max-w-2xl whitespace-pre-wrap text-sm leading-7 opacity-70">{body}</p> : null}

          {(showSignupPoints || showEarnRate) ? (
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {showSignupPoints ? (
                <div className="rounded-2xl border border-current/10 p-4">
                  <p className="text-[9px] uppercase tracking-[0.14em] opacity-50">Hoş geldin puanı</p>
                  <strong className="mt-2 block font-heading text-2xl">{formatPoints(rewards.signupPoints)}</strong>
                </div>
              ) : null}
              {showEarnRate ? (
                <div className="rounded-2xl border border-current/10 p-4">
                  <p className="text-[9px] uppercase tracking-[0.14em] opacity-50">Kazanma oranı</p>
                  <strong className="mt-2 block font-heading text-2xl">1 TL = {formatPoints(rewards.pointsPerTl)} Point</strong>
                </div>
              ) : null}
            </div>
          ) : null}

          {linkLabel && linkHref ? (
            <Link href={linkHref} className="mt-7 inline-flex min-h-11 items-center justify-center self-start rounded-full bg-brick px-6 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--rosta-action-text,#FBF3E6)]">
              {linkLabel}
            </Link>
          ) : null}
        </div>
      </div>
      <style>{`.v2-rewards-promo-media{object-position:var(--rewards-pos-mobile)}@media(min-width:768px){.v2-rewards-promo-media{object-position:var(--rewards-pos-desktop)}}`}</style>
    </section>
  );
}
