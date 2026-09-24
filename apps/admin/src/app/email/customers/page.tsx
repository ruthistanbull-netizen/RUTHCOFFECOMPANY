"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, Eye, Mail, RefreshCw, Search, Send, UsersRound, X } from "lucide-react";
import { LoadingIndicator } from "@ruth-commerce/ui";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { formatDateTime, formatMoney } from "@/lib/format";
import { buildMarketingEmailHtml, getReadyEmailTemplate, readyEmailTemplates, type EmailTemplateFields, type EmailTemplateKey } from "@/lib/emailTemplates";

type CustomerGroup = "all" | "purchased" | "not_purchased";
type Customer = {
  email: string;
  name: string;
  phone: string;
  group: "purchased" | "not_purchased";
  order_count: number;
  total_spent: number;
  last_order_no: string;
  last_order_at: string | null;
  terms_accepted?: boolean;
  marketing_email_consent?: boolean;
  marketing_email_status?: "granted" | "denied" | "unknown";
  marketing_email_consent_at?: string | null;
  consent_source?: string | null;
  service_email_allowed?: boolean;
  is_member?: boolean;
};

const serviceTemplates = new Set<EmailTemplateKey>(["account_migrated", "site_moved"]);
const groupLabels: Record<CustomerGroup, string> = { all: "Tüm müşteriler", purchased: "Satın alanlar", not_purchased: "Satın almayanlar" };

function eligible(customer: Customer, templateKey: EmailTemplateKey) {
  if (templateKey === "account_migrated") {
    return Boolean(customer.is_member && customer.service_email_allowed);
  }
  if (serviceTemplates.has(templateKey)) return Boolean(customer.service_email_allowed);
  return Boolean(customer.marketing_email_consent);
}

export default function EmailCustomersPage() {
  const searchParams = useSearchParams();
  const initialTemplate = getReadyEmailTemplate(searchParams.get("template") || "soft_discount");
  const [customers, setCustomers] = useState<Record<CustomerGroup, Customer[]>>({ all: [], purchased: [], not_purchased: [] });
  const [counts, setCounts] = useState<Record<CustomerGroup, number>>({ all: 0, purchased: 0, not_purchased: 0 });
  const [group, setGroup] = useState<CustomerGroup>("purchased");
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [selected, setSelected] = useState<string[]>([]);
  const [templateKey, setTemplateKey] = useState<EmailTemplateKey>(initialTemplate.key);
  const [fields, setFields] = useState<EmailTemplateFields>(initialTemplate.fields);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendOrigin, setSendOrigin] = useState<"header" | "composer" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (mode: "load" | "refresh" = "load") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await adminRequest<{ customers?: Record<CustomerGroup, Customer[]>; counts?: Record<CustomerGroup, number> }>(`/api/email/customers?q=${encodeURIComponent(query.trim())}`);
      setCustomers(result.customers || { all: [], purchased: [], not_purchased: [] });
      setCounts(result.counts || { all: 0, purchased: 0, not_purchased: 0 });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Müşteri alıcı listesi alınamadı.");
    } finally {
      if (mode === "refresh") setRefreshing(false);
      else setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query ? 260 : 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visible = customers[group] || [];
  const selectable = useMemo(() => visible.filter((customer) => eligible(customer, templateKey)), [templateKey, visible]);
  const selectedCustomers = useMemo(() => visible.filter((customer) => selected.includes(customer.email) && eligible(customer, templateKey)), [selected, templateKey, visible]);
  const allSelected = selectable.length > 0 && selectable.every((customer) => selected.includes(customer.email));
  const template = getReadyEmailTemplate(templateKey);

  const previewHtml = useMemo(() => buildMarketingEmailHtml(fields, {
    customer_name: selectedCustomers[0]?.name || "Ayşe",
    last_order_no: selectedCustomers[0]?.last_order_no || "RTH1234",
    order_count: selectedCustomers[0]?.order_count || 2,
    total_spent: selectedCustomers[0]?.total_spent || 2480,
    checkout_url: "https://ruthistanbull.tr/checkout",
    review_url: "https://ruthistanbull.tr/account/orders",
    activation_url: "https://ruthistanbull.tr/account/activate",
  }), [fields, selectedCustomers]);

  const chooseTemplate = (key: string) => {
    const next = getReadyEmailTemplate(key);
    setTemplateKey(next.key);
    setFields(next.fields);
    setSelected((current) => current.filter((email) => visible.some((customer) => customer.email === email && eligible(customer, next.key))));
  };

  const toggleAll = () => {
    const emails = selectable.map((customer) => customer.email);
    setSelected((current) => allSelected ? current.filter((email) => !emails.includes(email)) : [...new Set([...current, ...emails])]);
  };

  const send = async (origin: "header" | "composer") => {
    if (!selectedCustomers.length) {
      setError("Gönderim için en az bir uygun müşteri seç.");
      return;
    }
    setSending(true);
    setSendOrigin(origin);
    setError(null);
    setNotice(null);
    try {
      const result = await adminRequest<{ sent?: number; failed?: number; error?: string }>("/api/email/bulk-send", {
        method: "POST",
        body: JSON.stringify({ template_key: templateKey, fields, recipients: selectedCustomers }),
      });
      if (!result.sent && result.failed) throw new Error(result.error || `${result.failed} gönderim başarısız oldu.`);
      setNotice(`${result.sent || 0} e-posta başarıyla gönderildi${result.failed ? `, ${result.failed} hata oluştu` : ""}.`);
      setSelected([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Toplu e-posta gönderilemedi.");
    } finally {
      setSending(false);
      setSendOrigin(null);
    }
  };

  return (
    <>
      <header className="cr-page-header"><div><span className="cr-eyebrow">E-posta kampanyası</span><h1>Müşterilere gönder</h1><p className="cr-description">İzin ve üyelik durumuna uygun alıcıları seç, içeriği kişiselleştir, canlı önizleme sonrası kontrollü gönder.</p></div><div className="cr-actions"><Link className="cr-button cr-button--secondary" href="/email"><ArrowLeft aria-hidden="true" /> E-posta merkezi</Link><button className="cr-button cr-button--secondary" type="button" onClick={() => void load("refresh")} disabled={loading || refreshing} aria-busy={refreshing || undefined}>{refreshing ? <LoadingIndicator size="sm" label="Alıcı listesi yenileniyor" /> : <RefreshCw aria-hidden="true" />} Yenile</button><button className="cr-button cr-button--primary" type="button" onClick={() => void send("header")} disabled={!selectedCustomers.length || sending} aria-busy={sending && sendOrigin === "header" || undefined} data-confirm-message="Seçili müşterilere e-posta hemen gönderilecek. Devam edilsin mi?">{sending && sendOrigin === "header" ? <LoadingIndicator size="sm" label="E-postalar gönderiliyor" /> : <Send aria-hidden="true" />} Gönder ({selectedCustomers.length})</button></div></header>

      {error ? <div className="cr-notice cr-notice--danger"><AlertTriangle aria-hidden="true" /><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Hata bildirimini kapat"><X aria-hidden="true" /></button></div> : null}
      {notice ? <div className="cr-notice cr-notice--success"><Check aria-hidden="true" /><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Başarı bildirimini kapat"><X aria-hidden="true" /></button></div> : null}
      {templateKey === "account_migrated" ? <div className="cr-notice cr-notice--info"><Mail aria-hidden="true" /><span>Bu hesap hizmeti şablonu yalnız üyeliği bulunan ve hizmet e-postası açık müşterilere gönderilir.</span></div> : serviceTemplates.has(templateKey) ? <div className="cr-notice cr-notice--info"><Mail aria-hidden="true" /><span>Bu bir hizmet bilgilendirme şablonu. Üye olmayan satın alanlar da hizmet e-postası açık olduğu için seçilebilir.</span></div> : null}

      <section className="cr-email-compose-layout"><article className="cr-card cr-email-recipients"><div className="cr-card__header"><div><span className="cr-eyebrow">Alıcılar</span><h2>Müşteri grubu</h2></div><span className="cr-status cr-status--new">{selectedCustomers.length} seçili</span></div><div className="cr-email-group-tabs">{(Object.keys(groupLabels) as CustomerGroup[]).map((key) => <button key={key} type="button" className={group === key ? "is-active" : ""} onClick={() => { setGroup(key); setSelected([]); }}>{groupLabels[key]} <strong>{counts[key] || 0}</strong></button>)}</div><div className="cr-customer-toolbar"><label className="cr-search-field"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="İsim, e-posta veya telefon ara" />{query ? <button type="button" onClick={() => setQuery("")} aria-label="Alıcı aramasını temizle"><X aria-hidden="true" /></button> : null}</label><label className="cr-points-select-all"><input type="checkbox" checked={allSelected} onChange={toggleAll} /><span>Uygunların tümünü seç</span></label></div>{loading ? <div className="cr-loading" role="status" aria-busy="true"><LoadingIndicator size="md" label="Alıcılar yükleniyor" /><strong>Alıcılar yükleniyor</strong></div> : null}{!loading && visible.length === 0 ? <div className="cr-empty"><UsersRound aria-hidden="true" /><strong>Bu grupta müşteri yok</strong></div> : null}<div className="cr-email-customer-list">{visible.map((customer) => { const allowed = eligible(customer, templateKey); return <article key={customer.email}><label><input type="checkbox" checked={selected.includes(customer.email)} disabled={!allowed} onChange={() => setSelected((current) => current.includes(customer.email) ? current.filter((email) => email !== customer.email) : [...current, customer.email])} aria-label={`${customer.name || customer.email} alıcısını seç`} /></label><div><strong>{customer.name || "İsimsiz müşteri"}</strong><span>{customer.email}{customer.phone ? ` · ${customer.phone}` : ""}</span><small>{customer.group === "purchased" ? `${customer.order_count} sipariş · ${formatMoney(customer.total_spent)}${customer.last_order_at ? ` · ${formatDateTime(customer.last_order_at)}` : ""}` : "Satın alma yok"}</small></div><div className="cr-email-consent"><span className={`cr-payment-pill cr-payment-pill--${customer.is_member ? "success" : "neutral"}`}>{customer.is_member ? "Üye" : "Üye değil"}</span><span className={`cr-payment-pill cr-payment-pill--${customer.service_email_allowed ? "success" : "danger"}`}>Hizmet {customer.service_email_allowed ? "açık" : "kapalı"}</span><span className={`cr-payment-pill cr-payment-pill--${customer.marketing_email_consent ? "success" : customer.marketing_email_status === "denied" ? "danger" : "neutral"}`}>Pazarlama {customer.marketing_email_consent ? "izinli" : customer.marketing_email_status === "denied" ? "ret" : "belirsiz"}</span>{!allowed ? <span className="cr-payment-pill cr-payment-pill--danger">Uygun değil</span> : null}</div></article>; })}</div></article>

        <aside className="cr-card cr-email-composer"><div className="cr-card__header"><div><span className="cr-eyebrow">İçerik</span><h2>Mail oluşturucu</h2></div><Mail aria-hidden="true" /></div><div className="cr-email-composer__body"><label className="cr-field"><span>Hazır şablon</span><select value={templateKey} onChange={(event) => chooseTemplate(event.target.value)}>{readyEmailTemplates.map((item) => <option key={item.key} value={item.key}>{item.title}</option>)}</select></label><div className="cr-template-description"><strong>{template.title}</strong><span>{template.description}</span></div><label className="cr-field"><span>Konu</span><input value={fields.subject} onChange={(event) => setFields({ ...fields, subject: event.target.value })} /></label><label className="cr-field"><span>Ön açıklama</span><input value={fields.preheader} onChange={(event) => setFields({ ...fields, preheader: event.target.value })} /></label><label className="cr-field"><span>Büyük başlık</span><input value={fields.headline} onChange={(event) => setFields({ ...fields, headline: event.target.value })} /></label><label className="cr-field"><span>Giriş yazısı</span><textarea rows={4} value={fields.intro} onChange={(event) => setFields({ ...fields, intro: event.target.value })} /></label><label className="cr-field"><span>Teklif / açıklama</span><textarea rows={3} value={fields.offer} onChange={(event) => setFields({ ...fields, offer: event.target.value })} /></label><div className="cr-email-field-grid"><label className="cr-field"><span>Buton yazısı</span><input value={fields.buttonLabel} onChange={(event) => setFields({ ...fields, buttonLabel: event.target.value })} /></label><label className="cr-field"><span>Buton linki</span><input value={fields.buttonUrl} onChange={(event) => setFields({ ...fields, buttonUrl: event.target.value })} /></label></div><label className="cr-field"><span>Hero görsel URL</span><input value={fields.heroImageUrl} onChange={(event) => setFields({ ...fields, heroImageUrl: event.target.value })} /></label><label className="cr-field"><span>Alt not</span><textarea rows={2} value={fields.note} onChange={(event) => setFields({ ...fields, note: event.target.value })} /></label><div className="cr-notice cr-notice--info"><Mail aria-hidden="true" /><span>Değişkenler: {"{{customer_name}}"}, {"{{last_order_no}}"}, {"{{checkout_url}}"}, {"{{review_url}}"}.</span></div><button className="cr-button cr-button--primary cr-button--block" type="button" onClick={() => void send("composer")} disabled={!selectedCustomers.length || sending} aria-busy={sending && sendOrigin === "composer" || undefined} data-confirm-message="Seçili müşterilere e-posta hemen gönderilecek. Devam edilsin mi?">{sending && sendOrigin === "composer" ? <LoadingIndicator size="sm" label="E-postalar gönderiliyor" /> : <Send aria-hidden="true" />} {selectedCustomers.length} kişiye gönder</button></div></aside>
      </section>

      <section className="cr-card cr-email-preview-section"><div className="cr-card__header"><div><span className="cr-eyebrow">Canlı önizleme</span><h2>Mail böyle görünecek</h2></div><Eye aria-hidden="true" /></div><iframe title="E-posta önizlemesi" srcDoc={previewHtml} sandbox="" referrerPolicy="no-referrer" /></section>
    </>
  );
}
