"use client";

import { useState } from "react";

const initialForm = { name: "", email: "", phone: "", message: "", company: "" };

export function ContactForm() {
  const [form, setForm] = useState(initialForm);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error || "Mesaj gönderilemedi.");
      }
      setForm(initialForm);
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="grid gap-5" onSubmit={submit} noValidate>
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Şirket
          <input
            name="company"
            value={form.company}
            onChange={(event) => setForm({ ...form, company: event.target.value })}
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-[10px] uppercase tracking-[0.28em] text-gold-dark">Ad Soyad</span>
          <input
            name="name"
            type="text"
            required
            minLength={2}
            autoComplete="name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Adınız Soyadınız"
            className="w-full rounded-full border border-gold/15 bg-ivory px-5 py-4 text-sm text-ink outline-none transition placeholder:text-muted-ruth/55 focus:border-gold"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-[10px] uppercase tracking-[0.28em] text-gold-dark">E-posta</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="ornek@mail.com"
            className="w-full rounded-full border border-gold/15 bg-ivory px-5 py-4 text-sm text-ink outline-none transition placeholder:text-muted-ruth/55 focus:border-gold"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-2 block text-[10px] uppercase tracking-[0.28em] text-gold-dark">Telefon Numarası</span>
        <input
          name="phone"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
          placeholder="05xx xxx xx xx"
          className="w-full rounded-full border border-gold/15 bg-ivory px-5 py-4 text-sm text-ink outline-none transition placeholder:text-muted-ruth/55 focus:border-gold"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-[10px] uppercase tracking-[0.28em] text-gold-dark">Mesajınız</span>
        <textarea
          name="message"
          rows={6}
          required
          minLength={10}
          maxLength={4000}
          value={form.message}
          onChange={(event) => setForm({ ...form, message: event.target.value })}
          placeholder="Bize yazmak istediğiniz konuyu buraya yazın."
          className="w-full resize-none rounded-[1.6rem] border border-gold/15 bg-ivory px-5 py-4 text-sm leading-7 text-ink outline-none transition placeholder:text-muted-ruth/55 focus:border-gold"
        />
      </label>

      <div aria-live="polite">
        {error ? <p className="mb-4 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="mb-4 text-sm text-emerald-800">Mesajınız alındı. En kısa sürede size dönüş yapacağız.</p> : null}
      </div>

      <button
        type="submit"
        disabled={sending}
        className="w-full rounded-full bg-ink px-8 py-4 text-xs uppercase tracking-wide-luxe text-cream transition hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
      >
        {sending ? "Gönderiliyor…" : "Mesajı Gönder"}
      </button>
    </form>
  );
}
