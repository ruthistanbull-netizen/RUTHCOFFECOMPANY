"use client";

import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/lib/adminApi";

type Thread = {
  id: string; name: string; email: string;
  status: "pending" | "active" | "rejected" | "closed";
  created_at: string; updated_at: string;
};
type ChatMessage = {
  id: string; thread_id: string; sender: "customer" | "admin" | "system";
  body: string; created_at: string; image_url?: string | null;
};

export default function LiveSupportPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await adminRequest<{ threads: Thread[] }>("/api/live-support");
      setThreads(list.threads || []);
      if (selected) {
        const item = await adminRequest<{ thread: Thread; messages: ChatMessage[] }>(
          "/api/live-support?id=" + encodeURIComponent(selected),
        );
        setDetail(item.thread);
        setMessages(old => {
          const cache = new Map(old.filter(x => x.image_url).map(x => [x.id, x.image_url]));
          return (item.messages || []).map(x => ({ ...x, image_url: cache.get(x.id) || x.image_url }));
        });
      }
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Destek bağlantısı kurulamadı.");
    }
  }, [selected]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const action = async (kind: "accept" | "reject" | "close") => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await adminRequest("/api/live-support", {
        method: "PATCH",
        body: JSON.stringify({ threadId: selected, action: kind }),
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "İşlem gerçekleştirilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const reply = async () => {
    if (!selected || !draft.trim() || busy) return;
    setBusy(true);
    try {
      await adminRequest("/api/live-support", {
        method: "POST",
        body: JSON.stringify({ threadId: selected, message: draft.trim() }),
      });
      setDraft("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Yanıt gönderilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-4 md:p-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-xs tracking-widest opacity-60">ROSTA COFFEE CO. / MÜŞTERİ HİZMETLERİ</span>
          <h1 className="mt-2 text-3xl font-medium">Canlı Destek</h1>
          <p className="mt-2 text-sm opacity-60">Yeni sohbetleri cevapla, reddet veya sonlandır.</p>
        </div>
        <button className="rounded-lg border px-4 py-2 text-sm" type="button" onClick={() => void refresh()}>
          Yenile
        </button>
      </header>
      {error ? <p className="rounded-lg border border-red-400 p-3 text-sm text-red-600" role="alert">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-[minmax(230px,320px)_1fr]">
        <aside className="max-h-[70vh] overflow-y-auto rounded-lg border p-2">
          {threads.length === 0 ? <p className="p-4 text-sm opacity-65">Henüz görüşme bulunmuyor.</p> : null}
          {threads.map((thread) => (
            <button key={thread.id} type="button"
              onClick={() => setSelected(thread.id)}
              className={"mb-1 block w-full rounded-lg p-3 text-left " +
                (selected === thread.id ? "bg-black/10 dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/5")}>
              <strong className="block text-sm">{thread.name}</strong>
              <span className="block truncate text-xs opacity-60">{thread.email}</span>
              <span className="mt-1 block text-xs">
                {thread.status === "pending" ? "Bekliyor" : thread.status === "active" ? "Aktif" :
                  thread.status === "rejected" ? "Reddedildi" : "Sonlandırıldı"}
              </span>
            </button>
          ))}
        </aside>
        <section className="flex min-h-[55vh] flex-col overflow-hidden rounded-lg border">
          {!detail || detail.id !== selected ? (
            <p className="p-6 text-sm opacity-60">Görüşme seç.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b p-4">
                <div className="mr-auto">
                  <strong>{detail.name}</strong>
                  <span className="ml-2 text-sm opacity-60">{detail.email}</span>
                </div>
                {detail.status === "pending" ? (
                  <>
                    <button disabled={busy} className="rounded-md border px-3 py-2 text-sm" onClick={() => void action("accept")}>Kabul Et</button>
                    <button disabled={busy} className="rounded-md border border-red-500 px-3 py-2 text-sm text-red-600" onClick={() => void action("reject")}>Reddet</button>
                  </>
                ) : null}
                {detail.status === "active" ? (
                  <button disabled={busy} className="rounded-md border px-3 py-2 text-sm" onClick={() => void action("close")}>Görüşmeyi Bitir</button>
                ) : null}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((message) => (
                  <div key={message.id} className={"flex " + (message.sender === "admin" ? "justify-end" : "justify-start")}>
                    <div className={"max-w-[85%] rounded-lg p-3 text-sm whitespace-pre-wrap " +
                      (message.sender === "admin" ? "bg-neutral-800 text-white" : "bg-neutral-100 text-black dark:bg-neutral-800 dark:text-white")}>
                      <span className="mb-1 block text-xs opacity-70">
                        {message.sender === "admin" ? "ROSTA Destek" : message.sender === "customer" ? detail.name : "Sistem"}
                      </span>
                      {message.image_url ? <img src={message.image_url}
                        alt="Müşterinin gönderdiği fotoğraf"
                        className="mb-2 max-h-72 max-w-full object-contain" loading="lazy"/> : null}
                      {message.body}
                    </div>
                  </div>
                ))}
              </div>
              {detail.status === "active" ? (
                <form className="flex gap-2 border-t p-3" onSubmit={(event) => { event.preventDefault(); void reply(); }}>
                  <input className="min-w-0 flex-1 rounded-md border bg-transparent p-3 text-sm"
                    placeholder="Müşteriye yanıt yaz..." value={draft} onChange={event => setDraft(event.target.value)} maxLength={3000}/>
                  <button className="rounded-md bg-neutral-900 px-5 py-3 text-sm text-white disabled:opacity-50"
                    type="submit" disabled={busy || !draft.trim()}>Gönder</button>
                </form>
              ) : <p className="border-t p-4 text-sm opacity-65">Bu görüşme sonlandırıldı.</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
