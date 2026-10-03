"use client";

import Link from "next/link";
import { Pressable } from "@ruth-commerce/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock, Plus, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AppointmentBadge, ErrorText, kindLabel, meetingLabel } from "@/components/appointments/appointmentPresentation";
import { appointmentListSearch } from "@/lib/appointmentNavigation";
import { adminRequest } from "@/lib/adminApi";
import { requestAdminConfirmation } from "@/lib/adminConfirmation";
import { APPOINTMENT_STATUSES, type Appointment } from "@ruth-commerce/commerce-core/appointments";
import { BUSINESS_TYPES, STUDIO_SERVICES, USAGE_AREAS, TIME_SLOTS, MEETING_PREFERENCES, businessToday, formatBusinessDate, initialBusinessInquiry, normalizeBusinessInquiry, validateBusinessInquiry, type BusinessInquiry, type InquiryErrors } from "@ruth-commerce/commerce-core/business-inquiry";
import { ExactButton, ExactField, ExactFilterBar, ExactFormModal, ExactIconButton, ExactPageHeader, ExactSearchInput, exactFormInputClass, useExactToast } from "./primitives";
import { ExactDataCard, ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn } from "./data";

type ListResult = { appointments: Appointment[]; total: number; counts: { total:number; pending:number; confirmed:number; today:number } };
const emptyCounts = { total:0, pending:0, confirmed:0, today:0 };

export function ExactAppointments() {
  const router = useRouter();
  const params = useSearchParams();
  const listSearch = appointmentListSearch(params);
  const currentParams = new URLSearchParams(listSearch);
  const [rows,setRows] = useState<Appointment[]>([]);
  const [counts,setCounts] = useState(emptyCounts);
  const [total,setTotal] = useState(0);
  const page = Number(currentParams.get("page") || 1);
  const search = currentParams.get("q") || "";
  const status = currentParams.get("status");
  const context = currentParams.get("context");
  const [query,setQuery] = useState(search);
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState("");
  const [createKey,setCreateKey] = useState<string|null>(null);
  const requestGeneration = useRef(0);
  const setListParam = useCallback((key:string,value:string|null,resetPage = true) => {
    const next = new URLSearchParams(listSearch);
    if (value) next.set(key,value); else next.delete(key);
    if (resetPage) next.delete("page");
    const normalized = appointmentListSearch(next);
    router.replace(`/appointments${normalized ? `?${normalized}` : ""}`,{scroll:false});
  },[listSearch,router]);
  useEffect(() => {setQuery(search);},[search]);
  useEffect(() => {
    if (query.trim() === search) return;
    const timer = setTimeout(() => setListParam("q",query.trim() || null),250);
    return () => clearTimeout(timer);
  },[query,search,setListParam]);
  const detailHref = (id:string) => `/appointments/${id}${listSearch ? `?${listSearch}` : ""}`;
  const load = useCallback(async (silent = false) => {
    const generation = ++requestGeneration.current;
    if (!silent) setLoading(true);
    try {
      const qs = new URLSearchParams({ page:String(page),status:status || "all",context:context || "all",q:search });
      const result = await adminRequest<ListResult>(`/api/appointments?${qs}`,{force:true,ttlMs:0,staleMs:0});
      if (generation !== requestGeneration.current) return;
      setRows(result.appointments);setTotal(result.total);setCounts(result.counts);setLoadError("");
    } catch (error) {if (generation === requestGeneration.current) setLoadError(error instanceof Error ? error.message : "Randevular alınamadı.");}
    finally {if (generation === requestGeneration.current) setLoading(false);}
  },[page,status,context,search]);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    const onPush = (event:MessageEvent) => {if (event.data?.kind === "ruth-push" && event.data.payload?.type === "appointment") refresh();};
    const timer = setInterval(refresh,20_000);
    document.addEventListener("visibilitychange",refresh);
    navigator.serviceWorker?.addEventListener("message",onPush);
    return () => {++requestGeneration.current;clearInterval(timer);document.removeEventListener("visibilitychange",refresh);navigator.serviceWorker?.removeEventListener("message",onPush);};
  },[load]);
  const columns:ExactColumn<Appointment>[] = [
    {key:"business_name",label:"İşletme / Yetkili",render:row => <div><span className="font-semibold text-main">{row.business_name}</span><p className="ruth-type-caption text-muted mt-1">{row.contact_name}</p></div>},
    {key:"context",label:"Konu",render:row => kindLabel(row.context)},
    {key:"scheduled_date",label:"Görüşme",render:row => <div>{formatBusinessDate(row.scheduled_date)}<p className="text-muted mt-1">{row.scheduled_time}</p></div>},
    {key:"meeting",label:"Görüşme türü",render:row => meetingLabel(row.meeting)},
    {key:"source",label:"Kaynak",render:row => row.source === "manual" ? "Manuel" : "Web sitesi"},
    {key:"status",label:"Durum",render:row => <AppointmentBadge row={row} />},
  ];
  return <div className="space-y-4" data-exact-base44-page="appointments">
    <ExactPageHeader title="Randevular" subtitle="ROSTA.Studio ve toptan kahve görüşmelerini tek yerden yönet" actions={<><Link href="/notifications" className="ruth-type-control inline-flex h-11 items-center px-3 text-muted hover:text-main">Bildirimler</Link><ExactButton onClick={() => setCreateKey(crypto.randomUUID())}><Plus className="h-4 w-4" />Manuel randevu</ExactButton></>} />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><ExactMetricCard label="Toplam Randevu" value={counts.total} icon={CalendarDays}/><ExactMetricCard label="Yeni Talep" value={counts.pending} icon={Clock}/><ExactMetricCard label="Onaylı Randevu" value={counts.confirmed} icon={CheckCircle2}/><ExactMetricCard label="Bugünkü Görüşme" value={counts.today} icon={CalendarDays}/></div>
    <ExactDataCard title="Görüşme talepleri" action={<ExactIconButton icon={RefreshCw} label="Randevuları yenile" onClick={() => void load()} loading={loading} />} noPadding>
      <div className="p-4 space-y-3"><ExactSearchInput value={query} onChange={setQuery} placeholder="İşletme veya yetkili ara…"/><ExactFilterBar chips={[{key:"status",label:"Tüm durumlar",value:status,options:APPOINTMENT_STATUSES.map(s=>({value:s.value,label:s.label}))},{key:"context",label:"Tüm konular",value:context,options:[{value:"studio",label:"ROSTA.Studio"},{value:"wholesale",label:"Toptan Kahve"}]}]} onChipChange={(key,value) => setListParam(key,value)}/>
        <p className="ruth-type-caption text-muted">Saatler Türkiye saatidir. Yeni talepler, onaylanana kadar tercih edilen görüşme saatini gösterir.</p>
        {loadError ? <p role="alert" className="text-danger">{loadError}</p> : null}
      </div>
      <ExactDataTable columns={columns} data={rows} loading={loading} onRowClick={row => router.push(detailHref(row.id))} emptyState={<ExactEmptyState icon={CalendarDays} title={search || status || context ? "Bu filtrelere uygun randevu yok" : "Henüz randevu yok"} description="Web sitesi talepleri burada görünecek. Manuel randevu da ekleyebilirsin."/>} mobileCard={row => <Pressable type="button" pressStrength="subtle" onClick={() => router.push(detailHref(row.id))} aria-label={`${row.business_name} randevu detaylarını aç`} className="w-full min-h-11 text-left p-4 radius-card bg-surface-primary space-y-2"><div className="flex justify-between gap-2"><span className="font-semibold text-main">{row.business_name}</span><AppointmentBadge row={row}/></div><p className="ruth-type-caption text-muted">{kindLabel(row.context)} · {row.contact_name}</p><p className="text-main">{formatBusinessDate(row.scheduled_date)}</p><p className="text-muted">{row.scheduled_time} · {meetingLabel(row.meeting)}</p></Pressable>} />
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-t border-border-subtle"><span className="ruth-type-caption text-muted">{total} kayıt · Sayfa {page} / {Math.max(1,Math.ceil(total/50))}</span><div className="flex gap-2"><ExactButton variant="secondary" disabled={page <= 1 || loading} onClick={() => setListParam("page",String(page-1),false)}>Önceki</ExactButton><ExactButton variant="secondary" disabled={page*50 >= total || loading} onClick={() => setListParam("page",String(page+1),false)}>Sonraki</ExactButton></div></div>
    </ExactDataCard>
    {createKey ? <AppointmentCreate key={createKey} requestKey={createKey} onClose={()=>setCreateKey(null)} onSaved={row=>{setCreateKey(null);router.push(detailHref(row.id));}}/> : null}
  </div>;
}

function AppointmentCreate({requestKey,onClose,onSaved}:{requestKey:string;onClose:()=>void;onSaved:(row:Appointment)=>void}) {
  const toast = useExactToast();
  const [form,setForm] = useState(()=>initialBusinessInquiry("studio"));
  const [errors,setErrors] = useState<InquiryErrors>({});
  const [status,setStatus] = useState("confirmed");
  const [notes,setNotes] = useState("");
  const [error,setError] = useState("");
  const [saving,setSaving] = useState(false);
  const locked = useRef(false);
  const attempt = useRef<{fingerprint:string;key:string}|null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initialBusinessInquiry("studio")) || Boolean(notes) || status !== "confirmed";
  useEffect(()=>{if (!dirty) return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
  const close = async()=>{if (saving || (dirty && !await requestAdminConfirmation("Kaydedilmemiş randevu bilgilerini bırakıp kapatmak istiyor musun?"))) return;onClose();};
  function update<K extends keyof BusinessInquiry>(key:K,value:BusinessInquiry[K]) {setForm(p=>({...p,[key]:value}));setErrors(p=>({...p,[key]:undefined}));setError("");}
  async function submit(event:FormEvent) {
    event.preventDefault();if(locked.current)return;
    const inquiry=normalizeBusinessInquiry(form);const validation=validateBusinessInquiry(inquiry);setErrors(validation);if(Object.keys(validation).length)return;
    locked.current=true;setSaving(true);setError("");
    try {
      const payload={inquiry,status,admin_notes:notes};const fingerprint=JSON.stringify(payload);
      if(attempt.current?.fingerprint!==fingerprint) attempt.current={fingerprint,key:attempt.current ? crypto.randomUUID() : requestKey};
      const result=await adminRequest<{appointment:Appointment}>("/api/appointments",{method:"POST",body:JSON.stringify({...payload,requestKey:attempt.current!.key}),confirmation:false});toast.success("Manuel randevu oluşturuldu.");onSaved(result.appointment);
    } catch(caught){setError(caught instanceof Error ? caught.message : "Randevu kaydedilemedi.");}
    finally{locked.current=false;setSaving(false);}
  }
  const textField=(key:"businessName"|"contactName"|"email"|"phone"|"city"|"website",label:string,required=true,type="text")=><div key={key}><ExactField label={label} required={required}><input className={exactFormInputClass} aria-label={label} type={type} value={form[key]} onChange={e=>update(key,e.target.value)} required={required} maxLength={key==="website"?240:key==="email"?180:key==="phone"?40:120} aria-invalid={!!errors[key]}/></ExactField><ErrorText error={errors[key]}/></div>;
  return <ExactFormModal open onClose={()=>void close()} title="Manuel randevu" subtitle="İşletme bilgilerini ve görüşme planını ekle" size="xl" dismissalPolicy={dirty || saving ? "explicit-dismiss" : "light-dismiss"} footer={<><ExactButton variant="secondary" disabled={saving} onClick={()=>void close()}>Vazgeç</ExactButton><ExactButton type="submit" form="appointment-create" loading={saving}><Save className="h-4 w-4"/>Randevu oluştur</ExactButton></>}>
    <form id="appointment-create" onSubmit={submit} className="space-y-4"><fieldset disabled={saving} className="space-y-4"><div className="grid md:grid-cols-2 gap-4">
      <ExactField label="Görüşme konusu"><select className={exactFormInputClass} value={form.context} onChange={e=>update("context",e.target.value as BusinessInquiry["context"])}><option value="studio">ROSTA.Studio</option><option value="wholesale">Toptan Kahve</option></select></ExactField><ExactField label="Durum"><select className={exactFormInputClass} value={status} onChange={e=>setStatus(e.target.value)}><option value="confirmed">Onaylandı</option><option value="pending">Yeni talep</option></select></ExactField>
      {textField("businessName","İşletme adı")}{textField("contactName","Yetkili adı")}{textField("email","E-posta",true,"email")}{textField("phone","Telefon",true,"tel")}
      <div><ExactField label="İşletme türü" required><select className={exactFormInputClass} value={form.businessType} onChange={e=>update("businessType",e.target.value)} required><option value="">Seçiniz</option>{BUSINESS_TYPES.map(v=><option key={v}>{v}</option>)}</select></ExactField><ErrorText error={errors.businessType}/></div>{textField("city","Şehir / İlçe")}{textField("website","Website / Instagram",false)}
    </div>
    <ExactField label="İhtiyaçlar" required><textarea className={exactFormInputClass} aria-label="İhtiyaçlar" rows={4} value={form.needs} onChange={e=>update("needs",e.target.value)} required minLength={10} maxLength={1800}/></ExactField><ErrorText error={errors.needs}/>
    {form.context==="studio" ? <fieldset><legend className="ruth-type-label text-muted mb-2">Hizmetler *</legend><div className="grid md:grid-cols-2 gap-1">{STUDIO_SERVICES.map(service=><label key={service} className="ruth-type-control flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.services.includes(service)} onChange={e=>update("services",e.target.checked?[...form.services,service]:form.services.filter(s=>s!==service))}/>{service}</label>)}</div><ErrorText error={errors.services}/></fieldset> : <div className="grid md:grid-cols-2 gap-4"><div><ExactField label="Aylık kahve ihtiyacı (kg)" required><input className={exactFormInputClass} aria-label="Aylık kahve ihtiyacı (kg)" type="number" min="0.01" step="any" value={form.monthlyKg} onChange={e=>update("monthlyKg",e.target.value)} required/></ExactField><ErrorText error={errors.monthlyKg}/></div><div><ExactField label="Kullanım alanı" required><select className={exactFormInputClass} value={form.usage} onChange={e=>update("usage",e.target.value)} required><option value="">Seçiniz</option>{USAGE_AREAS.map(v=><option key={v}>{v}</option>)}</select></ExactField><ErrorText error={errors.usage}/></div><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={form.cupping} onChange={e=>update("cupping",e.target.checked)}/>Cupping görüşmesi isteniyor</label></div>}
    <div className="grid md:grid-cols-2 gap-4"><div><ExactField label="Randevu tarihi" required><input className={exactFormInputClass} aria-label="Randevu tarihi" type="date" value={form.date} min={businessToday()} onChange={e=>update("date",e.target.value)} required/></ExactField><ErrorText error={errors.date}/></div><div><ExactField label="Randevu saati" required><select className={exactFormInputClass} value={form.time} onChange={e=>update("time",e.target.value)} required><option value="">Seçiniz</option>{TIME_SLOTS.map(v=><option key={v}>{v}</option>)}</select></ExactField><ErrorText error={errors.time}/></div><ExactField label="Görüşme türü" required><select className={exactFormInputClass} value={form.meeting} onChange={e=>update("meeting",e.target.value)} required><option value="">Seçiniz</option>{MEETING_PREFERENCES.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select></ExactField></div><ErrorText error={errors.meeting}/>
    {form.meeting==="in_person" ? <ExactField label="Görüşme adresi" required><textarea className={exactFormInputClass} aria-label="Görüşme adresi" rows={3} value={form.address} onChange={e=>update("address",e.target.value)} required minLength={10} maxLength={600}/></ExactField> : null}<ErrorText error={errors.address}/>
    <ExactField label="Panel notu"><textarea className={exactFormInputClass} aria-label="Panel notu" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} maxLength={4000}/></ExactField><p className="ruth-type-caption text-muted">Saatler Türkiye saatidir. Müşteriye görüşme onayını ayrıca iletin.</p>
    {error ? <p role="alert" className="p-3 radius-control bg-danger-soft text-danger">{error}</p> : null}</fieldset></form>
  </ExactFormModal>;
}
