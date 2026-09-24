"use client";

import Link from "next/link";
import {
  Camera,
  CameraOff,
  LoaderCircle,
  MessageSquareText,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import { formatRuthieUsd } from "@/lib/ruthieApiCost";
import {
  DEFAULT_RUTHIE_VOICE,
  normalizeRuthieVoice,
  RUTHIE_VOICES,
  RUTHIE_VOICE_COOKIE,
  RUTHIE_VOICE_STORAGE_KEY,
  type RuthieVoiceId,
} from "@/lib/ruthieVoices";
import { RuthieCameraVision } from "./RuthieCameraVision";
import { RuthieVoiceOrb } from "./RuthieVoiceOrb";
import { useRuthieRealtimeVision } from "./useRuthieRealtimeVision";
import styles from "./RuthieVoiceOnly.module.css";

type ProviderStatus = {
  ok?: boolean;
  configured?: boolean;
  models?: { realtime?: string; transcription?: string };
  capabilities?: { realtimeVoice?: boolean };
};

type Transcript = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

const MEMORY_KEY = "ruthie.voice.transcripts.v1";
const MEMORY_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const MAX_MEMORY_MESSAGES = 80;
const MAX_SESSION_MS = 20 * 60 * 1_000;
const MAX_AUTO_RECONNECTS = 4;

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadVoiceMemory(): Transcript[] {
  try {
    const raw = window.localStorage.getItem(MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - MEMORY_TTL_MS;
    return parsed.filter((item): item is Transcript => (
      item
      && typeof item.id === "string"
      && (item.role === "user" || item.role === "assistant")
      && typeof item.text === "string"
      && item.text.trim().length > 0
      && typeof item.createdAt === "string"
      && Date.parse(item.createdAt) >= cutoff
    )).slice(-MAX_MEMORY_MESSAGES);
  } catch {
    return [];
  }
}

function shouldAutoReconnect(message: string | null) {
  const normalized = (message || "").toLocaleLowerCase("tr-TR");
  return !["izin", "permission", "günlük", "daily", "çok sık", "rate", "yapılandırması eksik", "not configured"]
    .some((term) => normalized.includes(term));
}

function cookieVoice() {
  if (typeof document === "undefined") return "";
  const prefix = `${encodeURIComponent(RUTHIE_VOICE_COOKIE)}=`;
  for (const part of document.cookie.split(";")) {
    const value = part.trim();
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
  }
  return "";
}

function persistVoice(voice: RuthieVoiceId) {
  window.localStorage.setItem(RUTHIE_VOICE_STORAGE_KEY, voice);
  document.cookie = `${encodeURIComponent(RUTHIE_VOICE_COOKIE)}=${encodeURIComponent(voice)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function RuthieVoiceOnly() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [translationLanguage, setTranslationLanguage] = useState("İngilizce");
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<RuthieVoiceId>(DEFAULT_RUTHIE_VOICE);
  const [draftVoice, setDraftVoice] = useState<RuthieVoiceId>(DEFAULT_RUTHIE_VOICE);
  const [previewing, setPreviewing] = useState<RuthieVoiceId | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [sessionLimitReached, setSessionLimitReached] = useState(false);
  const autoStartAttempted = useRef(false);
  const desktopGestureRecoveryAttempted = useRef(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const memoryHydrated = useRef(false);
  const reconnectAttempts = useRef(0);

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = "";
      previewAudioRef.current = null;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewing(null);
  }, []);

  useEffect(() => {
    const previousBackground = document.body.style.background;
    const previousOverflow = document.body.style.overflow;
    document.body.style.background = "var(--ruth-color-text-primary)";
    document.body.style.overflow = "hidden";

    setTranscripts(loadVoiceMemory());
    memoryHydrated.current = true;

    const storedVoice = normalizeRuthieVoice(
      window.localStorage.getItem(RUTHIE_VOICE_STORAGE_KEY) || cookieVoice(),
    );
    setSelectedVoice(storedVoice);
    setDraftVoice(storedVoice);
    persistVoice(storedVoice);

    void (async () => {
      try {
        const headers = await adminAuthHeaders();
        const response = await fetch("/api/ruthie/openai/status", { headers, cache: "no-store" });
        const payload = await response.json() as ProviderStatus;
        setStatus(payload);
      } catch {
        setStatus({ ok: false, configured: false });
      }
    })();
    return () => {
      stopPreview();
      document.body.style.background = previousBackground;
      document.body.style.overflow = previousOverflow;
    };
  }, [stopPreview]);

  useEffect(() => {
    if (!memoryHydrated.current) return;
    try {
      window.localStorage.setItem(MEMORY_KEY, JSON.stringify(transcripts.slice(-MAX_MEMORY_MESSAGES)));
    } catch {
      // Voice remains usable when browser storage is unavailable.
    }
  }, [transcripts]);

  const voiceReady = Boolean(status?.configured && status.capabilities?.realtimeVoice);
  const conversationContext = useCallback(
    () => transcripts.slice(-24).map((item) => `${item.role === "user" ? "Kullanıcı" : "Ruthie"}: ${item.text}`).join("\n"),
    [transcripts],
  );
  const realtime = useRuthieRealtimeVision({
    enabled: voiceReady,
    conversationContext,
    model: status?.models?.realtime,
    transcriptionModel: status?.models?.transcription,
    onMessage: (message) => setTranscripts((items) => [
      ...items,
      { id: makeId(), createdAt: new Date().toISOString(), ...message },
    ].slice(-MAX_MEMORY_MESSAGES)),
  });

  useEffect(() => {
    if (!voiceReady || autoStartAttempted.current) return;
    autoStartAttempted.current = true;
    void realtime.start();
  }, [realtime.start, voiceReady]);

  useEffect(() => {
    if (!realtime.connected) return;
    reconnectAttempts.current = 0;
    setSessionLimitReached(false);
    const timer = window.setTimeout(() => {
      setSessionLimitReached(true);
      realtime.end();
    }, MAX_SESSION_MS);
    return () => window.clearTimeout(timer);
  }, [realtime.connected, realtime.end]);

  useEffect(() => {
    if (realtime.phase !== "error" || !voiceReady || !navigator.onLine || !shouldAutoReconnect(realtime.error)) return;
    if (reconnectAttempts.current >= MAX_AUTO_RECONNECTS) return;
    const attempt = reconnectAttempts.current++;
    const timer = window.setTimeout(() => void realtime.retry(), Math.min(8_000, 1_000 * (2 ** attempt)));
    return () => window.clearTimeout(timer);
  }, [realtime.error, realtime.phase, realtime.retry, voiceReady]);

  useEffect(() => {
    const reconnectWhenOnline = () => {
      if (voiceReady && realtime.phase === "error" && reconnectAttempts.current < MAX_AUTO_RECONNECTS) {
        void realtime.retry();
      }
    };
    window.addEventListener("online", reconnectWhenOnline);
    return () => window.removeEventListener("online", reconnectWhenOnline);
  }, [realtime.phase, realtime.retry, voiceReady]);

  useEffect(() => {
    const stream = realtime.microphoneStream;
    if (!stream) return;
    const tracks = stream.getAudioTracks();

    const wakeTracks = () => {
      tracks.forEach((track) => {
        track.enabled = true;
        if (track.readyState === "live") {
          void track.applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          }).catch(() => undefined);
        }
      });
    };

    const recoverEndedTrack = () => {
      if (voiceReady && reconnectAttempts.current < MAX_AUTO_RECONNECTS) void realtime.retry();
    };

    wakeTracks();
    tracks.forEach((track) => {
      track.addEventListener("mute", wakeTracks);
      track.addEventListener("unmute", wakeTracks);
      track.addEventListener("ended", recoverEndedTrack);
    });
    window.addEventListener("focus", wakeTracks);
    document.addEventListener("visibilitychange", wakeTracks);

    return () => {
      tracks.forEach((track) => {
        track.removeEventListener("mute", wakeTracks);
        track.removeEventListener("unmute", wakeTracks);
        track.removeEventListener("ended", recoverEndedTrack);
      });
      window.removeEventListener("focus", wakeTracks);
      document.removeEventListener("visibilitychange", wakeTracks);
    };
  }, [realtime.microphoneStream, realtime.retry, voiceReady]);

  useEffect(() => {
    if (!voiceReady || typeof window === "undefined" || !window.matchMedia("(pointer: fine)").matches) return;

    const recoverOnDesktopGesture = () => {
      realtime.microphoneStream?.getAudioTracks().forEach((track) => { track.enabled = true; });
      if (desktopGestureRecoveryAttempted.current || realtime.connected) return;
      desktopGestureRecoveryAttempted.current = true;
      void realtime.retry();
    };

    window.addEventListener("pointerdown", recoverOnDesktopGesture, { capture: true, passive: true });
    window.addEventListener("keydown", recoverOnDesktopGesture, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", recoverOnDesktopGesture, { capture: true });
      window.removeEventListener("keydown", recoverOnDesktopGesture, { capture: true });
    };
  }, [realtime.connected, realtime.microphoneStream, realtime.retry, voiceReady]);

  const previewVoice = useCallback(async () => {
    stopPreview();
    setPreviewError("");
    setPreviewing(draftVoice);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/openai/voice-preview", {
        method: "POST",
        cache: "no-store",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ voice: draftVoice }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message || "Ses örneği oluşturulamadı.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewUrlRef.current = url;
      previewAudioRef.current = audio;
      audio.onended = stopPreview;
      audio.onerror = () => {
        setPreviewError("Ses örneği çalınamadı.");
        stopPreview();
      };
      await audio.play();
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Ses örneği oluşturulamadı.");
      stopPreview();
    }
  }, [draftVoice, stopPreview]);

  const applyVoice = useCallback(async () => {
    stopPreview();
    persistVoice(draftVoice);
    setSelectedVoice(draftVoice);
    setSettingsOpen(false);
    if (voiceReady) await realtime.retry();
  }, [draftVoice, realtime, stopPreview, voiceReady]);

  const manualRetry = () => {
    reconnectAttempts.current = 0;
    setSessionLimitReached(false);
    void realtime.retry();
  };

  const showCamera = cameraOpen && realtime.phase !== "idle";
  const voiceLabel = realtime.awaitingVoiceConfirmation ? "Sesli onay bekliyor"
    : realtime.phase === "connecting" ? "Bağlanıyor"
      : realtime.phase === "thinking" ? "Düşünüyor"
        : realtime.phase === "acting" ? "İşlem yapıyor"
          : realtime.phase === "speaking" ? "Konuşuyor"
            : realtime.phase === "error" ? "Bağlantı hatası"
              : realtime.phase === "idle" ? status === null ? "Hazırlanıyor" : voiceReady ? "Bağlanıyor" : "Bağlantı yok"
                : "Dinliyor";
  const idleHeadline = sessionLimitReached
    ? "Görüşme süresi doldu"
    : status === null ? "ROSTA Insight hazırlanıyor" : voiceReady ? "Sesli bağlantı başlatılıyor" : "Sesli Ruthie kullanılamıyor";
  const voiceHeadline = realtime.assistantText || realtime.userText || (showCamera ? "Göster ve sor" : realtime.phase === "idle" ? idleHeadline : "Konuşmaya başlayabilirsin");
  const costDescription = realtime.lastTurnCostUsd === null
    ? ""
    : ` Son tur: ${formatRuthieUsd(realtime.lastTurnCostUsd)} · Oturum: ${formatRuthieUsd(realtime.sessionCostUsd)}.`;
  const voiceDescription = (sessionLimitReached
    ? "Maliyet koruması için görüşme 20 dakika sonunda kapatıldı. İstersen yeniden bağlanabilirsin."
    : realtime.error || (realtime.phase === "idle"
    ? status === null
      ? "Sesli bağlantı hazırlanıyor."
      : voiceReady
        ? "Mikrofon izni istendiğinde onayla; görüşme otomatik başlayacak."
        : "OpenAI Realtime yapılandırmasını ve bağlantıyı kontrol et."
    : realtime.awaitingVoiceConfirmation
      ? "İşlemi uygulamak için yalnızca sesli olarak evet veya hayır de."
      : `Konuşabilir, kamerayı açabilir veya canlı çeviri kullanabilirsin. Ses: ${selectedVoice}`)) + costDescription;
  const headlineDensity = voiceHeadline.length > 150 ? "dense" : voiceHeadline.length > 72 ? "long" : "normal";

  return (
    <section className={styles.app} data-ruthie-voice-app data-phase={realtime.phase}>
      <header className={styles.topbar}>
        <div className={styles.identity}><span><Sparkles /></span><div><strong>Ruthie</strong><small>{status?.models?.realtime || "gpt-realtime"}</small></div></div>
        <div className={styles.state}><i className={realtime.phase === "error" ? styles.stateError : ""} /><strong>{voiceLabel}</strong></div>
        <div className={styles.actions}>
          <button type="button" onClick={() => { setDraftVoice(selectedVoice); setPreviewError(""); setSettingsOpen(true); }} aria-label="Ruthie sesini seç"><Settings2 /></button>
          <Link href="/ruthie/chat" aria-label="ROSTA Insight Chat'e geç"><MessageSquareText /></Link>
          <button type="button" onClick={() => setCameraOpen((value) => !value)} disabled={!realtime.connected} aria-pressed={showCamera} aria-label={showCamera ? "Kamerayı kapat" : "Arka kamerayı aç"}>{showCamera ? <CameraOff /> : <Camera />}</button>
          <Link href="/" aria-label="Panele dön"><X /></Link>
        </div>
      </header>

      <main className={styles.stage} data-ruthie-voice-stage>
        {showCamera ? (
          <RuthieCameraVision
            connected={realtime.connected}
            translationEnabled={realtime.translationEnabled}
            translationLanguage={translationLanguage}
            onClose={() => setCameraOpen(false)}
            onFrame={realtime.sendVisionFrame}
            onTranslation={(enabled, language) => {
              const target = language || translationLanguage;
              setTranslationLanguage(target);
              return realtime.setTranslation(enabled, target);
            }}
          />
        ) : (
          <>
            <div className={styles.orb} data-ruthie-orb-shell data-phase={realtime.phase}><RuthieVoiceOrb phase={realtime.phase === "idle" ? "connecting" : realtime.phase} inputStream={realtime.microphoneStream} outputStream={realtime.assistantStream} muted={false} /></div>
            <div className={styles.copy} data-ruthie-voice-copy data-density={headlineDensity}>
              <small>{voiceLabel}</small>
              <h1>{voiceHeadline}</h1>
              <p>{voiceDescription}</p>
              {realtime.phase === "error" || sessionLimitReached
                ? <button type="button" onClick={manualRetry}><RotateCcw /> Tekrar bağlan</button>
                : null}
            </div>
          </>
        )}
      </main>

      {settingsOpen ? (
        <div className={styles.settingsBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className={styles.settingsPanel} role="dialog" aria-modal="true" aria-labelledby="ruthie-voice-title">
            <div className={styles.settingsHeader}>
              <div><small>RUTHIE SESİ</small><h2 id="ruthie-voice-title">Ses seç ve dinle</h2></div>
              <button type="button" onClick={() => { stopPreview(); setSettingsOpen(false); }} aria-label="Ses ayarlarını kapat"><X /></button>
            </div>

            <div className={styles.voicePickerRow}>
              <label>
                <span>Ses</span>
                <select value={draftVoice} onChange={(event) => { stopPreview(); setPreviewError(""); setDraftVoice(normalizeRuthieVoice(event.target.value)); }}>
                  {RUTHIE_VOICES.map((voice) => (
                    <option key={voice.id} value={voice.id}>{voice.label}{voice.recommended ? " · Önerilen" : ""}</option>
                  ))}
                </select>
              </label>
              <button className={styles.previewButton} type="button" onClick={() => void previewVoice()} disabled={previewing !== null}>
                {previewing ? <LoaderCircle className={styles.spin} /> : <Play />} {previewing ? "Hazırlanıyor" : "Dinle"}
              </button>
            </div>

            <p className={styles.voiceDescriptionText}>{RUTHIE_VOICES.find((voice) => voice.id === draftVoice)?.description}</p>
            {previewError ? <p className={styles.previewError}>{previewError}</p> : null}
            <p className={styles.voiceNote}>Ses değiştiğinde mevcut görüşme yeniden bağlanır.</p>

            <div className={styles.settingsFooter}>
              <Link href="/ruthie/wake">Sesle açma ayarları</Link>
              <button type="button" onClick={() => void applyVoice()} disabled={draftVoice === selectedVoice && !previewError}>Bu sesi kullan</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
