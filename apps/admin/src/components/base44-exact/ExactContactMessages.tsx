"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail, MessageSquareText, RefreshCw, Reply, Search, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactButton, ExactDetailDrawer, ExactField, ExactIconButton, ExactPageHeader, ExactSearchInput, ExactSegmentedControl, ExactSkeleton, ExactStatusBadge, exactFormInputClass, useExactToast } from "./primitives";
import { ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn } from "./data";

type ContactStatus = "new" | "read" | "resolved" | "spam";
type ContactMessage = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  subject?: string | null;
  message: string | null;
  status: ContactStatus;
  created_at: string;
  updated_at?: string | null;
};
type GmailIntegration = { provider: string; email: string | null; status: string };
type ConversationReply = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
  fromEmail?: string | null;
  toEmail?: string | null;
};
type ThreadResult = {
  connected?: boolean;
  replies?: ConversationReply[];
  status?: ContactStatus;
  sent?: boolean;
  newReplies?: number;
};

function dateTime(value?: string | null) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function label(value: ContactStatus) {
  return value === "new" ? "Yeni" : value === "read" ? "İşlemde" : value === "resolved" ? "Çözüldü" : "Arşiv";
}

export function ExactContactMessages() {
  const toast = useExactToast();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [filter, setFilter] = useState<"all" | ContactStatus>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [replyText, setReplyText] = useState("");
  const [threadReplies, setThreadReplies] = useState<ConversationReply[]>([]);
  const [gmail, setGmail] = useState<GmailIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const setLocalStatus = useCallback((messageId: string, status: ContactStatus) => {
    setMessages((current) => current.map((item) => item.id === messageId ? { ...item, status } : item));
    setSelected((current) => current?.id === messageId ? { ...current, status } : current);
  }, []);

  const load = useCallback(async ({ silent = false, hardRefresh = false }: { silent?: boolean; hardRefresh?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [messageResult, emailResult] = await Promise.all([
        adminRequest<{ messages?: ContactMessage[] }>(`/api/contact-messages?status=${filter === "all" ? "all" : filter}`, { force: true, hardRefresh, ttlMs: 0, staleMs: 1_000 }),
        adminRequest<{ integrations?: GmailIntegration[]; activeIntegration?: GmailIntegration | null }>("/api/email/status", { force: true }),
      ]);
      const next = messageResult.messages || [];
      setMessages(next);
      setSelected((current) => current ? next.find((item) => item.id === current.id) || current : null);
      const active = emailResult.activeIntegration?.provider === "gmail"
        ? emailResult.activeIntegration
        : (emailResult.integrations || []).find((item) => item.provider === "gmail" && ["active", "connected"].includes(item.status)) || null;
      setGmail(active);
    } catch (caught) {
      if (!silent) toast.error(caught instanceof Error ? caught.message : "İletişim mesajları alınamadı.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filter, toast]);

  const syncInbox = useCallback(async ({ silent = true }: { silent?: boolean } = {}) => {
    setSyncing(true);
    try {
      const result = await adminRequest<ThreadResult>("/api/contact-messages/thread", {
        method: "PUT",
        body: JSON.stringify({}),
        confirmation: false,
        timeoutMs: 20_000,
      });
      if (Number(result.newReplies || 0) > 0) await load({ silent: true, hardRefresh: true });
    } catch (caught) {
      if (!silent) toast.error(caught instanceof Error ? caught.message : "Gmail cevapları senkronlanamadı.");
    } finally {
      setSyncing(false);
    }
  }, [load, toast]);

  useEffect(() => {
    let cancelled = false;
    // Paint the retained/read-model list first. Gmail reconciliation runs after
    // the visible page is ready, so provider latency never blocks navigation.
    void load().then(() => {
      if (!cancelled) void syncInbox();
    });
    return () => { cancelled = true; };
  }, [load, syncInbox]);

  const loadThread = useCallback(async (messageId: string, { silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setThreadLoading(true);
    try {
      const result = await adminRequest<ThreadResult>(`/api/contact-messages/thread?message_id=${encodeURIComponent(messageId)}`, {
        force: true,
        hardRefresh: true,
        ttlMs: 0,
        staleMs: 1_000,
        timeoutMs: 15_000,
      });
      setThreadReplies(result.replies || []);
      if (result.status === "new") {
        setLocalStatus(messageId, "read");
        void adminRequest("/api/contact-messages", {
          method: "PATCH",
          body: JSON.stringify({ id: messageId, status: "read" }),
          confirmation: false,
        }).catch(() => undefined);
      } else if (result.status) {
        setLocalStatus(messageId, result.status);
      }
    } catch (caught) {
      if (!silent) toast.error(caught instanceof Error ? caught.message : "Gmail konuşması alınamadı.");
    } finally {
      if (!silent) setThreadLoading(false);
    }
  }, [setLocalStatus, toast]);

  useEffect(() => {
    const messageId = selected?.id;
    if (!messageId) return;
    const timer = window.setInterval(() => { void loadThread(messageId, { silent: true }); }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadThread, selected?.id]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return messages.filter((item) => !needle || `${item.name || ""} ${item.email || ""} ${item.phone || ""} ${item.subject || ""} ${item.message || ""}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [messages, query]);

  const counts = useMemo(() => ({
    new: messages.filter((item) => item.status === "new").length,
    read: messages.filter((item) => item.status === "read").length,
    resolved: messages.filter((item) => item.status === "resolved").length,
    total: messages.length,
  }), [messages]);

  const update = async (message: ContactMessage, status: ContactStatus, showToast = true) => {
    setBusy(message.id);
    try {
      await adminRequest("/api/contact-messages", { method: "PATCH", body: JSON.stringify({ id: message.id, status }), confirmation: false });
      setLocalStatus(message.id, status);
      if (showToast) toast.success(`Mesaj ${label(status).toLocaleLowerCase("tr-TR")} olarak güncellendi.`);
    } catch (caught) {
      if (showToast) toast.error(caught instanceof Error ? caught.message : "Mesaj güncellenemedi.");
    } finally {
      setBusy(null);
    }
  };

  const open = (message: ContactMessage) => {
    setSelected(message);
    setReplyText("");
    setThreadReplies([]);
    void loadThread(message.id);
    if (message.status === "new") void update(message, "read", false);
  };

  const sendReply = async () => {
    if (!selected?.email) {
      toast.error("Bu mesajda yanıt gönderilecek e-posta adresi yok.");
      return;
    }
    if (!replyText.trim()) {
      toast.error("Yanıt metnini yaz.");
      return;
    }
    if (!gmail) {
      toast.error("Önce E-posta Merkezi'nden Gmail hesabını bağla.");
      return;
    }

    setSending(true);
    try {
      const result = await adminRequest<ThreadResult>("/api/contact-messages/thread", {
        method: "POST",
        body: JSON.stringify({ message_id: selected.id, body: replyText.trim() }),
        confirmation: false,
        timeoutMs: 20_000,
      });
      if (!result.sent) throw new Error("Yanıt gönderilemedi.");
      setThreadReplies(result.replies || []);
      setReplyText("");
      setLocalStatus(selected.id, "read");
      toast.success(`${gmail.email || "Bağlı Gmail"} hesabından yanıt gönderildi.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Gmail yanıtı gönderilemedi.");
    } finally {
      setSending(false);
    }
  };

  const refreshAll = async () => {
    await syncInbox({ silent: false });
    await load({ hardRefresh: true });
    if (selected?.id) await loadThread(selected.id);
  };

  const columns: ExactColumn<ContactMessage>[] = [
    { key: "name", label: "Gönderen", sortable: true, render: (item) => <div><p className="ruth-type-table font-medium text-main">{item.name || "İsimsiz"}</p><p className="ruth-type-caption text-subtle">{item.email || item.phone || "İletişim yok"}</p></div> },
    { key: "message", label: "Mesaj", render: (item) => <div><p className="ruth-type-table font-medium text-main">{item.subject || "Web sitesi iletişim formu"}</p><p className="ruth-type-caption line-clamp-1 text-muted">{item.message || "Mesaj yok"}</p></div> },
    { key: "created_at", label: "Tarih", sortable: true, render: (item) => <span className="ruth-type-code text-muted">{dateTime(item.created_at)}</span> },
    { key: "status", label: "Durum", align: "center", render: (item) => <ExactStatusBadge status={item.status === "read" ? "open" : item.status === "spam" ? "archived" : item.status} label={label(item.status)} size="sm" /> },
  ];

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="contact-messages">
    <ExactPageHeader title="İletişim Mesajları" subtitle={`${visible.length} müşteri mesajı`} actions={<><Link href="/email"><ExactButton variant="secondary" size="sm"><ArrowLeft className="h-4 w-4" /> E-posta merkezi</ExactButton></Link><ExactIconButton icon={RefreshCw} label="Yenile ve Gmail cevaplarını al" variant="secondary" onClick={() => void refreshAll()} loading={loading || syncing} /></>} />

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <button type="button" onClick={() => setFilter(filter === "new" ? "all" : "new")}><ExactMetricCard label="Yeni" value={counts.new} icon={Mail} className={filter === "new" ? "ring-2 ring-accent" : ""} /></button>
      <button type="button" onClick={() => setFilter(filter === "read" ? "all" : "read")}><ExactMetricCard label="İşlemde" value={counts.read} icon={Reply} className={filter === "read" ? "ring-2 ring-accent" : ""} /></button>
      <button type="button" onClick={() => setFilter(filter === "resolved" ? "all" : "resolved")}><ExactMetricCard label="Çözüldü" value={counts.resolved} icon={CheckCircle2} className={filter === "resolved" ? "ring-2 ring-accent" : ""} /></button>
      <ExactMetricCard label="Toplam" value={counts.total} icon={MessageSquareText} />
    </div>

    <div className="flex flex-col sm:flex-row gap-3">
      <ExactSegmentedControl size="sm" value={filter} onChange={(value) => setFilter(value as typeof filter)} options={[{ value: "all", label: "Tümü" }, { value: "new", label: "Yeni" }, { value: "read", label: "İşlemde" }, { value: "resolved", label: "Çözüldü" }, { value: "spam", label: "Arşiv" }]} />
      <ExactSearchInput value={query} onChange={setQuery} placeholder="Gönderen veya mesaj ara..." className="flex-1" />
    </div>

    {loading ? <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div> : <ExactDataTable columns={columns} data={visible} onRowClick={open} emptyState={<ExactEmptyState icon={Search} title="Bu filtrede mesaj yok" />} />}

    <ExactDetailDrawer
      open={Boolean(selected)}
      onClose={() => { if (!busy && !sending) setSelected(null); }}
      title={selected?.subject || "İletişim mesajı"}
      subtitle={selected ? `${selected.name || "İsimsiz"} · ${dateTime(selected.created_at)}` : undefined}
      width={680}
      footer={selected ? <div className="flex flex-wrap gap-2"><ExactButton variant="secondary" size="sm" onClick={() => void update(selected, "spam")} loading={busy === selected.id}>Arşivle</ExactButton><ExactButton size="sm" className="ml-auto" onClick={() => void update(selected, "resolved")} loading={busy === selected.id}><CheckCircle2 className="h-4 w-4" /> Çözüldü</ExactButton></div> : null}
    >
      {selected ? <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-2">
          <div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">E-posta</p><p className="ruth-type-body-strong text-main">{selected.email || "—"}</p></div>
          <div className="p-3 radius-small bg-surface-secondary"><p className="ruth-type-label text-subtle">Telefon</p><p className="ruth-type-body-strong text-main">{selected.phone || "—"}</p></div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2"><h4 className="ruth-type-label uppercase tracking-wide text-muted">Sohbet</h4>{threadLoading ? <span className="ruth-type-caption text-subtle">Gmail senkronlanıyor…</span> : null}</div>
          <div className="flex justify-start"><div className="ruth-type-body max-w-[88%] p-4 radius-control bg-surface-secondary text-main whitespace-pre-wrap"><p>{selected.message || "Mesaj metni yok."}</p><span className="ruth-type-caption mt-2 block text-subtle">{selected.name || "Müşteri"} · {dateTime(selected.created_at)}</span></div></div>
          {threadReplies.map((reply) => <div className={reply.direction === "outbound" ? "flex justify-end" : "flex justify-start"} key={reply.id}><div className={`ruth-type-body max-w-[88%] p-4 radius-control text-main whitespace-pre-wrap ${reply.direction === "outbound" ? "bg-accent-soft" : "bg-surface-secondary"}`}><p>{reply.body}</p><span className="ruth-type-caption mt-2 block text-subtle">{reply.direction === "outbound" ? "Ruth Istanbul" : selected.name || "Müşteri"} · {dateTime(reply.createdAt)}</span></div></div>)}
        </section>

        <ExactField label="Yanıtın">
          <textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} className={`${exactFormInputClass} min-h-32`} placeholder="Müşteriye göndermek istediğin yanıtı yaz..." />
        </ExactField>
        <div className="ruth-type-caption p-3 radius-small bg-surface-secondary text-muted">
          <p><strong className="text-main">Gönderen:</strong> {gmail?.email || "Gmail bağlı değil"}</p>
          <p className="mt-1">Yanıt bağlı Gmail hesabından aynı konuşma zincirine gönderilir. Müşteri bu e-postaya cevap verdiğinde cevabı bu sohbet alanına geri senkronlanır.</p>
        </div>
        <ExactButton size="sm" className="w-full" onClick={() => void sendReply()} loading={sending} disabled={!selected.email || !replyText.trim() || !gmail}><Send className="h-4 w-4" /> Gmail ile yanıt gönder</ExactButton>
      </div> : null}
    </ExactDetailDrawer>
  </div>;
}
