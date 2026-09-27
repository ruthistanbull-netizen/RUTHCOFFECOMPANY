"use client";

import { useMemo, useState } from "react";
import type { ThemeSection } from "@ruth-commerce/commerce-core/theme-sections";

type V2Block = NonNullable<ThemeSection["v2Blocks"]>[number];

type Props = {
  sectionId: string;
  settings?: Record<string, unknown>;
  fields?: V2Block[];
  backgroundColor?: string;
  textColor?: string;
  paddingY?: number;
};

const FIELD_TYPES = new Set(["text", "email", "tel", "textarea", "select", "checkbox"]);

function text(value: unknown, fallback = "", max = 1000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function editorPreview() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("themeEditor") === "1" || params.has("storeDesignV2Preview");
}

function options(value: unknown) {
  return text(value, "", 3000)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export function StoreDesignCustomForm({
  sectionId,
  settings = {},
  fields = [],
  backgroundColor,
  textColor,
  paddingY = 64,
}: Props) {
  const schema = useMemo(() => fields
    .filter((field) => field.type === "field")
    .map((field) => {
      const name = text(field.settings.name, "", 40);
      const rawType = text(field.settings.type, "text", 30);
      const type = FIELD_TYPES.has(rawType) ? rawType : "text";
      return {
        id: field.id,
        name,
        label: text(field.settings.label, name || "Alan", 120),
        type,
        required: field.settings.required === true,
        placeholder: text(field.settings.placeholder, "", 180),
        options: options(field.settings.options),
      };
    })
    .filter((field) => /^[a-z][a-z0-9_-]{0,39}$/.test(field.name))
    .slice(0, 20), [fields]);

  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [company, setCompany] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const title = text(settings.title, "Form", 220);
  const body = text(settings.body, "", 1200);
  const buttonLabel = text(settings.buttonLabel, "Gönder", 80);
  const successCopy = text(settings.successCopy, "Formunuz alındı. Teşekkür ederiz.", 500);

  const update = (name: string, value: string | boolean) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    setError("");
    setSuccess(false);

    if (editorPreview()) {
      setError("Önizleme modunda gerçek form gönderimi yapılmaz.");
      return;
    }
    if (!schema.length) {
      setError("Bu formda henüz gönderilebilir alan yok.");
      return;
    }

    for (const field of schema) {
      const value = values[field.name];
      if (field.required && (field.type === "checkbox" ? value !== true : !String(value || "").trim())) {
        setError(`${field.label} alanı zorunludur.`);
        return;
      }
    }

    setSending(true);
    try {
      const response = await fetch("/api/store-design/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          action: "store",
          values,
          company,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.ok === false) {
        throw new Error(typeof result?.error === "string" ? result.error : "Form gönderilemedi.");
      }
      setValues({});
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Form gönderilemedi.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      data-theme-section-id={sectionId}
      data-editor-id={`section:${sectionId}`}
      data-editor-type="custom-form"
      data-editor-label={title}
      className="px-5 md:px-8"
      style={{
        background: backgroundColor || "transparent",
        color: textColor || "inherit",
        paddingTop: paddingY,
        paddingBottom: paddingY,
      }}
    >
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] md:gap-14">
        <div>
          <h2 className="font-heading text-[clamp(2rem,4vw,4rem)] leading-[0.98]">{title}</h2>
          {body ? <p className="mt-5 max-w-xl whitespace-pre-wrap text-sm leading-7 opacity-70">{body}</p> : null}
        </div>

        <form onSubmit={submit} noValidate className="grid gap-5">
          <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
            <label>
              Şirket
              <input name="company" value={company} onChange={(event) => setCompany(event.target.value)} tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          {schema.map((field) => {
            const value = values[field.name];
            const common = {
              id: `${sectionId}-${field.id}`,
              name: field.name,
              required: field.required,
              "aria-required": field.required || undefined,
            };

            if (field.type === "checkbox") {
              return (
                <label
                  key={field.id}
                  data-editor-id={`block:${field.id}`}
                  data-editor-type="form-field"
                  data-editor-label={field.label}
                  className="flex items-start gap-3 rounded-xl border border-current/10 p-4 text-sm leading-6"
                >
                  <input
                    {...common}
                    type="checkbox"
                    checked={value === true}
                    onChange={(event) => update(field.name, event.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0"
                  />
                  <span>{field.label}</span>
                </label>
              );
            }

            return (
              <label
                key={field.id}
                data-editor-id={`block:${field.id}`}
                data-editor-type="form-field"
                data-editor-label={field.label}
                className="grid gap-2"
              >
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] opacity-65">
                  {field.label}{field.required ? " *" : ""}
                </span>
                {field.type === "textarea" ? (
                  <textarea
                    {...common}
                    rows={5}
                    maxLength={4000}
                    value={typeof value === "string" ? value : ""}
                    onChange={(event) => update(field.name, event.target.value)}
                    placeholder={field.placeholder}
                    className="min-h-36 resize-y rounded-[22px] border border-current/20 bg-transparent px-5 py-4 text-sm leading-7 outline-none transition placeholder:opacity-35 focus:border-current/55"
                  />
                ) : field.type === "select" ? (
                  <select
                    {...common}
                    value={typeof value === "string" ? value : ""}
                    onChange={(event) => update(field.name, event.target.value)}
                    className="min-h-12 rounded-full border border-current/20 bg-transparent px-5 text-sm outline-none transition focus:border-current/55"
                  >
                    <option value="">Seçin</option>
                    {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input
                    {...common}
                    type={field.type}
                    autoComplete={field.type === "email" ? "email" : field.type === "tel" ? "tel" : "off"}
                    value={typeof value === "string" ? value : ""}
                    onChange={(event) => update(field.name, event.target.value)}
                    placeholder={field.placeholder}
                    maxLength={field.type === "tel" ? 40 : 500}
                    className="min-h-12 rounded-full border border-current/20 bg-transparent px-5 text-sm outline-none transition placeholder:opacity-35 focus:border-current/55"
                  />
                )}
              </label>
            );
          })}

          {!schema.length ? <p className="rounded-xl border border-current/10 p-4 text-sm opacity-60">Bu forma panelden alan ekleyin.</p> : null}

          <div aria-live="polite">
            {error ? <p className="text-sm text-[var(--ruth-color-danger-text,#a52d24)]">{error}</p> : null}
            {success ? <p className="text-sm text-[var(--ruth-color-success-text,#3f6b46)]">{successCopy}</p> : null}
          </div>

          <button
            type="submit"
            disabled={sending || !schema.length}
            className="min-h-12 justify-self-start rounded-full border border-current/20 px-7 text-[10px] font-semibold uppercase tracking-[0.14em] transition hover:border-current/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "Gönderiliyor…" : buttonLabel}
          </button>
        </form>
      </div>
    </section>
  );
}
