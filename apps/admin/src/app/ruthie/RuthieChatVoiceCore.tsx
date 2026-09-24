"use client";

import { Mic, MicOff, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import {
  activeConversationId,
  fetchUnifiedConversation,
  persistUnifiedMessage,
  readChatConversations,
  setActiveConversationId,
  writeChatConversations,
  type UnifiedClientMessage,
} from "./ruthieUnifiedAgentClient";
import { RuthieVoiceOrb, type RuthieVoiceVisualPhase } from "./RuthieVoiceOrb";
import { useRuthieRealtimeVision } from "./useRuthieRealtimeVision";
import styles from "./RuthieChatVoiceCore.module.css";

type ProviderStatus = {
  ok?: boolean;
  configured?: boolean;
  models?: { realtime?: string; transcription?: string };
  capabilities?: { realtimeVoice?: boolean };
};

type RuthieChatVoiceCoreProps = {
  compact?: boolean;
  context?: string;
};

function phaseLabel(phase: string, active: boolean, ready: boolean) {
  if (!ready) return "Bağlantı yok";
  if (!active) return "Pasif";
  if (phase === "connecting" || phase === "idle") return "Bağlanıyor";
  if (phase === "listening") return "Dinliyor";
  if (phase === "thinking") return "Düşünüyor";
  if (phase === "acting") return "İşlem yapıyor";
  if (phase === "speaking") return "Konuşuyor";
  if (phase === "error") return "Bağlantı hatası";
  return "Hazır";
}

function addVoiceMessageToChat(conversationId: string, message: UnifiedClientMessage) {
  const conversations = readChatConversations();
  const index = conversations.findIndex((conversation) => conversation.id === conversationId);
  if (index < 0) {
    conversations.unshift({
      id: conversationId,
      title: message.role === "user" ? message.text.slice(0, 70) || "Sesli sohbet" : "Sesli sohbet",
      createdAt: message.createdAt,
      updatedAt: message.createdAt,
      messages: [message],
    });
  } else {
    const conversation = conversations[index];
    const exists = conversation.messages.some((item) => item.id === message.id
      || (item.role === message.role && item.text.trim() === message.text.trim()));
    if (!exists) conversation.messages = [...conversation.messages, message].slice(-80);
    conversation.updatedAt = message.createdAt;
    conversations.splice(index, 1);
    conversations.unshift(conversation);
  }
  writeChatConversations(conversations);
}

export function RuthieChatVoiceCore({ compact = false, context = "" }: RuthieChatVoiceCoreProps) {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [active, setActive] = useState(false);
  const [lastText, setLastText] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [sharedContext, setSharedContext] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const headers = await adminAuthHeaders();
        const response = await fetch("/api/ruthie/openai/status", { headers, cache: "no-store" });
        const payload = await response.json() as ProviderStatus;
        if (!cancelled) setStatus(payload);
      } catch {
        if (!cancelled) setStatus({ ok: false, configured: false });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const id = activeConversationId(context);
    if (!id) return;
    setActiveConversationId(id);
    setConversationId(id);
    void fetchUnifiedConversation(id).then((payload) => {
      if (!cancelled) setSharedContext(typeof payload?.context === "string" ? payload.context : "");
    });
    return () => { cancelled = true; };
  }, [context]);

  const voiceReady = Boolean(status?.configured && status.capabilities?.realtimeVoice);
  const realtime = useRuthieRealtimeVision({
    enabled: active && voiceReady,
    conversationContext: () => [sharedContext, context].filter(Boolean).join("\n\n").slice(-18_000),
    model: status?.models?.realtime,
    transcriptionModel: status?.models?.transcription,
    onMessage: (message) => {
      setLastText(message.text);
      if (!conversationId) return;
      const unified: UnifiedClientMessage = {
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${message.role}`,
        role: message.role,
        text: message.text,
        createdAt: new Date().toISOString(),
        surface: "voice",
      };
      addVoiceMessageToChat(conversationId, unified);
      void persistUnifiedMessage({ conversationId, message: unified, surface: "voice" });
    },
  });

  useEffect(() => {
    if (!active || !voiceReady) {
      if (realtime.phase !== "idle") realtime.end();
      return;
    }
    if (realtime.phase === "idle") void realtime.start();
  }, [active, realtime.end, realtime.phase, realtime.start, voiceReady]);

  useEffect(() => () => realtime.end(), [realtime.end]);

  const visualPhase: RuthieVoiceVisualPhase = realtime.phase === "idle"
    ? "connecting"
    : realtime.phase;
  const label = phaseLabel(realtime.phase, active, voiceReady);
  const caption = useMemo(() => {
    if (realtime.error) return realtime.error;
    if (realtime.assistantText) return realtime.assistantText;
    if (realtime.userText) return realtime.userText;
    if (lastText) return lastText;
    return active
      ? "ROSTA Insight seni dinliyor. Konuşmaya başlayabilirsin."
      : "Küreye dokunarak sesli Ruthie'yi aynı ekranda aç.";
  }, [active, lastText, realtime.assistantText, realtime.error, realtime.userText]);

  const toggle = () => {
    if (active) {
      realtime.end();
      setActive(false);
      window.setTimeout(() => window.location.reload(), 160);
      return;
    }
    const id = activeConversationId(context);
    if (id) {
      setActiveConversationId(id);
      setConversationId(id);
    }
    setLastText("");
    setActive(true);
  };

  return (
    <section
      className={`${styles.card} ${compact ? styles.compact : ""}`}
      data-active={active ? "true" : "false"}
      data-phase={realtime.phase}
      aria-label="ROSTA Insight Neural Core"
    >
      <header>
        <div>
          <strong>Neural Core</strong>
          <small>Canlı sesli Ruthie · Ortak hafıza</small>
        </div>
        <span className={active ? styles.activeState : ""}>{label}</span>
      </header>

      <button
        className={styles.orbButton}
        type="button"
        onClick={toggle}
        aria-pressed={active}
        aria-label={active ? "Sesli Ruthie'yi pasif moda al" : "Sesli Ruthie'yi etkinleştir"}
      >
        <span className={styles.orb}>
          <RuthieVoiceOrb
            phase={visualPhase}
            inputStream={realtime.microphoneStream}
            outputStream={realtime.assistantStream}
            muted={!active}
            compact
            showWaveform={false}
          />
        </span>
        <span className={styles.micBadge}>{active ? <Mic /> : <MicOff />}</span>
      </button>

      <p>{caption}</p>
      {active && realtime.phase === "error" ? (
        <button className={styles.retry} type="button" onClick={() => void realtime.retry()}>
          <RotateCcw /> Tekrar bağlan
        </button>
      ) : null}
      <footer>
        <span>Admin + Web + Vision</span>
        <span>{active ? "Canlı" : "Hazır"}</span>
      </footer>
    </section>
  );
}
