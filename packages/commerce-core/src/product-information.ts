export type InformationOption = { id: string; label: string; value: string };
export type InformationField = { id: string; label: string; options: InformationOption[] };
export type InformationSection = { id: string; title: string; fields: InformationField[] };
export type ProductInformation = { section: string; field: string; label: string; value: string };
export const INFORMATION_SECTIONS = [
  { id: "description", title: "Açıklama" },
  { id: "material", title: "Ürün Bilgisi" },
  { id: "size-usage", title: "Paket / Kullanım" },
  { id: "shipping-returns", title: "Kargo ve İade" },
] as const;
const text = (value: unknown, max = 4000) => typeof value === "string" ? value.trim().slice(0, max) : "";
export function resolveInformationSections(input: unknown, legacyGroups: unknown): InformationSection[] {
  if (Array.isArray(input) && input.length > 0) return normalizeInformationSections(input);
  const groups = Array.isArray(legacyGroups) ? legacyGroups : [];
  return normalizeInformationSections([
    { id: "material", fields: groups.filter(group => ["material", "finish_color"].includes(group?.field)).map(group => ({ id: group.field, label: group.title, options: group.options })) },
    { id: "size-usage", fields: groups.filter(group => group?.field === "care_advice").map(group => ({ id: group.field, label: "Saklama / Kullanım", options: group.options })) },
    { id: "shipping-returns", fields: [{ id: "shipping", label: "Teslimat ve iade koşulları", options: [] }] },
  ]);
}
export function normalizeInformationSections(input: unknown): InformationSection[] {
  const source = Array.isArray(input) ? input : [];
  return INFORMATION_SECTIONS.map(section => {
    if (section.id === "description") return { ...section, fields: [] };
    const row = source.find(item => item?.id === section.id);
    const ids = new Set<string>();
    return { ...section, fields: (Array.isArray(row?.fields) ? row.fields : []).slice(0, 40).flatMap((field: any) => {
      const id = text(field?.id, 100), label = text(field?.label, 100);
      if (!id || !label || ids.has(id) || id === "size_usage" || id === "description") return [];
      ids.add(id);
      return [{ id, label, options: (Array.isArray(field.options) ? field.options : []).slice(0, 100).flatMap((option: any) => {
        const id = text(option?.id, 100), label = text(option?.label, 100), value = text(option?.value);
        return id && label && value ? [{ id, label, value }] : [];
      }) }];
    }) };
  });
}
export function normalizeProductInformation(input: unknown): ProductInformation[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.slice(0, 160).flatMap(row => {
    const section = text(row?.section, 100), field = text(row?.field, 100), label = text(row?.label, 100), value = text(row?.value);
    const key = `${section}:${field}`;
    if (section === "description" || field === "description" || !INFORMATION_SECTIONS.some(item => item.id === section) || !field || !label || !value || field === "size_usage" || seen.has(key)) return [];
    seen.add(key);
    return [{ section, field, label, value }];
  });
}
