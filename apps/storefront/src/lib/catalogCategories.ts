export type StandardCategoryDefinition = {
  name: string;
  databaseSlug: string;
  publicSlug: string;
  aliases: string[];
  description: string;
};

// Kategoriler artık tamamen panel/Supabase kaynaklıdır. Kod içinde hazır kategori tutulmaz.
export const STANDARD_CATEGORIES: StandardCategoryDefinition[] = [];

export function normalizeCatalogValue(value: unknown) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/û/g, "u")
    .replace(/î/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function getStandardCategory(_value: unknown) {
  return null;
}

export function canonicalDatabaseCategorySlug(value: unknown) {
  return normalizeCatalogValue(value);
}

export function publicCategorySlug(value: unknown) {
  return normalizeCatalogValue(value);
}

export function categoryDisplayName(_value: unknown, fallback = "Kategori") {
  return String(fallback || "Kategori").trim();
}

export function categoryDescription(_value: unknown, fallback = "Ruth Istanbul seçili parçaları.") {
  return fallback;
}

export function categoryAliases(value: unknown) {
  const normalized = normalizeCatalogValue(value);
  return normalized ? [normalized] : [];
}

export function categoryHref(value: unknown) {
  return `/category/${publicCategorySlug(value)}`;
}
