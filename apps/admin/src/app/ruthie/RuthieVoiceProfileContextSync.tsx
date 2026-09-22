"use client";

import { useEffect } from "react";
import { adminAuthHeaders } from "@/lib/adminApi";

export const RUTHIE_VOICE_PROFILE_CONTEXT_KEY = "ruthie.voice.profile.context.v1";

type ProfilePayload = {
  ok?: boolean;
  profile?: {
    displayName?: string;
    analysisEnabled?: boolean;
    learningEnabled?: boolean;
    completionPercent?: number;
    status?: string;
    sampleCount?: number;
    cleanDurationSeconds?: number;
    deviceCount?: number;
    lastMatchedName?: string | null;
    lastMatchConfidence?: number | null;
  };
};

export function RuthieVoiceProfileContextSync() {
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const headers = await adminAuthHeaders();
        const response = await fetch("/api/rosta-insight/voice-profile", { headers, cache: "no-store" });
        const payload = await response.json().catch(() => null) as ProfilePayload | null;
        if (cancelled || !response.ok || !payload?.ok || !payload.profile) return;
        const profile = payload.profile;
        const context = [
          "ROSTA INSIGHT SES PROFİLİ CANLI DURUMU:",
          `Profil sahibi: ${profile.displayName || "Admin"}.`,
          `Ses analizi: ${profile.analysisEnabled ? "Açık" : "Kapalı"}.`,
          `Sürekli öğrenme: ${profile.learningEnabled ? "Açık" : "Kapalı"}.`,
          `Tamamlanma: %${Math.max(0, Math.min(100, Number(profile.completionPercent) || 0))}.`,
          `Kabul edilen örnek: ${Number(profile.sampleCount) || 0}.`,
          `Temiz konuşma: ${Math.round(Number(profile.cleanDurationSeconds) || 0)} saniye.`,
          `Cihaz sayısı: ${Number(profile.deviceCount) || 0}.`,
          profile.lastMatchedName
            ? `Son konuşmacı eşleşmesi: ${profile.lastMatchedName}${profile.lastMatchConfidence != null ? `, güven %${Math.round(profile.lastMatchConfidence)}` : ""}.`
            : "Son konuşmacı eşleşmesi henüz oluşmadı.",
          "Bu eşleşme yalnız kişiselleştirme içindir; hesap yetkisi vermez.",
        ].join("\n");
        window.localStorage.setItem(RUTHIE_VOICE_PROFILE_CONTEXT_KEY, context);
      } catch {
        // Voice remains available when profile context cannot be refreshed.
      }
    };
    void sync();
    const timer = window.setInterval(() => void sync(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
