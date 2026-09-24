"use client";

import Link from "next/link";
import {
  AlertCircle,
  Camera,
  Check,
  Clock3,
  FileText,
  Globe2,
  Headphones,
  Image as ImageIcon,
  LoaderCircle,
  Menu,
  MessageSquarePlus,
  Paperclip,
  Plus,
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
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import { RuthieVoiceOrb } from "./RuthieVoiceOrb";
import styles from "./RuthieChatWorkspace.module.css";

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
type Conversation = { id: string; title: string; createdAt: string; updatedAt: string; messages: Message[] };
type ProviderStatus = { ok?: boolean; configured?: boolean; models?: { chat?: string | null }; capabilities?: { chat?: boolean } };
type ChatPayload = {
  ok: boolean;
  response?: { text: string; webSearchUsed?: boolean; sources?: WebSource[]; pendingAction?: PendingAction };
  error?: { message?: string };
};

const STORAGE_KEY = "ruthie_chat_workspace_v1";
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
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Conversation => Boolean(item && typeof item === "object" && typeof (item as Conversation).id === "string" && Array.isArray((item as Conversation).messages))).slice(0, MAX_CONVERSATIONS);
  } catch {
    return [];
  }
}
function formatSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}
function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Dosya okunamadı."));
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });
}

export function RuthieChatWorkspace() {
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
    setReady(true);
    const previousBackground = document.body.style.background;
    const previousOverflow = document.body.style.overflow;
    document.body.style.background = "var(--ruth-color-text-primary)";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.background = previousBackground;
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS))); } catch { /* optional */ }
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
  const modelLabel = status?.models?.chat || "gpt-5.6";
  const filtered = useMemo(() => {
    const query = historyQuery.trim().toLocaleLowerCase("tr-TR");
    if (!query) return conversations;
    return conversations.filter((conversation) => conversation.title.toLocaleLowerCase("tr-TR").includes(query) || conversation.messages.some((item) => item.text.toLocaleLowerCase("tr-TR").includes(query)));
  }, [conversations, historyQuery]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: messages.length > 1 ? "smooth" : "auto", block: "end" }); }, [messages.length, sending]);

  const updateConversation = useCallback((conversationId: string, updater: (conversation: Conversation) => Conversation) => {
    setConversations((current) => current.map((conversation) => conversation.id === conversationId ? updater(conversation) : conversation)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
  }, []);
  const append = useCallback((conversationId: string, nextMessage: Message) => {
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      title: conversation.title === "Yeni sohbet" && nextMessage.role === "user" ? titleFrom(nextMessage.text) : conversation.title,
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

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setAttachmentMenuOpen(false);
    try {
      const selected = Array.from(files);
      const combined = [...attachments];
      for (const file of selected) {
        if (combined.length >= MAX_ATTACHMENTS) throw new Error(`En fazla ${MAX_ATTACHMENTS} dosya ekleyebilirsin.`);
        if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} en fazla 8 MB olabilir.`);
        if (combined.reduce((sum, item) => sum + item.size, 0) + file.size > MAX_TOTAL_BYTES) throw new Error("Dosyaların toplamı 20 MB'ı geçemez.");
        combined.push({ id: makeId("attachment"), name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, dataUrl: await readAsDataUrl(file) });
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
      id: makeId("message"), role: "user", text: displayText, createdAt: new Date().toISOString(),
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
        headers: { ...headers, "Content-Type": "application/json", "x-correlation-id": makeId("chat") },
        body: JSON.stringify({
          messages: [...existing, { role: "user", text: displayText }].slice(-MAX_MESSAGES).map((item) => ({ role: item.role, text: item.text })),
          attachments: sentAttachments.map((item) => ({ name: item.name, mimeType: item.mimeType, dataUrl: item.dataUrl })),
        }),
      });
      const payload = await response.json().catch(() => null) as ChatPayload | null;
      if (!response.ok || !payload?.ok || !payload.response?.text) throw new Error(payload?.error?.message || "ROSTA Insight yanıt veremedi.");
      append(conversationId, {
        id: makeId("message"), role: "assistant", text: payload.response.text, createdAt: new Date().toISOString(),
        webSearchUsed: payload.response.webSearchUsed, sources: payload.response.sources,
        pendingAction: payload.response.pendingAction, actionState: payload.response.pendingAction ? "pending" : undefined,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ROSTA Insight yanıt veremedi.");
    } finally {
      setSending(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [append, attachments, ensureConversation, input, providerReady, sending]);

  const executeAction = useCallback(async (conversationId: string, messageId: string, action: PendingAction) => {
    updateConversation(conversationId, (conversation) => ({ ...conversation, messages: conversation.messages.map((item) => item.id === messageId ? { ...item, actionState: "executing", actionError: undefined } : item) }));
    try {
      const headers = await adminAuthHeaders();
      const response = await fetch("/api/ruthie/admin/execute", { method: "POST", cache: "no-store", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ token: action.token }) });
      const payload = await response.json().catch(() => null) as { ok?: boolean; result?: { title?: string; error?: string }; error?: { message?: string } } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.result?.error || payload?.error?.message || "Panel işlemi uygulanamadı.");
      updateConversation(conversationId, (conversation) => ({ ...conversation, messages: conversation.messages.map((item) => item.id === messageId ? { ...item, actionState: "completed" } : item) }));
      append(conversationId, { id: makeId("message"), role: "assistant", text: `${payload.result?.title || action.title} tamamlandı.`, createdAt: new Date().toISOString() });
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Panel işlemi uygulanamadı.";
      updateConversation(conversationId, (conversation) => ({ ...conversation, messages: conversation.messages.map((item) => item.id === messageId ? { ...item, actionState: "failed", actionError: text } : item) }));
    }
  }, [append, updateConversation]);

  const submit = (event: FormEvent) => { event.preventDefault(); void sendMessage(); };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } };
  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => { void addFiles(event.target.files); event.target.value = ""; };

  return (
    <section className={styles.app}>
      <button className={`${styles.scrim} ${sidebarOpen ? styles.scrimOpen : ""}`} type="button" onClick={() => setSidebarOpen(false)} aria-label="Geçmişi kapat" />
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`} aria-label="ROSTA Insight Chat menüsü">
        <header><div><span><Sparkles /></span><strong>ROSTA Insight Chat</strong></div><button type="button" onClick={() => setSidebarOpen(false)} aria-label="Menüyü kapat"><X /></button></header>
        <button className={styles.newChat} type="button" onClick={createChat}><MessageSquarePlus /><span>Yeni sohbet</span></button>
        <label className={styles.search}><Search /><input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Geçmişte ara" /></label>
        <div className={styles.capabilities}><span><ShieldCheck /> Admin</span><span><Globe2 /> Web</span><span><Paperclip /> Dosya</span></div>
        <div className={styles.historyLabel}><span>Konuşmalar</span><small>{conversations.length}</small></div>
        <nav className={styles.historyList}>{filtered.map((conversation) => <div className={`${styles.historyItem} ${conversation.id === activeId ? styles.historyActive : ""}`} key={conversation.id}><button type="button" onClick={() => { setActiveId(conversation.id); activeIdRef.current = conversation.id; setSidebarOpen(false); }}><strong>{conversation.title}</strong><small><Clock3 /> {dateLabel(conversation.updatedAt)}</small></button><button type="button" aria-label="Konuşmayı sil" onClick={() => deleteChat(conversation.id)}><Trash2 /></button></div>)}</nav>
        <footer><span className={providerReady ? styles.online : ""} /><div><strong>{providerReady ? "Ruthie hazır" : "Bağlantı yok"}</strong><small>{modelLabel} · admin + web + dosya</small></div></footer>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}><button type="button" onClick={() => setSidebarOpen(true)} aria-label="Menüyü aç"><Menu /></button><div><strong>ROSTA Insight Chat</strong><small>{modelLabel}</small></div><Link href="/ruthie" aria-label="Sesli ROSTA Insight'a geç"><Headphones /><span>Ruthie</span></Link><Link href="/" aria-label="Panele dön"><X /></Link></header>
        <div className={styles.messages} aria-live="polite">
          {!messages.length ? <div className={styles.empty}><div className={styles.emptyOrb}><RuthieVoiceOrb phase="connecting" muted={true} compact showWaveform={false} /></div><small className={styles.emptyEyebrow}>RUTHIE COMMERCE ASSISTANT</small><h1>Bugün ne yapalım?</h1><p>Paneli yönetebilir, webde araştırabilir, fotoğraf ve belgeleri inceleyebilirim.</p><div>{suggestions.map((item) => <button key={item} type="button" onClick={() => void sendMessage(item)}>{item}<Sparkles /></button>)}</div></div> : <div className={styles.thread}>{messages.map((item) => <article className={`${styles.message} ${item.role === "user" ? styles.userMessage : styles.assistantMessage}`} key={item.id}>{item.role === "assistant" ? <span className={styles.avatar}><Sparkles /></span> : null}<div className={styles.bubble}>{item.role === "assistant" ? <strong>Ruthie</strong> : null}<p>{item.text}</p>{item.attachments?.length ? <div className={styles.messageAttachments}>{item.attachments.map((attachment) => <span key={attachment.id}>{attachment.mimeType.startsWith("image/") ? <ImageIcon /> : <FileText />}<b>{attachment.name}</b><small>{formatSize(attachment.size)}</small></span>)}</div> : null}{item.pendingAction ? <div className={`${styles.actionCard} ${styles[`action_${item.actionState || "pending"}`]}`}><header><span>{item.actionState === "completed" ? <Check /> : item.actionState === "failed" ? <XCircle /> : <ShieldCheck />}</span><div><strong>{item.pendingAction.title}</strong><small>{item.pendingAction.risk === "critical" ? "Kritik işlem" : "Panel değişikliği"}</small></div></header><p>{item.pendingAction.summary}</p>{item.actionError ? <em>{item.actionError}</em> : null}<footer>{item.actionState === "pending" ? <><button type="button" onClick={() => void executeAction(activeConversation!.id, item.id, item.pendingAction!)}>Onayla ve uygula</button><button type="button" onClick={() => updateConversation(activeConversation!.id, (conversation) => ({ ...conversation, messages: conversation.messages.map((message) => message.id === item.id ? { ...message, actionState: "cancelled" } : message) }))}>İptal</button></> : item.actionState === "executing" ? <span><LoaderCircle /> Uygulanıyor</span> : <span>{item.actionState === "completed" ? "İşlem tamamlandı" : item.actionState === "cancelled" ? "İşlem iptal edildi" : "İşlem başarısız"}</span>}</footer></div> : null}{item.webSearchUsed ? <small className={styles.webBadge}><Globe2 /> Web araştırması</small> : null}{item.sources?.length ? <div className={styles.sources}>{item.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div> : null}</div></article>)}{sending ? <article className={`${styles.message} ${styles.assistantMessage}`}><span className={styles.avatar}><Sparkles /></span><div className={styles.bubble}><strong>Ruthie</strong><div className={styles.typing}><span /><span /><span /></div></div></article> : null}</div>}
          <div ref={bottomRef} />
        </div>
        {error ? <div className={styles.error}><AlertCircle /><span>{error}</span><button type="button" onClick={() => setError(null)}>Kapat</button></div> : null}
        <div className={styles.composerArea}>
          {attachments.length ? <div className={styles.pendingAttachments}>{attachments.map((attachment) => <span key={attachment.id}>{attachment.mimeType.startsWith("image/") ? <ImageIcon /> : <FileText />}<b>{attachment.name}</b><small>{formatSize(attachment.size)}</small><button type="button" onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))} aria-label={`${attachment.name} dosyasını kaldır`}><X /></button></span>)}</div> : null}
          <form className={styles.composer} onSubmit={submit}>
            <div className={styles.attachWrap}><button className={styles.plusButton} type="button" onClick={() => setAttachmentMenuOpen((open) => !open)} aria-label="Fotoğraf veya dosya ekle" aria-expanded={attachmentMenuOpen}><Plus /></button>{attachmentMenuOpen ? <div className={styles.attachMenu}><button type="button" onClick={() => imageInputRef.current?.click()}><Camera /> Fotoğraf veya kamera</button><button type="button" onClick={() => fileInputRef.current?.click()}><FileText /> Dosya seç</button></div> : null}</div>
            <textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={keyDown} placeholder={providerReady ? "ROSTA Insight'a mesaj gönder" : "OpenAI bağlantısı hazır değil"} disabled={!providerReady} rows={1} />
            <button className={styles.sendButton} type="submit" disabled={!providerReady || (!input.trim() && !attachments.length) || sending} aria-label="Gönder"><Send /></button>
          </form>
          <input ref={imageInputRef} className={styles.hiddenInput} type="file" accept="image/*" multiple capture="environment" onChange={selectFiles} />
          <input ref={fileInputRef} className={styles.hiddenInput} type="file" accept={FILE_ACCEPT} multiple onChange={selectFiles} />
        </div>
      </main>
    </section>
  );
}
