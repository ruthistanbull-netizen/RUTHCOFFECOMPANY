"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Cake,
  CheckCircle2,
  ChevronRight,
  Gift,
  ShoppingBag,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCart } from "@/components/cart/CartProvider";
import {
  ROSTA_POINTS_UPDATED_EVENT,
  calculateRostaPoints,
  formatRostaPointsNumber,
  grantRostaWelcomePoints,
  pointsToLira,
} from "@/lib/rewards";
import { useRostaPointsSettings } from "@/lib/useRostaPointsSettings";
import { displayBirthDate, formatManualDateInput } from "@/lib/manualDate";
import { resolveThemeElementOverrides, type ThemeCustomizerSettings } from "@/lib/themeCustomizer";

function formatLira(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

type RewardSection = "earn" | "spend";
type BirthdayStatus = {
  birthDate: string | null;
  eligible: boolean;
  claimed: boolean;
  windowEnd: string | null;
  birthdayPoints: number;
  rewardPointsBalance?: number;
  error?: string;
};

function CoffeeBeanMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M19.15 4.86C15.98 1.7 10.5 2.06 6.9 5.67c-3.62 3.62-3.98 9.1-.82 12.27 3.17 3.16 8.65 2.8 12.27-.82 3.61-3.61 3.97-9.09.8-12.26Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.9 3.95c-1.9 2.52-4.16 3.52-6.08 4.38-2.53 1.13-4.48 2.01-5.72 5.77-.47 1.43-.55 2.7-.31 3.75"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.2 19.18c1.87-2.46 4.08-3.46 5.98-4.3 2.54-1.14 4.52-2.03 5.77-5.82.45-1.37.54-2.61.33-3.64"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RostaPointsWidget({ themeSettings }: { themeSettings: ThemeCustomizerSettings }) {
  const { isLoggedIn, isLoading, session } = useAuth();
  const { isOpen: isCartOpen } = useCart();
  const reduceMotion = useReducedMotion();
  const rewardSettings = useRostaPointsSettings();
  const signupPoints = rewardSettings.signupPoints;
  const configuredBirthdayPoints = rewardSettings.birthdayPoints;

  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<RewardSection | null>(null);
  const [liveThemeSettings, setLiveThemeSettings] = useState(themeSettings);
  const [mobileViewport, setMobileViewport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [birthday, setBirthday] = useState<BirthdayStatus>({
    birthDate: null,
    eligible: false,
    claimed: false,
    windowEnd: null,
    birthdayPoints: 0,
  });
  const [birthdayInput, setBirthdayInput] = useState("");
  const [serverPoints, setServerPoints] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [savingBirthday, setSavingBirthday] = useState(false);

  const closeRewards = () => setIsOpen(false);

  useEffect(() => {
    setLiveThemeSettings(themeSettings);
  }, [themeSettings]);

  useEffect(() => {
    const syncViewport = () => setMobileViewport(window.innerWidth < 768);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("themeEditor") !== "1") return;
    if (window.parent === window) return;
    const onThemeMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !event.data || typeof event.data !== "object") return;
      if (event.data.type !== "RUTH_THEME_EDITOR_SETTINGS" || !event.data.settings) return;
      setLiveThemeSettings(event.data.settings as ThemeCustomizerSettings);
    };
    window.addEventListener("message", onThemeMessage);
    return () => window.removeEventListener("message", onThemeMessage);
  }, []);

  const rewardsMediaOverride = useMemo(() => {
    const overrides = resolveThemeElementOverrides(liveThemeSettings, "/");
    const stable = overrides.find((item) => item.id === "rosta-points-offer-image");
    if (stable) return stable;
    return [...overrides].reverse().find((item) =>
      item.kind === "image"
      && item.label === "ROSTA Coffee Co. kahve"
      && Boolean(item.desktopImageSrc || item.mobileImageSrc || item.imageSrc),
    );
  }, [liveThemeSettings]);

  const rewardsMedia = useMemo(() => {
    const override = rewardsMediaOverride;
    const src = mobileViewport
      ? override?.mobileImageSrc || override?.imageSrc || override?.desktopImageSrc || "/home/rosta-under-hero-photo.jpg"
      : override?.desktopImageSrc || override?.imageSrc || override?.mobileImageSrc || "/home/rosta-under-hero-photo.jpg";
    const explicitType = mobileViewport
      ? override?.mobileMediaType || override?.mediaType || override?.desktopMediaType
      : override?.desktopMediaType || override?.mediaType || override?.mobileMediaType;
    const mediaType = explicitType || (/\.(mp4|m4v|mov|webm)(?:$|[?#])/i.test(src) ? "video" : "image");
    return { src, mediaType };
  }, [mobileViewport, rewardsMediaOverride]);

  useEffect(() => {
    const open = () => setIsOpen(true);
    window.addEventListener("rosta-open-points", open);
    return () => window.removeEventListener("rosta-open-points", open);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    grantRostaWelcomePoints();
    setRefreshKey((value) => value + 1);
  }, [isLoggedIn]);

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1);
    window.addEventListener(ROSTA_POINTS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ROSTA_POINTS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    if (isCartOpen) setIsOpen(false);
  }, [isCartOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRewards();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const loadBirthday = async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch("/api/rewards/birthday", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const data = await response.json();
      if (data.ok) {
        setBirthday(data);
        if (Number.isFinite(Number(data.rewardPointsBalance))) {
          setServerPoints(Math.max(0, Math.floor(Number(data.rewardPointsBalance))));
        }
        if (data.birthDate) setBirthdayInput(displayBirthDate(data.birthDate));
      }
    } catch {
      // Puan alanı diğer özellikleri engellemesin.
    }
  };

  const loadBalance = async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch("/api/rewards/balance", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const data = await response.json();
      if (data.ok) setServerPoints(Math.max(0, Math.floor(Number(data.points || 0))));
    } catch {
      // Puan alanı ödeme akışını engellemesin.
    }
  };

  useEffect(() => {
    void loadBirthday();
    void loadBalance();
  }, [session?.access_token, isOpen]);

  const rewardSummary = useMemo(
    () => calculateRostaPoints({ isLoggedIn, birthdayPoints: birthday.birthdayPoints }),
    [isLoggedIn, refreshKey, birthday.birthdayPoints],
  );

  const visiblePoints = isLoggedIn
    ? Math.max(0, Math.floor(serverPoints ?? rewardSummary.totalPoints))
    : signupPoints;
  const visibleDiscount = pointsToLira(visiblePoints);
  const birthdayAwardPoints = birthday.birthdayPoints > 0
    ? birthday.birthdayPoints
    : configuredBirthdayPoints;
  const birthdayAwardText = `${formatRostaPointsNumber(birthdayAwardPoints)} ROSTA Points`;

  const saveBirthday = async () => {
    if (!session?.access_token || !birthdayInput || savingBirthday) return;
    setSavingBirthday(true);
    setBirthday((current) => ({ ...current, error: undefined }));
    try {
      const response = await fetch("/api/account/birth-date", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ birthDate: birthdayInput }),
      });
      const data = await response.json();
      if (!data.ok) {
        setBirthday((current) => ({
          ...current,
          error: data.error || "Doğum tarihi kaydedilemedi.",
        }));
        return;
      }
      await loadBirthday();
    } catch {
      setBirthday((current) => ({ ...current, error: "Doğum tarihi kaydedilemedi." }));
    } finally {
      setSavingBirthday(false);
    }
  };

  const claimBirthday = async () => {
    if (!session?.access_token || claiming || birthday.claimed) return;
    setClaiming(true);
    setBirthday((current) => ({ ...current, error: undefined }));
    try {
      const response = await fetch("/api/rewards/birthday", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      if (data.ok) {
        setBirthday(data);
        if (Number.isFinite(Number(data.rewardPointsBalance))) {
          setServerPoints(Math.max(0, Math.floor(Number(data.rewardPointsBalance))));
        }
        setRefreshKey((value) => value + 1);
      } else {
        setBirthday((current) => ({
          ...current,
          error: data.error || "Puan eklenemedi.",
        }));
      }
    } finally {
      setClaiming(false);
    }
  };

  const sheetTransition = reduceMotion
    ? { duration: 0.01 }
    : { duration: 0.48, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

  return (
    <>
      <style jsx global>{`
        .rewards-floating-bubble.rosta-points-offer-trigger {
          overflow: hidden;
          border: 1px solid color-mix(in srgb, var(--rosta-kraft) 42%, transparent) !important;
          background: color-mix(in srgb, var(--rosta-carbon-soft) 96%, transparent) !important;
          color: var(--rosta-cream) !important;
          box-shadow: 0 12px 34px color-mix(in srgb, var(--rosta-carbon) 46%, transparent) !important;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }
        .rosta-points-offer-trigger .rewards-floating-icon {
          background: var(--rosta-brick-b) !important;
          color: var(--rosta-action-text) !important;
        }
        .rewards-overlay.rosta-points-offer-overlay {
          position: fixed !important;
          inset: 0 !important;
          z-index: 9998 !important;
          background: var(--ruth-color-overlay) !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        .rewards-panel.rosta-points-offer-modal {
          position: fixed !important;
          z-index: 9999 !important;
          top: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          left: auto !important;
          display: flex !important;
          width: min(640px, 100vw) !important;
          height: 100dvh !important;
          max-height: none !important;
          flex-direction: column !important;
          overflow: hidden !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: var(--rosta-carbon-soft) !important;
          color: var(--rosta-cream) !important;
          box-shadow: -24px 0 70px color-mix(in srgb, var(--rosta-carbon) 58%, transparent) !important;
          transform-origin: 100% 50%;
        }
        .rosta-points-offer-modal .rewards-close {
          position: absolute;
          top: max(18px, env(safe-area-inset-top));
          right: max(18px, env(safe-area-inset-right));
          z-index: 20;
          display: inline-flex;
          width: 38px;
          height: 38px;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: var(--rosta-cream);
          transition: background 180ms ease;
        }
        .rosta-points-offer-scroll {
          min-height: 0;
          flex: 1 1 auto;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: var(--rosta-kraft) transparent;
        }
        .rosta-points-offer-scroll::-webkit-scrollbar { width: 5px; }
        .rosta-points-offer-scroll::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: var(--rosta-kraft);
        }
        .rosta-points-offer-copy {
          position: relative;
          padding: 52px 52px 46px;
          background: var(--rosta-carbon-soft);
        }
        .rosta-points-offer-brand {
          display: flex;
          min-height: 42px;
          align-items: center;
          margin-bottom: 28px;
        }
        .rosta-points-offer-brand-mark {
          display: block;
          width: 142px;
          max-width: 142px;
          height: 60px;
          background: currentColor;
          -webkit-mask: url("/rosta-wordmark.svg") left center / contain no-repeat;
          mask: url("/rosta-wordmark.svg") left center / contain no-repeat;
          color: inherit;
        }
        .rosta-points-offer-brand-fallback {
          font-family: var(--font-heading);
          font-size: 12px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }
        .rosta-points-offer-copy h2 {
          max-width: 500px;
          margin: 0;
          color: var(--rosta-cream);
          font-family: var(--font-heading);
          font-size: clamp(34px, 5vw, 48px);
          font-weight: 900;
          line-height: 1.04;
          letter-spacing: -0.035em;
        }
        .rosta-points-offer-copy > p {
          max-width: 480px;
          margin: 15px 0 0;
          color: color-mix(in srgb, var(--rosta-cream) 70%, transparent);
          font-size: 15px;
          line-height: 1.55;
        }
        .rosta-points-offer-action-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          margin-top: 28px;
        }
        .rosta-points-offer-balance {
          display: flex;
          min-width: 0;
          min-height: 52px;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 0 18px;
          border: 1px solid color-mix(in srgb, var(--rosta-kraft) 42%, transparent);
          border-radius: 999px;
          background: var(--rosta-carbon);
        }
        .rosta-points-offer-balance span {
          overflow: hidden;
          color: color-mix(in srgb, var(--rosta-cream) 70%, transparent);
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rosta-points-offer-balance strong {
          color: var(--rosta-cream);
          font-family: var(--font-heading);
          font-size: 17px;
          font-weight: 500;
          white-space: nowrap;
        }
        .rosta-points-offer-cta {
          display: inline-flex;
          min-width: 126px;
          min-height: 52px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 23px;
          border-radius: 999px;
          border: 1px solid var(--rosta-brick-b);
          background: var(--rosta-brick-b);
          color: var(--rosta-action-text) !important;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none !important;
          transition: background 180ms ease;
        }
        .rosta-points-offer-legal {
          margin-top: 13px !important;
          color: color-mix(in srgb, var(--rosta-cream) 70%, transparent) !important;
          font-size: 10.5px !important;
          line-height: 1.5 !important;
        }
        .rosta-points-offer-legal a {
          color: color-mix(in srgb, var(--rosta-cream) 70%, transparent);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .rosta-points-offer-photo {
          position: relative;
          width: 100%;
          height: min(43vw, 390px);
          min-height: 300px;
          overflow: hidden;
          background: var(--rosta-kraft);
        }
        .rosta-points-offer-photo img,
        .rosta-points-offer-photo video {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: 50% 42%;
        }
        .rosta-points-offer-photo::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(180deg, color-mix(in srgb, var(--rosta-carbon) 6%, transparent), color-mix(in srgb, var(--rosta-carbon) 28%, transparent));
        }
        .rosta-points-offer-details {
          padding: 28px 52px calc(40px + env(safe-area-inset-bottom));
          background: var(--rosta-carbon-soft);
        }
        .rosta-points-offer-section-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid color-mix(in srgb, var(--rosta-kraft) 42%, transparent);
        }
        .rosta-points-offer-section-head span {
          display: block;
          margin-bottom: 5px;
          color: var(--rosta-brick-b);
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .rosta-points-offer-section-head h3 {
          margin: 0;
          color: var(--rosta-cream);
          font-family: var(--font-heading);
          font-size: 23px;
          font-weight: 500;
          letter-spacing: -0.02em;
        }
        .rosta-points-offer-value {
          text-align: right;
        }
        .rosta-points-offer-value strong {
          display: block;
          font-family: var(--font-heading);
          font-size: 22px;
          font-weight: 500;
        }
        .rosta-points-offer-value small {
          display: block;
          margin-top: 3px;
          color: color-mix(in srgb, var(--rosta-cream) 70%, transparent);
          font-size: 10px;
        }
        .rosta-points-offer-accordion {
          border-bottom: 1px solid var(--rosta-kraft);
        }
        .rosta-points-offer-accordion-trigger {
          display: flex;
          width: 100%;
          min-height: 62px;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--rosta-cream);
          font-size: 13px;
          font-weight: 600;
          text-align: left;
        }
        .rosta-points-offer-accordion-trigger > span:first-child {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .rosta-points-offer-accordion-icon {
          display: inline-flex;
          width: 30px;
          height: 30px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: var(--rosta-carbon-soft);
          color: var(--rosta-cream);
        }
        .rosta-points-offer-accordion-content { overflow: hidden; }
        .rosta-points-offer-action-item {
          display: grid;
          grid-template-columns: 30px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 13px 0;
          border-top: 1px solid color-mix(in srgb, var(--rosta-kraft) 42%, transparent);
          color: var(--rosta-cream);
        }
        button.rosta-points-offer-action-item {
          width: 100%;
          border-right: 0;
          border-bottom: 0;
          border-left: 0;
          background: transparent;
          text-align: left;
        }
        .rosta-points-offer-action-item > svg:first-child {
          width: 19px;
          height: 19px;
          color: var(--rosta-cream);
        }
        .rosta-points-offer-action-item strong {
          display: block;
          font-size: 12.5px;
          font-weight: 600;
        }
        .rosta-points-offer-action-item span {
          display: block;
          margin-top: 3px;
          color: color-mix(in srgb, var(--rosta-cream) 70%, transparent);
          font-size: 11px;
          line-height: 1.45;
        }
        .rosta-points-offer-action-item:disabled { opacity: 0.6; }
        .rosta-points-birthday-fields {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }
        .rosta-points-birthday-fields input {
          width: 130px;
          min-height: 36px;
          padding: 0 11px;
          border: 1px solid var(--rosta-kraft);
          border-radius: 8px;
          background: var(--rosta-carbon-soft);
          color: var(--rosta-cream);
          font-size: 11px;
          outline: none;
        }
        .rosta-points-birthday-fields input:focus-visible {
          border-color: var(--rosta-brick-b);
          outline: 2px solid var(--rosta-brick-b);
          outline-offset: 2px;
          box-shadow: none;
        }
        .rosta-points-birthday-fields button {
          min-height: 36px;
          padding: 0 13px;
          border: 0;
          border-radius: 8px;
          border: 1px solid var(--rosta-brick-b);
          background: var(--rosta-brick-b);
          color: var(--rosta-action-text);
          font-size: 10.5px;
        }
        .rosta-points-offer-note {
          margin: 4px 0 14px;
          color: color-mix(in srgb, var(--rosta-cream) 70%, transparent);
          font-size: 10.5px;
        }
        .rewards-error-text {
          color: var(--ruth-color-danger) !important;
          font-size: 10px !important;
        }
        .rosta-points-offer-cta:active,
        .rosta-points-birthday-fields button:active {
          border-color: var(--rosta-espresso) !important;
          background: var(--rosta-espresso) !important;
          color: var(--rosta-cream) !important;
        }
        .rosta-points-offer-modal :where(button, a, input):focus-visible {
          outline: 2px solid var(--rosta-brick-b);
          outline-offset: 2px;
        }
        @media (hover: hover) and (pointer: fine) {
          .rosta-points-offer-modal .rewards-close:hover {
            background: var(--ruth-color-accent-wash);
          }
          .rosta-points-offer-cta:hover {
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rosta-cream) 74%, transparent);
          }
          .rosta-points-offer-legal a:hover,
          .rosta-points-offer-accordion-trigger:hover {
            color: var(--rosta-brick-b);
          }
        }
        @media (forced-colors: active) {
          .rosta-points-offer-modal :where(button, a, input):focus-visible {
            outline: 2px solid Highlight;
          }
        }
        @media (max-width: 767px) {
          .rewards-panel.rosta-points-offer-modal {
            width: 100vw !important;
          }
          .rosta-points-offer-copy {
            padding: calc(44px + env(safe-area-inset-top)) 24px 34px;
          }
          .rosta-points-offer-brand { margin-bottom: 22px; }
          .rosta-points-offer-brand-mark { width: 124px; max-width: 124px; height: 52px; }
          .rosta-points-offer-copy h2 { font-size: 34px; }
          .rosta-points-offer-copy > p { margin-top: 12px; font-size: 13px; }
          .rosta-points-offer-action-row {
            grid-template-columns: 1fr;
            margin-top: 22px;
          }
          .rosta-points-offer-cta { width: 100%; }
          .rosta-points-offer-photo {
            height: 44vh;
            min-height: 280px;
            max-height: 430px;
          }
          .rosta-points-offer-details {
            padding: 24px 24px calc(34px + env(safe-area-inset-bottom));
          }
          .rosta-points-offer-section-head h3 { font-size: 21px; }
          .rosta-points-offer-value strong { font-size: 20px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .rosta-points-offer-trigger,
          .rosta-points-offer-modal * {
            scroll-behavior: auto !important;
          }
        }
      `}</style>

      <motion.button
        type="button"
        className={`rewards-floating-bubble rosta-points-offer-trigger premium-touch ${
          isCartOpen ? "rewards-floating-bubble--cart-open" : ""
        }`}
        onClick={() => setIsOpen(true)}
        aria-label="ROSTA Points avantajlarını aç"
        whileHover={reduceMotion ? undefined : { y: -3, scale: 1.015 }}
        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
        transition={{ type: "spring", stiffness: 430, damping: 28 }}
      >
        <span className="rewards-floating-icon"><CoffeeBeanMark size={18} /></span>
        <span>Avantajlar</span>
      </motion.button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <>
            <motion.button
              key="rosta-points-offer-overlay"
              type="button"
              className="rewards-overlay rosta-points-offer-overlay"
              aria-label="ROSTA Points penceresini kapat"
              onClick={closeRewards}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.24, ease: "easeOut" }}
            />

            <motion.aside
              key="rosta-points-offer-modal"
              className="rewards-panel rosta-points-offer-modal"
              role="dialog"
              aria-modal="true"
              aria-label="ROSTA Points"
              initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
              animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
              transition={sheetTransition}
            >
              <motion.button
                type="button"
                className="rewards-close"
                onClick={closeRewards}
                aria-label="Kapat"
                whileHover={reduceMotion ? undefined : { rotate: 5, scale: 1.05 }}
                whileTap={reduceMotion ? undefined : { scale: 0.88 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
              >
                <X size={19} />
              </motion.button>

              <div className="rosta-points-offer-scroll">
                <section className="rosta-points-offer-copy">
                  <motion.div
                    className="rosta-points-offer-brand"
                    initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : 0.12, duration: 0.36 }}
                  >
                    <span
                      className="rosta-points-offer-brand-mark"
                      role="img"
                      aria-label="ROSTA Coffee Co."
                    />
                  </motion.div>

                  <motion.h2
                    initial={reduceMotion ? undefined : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : 0.17, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {isLoggedIn
                      ? "ROSTA Points ayrıcalıklarını kullan"
                      : `Üye ol & ${formatRostaPointsNumber(signupPoints)} ROSTA Points kazan`}
                  </motion.h2>

                  <motion.p
                    initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : 0.22, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {isLoggedIn
                      ? `${formatRostaPointsNumber(visiblePoints)} puanın hesabında aktif. Puanlarını ödeme adımında indirime dönüştürebilirsin.`
                      : "ROSTA Points programına katıl, alışverişlerinden puan kazan ve puanlarını sonraki siparişlerinde indirime dönüştür."}
                  </motion.p>

                  <motion.div
                    className="rosta-points-offer-action-row"
                    initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : 0.27, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="rosta-points-offer-balance">
                      <span>{isLoggedIn ? "Mevcut bakiye" : "Hoş geldin değeri"}</span>
                      <strong>{formatLira(visibleDiscount)}</strong>
                    </div>

                    <motion.div
                      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                      transition={{ type: "spring", stiffness: 430, damping: 28 }}
                    >
                      <Link
                        href={isLoggedIn ? "/account" : "/register?redirect=/account"}
                        className="rosta-points-offer-cta"
                        onClick={closeRewards}
                      >
                        {isLoggedIn ? "Hesabım" : "Hemen Katıl"}
                        <ChevronRight size={15} />
                      </Link>
                    </motion.div>
                  </motion.div>

                  {!isLoading && !isLoggedIn ? (
                    <p className="rosta-points-offer-legal">
                      Zaten hesabın var mı?{" "}
                      <Link href="/login?redirect=/account" onClick={closeRewards}>Giriş yap</Link>.
                      Üye olarak ROSTA Points koşullarını kabul etmiş olursun.
                    </p>
                  ) : (
                    <p className="rosta-points-offer-legal">
                      Puanların ödeme adımında kullanılabilir ve yaklaşık indirim değeri bakiyene göre hesaplanır.
                    </p>
                  )}
                </section>

                <motion.div
                  className="rosta-points-offer-photo"
                  initial={reduceMotion ? undefined : { opacity: 0.86 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: reduceMotion ? 0 : 0.08, duration: 0.55 }}
                >
                  {rewardsMedia.mediaType === "video" ? (
                    <motion.video
                      key={`video-${rewardsMedia.src}`}
                      data-theme-id="rosta-points-offer-image"
                      data-theme-label="ROSTA Points görseli"
                      src={rewardsMedia.src}
                      aria-label="ROSTA Coffee Co. kahve"
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                      disablePictureInPicture
                      initial={reduceMotion ? undefined : { scale: 1.035 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: reduceMotion ? 0.01 : 0.9, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ) : (
                    <motion.img
                      key={`image-${rewardsMedia.src}`}
                      data-theme-id="rosta-points-offer-image"
                      data-theme-label="ROSTA Points görseli"
                      src={rewardsMedia.src}
                      alt="ROSTA Coffee Co. kahve"
                      initial={reduceMotion ? undefined : { scale: 1.035 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: reduceMotion ? 0.01 : 0.9, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                </motion.div>

                <section className="rosta-points-offer-details">
                  <div className="rosta-points-offer-section-head">
                    <div>
                      <span>Bakiye ve kullanım</span>
                      <h3>ROSTA Points</h3>
                    </div>
                    <div className="rosta-points-offer-value">
                      <strong>{formatRostaPointsNumber(visiblePoints)}</strong>
                      <small>≈ {formatLira(visibleDiscount)}</small>
                    </div>
                  </div>

                  <div className="rosta-points-offer-accordion">
                    <motion.button
                      type="button"
                      className="rosta-points-offer-accordion-trigger"
                      onClick={() => setActiveSection(activeSection === "earn" ? null : "earn")}
                      aria-expanded={activeSection === "earn"}
                      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                    >
                      <span>
                        <span className="rosta-points-offer-accordion-icon"><Sparkles size={15} /></span>
                        Kazanma Yolları
                      </span>
                      <motion.span
                        animate={{ rotate: activeSection === "earn" ? 90 : 0 }}
                        transition={{ type: "spring", stiffness: 420, damping: 28 }}
                      >
                        <ChevronRight size={16} />
                      </motion.span>
                    </motion.button>

                    <AnimatePresence initial={false}>
                      {activeSection === "earn" ? (
                        <motion.div
                          className="rosta-points-offer-accordion-content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={reduceMotion ? { duration: 0.01 } : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <div className="rosta-points-offer-action-item">
                            <UserPlus size={19} />
                            <div><strong>Üye ol</strong><span>{formatRostaPointsNumber(signupPoints)} ROSTA Points</span></div>
                            {isLoggedIn ? <CheckCircle2 size={17} /> : null}
                          </div>
                          <div className="rosta-points-offer-action-item">
                            <ShoppingBag size={19} />
                            <div><strong>Sipariş ver</strong><span>Harcanan her 1 TL için 1 ROSTA Point</span></div>
                            <span />
                          </div>

                          {isLoggedIn ? (
                            birthday.birthDate ? (
                              <button
                                type="button"
                                className="rosta-points-offer-action-item"
                                onClick={claimBirthday}
                                disabled={claiming || birthday.claimed}
                              >
                                <Cake size={19} />
                                <div>
                                  <strong>
                                    {birthday.claimed
                                      ? "Doğum günü puanın eklendi"
                                      : birthday.eligible
                                        ? `${formatRostaPointsNumber(birthdayAwardPoints)} puanı hesabına ekle`
                                        : "Doğum gününde puan kazan"}
                                  </strong>
                                  <span>
                                    {birthday.claimed
                                      ? `Bu yılın ${formatRostaPointsNumber(birthdayAwardPoints)} puanı hesabında.`
                                      : birthday.eligible
                                        ? `Doğum günü haftan ${birthday.windowEnd} tarihine kadar geçerli.`
                                        : `Doğum gününde ve sonraki 7 gün içinde ${birthdayAwardText} kazan.`}
                                  </span>
                                  {birthday.error ? <span className="rewards-error-text">{birthday.error}</span> : null}
                                </div>
                                {birthday.claimed ? <CheckCircle2 size={17} /> : <ChevronRight size={16} />}
                              </button>
                            ) : (
                              <div className="rosta-points-offer-action-item">
                                <Cake size={19} />
                                <div>
                                  <strong>Doğum gününde puan kazan</strong>
                                  <span>Doğum tarihini ekle; doğum gününde ve sonraki 7 gün içinde {formatRostaPointsNumber(birthdayAwardPoints)} puanı hesabına al.</span>
                                  <div className="rosta-points-birthday-fields">
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      maxLength={10}
                                      placeholder="GG.AA.YYYY"
                                      value={birthdayInput}
                                      onChange={(event) => setBirthdayInput(formatManualDateInput(event.target.value))}
                                      aria-label="Doğum tarihi"
                                    />
                                    <button type="button" onClick={saveBirthday} disabled={!birthdayInput || savingBirthday}>
                                      {savingBirthday ? "Kaydediliyor" : "Kaydet"}
                                    </button>
                                  </div>
                                  {birthday.error ? <span className="rewards-error-text">{birthday.error}</span> : null}
                                </div>
                                <span />
                              </div>
                            )
                          ) : (
                            <div className="rosta-points-offer-action-item">
                              <Cake size={19} />
                              <div><strong>Doğum gününde puan kazan</strong><span>{birthdayAwardText}</span></div>
                              <span />
                            </div>
                          )}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>

                  <div className="rosta-points-offer-accordion">
                    <motion.button
                      type="button"
                      className="rosta-points-offer-accordion-trigger"
                      onClick={() => setActiveSection(activeSection === "spend" ? null : "spend")}
                      aria-expanded={activeSection === "spend"}
                      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                    >
                      <span>
                        <span className="rosta-points-offer-accordion-icon"><Gift size={15} /></span>
                        Kullanma Yolları
                      </span>
                      <motion.span
                        animate={{ rotate: activeSection === "spend" ? 90 : 0 }}
                        transition={{ type: "spring", stiffness: 420, damping: 28 }}
                      >
                        <ChevronRight size={16} />
                      </motion.span>
                    </motion.button>

                    <AnimatePresence initial={false}>
                      {activeSection === "spend" ? (
                        <motion.div
                          className="rosta-points-offer-accordion-content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={reduceMotion ? { duration: 0.01 } : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                        >
                          {[500, 1000, 2000, 5000].map((points) => (
                            <div key={points} className="rosta-points-offer-action-item">
                              <Gift size={19} />
                              <div><strong>{formatLira(pointsToLira(points))} indirim</strong><span>{formatRostaPointsNumber(points)} ROSTA Points</span></div>
                              <span />
                            </div>
                          ))}
                          <p className="rosta-points-offer-note">Puanlarını ödeme adımında kullanabilirsin.</p>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </section>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
