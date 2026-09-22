"use client";

import { adminAuthHeaders } from "@/lib/adminApi";

export const RUTHIE_CHAT_STORAGE_KEY = "ruthie_chat_workspace_v2";
export const RUTHIE_VOICE_STORAGE_KEY = "ruthie.voice.transcripts.v1";
export const RUTHIE_ACTIVE_CONVERSATION_KEY = "ruthie.active.conversation.v1";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type UnifiedClientMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  surface?: "chat" | "voice";
};

export type UnifiedClientConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: UnifiedClientMessage[];
};

export type RuthieAttachmentPayload = {
  name: string;
  type: string;
  dataUrl: string;
};

export type RuthiePendingAction = {
  id: string;
  action?: string;
  tool: string;
  title?: string;
  summary?: string;
  risk?: "none" | "low" | "high" | "critical" | string;
  token: string;
  expiresAt?: string;
  params?: Record<string, unknown>;
};

export type RuthieActionResult = {
  ok?: boolean;
  action?: string;
  title?: string;
  status?: number;
  data?: unknown;
  error?: string;
  message?: string;
  summary?: string;
};

export type RuthieChatResponse = {
  message: string;
  sources: Array<{ title?: string; url: string }>;
  pendingAction?: RuthiePendingAction | null;
  actionResult?: RuthieActionResult | null;
  threadId?: string | null;
};

export function makeRuthieConversationId() {
  return globalThis.crypto?.randomUUID?.() || "";
}

export function isRuthieConversationId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function readChatConversations(): UnifiedClientConversation[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RUTHIE_CHAT_STORAGE_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is UnifiedClientConversation => Boolean(
      item && typeof item === "object" && isRuthieConversationId((item as UnifiedClientConversation).id)
      && Array.isArray((item as UnifiedClientConversation).messages),
    ));
  } catch {
    return [];
  }
}

export function writeChatConversations(conversations: UnifiedClientConversation[]) {
  window.localStorage.setItem(RUTHIE_CHAT_STORAGE_KEY, JSON.stringify(conversations.slice(0, 60)));
}

export function activeConversationId(context = "") {
  const stored = window.localStorage.getItem(RUTHIE_ACTIVE_CONVERSATION_KEY);
  if (isRuthieConversationId(stored)) return stored;
  const conversations = readChatConversations();
  const normalizedContext = context.replace(/\s+/g, " ").trim();
  if (normalizedContext) {
    const matched = conversations.find((conversation) => {
      const tail = conversation.messages.slice(-8).map((message) => message.text).join(" ").replace(/\s+/g, " ").trim();
      return tail && (normalizedContext.includes(tail.slice(-600)) || tail.includes(normalizedContext.slice(-600)));
    });
    if (matched) {
      setActiveConversationId(matched.id);
      return matched.id;
    }
  }
  const first = conversations[0]?.id;
  if (isRuthieConversationId(first)) {
    setActiveConversationId(first);
    return first;
  }
  const created = makeRuthieConversationId();
  if (created) setActiveConversationId(created);
  return created;
}

export function setActiveConversationId(value: string) {
  if (isRuthieConversationId(value)) window.localStorage.setItem(RUTHIE_ACTIVE_CONVERSATION_KEY, value);
}

export async function importConversation(conversation: UnifiedClientConversation) {
  const headers = await adminAuthHeaders();
  const response = await fetch("/api/rosta-insight/conversations", {
    method: "POST",
    cache: "no-store",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: conversation.id,
      title: conversation.title,
      surface: "chat",
      messages: conversation.messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text,
        surface: message.surface || "chat",
      })),
    }),
  });
  if (!response.ok) throw new Error("ROSTA Insight sohbeti ortak hafızaya aktarılamadı.");
  return response.json();
}

export async function fetchUnifiedConversations() {
  const headers = await adminAuthHeaders();
  const response = await fetch("/api/rosta-insight/conversations?include_messages=1", { headers, cache: "no-store" });
  const payload = await response.json().catch(() => null) as { ok?: boolean; conversations?: any[] } | null;
  if (!response.ok || !payload?.ok) throw new Error("Ortak ROSTA Insight sohbetleri alınamadı.");
  return (payload.conversations || []).map((conversation): UnifiedClientConversation => ({
    id: String(conversation.id),
    title: String(conversation.title || "Yeni sohbet"),
    createdAt: String(conversation.createdAt || new Date().toISOString()),
    updatedAt: String(conversation.updatedAt || new Date().toISOString()),
    messages: Array.isArray(conversation.messages) ? conversation.messages
      .filter((message: any) => message?.role === "user" || message?.role === "assistant")
      .map((message: any) => ({
        id: String(message.clientMessageId || message.id),
        role: message.role,
        text: String(message.text || ""),
        createdAt: String(message.createdAt || new Date().toISOString()),
        surface: message.surface === "voice" ? "voice" : "chat",
      })) : [],
  }));
}

export async function fetchUnifiedConversation(conversationId: string) {
  if (!isRuthieConversationId(conversationId)) return null;
  const headers = await adminAuthHeaders();
  const response = await fetch(`/api/rosta-insight/conversations/${encodeURIComponent(conversationId)}`, { headers, cache: "no-store" });
  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    conversation?: any;
    context?: string;
    memories?: any[];
  } | null;
  if (!response.ok || !payload?.ok) return null;
  return payload;
}

export async function persistUnifiedMessage(options: {
  conversationId: string;
  message: UnifiedClientMessage;
  surface: "chat" | "voice";
}) {
  if (!isRuthieConversationId(options.conversationId)) return null;
  const headers = await adminAuthHeaders();
  const response = await fetch(`/api/rosta-insight/conversations/${encodeURIComponent(options.conversationId)}/messages`, {
    method: "POST",
    cache: "no-store",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      role: options.message.role,
      text: options.message.text,
      surface: options.surface,
      clientMessageId: options.message.id,
    }),
  });
  return response.ok ? response.json().catch(() => null) : null;
}

export async function sendRuthieChatMessage(options: {
  message: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  attachments?: RuthieAttachmentPayload[];
  threadId?: string | null;
}): Promise<RuthieChatResponse> {
  const headers = await adminAuthHeaders();
  const conversationId = isRuthieConversationId(options.threadId)
    ? options.threadId
    : makeRuthieConversationId();
  const messages = [
    ...(options.history || [])
      .filter((message) => message && (message.role === "user" || message.role === "assistant") && message.text.trim())
      .slice(-39)
      .map((message) => ({ role: message.role, text: message.text.trim() })),
    { role: "user" as const, text: options.message.trim() || "Eklenen dosyaları incele." },
  ];
  const attachments = (options.attachments || []).slice(0, 4).map((attachment) => ({
    name: attachment.name,
    mimeType: attachment.type || "application/octet-stream",
    dataUrl: attachment.dataUrl,
  }));

  const response = await fetch("/api/rosta-insight/openai/chat", {
    method: "POST",
    cache: "no-store",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      attachments,
      conversationId,
      clientMessageId: globalThis.crypto?.randomUUID?.() || `ruthie-${Date.now()}`,
    }),
  });
  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || !payload?.ok) throw new Error(apiErrorMessage(payload, "ROSTA Insight yanıt veremedi."));

  const raw = payload.response && typeof payload.response === "object" ? payload.response : {};
  return {
    message: String(raw.text || "ROSTA Insight yanıt oluşturamadı."),
    sources: Array.isArray(raw.sources)
      ? raw.sources.filter((source: any) => source && typeof source.url === "string").map((source: any) => ({
        title: typeof source.title === "string" ? source.title : undefined,
        url: source.url,
      }))
      : [],
    pendingAction: normalizePendingAction(raw.pendingAction),
    actionResult: normalizeActionResult(raw.actionResult),
    threadId: isRuthieConversationId(raw.conversationId) ? raw.conversationId : conversationId || null,
  };
}

export async function executeApprovedAction(action: RuthiePendingAction): Promise<RuthieActionResult> {
  if (!action?.token) throw new Error("ROSTA Insight işlem onayı bulunamadı veya süresi doldu.");
  const headers = await adminAuthHeaders();
  const response = await fetch("/api/rosta-insight/admin/execute", {
    method: "POST",
    cache: "no-store",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ token: action.token }),
  });
  const payload = await response.json().catch(() => null) as any;
  const raw = payload?.result && typeof payload.result === "object" ? payload.result : null;
  if (!response.ok || !payload?.ok || raw?.ok === false) {
    throw new Error(apiErrorMessage(payload, raw?.error || "Onaylanan ROSTA Insight işlemi uygulanamadı."));
  }
  const result = normalizeActionResult(raw) || {};
  return {
    ...result,
    ok: true,
    message: result.message || `${result.title || action.title || action.summary || "ROSTA Insight işlemi"} tamamlandı.`,
    summary: result.summary || result.title || action.summary,
  };
}

export function mergeUnifiedConversations(local: UnifiedClientConversation[], remote: UnifiedClientConversation[]) {
  const byId = new Map<string, UnifiedClientConversation>();
  for (const conversation of [...local, ...remote]) {
    const existing = byId.get(conversation.id);
    if (!existing) {
      byId.set(conversation.id, conversation);
      continue;
    }
    const messages = mergeMessages(existing.messages, conversation.messages);
    byId.set(conversation.id, {
      ...existing,
      ...conversation,
      title: conversation.title === "Yeni sohbet" ? existing.title : conversation.title,
      messages,
      updatedAt: Date.parse(conversation.updatedAt) >= Date.parse(existing.updatedAt) ? conversation.updatedAt : existing.updatedAt,
    });
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 60);
}

function mergeMessages(left: UnifiedClientMessage[], right: UnifiedClientMessage[]) {
  const result: UnifiedClientMessage[] = [];
  const ids = new Set<string>();
  const signatures = new Set<string>();
  for (const message of [...left, ...right].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    const signature = `${message.role}:${message.text.replace(/\s+/g, " ").trim()}`;
    if (ids.has(message.id) || signatures.has(signature)) continue;
    ids.add(message.id);
    signatures.add(signature);
    result.push(message);
  }
  return result.slice(-80);
}

function normalizePendingAction(value: unknown): RuthiePendingAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  if (!token) return null;
  const action = typeof raw.action === "string" ? raw.action : "ruthie_admin";
  return {
    id: typeof raw.id === "string" ? raw.id : globalThis.crypto?.randomUUID?.() || `pending-${Date.now()}`,
    action,
    tool: action,
    title: typeof raw.title === "string" ? raw.title : action,
    summary: typeof raw.summary === "string" ? raw.summary : undefined,
    risk: typeof raw.risk === "string" ? raw.risk : undefined,
    token,
    expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : undefined,
    params: raw.params && typeof raw.params === "object" && !Array.isArray(raw.params)
      ? raw.params as Record<string, unknown>
      : undefined,
  };
}

function normalizeActionResult(value: unknown): RuthieActionResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    ok: typeof raw.ok === "boolean" ? raw.ok : undefined,
    action: typeof raw.action === "string" ? raw.action : undefined,
    title: typeof raw.title === "string" ? raw.title : undefined,
    status: typeof raw.status === "number" ? raw.status : undefined,
    data: raw.data,
    error: typeof raw.error === "string" ? raw.error : undefined,
    message: typeof raw.message === "string" ? raw.message : undefined,
    summary: typeof raw.summary === "string" ? raw.summary : undefined,
  };
}

function apiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fallback;
  const raw = payload as Record<string, unknown>;
  if (typeof raw.error === "string" && raw.error.trim()) return raw.error.trim();
  if (raw.error && typeof raw.error === "object" && !Array.isArray(raw.error)) {
    const message = (raw.error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  if (raw.result && typeof raw.result === "object" && !Array.isArray(raw.result)) {
    const error = (raw.result as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim()) return error.trim();
  }
  return fallback;
}
