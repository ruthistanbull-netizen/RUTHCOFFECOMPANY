"use client";

import Link from "next/link";
import {
  AlertCircle,
  Box,
  Camera,
  Check,
  Clock3,
  Eye,
  FileText,
  Globe2,
  Image as ImageIcon,
  LoaderCircle,
  Menu,
  MessageSquarePlus,
  PackageSearch,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import { RUTHIE_CHAT_LOGO_DATA_URI } from "./RuthieChatLogoData";
import { RuthieChatVoiceCore } from "./RuthieChatVoiceCore";
import styles from "./RuthieChatWorkspaceV2.module.css";

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
type AttachmentMeta = { id: string; name: string; mimeType: string; size: number };
type PendingAttachment = AttachmentMeta & { dataUrl: string };
type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  attachments?: AttachmentMeta[];
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
  models?: { chat?: string | null };
  capabilities?: { chat?: boolean };
};
type ChatPayload = {
  ok: boolean;
  response?: {
    text: string;
    webSearchUsed?: boolean;
    sources?: WebSource[];
    pendingAction?: PendingAction;
  };
  error?: { message?: string };
};
type PluginDefinition = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const STORAGE_KEY = "ruthie_chat_workspace_v2";
const PLUGIN_STORAGE_KEY = "ruthie_chat_plugins_v1";
const MAX_MESSAGES = 40;
const MAX_CONVERSATIONS = 60;
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const FILE_ACCEPT = "image/*,.pdf,.txt,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx";

const suggestions = [
  "Bugünkü siparişleri analiz et ve acil olanları sırala.",
  "Stoku azalan ürünleri bul.",
  "Yeni bir manuel sipariş oluşturalım.",
  "Eklediğim belgeyi incele ve özetle.",
];

const plugins: PluginDefinition[] = [
  { id: "admin", label: "Admin", description: "Panel işlemleri", icon: ShieldCheck },
  { id: "web", label: "Web", description: "Canlı araştırma", icon: Globe2 },
  { id: "files", label: "Dosya", description: "Belge analizi", icon: Paperclip },
  { id: "vision", label: "Vision", description: "Fotoğraf ve kamera", icon: Eye },
  { id: "orders", label: "Sipariş", description: "Sipariş operasyonu", icon: PackageSearch },
  { id: "products", label: "Ürün", description: "Katalog ve stok", icon: Box },
  { id: "returns", label: "İade", description: "İade ve değişim", icon: RotateCcw },
];

const adminActions = [
  { href: "/orders", icon: PackageSearch, title: "Siparişleri incele", description: "Canlı sipariş ve operasyon ekranı" },
  { href: "/returns", icon: RotateCcw, title: "İade talepleri", description: "Bekleyen iade ve değişim akışları" },
  { href: "/products", icon: Box, title: "Ürün ve stok", description: "Katalog ve stok durumunu yönet" },
] as const;

function makeId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function newConversation(): Conversation {
  const now = new Date().toISOString();
  return { id: makeId("conversation"), title: "Yeni sohbet", createdAt: now, updatedAt: now, messages: [] };
}

function titleFrom(text: string) {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length > 46 ? `${value.slice(0, 46).trim()}…` : value || "Dosya inceleme";
}

function dateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Bugün";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(date);
}

function readStored(): Conversation[] {
  try {
    const current = window.localStorage.getItem(STORAGE_KEY);
    const legacy = window.localStorage.getItem("ruthie_chat_workspace_v1");
    const parsed = JSON.parse(current || legacy || "null") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Conversation => Boolean(
        item
        && typeof item === "object"
        && typeof (item as Conversation).id === "string"
        && Array.isArray((item as Conversation).messages),
      ))
      .slice(0, MAX_CONVERSATIONS);
  } catch {
    return [];
  }
}

function readPlugins() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLUGIN_STORAGE_KEY) || "null") as unknown;
    if (!Array.isArray(parsed)) return plugins.map((plugin) => plugin.id);
    const allowed = new Set(plugins.map((plugin) => plugin.id));
    return parsed.filter((item): item is string => typeof item === "string" && allowed.has(item));
  } catch {
    return plugins.map((plugin) => plugin.id);
  }
}

function formatSize(size: number) {
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Dosya okunamadı."));
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });
}

export function RuthieChatWorkspaceV2() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [enabledPlugins, setEnabledPlugins] = useState<string[]>(plugins.map((plugin) => plugin.id));
  const [mobileLayout, setMobileLayout] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = readStored();
    const list = stored.length ? stored : [newConversation()];
    conversationsRef.current = list;
    activeIdRef.current = list[0].id;
    setConversations(list);
    setActiveId(list[0].id);
    setEnabledPlugins(readPlugins());
    setReady(true);

    const media = window.matchMedia("(max-width: 980px)");
    const syncLayout = () => setMobileLayout(media.matches);
    syncLayout();
    media.addEventListener("change", syncLayout);

    const previousBackground = document.body.style.background;
    const previousOverflow = document.body.style.overflow;
    document.body.style.background = "#050403";
    document.body.style.overflow = "hidden";

    return () => {
      media.removeEventListener("change", syncLayout);
      document.body.style.background = previousBackground;
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)));
    } catch {
      // Storage is optional.
    }
  }, [conversations, ready]);
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(PLUGIN_STORAGE_KEY, JSON.stringify(enabledPlugins));
    } catch {
      // Storage is optional.
    }
  }, [enabledPlugins, ready]);

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

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeId) || null,
    [activeId, conversations],
  );
  const messages = activeConversation?.messages || [];
  const providerReady = Boolean(status?.configured && status.capabilities?.chat);
  const modelLabel = status?.models?.chat || "gpt-5.6";
  const filtered = useMemo(() => {
    const query = historyQuery.trim().toLocaleLowerCase("tr-TR");
    if (!query) return conversations;
    return conversations.filter((conversation) => (
      conversation.title.toLocaleLowerCase("tr-TR").includes(query)
      || conversation.messages.some((item) => item.text.toLocaleLowerCase("tr-TR").includes(query))
    ));
  }, [conversations, historyQuery]);
  const voiceContext = useMemo(
    () => messages.slice(-16).map((item) => `${item.role === "user" ? "Kullanıcı" : "ROSTA Insight"}: ${item.text}`).join("\n"),
    [messages],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: messages.length > 1 ? "smooth" : "auto",
      block: "end",
    });
  }, [messages.length, sending]);

  const updateConversation = useCallback((
    conversationId: string,
    updater: (conversation: Conversation) => Conversation,
  ) => {
    setConversations((current) => current
      .map((conversation) => conversation.id === conversationId ? updater(conversation) : conversation)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
  }, []);

  const append = useCallback((conversationId: string, nextMessage: Message) => {
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      title: conversation.title === "Yeni sohbet" && nextMessage.role === "user"
        ? titleFrom(nextMessage.text)
        : conversation.title,
      updatedAt: nextMessage.createdAt,
      messages: [...conversation.messages, nextMessage].slice(-MAX_MESSAGES),
    }));
  }, [updateConversation]);

  const ensureConversation = useCallback(() => {
    const current = activeIdRef.current;
    if (current && conversationsRef.current.some((conversation) => conversation.id === current)) return current;
    const fresh = newConversation();
    conversationsRef.current = [fresh, ...conversationsRef.current];
    activeIdRef.current = fresh.id;
    setConversations((items) => [fresh, ...items]);
    setActiveId(fresh.id);
    return fresh.id;
  }, []);

  const createChat = useCallback(() => {
    const fresh = newConversation();
    conversationsRef.current = [fresh, ...conversationsRef.current].slice(0, MAX_CONVERSATIONS);
    setConversations(conversationsRef.current);
    setActiveId(fresh.id);
    activeIdRef.current = fresh.id;
    setSidebarOpen(false);
    setAttachments([]);
    setInput("");
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  const deleteChat = useCallback((conversationId: string) => {
    const remaining = conversationsRef.current.filter((conversation) => conversation.id !== conversationId);
    const next = remaining.length ? remaining : [newConversation()];
    conversationsRef.current = next;
    setConversations(next);
    if (activeIdRef.current === conversationId) {
      activeIdRef.current = next[0].id;
      setActiveId(next[0].id);
    }
  }, []);

  const togglePlugin = (pluginId: string) => {
    setEnabledPlugins((current) => current.includes(pluginId)
      ? current.filter((item) => item !== pluginId)
      : [...current, pluginId]);
  };

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setAttachmentMenuOpen(false);
    try {
      const selected = Array.from(files);
      const combined = [...attachments];
      for (const file of selected) {
        if (combined.length >= MAX_ATTACHMENTS) throw new Error(`En fazla ${MAX_ATTACHMENTS} dosya ekleyebilirsin.`);
        if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} en fazla 8 MB olabilir.`);
        if (combined.reduce((sum, item) => sum + item.size, 0) + file.size > MAX_TOTAL_BYTES) {
          throw new Error("Dosyaların toplamı 20 MB'ı geçemez.");
        }
        combined.push({
          id: makeId("attachment"),
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          dataUrl: await readAsDataUrl(file),
        });
      }
      setAttachments(combined);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dosya eklenemedi.");
    }
  }, [attachments]);

  const sendMessage = useCallback(async (provided?: string) => {
    const text = (provided ?? input).trim();
    if ((!text && !attachments.length) || sending || !providerReady) return;

    const conversationId = ensureConversation();
    const existing = conversationsRef.current.find((item) => item.id === conversationId)?.messages || [];
    const displayText = text || "Eklediğim dosyaları incele.";
    const sentAttachments = attachments;

    append(conversationId, {
      id: makeId("message"),
      role: "user",
      text: displayText,
      createdAt: new Date().toISOString(),
      attachments: sentAttachments.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })),
    });

    setInput("");
    setAttachments([]);
    setError(null);
    setSending(true);

    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/openai/chat", {
        method: "POST",
        cache: "no-store",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "x-correlation-id": makeId("chat"),
        },
        body: JSON.stringify({
          messages: [...existing, { role: "user", text: displayText }]
            .slice(-MAX_MESSAGES)
            .map((item) => ({ role: item.role, text: item.text })),
          attachments: sentAttachments.map((item) => ({
            name: item.name,
            mimeType: item.mimeType,
            dataUrl: item.dataUrl,
          })),
          plugins: enabledPlugins,
        }),
      });
      const payload = await response.json().catch(() => null) as ChatPayload | null;
      if (!response.ok || !payload?.ok || !payload.response?.text) {
        throw new Error(payload?.error?.message || "ROSTA Insight yanıt veremedi.");
      }
      append(conversationId, {
        id: makeId("message"),
        role: "assistant",
        text: payload.response.text,
        createdAt: new Date().toISOString(),
        webSearchUsed: payload.response.webSearchUsed,
        sources: payload.response.sources,
        pendingAction: payload.response.pendingAction,
        actionState: payload.response.pendingAction ? "pending" : undefined,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ROSTA Insight yanıt veremedi.");
    } finally {
      setSending(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [
    append,
    attachments,
    enabledPlugins,
    ensureConversation,
    input,
    providerReady,
    sending,
  ]);

  const executeAction = useCallback(async (
    conversationId: string,
    messageId: string,
    action: PendingAction,
  ) => {
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((item) => item.id === messageId
        ? { ...item, actionState: "executing", actionError: undefined }
        : item),
    }));
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/admin/execute", {
        method: "POST",
        cache: "no-store",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ token: action.token }),
      });
      const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        result?: { title?: string; error?: string };
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.result?.error || payload?.error?.message || "Panel işlemi uygulanamadı.");
      }
      updateConversation(conversationId, (conversation) => ({
        ...conversation,
        messages: conversation.messages.map((item) => item.id === messageId
          ? { ...item, actionState: "completed" }
          : item),
      }));
      append(conversationId, {
        id: makeId("message"),
        role: "assistant",
        text: `${payload.result?.title || action.title} tamamlandı.`,
        createdAt: new Date().toISOString(),
      });
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Panel işlemi uygulanamadı.";
      updateConversation(conversationId, (conversation) => ({
        ...conversation,
        messages: conversation.messages.map((item) => item.id === messageId
          ? { ...item, actionState: "failed", actionError: text }
          : item),
      }));
    }
  }, [append, updateConversation]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage();
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };
  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    void addFiles(event.target.files);
    event.target.value = "";
  };

  return (
    <section className={styles.app}>
      <button
        className={`${styles.scrim} ${sidebarOpen ? styles.scrimOpen : ""}`}
        type="button"
        onClick={() => setSidebarOpen(false)}
        aria-label="Menüyü kapat"
      />

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`} aria-label="ROSTA Insight Chat menüsü">
        <header className={styles.sidebarHeader}>
          <img src={RUTHIE_CHAT_LOGO_DATA_URI} alt="ROSTA Insight Chat" />
          <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Menüyü kapat"><X /></button>
        </header>

        <button className={styles.newChat} type="button" onClick={createChat}>
          <MessageSquarePlus /><span>Yeni sohbet</span>
        </button>

        <label className={styles.search}>
          <Search />
          <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Sohbetlerde ara" />
        </label>

        <div className={styles.sectionLabel}><span>Sohbetler</span><small>{conversations.length}</small></div>
        <nav className={styles.historyList}>
          {filtered.map((conversation) => (
            <div
              className={`${styles.historyItem} ${conversation.id === activeId ? styles.historyActive : ""}`}
              key={conversation.id}
            >
              <button
                type="button"
                onClick={() => {
                  setActiveId(conversation.id);
                  activeIdRef.current = conversation.id;
                  setSidebarOpen(false);
                }}
              >
                <strong>{conversation.title}</strong>
                <small><Clock3 /> {dateLabel(conversation.updatedAt)}</small>
              </button>
              <button type="button" aria-label="Konuşmayı sil" onClick={() => deleteChat(conversation.id)}>
                <Trash2 />
              </button>
            </div>
          ))}
        </nav>

        <div className={styles.sectionLabel}><span>Eklentiler</span><small>{enabledPlugins.length}/{plugins.length}</small></div>
        <div className={styles.plugins}>
          {plugins.map(({ id, label, description, icon: Icon }) => {
            const enabled = enabledPlugins.includes(id);
            return (
              <button
                className={enabled ? styles.pluginActive : ""}
                key={id}
                type="button"
                aria-pressed={enabled}
                onClick={() => togglePlugin(id)}
              >
                <span><Icon /></span>
                <div><strong>{label}</strong><small>{description}</small></div>
                <i />
              </button>
            );
          })}
        </div>

        {mobileLayout ? (
          <div className={styles.mobileCore}>
            <RuthieChatVoiceCore compact context={voiceContext} />
          </div>
        ) : null}

        <footer className={styles.sidebarFooter}>
          <span className={providerReady ? styles.online : ""} />
          <div>
            <strong>{providerReady ? "ROSTA Insight hazır" : "Bağlantı yok"}</strong>
            <small>{modelLabel} · {enabledPlugins.length} eklenti aktif</small>
          </div>
        </footer>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Menüyü aç"><Menu /></button>
          <img src={RUTHIE_CHAT_LOGO_DATA_URI} alt="ROSTA Insight Chat" />
          <div><small>{modelLabel}</small><span>{enabledPlugins.length} eklenti</span></div>
          <Link href="/" aria-label="Panele dön"><X /></Link>
        </header>

        <div className={styles.messages} aria-live="polite">
          {!messages.length ? (
            <div className={styles.empty}>
              <small>ROSTA INSIGHT</small>
              <h1>Bugün ne yapalım?</h1>
              <p>Paneli yönetebilir, webde araştırabilir, fotoğraf ve belgeleri inceleyebilirim.</p>
              <div>
                {suggestions.map((item) => (
                  <button key={item} type="button" onClick={() => void sendMessage(item)}>
                    {item}<Sparkles />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.thread}>
              {messages.map((item) => (
                <article
                  className={`${styles.message} ${item.role === "user" ? styles.userMessage : styles.assistantMessage}`}
                  key={item.id}
                >
                  {item.role === "assistant" ? <span className={styles.avatar}><Sparkles /></span> : null}
                  <div className={styles.bubble}>
                    {item.role === "assistant" ? <strong>ROSTA Insight</strong> : null}
                    <p>{item.text}</p>

                    {item.attachments?.length ? (
                      <div className={styles.messageAttachments}>
                        {item.attachments.map((attachment) => (
                          <span key={attachment.id}>
                            {attachment.mimeType.startsWith("image/") ? <ImageIcon /> : <FileText />}
                            <b>{attachment.name}</b><small>{formatSize(attachment.size)}</small>
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {item.pendingAction ? (
                      <div className={`${styles.actionCard} ${styles[`action_${item.actionState || "pending"}`]}`}>
                        <header>
                          <span>
                            {item.actionState === "completed"
                              ? <Check />
                              : item.actionState === "failed" ? <XCircle /> : <ShieldCheck />}
                          </span>
                          <div>
                            <strong>{item.pendingAction.title}</strong>
                            <small>{item.pendingAction.risk === "critical" ? "Kritik işlem" : "Panel değişikliği"}</small>
                          </div>
                        </header>
                        <p>{item.pendingAction.summary}</p>
                        {item.actionError ? <em>{item.actionError}</em> : null}
                        <footer>
                          {item.actionState === "pending" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void executeAction(activeConversation!.id, item.id, item.pendingAction!)}
                              >
                                Onayla ve uygula
                              </button>
                              <button
                                type="button"
                                onClick={() => updateConversation(activeConversation!.id, (conversation) => ({
                                  ...conversation,
                                  messages: conversation.messages.map((message) => message.id === item.id
                                    ? { ...message, actionState: "cancelled" }
                                    : message),
                                }))}
                              >
                                İptal
                              </button>
                            </>
                          ) : item.actionState === "executing" ? (
                            <span><LoaderCircle /> Uygulanıyor</span>
                          ) : (
                            <span>
                              {item.actionState === "completed"
                                ? "İşlem tamamlandı"
                                : item.actionState === "cancelled" ? "İşlem iptal edildi" : "İşlem başarısız"}
                            </span>
                          )}
                        </footer>
                      </div>
                    ) : null}

                    {item.webSearchUsed ? <small className={styles.webBadge}><Globe2 /> Web araştırması</small> : null}
                    {item.sources?.length ? (
                      <div className={styles.sources}>
                        {item.sources.map((source) => (
                          <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
              {sending ? (
                <article className={`${styles.message} ${styles.assistantMessage}`}>
                  <span className={styles.avatar}><Sparkles /></span>
                  <div className={styles.bubble}>
                    <strong>ROSTA Insight</strong>
                    <div className={styles.typing}><span /><span /><span /></div>
                  </div>
                </article>
              ) : null}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error ? (
          <div className={styles.error}>
            <AlertCircle /><span>{error}</span>
            <button type="button" onClick={() => setError(null)}>Kapat</button>
          </div>
        ) : null}

        <div className={styles.composerArea}>
          {attachments.length ? (
            <div className={styles.pendingAttachments}>
              {attachments.map((attachment) => (
                <span key={attachment.id}>
                  {attachment.mimeType.startsWith("image/") ? <ImageIcon /> : <FileText />}
                  <b>{attachment.name}</b><small>{formatSize(attachment.size)}</small>
                  <button
                    type="button"
                    onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}
                    aria-label={`${attachment.name} dosyasını kaldır`}
                  >
                    <X />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <form className={styles.composer} onSubmit={submit}>
            <div className={styles.attachWrap}>
              <button
                className={styles.plusButton}
                type="button"
                onClick={() => setAttachmentMenuOpen((open) => !open)}
                aria-label="Fotoğraf veya dosya ekle"
                aria-expanded={attachmentMenuOpen}
              >
                <Plus />
              </button>
              {attachmentMenuOpen ? (
                <div className={styles.attachMenu}>
                  <button type="button" onClick={() => imageInputRef.current?.click()}><Camera /> Fotoğraf veya kamera</button>
                  <button type="button" onClick={() => fileInputRef.current?.click()}><FileText /> Dosya seç</button>
                </div>
              ) : null}
            </div>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={keyDown}
              placeholder={providerReady ? "ROSTA Insight'a mesaj gönder" : "OpenAI bağlantısı hazır değil"}
              disabled={!providerReady}
              rows={1}
            />
            <button
              className={styles.sendButton}
              type="submit"
              disabled={!providerReady || (!input.trim() && !attachments.length) || sending}
              aria-label="Gönder"
            >
              <Send />
            </button>
          </form>
          <input
            ref={imageInputRef}
            className={styles.hiddenInput}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={selectFiles}
          />
          <input
            ref={fileInputRef}
            className={styles.hiddenInput}
            type="file"
            accept={FILE_ACCEPT}
            multiple
            onChange={selectFiles}
          />
        </div>
      </main>

      {!mobileLayout ? (
        <aside className={styles.rail} aria-label="ROSTA Insight Neural Core ve operasyon kısayolları">
          <header className={styles.railHeader}>
            <span><Sparkles /></span>
            <div><strong>ROSTA Insight Core</strong><small>Commerce Assistant</small></div>
            <i />
          </header>

          <RuthieChatVoiceCore context={voiceContext} />

          <section className={styles.actionPanel}>
            <header><h2>Admin Actions</h2><small>Canlı geçişler</small></header>
            {adminActions.map(({ href, icon: Icon, title, description }) => (
              <Link className={styles.actionLink} href={href} key={href}>
                <span><Icon /></span>
                <div><strong>{title}</strong><small>{description}</small></div>
                <span aria-hidden="true">›</span>
              </Link>
            ))}
          </section>

          <section className={styles.activity}>
            <header><h2>Core Activity</h2><small>Durum dili</small></header>
            <svg viewBox="0 0 300 82" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 58 C20 58 24 56 35 54 S52 24 68 36 S92 66 108 48 S132 20 149 38 S174 68 190 46 S215 24 231 40 S258 58 300 29" />
            </svg>
            <div><span>Dinleme</span><span>Düşünme</span><span>İşlem</span><span>Konuşma</span></div>
          </section>

          <footer className={styles.safety}>
            <ShieldCheck />
            <div><strong>Güvenli işlem politikası</strong><small>Panel değişiklikleri kullanıcı onayıyla uygulanır.</small></div>
          </footer>
        </aside>
      ) : null}
    </section>
  );
}
