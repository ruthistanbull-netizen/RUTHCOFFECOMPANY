export const CANONICAL_PRODUCT_MATERIALS = [
  "925 Ayar Gümüş",
  "Brass",
  "Bez Kumaş",
] as const;

function normalizeMaterialText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ");
}

export function normalizeProductMaterial(value: unknown): string | null {
  const text = String(value || "").trim();
  const normalized = normalizeMaterialText(text);
  if (!normalized) return null;
  if (normalized === "celik" || normalized === "steel") return null;
  if (normalized === "brass" || normalized === "pirinc") return "Brass";
  if (normalized === "bez kumas") return "Bez Kumaş";
  if (normalized === "925 ayar gumus") return "925 Ayar Gümüş";
  return text;
}

export function productMaterialFormValue(value: unknown, fallback = "") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return normalizeProductMaterial(raw) ?? raw;
}

export function productMaterialOptions(values: Array<unknown> = []) {
  const output: string[] = [];
  const seen = new Set<string>();

  for (const raw of values) {
    const material = normalizeProductMaterial(raw);
    if (!material) continue;
    const key = normalizeMaterialText(material);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(material);
  }

  for (const material of CANONICAL_PRODUCT_MATERIALS) {
    const key = normalizeMaterialText(material);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(material);
  }

  return output;
}
