export const ROSTA_PANEL_URL = "https://rostapanel.zeabur.app";
export const ROSTA_STORE_URL = "https://rostacoffecompany.zeabur.app";
export const ROSTA_SUPABASE_PROJECT_REF = "fposvxuryzidmeuwytbg";
export const ROSTA_SUPABASE_URL = `https://${ROSTA_SUPABASE_PROJECT_REF}.supabase.co`;
export const ROSTA_SELF_HOSTED_SUPABASE_URL = "https://rosta-supabase.tail178b60.ts.net";

const ALLOWED_ROSTA_SUPABASE_HOSTNAMES = new Set([
  new URL(ROSTA_SUPABASE_URL).hostname,
  new URL(ROSTA_SELF_HOSTED_SUPABASE_URL).hostname,
]);

export const ROSTA_SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export function assertRostaSupabaseUrl(value?: string) {
  const normalized = String(value || ROSTA_SUPABASE_URL).trim().replace(/\/+$/, "");
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
    throw new Error("ROSTA güvenlik kilidi: panel yalnızca ROSTA Cloud veya OVHcloud Supabase adresine bağlanabilir.");
  }

  return parsed.origin;
}
