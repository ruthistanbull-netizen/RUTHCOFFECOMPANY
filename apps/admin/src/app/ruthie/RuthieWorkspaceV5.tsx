"use client";

import Link from "next/link";
import {
  AlertCircle,
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  Clock3,
  Globe2,
  Headphones,
  LoaderCircle,
  Menu,
  MessageSquarePlus,
  Mic,
  PanelLeftClose,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import { RuthieCameraVision } from "./RuthieCameraVision";
import { RuthieVoiceOrb } from "./RuthieVoiceOrb";
import { useRuthieRealtimeVision } from "./useRuthieRealtimeVision";
import styles from "./RuthieWorkspaceV5.module.css";

type WebSource = { title: string; url: string };
type PendingAction = {
  id: string;
  action: string;
  title: string;
  summary: string;
  risk: "none" | "low" | "high" | "critical";
  token: string;
  expiresAt: string;
};
type ActionState = "pending" | "executing" | "completed" | "cancelled" | "failed";
type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  source: "chat" | "voice" | "action";
  webSearchUsed?: boolean;
  sources?: WebSource[];
  pendingAction?: PendingAction;
  actionState?: ActionState;
  actionError?: string;
};
type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
};
type ProviderStatus = {
  ok?: boolean;
  configured?: boolean;
  models?: { chat?: string | null; realtime?: string };
  capabilities?: { chat?: boolean; realtimeVoice?: boolean };
};
type ChatPayload = {
  ok: boolean;
  response?: {
    text: string;
    webSearchUsed?: boolean;
    sources?: WebSource[];
    pendingAction?: PendingAction;
    toolsExecuted?: string[];
  };
  error?: { message?: string };
};

const STORAGE_KEY = "ruthie_workspace_v5";
const MAX_MESSAGES = 50;
const MAX_CONVERSATIONS = 60;
const suggestions = [
  "Bugünkü siparişleri analiz et ve acil olanları sırala.",
  "Stoku azalan ürünleri bul ve ne yapmam gerektiğini söyle.",
  "Yeni bir manuel sipariş oluşturalım.",
  "Yeni ürün oluşturmak için benden gerekli bilgileri iste.",
];

function id(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function newConversation(): Conversation {
  const now = new Date().toISOString();
  return { id: id("conversation"), title: "Yeni sohbet", createdAt: now, updatedAt: now, messages: [] };
}

function titleFrom(text: string) {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > 46 ? `${value.slice(0, 46).trim()}…` : value || "Yeni sohbet";
}

function message(role: Message["role"], text: string, extras: Partial<Message> = {}): Message {
  return { id: id("message"), role, text, createdAt: new Date().toISOString(), source: "chat", ...extras };
}

function dateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Bugün";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(date);
}

function readStored(): Conversation[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Conversation => Boolean(item && typeof item === "object" && typeof (item as Conversation).id === "string" && Array.isArray((item as Conversation).messages))).slice(0, MAX_CONVERSATIONS);
  } catch {
    return [];
  }
}

export function RuthieWorkspaceV5() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [translationLanguage, setTranslationLanguage] = useState("İngilizce");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const stored = readStored();
    const list = stored.length ? stored : [newConversation()];
    conversationsRef.current = list;
    activeIdRef.current = list[0].id;
    setConversations(list);
    setActiveId(list[0].id);
    setReady(true);
  }, []);

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS))); } catch { /* local history is optional */ }
  }, [conversations, ready]);

  useEffect(() => {
    void (async () => {
      try {
        const headers = await adminAuthHeaders();
        const response = await fetch("/api/ruthie/openai/status", { headers, cache: "no-store" });
        const payload = await response.json() as ProviderStatus;
        if (!response.ok || !payload.ok) throw new Error("ROSTA Insight bağlantı durumu alınamadı.");
        setStatus(payload);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "ROSTA Insight bağlantı durumu alınamadı.");
      }
    })();
  }, []);

  const activeConversation = useMemo(() => conversations.find((item) => item.id === activeId) || null, [activeId, conversations]);
  const messages = activeConversation?.messages || [];
  const providerReady = Boolean(status?.configured && status.capabilities?.chat);
  const voiceReady = Boolean(status?.configured && status.capabilities?.realtimeVoice);
  const modelLabel = status?.models?.chat || "gpt-5.6";

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: messages.length > 1 ? "smooth" : "auto", block: "end" }); }, [messages.length, sending]);

  const updateConversation = useCallback((conversationId: string, updater: (conversation: Conversation) => Conversation) => {
    setConversations((current) => current.map((conversation) => conversation.id === conversationId ? updater(conversation) : conversation)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
  }, []);

  const append = useCallback((conversationId: string, nextMessage: Message) => {
    updateConversation(conversationId, (conversation) => {
      const title = conversation.title === "Yeni sohbet" && nextMessage.role === "user" ? titleFrom(nextMessage.text) : conversation.title;
      return { ...conversation, title, updatedAt: nextMessage.createdAt, messages: [...conversation.messages, nextMessage].slice(-MAX_MESSAGES) };
    });
  }, [updateConversation]);

  const ensureConversation = useCallback(() => {
    const current = activeIdRef.current;
    if (current && conversationsRef.current.some((conversation) => conversation.id === current)) return current;
    const fresh = newConversation();
    conversationsRef.current = [fresh, ...conversationsRef.current];
    setConversations((items) => [fresh, ...items]);
    setActiveId(fresh.id);
    activeIdRef.current = fresh.id;
    return fresh.id;
  }, []);

  const createChat = useCallback(() => {
    const fresh = newConversation();
    setConversations((items) => [fresh, ...items].slice(0, MAX_CONVERSATIONS));
    setActiveId(fresh.id);
    activeIdRef.current = fresh.id;
    setSidebarOpen(false);
    setError(null);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const deleteChat = useCallback((conversationId: string) => {
    const remaining = conversationsRef.current.filter((conversation) => conversation.id !== conversationId);
    if (!remaining.length) {
      const fresh = newConversation();
      conversationsRef.current = [fresh];
      activeIdRef.current = fresh.id;
      setConversations([fresh]);
      setActiveId(fresh.id);
      return;
    }
    conversationsRef.current = remaining;
    setConversations(remaining);
    if (activeIdRef.current === conversationId) {
      activeIdRef.current = remaining[0].id;
      setActiveId(remaining[0].id);
    }
  }, []);

  const sendMessage = useCallback(async (provided?: string) => {
    const text = (provided ?? input).trim();
    if (!text || sending || !providerReady) return;
    const conversationId = ensureConversation();
    const existing = conversationsRef.current.find((item) => item.id === conversationId)?.messages || [];
    const user = message("user", text);
    append(conversationId, user);
    setInput("");
    setError(null);
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/openai/chat", {
        method: "POST",
        signal: controller.signal,
        cache: "no-store",
        headers: { ...headers, "Content-Type": "application/json", "x-correlation-id": id("chat") },
        body: JSON.stringify({ messages: [...existing, user].slice(-MAX_MESSAGES).map((item) => ({ role: item.role, text: item.text })) }),
      });
      const payload = await response.json().catch(() => null) as ChatPayload | null;
      if (!response.ok || !payload?.ok || !payload.response?.text) throw new Error(payload?.error?.message || "ROSTA Insight yanıt veremedi.");
      append(conversationId, message("assistant", payload.response.text, {
        webSearchUsed: payload.response.webSearchUsed,
        sources: payload.response.sources,
        pendingAction: payload.response.pendingAction,
        actionState: payload.response.pendingAction ? "pending" : undefined,
      }));
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "ROSTA Insight yanıt veremedi.");
    } finally {
      setSending(false);
      if (abortRef.current === controller) abortRef.current = null;
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [append, ensureConversation, input, providerReady, sending]);

  const executeAction = useCallback(async (conversationId: string, messageId: string, action: PendingAction) => {
    updateConversation(conversationId, (conversation) => ({ ...conversation, messages: conversation.messages.map((item) => item.id === messageId ? { ...item, actionState: "executing", actionError: undefined } : item) }));
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/admin/execute", {
        method: "POST",
        cache: "no-store",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ token: action.token }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; result?: { title?: string; error?: string; data?: unknown }; error?: { message?: string } } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.result?.error || payload?.error?.message || "Panel işlemi uygulanamadı.");
      updateConversation(conversationId, (conversation) => ({ ...conversation, messages: conversation.messages.map((item) => item.id === messageId ? { ...item, actionState: "completed" } : item) }));
      append(conversationId, message("assistant", `${payload.result?.title || action.title} tamamlandı. Panel verisi güncellendi.`, { source: "action" }));
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Panel işlemi uygulanamadı.";
      updateConversation(conversationId, (conversation) => ({ ...conversation, messages: conversation.messages.map((item) => item.id === messageId ? { ...item, actionState: "failed", actionError: text } : item) }));
    }
  }, [append, updateConversation]);

  const cancelAction = useCallback((conversationId: string, messageId: string) => {
    updateConversation(conversationId, (conversation) => ({ ...conversation, messages: conversation.messages.map((item) => item.id === messageId ? { ...item, actionState: "cancelled" } : item) }));
  }, [updateConversation]);

  const conversationContext = useCallback(() => {
    const conversation = conversationsRef.current.find((item) => item.id === activeIdRef.current);
    return (conversation?.messages || []).slice(-14).map((item) => `${item.role === "user" ? "Kullanıcı" : "Ruthie"}: ${item.text}`).join("\n");
  }, []);

  const realtime = useRuthieRealtimeVision({
    enabled: voiceReady,
    conversationContext,
    onMessage: (voiceMessage) => {
      const conversationId = ensureConversation();
      append(conversationId, message(voiceMessage.role, voiceMessage.text, { source: "voice" }));
    },
  });

  useEffect(() => { if (realtime.phase === "idle") setCameraOpen(false); }, [realtime.phase]);

  const filtered = useMemo(() => {
    const query = historyQuery.trim().toLocaleLowerCase("tr-TR");
    if (!query) return conversations;
    return conversations.filter((conversation) => conversation.title.toLocaleLowerCase("tr-TR").includes(query) || conversation.messages.some((item) => item.text.toLocaleLowerCase("tr-TR").includes(query)));
  }, [conversations, historyQuery]);

  const voiceLabel = realtime.phase === "connecting" ? "Bağlanıyor" : realtime.phase === "thinking" ? "Düşünüyor" : realtime.phase === "speaking" ? "Konuşuyor" : realtime.phase === "error" ? "Bağlantı hatası" : "Dinliyor";
  const voiceHeadline = realtime.assistantText || realtime.userText || (cameraOpen ? "Göster ve sor" : "Konuşmaya başlayabilirsin");
  const submit = (event: FormEvent) => { event.preventDefault(); void sendMessage(); };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } };

  return (
    <section className={styles.app}>
      <button className={`${styles.scrim} ${sidebarOpen ? styles.scrimOpen : ""}`} type="button" onClick={() => setSidebarOpen(false)} aria-label="Geçmişi kapat" />
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <header className={styles.sidebarHeader}><div><span><Sparkles /></span><strong>Ruthie</strong></div><button type="button" onClick={() => setSidebarOpen(false)} aria-label="Menüyü kapat"><PanelLeftClose /></button></header>
        <button className={styles.newChat} type="button" onClick={createChat}><MessageSquarePlus /><span>Yeni sohbet</span></button>
        <label className={styles.search}><Search /><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Geçmişte ara" /></label>
        <div className={styles.capabilities}><span><ShieldCheck /> Admin araçları</span><span><Globe2 /> Web Search</span><span><Camera /> Vision</span></div>
        <div className={styles.historyLabel}><span>Konuşmalar</span><small>{conversations.length}</small></div>
        <nav className={styles.historyList}>
          {filtered.map((conversation) => <div className={`${styles.historyItem} ${conversation.id === activeId ? styles.historyActive : ""}`} key={conversation.id}><button type="button" onClick={() => { setActiveId(conversation.id); activeIdRef.current = conversation.id; setSidebarOpen(false); }}><strong>{conversation.title}</strong><small><Clock3 /> {dateLabel(conversation.updatedAt)}</small></button><button type="button" aria-label="Konuşmayı sil" onClick={() => deleteChat(conversation.id)}><Trash2 /></button></div>)}
        </nav>
        <footer className={styles.sidebarFooter}><span className={providerReady ? styles.online : ""} /><div><strong>{providerReady ? "Ruthie hazır" : "Bağlantı yok"}</strong><small>{modelLabel} · admin + web + vision</small></div></footer>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <button className={styles.menuButton} type="button" onClick={() => setSidebarOpen(true)} aria-label="Geçmişi aç"><Menu /></button>
          <button className={styles.model} type="button"><span>Ruthie</span><small>{modelLabel}</small><ChevronDown /></button>
          <div className={styles.topStatus}><span><ShieldCheck /> Admin</span><span><Globe2 /> Web</span><span><Camera /> Vision</span></div>
          <div className={styles.topActions}><button type="button" onClick={() => void realtime.start()} disabled={!voiceReady}><Headphones /><span>Sesli</span></button><Link href="/" aria-label="Panele dön"><X /></Link></div>
        </header>

        <div className={styles.messages} aria-live="polite">
          {!messages.length ? <div className={styles.empty}><span><Sparkles /></span><h1>Bugün ne yapalım?</h1><p>Sipariş ve ürün oluşturabilir, paneldeki canlı verileri sorgulayabilir, webde araştırabilir ve kritik işlemleri onayından sonra uygulayabilirim.</p><div>{suggestions.map((item) => <button key={item} type="button" onClick={() => void sendMessage(item)}>{item}<Sparkles /></button>)}</div></div> : <div className={styles.thread}>{messages.map((item) => <article className={`${styles.message} ${item.role === "user" ? styles.userMessage : styles.assistantMessage}`} key={item.id}>{item.role === "assistant" ? <span className={styles.avatar}><Sparkles /></span> : null}<div className={styles.bubble}>{item.role === "assistant" ? <strong>Ruthie</strong> : null}<p>{item.text}</p>{item.pendingAction ? <div className={`${styles.actionCard} ${styles[`action_${item.actionState || "pending"}`]}`}><header><span>{item.actionState === "completed" ? <Check /> : item.actionState === "failed" ? <XCircle /> : <ShieldCheck />}</span><div><strong>{item.pendingAction.title}</strong><small>{item.pendingAction.risk === "critical" ? "Kritik işlem" : "Panel değişikliği"}</small></div></header><p>{item.pendingAction.summary}</p>{item.actionError ? <em>{item.actionError}</em> : null}<footer>{item.actionState === "pending" ? <><button type="button" onClick={() => void executeAction(activeConversation!.id, item.id, item.pendingAction!)}>Onayla ve uygula</button><button type="button" onClick={() => cancelAction(activeConversation!.id, item.id)}>İptal</button></> : item.actionState === "executing" ? <span><LoaderCircle /> Uygulanıyor</span> : <span>{item.actionState === "completed" ? "İşlem tamamlandı" : item.actionState === "cancelled" ? "İşlem iptal edildi" : "İşlem başarısız"}</span>}</footer></div> : null}<div className={styles.meta}>{item.source === "voice" ? <span><Mic /> Sesli</span> : null}{item.source === "action" ? <span><Check /> Panel işlemi</span> : null}{item.webSearchUsed ? <span><Globe2 /> Web araştırması</span> : null}{item.role === "assistant" ? <span><ShieldCheck /> Admin bağlamı</span> : null}</div>{item.sources?.length ? <div className={styles.sources}>{item.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div> : null}</div></article>)}{sending ? <article className={`${styles.message} ${styles.assistantMessage}`}><span className={styles.avatar}><Sparkles /></span><div className={styles.bubble}><strong>Ruthie</strong><div className={styles.typing}><span /><span /><span /></div><small>Panel araçları kontrol ediliyor</small></div></article> : null}</div>}
          <div ref={bottomRef} />
        </div>

        {error ? <div className={styles.error}><AlertCircle /><span>{error}</span><button type="button" onClick={() => setError(null)}>Kapat</button></div> : null}
        <form className={styles.composer} onSubmit={submit}><textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyDown} placeholder={providerReady ? "ROSTA Insight'a mesaj gönder" : "OpenAI bağlantısı hazır değil"} disabled={!providerReady} rows={1} /><button type="button" onClick={() => void realtime.start()} disabled={!voiceReady} aria-label="Sesli asistan"><Mic /></button><button type="submit" disabled={!providerReady || !input.trim() || sending} aria-label="Gönder"><Send /></button></form>
      </main>

      {realtime.phase !== "idle" ? <section className={styles.voiceOverlay} aria-label="Ruthie sesli asistan">
        <header className={styles.voiceHeader}><div><span><Sparkles /></span><div><strong>Ruthie</strong><small>{status?.models?.realtime || "gpt-realtime"}</small></div></div><div className={styles.voiceState}><i className={realtime.phase === "error" ? styles.stateError : ""} /><strong>{voiceLabel}</strong></div><div className={styles.voiceActions}><button type="button" onClick={() => setCameraOpen((value) => !value)} disabled={!realtime.connected} aria-pressed={cameraOpen} aria-label={cameraOpen ? "Kamerayı kapat" : "Arka kamerayı aç"}>{cameraOpen ? <CameraOff /> : <Camera />}</button><button type="button" onClick={() => { setCameraOpen(false); realtime.end(); }} aria-label="Sesli asistanı kapat"><X /></button></div></header>
        <main className={styles.voiceStage}>{cameraOpen ? <RuthieCameraVision connected={realtime.connected} translationEnabled={realtime.translationEnabled} translationLanguage={translationLanguage} onClose={() => setCameraOpen(false)} onFrame={realtime.sendVisionFrame} onTranslation={(enabled, language) => { const target = language || translationLanguage; setTranslationLanguage(target); return realtime.setTranslation(enabled, target); }} /> : <><div className={styles.orb}><RuthieVoiceOrb phase={realtime.phase} inputStream={realtime.microphoneStream} outputStream={realtime.assistantStream} muted={false} /></div><div className={styles.voiceCopy}><small>{voiceLabel}</small><h2>{voiceHeadline}</h2><p>{realtime.error || "Konuşabilir, kamerayı açıp gösterebilir veya canlı çeviri kullanabilirsin."}</p>{realtime.phase === "error" ? <button type="button" onClick={() => void realtime.retry()}>Tekrar bağlan</button> : null}</div></>}</main>
      </section> : null}
    </section>
  );
}
