export const ROSTA_PANEL_URL = "https://rostapanel.zeabur.app";
export const ROSTA_STORE_URL = "https://rostacoffecompany.zeabur.app";
export const ROSTA_SUPABASE_PROJECT_REF = "fposvxuryzidmeuwytbg";
export const ROSTA_SUPABASE_URL = `https://${ROSTA_SUPABASE_PROJECT_REF}.supabase.co`;

export const ROSTA_SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export function assertRostaSupabaseUrl(value?: string) {
  const normalized = String(value || ROSTA_SUPABASE_URL).trim().replace(/\/+$/, "");
  let hostname = "";
  try {
    hostname = new URL(normalized).hostname.toLowerCase();
  } catch {
    throw new Error("ROSTA Supabase URL geçersiz.");
  }
  const expected = `${ROSTA_SUPABASE_PROJECT_REF}.supabase.co`;
  if (hostname !== expected) {
    throw new Error(
      `ROSTA güvenlik kilidi: panel başka bir Supabase projesine bağlanamaz (${hostname || "unknown"}).`,
    );
  }
  return ROSTA_SUPABASE_URL;
}
