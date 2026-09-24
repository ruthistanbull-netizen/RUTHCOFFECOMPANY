"use client";

import { Drawer, FullscreenOverlay } from "@ruth-commerce/ui";
import {
  AlertCircle,
  AppWindow,
  Bot,
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  Clock3,
  Database,
  Github,
  Globe2,
  Headphones,
  Languages,
  LoaderCircle,
  Menu,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Plug,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Waves,
  X,
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
import styles from "./RuthieWorkspaceV3.module.css";

type ChatRole = "user" | "assistant";
type MessageSource = "chat" | "voice";
type WebSource = { title: string; url: string };

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
  source: MessageSource;
  webSearchUsed?: boolean;
  sources?: WebSource[];
};

type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type StoredWorkspace = {
  version: 4;
  activeId: string | null;
  conversations: Conversation[];
};

type ProviderStatus = {
  ok?: boolean;
  configured?: boolean;
  models?: { chat?: string | null; realtime?: string };
  capabilities?: { chat?: boolean; realtimeVoice?: boolean };
};

type ChatApiResponse = {
  ok: boolean;
  response?: {
    text: string;
    webSearchUsed?: boolean;
    sources?: WebSource[];
    panelAccess?: string;
  };
  panelAccess?: { canAnalyzePanel?: boolean };
  error?: { message?: string };
};

type WorkspaceConnector = {
  key: string;
  title: string;
  category: string;
  capabilities: string[];
  auth: string;
  connected: boolean;
};

type WorkspaceTool = {
  id: string;
  title: string;
  description: string;
  engine: string;
  operation: string;
  enabled: boolean;
};

type WorkspaceCatalog = {
  ok: boolean;
  access?: { panelRead?: boolean; webSearch?: boolean; commandPolicy?: string };
  connectors: WorkspaceConnector[];
  tools: WorkspaceTool[];
  summary: {
    connectorCount: number;
    connectedConnectorCount: number;
    toolCount: number;
    enabledToolCount: number;
  };
};

const STORAGE_KEY = "ruthie_workspace_v4";
const LEGACY_STORAGE_KEYS = ["ruthie_workspace_v3", "ruthie_workspace_v2"];
const MAX_CONVERSATIONS = 60;
const MAX_MESSAGES = 40;
const TRANSLATION_LANGUAGES = ["İngilizce", "Arnavutça", "İtalyanca", "Almanca", "Fransızca", "İspanyolca", "Arapça", "Rusça", "Sırpça"];
const suggestions = [
  "Paneli canlı verilerle analiz et ve en önemli sorunları sırala.",
  "Bugünkü sipariş ve stok durumunda neye odaklanmalıyım?",
  "Webde güncel takı e-ticaret trendlerini araştır.",
  "Son ürün ve sipariş verilerine göre aksiyon planı çıkar.",
];

function makeId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeMessage(
  role: ChatRole,
  text: string,
  source: MessageSource = "chat",
  extras?: Pick<ChatMessage, "webSearchUsed" | "sources">,
): ChatMessage {
  return {
    id: makeId("message"),
    role,
    text,
    source,
    createdAt: new Date().toISOString(),
    ...extras,
  };
}

function conversationTitle(text?: string) {
  const normalized = text?.replace(/\s+/g, " ").trim() || "Yeni sohbet";
  return normalized.length > 48 ? `${normalized.slice(0, 48).trim()}…` : normalized;
}

function makeConversation(seed?: string): Conversation {
  const now = new Date().toISOString();
  return { id: makeId("conversation"), title: conversationTitle(seed), createdAt: now, updatedAt: now, messages: [] };
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return typeof message.id === "string"
    && (message.role === "user" || message.role === "assistant")
    && typeof message.text === "string"
    && typeof message.createdAt === "string"
    && (message.source === "chat" || message.source === "voice");
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const conversation = value as Partial<Conversation>;
  return typeof conversation.id === "string"
    && typeof conversation.title === "string"
    && typeof conversation.createdAt === "string"
    && typeof conversation.updatedAt === "string"
    && Array.isArray(conversation.messages)
    && conversation.messages.every(isMessage);
}

function parseWorkspace(raw: string | null): StoredWorkspace | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { activeId?: unknown; conversations?: unknown };
    if (!Array.isArray(parsed.conversations)) return null;
    const conversations = parsed.conversations
      .filter(isConversation)
      .map((conversation) => ({ ...conversation, messages: conversation.messages.slice(-MAX_MESSAGES) }))
      .slice(0, MAX_CONVERSATIONS);
    return {
      version: 4,
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
      conversations,
    };
  } catch {
    return null;
  }
}

function readWorkspace() {
  const current = parseWorkspace(window.localStorage.getItem(STORAGE_KEY));
  if (current) return current;
  for (const key of LEGACY_STORAGE_KEYS) {
    const legacy = parseWorkspace(window.localStorage.getItem(key));
    if (legacy) return legacy;
  }
  return null;
}

function formatConversationDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Bugün";
  if (date.toDateString() === yesterday.toDateString()) return "Dün";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(date);
}

function connectorIcon(key: string) {
  if (key === "openai") return <Bot aria-hidden="true" />;
  if (key === "supabase") return <Database aria-hidden="true" />;
  if (key === "github") return <Github aria-hidden="true" />;
  return <Plug aria-hidden="true" />;
}

export function RuthieWorkspaceV4() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [appsOpen, setAppsOpen] = useState(false);
  const [catalog, setCatalog] = useState<WorkspaceCatalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [translationLanguage, setTranslationLanguage] = useState("İngilizce");

  const conversationsRef = useRef<Conversation[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const stored = readWorkspace();
    if (stored?.conversations.length) {
      const nextActiveId = stored.conversations.some((conversation) => conversation.id === stored.activeId)
        ? stored.activeId
        : stored.conversations[0].id;
      conversationsRef.current = stored.conversations;
      activeIdRef.current = nextActiveId;
      setConversations(stored.conversations);
      setActiveId(nextActiveId);
    } else {
      const fresh = makeConversation();
      conversationsRef.current = [fresh];
      activeIdRef.current = fresh.id;
      setConversations([fresh]);
      setActiveId(fresh.id);
    }
    setStorageReady(true);
  }, []);

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  useEffect(() => {
    if (!storageReady) return;
    try {
      const payload: StoredWorkspace = { version: 4, activeId, conversations: conversations.slice(0, MAX_CONVERSATIONS) };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ruthie remains usable if browser storage is unavailable.
    }
  }, [activeId, conversations, storageReady]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) || null,
    [activeId, conversations],
  );
  const messages = activeConversation?.messages || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: messages.length > 1 ? "smooth" : "auto", block: "end" });
  }, [messages.length, sending]);

  const loadStatus = useCallback(async () => {
    setStatusError(null);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/openai/status", { headers, cache: "no-store" });
      const payload = await response.json().catch(() => null) as ProviderStatus | null;
      if (!response.ok || !payload?.ok) throw new Error("Ruthie sağlayıcı durumu alınamadı.");
      setStatus(payload);
    } catch (caught) {
      setStatus(null);
      setStatusError(caught instanceof Error ? caught.message : "Ruthie sağlayıcı durumu alınamadı.");
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/workspace", { headers, cache: "no-store" });
      const payload = await response.json().catch(() => null) as WorkspaceCatalog | null;
      if (!response.ok || !payload?.ok) throw new Error("Eklenti kataloğu alınamadı.");
      setCatalog(payload);
    } catch (caught) {
      setChatError(caught instanceof Error ? caught.message : "Eklenti kataloğu alınamadı.");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); void loadCatalog(); }, [loadCatalog, loadStatus]);

  const providerReady = Boolean(status?.configured && status?.capabilities?.chat);
  const voiceReady = Boolean(status?.configured && status?.capabilities?.realtimeVoice);
  const panelReadReady = catalog?.access?.panelRead !== false;
  const webSearchReady = catalog?.access?.webSearch !== false && providerReady;
  const modelLabel = status?.models?.chat || "gpt-5.6";
  const canSend = storageReady && providerReady && input.trim().length > 0 && !sending;

  const ensureConversationId = useCallback((seed?: string) => {
    const currentId = activeIdRef.current;
    if (currentId && conversationsRef.current.some((conversation) => conversation.id === currentId)) return currentId;
    const fresh = makeConversation(seed);
    activeIdRef.current = fresh.id;
    setActiveId(fresh.id);
    setConversations((current) => [fresh, ...current].slice(0, MAX_CONVERSATIONS));
    return fresh.id;
  }, []);

  const appendMessage = useCallback((conversationId: string, message: ChatMessage) => {
    setConversations((current) => {
      let found = false;
      const next = current.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        found = true;
        const firstUserText = conversation.messages.find((item) => item.role === "user")?.text;
        const titleSeed = firstUserText || (message.role === "user" ? message.text : undefined);
        return {
          ...conversation,
          title: conversation.title === "Yeni sohbet" ? conversationTitle(titleSeed) : conversation.title,
          updatedAt: message.createdAt,
          messages: [...conversation.messages, message].slice(-MAX_MESSAGES),
        };
      });
      if (!found) {
        const created = makeConversation(message.role === "user" ? message.text : undefined);
        next.unshift({ ...created, id: conversationId, updatedAt: message.createdAt, messages: [message] });
      }
      return next.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, MAX_CONVERSATIONS);
    });
  }, []);

  const createNewConversation = useCallback(() => {
    abortRef.current?.abort();
    setSending(false);
    setChatError(null);
    const fresh = makeConversation();
    activeIdRef.current = fresh.id;
    setActiveId(fresh.id);
    setConversations((current) => [fresh, ...current].slice(0, MAX_CONVERSATIONS));
    setHistoryOpen(false);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const selectConversation = useCallback((conversationId: string) => {
    activeIdRef.current = conversationId;
    setActiveId(conversationId);
    setHistoryOpen(false);
    setChatError(null);
  }, []);

  const deleteConversation = useCallback((conversationId: string) => {
    const remaining = conversationsRef.current.filter((conversation) => conversation.id !== conversationId);
    if (!remaining.length) {
      const fresh = makeConversation();
      conversationsRef.current = [fresh];
      activeIdRef.current = fresh.id;
      setConversations([fresh]);
      setActiveId(fresh.id);
      return;
    }
    setConversations(remaining);
    if (activeIdRef.current === conversationId) {
      activeIdRef.current = remaining[0].id;
      setActiveId(remaining[0].id);
    }
  }, []);

  const clearConversation = useCallback(() => {
    const conversationId = activeIdRef.current;
    if (!conversationId) return;
    abortRef.current?.abort();
    setSending(false);
    setChatError(null);
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId
        ? { ...conversation, title: "Yeni sohbet", messages: [], updatedAt: new Date().toISOString() }
        : conversation
    )));
  }, []);

  const sendMessage = useCallback(async (providedText?: string) => {
    const text = (providedText ?? input).trim();
    if (!text || sending || !providerReady) return;
    const conversationId = ensureConversationId(text);
    const existing = conversationsRef.current.find((conversation) => conversation.id === conversationId)?.messages || [];
    const userMessage = makeMessage("user", text);
    const nextMessages = [...existing, userMessage].slice(-MAX_MESSAGES);
    appendMessage(conversationId, userMessage);
    setInput("");
    setChatError(null);
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const authHeaders = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/openai/chat", {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: { ...authHeaders, "Content-Type": "application/json", "x-correlation-id": makeId("correlation") },
        body: JSON.stringify({ messages: nextMessages.map((message) => ({ role: message.role, text: message.text })) }),
      });
      const payload = await response.json().catch(() => ({ ok: false, error: { message: "Sunucu geçerli bir yanıt döndürmedi." } })) as ChatApiResponse;
      if (!response.ok || !payload.ok || !payload.response?.text) throw new Error(payload.error?.message || "ROSTA Insight yanıt veremedi.");
      appendMessage(conversationId, makeMessage("assistant", payload.response.text, "chat", {
        webSearchUsed: payload.response.webSearchUsed,
        sources: payload.response.sources,
      }));
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setChatError(caught instanceof Error ? caught.message : "ROSTA Insight yanıt veremedi.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [appendMessage, ensureConversationId, input, providerReady, sending]);

  const conversationContext = useCallback(() => {
    const conversation = conversationsRef.current.find((item) => item.id === activeIdRef.current);
    return (conversation?.messages || [])
      .slice(-12)
      .map((message) => `${message.role === "user" ? "Kullanıcı" : "Ruthie"}: ${message.text}`)
      .join("\n");
  }, []);

  const handleVoiceMessage = useCallback((message: { role: "user" | "assistant"; text: string }) => {
    const conversationId = ensureConversationId(message.text);
    appendMessage(conversationId, makeMessage(message.role, message.text, "voice"));
  }, [appendMessage, ensureConversationId]);

  const realtime = useRuthieRealtimeVision({
    enabled: voiceReady,
    conversationContext,
    onMessage: handleVoiceMessage,
  });

  useEffect(() => {
    if (realtime.phase === "idle") setCameraOpen(false);
  }, [realtime.phase]);

  const filteredConversations = useMemo(() => {
    const query = historyQuery.trim().toLocaleLowerCase("tr-TR");
    if (!query) return conversations;
    return conversations.filter((conversation) => conversation.title.toLocaleLowerCase("tr-TR").includes(query)
      || conversation.messages.some((message) => message.text.toLocaleLowerCase("tr-TR").includes(query)));
  }, [conversations, historyQuery]);

  const enabledTools = catalog?.tools.filter((tool) => tool.enabled) || [];
  const voiceLabel = realtime.phase === "connecting" ? "Bağlanıyor"
    : realtime.phase === "thinking" ? "Düşünüyor"
      : realtime.phase === "speaking" ? "Ruthie konuşuyor"
        : realtime.phase === "error" ? "Bağlantı kurulamadı"
          : cameraOpen ? "Kamera ve mikrofon açık" : "Seni dinliyor";
  const voiceHeadline = realtime.phase === "connecting" ? "ROSTA Insight hazırlanıyor"
    : realtime.phase === "error" ? "Bağlantıyı yeniden deneyelim"
      : realtime.assistantText || realtime.userText || (cameraOpen ? "Göster ve sor" : "Konuşmaya başlayabilirsin");

  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void sendMessage(); };
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) void sendMessage();
    }
  };

  return (
    <section className={styles.page}>
      <div className={`${styles.workspace} ${historyOpen ? styles.historyIsOpen : ""}`}>
        <button className={styles.mobileHistoryBackdrop} type="button" aria-label="Konuşma geçmişini kapat" onClick={() => setHistoryOpen(false)} />
        <aside className={styles.historyPanel} aria-label="Ruthie konuşma geçmişi">
          <div className={styles.historyHeader}>
            <div className={styles.ruthieBrand}><span><Sparkles aria-hidden="true" /></span><strong>Ruthie</strong></div>
            <button className={styles.closeHistoryButton} type="button" onClick={() => setHistoryOpen(false)} aria-label="Geçmişi kapat"><X aria-hidden="true" /></button>
          </div>
          <button className={styles.newChatButton} type="button" onClick={createNewConversation}><MessageSquarePlus aria-hidden="true" /><span>Yeni sohbet</span></button>
          <label className={styles.historySearch}><Search aria-hidden="true" /><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Geçmişte ara" aria-label="Konuşma geçmişinde ara" /></label>
          <nav className={styles.workspaceLinks} aria-label="Ruthie özellikleri">
            <button type="button" onClick={() => setAppsOpen(true)}><AppWindow aria-hidden="true" /><span>Eklentiler ve araçlar</span></button>
            <button type="button" onClick={() => void realtime.start()} disabled={!voiceReady}><Headphones aria-hidden="true" /><span>Sesli asistan</span></button>
          </nav>
          <div className={styles.capabilityStrip}>
            <span className={panelReadReady ? styles.capabilityReady : ""}><ShieldCheck aria-hidden="true" /> Panel</span>
            <span className={webSearchReady ? styles.capabilityReady : ""}><Globe2 aria-hidden="true" /> Web</span>
            <span className={voiceReady ? styles.capabilityReady : ""}><Camera aria-hidden="true" /> Kamera</span>
          </div>
          <div className={styles.historyTitle}><span>Konuşmalar</span><small>{conversations.length}</small></div>
          <div className={styles.conversationList}>
            {filteredConversations.map((conversation) => (
              <div className={`${styles.conversationItem} ${conversation.id === activeId ? styles.activeConversation : ""}`} key={conversation.id}>
                <button type="button" onClick={() => selectConversation(conversation.id)}><span>{conversation.title}</span><small><Clock3 aria-hidden="true" /> {formatConversationDate(conversation.updatedAt)}</small></button>
                <button type="button" className={styles.deleteConversationButton} onClick={() => deleteConversation(conversation.id)} aria-label={`${conversation.title} konuşmasını sil`}><Trash2 aria-hidden="true" /></button>
              </div>
            ))}
            {!filteredConversations.length ? <p className={styles.noHistory}>Eşleşen konuşma bulunamadı.</p> : null}
          </div>
          <div className={styles.historyFooter}><span className={`${styles.statusDot} ${providerReady ? styles.online : ""}`} /><div><strong>{providerReady ? "Ruthie hazır" : "OpenAI bağlantısı yok"}</strong><small>{modelLabel} · panel + web + vision</small></div></div>
        </aside>

        <main className={styles.chatMain}>
          <header className={styles.chatTopbar}>
            <button className={styles.historyToggle} type="button" onClick={() => setHistoryOpen(true)} aria-label="Konuşma geçmişini aç"><Menu aria-hidden="true" /></button>
            <button className={styles.modelButton} type="button" onClick={() => setAppsOpen(true)}><span>Ruthie</span><small>{modelLabel}</small><ChevronDown aria-hidden="true" /></button>
            <div className={styles.liveCapabilities} aria-label="Aktif Ruthie yetenekleri">
              <span><ShieldCheck aria-hidden="true" /> Panel erişimi</span>
              <span><Globe2 aria-hidden="true" /> Web arama</span>
              <span><Camera aria-hidden="true" /> Görsel analiz</span>
            </div>
            <div className={styles.topbarActions}>
              <button type="button" onClick={() => setAppsOpen(true)} aria-label="Eklentileri aç"><AppWindow aria-hidden="true" /><span>Araçlar</span></button>
              <button className={styles.voiceTopButton} type="button" onClick={() => void realtime.start()} disabled={!voiceReady} aria-label="Sesli asistanı başlat"><Waves aria-hidden="true" /><span>Voice</span></button>
            </div>
          </header>

          <div className={styles.messages} aria-live="polite" aria-busy={sending}>
            {!messages.length ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyMark}><Sparkles aria-hidden="true" /></span>
                <h1>Bugün ne üzerinde çalışalım?</h1>
                <p>Canlı panel verisini analiz edebilir, webde araştırma yapabilir; sesli görüşmede arka kameradan gösterdiklerini görebilir ve çevirebilirim.</p>
                <div className={styles.emptyBadges}><span><ShieldCheck aria-hidden="true" /> Canlı panel analizi</span><span><Globe2 aria-hidden="true" /> Web Search</span><span><Camera aria-hidden="true" /> Realtime Vision</span><span><Languages aria-hidden="true" /> Canlı çeviri</span></div>
                <div className={styles.suggestions}>{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void sendMessage(suggestion)} disabled={!providerReady || sending}><span>{suggestion}</span><Sparkles aria-hidden="true" /></button>)}</div>
              </div>
            ) : (
              <div className={styles.thread}>
                {messages.map((message) => (
                  <article className={`${styles.message} ${message.role === "user" ? styles.userMessage : styles.assistantMessage}`} key={message.id}>
                    {message.role === "assistant" ? <span className={styles.assistantAvatar}><Sparkles aria-hidden="true" /></span> : null}
                    <div className={styles.messageContent}>
                      {message.role === "assistant" ? <strong>Ruthie</strong> : null}
                      <p>{message.text}</p>
                      <div className={styles.messageMeta}>
                        {message.source === "voice" ? <span><Mic aria-hidden="true" /> Sesli görüşme</span> : null}
                        {message.webSearchUsed ? <span><Globe2 aria-hidden="true" /> Web araştırması</span> : null}
                        {message.role === "assistant" ? <span><ShieldCheck aria-hidden="true" /> Panel bağlamı</span> : null}
                      </div>
                      {message.sources?.length ? <div className={styles.sourceList}>{message.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}><Globe2 aria-hidden="true" /><span>{source.title}</span></a>)}</div> : null}
                    </div>
                  </article>
                ))}
                {sending ? <article className={`${styles.message} ${styles.assistantMessage}`}><span className={styles.assistantAvatar}><Sparkles aria-hidden="true" /></span><div className={styles.messageContent}><strong>Ruthie</strong><div className={styles.typingDots}><span /><span /><span /></div><small className={styles.workingLabel}>Panel ve web araçları kontrol ediliyor</small></div></article> : null}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {statusError || chatError ? <div className={styles.errorNotice}><AlertCircle aria-hidden="true" /><span>{chatError || statusError}</span><button type="button" onClick={() => { setChatError(null); if (statusError) void loadStatus(); }}>Kapat</button></div> : null}

          <div className={styles.composerArea}>
            <form className={styles.composer} onSubmit={submit}>
              <button className={styles.composerIconButton} type="button" onClick={() => setAppsOpen(true)} aria-label="Dosya ve eklenti ekle"><Plus aria-hidden="true" /></button>
              <textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onComposerKeyDown} rows={1} maxLength={8_000} placeholder={providerReady ? "ROSTA Insight'a mesaj gönder" : "OpenAI bağlantısı hazır değil"} aria-label="Ruthie mesajı" disabled={!providerReady} />
              <button className={styles.composerIconButton} type="button" onClick={() => setAppsOpen(true)} aria-label="Eklentileri aç"><Paperclip aria-hidden="true" /></button>
              <button className={styles.composerIconButton} type="button" onClick={() => void realtime.start()} disabled={!voiceReady} aria-label="Sesli asistanı başlat"><Mic aria-hidden="true" /></button>
              {sending ? <button className={styles.sendButton} type="button" onClick={() => { abortRef.current?.abort(); setSending(false); }} aria-label="Yanıtı durdur"><Square aria-hidden="true" /></button> : <button className={styles.sendButton} type="submit" disabled={!canSend} aria-label="Mesaj gönder"><Send aria-hidden="true" /></button>}
            </form>
            <div className={styles.composerMeta}><span><ShieldCheck aria-hidden="true" /> Panel · <Globe2 aria-hidden="true" /> Web · <Camera aria-hidden="true" /> Kamera</span><div><button type="button" onClick={clearConversation} disabled={!messages.length}><Trash2 aria-hidden="true" /> Temizle</button><button type="button" onClick={createNewConversation}><MessageSquarePlus aria-hidden="true" /> Yeni sohbet</button></div></div>
          </div>
        </main>
      </div>

      <Drawer open={appsOpen} side="right" title="Eklentiler ve araçlar" description="Canlı çalışan panel, web, kamera ve çeviri yetenekleri." onClose={() => setAppsOpen(false)}>
        <div className={styles.appsSummary}>
          <div><strong>{catalog?.summary.connectedConnectorCount ?? 0}</strong><span>Bağlı eklenti</span></div>
          <div><strong>{catalog?.summary.enabledToolCount ?? 0}</strong><span>Aktif araç</span></div>
          <div><strong>{catalog?.summary.toolCount ?? 0}</strong><span>Toplam araç</span></div>
        </div>
        <div className={styles.appsBody}>
          <section className={styles.activeToolsSection}><header><div><strong>Aktif yetenekler</strong><span>Salt okunur analiz araçları ve Realtime kamera kullanılabilir.</span></div><ShieldCheck aria-hidden="true" /></header><div>{enabledTools.map((tool) => <article key={tool.id}><span>{tool.id === "openai.web_search" ? <Globe2 aria-hidden="true" /> : <Check aria-hidden="true" />}</span><div><strong>{tool.title}</strong><p>{tool.description}</p></div></article>)}</div></section>
          <section className={styles.activeToolsSection}><header><div><strong>Realtime Vision</strong><span>Arka kamera, görsel soru-cevap ve Türkçe çift yönlü çeviri.</span></div><Camera aria-hidden="true" /></header><div><article><span><Camera aria-hidden="true" /></span><div><strong>Canlı kamera bağlamı</strong><p>Görüntü değiştiğinde sıkıştırılmış kareyi aynı Voice oturumuna ekler.</p></div></article><article><span><Languages aria-hidden="true" /></span><div><strong>Canlı çeviri</strong><p>Türkçe ile seçilen dil arasında konuşma ve kamera metni çevirir.</p></div></article></div></section>
          {catalogLoading ? <div className={styles.appsLoading}><LoaderCircle aria-hidden="true" /> Eklentiler yükleniyor</div> : <div className={styles.connectorGrid}>{(catalog?.connectors || []).map((connector) => <article className={styles.connectorCard} key={connector.key}><span className={styles.connectorIcon}>{connectorIcon(connector.key)}</span><div><div className={styles.connectorTitle}><strong>{connector.title}</strong>{connector.connected ? <span className={styles.connectedBadge}><Check aria-hidden="true" /> Bağlı</span> : null}</div><p>{connector.capabilities.slice(0, 3).map((item) => item.replaceAll("_", " ")).join(" · ")}</p><small>{connector.category} · {connector.auth.replaceAll("_", " ")}</small></div><button type="button" disabled>{connector.connected ? "Aktif" : "Bağlantı sırada"}</button></article>)}</div>}
          <div className={styles.toolsNotice}><ShieldCheck aria-hidden="true" /><div><strong>Gizlilik kontrollü</strong><p>Kamera yalnız sen açtığında çalışır. Görüntü kareleri Ruthie Realtime oturumuna gönderilir, panel veritabanına kaydedilmez ve kamera kapanınca video track tamamen durur.</p></div></div>
        </div>
      </Drawer>

      <FullscreenOverlay
        open={realtime.phase !== "idle"}
        title="Ruthie"
        onClose={() => { setCameraOpen(false); realtime.end(); }}
        closeOnBackdrop={false}
        showCloseButton={false}
        className={styles.voiceOverlayRoot}
        panelClassName={styles.voiceOverlay}
      >
        <div className={styles.voiceShell}>
          <header className={styles.voiceHeader}>
            <div className={styles.voiceIdentity}><span><Sparkles aria-hidden="true" /></span><div><strong>Ruthie</strong><small>{status?.models?.realtime || "gpt-realtime"}</small></div></div>
            <div className={styles.voiceHeaderStatus}><span className={realtime.phase === "error" ? styles.voiceStatusError : ""} /><strong>{voiceLabel}</strong></div>
            <div className="ruthieVoiceHeaderActions">
              <button type="button" onClick={() => setCameraOpen((current) => !current)} disabled={!realtime.connected} aria-label={cameraOpen ? "Kamerayı kapat" : "Arka kamerayı aç"} aria-pressed={cameraOpen}>{cameraOpen ? <CameraOff aria-hidden="true" /> : <Camera aria-hidden="true" />}</button>
              <button type="button" onClick={() => { setCameraOpen(false); realtime.end(); }} aria-label="Ruthie'yi kapat"><X aria-hidden="true" /></button>
            </div>
          </header>

          <main className={styles.voiceStage}>
            {cameraOpen ? (
              <RuthieCameraVision
                connected={realtime.connected}
                translationEnabled={realtime.translationEnabled}
                translationLanguage={translationLanguage}
                onClose={() => setCameraOpen(false)}
                onFrame={realtime.sendVisionFrame}
                onTranslation={(enabled, targetLanguage) => {
                  const language = targetLanguage || translationLanguage;
                  setTranslationLanguage(language);
                  return realtime.setTranslation(enabled, language);
                }}
              />
            ) : (
              <>
                <div className={styles.orbWrap} data-phase={realtime.phase}>
                  <RuthieVoiceOrb phase={realtime.phase === "idle" ? "connecting" : realtime.phase} stream={realtime.microphoneStream} muted={false} />
                  <div className={styles.orbCoreMark}><Sparkles aria-hidden="true" /></div>
                </div>
                <div className={styles.voiceCopy}>
                  <small>{voiceLabel}</small>
                  <h2>{voiceHeadline}</h2>
                  {realtime.userText && realtime.assistantText ? <p><strong>Sen:</strong> {realtime.userText}</p> : <p>Konuşabilir, kamerayı açıp gösterebilir veya çift yönlü çeviriyi etkinleştirebilirsin.</p>}
                  {realtime.error ? <div className={styles.voiceError}><AlertCircle aria-hidden="true" /><span>{realtime.error}</span></div> : null}
                  {realtime.phase === "error" ? <button className="ruthieVoiceRetry" type="button" onClick={() => void realtime.retry()}><RotateCcw aria-hidden="true" /> Tekrar bağlan</button> : null}
                </div>
                <div className="ruthieVoiceTranslationDock">
                  <button type="button" onClick={() => realtime.setTranslation(!realtime.translationEnabled, translationLanguage)} disabled={!realtime.connected} aria-pressed={realtime.translationEnabled}><Languages aria-hidden="true" />{realtime.translationEnabled ? "Çeviri açık" : "Canlı çeviri"}</button>
                  <select value={translationLanguage} onChange={(event) => { const language = event.target.value; setTranslationLanguage(language); if (realtime.translationEnabled) realtime.setTranslation(true, language); }} aria-label="Canlı çeviri hedef dili">
                    {TRANSLATION_LANGUAGES.map((language) => <option key={language} value={language}>{language}</option>)}
                  </select>
                </div>
              </>
            )}
          </main>
        </div>
      </FullscreenOverlay>
    </section>
  );
}
