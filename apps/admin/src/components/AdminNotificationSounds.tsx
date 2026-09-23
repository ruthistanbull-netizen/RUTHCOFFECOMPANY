"use client";

import { useEffect } from "react";

type PushMessage = {
  type?: string;
  tag?: string;
  title?: string;
  body?: string;
};

function notificationKind(payload: PushMessage) {
  const value = `${payload.type || ""} ${payload.tag || ""} ${payload.title || ""} ${payload.body || ""}`.toLocaleLowerCase("tr-TR");
  if (value.includes("order") || value.includes("sipariş")) return "order";
  if (value.includes("reminder") || value.includes("crm") || value.includes("hatırlat")) return "reminder";
  return "default";
}

function tone(context: AudioContext, frequency: number, start: number, duration: number, gainValue: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playOrderSound(context: AudioContext) {
  const now = context.currentTime + 0.02;
  tone(context, 1046.5, now, 0.18, 0.18);
  tone(context, 1318.5, now + 0.11, 0.2, 0.16);
  tone(context, 1568, now + 0.23, 0.28, 0.14);
  tone(context, 2093, now + 0.36, 0.22, 0.1);
}

function playReminderSound(context: AudioContext) {
  const now = context.currentTime + 0.02;
  tone(context, 784, now, 0.16, 0.12);
  tone(context, 988, now + 0.18, 0.2, 0.1);
}

export function AdminNotificationSounds() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("AudioContext" in window)) return;

    let context: AudioContext | null = null;
    const ensureContext = async () => {
      context ||= new AudioContext();
      if (context.state === "suspended") await context.resume().catch(() => undefined);
      return context;
    };

    const arm = () => {
      void ensureContext();
    };

    const onMessage = (event: MessageEvent<{ kind?: string; payload?: PushMessage }>) => {
      if (event.data?.kind !== "ruth-push") return;
      void ensureContext().then((audioContext) => {
        const kind = notificationKind(event.data.payload || {});
        if (kind === "order") playOrderSound(audioContext);
        else playReminderSound(audioContext);
      });
    };

    window.addEventListener("pointerdown", arm, { once: true, passive: true });
    window.addEventListener("keydown", arm, { once: true });
    navigator.serviceWorker.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      void context?.close();
    };
  }, []);

  return null;
}
