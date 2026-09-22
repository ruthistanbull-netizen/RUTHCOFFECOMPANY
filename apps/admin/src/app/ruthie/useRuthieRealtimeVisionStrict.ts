"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import {
  compactRuthieText,
  RUTHIE_IDENTITY_GUIDE,
  RUTHIE_STRICT_BEHAVIOR_GUIDE,
  RUTHIE_VOICE_ANALYSIS_GUIDE,
} from "@/lib/ruthieBehavior";
import { calculateRuthieApiCost, type RuthieApiUsage } from "@/lib/ruthieApiCost";
import { dispatchRuthiePresentationRequest } from "./ruthiePresentationEvents";
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
  item?: { id?: string };
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
    "Ruth Commerce admin panelinin canlı aracıdır.",
    "Sipariş, ürün, müşteri, stok, iade, kargo, kampanya, tema, yorum, puan ve e-posta sorgularında uygun action kullan.",
    "Panelde değişiklik istenirse uygun write action çağır; istemci kullanıcıdan sesli onay alır.",
    "query GET filtreleri, payload işlem JSON gövdesi, resourceId dinamik kayıt kimliğidir.",
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

const SPOKEN_LIMIT_TOKENS = 640;
const SESSION_LIMIT_TOKENS = 1_200;
const CHANNEL_BACKPRESSURE_BYTES = 1_500_000;

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

function decodeHeader(value: string | null) {
  if (!value) return "";
  try { return decodeURIComponent(value); } catch { return value; }
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
  const pendingResponseRef = useRef<string | null>(null);
  const pendingTranscriptionCostRef = useRef(0);
  const realtimeModelRef = useRef(options.model || "");
  const optionsRef = useRef(options);
  const lastUserTranscriptRef = useRef("");
  const latestVisionItemRef = useRef<string | null>(null);
  const actorContextRef = useRef("");

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

  const createSpokenResponse = useCallback((instructions: string) => sendEvent({
    type: "response.create",
    response: {
      output_modalities: ["audio"],
      max_output_tokens: SPOKEN_LIMIT_TOKENS,
      instructions: `${RUTHIE_STRICT_BEHAVIOR_GUIDE}\n\n${instructions}`,
    },
  }), [sendEvent]);

  const queueSpokenResponse = useCallback((instructions: string) => {
    pendingResponseRef.current = instructions;
    setPhase("thinking");
    if (responseActiveRef.current) return true;
    const next = pendingResponseRef.current;
    pendingResponseRef.current = null;
    return next ? createSpokenResponse(next) : false;
  }, [createSpokenResponse]);

  const flushPendingResponse = useCallback(() => {
    if (responseActiveRef.current) return;
    const next = pendingResponseRef.current;
    if (!next) return;
    pendingResponseRef.current = null;
    window.setTimeout(() => {
      if (!responseActiveRef.current) createSpokenResponse(next);
      else pendingResponseRef.current = next;
    }, 30);
  }, [createSpokenResponse]);

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
    pendingResponseRef.current = null;
    responseActiveRef.current = false;
    pendingTranscriptionCostRef.current = 0;
    latestVisionItemRef.current = null;
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
    const raw = (text || assistantBufferRef.current).trim();
    assistantBufferRef.current = "";
    const finalText = compactRuthieText(raw, lastUserTranscriptRef.current);
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
    if (!response.ok || !payload?.ok) throw new Error(payload?.result?.error || payload?.error?.message || "İşlem uygulanamadı.");
    return { ok: true, title: payload.result?.title || action.title, data: payload.result?.data };
  }, []);

  const handleVoiceConfirmation = useCallback(async (transcript: string) => {
    const action = pendingVoiceActionRef.current;
    if (!action) return;
    if (responseActiveRef.current) sendEvent({ type: "response.cancel" });
    const decision = voiceConfirmationDecision(transcript);

    if (decision === "unclear") {
      queueSpokenResponse(`Yalnız şunu sor: "${action.title} işlemini onaylıyor musun? Evet veya hayır de."`);
      return;
    }

    pendingVoiceActionRef.current = null;
    setAwaitingVoiceConfirmation(false);
    if (decision === "reject") {
      sendEvent({
        type: "conversation.item.create",
        item: { type: "message", role: "system", content: [{ type: "input_text", text: `${action.title} kullanıcı tarafından reddedildi.` }] },
      });
      queueSpokenResponse("Yalnız 'İptal ettim.' de.");
      return;
    }

    setPhase("acting");
    try {
      const result = await executeVoiceAction(action);
      sendEvent({
        type: "conversation.item.create",
        item: { type: "message", role: "system", content: [{ type: "input_text", text: `İşlem uygulandı: ${JSON.stringify(result)}` }] },
      });
      queueSpokenResponse("'Yaptım.' ile başla. Sonucu gereksiz uzatmadan fakat gerekli hiçbir bilgiyi atlamadan tamamla.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "İşlem uygulanamadı.";
      sendEvent({
        type: "conversation.item.create",
        item: { type: "message", role: "system", content: [{ type: "input_text", text: `İşlem başarısız: ${message}` }] },
      });
      queueSpokenResponse(`Hata sonucunu kısa fakat eksiksiz söyle: ${message}`);
    }
  }, [executeVoiceAction, queueSpokenResponse, sendEvent]);

  const invokeAdminTool = useCallback(async (event: RealtimeEvent) => {
    const callId = event.call_id?.trim();
    if (!callId || event.name !== "ruthie_admin" || handledCallsRef.current.has(callId)) return;
    handledCallsRef.current.add(callId);

    if (pendingVoiceActionRef.current) {
      sendEvent({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ ok: false, awaiting_voice_confirmation: true }) },
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
      if (!response.ok || !payload?.ok || !payload.result) throw new Error(payload?.error?.message || "Panel aracı çalıştırılamadı.");

      if (payload.result.pendingAction) {
        const action = payload.result.pendingAction;
        pendingVoiceActionRef.current = action;
        setAwaitingVoiceConfirmation(true);
        sendEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify({ ok: false, awaiting_voice_confirmation: true, title: action.title, summary: action.summary, risk: action.risk }),
          },
        });
        queueSpokenResponse(`Yalnız şunu sor: "${action.title}. ${action.summary}. Onaylıyor musun? Evet veya hayır de."`);
        return;
      }

      sendEvent({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: JSON.stringify(payload.result) },
      });
      queueSpokenResponse("Kullanıcıdan yeniden konuşmasını bekleme. Araç sonucunu şimdi kısa, doğrudan ve eksiksiz biçimde tamamlayarak söyle.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Panel aracı çalıştırılamadı.";
      sendEvent({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ ok: false, error: message }) },
      });
      setError(message);
      queueSpokenResponse(`Aracın başarısız olduğunu kısa fakat eksiksiz söyle: ${message}`);
    }
  }, [queueSpokenResponse, sendEvent]);

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
      lastUserTranscriptRef.current = transcript;
      const transcriptionUsd = transcriptionCostUsd(optionsRef.current.transcriptionModel, event.usage);
      if (transcriptionUsd > 0) {
        pendingTranscriptionCostRef.current += transcriptionUsd;
        setSessionCostUsd((current) => current + transcriptionUsd);
      }
      if (transcript) {
        optionsRef.current.onMessage({ role: "user", text: transcript });
        setUserText(transcript);
        dispatchRuthiePresentationRequest({
          id: makeId("voice-presentation"),
          text: transcript,
          mode: document.querySelector("[data-ruthie-voice-app]") ? "voice" : "chat",
        });
      }
      if (pendingVoiceActionRef.current && transcript) void handleVoiceConfirmation(transcript);
      else setPhase("thinking");
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
      flushPendingResponse();
    } else if (type === "error") {
      const message = event.error?.message || "Sesli bağlantıda hata oluştu.";
      setError(message);
      responseActiveRef.current = false;
      flushPendingResponse();
      if (!pendingResponseRef.current) setPhase("error");
    }
  }, [addResponseCost, finishAssistant, flushPendingResponse, handleVoiceConfirmation, invokeAdminTool, sendEvent]);

  const setTranslation = useCallback((enabled: boolean, targetLanguage = translationLanguage) => {
    setTranslationEnabled(enabled);
    setTranslationLanguage(targetLanguage);
    const text = enabled
      ? `ÇEVİRİ MODU AKTİF. Türkçe ↔ ${targetLanguage}. Yalnız çeviriyi söyle; açıklama ekleme.`
      : "ÇEVİRİ MODU KAPATILDI. Normal kısa ve eksiksiz ROSTA Insight davranışına dön.";
    return sendEvent({
      type: "conversation.item.create",
      item: { type: "message", role: "system", content: [{ type: "input_text", text }] },
    });
  }, [sendEvent, translationLanguage]);

  const sendVisionFrame = useCallback((frameOptions: {
    imageDataUrl: string;
    prompt?: string;
    detail?: "low" | "high" | "auto";
    requestResponse?: boolean;
  }) => {
    const channel = channelRef.current;
    if (!frameOptions.imageDataUrl.startsWith("data:image/") || !channel || channel.readyState !== "open") return false;
    if (channel.bufferedAmount > CHANNEL_BACKPRESSURE_BYTES) return false;

    const itemId = makeId("vision");
    const prompt = frameOptions.prompt?.trim()
      || "Bu en güncel kamera karesidir. Yanıt verme; kullanıcı gösterdiği şeyi sorarsa bu kareyi kullan.";
    const previousItemId = latestVisionItemRef.current;
    const sent = sendEvent({
      type: "conversation.item.create",
      item: {
        id: itemId,
        type: "message",
        role: "user",
        content: [
          { type: "input_image", image_url: frameOptions.imageDataUrl, detail: frameOptions.detail || "low" },
          { type: "input_text", text: prompt },
        ],
      },
    });
    if (!sent) return false;

    latestVisionItemRef.current = itemId;
    if (previousItemId && previousItemId !== itemId) {
      sendEvent({ type: "conversation.item.delete", item_id: previousItemId });
    }
    if (frameOptions.requestResponse) {
      queueSpokenResponse("En güncel kamera karesini kullan. Kullanıcının isteğine kısa fakat gerekli bütün ayrıntıları tamamlayarak cevap ver.");
    }
    return true;
  }, [queueSpokenResponse, sendEvent]);

  const start = useCallback(async () => {
    if (!optionsRef.current.enabled || startingRef.current || phase === "connecting") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setError("Tarayıcı canlı sesi desteklemiyor.");
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
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      const pc = new RTCPeerConnection();
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      const channel = pc.createDataChannel("oai-events");
      channel.bufferedAmountLowThreshold = 250_000;

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
          setError("Sesli bağlantı kesildi.");
          setPhase("error");
        }
      };
      channel.onmessage = (messageEvent) => {
        try { handleEvent(JSON.parse(String(messageEvent.data)) as RealtimeEvent); } catch { /* keep call alive */ }
      };
      channel.onopen = () => {
        setConnected(true);
        const context = optionsRef.current.conversationContext().slice(0, 18_000);
        const instructions = [
          RUTHIE_STRICT_BEHAVIOR_GUIDE,
          RUTHIE_IDENTITY_GUIDE,
          actorContextRef.current,
          RUTHIE_VOICE_ANALYSIS_GUIDE,
          context,
          "Admin paneli için ruthie_admin aracını kullan. Okuma işlemlerini doğrudan çalıştır.",
          "Araç sonucundan sonra aynı turda otomatik cevap ver; kullanıcıdan ikinci kez konuşmasını bekleme.",
          "Yazma işleminde yalnız sesli evet/hayır onayı iste. Eksik zorunlu bilgiyi tek kısa soruyla tamamla.",
          "Kamera açıksa konuşmadaki en son görüntü karesi canlı ve güncel görüntüdür.",
          "Genel olarak kısa konuş; ancak doğru ve eksiksiz cevap daha uzunsa bütün gerekli bilgileri söyle ve cümleyi bitirmeden durma.",
          "Kullanıcı sonucu ekranda göster, aç, tablo yap veya kart olarak getir diyorsa görsel arayüz isteği transkripsiyon biter bitmez paralel hazırlanır; sen sonucu yeniden bekletmeden kısa biçimde konuş.",
        ].filter(Boolean).join("\n\n");
        sendEvent({
          type: "session.update",
          session: {
            tool_choice: "auto",
            tools: [REALTIME_ADMIN_TOOL],
            max_output_tokens: SESSION_LIMIT_TOKENS,
            instructions,
          },
        });
        if (context) {
          sendEvent({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "system",
              content: [{ type: "input_text", text: `Kalıcı ROSTA Insight bağlamı; yanıt vermeden uygula:\n${context}` }],
            },
          });
        }
        setPhase("listening");
      };
      channel.onerror = () => {
        setConnected(false);
        setError("Sesli veri kanalı açılamadı.");
        setPhase("error");
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);
      const localSdp = pc.localDescription?.sdp;
      if (!localSdp) throw new Error("Ses bağlantısı oluşturulamadı.");
      const authHeaders = await adminAuthHeaders();
      const response = await fetch("/api/rosta-insight/openai/realtime", {
        method: "POST",
        cache: "no-store",
        headers: { ...authHeaders, "Content-Type": "application/sdp", "x-correlation-id": makeId("voice") },
        body: localSdp,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message || "ROSTA Insight sesli bağlantısı başlatılamadı.");
      }
      const actorName = decodeHeader(response.headers.get("x-rosta-insight-actor-name"));
      const actorEmail = decodeHeader(response.headers.get("x-rosta-insight-actor-email"));
      actorContextRef.current = actorName
        ? `AKTİF OTURUM: ${actorName}. E-posta: ${actorEmail || "bilinmiyor"}. Bu kullanıcıyı adıyla tanı ve kimliğini yeniden sorma.`
        : "";
      const answerSdp = await response.text();
      if (!answerSdp.trim().startsWith("v=0")) throw new Error("Ses sunucusu geçerli bağlantı yanıtı vermedi.");
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      startingRef.current = false;
    } catch (caught) {
      closeResources();
      setError(caught instanceof Error ? caught.message : "ROSTA Insight sesli bağlantısı başlatılamadı.");
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
