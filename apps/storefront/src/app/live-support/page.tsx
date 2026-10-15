"use client";

import { useCallback, useEffect, useState } from "react";

type Thread = { id: string; status: string; name?: string; email?: string };
type Msg = { id: string; sender: "customer" | "admin" | "system"; body: string; image_url?: string | null };
type SupportResult = {
  ok: boolean; error?: string; thread?: Thread;
  accessToken?: string; messages?: Msg[];
};

const storageKey = "rosta.live.support.session";

export default function LiveSupportCustomerPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [session, setSession] = useState<{ id: string; token: string } | null>(null);
  const [status, setStatus] = useState("pending");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [message, setMessage] = useState("");
  const [imageBase64, setImageBase64] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [fallbackSent, setFallbackSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const data = sessionStorage.getItem(storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        if (typeof parsed?.id === "string" && typeof parsed?.token === "string") {
          setSession(parsed);
          if (typeof parsed.name === "string") setName(parsed.name);
          if (typeof parsed.email === "string") setEmail(parsed.email);
        }
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetch("/api/live-support?threadId=" + encodeURIComponent(session.id), {
        headers: { Authorization: "Bearer " + session.token }, cache: "no-store",
      });
      const data: SupportResult = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Destek mesajları alınamadı.");
      setStatus(data.thread?.status || "pending");
      if (data.thread?.name) setName(data.thread.name);
      if (data.thread?.email) setEmail(data.thread.email);
      setMessages(old => {
        const cache = new Map(old.filter(x => x.image_url).map(x => [x.id, x.image_url]));
        return (data.messages || []).map(x => ({ ...x, image_url: cache.get(x.id) || x.image_url }));
      });
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Görüşme güncellenemedi.");
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(interval);
  }, [refresh, session]);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/live-support", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", name, email }),
      });
      const data: SupportResult = await response.json();
      if (!response.ok || !data.ok || !data.thread?.id || !data.accessToken) {
        throw new Error(data.error || "Görüşme açılamadı.");
      }
      const next = { id: data.thread.id, token: data.accessToken, name, email };
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      setSession(next);
      setStatus(data.thread.status);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Canlı desteğe bağlanılamadı.");
    } finally { setBusy(false); }
  };

  const choosePhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 15_000_000) {
      setError("Yalnızca 15 MB altı görsel seçebilirsin."); return;
    }
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 1250 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const src = canvas.toDataURL("image/jpeg", 0.70);
    const encoded = src.split(",")[1] || "";
    if (encoded.length > 1_900_000) {
      setError("Bu fotoğraf çok büyük. Daha küçük bir görsel seç."); return;
    }
    setImageBase64(encoded);
    setImagePreview(src);
    setError("");
  };

  const send = async () => {
    if (!session || (!message.trim() && !imageBase64) || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/live-support", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "message", threadId: session.id,
                               accessToken: session.token, message, imageBase64 }),
      });
      const data: SupportResult = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Mesaj gönderilemedi.");
      setMessage("");
      setImageBase64("");
      setImagePreview("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mesaj gönderilemedi.");
    } finally { setBusy(false); }
  };

  const sendFallback = async () => {
    if (busy || details.trim().length < 10) return;
    setBusy(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: "",
           message: "CANLI DESTEK GERİ DÖNÜŞ TALEBİ\n" + details, company: "" }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Mesaj gönderilemedi.");
      setFallbackSent(true);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Talebin gönderilemedi.");
    } finally { setBusy(false); }
  };

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 pb-24 pt-32 text-ink">
      <p className="text-xs uppercase tracking-[.22em] text-gold-dark">ROSTA COFFEE CO.</p>
      <h1 className="mt-3 font-heading text-4xl">Canlı Destek</h1>
      {error ? <p className="mt-4 rounded border border-red-500 p-3 text-sm" role="alert">{error}</p> : null}
      {!session ? (
        <section className="mt-9 space-y-6">
          <p className="text-sm">Görüşmeye başlamadan önce ad soyad ve e-posta adresini yaz.</p>
          <label className="block text-xs">AD SOYAD
            <input className="mt-2 w-full border p-4 text-base" value={name}
              autoComplete="name" onChange={event => setName(event.target.value)} maxLength={120}/>
          </label>
          <label className="block text-xs">E-POSTA
            <input className="mt-2 w-full border p-4 text-base" type="email" autoComplete="email"
              value={email} onChange={event => setEmail(event.target.value)} maxLength={200}/>
          </label>
          <button className="w-full bg-ink p-4 text-xs font-medium uppercase tracking-widest text-white disabled:opacity-50"
            disabled={busy || name.trim().length < 2 || !email.includes("@")} onClick={() => void start()}>
            CANLI DESTEĞE BAĞLAN
          </button>
        </section>
      ) : (
        <section className="mt-8 border">
          <div className="flex justify-between border-b p-4 text-sm">
            <span>{status === "pending" ? "Destek talebin sırada" : status === "active"
              ? "Destek görüşmesi" : "Görüşme sonlandırıldı"}</span>
            <button className="text-xs underline" onClick={() => {
              sessionStorage.removeItem(storageKey); setSession(null); setMessages([]);
            }}>Yeni sohbet</button>
          </div>
          <div className="h-[48vh] space-y-3 overflow-y-auto p-4" role="log">
            {messages.map(item => (
              <div key={item.id} className={"flex " +
                 (item.sender === "customer" ? "justify-end" : "justify-start")}>
                <p className={"max-w-[84%] whitespace-pre-wrap rounded p-3 text-sm " +
                  (item.sender === "customer" ? "bg-ink text-white" : "bg-white text-ink")}>
                  {item.image_url ? <img src={item.image_url} alt="Sohbet fotoğrafı"
                      className="mb-2 max-h-72 max-w-full object-contain" loading="lazy"/> : null}
                  {item.body}
                </p>
              </div>
            ))}
          </div>
          {status === "pending" ? (
            <div className="space-y-3 border-t p-7 text-center" role="status" aria-live="polite">
              <span className="mx-auto block h-7 w-7 animate-spin rounded-full border border-black border-t-transparent" />
              <p className="font-medium">CANLI DESTEĞE BAĞLANILIYOR</p>
              <p className="text-sm opacity-70">Temsilcimizin görüşmeni kabul etmesi bekleniyor.</p>
            </div>
          ) : status === "rejected" || status === "closed" ? (
            <div className="space-y-3 border-t p-4">
              <p className="text-sm">Şu anda canlı desteğe ulaşılamıyor. Bize sorununu anlat, e-posta ile sana geri dönüş yapacağız.</p>
              <textarea className="min-h-28 w-full border p-3" value={details}
                onChange={event => setDetails(event.target.value)} maxLength={3000}/>
              <button className="bg-ink px-5 py-3 text-xs text-white disabled:opacity-50"
                disabled={busy || details.length < 10 || fallbackSent}
                onClick={() => void sendFallback()}>
                {fallbackSent ? "TALEBİN İLETİLDİ" : "DETAYLARI GÖNDER"}
              </button>
            </div>
          ) : (
            <div className="border-t p-3">
              {imagePreview ? <div className="mb-2 flex items-center gap-3">
                <img src={imagePreview} alt="Gönderilecek fotoğraf" className="h-20 w-20 object-cover"/>
                <button type="button" onClick={() => { setImageBase64(""); setImagePreview(""); }}
                  className="text-xs underline">Kaldır</button>
              </div> : null}
              <form className="flex gap-2" onSubmit={event => {
                event.preventDefault(); void send();
              }}>
                <label className="cursor-pointer self-center p-2" aria-label="Fotoğraf ekle">
                  <span aria-hidden="true">📷</span>
                  <input type="file" accept="image/*" className="sr-only"
                    onChange={event => { void choosePhoto(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}/>
                </label>
                <input className="min-w-0 flex-1 border p-3 text-sm"
                  placeholder="Mesajını yaz..." value={message}
                  onChange={event => setMessage(event.target.value)} maxLength={3000}/>
                <button className="bg-ink px-4 text-sm text-white disabled:opacity-50"
                  type="submit" disabled={busy || (!message.trim() && !imageBase64)}>Gönder</button>
              </form>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
