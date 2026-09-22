import { createClient } from "@supabase/supabase-js";
import { supabaseFetch } from "@/lib/supabaseFetch";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";

const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fposvxuryzidmeuwytbg.supabase.co");
const supabaseAnonKey = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_6Zoqk9z0WEDsvNZ79-b2Qw_fnKVuWhb"
)?.trim();

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseEnv
  ? createClient(supabaseUrl, supabaseAnonKey as string, {
      global: { fetch: supabaseFetch },
    })
  : null;
