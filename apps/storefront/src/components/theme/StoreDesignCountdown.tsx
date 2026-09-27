"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  targetTime: string;
  completedState?: string;
  stylePreset?: string;
};

function parts(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return { days, hours, minutes, seconds };
}

export function StoreDesignCountdown({ targetTime, completedState = "Tamamlandı", stylePreset = "cards" }: Props) {
  const target = useMemo(() => {
    const parsed = Date.parse(targetTime);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [targetTime]);
  const [serverOffset, setServerOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    const started = Date.now();
    fetch("/api/store-design-time", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!active || !payload || typeof payload.now !== "number") return;
        const roundTrip = Math.max(0, Date.now() - started);
        setServerOffset(payload.now + roundTrip / 2 - Date.now());
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!target) return null;
  const remaining = target - (now + serverOffset);
  if (remaining <= 0) {
    return <p className="text-center text-sm font-medium">{completedState}</p>;
  }

  const value = parts(remaining);
  const items = [
    ["Gün", value.days],
    ["Saat", value.hours],
    ["Dakika", value.minutes],
    ["Saniye", value.seconds],
  ] as const;

  return (
    <div className={stylePreset === "inline" ? "flex flex-wrap items-center justify-center gap-4" : "grid grid-cols-2 gap-3 sm:grid-cols-4"}>
      {items.map(([label, amount]) => (
        <div key={label} className={stylePreset === "inline" ? "text-center" : "rounded-xl border border-current/10 p-4 text-center"}>
          <p className="font-heading text-2xl tabular-nums sm:text-3xl">{String(amount).padStart(2, "0")}</p>
          <p className="mt-1 text-[9px] uppercase tracking-[0.12em] opacity-50">{label}</p>
        </div>
      ))}
    </div>
  );
}
