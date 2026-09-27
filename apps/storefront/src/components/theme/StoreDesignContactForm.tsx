"use client";

import { useState } from "react";

type Props = {
  sectionId: string;
  settings?: Record<string, unknown>;
};

type ContactDraft = {
  name: string;
  email: string;
  phone: string;
  message: string;
  company: string;
};

const EMPTY_FORM: ContactDraft = {
  name: "",
  email: "",
  phone: "",
  message: "",
  company: "",
};

function copy(settings: Record<string, unknown>, key: string, fallback: string, max = 220) {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

export function StoreDesignContactForm({ sectionId, settings = {} }: Props) {
  const [form, setForm] = useState<ContactDraft>(EMPTY_FORM);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const title = copy(settings, "title", "Bize Ulaşın");
  const body = copy(settings, "body", "", 1200);
  const phoneVisible = settings.phoneVisible !== false;
  const nameLabel = copy(settings, "nameLabel", "Ad Soyad", 80);
  const emailLabel = copy(settings, "emailLabel", "E-posta", 80);
  const phoneLabel = copy(settings, "phoneLabel", "Telefon", 80);
  const messageLabel = copy(settings, "messageLabel", "Mesaj", 80);
  const namePlaceholder = copy(settings, "namePlaceholder", "Adınız Soyadınız", 120);
  const emailPlaceholder = copy(settings, "emailPlaceholder", "ornek@mail.com", 120);
  const phonePlaceholder = copy(settings, "phonePlaceholder", "05xx xxx xx xx", 120);
  const messagePlaceholder = copy(settings, "messagePlaceholder", "Mesajınızı yazın.", 220);
  const buttonLabel = copy(settings, "buttonLabel", "Mesajı Gönder", 80);
  const successCopy = copy(
    settings,
    "successCopy",
    "Mesajınız alındı. En kısa sürede size dönüş yapacağız.",
    500,
  );

  const update = (key: keyof ContactDraft, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;

    setSending(true);
    setError("");
    setSuccess(false);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: phoneVisible ? form.phone : "",
          message: form.message,
          company: form.company,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        throw new Error(typeof result?.error === "string" ? result.error : "Mesaj gönderilemedi.");
      }
      setForm(EMPTY_FORM);
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mesaj gönderilemedi.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      data-theme-section-id={sectionId}
      data-editor-id={`section:${sectionId}`}
      data-editor-type="contact-form"
      data-editor-label={title}
      className="px-5 md:px-8"
    >
      <div className="mx-auto grid max-w-6xl gap-9 md:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] md:gap-14">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-brick">İletişim</p>
          <h2 className="mt-3 font-heading text-[clamp(2rem,5vw,4.5rem)] leading-[0.98]">{title}</h2>
          {body ? <p className="mt-5 max-w-xl whitespace-pre-wrap text-sm leading-7 opacity-70">{body}</p> : null}
        </div>

        <form
          onSubmit={submit}
          noValidate
          className="grid gap-5"
          data-editor-id={`contact-form:${sectionId}`}
          data-editor-type="contact-form-fields"
          data-editor-label="İletişim Formu Alanları"
        >
          <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
            <label>
              Şirket
              <input
                name="company"
                value={form.company}
                onChange={(event) => update("company", event.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </label>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] opacity-65">{nameLabel}</span>
              <input
                name="name"
                type="text"
                required
                minLength={2}
                autoComplete="name"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder={namePlaceholder}
                className="min-h-12 rounded-full border border-current/20 bg-transparent px-5 text-sm outline-none transition placeholder:opacity-35 focus:border-current/55"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] opacity-65">{emailLabel}</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(event) => update("email", event.target.value)}
                placeholder={emailPlaceholder}
                className="min-h-12 rounded-full border border-current/20 bg-transparent px-5 text-sm outline-none transition placeholder:opacity-35 focus:border-current/55"
              />
            </label>
          </div>

          {phoneVisible ? (
            <label className="grid gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] opacity-65">{phoneLabel}</span>
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(event) => update("phone", event.target.value)}
                placeholder={phonePlaceholder}
                className="min-h-12 rounded-full border border-current/20 bg-transparent px-5 text-sm outline-none transition placeholder:opacity-35 focus:border-current/55"
              />
            </label>
          ) : null}

          <label className="grid gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] opacity-65">{messageLabel}</span>
            <textarea
              name="message"
              rows={6}
              required
              minLength={10}
              maxLength={4000}
              value={form.message}
              onChange={(event) => update("message", event.target.value)}
              placeholder={messagePlaceholder}
              className="min-h-40 resize-y rounded-[24px] border border-current/20 bg-transparent px-5 py-4 text-sm leading-7 outline-none transition placeholder:opacity-35 focus:border-current/55"
            />
          </label>

          <div aria-live="polite">
            {error ? <p className="text-sm text-[var(--ruth-color-danger-text,#a52d24)]">{error}</p> : null}
            {success ? <p className="text-sm text-[var(--ruth-color-success-text,#3f6b46)]">{successCopy}</p> : null}
          </div>

          <button
            type="submit"
            disabled={sending}
            className="min-h-12 justify-self-start rounded-full bg-current px-7 text-[10px] font-semibold uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-[var(--contact-form-button-text,#FBF3E6)]">
              {sending ? "Gönderiliyor…" : buttonLabel}
            </span>
          </button>
        </form>
      </div>
    </section>
  );
}
