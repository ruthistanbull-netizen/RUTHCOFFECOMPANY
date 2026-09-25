"use client";

import Link from "next/link";
import {
  Camera,
  CameraOff,
  MessageCircle,
  Mic2,
  RefreshCw,
  Settings2,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import { RuthieCameraVision } from "./RuthieCameraVision";
import { RuthieGradientOrb, type RuthieGradientOrbPhase } from "./RuthieGradientOrb";
import { dispatchRuthiePresentationRequest } from "./ruthiePresentationEvents";
import {
  RUTHIE_VOICE_STORAGE_KEY,
  activeConversationId,
  readChatConversations,
  writeChatConversations,
  type UnifiedClientMessage,
} from "./ruthieUnifiedAgentClient";
import { useRuthieRealtimeVision } from "./useRuthieRealtimeVision";
import styles from "./RuthieExperience.module.css";

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

const MAX_MESSAGES = 80;

function uid() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function loadTranscripts(): Transcript[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RUTHIE_VOICE_STORAGE_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Transcript => Boolean(
      item && typeof item === "object"
      && ((item as Transcript).role === "user" || (item as Transcript).role === "assistant")
      && typeof (item as Transcript).text === "string",
    )).slice(-MAX_MESSAGES);
  } catch {
    return [];
  }
}

function phaseLabel(phase: string, connected: boolean) {
  if (phase === "connecting") return "Bağlanıyor";
  if (phase === "listening") return "Dinliyor";
  if (phase === "thinking") return "Düşünüyor";
  if (phase === "acting") return "Görevi uyguluyor";
  if (phase === "speaking") return "Konuşuyor";
  if (phase === "error") return "Bağlantı hatası";
  return connected ? "Hazır" : "Bekliyor";
}

function mirrorVoiceIntoActiveChat(item: Transcript) {
  try {
    const conversations = readChatConversations();
    const id = activeConversationId();
    const index = conversations.findIndex((conversation) => conversation.id === id);
    if (index < 0) return;
    const target = conversations[index];
    const duplicate = target.messages.some((message) => message.id === item.id || (message.role === item.role && message.text.trim() === item.text.trim()));
    if (duplicate) return;
    const message: UnifiedClientMessage = { ...item, surface: "voice" };
    const next = [...conversations];
    next[index] = {
      ...target,
      updatedAt: item.createdAt,
      messages: [...target.messages, message].slice(-MAX_MESSAGES),
    };
    writeChatConversations(next);
  } catch {
    // Voice remains available if local chat memory is unavailable.
  }
}

export function RuthieVoiceExperience() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [translationLanguage, setTranslationLanguage] = useState("İngilizce");
  const [sessionStarted, setSessionStarted] = useState(false);
  const autoStartRef = useRef(false);

  useEffect(() => {
    const previousBackground = document.body.style.background;
    const previousOverflow = document.body.style.overflow;
    document.body.style.background = "#111111";
    document.body.style.overflow = "hidden";
    setTranscripts(loadTranscripts());

    void (async () => {
      try {
        const headers = await adminAuthHeaders();
        const response = await fetch("/api/rosta-insight/openai/status", { headers, cache: "no-store" });
        const payload = await response.json() as ProviderStatus;
        setStatus(payload);
      } catch {
        setStatus({ ok: false, configured: false });
      }
    })();

    return () => {
      document.body.style.background = previousBackground;
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(RUTHIE_VOICE_STORAGE_KEY, JSON.stringify(transcripts.slice(-MAX_MESSAGES))); }
    catch { /* local memory is optional */ }
  }, [transcripts]);

  const voiceReady = Boolean(status?.configured && status.capabilities?.realtimeVoice);
  const context = useCallback(() => {
    const chats = readChatConversations();
    const requested = activeConversationId();
    const currentChat = chats.find((conversation) => conversation.id === requested) || chats[0];
    const chatContext = currentChat?.messages.slice(-14) || [];
    const voiceContext = transcripts.slice(-18);
    return [...chatContext, ...voiceContext]
      .map((item) => `${item.role === "user" ? "Kullanıcı" : "ROSTA Insight"}: ${item.text}`)
      .join("\n")
      .slice(-18_000);
  }, [transcripts]);

  const realtime = useRuthieRealtimeVision({
    enabled: voiceReady,
    conversationContext: context,
    model: status?.models?.realtime,
    transcriptionModel: status?.models?.transcription,
    onMessage: (message) => {
      const item: Transcript = { id: uid(), role: message.role, text: message.text, createdAt: new Date().toISOString() };
      setTranscripts((current) => [...current, item].slice(-MAX_MESSAGES));
      mirrorVoiceIntoActiveChat(item);
      if (message.role === "user") dispatchRuthiePresentationRequest({ id: item.id, text: item.text, mode: "voice" });
    },
  });

  useEffect(() => {
    if (!voiceReady || autoStartRef.current) return;
    autoStartRef.current = true;
    setSessionStarted(true);
    void realtime.start();
  }, [realtime.start, voiceReady]);

  const visualPhase: RuthieGradientOrbPhase = realtime.phase === "idle" ? (sessionStarted ? "idle" : "connecting") : realtime.phase;
  const label = phaseLabel(realtime.phase, realtime.connected);
  const headline = realtime.assistantText || realtime.userText || (realtime.connected ? "Konuşmaya başlayabilirsin" : status === null ? "ROSTA Insight hazırlanıyor" : voiceReady ? "Sesli bağlantı başlatılıyor" : "Sesli ROSTA Insight bağlantısı hazır değil");
  const description = realtime.error
    ? realtime.error
    : realtime.awaitingVoiceConfirmation
      ? "İşlemi uygulamak için sesli olarak evet veya hayır de."
      : realtime.connected
        ? "Doğal şekilde konuş. ROSTA Insight seni dinlerken orb sesine tepki verir; sonuç gerektiren istekler sağdaki canlı sonuç alanında açılır."
        : "Mikrofon izni istendiğinde onayla. Bağlantı otomatik olarak başlayacak.";
  const latest = transcripts.slice(-4);
  const showCamera = cameraOpen && realtime.connected;

  const retry = () => {
    setSessionStarted(true);
    void realtime.retry();
  };

  return (
    <section className={styles.app} data-ruthie-experience="voice" data-phase={realtime.phase}>
      <div className={styles.voiceLayout}>
        <main className={styles.voiceMain}>
          <header className={styles.topbar}>
            <Link href="/" className={styles.brand} aria-label="ROSTA Commerce paneline dön">
              <span className={styles.brandMark} />
              <span className={styles.brandText}><strong>ROSTA Insight Voice</strong><small>{status?.models?.realtime || "Realtime AI"}</small></span>
            </Link>
            <div className={styles.topbarActions}>
              <span className={styles.statusPill} data-ready={realtime.connected ? "true" : "false"}><i />{label}</span>
              <Link className={styles.modeButton} href="/rosta-insight/chat"><MessageCircle /> Chat'e geç</Link>
              <Link className={styles.iconButton} href="/rosta-insight/wake" aria-label="Ses ayarları"><Settings2 /></Link>
              <Link className={styles.iconButton} href="/" aria-label="ROSTA Insight'ı kapat"><X /></Link>
            </div>
          </header>

          <div className={styles.voiceStage}>
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
              <div className={styles.voiceCenter}>
                <div className={styles.voiceOrbWrap}>
                  <RuthieGradientOrb phase={visualPhase} inputStream={realtime.microphoneStream} outputStream={realtime.assistantStream} />
                </div>
                <div className={styles.voiceStatus}><i />{label}</div>
                <h1 className={styles.voiceHeadline}>{headline}</h1>
                <p className={styles.voiceDescription}>{description}</p>
                <div className={styles.voiceControls}>
                  <button className={styles.voiceControl} type="button" disabled={!realtime.connected} onClick={() => setCameraOpen((value) => !value)} aria-label={cameraOpen ? "Kamerayı kapat" : "Kamerayı aç"}>{cameraOpen ? <CameraOff /> : <Camera />}</button>
                  {realtime.connected ? (
                    <button className={styles.voiceControl} data-primary="true" type="button" onClick={realtime.end}><Square /> Görüşmeyi bitir</button>
                  ) : (
                    <button className={styles.voiceControl} data-primary="true" type="button" onClick={retry}><Mic2 /> Bağlan</button>
                  )}
                  <button className={styles.voiceControl} type="button" onClick={retry}><RefreshCw /> Yenile</button>
                  <Link className={styles.voiceControl} href="/rosta-insight/chat"><MessageCircle /> Chat'e geç</Link>
                </div>
              </div>
            )}
            {realtime.error ? <div className={styles.errorBanner}>{realtime.error}</div> : null}
          </div>
        </main>

        <aside className={styles.voiceRail}>
          <section className={styles.voiceRailCard}>
            <small>Canlı konuşma</small>
            <strong>{label}</strong>
            <p>Chat ve Voice aynı ROSTA Insight deneyiminin iki ayrı yüzü. Voice'ta konuş, Chat'te yaz; bağlam ve sonuçlar iki tarafta da devam eder.</p>
            {latest.length ? <div className={styles.voiceTranscript}>{latest.map((item) => <span key={item.id}><b>{item.role === "user" ? "Sen" : "ROSTA Insight"}:</b> {item.text}</span>)}</div> : null}
          </section>

          <section className={styles.resultRail}>
            <div className={styles.resultHeader}><strong>Canlı sonuçlar</strong><span>Voice tools</span></div>
            <div className={styles.voiceResultHost} data-ruthie-result-host="voice">
              <div className={styles.resultEmpty} data-ruthie-result-empty><Sparkles />“Son 5 siparişi göster” gibi bir istek verdiğinde sonuç burada açılır.</div>
            </div>
          </section>

          <div className={styles.voiceBottom}><Link href="/rosta-insight/chat"><MessageCircle /> Chat kısmına geç</Link></div>
        </aside>
      </div>

      <nav className={styles.mobileNav} aria-label="ROSTA Insight AI menüsü">
        <Link href="/rosta-insight/chat" data-active="false"><MessageCircle /> Chat</Link>
        <Link href="/rosta-insight/voice" data-active="true"><Mic2 /> Voice</Link>
      </nav>
    </section>
  );
}
