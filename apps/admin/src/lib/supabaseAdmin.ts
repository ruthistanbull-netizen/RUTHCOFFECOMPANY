import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertRostaSupabaseUrl, ROSTA_SUPABASE_URL } from "@/lib/platform";

let client: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (client) return client;
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!key) throw new Error("Panel Supabase service-role env değeri eksik: SUPABASE_SERVICE_ROLE_KEY.");

  const requestedUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ROSTA_SUPABASE_URL;
  const url = assertRostaSupabaseUrl(requestedUrl);

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
