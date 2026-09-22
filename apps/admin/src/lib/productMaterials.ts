export const CANONICAL_PRODUCT_MATERIALS = [
  "Arabica",
  "Robusta",
  "Arabica + Robusta Blend",
  "Kafeinsiz",
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

  if (normalized === "arabica" || normalized === "100% arabica") return "Arabica";
  if (normalized === "robusta" || normalized === "100% robusta") return "Robusta";
  if (
    normalized === "blend" ||
    normalized === "arabica robusta" ||
    normalized === "arabica + robusta" ||
    normalized === "arabica + robusta blend" ||
    normalized === "arabica-robusta blend"
  ) return "Arabica + Robusta Blend";
  if (
    normalized === "kafeinsiz" ||
    normalized === "decaf" ||
    normalized === "decaffeinated"
  ) return "Kafeinsiz";

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
