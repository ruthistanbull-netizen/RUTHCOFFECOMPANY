"use client";

import { AlertTriangle, Check, Mail, MessageSquareText, RefreshCw, ShieldAlert, X } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { formatDateTime } from "@/lib/format";

type MessageStatus = "new" | "read" | "resolved" | "spam";
type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  message: string;
  status: MessageStatus;
  created_at: string;
};

const tabs: Array<[MessageStatus | "all", string]> = [
  ["new", "Yeni"],
  ["read", "Okundu"],
  ["resolved", "Çözüldü"],
  ["spam", "Spam"],
  ["all", "Tümü"],
];

export default function ContactMessagesPage() {
  const [status, setStatus] = useState<MessageStatus | "all">("new");
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (mode: "load" | "refresh" = "load") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await adminRequest<{ messages?: ContactMessage[] }>(`/api/contact-messages?status=${status}`);
      setMessages(result.messages || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "İletişim mesajları alınamadı.");
    } finally {
      if (mode === "refresh") setRefreshing(false);
      else setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const update = async (id: string, nextStatus: MessageStatus) => {
    const actionKey = `${id}:${nextStatus}`;
    setBusy(actionKey);
    setError(null);
    try {
      await adminRequest("/api/contact-messages", {
        method: "PATCH",
        body: JSON.stringify({ id, status: nextStatus }),
      });
      setMessages((current) => status === "all" || status === nextStatus
        ? current.map((item) => item.id === id ? { ...item, status: nextStatus } : item)
        : current.filter((item) => item.id !== id));
      setNotice(nextStatus === "resolved" ? "Mesaj çözüldü olarak işaretlendi." : nextStatus === "spam" ? "Mesaj spam olarak işaretlendi." : "Mesaj durumu güncellendi.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mesaj durumu güncellenemedi.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="cr-page-header">
        <div>
          <span className="cr-eyebrow">Müşteri iletişimi</span>
          <h1>İletişim mesajları</h1>
          <p className="cr-description">Storefront iletişim formundan gelen mesajları incele ve durumunu yönet.</p>
        </div>
        <div className="cr-actions">
          <button className="cr-button cr-button--secondary" type="button" onClick={() => void load("refresh")} disabled={loading || refreshing} aria-busy={refreshing || undefined}>
            {refreshing ? <LoadingIndicator size="sm" label="Mesajlar yenileniyor" /> : <RefreshCw aria-hidden="true" />} Yenile
          </button>
        </div>
      </header>

      {error ? <div className="cr-notice cr-notice--danger"><AlertTriangle aria-hidden="true" /><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Hata mesajını kapat"><X /></button></div> : null}
      {notice ? <div className="cr-notice cr-notice--success"><Check aria-hidden="true" /><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Başarı mesajını kapat"><X /></button></div> : null}

      <div className="cr-review-tabs">
        {tabs.map(([value, label]) => (
          <button type="button" key={value} className={status === value ? "is-active" : ""} onClick={() => setStatus(value)}>{label}</button>
        ))}
      </div>

      {loading ? <div className="cr-loading" role="status" aria-busy="true"><LoadingIndicator size="md" label="Mesajlar yükleniyor" /><strong>Mesajlar yükleniyor</strong></div> : null}
      {!loading && messages.length === 0 ? <div className="cr-card cr-empty"><MessageSquareText /><strong>Bu durumda mesaj yok</strong><span>Diğer sekmeleri kontrol edebilirsin.</span></div> : null}

      {!loading && messages.length > 0 ? (
        <section className="cr-review-grid">
          {messages.map((item) => (
            <article className="cr-card cr-review-card" key={item.id}>
              <header>
                <div>
                  <span className="cr-eyebrow">{item.status === "new" ? "Yeni mesaj" : item.status}</span>
                  <h2>{item.name}</h2>
                </div>
                <small>{formatDateTime(item.created_at)}</small>
              </header>
              <p>{item.message}</p>
              <dl>
                <div><dt>E-posta</dt><dd><a href={`mailto:${item.email}`}>{item.email}</a></dd></div>
                <div><dt>Telefon</dt><dd>{item.phone ? <a href={`tel:${item.phone}`}>{item.phone}</a> : "—"}</dd></div>
              </dl>
              <footer>
                {item.status === "new" ? <button className="cr-button cr-button--secondary" type="button" onClick={() => void update(item.id, "read")} disabled={Boolean(busy)} aria-busy={busy === `${item.id}:read` || undefined}>{busy === `${item.id}:read` ? <LoadingIndicator size="sm" label="Mesaj okundu olarak işaretleniyor" /> : <Mail />} Okundu</button> : null}
                {item.status !== "resolved" ? <button className="cr-button cr-button--primary" type="button" onClick={() => void update(item.id, "resolved")} disabled={Boolean(busy)} aria-busy={busy === `${item.id}:resolved` || undefined}>{busy === `${item.id}:resolved` ? <LoadingIndicator size="sm" label="Mesaj çözülüyor" /> : <Check />} Çözüldü</button> : null}
                {item.status !== "spam" ? <button className="cr-button cr-button--danger" type="button" onClick={() => void update(item.id, "spam")} disabled={Boolean(busy)} aria-busy={busy === `${item.id}:spam` || undefined}>{busy === `${item.id}:spam` ? <LoadingIndicator size="sm" label="Mesaj spam olarak işaretleniyor" /> : <ShieldAlert />} Spam</button> : null}
              </footer>
            </article>
          ))}
        </section>
      ) : null}
    </>
  );
}
