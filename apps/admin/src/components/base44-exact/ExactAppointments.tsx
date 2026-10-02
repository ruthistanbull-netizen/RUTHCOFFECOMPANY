"use client";

import Link from "next/link";
import { Pressable } from "@ruth-commerce/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock, Plus, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { adminRequest } from "@/lib/adminApi";
import { requestAdminConfirmation } from "@/lib/adminConfirmation";
import { APPOINTMENT_STATUSES, appointmentEdit, isAppointmentId, validateAppointmentEdit, type Appointment, type AppointmentEdit } from "@ruth-commerce/commerce-core/appointments";
import { BUSINESS_TYPES, STUDIO_SERVICES, USAGE_AREAS, TIME_SLOTS, MEETING_PREFERENCES, businessToday, formatBusinessDate, initialBusinessInquiry, normalizeBusinessInquiry, validateBusinessInquiry, type BusinessInquiry, type InquiryErrors } from "@ruth-commerce/commerce-core/business-inquiry";
import { ExactButton, ExactField, ExactFilterBar, ExactFormModal, ExactIconButton, ExactPageHeader, ExactSearchInput, ExactSkeleton, ExactStatusBadge, exactFormInputClass, useExactToast } from "./primitives";
import { ExactDataCard, ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn } from "./data";

type ListResult = { appointments: Appointment[]; total: number; counts: { total:number; pending:number; confirmed:number; today:number } };
const emptyCounts = { total:0, pending:0, confirmed:0, today:0 };
const kindLabel = (context:string) => context === "studio" ? "ROSTA.Studio" : "Toptan Kahve";
const meetingLabel = (value:string) => MEETING_PREFERENCES.find(item => item.value === value)?.label || value;
function AppointmentBadge({ row }: {row:Appointment}) {
  return <ExactStatusBadge status={row.status} label={APPOINTMENT_STATUSES.find(s => s.value === row.status)?.label} tone={row.status === "pending" ? "warning" : row.status === "confirmed" ? "info" : row.status === "completed" ? "success" : "neutral"} />;
}
function Information({label,children}:{label:string;children:ReactNode}) {
  return <div className="min-w-0"><dt className="ruth-type-label text-muted">{label}</dt><dd className="ruth-type-body mt-1 break-words whitespace-pre-wrap text-main">{children || "—"}</dd></div>;
}
function ErrorText({error}:{error?:string}) { return error ? <p role="alert" className="ruth-type-caption mt-1 text-danger">{error}</p> : null; }

export function ExactAppointments() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("appointment");
  const toast = useExactToast();
  const [rows,setRows] = useState<Appointment[]>([]);
  const [counts,setCounts] = useState(emptyCounts);
  const [total,setTotal] = useState(0);
  const [page,setPage] = useState(1);
  const [query,setQuery] = useState("");
  const [search,setSearch] = useState("");
  const [status,setStatus] = useState<string|null>(null);
  const [context,setContext] = useState<string|null>(null);
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState("");
  const [createKey,setCreateKey] = useState<string|null>(null);
  const [selected,setSelected] = useState<Appointment|null>(null);
  const [edit,setEdit] = useState<AppointmentEdit|null>(null);
  const [detailLoading,setDetailLoading] = useState(false);
  const [detailError,setDetailError] = useState("");
  const [editErrors,setEditErrors] = useState<Partial<Record<keyof AppointmentEdit,string>>>({});
  const [saving,setSaving] = useState(false);
  const requestGeneration = useRef(0);
  const saveLock = useRef(false);
  const dirty = Boolean(selected && edit && JSON.stringify(edit) !== JSON.stringify(appointmentEdit(selected)));

  useEffect(() => { const timer = setTimeout(() => {setSearch(query.trim());setPage(1);},250); return () => clearTimeout(timer); },[query]);
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
  useEffect(() => {
    if (!dirty) return;
    const beforeExit = (event:BeforeUnloadEvent) => {event.preventDefault();event.returnValue = "";};
    window.addEventListener("beforeunload",beforeExit);
    return () => window.removeEventListener("beforeunload",beforeExit);
  },[dirty]);
  useEffect(() => {
    // Browser Back can hide the detail without destroying its in-progress draft.
    if (!selectedId || selected?.id === selectedId) return;
    let cancelled = false;
    if (!isAppointmentId(selectedId)) {setDetailError("Geçersiz randevu bağlantısı.");return;}
    setDetailLoading(true);setDetailError("");
    void adminRequest<{appointment:Appointment}>(`/api/appointments/${selectedId}`,{force:true,ttlMs:0,staleMs:0})
      .then(result => {if (!cancelled) {setSelected(result.appointment);setEdit(appointmentEdit(result.appointment));setEditErrors({});}})
      .catch(error => {if (!cancelled) setDetailError(error instanceof Error ? error.message : "Randevu alınamadı.");})
      .finally(() => {if (!cancelled) setDetailLoading(false);});
    return () => {cancelled = true;};
  },[selectedId,selected?.id]);

  const closeDetail = async () => {
    if (saving || (dirty && !await requestAdminConfirmation("Kaydedilmemiş randevu değişikliklerini bırakıp kapatmak istiyor musun?"))) return;
    const next = new URLSearchParams(params.toString());next.delete("appointment");
    router.replace(`/appointments${next.size ? `?${next}` : ""}`,{scroll:false});setSelected(null);setEdit(null);setDetailError("");
  };
  const reloadDetail = async () => {
    if (!selectedId || saving || (dirty && !await requestAdminConfirmation("Kaydedilmemiş değişiklikleri bırakıp randevunun güncel halini yüklemek istiyor musun?"))) return;
    setDetailLoading(true);
    try {const result = await adminRequest<{appointment:Appointment}>(`/api/appointments/${selectedId}`,{force:true,ttlMs:0,staleMs:0});setSelected(result.appointment);setEdit(appointmentEdit(result.appointment));setDetailError("");setEditErrors({});}
    catch(error) {setDetailError(error instanceof Error ? error.message : "Randevu yenilenemedi.");}
    finally {setDetailLoading(false);}
  };
  const save = async (event:FormEvent) => {
    event.preventDefault();if (!selected || !edit || saveLock.current) return;
    const errors = validateAppointmentEdit(edit,selected);setEditErrors(errors);if (Object.keys(errors).length) return;
    saveLock.current = true;setSaving(true);setDetailError("");
    try {
      const result = await adminRequest<{appointment:Appointment}>(`/api/appointments/${selected.id}`,{method:"PATCH",body:JSON.stringify({...edit,revision:selected.revision}),confirmation:false});
      setSelected(result.appointment);setEdit(appointmentEdit(result.appointment));toast.success("Randevu güncellendi.");void load(true);
    } catch(error) {setDetailError(error instanceof Error ? error.message : "Randevu kaydedilemedi.");}
    finally {saveLock.current = false;setSaving(false);}
  };
  function update<K extends keyof AppointmentEdit>(key:K,value:AppointmentEdit[K]) {setEdit(previous => previous ? {...previous,[key]:value} : previous);setEditErrors(previous => ({...previous,[key]:undefined}));}
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
      <div className="p-4 space-y-3"><ExactSearchInput value={query} onChange={setQuery} placeholder="İşletme veya yetkili ara…"/><ExactFilterBar chips={[{key:"status",label:"Tüm durumlar",value:status,options:APPOINTMENT_STATUSES.map(s=>({value:s.value,label:s.label}))},{key:"context",label:"Tüm konular",value:context,options:[{value:"studio",label:"ROSTA.Studio"},{value:"wholesale",label:"Toptan Kahve"}]}]} onChipChange={(key,value) => {setPage(1);key === "status" ? setStatus(value) : setContext(value);}}/>
        <p className="ruth-type-caption text-muted">Saatler Türkiye saatidir. Yeni talepler, onaylanana kadar tercih edilen görüşme saatini gösterir.</p>
        {loadError ? <p role="alert" className="text-danger">{loadError}</p> : null}
      </div>
      <ExactDataTable columns={columns} data={rows} loading={loading} onRowClick={row => router.push(`/appointments?appointment=${row.id}`,{scroll:false})} emptyState={<ExactEmptyState icon={CalendarDays} title={search || status || context ? "Bu filtrelere uygun randevu yok" : "Henüz randevu yok"} description="Web sitesi talepleri burada görünecek. Manuel randevu da ekleyebilirsin."/>} mobileCard={row => <Pressable type="button" pressStrength="subtle" onClick={() => router.push(`/appointments?appointment=${row.id}`,{scroll:false})} aria-label={`${row.business_name} randevu detaylarını aç`} className="w-full min-h-11 text-left p-4 radius-card bg-surface-primary space-y-2"><div className="flex justify-between gap-2"><span className="font-semibold text-main">{row.business_name}</span><AppointmentBadge row={row}/></div><p className="ruth-type-caption text-muted">{kindLabel(row.context)} · {row.contact_name}</p><p className="text-main">{formatBusinessDate(row.scheduled_date)}</p><p className="text-muted">{row.scheduled_time} · {meetingLabel(row.meeting)}</p></Pressable>} />
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-t border-border-subtle"><span className="ruth-type-caption text-muted">{total} kayıt · Sayfa {page} / {Math.max(1,Math.ceil(total/50))}</span><div className="flex gap-2"><ExactButton variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage(p=>p-1)}>Önceki</ExactButton><ExactButton variant="secondary" disabled={page*50 >= total || loading} onClick={() => setPage(p=>p+1)}>Sonraki</ExactButton></div></div>
    </ExactDataCard>
    <ExactFormModal open={Boolean(selectedId)} onClose={() => void closeDetail()} title={selected?.id === selectedId ? selected.business_name : "Randevu detayları"} subtitle="İşletme bilgileri, ihtiyaçlar ve görüşme planı" size="xl" dismissalPolicy={dirty || saving ? "explicit-dismiss" : "light-dismiss"} footer={<><ExactButton variant="secondary" onClick={() => void closeDetail()} disabled={saving}>Kapat</ExactButton><ExactButton variant="secondary" onClick={() => void reloadDetail()} disabled={saving || detailLoading}>Yenile</ExactButton><ExactButton type="submit" form="appointment-edit" loading={saving} disabled={!dirty || detailLoading || selected?.id !== selectedId}><Save className="h-4 w-4"/>Kaydet</ExactButton></>}>
      {detailLoading ? <ExactSkeleton className="h-64"/> : null}
      {detailError ? <p role="alert" className="p-3 mb-4 radius-control bg-danger-soft text-danger">{detailError}</p> : null}
      {selected?.id === selectedId && edit ? <div className="space-y-5">
        <div className="flex flex-wrap gap-2"><AppointmentBadge row={selected}/><span className="ruth-type-caption text-muted">{kindLabel(selected.context)} · {selected.source === "manual" ? "Manuel oluşturuldu" : "Web sitesinden geldi"}</span></div>
        <dl className="grid md:grid-cols-2 gap-4"><Information label="Yetkili">{selected.inquiry.contactName}</Information><Information label="İşletme türü / Şehir">{selected.inquiry.businessType} · {selected.inquiry.city}</Information><Information label="E-posta"><a className="text-accent underline" href={`mailto:${selected.inquiry.email}`}>{selected.inquiry.email}</a></Information><Information label="Telefon"><a className="text-accent underline" href={`tel:${selected.inquiry.phone.replace(/[^+\d]/g,"")}`}>{selected.inquiry.phone}</a></Information><Information label="Website / Instagram">{selected.inquiry.website}</Information><Information label="Talebin geldiği tarih">{new Intl.DateTimeFormat("tr-TR",{timeZone:"Europe/Istanbul",dateStyle:"medium",timeStyle:"short"}).format(new Date(selected.created_at))}</Information><Information label="İhtiyaçlar">{selected.inquiry.needs}</Information>{selected.context === "studio" ? <Information label="Talep edilen hizmetler">{selected.inquiry.services.join("\n")}</Information> : <Information label="Kahve ihtiyacı">{selected.inquiry.monthlyKg} kg / ay · {selected.inquiry.usage}{"\n"}Cupping: {selected.inquiry.cupping ? "İsteniyor" : "İstenmiyor"}</Information>}<Information label="İlk talep edilen görüşme">{formatBusinessDate(selected.inquiry.date)} · {selected.inquiry.time}{"\n"}{meetingLabel(selected.inquiry.meeting)}{selected.inquiry.meeting === "in_person" ? `\n${selected.inquiry.address}` : ""}</Information></dl>
        <form id="appointment-edit" onSubmit={save} className="space-y-4">
          <fieldset disabled={saving || detailLoading} className="space-y-4"><legend className="ruth-type-section-title mb-3 text-main">Görüşme planı</legend><div className="grid md:grid-cols-2 gap-4">
            <ExactField label="Randevu tarihi" required><input className={exactFormInputClass} aria-label="Randevu tarihi" type="date" value={edit.scheduled_date} onChange={e=>update("scheduled_date",e.target.value)} required aria-invalid={!!editErrors.scheduled_date}/></ExactField><ExactField label="Randevu saati" required><select className={exactFormInputClass} value={edit.scheduled_time} onChange={e=>update("scheduled_time",e.target.value)}>{TIME_SLOTS.map(slot=><option key={slot}>{slot}</option>)}</select></ExactField>
            <ExactField label="Durum"><select className={exactFormInputClass} value={edit.status} onChange={e=>update("status",e.target.value as AppointmentEdit["status"])}>{APPOINTMENT_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></ExactField><ExactField label="Görüşme türü"><select className={exactFormInputClass} value={edit.meeting} onChange={e=>update("meeting",e.target.value)}>{MEETING_PREFERENCES.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select></ExactField>
          </div>{Object.entries(editErrors).filter(([key])=>key!=="address" && key!=="admin_notes").map(([key,error])=><ErrorText key={key} error={error}/>)}
          {edit.meeting === "in_person" ? <ExactField label="Görüşme adresi" required><textarea className={exactFormInputClass} aria-label="Görüşme adresi" rows={3} value={edit.address} onChange={e=>update("address",e.target.value)} minLength={10} maxLength={600} required/></ExactField> : null}<ErrorText error={editErrors.address}/>
          <ExactField label="Panel notu"><textarea className={exactFormInputClass} aria-label="Panel notu" rows={4} value={edit.admin_notes} onChange={e=>update("admin_notes",e.target.value)} maxLength={4000}/></ExactField><ErrorText error={editErrors.admin_notes}/><p className="ruth-type-caption text-muted">Durum ve notlar panel içindir. Müşteriye tarih ve saat onayını ayrıca iletin.</p></fieldset>
        </form>
      </div> : null}
    </ExactFormModal>
    {createKey ? <AppointmentCreate key={createKey} requestKey={createKey} onClose={()=>setCreateKey(null)} onSaved={row=>{setCreateKey(null);void load();router.push(`/appointments?appointment=${row.id}`,{scroll:false});}}/> : null}
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
