"use client";

import Link from "next/link";
import { ArrowLeft, Check, Mail, RefreshCw, Search, Send, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import type { EmailTemplateFields } from "@/lib/emailTemplates";
import {
  ExactButton,
  ExactField,
  ExactFormModal,
  ExactIconButton,
  ExactPageHeader,
  ExactSearchInput,
  ExactSegmentedControl,
  ExactSkeleton,
  ExactStatusBadge,
  exactFormInputClass,
  useExactToast,
} from "./primitives";
import { ExactAvatar, ExactDataCard, ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn } from "./data";

type Customer = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_member: boolean;
  marketing_email_consent: boolean;
  service_email_allowed?: boolean;
  total_spent: number;
  order_count: number;
  reward_points_balance: number;
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

type Audience = "all" | "members" | "vip" | "points" | "manual";
type SendProgressStatus = "queued" | "sending" | "sent" | "failed" | "skipped";

type SendProgressItem = {
  customerId: string;
  email: string;
  name: string;
  status: SendProgressStatus;
  error?: string;
};

type BulkSendResult = {
  sent?: number;
  failed?: number;
  skipped?: number;
  errors?: string[];
};

const OWNER_TEST_EMAILS = new Set(["ruthistanbull@gmail.com"]);

function normalizedEmail(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("en-US");
}

function isOwnerTestCustomer(customer: Customer) {
  return OWNER_TEST_EMAILS.has(normalizedEmail(customer.email));
}

function nameOf(customer: Customer) {
  return customer.full_name || customer.email || customer.phone || "İsimsiz müşteri";
}

function money(value: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function allowedForTemplate(customer: Customer, template?: EmailTemplate | null) {
  if (!customer.email || !template) return false;
  // Ruth owner's own customer record is intentionally a permanent test recipient.
  // It must stay selectable even when the selected template normally requires a
  // storefront membership/consent state, so every email flow can be tested safely.
  if (isOwnerTestCustomer(customer)) return true;
  if (template.template_key === "account_migrated") return Boolean(customer.is_member && customer.service_email_allowed);
  if (template.type === "service") return Boolean(customer.service_email_allowed);
  return Boolean(customer.marketing_email_consent);
}

function templateMessage(template?: EmailTemplate | null) {
  return [template?.fields?.intro, template?.fields?.offer, template?.fields?.note].filter(Boolean).join("\n\n");
}

function progressBadge(item: SendProgressItem) {
  if (item.status === "sent") return <ExactStatusBadge status="success" tone="success" label="Gönderildi" size="sm" />;
  if (item.status === "failed") return <ExactStatusBadge status="failed" tone="danger" label="Başarısız" size="sm" />;
  if (item.status === "skipped") return <ExactStatusBadge status="skipped" tone="warning" label="Atlandı" size="sm" />;
  if (item.status === "sending") return <ExactStatusBadge status="sending" tone="info" label="Gönderiliyor" size="sm" />;
  return <ExactStatusBadge status="queued" tone="neutral" label="Sırada" size="sm" />;
}

export function ExactEmailCustomers() {
  const toast = useExactToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendProgressOpen, setSendProgressOpen] = useState(false);
  const [sendProgress, setSendProgress] = useState<SendProgressItem[]>([]);

  const chooseTemplateFrom = useCallback((key: string, source: EmailTemplate[]) => {
    const next = source.find((item) => item.template_key === key) || source[0];
    if (!next) return;
    setTemplateKey(next.template_key);
    setSubject(String(next.fields?.subject || ""));
    setMessage(templateMessage(next));
    setSelectedIds((current) => current.filter((id) => {
      const customer = customers.find((item) => item.id === id);
      return Boolean(customer && allowedForTemplate(customer, next));
    }));
  }, [customers]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [customerResult, templateResult] = await Promise.all([
        adminRequest<{ customers?: Customer[] }>("/api/customers/list?page=1&pageSize=500&membership=all&sort=spent", { force: true }),
        adminRequest<{ templates?: EmailTemplate[] }>("/api/email/templates", { force: true }),
      ]);
      const nextCustomers = customerResult.customers || [];
      const nextTemplates = (templateResult.templates || []).filter((template) => template.enabled !== false);
      setCustomers(nextCustomers);
      setTemplates(nextTemplates);
      const selectedTemplate = nextTemplates.find((item) => item.template_key === templateKey) || nextTemplates[0];
      if (selectedTemplate) {
        setTemplateKey(selectedTemplate.template_key);
        setSubject(String(selectedTemplate.fields?.subject || ""));
        setMessage(templateMessage(selectedTemplate));
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Müşteriler veya e-posta şablonları alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [templateKey, toast]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chosenTemplate = useMemo(
    () => templates.find((template) => template.template_key === templateKey) || templates[0] || null,
    [templateKey, templates],
  );

  const allowedCustomers = useMemo(
    () => customers.filter((customer) => allowedForTemplate(customer, chosenTemplate)),
    [chosenTemplate, customers],
  );

  const listCustomers = useMemo(() => {
    if (audience === "manual" || audience === "all") return customers;
    return customers.filter((customer) => {
      if (audience === "members") return customer.is_member;
      if (audience === "vip") return customer.total_spent >= 10_000;
      if (audience === "points") return customer.reward_points_balance > 0;
      return true;
    });
  }, [audience, customers]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return listCustomers.filter((customer) => {
      if (!needle) return true;
      return `${nameOf(customer)} ${customer.email || ""} ${customer.phone || ""}`.toLocaleLowerCase("tr-TR").includes(needle);
    });
  }, [listCustomers, query]);

  const audienceCustomers = useMemo(() => {
    const source = audience === "manual"
      ? customers.filter((customer) => selectedIds.includes(customer.id))
      : listCustomers;
    return source.filter((customer) => allowedForTemplate(customer, chosenTemplate));
  }, [audience, chosenTemplate, customers, listCustomers, selectedIds]);

  const selectedCustomers = useMemo(
    () => customers.filter((customer) => selectedIds.includes(customer.id) && allowedForTemplate(customer, chosenTemplate)),
    [chosenTemplate, customers, selectedIds],
  );

  const sendCustomers = useMemo(
    () => selectedIds.length > 0 ? selectedCustomers : audienceCustomers,
    [audienceCustomers, selectedCustomers, selectedIds.length],
  );

  const progressByCustomer = useMemo(
    () => new Map(sendProgress.map((item) => [item.customerId, item])),
    [sendProgress],
  );

  const progressCounts = useMemo(() => {
    const sent = sendProgress.filter((item) => item.status === "sent").length;
    const failed = sendProgress.filter((item) => item.status === "failed").length;
    const skipped = sendProgress.filter((item) => item.status === "skipped").length;
    const sendingNow = sendProgress.filter((item) => item.status === "sending").length;
    const queued = sendProgress.filter((item) => item.status === "queued").length;
    return {
      total: sendProgress.length,
      sent,
      failed,
      skipped,
      remaining: queued + sendingNow,
      completed: sent + failed + skipped,
    };
  }, [sendProgress]);

  const toggleAll = () => {
    const selectable = visible.filter((customer) => allowedForTemplate(customer, chosenTemplate));
    setSelectedIds((current) => selectable.length > 0 && selectable.every((customer) => current.includes(customer.id))
      ? current.filter((id) => !selectable.some((customer) => customer.id === id))
      : [...new Set([...current, ...selectable.map((customer) => customer.id)])]);
  };

  const chooseTemplate = (key: string) => {
    chooseTemplateFrom(key, templates);
  };

  const send = async () => {
    if (!chosenTemplate) {
      toast.error("Gönderim için bir şablon seç.");
      return;
    }
    if (!subject.trim() || !message.trim()) {
      toast.error("Mail konusu ve metni zorunlu.");
      return;
    }

    const recipients = sendCustomers.flatMap((customer) => customer.email ? [{
      id: customer.id,
      email: customer.email,
      name: nameOf(customer),
      group: customer.order_count > 0 ? "purchased" : "not_purchased",
      order_count: customer.order_count,
      total_spent: customer.total_spent,
      last_order_no: customer.last_order_no || "",
    }] : []);

    if (!recipients.length) {
      toast.error(selectedIds.length > 0 ? "Seçtiğin müşteriler arasında bu mail türüne uygun alıcı yok." : "Bu filtrede bu mail türüne uygun alıcı yok.");
      return;
    }
    if (recipients.length > 300) {
      toast.error("Tek gönderimde en fazla 300 alıcı seçilebilir.");
      return;
    }

    const fields = {
      ...(chosenTemplate.fields || {}),
      subject: subject.trim(),
      intro: message.trim(),
      offer: "",
      note: "",
    };

    let currentProgress: SendProgressItem[] = recipients.map((recipient) => ({
      customerId: recipient.id,
      email: recipient.email,
      name: recipient.name,
      status: "queued",
    }));

    const updateRecipient = (customerId: string, patch: Partial<SendProgressItem>) => {
      currentProgress = currentProgress.map((item) => item.customerId === customerId ? { ...item, ...patch } : item);
      setSendProgress(currentProgress);
    };

    setSendProgress(currentProgress);
    setSendProgressOpen(true);
    setSending(true);

    for (let index = 0; index < recipients.length; index += 1) {
      const recipient = recipients[index];
      updateRecipient(recipient.id, { status: "sending", error: undefined });

      try {
        const result = await adminRequest<BulkSendResult>("/api/email/bulk-send", {
          method: "POST",
          timeoutMs: 90_000,
          invalidate: index === recipients.length - 1 ? ["/api/email"] : false,
          body: JSON.stringify({ template_key: chosenTemplate.template_key, fields, recipients: [recipient] }),
        });

        if (Number(result.sent || 0) > 0) {
          updateRecipient(recipient.id, { status: "sent", error: undefined });
        } else if (Number(result.skipped || 0) > 0) {
          updateRecipient(recipient.id, { status: "skipped", error: "Gönderim izni veya uygunluk durumu nedeniyle atlandı." });
        } else {
          updateRecipient(recipient.id, {
            status: "failed",
            error: result.errors?.[0] || "E-posta sağlayıcısı gönderimi tamamlayamadı.",
          });
        }
      } catch (caught) {
        updateRecipient(recipient.id, {
          status: "failed",
          error: caught instanceof Error ? caught.message : "E-posta gönderilemedi.",
        });
      }
    }

    const finalSent = currentProgress.filter((item) => item.status === "sent").length;
    const finalFailed = currentProgress.filter((item) => item.status === "failed").length;
    const finalSkipped = currentProgress.filter((item) => item.status === "skipped").length;
    setSending(false);

    const summary = `${finalSent}/${recipients.length} müşteriye e-posta gönderildi${finalFailed ? ` · ${finalFailed} başarısız` : ""}${finalSkipped ? ` · ${finalSkipped} atlandı` : ""}.`;
    if (finalFailed > 0) toast.error(summary);
    else toast.success(summary);
  };

  const columns: ExactColumn<Customer>[] = [
    {
      key: "select",
      label: "",
      render: (customer) => {
        const allowed = allowedForTemplate(customer, chosenTemplate);
        return <input
          type="checkbox"
          checked={selectedIds.includes(customer.id)}
          disabled={!allowed || sending}
          onChange={(event) => {
            event.stopPropagation();
            setSelectedIds((current) => current.includes(customer.id) ? current.filter((id) => id !== customer.id) : [...current, customer.id]);
          }}
        />;
      },
    },
    { key: "full_name", label: "Müşteri", render: (customer) => <div className="flex items-center gap-2"><ExactAvatar name={nameOf(customer)} size="sm" /><div><p className="text-sm font-medium text-main">{nameOf(customer)}</p><p className="text-[10px] text-subtle">{customer.email || "E-posta yok"}</p></div></div> },
    {
      key: "marketing_email_consent",
      label: "Gönderim",
      align: "center",
      render: (customer) => {
        const progress = progressByCustomer.get(customer.id);
        if (progress) return progressBadge(progress);
        return <ExactStatusBadge status={allowedForTemplate(customer, chosenTemplate) ? "active" : "archived"} label={allowedForTemplate(customer, chosenTemplate) ? "Uygun" : "Uygun değil"} size="sm" />;
      },
    },
    { key: "total_spent", label: "Harcama", align: "right", render: (customer) => <span className="font-semibold text-main">{money(customer.total_spent)}</span> },
    { key: "order_count", label: "Sipariş", align: "right", render: (customer) => <span className="text-muted">{customer.order_count}</span> },
  ];

  const visibleSelectable = visible.filter((customer) => allowedForTemplate(customer, chosenTemplate));
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((customer) => selectedIds.includes(customer.id));
  const progressPercent = progressCounts.total > 0 ? Math.round((progressCounts.completed / progressCounts.total) * 100) : 0;

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="email-customers">
    <ExactPageHeader
      title="Müşterilere E-posta Gönder"
      subtitle={`${customers.length} toplam müşteri · ${sendCustomers.length} gönderilecek alıcı`}
      actions={<><Link href="/email"><ExactButton variant="secondary" size="sm"><ArrowLeft className="h-4 w-4" /> E-posta merkezi</ExactButton></Link><ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load()} loading={loading} /></>}
    />

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <ExactMetricCard label="Toplam Müşteri" value={customers.length} icon={UsersRound} />
      <ExactMetricCard label="Bu Şablona Uygun" value={allowedCustomers.length} icon={Mail} />
      <ExactMetricCard label="Üyeler" value={customers.filter((customer) => customer.is_member).length} icon={Check} />
      <ExactMetricCard label="Seçili" value={selectedIds.length} icon={UsersRound} />
    </div>

    <div className="grid xl:grid-cols-[1fr_420px] gap-4 items-start">
      <div className="space-y-3">
        <ExactSegmentedControl
          value={audience}
          onChange={(value) => setAudience(value as Audience)}
          options={[
            { value: "all", label: "Tüm Müşteriler" },
            { value: "members", label: "Üyeler" },
            { value: "vip", label: "VIP" },
            { value: "points", label: "Puanlılar" },
            { value: "manual", label: "Manuel Seçim" },
          ]}
        />
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} disabled={!visibleSelectable.length || sending} /> Uygun görünenleri seç
          </label>
          <ExactSearchInput value={query} onChange={setQuery} placeholder="Müşteri ara..." className="flex-1" />
        </div>
        {loading ? <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div> : <ExactDataTable columns={columns} data={visible} emptyState={<ExactEmptyState icon={Search} title="Bu filtrede müşteri bulunamadı" />} />}
      </div>

      <div className="xl:sticky xl:top-20">
        <ExactDataCard title="E-posta İçeriği">
          <div className="space-y-3">
            <ExactField label="Hazır şablon">
              <select value={templateKey} onChange={(event) => chooseTemplate(event.target.value)} className={exactFormInputClass} disabled={sending}>
                {templates.map((template) => <option key={template.template_key} value={template.template_key}>{template.name}</option>)}
              </select>
            </ExactField>
            <div className="p-3 radius-small bg-surface-secondary text-xs text-muted">
              <p className="font-semibold text-main">{chosenTemplate?.name || "Şablon bulunamadı"}</p>
              <p className="mt-1">{chosenTemplate?.description || "E-posta → Şablonlar sayfasındaki güncel kayıt kullanılır."}</p>
              <p className="mt-1 text-accent">Şablonlar sayfasında kaydettiğin değişiklikler burada otomatik olarak aynı kaynaktan okunur.</p>
            </div>
            <ExactField label="Konu" required><input value={subject} onChange={(event) => setSubject(event.target.value)} className={exactFormInputClass} placeholder="Yeni koleksiyon Ruth Istanbul’da" disabled={sending} /></ExactField>
            <ExactField label="Mesaj" required><textarea value={message} onChange={(event) => setMessage(event.target.value)} className={`${exactFormInputClass} min-h-64`} placeholder="Merhaba {{customer_name}}, ..." disabled={sending} /></ExactField>
            <div className="p-3 radius-small bg-surface-secondary text-xs text-muted">
              <p><strong className="text-main">Alıcı:</strong> {sendCustomers.length}</p>
              <p className="mt-1"><strong className="text-main">Kişiselleştirme:</strong> {"{{customer_name}}"} kullanılabilir.</p>
              <p className="mt-1"><strong className="text-main">Liste:</strong> İzin durumu ne olursa olsun bütün müşteriler görünür; gönderim yalnız seçilen mail türüne gerçekten uygun kayıtlara yapılır.</p>
            </div>
            <ExactButton size="lg" className="w-full" onClick={() => void send()} loading={sending} disabled={!sendCustomers.length}><Send className="h-4 w-4" /> {sendCustomers.length} kişiye gönder</ExactButton>
          </div>
        </ExactDataCard>
      </div>
    </div>

    <ExactFormModal
      open={sendProgressOpen}
      onClose={() => { if (!sending) setSendProgressOpen(false); }}
      title={sending ? "E-posta gönderiliyor" : "E-posta gönderimi tamamlandı"}
      subtitle={`${progressCounts.completed}/${progressCounts.total} alıcı işlendi`}
      size="lg"
      dismissalPolicy="explicit-dismiss"
      footer={!sending ? <ExactButton onClick={() => setSendProgressOpen(false)}>Kapat</ExactButton> : undefined}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="p-3 radius-small bg-surface-secondary"><p className="text-[10px] uppercase tracking-wide text-subtle">Toplam</p><p className="mt-1 text-lg font-semibold text-main">{progressCounts.total}</p></div>
          <div className="p-3 radius-small bg-success-soft"><p className="text-[10px] uppercase tracking-wide text-success-foreground">Gönderildi</p><p className="mt-1 text-lg font-semibold text-success-foreground">{progressCounts.sent}</p></div>
          <div className="p-3 radius-small bg-danger-soft"><p className="text-[10px] uppercase tracking-wide text-danger-foreground">Başarısız</p><p className="mt-1 text-lg font-semibold text-danger-foreground">{progressCounts.failed}</p></div>
          <div className="p-3 radius-small bg-warning-soft"><p className="text-[10px] uppercase tracking-wide text-warning-foreground">Atlandı</p><p className="mt-1 text-lg font-semibold text-warning-foreground">{progressCounts.skipped}</p></div>
          <div className="p-3 radius-small bg-surface-secondary"><p className="text-[10px] uppercase tracking-wide text-subtle">Kalan</p><p className="mt-1 text-lg font-semibold text-main">{progressCounts.remaining}</p></div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span>{sending ? "Gönderim devam ediyor" : "Gönderim tamamlandı"}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-tertiary">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border-subtle">
          {sendProgress.map((item, index) => <div key={item.customerId} className={`flex items-start gap-3 px-3 py-3 ${index > 0 ? "border-t border-border-subtle" : ""}`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-main truncate">{item.name}</p>
              <p className="text-[11px] text-subtle truncate">{item.email}</p>
              {item.error ? <p className="mt-1 text-[11px] text-danger">{item.error}</p> : null}
            </div>
            <div className="shrink-0">{progressBadge(item)}</div>
          </div>)}
        </div>

        {sending ? <p className="text-xs text-muted">Gönderim sırasında pencere açık kalır. Her müşteri sonucu geldiği anda yukarıdaki sayaçlar ve müşteri satırındaki durum otomatik güncellenir.</p> : null}
      </div>
    </ExactFormModal>
  </div>;
}
