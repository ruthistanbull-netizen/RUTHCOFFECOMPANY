"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import { RUTHIE_VOICE_STORAGE_KEY } from "./ruthieUnifiedAgentClient";

type VoiceProfile = {
  profileId: string;
  displayName: string;
  analysisEnabled: boolean;
  learningEnabled: boolean;
  completionPercent: number;
  status: "collecting" | "ready" | "paused" | "reset_required";
  sampleCount: number;
  totalDurationSeconds: number;
  cleanDurationSeconds: number;
  deviceCount: number;
  speechRateAverage: number | null;
  pitchAverageHz: number | null;
  lastMatchConfidence: number | null;
  lastMatchedProfileId: string | null;
  lastMatchedName: string | null;
  lastQualityScore: number | null;
  lastAnalyzedAt: string | null;
  updatedAt: string;
};

type VoiceProfileResponse = {
  ok?: boolean;
  profile?: VoiceProfile;
  match?: {
    matchedProfileId?: string | null;
    matchedName?: string | null;
    confidence?: number | null;
    decision?: "matched" | "uncertain" | "rejected";
  };
  error?: { message?: string };
};

type StoredTranscript = {
  id?: string;
  role?: string;
  text?: string;
  createdAt?: string;
};

type AcousticFrame = {
  vector: number[];
  rms: number;
  pitch: number | null;
  noise: number;
};

const SAMPLE_INTERVAL_MS = 100;
const MIN_SPEECH_FRAMES = 18;
const MAX_SPEECH_FRAMES = 45;
const SILENCE_FLUSH_FRAMES = 8;

export function RuthieVoiceAnalysisOverlay() {
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [error, setError] = useState("");
  const [microphoneState, setMicrophoneState] = useState<"idle" | "ready" | "blocked">("idle");
  const [commandMessage, setCommandMessage] = useState("");
  const seenTranscriptIds = useRef(new Set<string>());
  const commandHydrated = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/rosta-insight/voice-profile", { headers, cache: "no-store" });
      const payload = await response.json().catch(() => null) as VoiceProfileResponse | null;
      if (!response.ok || !payload?.ok || !payload.profile) throw new Error(payload?.error?.message || "Ses profili okunamadı.");
      setProfile(payload.profile);
      setError("");
      return payload.profile;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ses profili okunamadı.");
      return null;
    }
  }, []);

  const updateProfile = useCallback(async (action: "enable" | "disable" | "toggle" | "learning_enable" | "learning_disable" | "reset") => {
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/rosta-insight/voice-profile", {
        method: "PATCH",
        cache: "no-store",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null) as VoiceProfileResponse | null;
      if (!response.ok || !payload?.ok || !payload.profile) throw new Error(payload?.error?.message || "Ses profili güncellenemedi.");
      setProfile(payload.profile);
      setError("");
      const message = action === "reset"
        ? "Ses profili sıfırlandı."
        : action === "disable" || (action === "toggle" && !payload.profile.analysisEnabled)
          ? "Ses analizi kapatıldı."
          : action === "learning_disable"
            ? "Sürekli öğrenme kapatıldı."
            : action === "learning_enable"
              ? "Sürekli öğrenme açıldı."
              : "Ses analizi açıldı.";
      setCommandMessage(message);
      window.setTimeout(() => setCommandMessage(""), 4_000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ses profili güncellenemedi.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const transcripts = readTranscripts();
      if (!commandHydrated.current) {
        transcripts.forEach((item) => { if (item.id) seenTranscriptIds.current.add(item.id); });
        commandHydrated.current = true;
        return;
      }

      for (const item of transcripts) {
        if (!item.id || seenTranscriptIds.current.has(item.id)) continue;
        seenTranscriptIds.current.add(item.id);
        if (item.role !== "user" || !item.text) continue;
        const command = voiceProfileCommand(item.text);
        if (command) void updateProfile(command);
      }
    }, 600);
    return () => window.clearInterval(timer);
  }, [updateProfile]);

  useEffect(() => {
    if (!profile?.analysisEnabled) return;
    let disposed = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let timer = 0;
    let sending = false;
    let noiseFloor = 0.008;
    let silenceFrames = 0;
    let frames: AcousticFrame[] = [];
    let deviceHash = "unknown";

    const resetFrames = () => {
      frames = [];
      silenceFrames = 0;
    };

    const sendSample = async () => {
      if (sending || frames.length < MIN_SPEECH_FRAMES) return;
      sending = true;
      const snapshot = frames;
      resetFrames();
      try {
        const durationSeconds = snapshot.length * SAMPLE_INTERVAL_MS / 1_000;
        const vector = averageVectors(snapshot.map((frame) => frame.vector));
        const pitches = snapshot.map((frame) => frame.pitch).filter((value): value is number => value != null);
        const pitchMeanHz = pitches.length ? average(pitches) : null;
        const pitchStdHz = pitches.length ? standardDeviation(pitches, pitchMeanHz || 0) : null;
        const energyMean = average(snapshot.map((frame) => frame.rms));
        const noiseScore = clamp(average(snapshot.map((frame) => frame.noise)), 0, 100);
        const qualityScore = clamp(100 - noiseScore * 0.55 + Math.min(15, durationSeconds * 2), 0, 100);
        const latestText = latestUserTranscript();
        const transcriptWordCount = latestText ? latestText.split(/\s+/).filter(Boolean).length : 0;
        const speechRate = transcriptWordCount > 0 ? clamp(transcriptWordCount / durationSeconds * 60, 40, 280) : null;
        const headers = await adminAuthHeaders();
        const response = await fetch("/api/rosta-insight/voice-profile", {
          method: "POST",
          cache: "no-store",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            durationSeconds,
            qualityScore,
            speechRate,
            pitchMeanHz,
            pitchStdHz,
            energyMean,
            noiseScore,
            deviceHash,
            featureVector: vector,
            transcriptWordCount,
          }),
        });
        const payload = await response.json().catch(() => null) as VoiceProfileResponse | null;
        if (response.ok && payload?.ok && payload.profile) {
          setProfile(payload.profile);
          setError("");
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Ses örneği analiz edilemedi.");
      } finally {
        sending = false;
      }
    };

    const start = async () => {
      try {
        await waitForVoiceApp();
        if (disposed) return;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextConstructor) throw new Error("Tarayıcı ses analizini desteklemiyor.");
        context = new AudioContextConstructor();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.2;
        source.connect(analyser);
        const timeData = new Float32Array(analyser.fftSize);
        const frequencyData = new Uint8Array(analyser.frequencyBinCount);
        deviceHash = await acousticDeviceHash(stream);
        setMicrophoneState("ready");

        timer = window.setInterval(() => {
          if (disposed || !context || context.state === "closed") return;
          const phase = document.querySelector<HTMLElement>("[data-ruthie-voice-app]")?.dataset.phase || "idle";
          analyser.getFloatTimeDomainData(timeData);
          analyser.getByteFrequencyData(frequencyData);
          const rms = rootMeanSquare(timeData);
          const activeThreshold = Math.max(0.012, noiseFloor * 2.6);
          const isUserWindow = phase === "listening";
          const speaking = isUserWindow && rms > activeThreshold;

          if (!speaking) {
            noiseFloor = noiseFloor * 0.96 + Math.min(rms, 0.04) * 0.04;
            if (frames.length) silenceFrames += 1;
            if (silenceFrames >= SILENCE_FLUSH_FRAMES) void sendSample();
            return;
          }

          silenceFrames = 0;
          const features = acousticFeatures(timeData, frequencyData, context.sampleRate, rms, noiseFloor);
          frames.push(features);
          if (frames.length >= MAX_SPEECH_FRAMES) void sendSample();
        }, SAMPLE_INTERVAL_MS);
      } catch (caught) {
        if (!disposed) {
          setMicrophoneState("blocked");
          setError(caught instanceof Error ? caught.message : "Ses analizi mikrofonu başlatılamadı.");
        }
      }
    };

    void start();
    return () => {
      disposed = true;
      window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") void context.close();
    };
  }, [profile?.analysisEnabled]);

  const analysisLabel = !profile
    ? "Ses analizi hazırlanıyor"
    : profile.analysisEnabled
      ? `Ses analizi: Açık · %${profile.completionPercent}`
      : "Ses analizi: Kapalı";
  const identityLabel = profile?.lastMatchedName
    ? `${profile.lastMatchedName}${profile.lastMatchConfidence != null ? ` · %${Math.round(profile.lastMatchConfidence)} eşleşme` : ""}`
    : profile?.displayName || "";
  const detail = commandMessage || error || (profile?.analysisEnabled && microphoneState === "blocked"
    ? "Mikrofon analizi bekliyor"
    : identityLabel);

  return (
    <div style={containerStyle} data-ruthie-voice-analysis>
      <button
        type="button"
        onClick={() => void updateProfile("toggle")}
        style={buttonStyle}
        aria-label={profile?.analysisEnabled ? "Ses analizini kapat" : "Ses analizini aç"}
        title="Ses analizi kişiselleştirme içindir; hesap yetkisi vermez."
      >
        <span style={{ ...dotStyle, opacity: profile?.analysisEnabled ? 1 : 0.35 }} />
        <span style={copyStyle}>
          <strong style={titleStyle}>{analysisLabel}</strong>
          {detail ? <small style={detailStyle}>{detail}</small> : null}
        </span>
      </button>
    </div>
  );
}

function acousticFeatures(
  timeData: Float32Array,
  frequencyData: Uint8Array,
  sampleRate: number,
  rms: number,
  noiseFloor: number,
): AcousticFrame {
  const spectrum = Array.from(frequencyData, (value) => value / 255);
  const total = spectrum.reduce((sum, value) => sum + value, 0) || 1;
  const third = Math.floor(spectrum.length / 3);
  const low = spectrum.slice(0, third).reduce((sum, value) => sum + value, 0) / total;
  const mid = spectrum.slice(third, third * 2).reduce((sum, value) => sum + value, 0) / total;
  const high = spectrum.slice(third * 2).reduce((sum, value) => sum + value, 0) / total;
  const centroidBin = spectrum.reduce((sum, value, index) => sum + value * index, 0) / total;
  const centroid = centroidBin / Math.max(1, spectrum.length - 1);
  const zcr = zeroCrossingRate(timeData);
  const flatness = spectralFlatness(spectrum);
  const pitch = estimatePitch(timeData, sampleRate);
  const pitchNormalized = pitch == null ? 0 : clamp((pitch - 50) / 350, 0, 1);
  const noiseRatio = clamp(noiseFloor / Math.max(rms, 0.0001), 0, 1);
  const noise = clamp((flatness * 0.55 + noiseRatio * 0.45) * 100, 0, 100);
  const rmsNormalized = clamp((20 * Math.log10(Math.max(rms, 0.00001)) + 60) / 60, 0, 1);

  return {
    vector: [
      rmsNormalized,
      clamp(zcr * 3, 0, 1),
      clamp(centroid, 0, 1),
      clamp(low, 0, 1),
      clamp(mid, 0, 1),
      clamp(high, 0, 1),
      clamp(flatness, 0, 1),
      pitchNormalized,
      clamp(noiseRatio, 0, 1),
      clamp((low - high + 1) / 2, 0, 1),
    ],
    rms,
    pitch,
    noise,
  };
}

function rootMeanSquare(values: Float32Array) {
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.sqrt(sum / Math.max(values.length, 1));
}

function zeroCrossingRate(values: Float32Array) {
  let crossings = 0;
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index - 1] >= 0) !== (values[index] >= 0)) crossings += 1;
  }
  return crossings / Math.max(1, values.length - 1);
}

function spectralFlatness(values: number[]) {
  const epsilon = 1e-6;
  const geometric = Math.exp(values.reduce((sum, value) => sum + Math.log(value + epsilon), 0) / Math.max(values.length, 1));
  const arithmetic = average(values) + epsilon;
  return clamp(geometric / arithmetic, 0, 1);
}

function estimatePitch(buffer: Float32Array, sampleRate: number): number | null {
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.min(buffer.length - 1, Math.floor(sampleRate / 70));
  let bestLag = 0;
  let bestCorrelation = 0;
  for (let lag = minLag; lag <= maxLag; lag += 2) {
    let correlation = 0;
    for (let index = 0; index < buffer.length - lag; index += 4) {
      correlation += buffer[index] * buffer[index + lag];
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }
  if (!bestLag || bestCorrelation < 0.01) return null;
  const pitch = sampleRate / bestLag;
  return pitch >= 50 && pitch <= 500 ? pitch : null;
}

function voiceProfileCommand(value: string): "enable" | "disable" | "learning_enable" | "learning_disable" | "reset" | null {
  const text = value.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşü0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
  if (/(ses (analizini|analizimi|profilimi).*(sıfırla|sil|yeniden oluştur))/.test(text)) return "reset";
  if (/(sürekli (öğrenmeyi|öğrenimi).*(kapat|durdur))/.test(text)) return "learning_disable";
  if (/(sürekli (öğrenmeyi|öğrenimi).*(aç|başlat))/.test(text)) return "learning_enable";
  if (/(ses (analizini|analizimi).*(kapat|durdur))/.test(text)) return "disable";
  if (/(ses (analizini|analizimi).*(aç|başlat|devam ettir))/.test(text)) return "enable";
  return null;
}

function readTranscripts(): StoredTranscript[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(RUTHIE_VOICE_STORAGE_KEY) || "[]") as unknown;
    return Array.isArray(value) ? value as StoredTranscript[] : [];
  } catch {
    return [];
  }
}

function latestUserTranscript() {
  return [...readTranscripts()].reverse().find((item) => item.role === "user" && item.text)?.text || "";
}

async function acousticDeviceHash(stream: MediaStream) {
  const track = stream.getAudioTracks()[0];
  const settings = track?.getSettings?.() || {};
  const source = [
    navigator.userAgent,
    navigator.platform,
    settings.sampleRate,
    settings.channelCount,
    settings.echoCancellation,
    settings.noiseSuppression,
  ].join("|");
  if (!globalThis.crypto?.subtle) return simpleHash(source);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest)).slice(0, 16).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function simpleHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  return Math.abs(hash).toString(36);
}

async function waitForVoiceApp() {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    const phase = document.querySelector<HTMLElement>("[data-ruthie-voice-app]")?.dataset.phase;
    if (phase && phase !== "idle" && phase !== "connecting") return;
    await new Promise((resolve) => window.setTimeout(resolve, 300));
  }
}

function averageVectors(vectors: number[][]) {
  if (!vectors.length) return [];
  const size = Math.min(...vectors.map((vector) => vector.length));
  return Array.from({ length: size }, (_, index) => round6(average(vectors.map((vector) => vector[index] || 0))));
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function standardDeviation(values: number[], mean: number) {
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

const containerStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 80,
  top: "76px",
  left: "50%",
  transform: "translateX(-50%)",
  width: "min(92vw, 420px)",
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
};

const buttonStyle: React.CSSProperties = {
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  gap: "10px",
  maxWidth: "100%",
  minHeight: "42px",
  padding: "8px 14px",
  borderRadius: "999px",
  border: "1px solid rgba(205, 170, 105, .26)",
  background: "rgba(6, 6, 6, .78)",
  color: "rgba(248, 240, 225, .92)",
  boxShadow: "0 12px 38px rgba(0, 0, 0, .34)",
  backdropFilter: "blur(16px)",
  cursor: "pointer",
};

const dotStyle: React.CSSProperties = {
  width: "8px",
  height: "8px",
  flex: "0 0 auto",
  borderRadius: "999px",
  background: "#d6b06b",
  boxShadow: "0 0 14px rgba(214, 176, 107, .75)",
};

const copyStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: "1px",
  textAlign: "left",
};

const titleStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "12px",
  fontWeight: 650,
  letterSpacing: ".02em",
};

const detailStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "rgba(248, 240, 225, .58)",
  fontSize: "10px",
};
