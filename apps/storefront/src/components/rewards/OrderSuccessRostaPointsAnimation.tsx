"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Gift, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  ROSTA_POINTS_UPDATED_EVENT,
  clearPendingRostaOrderReward,
  consumeRostaPoints,
  formatRostaPointsNumber,
  getPendingRostaOrderReward,
  grantRostaOrderPoints,
  pointsForOrderTotal,
} from "@/lib/rewards";

type Props = {
  orderNo?: string;
};

function playRostaRewardSound() {
  if (typeof window === "undefined") return;

  const AudioContextConstructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    const audioContext = new AudioContextConstructor();
    const masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(0.08, audioContext.currentTime);
    masterGain.connect(audioContext.destination);

    const now = audioContext.currentTime + 0.04;
    const notes = [880, 988, 1175, 1046, 1318, 988, 1479, 1175, 1567];

    notes.forEach((frequency, index) => {
      const start = now + index * 0.075;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.62, start + 0.28);

      filter.type = "highpass";
      filter.frequency.setValueAtTime(520, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.62, start + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);

      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      oscillator.start(start);
      oscillator.stop(start + 0.34);
    });

    window.setTimeout(() => audioContext.close().catch(() => undefined), 1400);
  } catch {
    // Bazı mobil tarayıcılar otomatik sesi engeller; animasyon yine çalışır.
  }
}

export function OrderSuccessRostaPointsAnimation({ orderNo }: Props) {
  const { user, isLoading } = useAuth();
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [isRewardReady, setIsRewardReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setIsRewardReady(false);
      return;
    }

    const pending = getPendingRostaOrderReward();
    const orderKey = pending?.orderKey || (orderNo ? `order:${orderNo}` : "");
    const pointsToEarn = pending?.pointsToEarn || pointsForOrderTotal(pending?.totalAmount || 0);

    if (pending?.pointsUsed) {
      consumeRostaPoints({ orderKey: `${orderKey}:spent`, points: pending.pointsUsed });
    }

    if (orderKey && pointsToEarn > 0) {
      grantRostaOrderPoints({ orderKey, points: pointsToEarn });
      setEarnedPoints(pointsToEarn);
      setIsRewardReady(true);
      clearPendingRostaOrderReward();
      window.dispatchEvent(new Event(ROSTA_POINTS_UPDATED_EVENT));
      return;
    }

    setEarnedPoints(0);
    setIsRewardReady(false);
  }, [isLoading, orderNo, user]);

  useEffect(() => {
    if (isLoading || !user || !isRewardReady) return;

    const soundTimer = window.setTimeout(() => {
      playRostaRewardSound();
    }, 420);

    return () => window.clearTimeout(soundTimer);
  }, [isLoading, user, isRewardReady]);

  if (isLoading) return null;

  if (!user) {
    return (
      <div className="order-success-guest mt-6 rounded-2xl border border-kraft/35 bg-carbon-soft text-cream p-5">
        <div className="order-success-guest-row">
          <Gift className="text-brick" size={22} />
          <div className="order-success-guest-copy">
            <p className="font-heading text-lg">ROSTA Points kazanmak için üye ol</p>
            <p className="mt-2 text-sm leading-6 text-cream/70">
              Hesap oluşturduğunda alışverişlerinden ROSTA Points kazanabilir, ödeme adımında indirim olarak kullanabilirsin.
            </p>
            <Link href="/register?redirect=/account" className="mt-4 inline-flex bg-brick px-5 py-3 text-xs uppercase tracking-wide-luxe text-[var(--rosta-action-text)] active:bg-espresso focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick">
              Üye Ol
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="rosta-points-success-reward"
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="rosta-points-success-shine" aria-hidden="true" />
      <div className="relative z-10 flex justify-center">
        <span className="rosta-points-success-badge"><Sparkles size={17} /> ROSTA Points</span>
      </div>
      <motion.h2
        className="rosta-points-success-title relative z-10 mt-4 font-heading text-2xl sm:text-3xl md:text-4xl"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.35 }}
      >
        ROSTA Points kazandınız
      </motion.h2>
      <motion.p
        className="rosta-points-success-copy relative z-10 mt-2 text-xs leading-6 text-cream/70 sm:text-sm sm:leading-7"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.35 }}
      >
        {isRewardReady && earnedPoints > 0
          ? `Bu alışverişten +${formatRostaPointsNumber(earnedPoints)} ROSTA Points hesabına eklendi.`
          : "Alışverişlerin hesabında ROSTA Points olarak birikir ve ödeme adımında indirime dönüşür."}
      </motion.p>
      <div className="rosta-points-success-actions relative z-10 mt-4 flex justify-center sm:mt-6">
        <Link href="/account" className="rosta-points-success-action inline-flex items-center justify-center gap-2 bg-brick px-5 py-3 text-[0.65rem] uppercase tracking-wide-luxe text-[var(--rosta-action-text)] active:bg-espresso focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brick sm:px-6 sm:py-4 sm:text-xs">
          <Gift size={15} /> Puanlarımı Gör
        </Link>
      </div>
    </motion.div>
  );
}
