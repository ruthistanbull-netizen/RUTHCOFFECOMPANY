"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { resolveInformationSections, type InformationSection, type InformationField } from "@ruth-commerce/commerce-core/product-information";
import { ExactButton, ExactField, ExactIconButton, ExactPageHeader, exactFormInputClass } from "./primitives";
import { ExactDataCard } from "./data";

export function ExactProductOptions() {
  const [sections, setSections] = useState<InformationSection[]>([]);
  const [groups, setGroups] = useState<unknown[]>([]);
  const [snapshot, setSnapshot] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void adminRequest<{ sections?: InformationSection[]; groups?: unknown[] }>("/api/product-settings/options", { hardRefresh: true }).then(payload => {
      const next = resolveInformationSections(payload.sections, payload.groups);
      setSections(next); setGroups(payload.groups || []); setSnapshot(JSON.stringify(next));
    }).catch(error => setMessage(error.message)).finally(() => setLoading(false));
  }, []);
  const update = (id: string, action: (section: InformationSection) => InformationSection) => setSections(current => current.map(section => section.id === id ? action(section) : section));
  const patch = (section: string, field: string, action: (field: InformationField) => InformationField) => update(section, item => ({ ...item, fields: item.fields.map(row => row.id === field ? action(row) : row) }));
  const save = async () => {
    if (sections.some(section => section.fields.some(field => !field.label.trim() || field.options.some(option => !option.label.trim() || !option.value.trim())))) {
      setMessage("Alt başlık, seçenek adı ve açıklama boş bırakılamaz."); return;
    }
    setSaving(true); setMessage("");
    try {
      const payload = await adminRequest<{ sections: InformationSection[]; warning?: string }>("/api/product-settings/options", { method: "PUT", body: JSON.stringify({ groups, sections }), invalidate: ["/api/product-settings/options"] });
      setSections(payload.sections); setSnapshot(JSON.stringify(payload.sections)); setMessage(payload.warning || "Ürün bilgi seçenekleri kaydedildi.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Kaydedilemedi."); }
    finally { setSaving(false); }
  };
  return <div className="mx-auto max-w-[1240px] space-y-4 p-4 md:p-6">
    <ExactPageHeader title="Ürün Seçenekleri" subtitle="Ürün Bilgisi, Paket / Kullanım ve Kargo ve İade başlıklarının alt alanlarını yönet." actions={<ExactButton onClick={() => void save()} loading={saving} disabled={loading || JSON.stringify(sections) === snapshot}>Kaydet</ExactButton>} />
    <p className="text-sm text-muted">Burada tanımlanan bilgi alanları ürün oluşturma ve düzenleme formunda görünür. Ürün açıklamasını her ürünün formunda elle yazabilirsin. Gramaj, öğütme, fiyat ve stok seçeneklerini Varyantlar bölümünden yönetebilirsin.</p>
    {message ? <p role="status" className="text-sm text-accent">{message}</p> : null}
    {loading ? <p>Yükleniyor…</p> : sections.filter(section => section.id !== "description").map(section => <ExactDataCard key={section.id} title={section.title} action={<ExactButton variant="secondary" size="sm" onClick={() => update(section.id, item => ({ ...item, fields: [...item.fields, { id: crypto.randomUUID(), label: "Yeni alt başlık", options: [] }] }))}><Plus className="h-4 w-4" /> Alt başlık ekle</ExactButton>}>
      <div className="space-y-4">{section.fields.map(field => <div key={field.id} className="rounded-xl border border-border-subtle bg-surface-secondary p-3">
        <div className="flex items-end gap-2"><ExactField label="Alt başlık" className="flex-1"><input value={field.label} className={exactFormInputClass} onChange={event => patch(section.id, field.id, row => ({ ...row, label: event.target.value }))} /></ExactField><ExactIconButton icon={Trash2} label="Alt başlığı kaldır" variant="ghost" onClick={() => update(section.id, item => ({ ...item, fields: item.fields.filter(row => row.id !== field.id) }))} /></div>
        <p className="my-2 text-xs text-muted">Seçenek eklenmezse ürün formunda serbest metin yazılabilir.</p>
        {field.options.map(option => <div key={option.id} className="mb-3 grid items-start gap-2 md:grid-cols-[1fr_2fr_auto]">
          <ExactField label="Seçenek adı"><input value={option.label} className={exactFormInputClass} onChange={event => patch(section.id, field.id, row => ({ ...row, options: row.options.map(value => value.id === option.id ? { ...value, label: event.target.value } : value) }))} /></ExactField>
          <ExactField label="Ürün sayfasında görünecek açıklama"><textarea value={option.value} className={`${exactFormInputClass} min-h-24`} onChange={event => patch(section.id, field.id, row => ({ ...row, options: row.options.map(value => value.id === option.id ? { ...value, value: event.target.value } : value) }))} /></ExactField>
          <ExactIconButton icon={Trash2} label="Açıklama seçeneğini kaldır" variant="ghost" onClick={() => patch(section.id, field.id, row => ({ ...row, options: row.options.filter(value => value.id !== option.id) }))} />
        </div>)}
        <ExactButton variant="secondary" size="sm" onClick={() => patch(section.id, field.id, row => ({ ...row, options: [...row.options, { id: crypto.randomUUID(), label: "Yeni seçenek", value: "" }] }))}><Plus className="h-4 w-4" /> Açıklama seçeneği ekle</ExactButton>
      </div>)}{!section.fields.length ? <p className="text-sm text-muted">Bu başlığın altında henüz bilgi alanı yok.</p> : null}</div>
    </ExactDataCard>)}
  </div>;
}
