"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type FormEvent } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, CircleCheck, LoaderCircle } from "lucide-react";
import { ruthMotion, ruthTransition } from "@ruth-commerce/ui/motion";
import {
  BUSINESS_TYPES, STUDIO_SERVICES, USAGE_AREAS, TIME_SLOTS, MEETING_PREFERENCES,
  initialBusinessInquiry, normalizeBusinessInquiry, validateBusinessInquiry, slotIsPast,
  type BusinessContext, type BusinessInquiry, type InquiryErrors,
} from "@/lib/businessInquiry";
import { BusinessAppointmentCalendar } from "./BusinessAppointmentCalendar";
import styles from "./business-inquiry.module.css";

function Field({ id, label, error, required, children }: { id: string; label: string; error?: string; required?: boolean; children: ReactNode }) {
  return <div className={styles.field}>
    <label htmlFor={id} className={styles.label}>{label}{required ? " *" : <small> — isteğe bağlı</small>}</label>
    {children}
    {error ? <p id={`${id}-error`} className={styles.error}>{error}</p> : null}
  </div>;
}

function RevealBlock({ number, title, reduceMotion, forceVisible, children }: { number: string; title: string; reduceMotion: boolean; forceVisible: boolean; children: ReactNode }) {
  const [focused, setFocused] = useState(false);
  const visible = { opacity: 1, y: 0 };
  return <motion.div className={styles.block}
    initial={reduceMotion ? false : { opacity: 0, y: ruthMotion.distance.standard }}
    animate={reduceMotion || forceVisible || focused ? visible : undefined}
    whileInView={visible} viewport={{ once: true, amount: 0.04 }}
    transition={ruthTransition("slow")} onFocusCapture={() => setFocused(true)}>
    <div className={styles.sectionHeader}><span>{number}</span><h3>{title}</h3></div>
    {children}
  </motion.div>;
}

export function BusinessInquirySection({ context, reduceMotion }: { context: BusinessContext; reduceMotion: boolean }) {
  const formId = useId();
  const [form, setForm] = useState(() => initialBusinessInquiry(context));
  const [errors, setErrors] = useState<InquiryErrors>({});
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sendError, setSendError] = useState("");
  const sendingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const controls = useRef<Partial<Record<keyof BusinessInquiry, HTMLElement | null>>>({});

  useEffect(() => {
    if (submitted) {
      confirmationRef.current?.focus({ preventScroll: true });
      confirmationRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }
  }, [submitted, reduceMotion]);

  function set<K extends keyof BusinessInquiry>(key: K, value: BusinessInquiry[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
    setErrors(previous => ({ ...previous, [key]: undefined, ...(key === "meeting" && value !== "in_person" ? { address: undefined } : {}) }));
    setSendError("");
  }
  const fieldId = (key: string) => `${formId}-${key}`;
  const attrs = (key: keyof BusinessInquiry) => ({
    id: fieldId(key), name: key, className: styles.input,
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby": errors[key] ? `${fieldId(key)}-error` : undefined,
    ref: (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) => { controls.current[key] = element; },
  });
  const errorMessage = (key: keyof BusinessInquiry) => errors[key] ? <p id={`${fieldId(key)}-error`} className={styles.error}>{errors[key]}</p> : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingRef.current) return;
    const normalized = normalizeBusinessInquiry(form);
    const nextErrors = validateBusinessInquiry(normalized);
    setErrors(nextErrors);
    setSendError("");
    const firstError = Object.keys(nextErrors)[0] as keyof BusinessInquiry | undefined;
    if (firstError) { controls.current[firstError]?.focus(); return; }
    sendingRef.current = true;
    setSending(true);
    try {
      const response = await fetch("/api/business-inquiry", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...normalized, company: new FormData(formRef.current!).get("company") || "" }),
        signal: AbortSignal.timeout(25_000),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true || typeof result.messageId !== "string" || !result.messageId) {
        if (result.errors) setErrors(result.errors);
        throw new Error(result.error || "Talebin gönderilemedi. Lütfen tekrar dene.");
      }
      setSubmitted(true);
    } catch (error) {
      setSendError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Bağlantı tamamlanamadı. Bilgilerin korundu; tekrar deneyebilirsin.");
    } finally { sendingRef.current = false; setSending(false); }
  }

  const groupAttrs = (key: keyof BusinessInquiry) => ({
    tabIndex: -1,
    ref: (element: HTMLFieldSetElement | HTMLDivElement | null) => { controls.current[key] = element; },
    "aria-describedby": errors[key] ? `${fieldId(key)}-error` : undefined,
  });
  const forceVisible = Object.values(errors).some(Boolean);

  return <section id="business-inquiry" className={styles.root} data-theme={context === "wholesale" ? "brick" : "carbon"}
    data-editor-id={`${context}.business-inquiry`} data-editor-type="contact-form" data-editor-label={`${context === "studio" ? "ROSTA.Studio" : "Toptan Kahve"} · Görüşme talebi`} aria-labelledby={`${formId}-heading`}>
    <div className={styles.layout}>
      <motion.aside className={styles.lead} initial={reduceMotion ? false : { opacity: 0, y: ruthMotion.distance.standard }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .1 }} transition={ruthTransition("slow")}>
        <p className={styles.eyebrow}>ROSTA / İŞLETMELER İÇİN</p>
        <h2 id={`${formId}-heading`} className={`${styles.heading} font-display font-bold`}><span>BİRLİKTE</span><span>ÇALIŞALIM.</span></h2>
        <p className={styles.intro}>İşletmeni ve ihtiyaçlarını anlat, sana uygun çözümü birlikte planlayalım.</p>
        <motion.div className={styles.leadRule} initial={reduceMotion ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={ruthTransition("slow")} />
        <p className={styles.context}>{context === "studio" ? "Studio — Menü, reçete, bar ve marka danışmanlığı." : "Toptan Kahve — İşletmen için taze kavrulmuş kahve."}</p>
      </motion.aside>
      <div className={styles.formColumn}>
        {submitted ? <motion.div ref={confirmationRef} tabIndex={-1} role="status" className={styles.confirmation}
          initial={reduceMotion ? false : { opacity: 0, y: ruthMotion.distance.standard }} animate={{ opacity: 1, y: 0 }} transition={ruthTransition("slow")}>
          <CircleCheck size={64} strokeWidth={1.2} aria-hidden="true" />
          <span className={styles.eyebrow}>TALEP ALINDI</span>
          <h3 className="font-display font-bold">TEŞEKKÜR<br />EDERİZ.</h3>
          <p>Talebin alındı. Görüşme zamanını netleştirmek için seninle iletişime geçeceğiz.</p>
        </motion.div> : <form ref={formRef} onSubmit={submit} noValidate className={styles.form} aria-busy={sending}>
          <div className={styles.honeypot} aria-hidden="true"><label>Şirket<input name="company" tabIndex={-1} autoComplete="off" /></label></div>
          <fieldset disabled={sending}>
            <RevealBlock number="01" title="İŞLETMENİ TANIYALIM" reduceMotion={reduceMotion} forceVisible={forceVisible}>
              <div className={styles.fields}>
                <Field id={fieldId("businessName")} label="İşletme adı" required error={errors.businessName}><input {...attrs("businessName")} value={form.businessName} onChange={e => set("businessName", e.target.value)} required maxLength={120} autoComplete="organization" /></Field>
                <Field id={fieldId("contactName")} label="Yetkili kişi" required error={errors.contactName}><input {...attrs("contactName")} value={form.contactName} onChange={e => set("contactName", e.target.value)} required maxLength={120} autoComplete="name" /></Field>
                <Field id={fieldId("email")} label="E-posta" required error={errors.email}><input {...attrs("email")} type="email" value={form.email} onChange={e => set("email", e.target.value)} required maxLength={180} autoComplete="email" /></Field>
                <Field id={fieldId("phone")} label="Telefon" required error={errors.phone}><input {...attrs("phone")} type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} required maxLength={40} autoComplete="tel" /></Field>
                <Field id={fieldId("businessType")} label="İşletme türü" required error={errors.businessType}><select {...attrs("businessType")} value={form.businessType} onChange={e => set("businessType", e.target.value)} required><option value="">Seçiniz</option>{BUSINESS_TYPES.map(type => <option key={type}>{type}</option>)}</select></Field>
                <Field id={fieldId("city")} label="Şehir / İlçe" required error={errors.city}><input {...attrs("city")} value={form.city} onChange={e => set("city", e.target.value)} required maxLength={120} autoComplete="address-level2" /></Field>
                <Field id={fieldId("website")} label="Website / Instagram" error={errors.website}><input {...attrs("website")} value={form.website} onChange={e => set("website", e.target.value)} maxLength={240} placeholder="Website adresi veya @hesap" /></Field>
              </div>
            </RevealBlock>
            <RevealBlock number="02" title="İHTİYAÇLARIN" reduceMotion={reduceMotion} forceVisible={forceVisible}>
              <Field id={fieldId("needs")} label="İhtiyaçlarını ve hedeflerini anlat" required error={errors.needs}><textarea {...attrs("needs")} value={form.needs} onChange={e => set("needs", e.target.value)} required minLength={10} maxLength={1800} rows={5} placeholder="Mevcut işletmeni, planlarını ve birlikte çalışmak istediğin konuları paylaş." /></Field>
              {context === "studio" ? <fieldset className={styles.group} {...groupAttrs("services")}>
                <legend className={styles.label}>Hizmetler * — birden fazla seçebilirsin</legend>
                <div className={styles.choices}>{STUDIO_SERVICES.map(service => {
                  const selected = form.services.includes(service);
                  return <button type="button" key={service} className={styles.choice} data-selected={selected} aria-pressed={selected} onClick={() => set("services", selected ? form.services.filter(s => s !== service) : [...form.services, service])}>{selected ? <Check size={15} aria-hidden="true" /> : null}{service}</button>;
                })}</div>{errorMessage("services")}
              </fieldset> : <div className={styles.group}>
                <Field id={fieldId("monthlyKg")} label="Tahmini aylık kahve ihtiyacı (kg)" required error={errors.monthlyKg}><input {...attrs("monthlyKg")} type="number" min="0.1" step="any" inputMode="decimal" value={form.monthlyKg} onChange={e => set("monthlyKg", e.target.value)} required placeholder="Örn. 25" /></Field>
                <fieldset className={styles.group} {...groupAttrs("usage")}><legend className={styles.label}>Kullanım alanı *</legend><div className={styles.choices}>{USAGE_AREAS.map(usage => <button key={usage} type="button" className={styles.choice} data-selected={form.usage === usage} aria-pressed={form.usage === usage} onClick={() => set("usage", usage)}>{form.usage === usage ? <Check size={15} aria-hidden="true" /> : null}{usage}</button>)}</div>{errorMessage("usage")}</fieldset>
                <label className={styles.cupping}><input type="checkbox" checked={form.cupping} onChange={e => set("cupping", e.target.checked)} /><span>Cupping yaparak işletmeme uygun çekirdeği birlikte seçmek istiyorum.</span></label>
              </div>}
            </RevealBlock>
            <RevealBlock number="03" title="GÖRÜŞME PLANLAYALIM" reduceMotion={reduceMotion} forceVisible={forceVisible}>
              <p className={styles.label}>Tercih ettiğin görüşme zamanı</p>
              <p className={styles.hint}>Talebini aldıktan sonra görüşme zamanını birlikte netleştireceğiz. Saatler Türkiye saatine göredir.</p>
              <div className={styles.scheduling}>
                <div {...groupAttrs("date")}><p className={styles.label}>Tarih *</p><BusinessAppointmentCalendar id={fieldId("date")} value={form.date} onChange={date => { set("date", date); if (slotIsPast(date, form.time)) set("time", ""); }} reduceMotion={reduceMotion} />{errorMessage("date")}</div>
                <div>
                  <fieldset {...groupAttrs("time")}><legend className={styles.label}>Saat aralığı *</legend><div className={styles.choicesSingle}>{TIME_SLOTS.map(time => <button key={time} type="button" className={styles.choice} disabled={slotIsPast(form.date, time)} data-selected={form.time === time} aria-pressed={form.time === time} onClick={() => set("time", time)}>{form.time === time ? <Check size={15} aria-hidden="true" /> : null}{time}</button>)}</div>{errorMessage("time")}</fieldset>
                  <fieldset className={styles.group} {...groupAttrs("meeting")}><legend className={styles.label}>Görüşme tercihi *</legend><div className={styles.choicesSingle}>{MEETING_PREFERENCES.map(pref => <button key={pref.value} type="button" className={styles.choice} data-selected={form.meeting === pref.value} aria-pressed={form.meeting === pref.value} onClick={() => set("meeting", pref.value)}>{form.meeting === pref.value ? <Check size={15} aria-hidden="true" /> : null}{pref.label}</button>)}</div>{errorMessage("meeting")}</fieldset>
                  <AnimatePresence initial={false}>
                    {form.meeting === "in_person" ? <motion.div key="address" className={styles.address} initial={reduceMotion ? false : { opacity: 0, y: ruthMotion.distance.subtle }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0 }} transition={ruthTransition("normal")}>
                      <Field id={fieldId("address")} label="Görüşme adresi" required error={errors.address}><textarea {...attrs("address")} value={form.address} onChange={e => set("address", e.target.value)} required maxLength={600} rows={3} autoComplete="street-address" placeholder="Sokak, bina, ilçe ve şehir bilgileriyle görüşme adresini yaz." /></Field>
                    </motion.div> : null}
                  </AnimatePresence>
                </div>
              </div>
            </RevealBlock>
          </fieldset>
          <div role="alert">{sendError ? <p className={styles.error}>{sendError}</p> : null}</div>
          <button type="submit" disabled={sending} className={styles.submit}>{sending ? "GÖNDERİLİYOR…" : "GÖRÜŞME TALEBİ GÖNDER"}{sending ? <LoaderCircle size={20} aria-hidden="true" /> : <ArrowRight size={20} aria-hidden="true" />}</button>
          <p className={styles.privacy}>Bilgilerin talebine dönüş yapmak için kullanılır. <Link href="/privacy-policy">Gizlilik politikası</Link></p>
        </form>}
      </div>
    </div>
  </section>;
}
