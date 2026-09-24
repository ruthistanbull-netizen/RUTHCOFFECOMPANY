import type { Product } from "@/types/site";

function lower(value: string) {
  return value.toLocaleLowerCase("tr-TR").trim();
}

function normalized(value: string) {
  return lower(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ");
}

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (!part) return part;
      const rest = part.slice(1).toLocaleLowerCase("tr-TR");
      return part.charAt(0).toLocaleUpperCase("tr-TR") + rest;
    })
    .join(" ");
}

export function uniqueClean(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = value?.trim().replace(/\s+/g, " ");
    if (!cleaned) continue;
    const key = lower(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

export function displayCategoryName(value: string | null | undefined) {
  if (!value) return null;
  return titleCase(value.replace(/[-_]+/g, " "));
}

export function isCategoryLikeValue(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

export function displayCollectionName(value: string | null | undefined) {
  if (!value) return null;
  return titleCase(value.replace(/[-_]+/g, " "));
}

export function productHasImage(product: Product) {
  return Boolean(
    product.main_image_url ||
      product.image_urls?.some((image) => Boolean(image && image.trim()))
  );
}

export function displayMaterial(product: Product) {
  return (
    product.material?.trim() ||
    product.material_note?.trim() ||
    "Çekirdek / içerik bilgisi"
  );
}

export function materialFilterValue(product: Product) {
  return displayMaterial(product) || null;
}

// Kept under the copied UI function name; in ROSTA this normalizes roast level.
export function cleanColorValue(value: string | null | undefined) {
  if (!value) return null;
  const raw = value.trim().replace(/\s+/g, " ");
  if (!raw || raw.length > 48) return null;

  const text = normalized(raw);
  const map: Record<string, string> = {
    "acik": "Açık Kavrum",
    "acik kavrum": "Açık Kavrum",
    "light": "Açık Kavrum",
    "light roast": "Açık Kavrum",
    "orta-acik": "Orta-Açık Kavrum",
    "orta acik": "Orta-Açık Kavrum",
    "orta-acik kavrum": "Orta-Açık Kavrum",
    "orta acik kavrum": "Orta-Açık Kavrum",
    "medium-light": "Orta-Açık Kavrum",
    "medium light": "Orta-Açık Kavrum",
    "medium-light roast": "Orta-Açık Kavrum",
    "orta": "Orta Kavrum",
    "orta kavrum": "Orta Kavrum",
    "medium": "Orta Kavrum",
    "medium roast": "Orta Kavrum",
    "orta-koyu": "Orta-Koyu Kavrum",
    "orta koyu": "Orta-Koyu Kavrum",
    "orta-koyu kavrum": "Orta-Koyu Kavrum",
    "orta koyu kavrum": "Orta-Koyu Kavrum",
    "medium-dark": "Orta-Koyu Kavrum",
    "medium dark": "Orta-Koyu Kavrum",
    "medium-dark roast": "Orta-Koyu Kavrum",
    "koyu": "Koyu Kavrum",
    "koyu kavrum": "Koyu Kavrum",
    "dark": "Koyu Kavrum",
    "dark roast": "Koyu Kavrum",
  };

  return map[text] || titleCase(raw);
}

function variantOptionEntries(product: Product) {
  return (product.variants || []).flatMap((variant) =>
    Object.entries(variant.options || {})
  );
}

// Copied UI function name; returns roast values in the ROSTA storefront.
export function productColorValues(product: Product) {
  const values: string[] = [];
  const base = cleanColorValue(product.finish_color);
  if (base) values.push(base);

  for (const [name, value] of variantOptionEntries(product)) {
    const optionName = normalized(name);
    if (
      optionName.includes("kavrum") ||
      optionName.includes("roast") ||
      optionName.includes("kavurma")
    ) {
      const cleaned = cleanColorValue(value);
      if (cleaned) values.push(cleaned);
    }
  }

  return uniqueClean(values).sort((a, b) => a.localeCompare(b, "tr"));
}

export function productStoneValues(product: Product) {
  const values: string[] = [];

  for (const [name, value] of variantOptionEntries(product)) {
    const optionName = normalized(name);
    if (
      optionName.includes("ogut") ||
      optionName.includes("grind") ||
      optionName.includes("cekim") ||
      optionName.includes("demleme") ||
      optionName.includes("paket") ||
      optionName.includes("gramaj") ||
      optionName.includes("weight") ||
      optionName.includes("boyut")
    ) {
      const cleaned = value?.trim().replace(/\s+/g, " ");
      if (cleaned) values.push(titleCase(cleaned));
    }
  }

  return uniqueClean(values).sort((a, b) => a.localeCompare(b, "tr"));
}

export function productCategoryValues(product: Product) {
  const values = [
    ...(product.category_names || []),
    ...(product.category_slugs || []),
  ].filter((value): value is string => Boolean(value && value.trim()));

  return uniqueClean(values.map(displayCategoryName)).sort((a, b) =>
    a.localeCompare(b, "tr")
  );
}

export function productCollectionFilterValue(product: Product) {
  const raw =
    product.collections?.name ||
    product.collections?.slug ||
    product.collection_slugs?.[0] ||
    null;
  if (!raw) return null;
  return displayCollectionName(raw);
}

export function productSearchText(product: Product) {
  const variantText = (product.variants || [])
    .map((variant) =>
      [variant.option_summary, ...Object.values(variant.options || {})]
        .filter(Boolean)
        .join(" ")
    )
    .join(" ");

  return lower(
    [
      product.name,
      product.short_description,
      product.description,
      product.material,
      product.material_note,
      product.finish_color,
      product.size_usage,
      product.care_advice,
      product.collections?.name,
      product.collections?.slug,
      ...(product.collection_slugs || []),
      ...(product.category_names || []),
      ...(product.category_slugs || []),
      variantText,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

export function productKindText(product: Product) {
  return lower(
    [
      product.name,
      product.collections?.name,
      product.collections?.slug,
      ...(product.collection_slugs || []),
      ...(product.category_names || []),
      ...(product.category_slugs || []),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function cleanProductLine(line: string) {
  return line.trim().replace(/\s+/g, " ");
}

export function cleanedProductDescription(product: Product) {
  const description = product.description || product.short_description || "";
  return uniqueClean(
    description
      .split(/\r?\n+/)
      .map(cleanProductLine)
      .filter(Boolean)
  ).join("\n\n");
}

export function productMaterialDetails(product: Product) {
  return product.material_note?.trim() || product.material?.trim() || "";
}

export function productCareDetails(product: Product) {
  return product.care_advice?.trim() || "";
}
