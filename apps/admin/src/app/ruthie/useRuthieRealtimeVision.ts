"use client";

import { useCallback } from "react";
import {
  RUTHIE_IDENTITY_GUIDE,
  RUTHIE_STRICT_BEHAVIOR_GUIDE,
  RUTHIE_VOICE_ANALYSIS_GUIDE,
} from "@/lib/ruthieBehavior";
import { RUTHIE_CAPABILITY_GUIDE } from "@/lib/ruthieCapabilityGuide";
import { RUTHIE_VOICE_PROFILE_CONTEXT_KEY } from "./RuthieVoiceProfileContextSync";
import {
  useRuthieRealtimeVision as useRuthieRealtimeVisionStrict,
  type RuthieRealtimeController,
} from "./useRuthieRealtimeVisionStrict";

export type {
  RuthieRealtimeController,
  RuthieRealtimeMessage,
  RuthieRealtimePendingAction,
  RuthieRealtimePhase,
} from "./useRuthieRealtimeVisionStrict";

type StrictOptions = Parameters<typeof useRuthieRealtimeVisionStrict>[0];

const VOICE_PROFILE_GUIDE = [
  RUTHIE_VOICE_ANALYSIS_GUIDE,
  "Kullanıcı kendini adıyla tanıtırsa bunu yalnız ses profili kişiselleştirmesi olarak değerlendir. Aktif oturum profilindeki kimlikle çelişiyorsa yetki veya kimlik değişikliği yapma.",
  "Ses analizinin amacı normal Türkçe konuşmayı, hızını, telaffuzunu ve ROSTA operasyon terimlerini daha rahat anlayarak yanlış anlamayı azaltmaktır.",
  "Ses analizinin yüzde veya durumunu sorarsa aşağıdaki canlı profil değerini aynen kullan.",
].join("\n");

export function useRuthieRealtimeVision(options: StrictOptions): RuthieRealtimeController {
  const originalContext = options.conversationContext;
  const conversationContext = useCallback(
    () => [
      RUTHIE_STRICT_BEHAVIOR_GUIDE,
      RUTHIE_IDENTITY_GUIDE,
      VOICE_PROFILE_GUIDE,
      typeof window === "undefined" ? "" : window.localStorage.getItem(RUTHIE_VOICE_PROFILE_CONTEXT_KEY) || "",
      RUTHIE_CAPABILITY_GUIDE,
      originalContext(),
    ].filter(Boolean).join("\n\n").slice(0, 24_000),
    [originalContext],
  );

  return useRuthieRealtimeVisionStrict({
    ...options,
    conversationContext,
  });
}
