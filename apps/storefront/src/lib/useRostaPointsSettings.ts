"use client";

import { useEffect, useState } from "react";
import { ROSTA_POINTS_PER_TL, ROSTA_WELCOME_POINTS } from "@/lib/rewards";

export type PublicRostaPointsSettings = {
  signupPoints: number;
  birthdayPoints: number;
  pointsPerTl: number;
};

const FALLBACK_SETTINGS: PublicRostaPointsSettings = {
  signupPoints: ROSTA_WELCOME_POINTS,
  birthdayPoints: 0,
  pointsPerTl: ROSTA_POINTS_PER_TL,
};

function nonNegativeInteger(value: unknown, fallback: number) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function useRostaPointsSettings() {
  const [settings, setSettings] = useState<PublicRostaPointsSettings>(FALLBACK_SETTINGS);

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
