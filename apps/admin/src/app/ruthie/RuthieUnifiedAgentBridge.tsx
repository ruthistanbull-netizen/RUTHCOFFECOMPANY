"use client";

import { useEffect } from "react";
import {
  RUTHIE_ACTIVE_CONVERSATION_KEY,
  activeConversationId,
  fetchUnifiedConversations,
  importConversation,
  isRuthieConversationId,
  mergeUnifiedConversations,
  readChatConversations,
  setActiveConversationId,
  writeChatConversations,
  type UnifiedClientConversation,
} from "./ruthieUnifiedAgentClient";

const RELOAD_MARKER = "ruthie.unified.last_reload";

function requestMessages(body: Record<string, unknown>) {
  if (!Array.isArray(body.messages)) return [] as Array<{ role: string; text: string }>;
  return body.messages
    .filter((item): item is { role: string; text: string } => Boolean(
      item && typeof item === "object" && typeof (item as any).text === "string",
    ))
    .map((item) => ({ role: item.role, text: item.text.trim() }));
}

function scoreConversation(conversation: UnifiedClientConversation, messages: Array<{ role: string; text: string }>) {
  if (!messages.length) return 0;
  const localTail = conversation.messages.slice(-12);
  let score = 0;
  for (const requestMessage of messages.slice(-8)) {
    if (localTail.some((message) => message.role === requestMessage.role && message.text.trim() === requestMessage.text)) score += 3;
    else if (conversation.title !== "Yeni sohbet" && requestMessage.text.includes(conversation.title.slice(0, 24))) score += 1;
  }
  return score;
}

function resolveRequestConversation(body: Record<string, unknown>) {
  const conversations = readChatConversations();
  const messages = requestMessages(body);
  const storedId = window.localStorage.getItem(RUTHIE_ACTIVE_CONVERSATION_KEY);
  const stored = conversations.find((conversation) => conversation.id === storedId);
  if (stored && scoreConversation(stored, messages) > 0) return stored;

  const ranked = conversations
    .map((conversation) => ({ conversation, score: scoreConversation(conversation, messages) }))
    .sort((a, b) => b.score - a.score);
  if (ranked[0]?.score > 0) return ranked[0].conversation;
  return stored || conversations[0] || null;
}

function hasNewVoiceMessages(local: UnifiedClientConversation[], remote: UnifiedClientConversation[]) {
  const known = new Set(local.flatMap((conversation) => conversation.messages.map((message) => (
    `${conversation.id}:${message.role}:${message.text.replace(/\s+/g, " ").trim()}`
  ))));
  return remote.some((conversation) => conversation.messages.some((message) => (
    message.surface === "voice"
    && !known.has(`${conversation.id}:${message.role}:${message.text.replace(/\s+/g, " ").trim()}`)
  )));
}

function neuralCoreActive() {
  return document.querySelector('[aria-label="ROSTA Insight Neural Core"][data-active="true"]') !== null;
}

export function RuthieUnifiedAgentBridge() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let disposed = false;
    let syncing = false;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      if (method === "POST" && url.includes("/api/rosta-insight/openai/chat") && typeof init?.body === "string") {
        try {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const conversation = resolveRequestConversation(body);
          const conversationId = conversation?.id || activeConversationId();
          if (isRuthieConversationId(conversationId)) {
            setActiveConversationId(conversationId);
            body.conversationId = conversationId;
            body.clientMessageId = globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
            return originalFetch(input, { ...init, body: JSON.stringify(body) });
          }
        } catch {
          // Keep the original request usable if the compatibility bridge cannot parse it.
        }
      }
      return originalFetch(input, init);
    };

    const importLocal = async () => {
      const local = readChatConversations();
      if (!local.length) return;
      setActiveConversationId(activeConversationId());
      for (const conversation of local.slice(0, 30)) {
        if (disposed) return;
        try { await importConversation(conversation); } catch { /* local fallback remains available */ }
      }
    };

    const sync = async (allowReload: boolean) => {
      if (disposed || syncing) return;
      syncing = true;
      try {
        const local = readChatConversations();
        const remote = await fetchUnifiedConversations();
        const newVoice = hasNewVoiceMessages(local, remote);
        const merged = mergeUnifiedConversations(local, remote);
        const before = JSON.stringify(local);
        const after = JSON.stringify(merged);
        if (before !== after) writeChatConversations(merged);

        if (allowReload && newVoice && !neuralCoreActive()) {
          const previous = Number(window.sessionStorage.getItem(RELOAD_MARKER) || 0);
          if (Date.now() - previous > 2_500) {
            window.sessionStorage.setItem(RELOAD_MARKER, String(Date.now()));
            window.location.reload();
          }
        }
      } catch {
        // Chat continues with its existing local cache when the server store is unavailable.
      } finally {
        syncing = false;
      }
    };

    const clickHandler = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest("button");
      if (!button) return;
      const label = button.textContent?.replace(/\s+/g, " ").trim() || "";
      window.setTimeout(() => {
        const conversations = readChatConversations();
        if (label.includes("Yeni sohbet")) {
          if (conversations[0]) setActiveConversationId(conversations[0].id);
          return;
        }
        const matched = conversations.find((conversation) => label.includes(conversation.title));
        if (matched) setActiveConversationId(matched.id);
      }, 80);
    };

    const focusHandler = () => void sync(true);
    document.addEventListener("click", clickHandler, true);
    window.addEventListener("focus", focusHandler);
    document.addEventListener("visibilitychange", focusHandler);
    const timer = window.setInterval(() => void sync(true), 4_000);

    void importLocal().then(() => sync(false));

    return () => {
      disposed = true;
      window.fetch = originalFetch;
      window.clearInterval(timer);
      document.removeEventListener("click", clickHandler, true);
      window.removeEventListener("focus", focusHandler);
      document.removeEventListener("visibilitychange", focusHandler);
    };
  }, []);

  return null;
}
