"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertRostaSupabaseUrl,
  ROSTA_SUPABASE_PUBLISHABLE_KEY,
  ROSTA_SUPABASE_URL,
} from "@/lib/platform";

let client: SupabaseClient | null = null;

export function getSupabaseBrowser() {
  if (client) return client;
  const url = assertRostaSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || ROSTA_SUPABASE_URL);
  client = createClient(url, ROSTA_SUPABASE_PUBLISHABLE_KEY.trim(), {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
