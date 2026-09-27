"use client";

import { useState } from "react";

type Props = {
  sectionId: string;
  settings?: Record<string, unknown>;
  backgroundColor?: string;
  textColor?: string;
  paddingY?: number;
};

function copy(settings: Record<string, unknown>, key: string, fallback: string, max = 600) {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function editorPreview() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("themeEditor") === "1" || params.has("storeDesignV2Preview");
}

export function StoreDesignNewsletter({
  sectionId,
  settings = {},
  backgroundColor,
  textColor,
  paddingY = 64,
}: Props) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const heading = copy(settings, "heading", "Bültene Katıl", 220);
  const body = copy(settings, "body", "", 1200);
  const fieldLabel = copy(settings, "fieldLabel", "E-posta", 100);
  const consentCopy = copy(settings, "consent", "Kampanya ve duyurular için e-posta almak istiyorum.", 1000);
  const buttonLabel = copy(settings, "buttonLabel", "Kaydol", 80);
  const successCopy = copy(settings, "successCopy", "Kaydın alındı. Teşekkür ederiz.", 500);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    setError("");
    setSuccess(false);

    if (editorPreview()) {
      setError("Önizleme modunda gerçek abonelik gönderilmez.");
      return;
    }
    if (!consent) {
      setError("Devam etmek için e-posta iletişimi onayını işaretleyin.");
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, email, consent, company }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        throw new Error(typeof result?.error === "string" ? result.error : "Kayıt tamamlanamadı.");
      }
      setEmail("");
      setConsent(false);
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Kayıt tamamlanamadı.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      data-theme-section-id={sectionId}
      data-editor-id={`section:${sectionId}`}
      data-editor-type="newsletter"
      data-editor-label={heading}
      className="px-5 md:px-8"
      style={{
        background: backgroundColor || "transparent",
        color: textColor || "inherit",
        paddingTop: paddingY,
        paddingBottom: paddingY,
      }}
    >
      <div className="mx-auto grid max-w-5xl gap-7 md:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] md:items-end md:gap-12">
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.18em] opacity-55">Newsletter</p>
          <h2 className="mt-3 font-heading text-[clamp(2rem,4.5vw,4.5rem)] leading-[0.98]">{heading}</h2>
          {body ? <p className="mt-5 max-w-xl whitespace-pre-wrap text-sm leading-7 opacity-70">{body}</p> : null}
        </div>

        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
            <label>
              Şirket
              <input
                name="company"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] opacity-65">{fieldLabel}</span>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ornek@mail.com"
                className="min-h-12 min-w-0 flex-1 rounded-full border border-current/20 bg-transparent px-5 text-sm outline-none transition placeholder:opacity-35 focus:border-current/55"
              />
              <button
                type="submit"
                disabled={sending}
                className="min-h-12 shrink-0 rounded-full border border-current/20 px-6 text-[10px] font-semibold uppercase tracking-[0.14em] transition hover:border-current/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Kaydediliyor…" : buttonLabel}
              </button>
            </div>
          </label>

          <label className="flex items-start gap-3 text-xs leading-5 opacity-72">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>{consentCopy}</span>
          </label>

          <div aria-live="polite">
            {error ? <p className="text-sm text-[var(--ruth-color-danger-text,#a52d24)]">{error}</p> : null}
            {success ? <p className="text-sm text-[var(--ruth-color-success-text,#3f6b46)]">{successCopy}</p> : null}
          </div>
        </form>
      </div>
    </section>
  );
}
