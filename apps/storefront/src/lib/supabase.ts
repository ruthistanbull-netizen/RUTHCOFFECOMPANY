import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseFetch } from "@/lib/supabaseFetch";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";

/**
 * The storefront root layout (including /_not-found) imports this module.
 * A malformed Zeabur Supabase variable must not crash the entire build during
 * module evaluation. Only an explicitly approved ROSTA host can be used.
 * Do not silently switch to the old Cloud project or any Ruth database.
 */
function initializeRostaPublicClient(): SupabaseClient | null {
  const anonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )?.trim();

  if (!anonKey) {
    console.error("[ROSTA storefront] Public Supabase key missing; catalog is unavailable.");
    return null;
  }

  try {
    const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
    return createClient(url, anonKey, { global: { fetch: supabaseFetch } });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Supabase initialization failed";
    console.error("[ROSTA storefront] Public Supabase client could not initialize:", reason);
    return null;
  }
}

export const supabase = initializeRostaPublicClient();
export const hasSupabaseEnv = Boolean(supabase);
