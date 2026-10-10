export const ROSTA_SUPABASE_PROJECT_REF = "fposvxuryzidmeuwytbg";
export const CANONICAL_SUPABASE_URL = `https://${ROSTA_SUPABASE_PROJECT_REF}.supabase.co`;
export const ROSTA_SELF_HOSTED_SUPABASE_URL = "https://rosta-supabase.tail178b60.ts.net";

const ALLOWED_ROSTA_SUPABASE_HOSTNAMES = new Set([
  new URL(CANONICAL_SUPABASE_URL).hostname,
  new URL(ROSTA_SELF_HOSTED_SUPABASE_URL).hostname,
]);

function clean(value?: string) {
  return value?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "") || "";
}

export function normalizeSupabaseUrl(value?: string) {
  const normalized = clean(value) || CANONICAL_SUPABASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("ROSTA Supabase URL geçersiz.");
  }

  if (
    parsed.protocol !== "https:" ||
    !ALLOWED_ROSTA_SUPABASE_HOSTNAMES.has(parsed.hostname.toLowerCase()) ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("ROSTA güvenlik kilidi: yalnızca ROSTA Cloud veya OVHcloud Supabase adresine bağlanılabilir.");
  }

  return parsed.origin;
}
