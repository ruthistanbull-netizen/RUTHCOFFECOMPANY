"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  ExternalLink,
  History,
  Menu,
  MessageCircle,
  Mic2,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { adminAuthHeaders } from "@/lib/adminApi";
import {
  activeConversationId,
  executeApprovedAction,
  makeRuthieConversationId,
  readChatConversations,
  sendRuthieChatMessage,
  setActiveConversationId,
  writeChatConversations,
  type RuthieAttachmentPayload,
  type RuthiePendingAction,
  type UnifiedClientConversation,
  type UnifiedClientMessage,
} from "./ruthieUnifiedAgentClient";
import { dispatchRuthiePresentationRequest } from "./ruthiePresentationEvents";
import { RuthieGradientOrb } from "./RuthieGradientOrb";
import styles from "./RuthieExperience.module.css";

type DisplayMessage = UnifiedClientMessage & {
  sources?: Array<{ title?: string; url: string }>;
  pendingAction?: RuthiePendingAction | null;
  actionNote?: string;
};

type DisplayConversation = Omit<UnifiedClientConversation, "messages"> & { messages: DisplayMessage[] };

type ProviderStatus = {
  ok?: boolean;
  configured?: boolean;
  models?: { chat?: string | null };
  capabilities?: { chat?: boolean };
};

type PendingFile = RuthieAttachmentPayload & { id: string };

const MAX_CONVERSATIONS = 60;
const MAX_MESSAGES = 80;
const MAX_ATTACHMENTS = 4;
const FILE_ACCEPT = "image/*,.pdf,.txt,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx";
const SUGGESTIONS = [
  "Son 5 siparişi göster",
  "Bugünkü satışları özetle",
  "Stoku azalan ürünleri bul",
  "Geciken kargoları kontrol et",
];

function now() { return new Date().toISOString(); }
function uid(prefix: string) { return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function titleFrom(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > 44 ? `${clean.slice(0, 44).trim()}…` : clean || "Yeni sohbet";
}
function dateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Bugün";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(date);
}
function blankConversation(): DisplayConversation {
  const createdAt = now();
  return {
    id: makeRuthieConversationId(),
    title: "Yeni sohbet",
    createdAt,
    updatedAt: createdAt,
    messages: [],
  };
}
function asDisplay(items: UnifiedClientConversation[]): DisplayConversation[] {
  return items.map((item) => ({ ...item, messages: item.messages as DisplayMessage[] }));
}
function asStored(items: DisplayConversation[]): UnifiedClientConversation[] {
  return items.map((conversation) => ({
    ...conversation,
    messages: conversation.messages.map(({ id, role, text, createdAt, surface }) => ({ id, role, text, createdAt, surface })),
  }));
}
function readFile(file: File): Promise<PendingFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ id: uid("file"), name: file.name, type: file.type || "application/octet-stream", dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error(`${file.name} okunamadı.`));
    reader.readAsDataURL(file);
  });
}

export function RuthieChatExperience() {
  const router = useRouter();
  const [conversations, setConversations] = useState<DisplayConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = asDisplay(readChatConversations());
    const first = stored.length ? stored : [blankConversation()];
    const requested = activeConversationId();
    const selected = first.find((item) => item.id === requested) || first[0];
    setConversations(first);
    setActiveId(selected.id);
    setActiveConversationId(selected.id);
    setReady(true);

    const previousBackground = document.body.style.background;
    const previousOverflow = document.body.style.overflow;
    document.body.style.background = "#07060a";
    document.body.style.overflow = "hidden";

    void (async () => {
      try {
        const headers = await adminAuthHeaders();
        const response = await fetch("/api/rosta-insight/openai/status", { headers, cache: "no-store" });
        const payload = await response.json() as ProviderStatus;
        if (!response.ok) throw new Error("ROSTA Insight bağlantı durumu alınamadı.");
        setProvider(payload);
      } catch {
        setProvider({ ok: false, configured: false });
      }
    })();

    return () => {
      document.body.style.background = previousBackground;
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { writeChatConversations(asStored(conversations)); } catch { /* storage is optional */ }
  }, [conversations, ready]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeId, conversations, sending]);

  const active = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) || null,
    [activeId, conversations],
  );
  const messages = active?.messages || [];
  const providerReady = Boolean(provider?.configured && provider.capabilities?.chat);
  const model = provider?.models?.chat || "ROSTA Insight";
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("tr-TR");
    if (!value) return conversations;
    return conversations.filter((conversation) => conversation.title.toLocaleLowerCase("tr-TR").includes(value));
  }, [conversations, query]);

  const updateConversation = useCallback((id: string, updater: (item: DisplayConversation) => DisplayConversation) => {
    setConversations((current) => current
      .map((item) => item.id === id ? updater(item) : item)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, MAX_CONVERSATIONS));
  }, []);

  const append = useCallback((conversationId: string, message: DisplayMessage) => {
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      title: conversation.title === "Yeni sohbet" && message.role === "user" ? titleFrom(message.text) : conversation.title,
      updatedAt: message.createdAt,
      messages: [...conversation.messages, message].slice(-MAX_MESSAGES),
    }));
  }, [updateConversation]);

  const createChat = useCallback(() => {
    const fresh = blankConversation();
    setConversations((current) => [fresh, ...current].slice(0, MAX_CONVERSATIONS));
    setActiveId(fresh.id);
    setActiveConversationId(fresh.id);
    setInput("");
    setFiles([]);
    setError(null);
    setSidebarOpen(false);
    window.setTimeout(() => textareaRef.current?.focus(), 60);
  }, []);

  const chooseChat = (id: string) => {
    setActiveId(id);
    setActiveConversationId(id);
    setSidebarOpen(false);
    setError(null);
  };

  const deleteChat = (id: string) => {
    setConversations((current) => {
      const next = current.filter((item) => item.id !== id);
      const safe = next.length ? next : [blankConversation()];
      if (activeId === id) {
        setActiveId(safe[0].id);
        setActiveConversationId(safe[0].id);
      }
      return safe;
    });
  };

  const addFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []).slice(0, MAX_ATTACHMENTS - files.length);
    event.target.value = "";
    if (!selected.length) return;
    try {
      const next = await Promise.all(selected.map(readFile));
      setFiles((current) => [...current, ...next].slice(0, MAX_ATTACHMENTS));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dosya eklenemedi.");
    }
  };

  const send = useCallback(async (forced?: string) => {
    const text = (forced ?? input).trim();
    if ((!text && !files.length) || sending) return;
    let conversation = active;
    if (!conversation) {
      conversation = blankConversation();
      const created = conversation;
      setConversations((current) => [created, ...current]);
      setActiveId(created.id);
      setActiveConversationId(created.id);
    }

    const messageText = text || "Eklediğim dosyaları incele.";
    const userMessage: DisplayMessage = {
      id: uid("user"),
      role: "user",
      text: messageText,
      createdAt: now(),
      surface: "chat",
    };
    const outgoingFiles = files.map(({ name, type, dataUrl }) => ({ name, type, dataUrl }));
    const history = conversation.messages.slice(-24).map((message) => ({ role: message.role, text: message.text }));

    append(conversation.id, userMessage);
    setInput("");
    setFiles([]);
    setSending(true);
    setError(null);
    dispatchRuthiePresentationRequest({ id: userMessage.id, text: messageText, mode: "chat" });

    try {
      const response = await sendRuthieChatMessage({
        message: messageText,
        history,
        attachments: outgoingFiles,
        threadId: conversation.id,
      });
      const assistant: DisplayMessage = {
        id: uid("assistant"),
        role: "assistant",
        text: response.message || "Tamamlandı.",
        createdAt: now(),
        surface: "chat",
        sources: response.sources,
        pendingAction: response.pendingAction,
      };
      append(conversation.id, assistant);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "ROSTA Insight yanıt veremedi.";
      setError(message);
      append(conversation.id, { id: uid("error"), role: "assistant", text: message, createdAt: now(), surface: "chat" });
    } finally {
      setSending(false);
    }
  }, [active, append, files, input, sending]);

  const approve = async (message: DisplayMessage, action: RuthiePendingAction) => {
    if (!active || executingAction) return;
    setExecutingAction(action.id);
    setError(null);
    try {
      const result = await executeApprovedAction(action);
      const note = result.message || result.summary || "İşlem tamamlandı.";
      updateConversation(active.id, (conversation) => ({
        ...conversation,
        updatedAt: now(),
        messages: conversation.messages.map((item) => item.id === message.id ? { ...item, pendingAction: null, actionNote: note } : item),
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "İşlem uygulanamadı.");
    } finally {
      setExecutingAction(null);
    }
  };

  const cancelAction = (messageId: string) => {
    if (!active) return;
    updateConversation(active.id, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((item) => item.id === messageId ? { ...item, pendingAction: null, actionNote: "İşlem iptal edildi." } : item),
    }));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <section className={styles.app} data-ruthie-experience="chat">
      <div className={styles.chatLayout}>
        <aside className={styles.sidebar} data-open={sidebarOpen ? "true" : "false"}>
          <div className={styles.brandRow}>
            <Link href="/" className={styles.brand} aria-label="ROSTA Commerce paneline dön">
              <span className={styles.brandMark} />
              <span className={styles.brandText}><strong>ROSTA Insight</strong><small>Commerce intelligence</small></span>
            </Link>
            <button className={`${styles.iconButton} ${styles.mobileToggle}`} type="button" onClick={() => setSidebarOpen(false)} aria-label="Menüyü kapat"><X /></button>
          </div>

          <button className={styles.newChat} type="button" onClick={createChat}><Plus /> Yeni sohbet</button>
          <label className={styles.searchBox}><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sohbetlerde ara" /></label>
          <div className={styles.sidebarLabel}>Geçmiş</div>
          <div className={styles.history}>
            {filtered.map((conversation) => (
              <div className={styles.historyItem} data-active={conversation.id === activeId ? "true" : "false"} key={conversation.id}>
                <button className={styles.historyMain} type="button" onClick={() => chooseChat(conversation.id)}>
                  <strong>{conversation.title}</strong><small>{dateLabel(conversation.updatedAt)}</small>
                </button>
                <button className={styles.historyDelete} type="button" onClick={() => deleteChat(conversation.id)} aria-label="Sohbeti sil"><Trash2 /></button>
              </div>
            ))}
          </div>
          <div className={styles.sidebarFooter}><span>{conversations.length} sohbet</span><Link href="/">Panele dön</Link></div>
        </aside>
        <button className={styles.mobileBackdrop} data-open={sidebarOpen ? "true" : "false"} onClick={() => setSidebarOpen(false)} aria-label="Menüyü kapat" />

        <main className={styles.chatMain}>
          <header className={styles.topbar}>
            <div className={styles.topbarActions}>
              <button className={`${styles.iconButton} ${styles.mobileToggle}`} type="button" onClick={() => setSidebarOpen(true)} aria-label="ROSTA Insight menüsünü aç"><Menu /></button>
              <div className={styles.topbarTitle}><strong>{active?.title || "ROSTA Insight"}</strong><small>Chat · canlı panel bağlamı</small></div>
            </div>
            <div className={styles.topbarActions}>
              <span className={styles.statusPill} data-ready={providerReady ? "true" : "false"}><i />{providerReady ? model : "Bağlantı hazırlanıyor"}</span>
              <Link className={styles.modeButton} href="/rosta-insight/voice"><Mic2 /> Voice</Link>
              <Link className={styles.iconButton} href="/" aria-label="ROSTA Insight'ı kapat"><X /></Link>
            </div>
          </header>

          <div className={styles.messages} aria-live="polite">
            {messages.length === 0 ? (
              <motion.div className={styles.emptyState} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .45 }}>
                <div className={styles.emptyOrb}><RuthieGradientOrb compact /></div>
                <h1>Ne yapmak istiyorsun?</h1>
                <p>ROSTA Insight panel verilerini okuyabilir, sipariş ve stokları gösterebilir, operasyonları analiz edebilir ve onayınla işlem yapabilir.</p>
                <div className={styles.suggestions}>{SUGGESTIONS.map((item) => <button className={styles.suggestion} type="button" key={item} onClick={() => void send(item)}>{item}</button>)}</div>
              </motion.div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((message) => message.role === "user" ? (
                  <motion.div className={styles.messageRow} data-role="user" key={message.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <div className={styles.userBubble}>{message.text}</div>
                  </motion.div>
                ) : (
                  <motion.div className={styles.messageRow} data-role="assistant" key={message.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <span className={styles.messageAvatar} />
                    <div className={styles.assistantMessage}>
                      <p>{message.text}</p>
                      {message.sources?.length ? <div className={styles.sources}>{message.sources.slice(0, 5).map((source) => <a className={styles.sourceChip} href={source.url} target="_blank" rel="noreferrer" key={source.url}><ExternalLink />{source.title || "Kaynak"}</a>)}</div> : null}
                      {message.pendingAction ? (
                        <div className={styles.approval}>
                          <strong>{message.pendingAction.title || "İşlem onayı gerekiyor"}</strong>
                          <p>{message.pendingAction.summary || "Bu işlem panel verisinde değişiklik yapabilir."}</p>
                          <div className={styles.approvalActions}>
                            <button type="button" disabled={executingAction === message.pendingAction.id} onClick={() => void approve(message, message.pendingAction!)}>{executingAction === message.pendingAction.id ? "Uygulanıyor…" : "Onayla ve uygula"}</button>
                            <button type="button" onClick={() => cancelAction(message.id)}>Vazgeç</button>
                          </div>
                        </div>
                      ) : null}
                      {message.actionNote ? <div className={styles.messageMeta}>{message.actionNote}</div> : null}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            {sending ? <div className={styles.thinking}><span className={styles.messageAvatar} /><span>Düşünüyor</span><span className={styles.thinkingDots}><i /><i /><i /></span></div> : null}
            <div ref={bottomRef} />
          </div>

          <div className={styles.composerArea}>
            {files.length ? <div className={styles.attachments}>{files.map((file) => <span className={styles.attachment} key={file.id}>{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}><X /></button></span>)}</div> : null}
            <div className={styles.composer}>
              <textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} rows={1} placeholder="ROSTA Insight’a bir şey sor veya bir görev ver…" />
              <div className={styles.composerToolbar}>
                <div className={styles.composerTools}>
                  <input ref={fileInputRef} hidden type="file" multiple accept={FILE_ACCEPT} onChange={(event) => void addFiles(event)} />
                  <button className={styles.toolButton} type="button" onClick={() => fileInputRef.current?.click()} aria-label="Dosya ekle"><Paperclip /></button>
                  <span className={styles.modelChip}><Sparkles />{model}</span>
                </div>
                <button className={styles.sendButton} type="button" disabled={sending || (!input.trim() && !files.length)} onClick={() => void send()} aria-label="Gönder"><ArrowUp /></button>
              </div>
            </div>
            {error ? <div className={styles.errorBanner}>{error}</div> : null}
          </div>
        </main>

        <aside className={styles.rightRail}>
          <section className={styles.orbCard}>
            <button className={styles.orbButton} type="button" onDoubleClick={() => router.push("/rosta-insight/voice")} title="Sesli ROSTA Insight’a geçmek için çift tıkla"><RuthieGradientOrb compact phase={sending ? "thinking" : "idle"} /></button>
            <span className={styles.orbCaption}>{sending ? "Düşünüyor" : "Voice AI hazır"}</span>
          </section>
          <section className={styles.resultRail}>
            <div className={styles.resultHeader}><strong>Canlı sonuçlar</strong><span>ROSTA Insight tools</span></div>
            <div className={styles.resultHost} data-ruthie-result-host="chat">
              <div className={styles.resultEmpty} data-ruthie-result-empty><History />Sipariş, ürün, müşteri veya kargo istediğinde sonuç burada açılır.</div>
            </div>
          </section>
        </aside>
      </div>

      <nav className={styles.mobileNav} aria-label="ROSTA Insight AI menüsü">
        <Link href="/rosta-insight/chat" data-active="true"><MessageCircle /> Chat</Link>
        <Link href="/rosta-insight/voice" data-active="false"><Mic2 /> Voice</Link>
      </nav>
    </section>
  );
}
