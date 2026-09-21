"use client";

import { useEffect, useState } from "react";
import { RUTHIE_POINTS_PER_TL, RUTHIE_WELCOME_POINTS } from "@/lib/rewards";

export type PublicRuthieRewardSettings = {
  signupPoints: number;
  birthdayPoints: number;
  pointsPerTl: number;
};

const FALLBACK_SETTINGS: PublicRuthieRewardSettings = {
  signupPoints: RUTHIE_WELCOME_POINTS,
  birthdayPoints: 0,
  pointsPerTl: RUTHIE_POINTS_PER_TL,
};

function nonNegativeInteger(value: unknown, fallback: number) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function useRuthieRewardSettings() {
  const [settings, setSettings] = useState<PublicRuthieRewardSettings>(FALLBACK_SETTINGS);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/rewards/settings", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data?.ok || cancelled) return;

        setSettings({
          signupPoints: nonNegativeInteger(data.signupPoints, FALLBACK_SETTINGS.signupPoints),
          birthdayPoints: nonNegativeInteger(data.birthdayPoints, FALLBACK_SETTINGS.birthdayPoints),
          pointsPerTl: positiveNumber(data.pointsPerTl, FALLBACK_SETTINGS.pointsPerTl),
        });
      } catch {
        // Storefront remains usable with the safe local fallback.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return settings;
}
