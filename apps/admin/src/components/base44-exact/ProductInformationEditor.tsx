"use client";
import type { InformationField, InformationSection, ProductInformation } from "@ruth-commerce/commerce-core/product-information";
import { ExactField, exactFormInputClass } from "./primitives";
import { ExactDataCard } from "./data";

export function InformationControl({ field, value, onChange }: { field: InformationField; value: string; onChange: (value: string) => void }) {
  return <ExactField label={field.label}>{field.options.length ? <select aria-label={field.label} data-native-select value={value} onChange={event => onChange(event.target.value)} className={exactFormInputClass}>
    <option value="">Seçilmedi</option>
    {value && !field.options.some(option => option.value === value) ? <option value={value}>{value} · mevcut / özel</option> : null}
    {field.options.map(option => <option key={option.id} value={option.value}>{option.label}</option>)}
  </select> : <textarea aria-label={field.label} value={value} onChange={event => onChange(event.target.value)} className={`${exactFormInputClass} min-h-24`} />}</ExactField>;
}
export function ProductInformationEditor({ sections, values, onChange }: { sections: InformationSection[]; values: ProductInformation[]; onChange: (section: string, field: InformationField, value: string) => void }) {
  return <>{sections.map(section => <ExactDataCard key={section.id} title={section.title}>
    <div className="grid gap-3 md:grid-cols-2">{section.fields.map(field => {
      const value = values.find(row => row.section === section.id && row.field === field.id)?.value || "";
      return field.id === "care_advice" ? <div key={field.id} className="text-sm text-muted"><p className="mb-2 font-semibold">{field.label}</p><p className="whitespace-pre-line">{value || "Üstteki saklama önerisi alanından seçilebilir."}</p></div> : <InformationControl key={field.id} field={field} value={value} onChange={value => onChange(section.id, field, value)} />;
    })}</div>
    {!section.fields.length ? <p className="text-sm text-muted">Ürün Seçenekleri sayfasından bu başlık için alt başlık ekleyebilirsin.</p> : null}
  </ExactDataCard>)}</>;
}
