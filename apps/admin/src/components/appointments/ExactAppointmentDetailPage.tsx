"use client";

import { SaveLifecycleProvider, useSaveLifecycle, useSaveLifecycleSource } from "@ruth-commerce/ui";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { adminRequest } from "@/lib/adminApi";
import { APPOINTMENT_STATUSES, appointmentEdit, validateAppointmentEdit, type Appointment, type AppointmentEdit } from "@ruth-commerce/commerce-core/appointments";
import { TIME_SLOTS, MEETING_PREFERENCES, formatBusinessDate } from "@ruth-commerce/commerce-core/business-inquiry";
import { ExactButton, ExactField, ExactPageHeader, ExactSkeleton, exactFormInputClass, useExactToast } from "../base44-exact/primitives";
import { ExactDataCard } from "../base44-exact/data";
import { AppointmentBadge, ErrorText, kindLabel, meetingLabel } from "./appointmentPresentation";

function Information({label,children}:{label:string;children:ReactNode}) {
  return <div className="min-w-0"><dt className="ruth-type-label text-muted">{label}</dt><dd className="ruth-type-body mt-1 break-words whitespace-pre-wrap text-main">{children || "—"}</dd></div>;
}

export function ExactAppointmentDetailPage({appointmentId,backHref}:{appointmentId:string;backHref:string}) {
  return <SaveLifecycleProvider><AppointmentDetail appointmentId={appointmentId} backHref={backHref}/></SaveLifecycleProvider>;
}

function AppointmentDetail({appointmentId,backHref}:{appointmentId:string;backHref:string}) {
  const router = useRouter();
  const toast = useExactToast();
  const { save, saving, requestTransition } = useSaveLifecycle();
  const [selected,setSelected] = useState<Appointment|null>(null);
  const [edit,setEdit] = useState<AppointmentEdit|null>(null);
  const [loading,setLoading] = useState(true);
  const [detailError,setDetailError] = useState("");
  const [editErrors,setEditErrors] = useState<Partial<Record<keyof AppointmentEdit,string>>>({});
  const requestGeneration = useRef(0);
  const dirty = Boolean(selected && edit && JSON.stringify(edit) !== JSON.stringify(appointmentEdit(selected)));

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    try {
      const result = await adminRequest<{appointment:Appointment}>(`/api/appointments/${appointmentId}`,{force:true,ttlMs:0,staleMs:0});
      if (generation !== requestGeneration.current) return;
      setSelected(result.appointment);setEdit(appointmentEdit(result.appointment));setEditErrors({});setDetailError("");
    } catch(error) {
      if (generation === requestGeneration.current) setDetailError(error instanceof Error ? error.message : "Randevu alınamadı.");
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  },[appointmentId]);
  useEffect(() => {void load();return () => {++requestGeneration.current;};},[load]);

  const discard = () => {
    setEdit(selected ? appointmentEdit(selected) : null);setEditErrors({});setDetailError("");
  };
  useSaveLifecycleSource({
    id:`appointment-${appointmentId}`,
    dirty,
    validate:() => {
      if (!selected || !edit) return false;
      const errors = validateAppointmentEdit(edit,selected);
      setEditErrors(errors);
      return Object.keys(errors).length === 0;
    },
    save:async () => {
      if (!selected || !edit) return false;
      setDetailError("");
      try {
        const result = await adminRequest<{appointment:Appointment}>(`/api/appointments/${selected.id}`,{
          method:"PATCH",body:JSON.stringify({...edit,revision:selected.revision}),confirmation:false,
          invalidate:["/api/appointments","/api/summary"],
        });
        setSelected(result.appointment);setEdit(appointmentEdit(result.appointment));toast.success("Randevu güncellendi.");
        return true;
      } catch(error) {
        setDetailError(error instanceof Error ? error.message : "Randevu kaydedilemedi.");
        return false;
      }
    },
    discard,
  });
  function update<K extends keyof AppointmentEdit>(key:K,value:AppointmentEdit[K]) {
    setEdit(previous => previous ? {...previous,[key]:value} : previous);
    setEditErrors(previous => ({...previous,[key]:undefined}));
  }

  return <div className="space-y-4" data-exact-base44-page="appointment-detail">
    <ExactPageHeader title={selected?.business_name || "Randevu detayları"} subtitle={`Randevu talebi${selected ? ` · ${kindLabel(selected.context)}` : ""}`} actions={<>
      <ExactButton variant="secondary" disabled={saving} onClick={() => void requestTransition(() => router.push(backHref))}><ArrowLeft className="h-4 w-4"/>Randevulara dön</ExactButton>
      <ExactButton variant="secondary" disabled={saving || loading} onClick={() => void requestTransition(load)}><RefreshCw className="h-4 w-4"/>Randevuyu yenile</ExactButton>
      {dirty ? <ExactButton variant="secondary" disabled={saving} onClick={discard}>Değişiklikleri geri al</ExactButton> : null}
      {selected ? <ExactButton type="submit" form="appointment-edit" loading={saving} disabled={!dirty || loading}><Save className="h-4 w-4"/>Kaydet</ExactButton> : null}
    </>}/>
    {detailError ? <p role="alert" className="p-4 radius-control bg-danger-soft text-danger">{detailError}</p> : null}
    {loading && !selected ? <ExactSkeleton className="h-64"/> : null}
    {selected && edit ? <div className="grid items-start gap-4 xl:grid-cols-2">
      <ExactDataCard title="İşletme ve talep bilgileri" action={<AppointmentBadge row={selected}/>}> 
        <p className="ruth-type-caption mb-4 text-muted">{kindLabel(selected.context)} · {selected.source === "manual" ? "Manuel oluşturuldu" : "Web sitesinden geldi"}</p>
        <dl className="grid md:grid-cols-2 gap-4"><Information label="Yetkili">{selected.inquiry.contactName}</Information><Information label="İşletme türü / Şehir">{selected.inquiry.businessType} · {selected.inquiry.city}</Information><Information label="E-posta"><a className="text-accent underline" href={`mailto:${selected.inquiry.email}`}>{selected.inquiry.email}</a></Information><Information label="Telefon"><a className="text-accent underline" href={`tel:${selected.inquiry.phone.replace(/[^+\d]/g,"")}`}>{selected.inquiry.phone}</a></Information><Information label="Website / Instagram">{selected.inquiry.website}</Information><Information label="Talebin geldiği tarih">{new Intl.DateTimeFormat("tr-TR",{timeZone:"Europe/Istanbul",dateStyle:"medium",timeStyle:"short"}).format(new Date(selected.created_at))}</Information><Information label="İhtiyaçlar">{selected.inquiry.needs}</Information>{selected.context === "studio" ? <Information label="Talep edilen hizmetler">{selected.inquiry.services.join("\n")}</Information> : <Information label="Kahve ihtiyacı">{selected.inquiry.monthlyKg} kg / ay · {selected.inquiry.usage}{"\n"}Cupping: {selected.inquiry.cupping ? "İsteniyor" : "İstenmiyor"}</Information>}<Information label="İlk talep edilen görüşme">{formatBusinessDate(selected.inquiry.date)} · {selected.inquiry.time}{"\n"}{meetingLabel(selected.inquiry.meeting)}{selected.inquiry.meeting === "in_person" ? `\n${selected.inquiry.address}` : ""}</Information></dl>
      </ExactDataCard>
      <ExactDataCard title="Görüşme planı">
        <form id="appointment-edit" onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-4">
          <fieldset disabled={saving || loading} className="space-y-4"><legend className="sr-only">Görüşme planı</legend><div className="grid md:grid-cols-2 gap-4">
            <ExactField label="Randevu tarihi" required><input className={exactFormInputClass} aria-label="Randevu tarihi" type="date" value={edit.scheduled_date} onChange={e=>update("scheduled_date",e.target.value)} required aria-invalid={!!editErrors.scheduled_date}/></ExactField><ExactField label="Randevu saati" required><select className={exactFormInputClass} value={edit.scheduled_time} onChange={e=>update("scheduled_time",e.target.value)}>{TIME_SLOTS.map(slot=><option key={slot}>{slot}</option>)}</select></ExactField>
            <ExactField label="Durum"><select className={exactFormInputClass} value={edit.status} onChange={e=>update("status",e.target.value as AppointmentEdit["status"])}>{APPOINTMENT_STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></ExactField><ExactField label="Görüşme türü"><select className={exactFormInputClass} value={edit.meeting} onChange={e=>update("meeting",e.target.value)}>{MEETING_PREFERENCES.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select></ExactField>
          </div>{Object.entries(editErrors).filter(([key])=>key!=="address" && key!=="admin_notes").map(([key,error])=><ErrorText key={key} error={error}/>)}
          {edit.meeting === "in_person" ? <ExactField label="Görüşme adresi" required><textarea className={exactFormInputClass} aria-label="Görüşme adresi" rows={3} value={edit.address} onChange={e=>update("address",e.target.value)} minLength={10} maxLength={600} required/></ExactField> : null}<ErrorText error={editErrors.address}/>
          <ExactField label="Panel notu"><textarea className={exactFormInputClass} aria-label="Panel notu" rows={4} value={edit.admin_notes} onChange={e=>update("admin_notes",e.target.value)} maxLength={4000}/></ExactField><ErrorText error={editErrors.admin_notes}/><p className="ruth-type-caption text-muted">Durum ve notlar panel içindir. Müşteriye tarih ve saat onayını ayrıca iletin.</p></fieldset>
        </form>
      </ExactDataCard>
    </div> : null}
  </div>;
}
