"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import { calculateRuthieApiCost, type RuthieApiUsage } from "@/lib/ruthieApiCost";
import type { RuthieVoiceVisualPhase } from "./RuthieVoiceOrb";

export type RuthieRealtimePhase = "idle" | RuthieVoiceVisualPhase;
export type RuthieRealtimeMessage = { role: "user" | "assistant"; text: string };
export type RuthieRealtimePendingAction = {
  id: string;
  action: string;
  title: string;
  summary: string;
  risk: "none" | "low" | "high" | "critical";
  token: string;
  expiresAt: string;
};

export type RuthieRealtimeController = {
  phase: RuthieRealtimePhase;
  error: string | null;
  userText: string;
  assistantText: string;
  microphoneStream: MediaStream | null;
  assistantStream: MediaStream | null;
  connected: boolean;
  translationEnabled: boolean;
  translationLanguage: string;
  lastTurnCostUsd: number | null;
  sessionCostUsd: number;
  awaitingVoiceConfirmation: boolean;
  start: () => Promise<void>;
  end: () => void;
  retry: () => Promise<void>;
  sendVisionFrame: (options: {
    imageDataUrl: string;
    prompt?: string;
    detail?: "low" | "high" | "auto";
    requestResponse?: boolean;
  }) => boolean;
  setTranslation: (enabled: boolean, targetLanguage?: string) => boolean;
};

type RealtimeResponse = {
  id?: string;
  status?: string;
  model?: string;
  usage?: RuthieApiUsage | null;
};

type RealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  usage?: RuthieApiUsage | { type?: string; seconds?: number };
  response?: RealtimeResponse;
  session?: { model?: string };
  error?: { message?: string };
};

type UseRuthieRealtimeVisionOptions = {
  enabled: boolean;
  conversationContext: () => string;
  onMessage: (message: RuthieRealtimeMessage) => void;
  model?: string;
  transcriptionModel?: string;
};

const REALTIME_ADMIN_ACTIONS = [
  "panel.summary", "panel.health",
  "orders.search", "orders.create", "orders.update", "orders.bulk",
  "products.search", "products.create", "products.update", "products.bulk",
  "customers.search",
  "returns.search", "returns.create",
  "reviews.search", "reviews.update",
  "points.search", "points.adjust",
  "campaigns.search", "campaigns.update",
  "catalog.groups.read", "catalog.groups.write",
  "theme.read", "theme.update",
  "shipping.orders", "shipping.quotes", "shipping.create", "shipping.cancel", "shipping.return", "shipping.sync",
  "shipping.settings.read", "shipping.settings.update",
  "email.status", "email.send", "email.bulk_send",
  "abandoned_carts.search", "abandoned_carts.run",
  "review_automation.settings.read", "review_automation.settings.update", "review_automation.send",
] as const;

const REALTIME_ADMIN_TOOL = {
  type: "function",
  name: "ruthie_admin",
  description: [
    "ROSTA Coffee Co. admin panelinin canlı aracıdır.",
    "Sipariş, ürün, müşteri, stok, iade, kargo, kampanya, tema, yorum, puan ve e-posta sorgularında uygun action kullan.",
    "Panelde değişiklik istenirse uygun write action çağır; sistem kullanıcıdan yalnızca sesli evet veya hayır onayı ister.",
    "query GET filtreleri, payload işlem JSON gövdesi, resourceId dinamik kargo kimliğidir.",
  ].join(" "),
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: REALTIME_ADMIN_ACTIONS },
      query: { type: "object" },
      payload: { type: "object" },
      resourceId: { type: "string" },
      reason: { type: "string" },
    },
    required: ["action"],
    additionalProperties: false,
  },
};

function makeId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function waitForIceGathering(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => { if (pc.iceGatheringState === "complete") done(); };
    const timeout = window.setTimeout(done, 5_000);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

function parseToolArguments(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function voiceConfirmationDecision(value: string): "accept" | "reject" | "unclear" {
  const text = value.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşü0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
  const words = text.split(" ");
  const rejects = ["hayır", "hayir", "iptal", "vazgeç", "vazgec", "reddet", "yapma", "uygulama", "istemiyorum"];
  if (rejects.some((term) => text.includes(term))) return "reject";
  const accepts = ["evet", "onaylıyorum", "onayliyorum", "onayla", "kabul", "uygula", "yap", "tamam", "tamamdır", "tamamdir"];
  if (accepts.some((term) => words.includes(term) || text.startsWith(`${term} `))) return "accept";
  return "unclear";
}

function transcriptionCostUsd(modelValue: string | undefined, usageValue: RealtimeEvent["usage"]) {
  if (!usageValue || typeof usageValue !== "object" || "seconds" in usageValue) return 0;
  const model = (modelValue || "").toLowerCase();
  const usage = usageValue as RuthieApiUsage;
  const details = usage.input_token_details || usage.input_tokens_details || {};
  const audioInput = typeof details.audio_tokens === "number" ? details.audio_tokens : 0;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
  if (model.startsWith("gpt-4o-mini-transcribe")) return (audioInput * 1.25 + output * 5) / 1_000_000;
  if (model.startsWith("gpt-4o-transcribe")) return (audioInput * 2.5 + output * 10) / 1_000_000;
  return 0;
}

export function useRuthieRealtimeVision(options: UseRuthieRealtimeVisionOptions): RuthieRealtimeController {
  const [phase, setPhase] = useState<RuthieRealtimePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [userText, setUserText] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [assistantStream, setAssistantStream] = useState<MediaStream | null>(null);
  const [connected, setConnected] = useState(false);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [translationLanguage, setTranslationLanguage] = useState("İngilizce");
  const [lastTurnCostUsd, setLastTurnCostUsd] = useState<number | null>(null);
  const [sessionCostUsd, setSessionCostUsd] = useState(0);
  const [awaitingVoiceConfirmation, setAwaitingVoiceConfirmation] = useState(false);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const assistantBufferRef = useRef("");
  const userBufferRef = useRef("");
  const startingRef = useRef(false);
  const handledCallsRef = useRef(new Set<string>());
  const countedResponsesRef = useRef(new Set<string>());
  const pendingVoiceActionRef = useRef<RuthieRealtimePendingAction | null>(null);
  const responseActiveRef = useRef(false);
  const pendingTranscriptionCostRef = useRef(0);
  const realtimeModelRef = useRef(options.model || "");
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
    if (options.model) realtimeModelRef.current = options.model;
  }, [options]);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return false;
    try {
      channel.send(JSON.stringify(event));
      return true;
    } catch {
      return false;
    }
  }, []);

  const requestSpokenResponse = useCallback((instructions: string) => sendEvent({
    type: "response.create",
    response: { output_modalities: ["audio"], instructions },
  }), [sendEvent]);

  const closeResources = useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    microphoneRef.current?.getTracks().forEach((track) => track.stop());
    microphoneRef.current = null;
    setMicrophoneStream(null);
    setAssistantStream(null);
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current.remove();
    }
    audioRef.current = null;
    assistantBufferRef.current = "";
    userBufferRef.current = "";
    handledCallsRef.current.clear();
    countedResponsesRef.current.clear();
    pendingVoiceActionRef.current = null;
    responseActiveRef.current = false;
    pendingTranscriptionCostRef.current = 0;
    setAwaitingVoiceConfirmation(false);
    startingRef.current = false;
    setConnected(false);
  }, []);

  const end = useCallback(() => {
    closeResources();
    setPhase("idle");
    setError(null);
    setUserText("");
    setAssistantText("");
    setTranslationEnabled(false);
  }, [closeResources]);

  useEffect(() => () => closeResources(), [closeResources]);

  const finishAssistant = useCallback((text?: string) => {
    const finalText = (text || assistantBufferRef.current).trim();
    assistantBufferRef.current = "";
    if (finalText) {
      optionsRef.current.onMessage({ role: "assistant", text: finalText });
      setAssistantText(finalText);
    }
    setPhase("listening");
  }, []);

  const addResponseCost = useCallback((event: RealtimeEvent) => {
    const response = event.response;
    if (!response?.usage) return;
    const id = response.id || makeId("response-cost");
    if (countedResponsesRef.current.has(id)) return;
    countedResponsesRef.current.add(id);
    const model = response.model || realtimeModelRef.current || optionsRef.current.model || "gpt-realtime";
    const cost = calculateRuthieApiCost(model, response.usage);
    if (!cost.supported) return;
    const turnUsd = pendingTranscriptionCostRef.current + cost.usd;
    pendingTranscriptionCostRef.current = 0;
    setLastTurnCostUsd(turnUsd);
    setSessionCostUsd((current) => current + cost.usd);
  }, []);

  const executeVoiceAction = useCallback(async (action: RuthieRealtimePendingAction) => {
    const headers = await adminAuthHeaders();
    const response = await fetch("/api/rosta-insight/admin/execute", {
      method: "POST",
      cache: "no-store",
      headers: { ...headers, "Content-Type": "application/json", "x-correlation-id": makeId("voice-confirm") },
      body: JSON.stringify({ token: action.token }),
    });
    const payload = await response.json().catch(() => null) as {
      ok?: boolean;
      result?: { ok?: boolean; title?: string; data?: unknown; error?: string };
      error?: { message?: string };
    } | null;
    if (!response.ok || !payload?.ok) throw new Error(payload?.result?.error || payload?.error?.message || "Onaylanan panel işlemi uygulanamadı.");
    return { ok: true, title: payload.result?.title || action.title, data: payload.result?.data };
  }, []);

  const handleVoiceConfirmation = useCallback(async (transcript: string) => {
    const action = pendingVoiceActionRef.current;
    if (!action) return;
    if (responseActiveRef.current) sendEvent({ type: "response.cancel" });
    const decision = voiceConfirmationDecision(transcript);

    if (decision === "unclear") {
      setPhase("thinking");
      requestSpokenResponse(`Kullanıcının cevabı net değil. Yalnızca sesli olarak \"${action.title} işlemini onaylıyor musun? Lütfen evet veya hayır de.\" diye sor. Başka açıklama yapma.`);
      return;
    }

    pendingVoiceActionRef.current = null;
    setAwaitingVoiceConfirmation(false);
    if (decision === "reject") {
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [{ type: "input_text", text: `${action.title} işlemi kullanıcı tarafından sesli olarak reddedildi. İşlemi çalıştırma.` }],
        },
      });
      setPhase("thinking");
      requestSpokenResponse("Yalnızca sesli olarak işlemi iptal ettiğini kısa biçimde söyle.");
      return;
    }

    setPhase("acting");
    try {
      const result = await executeVoiceAction(action);
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [{ type: "input_text", text: `Kullanıcı işlemi sesli olarak onayladı ve işlem uygulandı. Sonuç: ${JSON.stringify(result)}` }],
        },
      });
      setPhase("thinking");
      requestSpokenResponse("İşlemin tamamlandığını yalnızca sesli, kısa ve doğal biçimde bildir.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Onaylanan işlem uygulanamadı.";
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [{ type: "input_text", text: `Kullanıcı işlemi sesli olarak onayladı fakat uygulama başarısız oldu: ${message}` }],
        },
      });
      setPhase("thinking");
      requestSpokenResponse(`İşlemin uygulanamadığını ve şu hatayı yalnızca sesli, kısa biçimde söyle: ${message}`);
    }
  }, [executeVoiceAction, requestSpokenResponse, sendEvent]);

  const invokeAdminTool = useCallback(async (event: RealtimeEvent) => {
    const callId = event.call_id?.trim();
    if (!callId || event.name !== "ruthie_admin" || handledCallsRef.current.has(callId)) return;
    handledCallsRef.current.add(callId);

    if (pendingVoiceActionRef.current) {
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({ ok: false, awaiting_voice_confirmation: true }),
        },
      });
      return;
    }

    setPhase("acting");
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/rosta-insight/admin/invoke", {
        method: "POST",
        cache: "no-store",
        headers: { ...headers, "Content-Type": "application/json", "x-correlation-id": makeId("voice-tool") },
        body: JSON.stringify({ arguments: parseToolArguments(event.arguments) }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        result?: {
          ok?: boolean;
          action?: string;
          title?: string;
          status?: number;
          data?: unknown;
          error?: string;
          pendingAction?: RuthieRealtimePendingAction;
        };
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload?.ok || !payload.result) {
        throw new Error(payload?.error?.message || "Ruthie panel aracı çalıştırılamadı.");
      }

      if (payload.result.pendingAction) {
        const action = payload.result.pendingAction;
        pendingVoiceActionRef.current = action;
        setAwaitingVoiceConfirmation(true);
        sendEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({
              ok: false,
              awaiting_voice_confirmation: true,
              title: action.title,
              summary: action.summary,
              risk: action.risk,
            }),
          },
        });
        setPhase("thinking");
        requestSpokenResponse(`Kullanıcıya yalnızca sesli olarak şunu sor: \"${action.title}. ${action.summary}. Onaylıyor musun? Lütfen evet veya hayır de.\" Ekran onayından veya butondan bahsetme.`);
        return;
      }

      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify(payload.result),
        },
      });
      sendEvent({ type: "response.create" });
      setPhase("thinking");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Ruthie panel aracı çalıştırılamadı.";
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({ ok: false, error: message }),
        },
      });
      sendEvent({ type: "response.create" });
      setError(message);
      setPhase("error");
    }
  }, [requestSpokenResponse, sendEvent]);

  const handleEvent = useCallback((event: RealtimeEvent) => {
    const type = event.type || "";
    if (type === "session.created" || type === "session.updated") {
      if (event.session?.model) realtimeModelRef.current = event.session.model;
      setPhase("listening");
      setConnected(true);
    } else if (type === "response.created") {
      responseActiveRef.current = true;
    } else if (type === "input_audio_buffer.speech_started") {
      if (pendingVoiceActionRef.current && responseActiveRef.current) sendEvent({ type: "response.cancel" });
      userBufferRef.current = "";
      setUserText("");
      setAssistantText("");
      setPhase("listening");
    } else if (type === "input_audio_buffer.speech_stopped") {
      setPhase("thinking");
    } else if (type === "conversation.item.input_audio_transcription.delta") {
      userBufferRef.current += event.delta || "";
      setUserText(userBufferRef.current);
    } else if (type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (event.transcript || userBufferRef.current).trim();
      userBufferRef.current = "";
      const transcriptionUsd = transcriptionCostUsd(optionsRef.current.transcriptionModel, event.usage);
      if (transcriptionUsd > 0) {
        pendingTranscriptionCostRef.current += transcriptionUsd;
        setSessionCostUsd((current) => current + transcriptionUsd);
      }
      if (transcript) {
        optionsRef.current.onMessage({ role: "user", text: transcript });
        setUserText(transcript);
      }
      if (pendingVoiceActionRef.current && transcript) {
        void handleVoiceConfirmation(transcript);
      } else {
        setPhase("thinking");
      }
    } else if (type === "response.function_call_arguments.done") {
      void invokeAdminTool(event);
    } else if (type === "response.output_audio.delta" || type === "response.audio.delta") {
      setPhase("speaking");
    } else if (type === "response.output_audio_transcript.delta" || type === "response.audio_transcript.delta") {
      assistantBufferRef.current += event.delta || "";
      setAssistantText(assistantBufferRef.current);
      setPhase("speaking");
    } else if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
      finishAssistant(event.transcript);
    } else if (type === "response.done") {
      responseActiveRef.current = false;
      addResponseCost(event);
      if (assistantBufferRef.current.trim()) finishAssistant();
    } else if (type === "error") {
      setError(event.error?.message || "Sesli bağlantıda bir hata oluştu.");
      setPhase("error");
    }
  }, [addResponseCost, finishAssistant, handleVoiceConfirmation, invokeAdminTool, sendEvent]);

  const setTranslation = useCallback((enabled: boolean, targetLanguage = translationLanguage) => {
    setTranslationEnabled(enabled);
    setTranslationLanguage(targetLanguage);
    const text = enabled
      ? [
          "ÇEVİRİ MODU AKTİF.",
          `Dil çifti Türkçe ↔ ${targetLanguage}.`,
          `Türkçe duyarsan yalnızca ${targetLanguage} çevirisini; ${targetLanguage} duyarsan yalnızca Türkçe çevirisini sesli söyle.`,
          "Açıklama, yorum veya giriş cümlesi ekleme. Görselde metin gösterilirse aynı dil çiftiyle çevir.",
        ].join(" ")
      : "ÇEVİRİ MODU KAPATILDI. Normal Ruthie asistan davranışına dön.";

    return sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [{ type: "input_text", text }],
      },
    });
  }, [sendEvent, translationLanguage]);

  const sendVisionFrame = useCallback((frameOptions: {
    imageDataUrl: string;
    prompt?: string;
    detail?: "low" | "high" | "auto";
    requestResponse?: boolean;
  }) => {
    if (!frameOptions.imageDataUrl.startsWith("data:image/")) return false;
    const prompt = frameOptions.prompt?.trim()
      || "Bu, kullanıcının arka kamerasındaki güncel görüntüdür. Yanıt verme; kullanıcı bu görüntü hakkında soru sorarsa görsel bağlam olarak kullan.";
    const sent = sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          { type: "input_image", image_url: frameOptions.imageDataUrl, detail: frameOptions.detail || "low" },
          { type: "input_text", text: prompt },
        ],
      },
    });
    if (sent && frameOptions.requestResponse) {
      sendEvent({ type: "response.create" });
      setPhase("thinking");
    }
    return sent;
  }, [sendEvent]);

  const start = useCallback(async () => {
    if (!optionsRef.current.enabled || startingRef.current || phase === "connecting") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setError("Bu tarayıcı canlı sesli görüşmeyi desteklemiyor.");
      setPhase("error");
      return;
    }

    closeResources();
    setLastTurnCostUsd(null);
    setSessionCostUsd(0);
    startingRef.current = true;
    setError(null);
    setUserText("");
    setAssistantText("");
    setPhase("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const pc = new RTCPeerConnection();
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      const channel = pc.createDataChannel("oai-events");

      microphoneRef.current = stream;
      setMicrophoneStream(stream);
      peerRef.current = pc;
      channelRef.current = channel;
      audioRef.current = audio;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0] || new MediaStream([event.track]);
        setAssistantStream(remoteStream);
        audio.srcObject = remoteStream;
        void audio.play().catch(() => undefined);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
          setConnected(false);
          setError("Sesli bağlantı kesildi. Tekrar bağlanabilirsin.");
          setPhase("error");
        }
      };
      channel.onmessage = (messageEvent) => {
        try { handleEvent(JSON.parse(String(messageEvent.data)) as RealtimeEvent); } catch { /* keep call alive */ }
      };
      channel.onopen = () => {
        setConnected(true);
        sendEvent({
          type: "session.update",
          session: {
            tool_choice: "auto",
            tools: [REALTIME_ADMIN_TOOL],
            instructions: [
              "Sen Ruthie Commerce Assistant'sın ve doğrulanmış yöneticiyle konuşuyorsun.",
              "Sipariş, ürün, müşteri, stok, iade, kargo, kampanya, tema, yorum, puan ve e-posta için ruthie_admin aracını kullan.",
              "Asla panele erişimin veya yetkin olmadığını söyleme.",
              "Okuma araçlarını doğrudan kullan.",
              "Yazma işlemlerinde ekran, modal veya buton onayı yoktur. İstemci kullanıcıdan yalnızca sesli evet veya hayır onayı ister; onay sonucu gelmeden işlemi tamamlanmış sayma.",
              "Eksik zorunlu bilgileri uydurma; kısa sorularla tamamla.",
              "Türkçe, doğal ve kısa konuş.",
            ].join(" "),
          },
        });
        const context = optionsRef.current.conversationContext().slice(0, 6_000);
        if (context) {
          sendEvent({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: `Önceki yazılı sohbet bağlamını yanıt vermeden hatırla:\n${context}` }],
            },
          });
        }
        setPhase("listening");
      };
      channel.onerror = () => {
        setConnected(false);
        setError("Sesli görüşme veri kanalı açılamadı.");
        setPhase("error");
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);
      const localSdp = pc.localDescription?.sdp;
      if (!localSdp) throw new Error("Tarayıcı ses bağlantısı oluşturamadı.");
      const authHeaders = await adminAuthHeaders();
      const response = await fetch("/api/rosta-insight/openai/realtime", {
        method: "POST",
        cache: "no-store",
        headers: { ...authHeaders, "Content-Type": "application/sdp", "x-correlation-id": makeId("voice") },
        body: localSdp,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message || "Ruthie sesli bağlantısı başlatılamadı.");
      }
      const answerSdp = await response.text();
      if (!answerSdp.trim().startsWith("v=0")) throw new Error("Ses sunucusu geçerli bağlantı yanıtı vermedi.");
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      startingRef.current = false;
    } catch (caught) {
      closeResources();
      setError(caught instanceof Error ? caught.message : "Ruthie sesli bağlantısı başlatılamadı.");
      setPhase("error");
    }
  }, [closeResources, handleEvent, phase, sendEvent]);

  const retry = useCallback(async () => {
    closeResources();
    setPhase("idle");
    await start();
  }, [closeResources, start]);

  return {
    phase,
    error,
    userText,
    assistantText,
    microphoneStream,
    assistantStream,
    connected,
    translationEnabled,
    translationLanguage,
    lastTurnCostUsd,
    sessionCostUsd,
    awaitingVoiceConfirmation,
    start,
    end,
    retry,
    sendVisionFrame,
    setTranslation,
  };
}
