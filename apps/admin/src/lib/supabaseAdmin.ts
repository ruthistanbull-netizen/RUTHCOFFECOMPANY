import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ROSTA_SUPABASE_URL } from "@/lib/platform";

let client: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (client) return client;
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!key) throw new Error("Panel Supabase service-role env değeri eksik: SUPABASE_SERVICE_ROLE_KEY.");
  client = createClient(ROSTA_SUPABASE_URL.replace(/\/+$/, ""), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
