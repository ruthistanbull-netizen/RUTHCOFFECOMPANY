export const CANONICAL_SUPABASE_URL = "https://supabase.ruthistanbul.com";

const LEGACY_PRODUCTION_SUPABASE_URLS = new Set([
  "https://mpfpkiikqutiwuycpsjb.supabase.co",
]);

export function normalizeSupabaseUrl(value?: string) {
  const normalized = value?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
  if (!normalized) return CANONICAL_SUPABASE_URL;
  if (LEGACY_PRODUCTION_SUPABASE_URLS.has(normalized.toLowerCase())) {
    return CANONICAL_SUPABASE_URL;
  }
  return normalized;
}
