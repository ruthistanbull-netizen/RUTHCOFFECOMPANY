"use client";

import { Mail, Send } from "lucide-react";
import { Picker } from "@ruth-commerce/ui";
import { useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import type { EmailTemplateFields } from "@/lib/emailTemplates";
import {
  ExactButton,
  ExactDetailDrawer,
  ExactField,
  ExactSkeleton,
  exactFormInputClass,
  useExactToast,
} from "./primitives";

type BulkEmailCustomer = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_member: boolean;
  marketing_email_consent: boolean;
  service_email_allowed?: boolean;
  order_count: number;
  total_spent: number;
  last_order_no?: string | null;
};

type EmailTemplate = {
  id: string;
  template_key: string;
  name: string;
  type: "campaign" | "service" | "automation";
  description?: string | null;
  enabled?: boolean;
  fields?: Partial<EmailTemplateFields> | null;
};

type BulkSendResult = {
  sent?: number;
  failed?: number;
  skipped?: number;
  errors?: string[];
};

type SendRun = {
  total: number;
  completed: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
};

type Props = {
  open: boolean;
  customers: BulkEmailCustomer[];
  onClose: () => void;
};

function nameOf(customer: BulkEmailCustomer) {
  return customer.full_name || customer.email || "ROSTA Coffee Co. müşterisi";
}

function messageFromFields(fields?: Partial<EmailTemplateFields> | null) {
  return [fields?.intro, fields?.offer, fields?.note].filter(Boolean).join("\n\n");
}

function eligible(customer: BulkEmailCustomer, template?: EmailTemplate | null) {
  if (!customer.email || !template) return false;
  if (template.template_key === "account_migrated") return Boolean(customer.is_member && customer.service_email_allowed);
  if (template.type === "service") return Boolean(customer.service_email_allowed);
  return Boolean(customer.marketing_email_consent);
}

export function ExactBulkEmailComposer({ open, customers, onClose }: Props) {
  const { error: toastError, success: toastSuccess } = useExactToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendRun, setSendRun] = useState<SendRun | null>(null);

  const applyTemplate = (nextKey: string, source = templates) => {
    const next = source.find((item) => item.template_key === nextKey) || source[0];
    if (!next) return;
    setTemplateKey(next.template_key);
    setSubject(String(next.fields?.subject || ""));
    setMessage(messageFromFields(next.fields));
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSendRun(null);
    void adminRequest<{ templates?: EmailTemplate[] }>("/api/email/templates", { force: true })
      .then((result) => {
        if (cancelled) return;
        const next = (result.templates || []).filter((item) => item.enabled !== false);
        setTemplates(next);
        const first = next[0];
        if (first) {
          setTemplateKey(first.template_key);
          setSubject(String(first.fields?.subject || ""));
          setMessage(messageFromFields(first.fields));
        }
      })
      .catch((caught) => {
        if (!cancelled) toastError(caught instanceof Error ? caught.message : "E-posta şablonları alınamadı.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, toastError]);

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.template_key === templateKey) || templates[0] || null,
    [templateKey, templates],
  );
  const eligibleCustomers = useMemo(
    () => customers.filter((customer) => eligible(customer, selectedTemplate)),
    [customers, selectedTemplate],
  );

  const send = async () => {
    if (!selectedTemplate) {
      toastError("Gönderim için bir şablon seç.");
      return;
    }
    if (!subject.trim() || !message.trim()) {
      toastError("Mail konusu ve metni zorunlu.");
      return;
    }
    if (!eligibleCustomers.length) {
      toastError("Seçili müşteriler arasında bu mail türüne uygun alıcı yok.");
      return;
    }

    const fields = {
      ...(selectedTemplate.fields || {}),
      subject: subject.trim(),
      intro: message.trim(),
      offer: "",
      note: "",
    };
    const recipients = eligibleCustomers.flatMap((customer) => customer.email ? [{
      id: customer.id,
      email: customer.email,
      name: nameOf(customer),
      group: customer.order_count > 0 ? "purchased" : "not_purchased",
      order_count: customer.order_count,
      total_spent: customer.total_spent,
      last_order_no: customer.last_order_no || "",
    }] : []);

    let run: SendRun = {
      total: recipients.length,
      completed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    setSendRun(run);
    setSending(true);

    for (let index = 0; index < recipients.length; index += 1) {
      const recipient = recipients[index];
      try {
        const result = await adminRequest<BulkSendResult>("/api/email/bulk-send", {
          method: "POST",
          timeoutMs: 90_000,
          invalidate: index === recipients.length - 1 ? ["/api/email"] : false,
          body: JSON.stringify({ template_key: selectedTemplate.template_key, fields, recipients: [recipient] }),
        });

        if (Number(result.sent || 0) > 0) run = { ...run, sent: run.sent + 1 };
        else if (Number(result.skipped || 0) > 0) run = { ...run, skipped: run.skipped + 1 };
        else run = {
          ...run,
          failed: run.failed + 1,
          errors: [...run.errors, result.errors?.[0] || `${recipient.email}: Gönderilemedi.`],
        };
      } catch (caught) {
        run = {
          ...run,
          failed: run.failed + 1,
          errors: [...run.errors, `${recipient.email}: ${caught instanceof Error ? caught.message : "Gönderilemedi."}`],
        };
      }

      run = { ...run, completed: index + 1 };
      setSendRun(run);
    }

    setSending(false);
    const summary = `${run.sent}/${run.total} müşteriye e-posta gönderildi${run.failed ? ` · ${run.failed} başarısız` : ""}${run.skipped ? ` · ${run.skipped} atlandı` : ""}.`;
    if (run.failed > 0) toastError(summary);
    else {
      toastSuccess(summary);
      onClose();
    }
  };

  const progressPercent = sendRun?.total ? Math.round((sendRun.completed / sendRun.total) * 100) : 0;

  return (
    <ExactDetailDrawer
      open={open}
      onClose={sending ? () => {} : onClose}
      title="Toplu E-posta Gönder"
      subtitle={`${customers.length} seçili müşteri · ${eligibleCustomers.length} uygun alıcı`}
      width={640}
      footer={(
        <ExactButton className="w-full" onClick={() => void send()} loading={sending} disabled={!eligibleCustomers.length || loading}>
          <Send className="h-4 w-4" /> {eligibleCustomers.length} kişiye gönder
        </ExactButton>
      )}
    >
      {loading ? (
        <div className="space-y-3"><ExactSkeleton className="h-12" /><ExactSkeleton className="h-12" /><ExactSkeleton className="h-64" /></div>
      ) : (
        <div className="space-y-4">
          {sendRun ? (
            <div className="rounded-[var(--radius-small)] border border-border-subtle bg-surface-secondary p-3">
              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                <span>{sending ? "Gönderim devam ediyor" : "Gönderim sonucu"}</span>
                <span>{sendRun.completed}/{sendRun.total} · %{progressPercent}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-tertiary">
                <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><p className="text-subtle">Gönderildi</p><p className="mt-0.5 font-semibold text-success-foreground">{sendRun.sent}</p></div>
                <div><p className="text-subtle">Başarısız</p><p className="mt-0.5 font-semibold text-danger-foreground">{sendRun.failed}</p></div>
                <div><p className="text-subtle">Atlandı</p><p className="mt-0.5 font-semibold text-warning-foreground">{sendRun.skipped}</p></div>
              </div>
              {sendRun.errors.length > 0 ? <div className="mt-3 space-y-1 text-[11px] text-danger">{sendRun.errors.slice(0, 5).map((error, index) => <p key={`${error}-${index}`}>{error}</p>)}</div> : null}
            </div>
          ) : null}

          <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3 text-xs text-muted">
            <div className="flex items-center gap-2 font-semibold text-main"><Mail className="h-4 w-4 text-accent" /> Şablonlar tek merkezden yönetilir</div>
            <p className="mt-1">Buradaki liste E-posta → Şablonlar sayfasındaki güncel kayıtlarla aynıdır. Konu ve metni bu gönderim için ayrıca düzenleyebilirsin.</p>
          </div>

          <ExactField label="Hazır şablon">
            <Picker
              value={templateKey}
              onValueChange={applyTemplate}
              options={templates.map((template) => ({ value: template.template_key, label: template.name, description: template.description || undefined }))}
              label="Hazır şablon"
              placeholder="Şablon bulunamadı"
              className={exactFormInputClass}
              disabled={sending || templates.length === 0}
            />
          </ExactField>

          {selectedTemplate?.description ? <p className="text-xs text-muted">{selectedTemplate.description}</p> : null}

          <ExactField label="Konu" required>
            <input value={subject} onChange={(event) => setSubject(event.target.value)} className={exactFormInputClass} disabled={sending} />
          </ExactField>
          <ExactField label="Mesaj" required>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} className={`${exactFormInputClass} min-h-64`} disabled={sending} />
          </ExactField>

          <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3 text-xs text-muted">
            <p><strong className="text-main">Seçili:</strong> {customers.length}</p>
            <p className="mt-1"><strong className="text-main">Bu şablona uygun:</strong> {eligibleCustomers.length}</p>
            <p className="mt-1">Pazarlama gönderilerinde yalnız kayıtlı izin durumu “granted” olan müşteriler; hizmet maillerinde hizmet e-postası açık olanlar gönderime alınır.</p>
          </div>
        </div>
      )}
    </ExactDetailDrawer>
  );
}
