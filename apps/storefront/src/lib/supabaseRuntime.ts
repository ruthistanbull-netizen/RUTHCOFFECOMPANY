export const ROSTA_SUPABASE_PROJECT_REF = "fposvxuryzidmeuwytbg";
export const CANONICAL_SUPABASE_URL = `https://${ROSTA_SUPABASE_PROJECT_REF}.supabase.co`;

function clean(value?: string) {
  return value?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "") || "";
}

export function normalizeSupabaseUrl(value?: string) {
  const normalized = clean(value) || CANONICAL_SUPABASE_URL;
  let hostname = "";
  try {
    hostname = new URL(normalized).hostname.toLowerCase();
  } catch {
    throw new Error("ROSTA Supabase URL geçersiz.");
  }

  const expected = `${ROSTA_SUPABASE_PROJECT_REF}.supabase.co`;
  if (hostname !== expected) {
    throw new Error(
      `ROSTA güvenlik kilidi: Supabase projesi ${ROSTA_SUPABASE_PROJECT_REF} dışında bir veritabanına bağlanılamaz.`,
    );
  }
  return CANONICAL_SUPABASE_URL;
}
