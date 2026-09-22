"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ROSTA_SUPABASE_PUBLISHABLE_KEY, ROSTA_SUPABASE_URL } from "@/lib/platform";

let client: SupabaseClient | null = null;

export function getSupabaseBrowser() {
  if (client) return client;
  client = createClient(ROSTA_SUPABASE_URL.replace(/\/+$/, ""), ROSTA_SUPABASE_PUBLISHABLE_KEY.trim(), {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
