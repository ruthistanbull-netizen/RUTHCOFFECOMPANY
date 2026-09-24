"use client";

import { Drawer, FullscreenOverlay } from "@ruth-commerce/ui";
import {
  AlertCircle,
  AppWindow,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  Database,
  Globe2,
  Github,
  Headphones,
  LoaderCircle,
  Menu,
  MessageSquarePlus,
  Mic,
  MicOff,
  Paperclip,
  PhoneOff,
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
import { RuthieVoiceOrb, type RuthieVoiceVisualPhase } from "./RuthieVoiceOrb";
import styles from "./RuthieWorkspaceV3.module.css";

type ChatRole = "user" | "assistant";
type MessageSource = "chat" | "voice";
type VoicePhase = "idle" | RuthieVoiceVisualPhase;

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
  version: 3;
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

type RealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
};

const STORAGE_KEY = "ruthie_workspace_v3";
const LEGACY_STORAGE_KEY = "ruthie_workspace_v2";
const MAX_CONVERSATIONS = 60;
const MAX_MESSAGES = 40;
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

function parseStoredWorkspace(raw: string | null): StoredWorkspace | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { version?: number; activeId?: unknown; conversations?: unknown };
    if (!Array.isArray(parsed.conversations)) return null;
    const conversations = parsed.conversations
      .filter(isConversation)
      .map((conversation) => ({ ...conversation, messages: conversation.messages.slice(-MAX_MESSAGES) }))
      .slice(0, MAX_CONVERSATIONS);
    return {
      version: 3,
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
      conversations,
    };
  } catch {
    return null;
  }
}

function readWorkspace(): StoredWorkspace | null {
  return parseStoredWorkspace(window.localStorage.getItem(STORAGE_KEY))
    || parseStoredWorkspace(window.localStorage.getItem(LEGACY_STORAGE_KEY));
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

function waitForIceGathering(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    let complete = false;
    const done = () => {
      if (complete) return;
      complete = true;
      window.clearTimeout(timeout);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => { if (pc.iceGatheringState === "complete") done(); };
    const timeout = window.setTimeout(done, 5_000);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

function connectorIcon(key: string) {
  if (key === "openai") return <Bot aria-hidden="true" />;
  if (key === "supabase") return <Database aria-hidden="true" />;
  if (key === "github") return <Github aria-hidden="true" />;
  return <Plug aria-hidden="true" />;
}

export function RuthieWorkspaceV3() {
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
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceUserText, setVoiceUserText] = useState("");
  const [voiceAssistantText, setVoiceAssistantText] = useState("");
  const [micMuted, setMicMuted] = useState(false);
  const [voiceStream, setVoiceStream] = useState<MediaStream | null>(null);

  const conversationsRef = useRef<Conversation[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceAssistantBufferRef = useRef("");
  const voiceUserBufferRef = useRef("");

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
      const payload: StoredWorkspace = { version: 3, activeId, conversations: conversations.slice(0, MAX_CONVERSATIONS) };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ruthie remains usable when local storage is unavailable.
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
    } catch (error) {
      setStatus(null);
      setStatusError(error instanceof Error ? error.message : "Ruthie sağlayıcı durumu alınamadı.");
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
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Eklenti kataloğu alınamadı.");
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
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setChatError(error instanceof Error ? error.message : "ROSTA Insight yanıt veremedi.");
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [appendMessage, ensureConversationId, input, providerReady, sending]);

  const closeVoiceResources = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setVoiceStream(null);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.remove();
    }
    remoteAudioRef.current = null;
    voiceAssistantBufferRef.current = "";
    voiceUserBufferRef.current = "";
  }, []);

  useEffect(() => () => closeVoiceResources(), [closeVoiceResources]);

  const finishAssistantVoiceMessage = useCallback((text?: string) => {
    const finalText = (text || voiceAssistantBufferRef.current).trim();
    voiceAssistantBufferRef.current = "";
    if (finalText) {
      const conversationId = ensureConversationId(finalText);
      appendMessage(conversationId, makeMessage("assistant", finalText, "voice"));
      setVoiceAssistantText(finalText);
    }
    setVoicePhase("listening");
  }, [appendMessage, ensureConversationId]);

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    const type = event.type || "";
    if (type === "session.created" || type === "session.updated") setVoicePhase("listening");
    else if (type === "input_audio_buffer.speech_started") {
      voiceUserBufferRef.current = "";
      setVoiceUserText("");
      setVoiceAssistantText("");
      setVoicePhase("listening");
    } else if (type === "input_audio_buffer.speech_stopped") setVoicePhase("thinking");
    else if (type === "conversation.item.input_audio_transcription.delta") {
      voiceUserBufferRef.current += event.delta || "";
      setVoiceUserText(voiceUserBufferRef.current);
    } else if (type === "conversation.item.input_audio_transcription.completed") {
      const transcript = (event.transcript || voiceUserBufferRef.current).trim();
      voiceUserBufferRef.current = "";
      if (transcript) {
        const conversationId = ensureConversationId(transcript);
        appendMessage(conversationId, makeMessage("user", transcript, "voice"));
        setVoiceUserText(transcript);
      }
      setVoicePhase("thinking");
    } else if (type === "response.output_audio.delta" || type === "response.audio.delta") setVoicePhase("speaking");
    else if (type === "response.output_audio_transcript.delta" || type === "response.audio_transcript.delta") {
      voiceAssistantBufferRef.current += event.delta || "";
      setVoiceAssistantText(voiceAssistantBufferRef.current);
      setVoicePhase("speaking");
    } else if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
      finishAssistantVoiceMessage(event.transcript);
    } else if (type === "response.done" && voiceAssistantBufferRef.current.trim()) finishAssistantVoiceMessage();
    else if (type === "error") {
      setVoiceError(event.error?.message || "Sesli bağlantıda bir hata oluştu.");
      setVoicePhase("error");
    }
  }, [appendMessage, ensureConversationId, finishAssistantVoiceMessage]);

  const startVoice = useCallback(async () => {
    if (!voiceReady || voicePhase === "connecting") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setVoiceError("Bu tarayıcı canlı sesli görüşmeyi desteklemiyor.");
      setVoicePhase("error");
      return;
    }

    closeVoiceResources();
    setVoiceError(null);
    setVoiceUserText("");
    setVoiceAssistantText("");
    setMicMuted(false);
    setVoicePhase("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const pc = new RTCPeerConnection();
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      const dataChannel = pc.createDataChannel("oai-events");
      mediaStreamRef.current = stream;
      setVoiceStream(stream);
      peerRef.current = pc;
      dataChannelRef.current = dataChannel;
      remoteAudioRef.current = audio;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => undefined);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
          setVoiceError("Sesli bağlantı kesildi. Tekrar bağlanabilirsin.");
          setVoicePhase("error");
        }
      };
      dataChannel.onmessage = (messageEvent) => {
        try { handleRealtimeEvent(JSON.parse(String(messageEvent.data)) as RealtimeEvent); } catch { /* keep the call alive */ }
      };
      dataChannel.onopen = () => {
        const conversation = conversationsRef.current.find((item) => item.id === activeIdRef.current);
        const context = conversation?.messages
          .slice(-12)
          .map((message) => `${message.role === "user" ? "Kullanıcı" : "Ruthie"}: ${message.text}`)
          .join("\n")
          .slice(0, 6_000);
        if (context) {
          dataChannel.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: `Önceki yazılı sohbet bağlamını yanıt vermeden hatırla:\n${context}` }],
            },
          }));
        }
        setVoicePhase("listening");
      };
      dataChannel.onerror = () => {
        setVoiceError("Sesli görüşme veri kanalı açılamadı.");
        setVoicePhase("error");
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);
      const localSdp = pc.localDescription?.sdp;
      if (!localSdp) throw new Error("Tarayıcı ses bağlantısı oluşturamadı.");
      const authHeaders = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/openai/realtime", {
        method: "POST",
        cache: "no-store",
        headers: { ...authHeaders, "Content-Type": "application/sdp", "x-correlation-id": makeId("voice") },
        body: localSdp,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message || "Ruthie sesli bağlantısı başlatılamadı.");
      }
      const answerSdp = await response.text();
      if (!answerSdp.trim().startsWith("v=0")) throw new Error("Ses sunucusu geçerli bağlantı yanıtı vermedi.");
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (error) {
      closeVoiceResources();
      setVoiceError(error instanceof Error ? error.message : "Ruthie sesli bağlantısı başlatılamadı.");
      setVoicePhase("error");
    }
  }, [closeVoiceResources, handleRealtimeEvent, voicePhase, voiceReady]);

  const endVoice = useCallback(() => {
    closeVoiceResources();
    setVoicePhase("idle");
    setVoiceError(null);
    setVoiceUserText("");
    setVoiceAssistantText("");
    setMicMuted(false);
  }, [closeVoiceResources]);

  const toggleMicrophone = () => {
    const nextMuted = !micMuted;
    mediaStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setMicMuted(nextMuted);
  };

  const filteredConversations = useMemo(() => {
    const query = historyQuery.trim().toLocaleLowerCase("tr-TR");
    if (!query) return conversations;
    return conversations.filter((conversation) => conversation.title.toLocaleLowerCase("tr-TR").includes(query)
      || conversation.messages.some((message) => message.text.toLocaleLowerCase("tr-TR").includes(query)));
  }, [conversations, historyQuery]);

  const enabledTools = catalog?.tools.filter((tool) => tool.enabled) || [];
  const voiceLabel = voicePhase === "connecting" ? "Bağlanıyor"
    : voicePhase === "thinking" ? "Düşünüyor"
      : voicePhase === "speaking" ? "Ruthie konuşuyor"
        : voicePhase === "error" ? "Bağlantı kurulamadı" : micMuted ? "Mikrofon kapalı" : "Seni dinliyor";
  const voiceHeadline = voicePhase === "connecting" ? "ROSTA Insight hazırlanıyor"
    : voicePhase === "error" ? "Bağlantıyı yeniden deneyelim"
      : voiceAssistantText || voiceUserText || "Konuşmaya başlayabilirsin";

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
            <button type="button" onClick={() => void startVoice()} disabled={!voiceReady}><Headphones aria-hidden="true" /><span>Sesli asistan</span></button>
          </nav>
          <div className={styles.capabilityStrip}>
            <span className={panelReadReady ? styles.capabilityReady : ""}><ShieldCheck aria-hidden="true" /> Panel</span>
            <span className={webSearchReady ? styles.capabilityReady : ""}><Globe2 aria-hidden="true" /> Web</span>
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
          <div className={styles.historyFooter}><span className={`${styles.statusDot} ${providerReady ? styles.online : ""}`} /><div><strong>{providerReady ? "Ruthie hazır" : "OpenAI bağlantısı yok"}</strong><small>{modelLabel} · panel + web</small></div></div>
        </aside>

        <main className={styles.chatMain}>
          <header className={styles.chatTopbar}>
            <button className={styles.historyToggle} type="button" onClick={() => setHistoryOpen(true)} aria-label="Konuşma geçmişini aç"><Menu aria-hidden="true" /></button>
            <button className={styles.modelButton} type="button" onClick={() => setAppsOpen(true)}><span>Ruthie</span><small>{modelLabel}</small><ChevronDown aria-hidden="true" /></button>
            <div className={styles.liveCapabilities} aria-label="Aktif Ruthie yetenekleri">
              <span><ShieldCheck aria-hidden="true" /> Panel erişimi</span>
              <span><Globe2 aria-hidden="true" /> Web arama</span>
            </div>
            <div className={styles.topbarActions}>
              <button type="button" onClick={() => setAppsOpen(true)} aria-label="Eklentileri aç"><AppWindow aria-hidden="true" /><span>Araçlar</span></button>
              <button className={styles.voiceTopButton} type="button" onClick={() => void startVoice()} disabled={!voiceReady} aria-label="Sesli asistanı başlat"><Waves aria-hidden="true" /><span>Voice</span></button>
            </div>
          </header>

          <div className={styles.messages} aria-live="polite" aria-busy={sending}>
            {!messages.length ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyMark}><Sparkles aria-hidden="true" /></span>
                <h1>Bugün ne üzerinde çalışalım?</h1>
                <p>Canlı panel verisini analiz edebilir, webde araştırma yapabilir ve aynı sohbeti sesli olarak sürdürebilirim.</p>
                <div className={styles.emptyBadges}><span><ShieldCheck aria-hidden="true" /> Canlı panel analizi</span><span><Globe2 aria-hidden="true" /> Web Search</span><span><Waves aria-hidden="true" /> Realtime Voice</span></div>
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
              <button className={styles.composerIconButton} type="button" onClick={() => void startVoice()} disabled={!voiceReady} aria-label="Sesli asistanı başlat"><Mic aria-hidden="true" /></button>
              {sending ? <button className={styles.sendButton} type="button" onClick={() => { abortRef.current?.abort(); setSending(false); }} aria-label="Yanıtı durdur"><Square aria-hidden="true" /></button> : <button className={styles.sendButton} type="submit" disabled={!canSend} aria-label="Mesaj gönder"><Send aria-hidden="true" /></button>}
            </form>
            <div className={styles.composerMeta}><span><ShieldCheck aria-hidden="true" /> Panel analizi aktif · <Globe2 aria-hidden="true" /> Web Search aktif</span><div><button type="button" onClick={clearConversation} disabled={!messages.length}><Trash2 aria-hidden="true" /> Temizle</button><button type="button" onClick={createNewConversation}><MessageSquarePlus aria-hidden="true" /> Yeni sohbet</button></div></div>
          </div>
        </main>
      </div>

      <Drawer open={appsOpen} side="right" title="Eklentiler ve araçlar" description="Canlı çalışan panel okuma araçları ve bağlantılar." onClose={() => setAppsOpen(false)}>
        <div className={styles.appsSummary}>
          <div><strong>{catalog?.summary.connectedConnectorCount ?? 0}</strong><span>Bağlı eklenti</span></div>
          <div><strong>{catalog?.summary.enabledToolCount ?? 0}</strong><span>Aktif araç</span></div>
          <div><strong>{catalog?.summary.toolCount ?? 0}</strong><span>Toplam araç</span></div>
        </div>
        <div className={styles.appsBody}>
          <section className={styles.activeToolsSection}><header><div><strong>Aktif yetenekler</strong><span>Salt okunur analiz araçları doğrudan kullanılabilir.</span></div><ShieldCheck aria-hidden="true" /></header><div>{enabledTools.map((tool) => <article key={tool.id}><span>{tool.id === "openai.web_search" ? <Globe2 aria-hidden="true" /> : <Check aria-hidden="true" />}</span><div><strong>{tool.title}</strong><p>{tool.description}</p></div></article>)}</div></section>
          {catalogLoading ? <div className={styles.appsLoading}><LoaderCircle aria-hidden="true" /> Eklentiler yükleniyor</div> : <div className={styles.connectorGrid}>{(catalog?.connectors || []).map((connector) => <article className={styles.connectorCard} key={connector.key}><span className={styles.connectorIcon}>{connectorIcon(connector.key)}</span><div><div className={styles.connectorTitle}><strong>{connector.title}</strong>{connector.connected ? <span className={styles.connectedBadge}><Check aria-hidden="true" /> Bağlı</span> : null}</div><p>{connector.capabilities.slice(0, 3).map((item) => item.replaceAll("_", " ")).join(" · ")}</p><small>{connector.category} · {connector.auth.replaceAll("_", " ")}</small></div><button type="button" disabled>{connector.connected ? "Aktif" : "Bağlantı sırada"}</button></article>)}</div>}
          <div className={styles.toolsNotice}><ShieldCheck aria-hidden="true" /><div><strong>Panel analizi açık</strong><p>Ruthie artık sipariş, ürün, varyant, stok, müşteri, iade ve checkout özetlerini canlı okuyup analiz eder. Değişiklik yapan komutlar güvenli onay kapısında kalır.</p></div></div>
        </div>
      </Drawer>

      <FullscreenOverlay
        open={voicePhase !== "idle"}
        title="Ruthie sesli asistan"
        onClose={endVoice}
        closeOnBackdrop={false}
        showCloseButton={false}
        className={styles.voiceOverlayRoot}
        panelClassName={styles.voiceOverlay}
      >
        <div className={styles.voiceShell}>
          <header className={styles.voiceHeader}>
            <div className={styles.voiceIdentity}><span><Sparkles aria-hidden="true" /></span><div><strong>Ruthie Voice</strong><small>{status?.models?.realtime || "gpt-realtime"}</small></div></div>
            <div className={styles.voiceHeaderStatus}><span className={voicePhase === "error" ? styles.voiceStatusError : ""} /><strong>{voiceLabel}</strong></div>
            <button type="button" onClick={endVoice} aria-label="Sesli asistanı kapat"><X aria-hidden="true" /></button>
          </header>

          <main className={styles.voiceStage}>
            <div className={styles.orbWrap} data-phase={voicePhase}>
              <RuthieVoiceOrb phase={voicePhase === "idle" ? "connecting" : voicePhase} stream={voiceStream} muted={micMuted} />
              <div className={styles.orbCoreMark}><Sparkles aria-hidden="true" /></div>
            </div>
            <div className={styles.voiceCopy}>
              <small>{voiceLabel}</small>
              <h2>{voiceHeadline}</h2>
              {voiceUserText && voiceAssistantText ? <p><strong>Sen:</strong> {voiceUserText}</p> : <p>Ruthie canlı panel bağlamını biliyor; konuşarak analiz isteyebilirsin.</p>}
              {voiceError ? <div className={styles.voiceError}><AlertCircle aria-hidden="true" /><span>{voiceError}</span></div> : null}
            </div>
          </main>

          <footer className={styles.voiceControls}>
            <button type="button" onClick={toggleMicrophone} className={micMuted ? styles.mutedControl : ""} disabled={voicePhase === "connecting"}><span>{micMuted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}</span><strong>{micMuted ? "Mikrofon kapalı" : "Mikrofon"}</strong></button>
            {voicePhase === "error" ? <button type="button" onClick={() => void startVoice()} className={styles.retryVoiceButton}><span><RotateCcw aria-hidden="true" /></span><strong>Tekrar bağlan</strong></button> : <div className={styles.voiceCenterStatus}><Waves aria-hidden="true" /><span>{voiceLabel}</span></div>}
            <button type="button" onClick={endVoice} className={styles.endVoiceButton}><span><PhoneOff aria-hidden="true" /></span><strong>Bitir</strong></button>
          </footer>
        </div>
      </FullscreenOverlay>
    </section>
  );
}
