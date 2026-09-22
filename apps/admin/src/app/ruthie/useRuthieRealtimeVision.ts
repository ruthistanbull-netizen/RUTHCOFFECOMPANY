"use client";

import { useCallback } from "react";
import {
  RUTHIE_IDENTITY_GUIDE,
  RUTHIE_STRICT_BEHAVIOR_GUIDE,
  RUTHIE_VOICE_ANALYSIS_GUIDE,
} from "@/lib/ruthieBehavior";
import { RUTHIE_CAPABILITY_GUIDE } from "@/lib/ruthieCapabilityGuide";
import { RUTHIE_VOICE_PROFILE_CONTEXT_KEY } from "./ROSTA InsightVoiceProfileContextSync";
import {
  useROSTA InsightRealtimeVision as useROSTA InsightRealtimeVisionStrict,
  type ROSTA InsightRealtimeController,
} from "./useROSTA InsightRealtimeVisionStrict";

export type {
  ROSTA InsightRealtimeController,
  ROSTA InsightRealtimeMessage,
  ROSTA InsightRealtimePendingAction,
  ROSTA InsightRealtimePhase,
} from "./useROSTA InsightRealtimeVisionStrict";

type StrictOptions = Parameters<typeof useROSTA InsightRealtimeVisionStrict>[0];

const VOICE_PROFILE_GUIDE = [
  RUTHIE_VOICE_ANALYSIS_GUIDE,
  "Kullanıcı ilk tanıtımında 'Ben Görkem'im' veya 'Ben Enes'im' derse bunu ses profili tanıtımı olarak kabul et. Mevcut oturum kimliğiyle çelişmiyorsa kısa biçimde tanıdığını söyle.",
  "Ses analizinin ana amacı yalnız kişiyi ayırmak değildir; normal Türkçe konuşmayı, hızını, telaffuzunu ve özel terimleri daha rahat anlayarak yanlış anlamayı azaltmaktır.",
  "Ses analizinin yüzde veya durumunu sorarsa aşağıdaki canlı profil değerini aynen kullan.",
].join("\n");

export function useROSTA InsightRealtimeVision(options: StrictOptions): ROSTA InsightRealtimeController {
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

  return useROSTA InsightRealtimeVisionStrict({
    ...options,
    conversationContext,
  });
}
