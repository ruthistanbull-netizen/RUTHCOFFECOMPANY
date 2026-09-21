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
  RUTHIE_POINTS_UPDATED_EVENT,
  calculateRuthiePoints,
  formatRuthieNumber,
  grantRuthieWelcomePoints,
  pointsToLira,
} from "@/lib/rewards";
import { useRuthieRewardSettings } from "@/lib/useRuthieRewardSettings";
import { displayBirthDate, formatManualDateInput } from "@/lib/manualDate";

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

export function RewardsWidget() {
  const { isLoggedIn, isLoading, session } = useAuth();
  const { isOpen: isCartOpen } = useCart();
  const reduceMotion = useReducedMotion();
  const rewardSettings = useRuthieRewardSettings();
  const signupPoints = rewardSettings.signupPoints;
  const configuredBirthdayPoints = rewardSettings.birthdayPoints;

  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<RewardSection | null>(null);
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
    const open = () => setIsOpen(true);
    window.addEventListener("ruth-open-rewards", open);
    return () => window.removeEventListener("ruth-open-rewards", open);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    grantRuthieWelcomePoints();
    setRefreshKey((value) => value + 1);
  }, [isLoggedIn]);

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1);
    window.addEventListener(RUTHIE_POINTS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(RUTHIE_POINTS_UPDATED_EVENT, refresh);
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
    () => calculateRuthiePoints({ isLoggedIn, birthdayPoints: birthday.birthdayPoints }),
    [isLoggedIn, refreshKey, birthday.birthdayPoints],
  );

  const visiblePoints = isLoggedIn
    ? Math.max(0, Math.floor(serverPoints ?? rewardSummary.totalPoints))
    : signupPoints;
  const visibleDiscount = pointsToLira(visiblePoints);
  const birthdayAwardPoints = birthday.birthdayPoints > 0
    ? birthday.birthdayPoints
    : configuredBirthdayPoints;
  const birthdayAwardText = `${formatRuthieNumber(birthdayAwardPoints)} Ruthie Points`;

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
        .rewards-floating-bubble.ruthie-offer-trigger {
          overflow: hidden;
          border: 1px solid rgba(38, 32, 27, 0.14) !important;
          background: rgba(255, 255, 255, 0.92) !important;
          color: #171717 !important;
          box-shadow: 0 12px 34px rgba(0, 0, 0, 0.12) !important;
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }
        .ruthie-offer-trigger .rewards-floating-icon {
          background: #171717 !important;
          color: #fff !important;
        }
        .rewards-overlay.ruthie-offer-overlay {
          position: fixed !important;
          inset: 0 !important;
          z-index: 9998 !important;
          background: rgba(0, 0, 0, 0.42) !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        .rewards-panel.ruthie-offer-modal {
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
          background: #ffffff !important;
          color: #171717 !important;
          box-shadow: -24px 0 70px rgba(0, 0, 0, 0.16) !important;
          transform-origin: 100% 50%;
        }
        .ruthie-offer-modal .rewards-close {
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
          color: #252525;
          transition: background 180ms ease;
        }
        .ruthie-offer-modal .rewards-close:hover {
          background: rgba(0, 0, 0, 0.055);
        }
        .ruthie-offer-scroll {
          min-height: 0;
          flex: 1 1 auto;
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: rgba(0, 0, 0, 0.18) transparent;
        }
        .ruthie-offer-scroll::-webkit-scrollbar { width: 5px; }
        .ruthie-offer-scroll::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.18);
        }
        .ruthie-offer-copy {
          position: relative;
          padding: 52px 52px 46px;
          background: #ffffff;
        }
        .ruthie-offer-brand {
          display: flex;
          min-height: 42px;
          align-items: center;
          margin-bottom: 28px;
        }
        .ruthie-offer-brand img {
          display: block;
          width: auto;
          max-width: 142px;
          height: 26px;
          object-fit: contain;
          object-position: left center;
        }
        .ruthie-offer-brand-fallback {
          font-family: var(--font-heading);
          font-size: 12px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }
        .ruthie-offer-copy h2 {
          max-width: 500px;
          margin: 0;
          color: #171717;
          font-family: var(--font-heading);
          font-size: clamp(34px, 5vw, 48px);
          font-weight: 500;
          line-height: 1.04;
          letter-spacing: -0.035em;
        }
        .ruthie-offer-copy > p {
          max-width: 480px;
          margin: 15px 0 0;
          color: #77716b;
          font-size: 15px;
          line-height: 1.55;
        }
        .ruthie-offer-action-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          margin-top: 28px;
        }
        .ruthie-offer-balance {
          display: flex;
          min-width: 0;
          min-height: 52px;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 0 18px;
          border: 1px solid #e7e5e2;
          border-radius: 999px;
          background: #fff;
        }
        .ruthie-offer-balance span {
          overflow: hidden;
          color: #7a746f;
          font-size: 12px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ruthie-offer-balance strong {
          color: #171717;
          font-family: var(--font-heading);
          font-size: 17px;
          font-weight: 500;
          white-space: nowrap;
        }
        .ruthie-offer-cta {
          display: inline-flex;
          min-width: 126px;
          min-height: 52px;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 23px;
          border-radius: 999px;
          background: #171717;
          color: #ffffff !important;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none !important;
          transition: background 180ms ease;
        }
        .ruthie-offer-cta:hover { background: #2a2a2a; }
        .ruthie-offer-legal {
          margin-top: 13px !important;
          color: #8b8580 !important;
          font-size: 10.5px !important;
          line-height: 1.5 !important;
        }
        .ruthie-offer-legal a {
          color: #54504c;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .ruthie-offer-photo {
          position: relative;
          width: 100%;
          height: min(43vw, 390px);
          min-height: 300px;
          overflow: hidden;
          background: #e8e1d8;
        }
        .ruthie-offer-photo img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: 50% 42%;
        }
        .ruthie-offer-photo::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(0,0,0,0.015), rgba(0,0,0,0.05));
        }
        .ruthie-offer-details {
          padding: 28px 52px calc(40px + env(safe-area-inset-bottom));
          background: #fbfaf8;
        }
        .ruthie-offer-section-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid #e8e5e1;
        }
        .ruthie-offer-section-head span {
          display: block;
          margin-bottom: 5px;
          color: #88817a;
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .ruthie-offer-section-head h3 {
          margin: 0;
          color: #191919;
          font-family: var(--font-heading);
          font-size: 23px;
          font-weight: 500;
          letter-spacing: -0.02em;
        }
        .ruthie-offer-value {
          text-align: right;
        }
        .ruthie-offer-value strong {
          display: block;
          font-family: var(--font-heading);
          font-size: 22px;
          font-weight: 500;
        }
        .ruthie-offer-value small {
          display: block;
          margin-top: 3px;
          color: #8b8580;
          font-size: 10px;
        }
        .ruthie-offer-accordion {
          border-bottom: 1px solid #e8e5e1;
        }
        .ruthie-offer-accordion-trigger {
          display: flex;
          width: 100%;
          min-height: 62px;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 0;
          border: 0;
          background: transparent;
          color: #24211e;
          font-size: 13px;
          font-weight: 600;
          text-align: left;
        }
        .ruthie-offer-accordion-trigger > span:first-child {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ruthie-offer-accordion-icon {
          display: inline-flex;
          width: 30px;
          height: 30px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #f0ece6;
          color: #72583f;
        }
        .ruthie-offer-accordion-content { overflow: hidden; }
        .ruthie-offer-action-item {
          display: grid;
          grid-template-columns: 30px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 13px 0;
          border-top: 1px solid rgba(232, 229, 225, 0.72);
          color: #312c27;
        }
        button.ruthie-offer-action-item {
          width: 100%;
          border-right: 0;
          border-bottom: 0;
          border-left: 0;
          background: transparent;
          text-align: left;
        }
        .ruthie-offer-action-item > svg:first-child {
          width: 19px;
          height: 19px;
          color: #765c43;
        }
        .ruthie-offer-action-item strong {
          display: block;
          font-size: 12.5px;
          font-weight: 600;
        }
        .ruthie-offer-action-item span {
          display: block;
          margin-top: 3px;
          color: #817a74;
          font-size: 11px;
          line-height: 1.45;
        }
        .ruthie-offer-action-item:disabled { opacity: 0.6; }
        .ruthie-birthday-fields {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }
        .ruthie-birthday-fields input {
          width: 130px;
          min-height: 36px;
          padding: 0 11px;
          border: 1px solid #dedad4;
          border-radius: 8px;
          background: #fff;
          color: #23201d;
          font-size: 11px;
          outline: none;
        }
        .ruthie-birthday-fields input:focus {
          border-color: #9a836d;
          box-shadow: 0 0 0 3px rgba(115, 87, 61, 0.08);
        }
        .ruthie-birthday-fields button {
          min-height: 36px;
          padding: 0 13px;
          border: 0;
          border-radius: 8px;
          background: #171717;
          color: #fff;
          font-size: 10.5px;
        }
        .ruthie-offer-note {
          margin: 4px 0 14px;
          color: #817a74;
          font-size: 10.5px;
        }
        .rewards-error-text {
          color: #9d3d35 !important;
          font-size: 10px !important;
        }
        @media (max-width: 767px) {
          .rewards-panel.ruthie-offer-modal {
            width: 100vw !important;
          }
          .ruthie-offer-copy {
            padding: calc(44px + env(safe-area-inset-top)) 24px 34px;
          }
          .ruthie-offer-brand { margin-bottom: 22px; }
          .ruthie-offer-brand img { height: 23px; max-width: 124px; }
          .ruthie-offer-copy h2 { font-size: 34px; }
          .ruthie-offer-copy > p { margin-top: 12px; font-size: 13px; }
          .ruthie-offer-action-row {
            grid-template-columns: 1fr;
            margin-top: 22px;
          }
          .ruthie-offer-cta { width: 100%; }
          .ruthie-offer-photo {
            height: 44vh;
            min-height: 280px;
            max-height: 430px;
          }
          .ruthie-offer-details {
            padding: 24px 24px calc(34px + env(safe-area-inset-bottom));
          }
          .ruthie-offer-section-head h3 { font-size: 21px; }
          .ruthie-offer-value strong { font-size: 20px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ruthie-offer-trigger,
          .ruthie-offer-modal * {
            scroll-behavior: auto !important;
          }
        }
      `}</style>

      <motion.button
        type="button"
        className={`rewards-floating-bubble ruthie-offer-trigger premium-touch ${
          isCartOpen ? "rewards-floating-bubble--cart-open" : ""
        }`}
        onClick={() => setIsOpen(true)}
        aria-label="Ruthie Points avantajlarını aç"
        whileHover={reduceMotion ? undefined : { y: -3, scale: 1.015 }}
        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
        transition={{ type: "spring", stiffness: 430, damping: 28 }}
      >
        <span className="rewards-floating-icon"><Sparkles size={17} /></span>
        <span>Avantajlar</span>
      </motion.button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <>
            <motion.button
              key="ruthie-offer-overlay"
              type="button"
              className="rewards-overlay ruthie-offer-overlay"
              aria-label="Ruthie Points penceresini kapat"
              onClick={closeRewards}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.24, ease: "easeOut" }}
            />

            <motion.aside
              key="ruthie-offer-modal"
              className="rewards-panel ruthie-offer-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Ruthie Points"
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

              <div className="ruthie-offer-scroll">
                <section className="ruthie-offer-copy">
                  <motion.div
                    className="ruthie-offer-brand"
                    initial={reduceMotion ? undefined : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : 0.12, duration: 0.36 }}
                  >
                    <img src="/home/ruth-wordmark.png" alt="Ruth Istanbul" />
                  </motion.div>

                  <motion.h2
                    initial={reduceMotion ? undefined : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : 0.17, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {isLoggedIn
                      ? "Ruthie Points ayrıcalıklarını kullan"
                      : `Üye ol & ${formatRuthieNumber(signupPoints)} Ruthie Points kazan`}
                  </motion.h2>

                  <motion.p
                    initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : 0.22, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {isLoggedIn
                      ? `${formatRuthieNumber(visiblePoints)} puanın hesabında aktif. Puanlarını ödeme adımında indirime dönüştürebilirsin.`
                      : "Ruthie Club'a katıl, alışverişlerinden puan kazan ve puanlarını sonraki siparişlerinde indirime dönüştür."}
                  </motion.p>

                  <motion.div
                    className="ruthie-offer-action-row"
                    initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: reduceMotion ? 0 : 0.27, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="ruthie-offer-balance">
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
                        className="ruthie-offer-cta"
                        onClick={closeRewards}
                      >
                        {isLoggedIn ? "Hesabım" : "Hemen Katıl"}
                        <ChevronRight size={15} />
                      </Link>
                    </motion.div>
                  </motion.div>

                  {!isLoading && !isLoggedIn ? (
                    <p className="ruthie-offer-legal">
                      Zaten hesabın var mı?{" "}
                      <Link href="/login?redirect=/account" onClick={closeRewards}>Giriş yap</Link>.
                      Üye olarak Ruthie Points koşullarını kabul etmiş olursun.
                    </p>
                  ) : (
                    <p className="ruthie-offer-legal">
                      Puanların ödeme adımında kullanılabilir ve yaklaşık indirim değeri bakiyene göre hesaplanır.
                    </p>
                  )}
                </section>

                <motion.div
                  className="ruthie-offer-photo"
                  initial={reduceMotion ? undefined : { opacity: 0.86 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: reduceMotion ? 0 : 0.08, duration: 0.55 }}
                >
                  <motion.img
                    src="/home/sudem-mobile.webp"
                    alt="Ruth Istanbul takıları"
                    initial={reduceMotion ? undefined : { scale: 1.035 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: reduceMotion ? 0.01 : 0.9, ease: [0.22, 1, 0.36, 1] }}
                  />
                </motion.div>

                <section className="ruthie-offer-details">
                  <div className="ruthie-offer-section-head">
                    <div>
                      <span>Bakiye ve kullanım</span>
                      <h3>Ruthie Points</h3>
                    </div>
                    <div className="ruthie-offer-value">
                      <strong>{formatRuthieNumber(visiblePoints)}</strong>
                      <small>≈ {formatLira(visibleDiscount)}</small>
                    </div>
                  </div>

                  <div className="ruthie-offer-accordion">
                    <motion.button
                      type="button"
                      className="ruthie-offer-accordion-trigger"
                      onClick={() => setActiveSection(activeSection === "earn" ? null : "earn")}
                      aria-expanded={activeSection === "earn"}
                      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                    >
                      <span>
                        <span className="ruthie-offer-accordion-icon"><Sparkles size={15} /></span>
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
                          className="ruthie-offer-accordion-content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={reduceMotion ? { duration: 0.01 } : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                        >
                          <div className="ruthie-offer-action-item">
                            <UserPlus size={19} />
                            <div><strong>Üye ol</strong><span>{formatRuthieNumber(signupPoints)} Ruthie Points</span></div>
                            {isLoggedIn ? <CheckCircle2 size={17} /> : null}
                          </div>
                          <div className="ruthie-offer-action-item">
                            <ShoppingBag size={19} />
                            <div><strong>Sipariş ver</strong><span>Harcanan her 1 TL için 1 Ruthie Point</span></div>
                            <span />
                          </div>

                          {isLoggedIn ? (
                            birthday.birthDate ? (
                              <button
                                type="button"
                                className="ruthie-offer-action-item"
                                onClick={claimBirthday}
                                disabled={claiming || birthday.claimed}
                              >
                                <Cake size={19} />
                                <div>
                                  <strong>
                                    {birthday.claimed
                                      ? "Doğum günü puanın eklendi"
                                      : birthday.eligible
                                        ? `${formatRuthieNumber(birthdayAwardPoints)} puanı hesabına ekle`
                                        : "Doğum gününde puan kazan"}
                                  </strong>
                                  <span>
                                    {birthday.claimed
                                      ? `Bu yılın ${formatRuthieNumber(birthdayAwardPoints)} puanı hesabında.`
                                      : birthday.eligible
                                        ? `Doğum günü haftan ${birthday.windowEnd} tarihine kadar geçerli.`
                                        : `Doğum gününde ve sonraki 7 gün içinde ${birthdayAwardText} kazan.`}
                                  </span>
                                  {birthday.error ? <span className="rewards-error-text">{birthday.error}</span> : null}
                                </div>
                                {birthday.claimed ? <CheckCircle2 size={17} /> : <ChevronRight size={16} />}
                              </button>
                            ) : (
                              <div className="ruthie-offer-action-item">
                                <Cake size={19} />
                                <div>
                                  <strong>Doğum gününde puan kazan</strong>
                                  <span>Doğum tarihini ekle; doğum gününde ve sonraki 7 gün içinde {formatRuthieNumber(birthdayAwardPoints)} puanı hesabına al.</span>
                                  <div className="ruthie-birthday-fields">
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
                            <div className="ruthie-offer-action-item">
                              <Cake size={19} />
                              <div><strong>Doğum gününde puan kazan</strong><span>{birthdayAwardText}</span></div>
                              <span />
                            </div>
                          )}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>

                  <div className="ruthie-offer-accordion">
                    <motion.button
                      type="button"
                      className="ruthie-offer-accordion-trigger"
                      onClick={() => setActiveSection(activeSection === "spend" ? null : "spend")}
                      aria-expanded={activeSection === "spend"}
                      whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                    >
                      <span>
                        <span className="ruthie-offer-accordion-icon"><Gift size={15} /></span>
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
                          className="ruthie-offer-accordion-content"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={reduceMotion ? { duration: 0.01 } : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                        >
                          {[500, 1000, 2000, 5000].map((points) => (
                            <div key={points} className="ruthie-offer-action-item">
                              <Gift size={19} />
                              <div><strong>{formatLira(pointsToLira(points))} indirim</strong><span>{formatRuthieNumber(points)} Ruthie Points</span></div>
                              <span />
                            </div>
                          ))}
                          <p className="ruthie-offer-note">Puanlarını ödeme adımında kullanabilirsin.</p>
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
