"use client";

import { useEffect, useRef, useState } from "react";
import { RuthieVoiceAnalysisOverlay } from "./RuthieVoiceAnalysisOverlay";
import { RuthieVoiceOnly } from "./RuthieVoiceOnly";
import { RuthieVoiceProfileContextSync } from "./RuthieVoiceProfileContextSync";
import {
  RUTHIE_VOICE_STORAGE_KEY,
  activeConversationId,
  fetchUnifiedConversation,
  importConversation,
  persistUnifiedMessage,
  readChatConversations,
  setActiveConversationId,
  writeChatConversations,
  type UnifiedClientMessage,
} from "./ruthieUnifiedAgentClient";

type VoiceTranscript = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
};

function readVoiceTranscripts(): VoiceTranscript[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RUTHIE_VOICE_STORAGE_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is VoiceTranscript => Boolean(
      item && typeof item === "object"
      && typeof (item as VoiceTranscript).id === "string"
      && ((item as VoiceTranscript).role === "user" || (item as VoiceTranscript).role === "assistant")
      && typeof (item as VoiceTranscript).text === "string",
    ));
  } catch {
    return [];
  }
}

function mergeTranscripts(left: VoiceTranscript[], right: VoiceTranscript[]) {
  const ids = new Set<string>();
  const signatures = new Set<string>();
  const merged: VoiceTranscript[] = [];
  for (const message of [...left, ...right].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    const signature = `${message.role}:${message.text.replace(/\s+/g, " ").trim()}`;
    if (ids.has(message.id) || signatures.has(signature)) continue;
    ids.add(message.id);
    signatures.add(signature);
    merged.push(message);
  }
  return merged.slice(-80);
}

function mergeIntoChat(conversationId: string, message: VoiceTranscript) {
  const conversations = readChatConversations();
  const now = message.createdAt || new Date().toISOString();
  const index = conversations.findIndex((conversation) => conversation.id === conversationId);
  const normalized: UnifiedClientMessage = { ...message, surface: "voice" };
  if (index < 0) {
    conversations.unshift({
      id: conversationId,
      title: message.role === "user" ? message.text.slice(0, 70) || "Sesli sohbet" : "Sesli sohbet",
      createdAt: now,
      updatedAt: now,
      messages: [normalized],
    });
  } else {
    const conversation = conversations[index];
    const exists = conversation.messages.some((item) => item.id === message.id
      || (item.role === message.role && item.text.trim() === message.text.trim()));
    if (!exists) conversation.messages = [...conversation.messages, normalized].slice(-80);
    conversation.updatedAt = now;
    conversations.splice(index, 1);
    conversations.unshift(conversation);
  }
  writeChatConversations(conversations);
}

function memoryTranscript(memories: any[]): VoiceTranscript | null {
  if (!Array.isArray(memories) || !memories.length) return null;
  const lines = memories
    .map((memory, index) => `${index + 1}. ${String(memory?.content || "").trim()}`)
    .filter((line) => !line.endsWith(". "));
  if (!lines.length) return null;
  return {
    id: `ruthie-shared-memory-${lines.join("|").length}`,
    role: "assistant",
    text: [
      "Bu mesaj kullanıcıya söylenecek bir yanıt değildir. Chat ve Voice tarafından paylaşılan kalıcı ROSTA Insight hafızasıdır; güncel istekle çelişmedikçe uygula:",
      ...lines,
    ].join("\n"),
    createdAt: new Date().toISOString(),
  };
}

export function RuthieUnifiedVoiceShell() {
  const [ready, setReady] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    let revealTimer: number | undefined;
    const reveal = () => {
      if (!cancelled) setReady(true);
    };

    void (async () => {
      const id = activeConversationId();
      if (!id) {
        reveal();
        return;
      }

      setActiveConversationId(id);
      const local = readVoiceTranscripts().filter((message) => !message.id.startsWith("ruthie-shared-memory-"));
      seenRef.current = new Set(local.map((message) => message.id));
      if (!cancelled) setConversationId(id);
      revealTimer = window.setTimeout(reveal, 900);

      try {
        await importConversation({
          id,
          title: readChatConversations().find((conversation) => conversation.id === id)?.title || "Sesli Ruthie",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
        });
        const shared = await fetchUnifiedConversation(id);
        const remote: VoiceTranscript[] = Array.isArray(shared?.conversation?.messages)
          ? shared.conversation.messages
            .filter((message: any) => message?.role === "user" || message?.role === "assistant")
            .map((message: any) => ({
              id: String(message.clientMessageId || message.id),
              role: message.role,
              text: String(message.text || ""),
              createdAt: String(message.createdAt || new Date().toISOString()),
            }))
          : [];
        let merged = mergeTranscripts(remote, local);
        const memory = memoryTranscript(shared?.memories || []);
        if (memory) merged = [...merged.slice(-79), memory];
        window.localStorage.setItem(RUTHIE_VOICE_STORAGE_KEY, JSON.stringify(merged));

        const remoteSignatures = new Set(remote.map((message) => `${message.role}:${message.text.trim()}`));
        const missingLocalMessages = local.filter(
          (message) => !remoteSignatures.has(`${message.role}:${message.text.trim()}`),
        );
        seenRef.current = new Set(merged.map((message) => message.id));
        void Promise.allSettled(
          missingLocalMessages.map((message) => persistUnifiedMessage({ conversationId: id, message, surface: "voice" })),
        );
      } catch {
        seenRef.current = new Set(local.map((message) => message.id));
      } finally {
        if (revealTimer !== undefined) window.clearTimeout(revealTimer);
        reveal();
      }
    })();

    return () => {
      cancelled = true;
      if (revealTimer !== undefined) window.clearTimeout(revealTimer);
    };
  }, []);

  useEffect(() => {
    if (!ready || !conversationId) return;
    let working = false;
    const sync = async () => {
      if (working) return;
      working = true;
      try {
        const transcripts = readVoiceTranscripts();
        for (const message of transcripts) {
          if (seenRef.current.has(message.id) || message.id.startsWith("ruthie-shared-memory-")) continue;
          seenRef.current.add(message.id);
          mergeIntoChat(conversationId, message);
          await persistUnifiedMessage({ conversationId, message, surface: "voice" });
        }
      } finally {
        working = false;
      }
    };
    const timer = window.setInterval(() => void sync(), 700);
    const flush = () => void sync();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      void sync();
    };
  }, [conversationId, ready]);

  if (!ready) return <div style={{ color: "rgba(246,238,223,.7)", padding: 24 }}>Ortak ROSTA Insight hafızası hazırlanıyor…</div>;
  return (
    <>
      <RuthieVoiceOnly />
      <RuthieVoiceAnalysisOverlay />
      <RuthieVoiceProfileContextSync />
    </>
  );
}
