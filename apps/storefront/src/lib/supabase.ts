import { createClient } from "@supabase/supabase-js";
import { supabaseFetch } from "@/lib/supabaseFetch";
import { CANONICAL_SUPABASE_URL } from "@/lib/supabaseRuntime";

const supabaseUrl = CANONICAL_SUPABASE_URL;
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
