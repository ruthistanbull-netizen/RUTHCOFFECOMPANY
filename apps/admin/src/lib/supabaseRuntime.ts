import { assertRostaSupabaseUrl, ROSTA_SUPABASE_URL } from "@/lib/platform";

export const CANONICAL_SUPABASE_URL = ROSTA_SUPABASE_URL;

/**
 * Reject Ruth or third-party hosts. Never silently rewrite a configured
 * endpoint back to the retired Cloud project.
 */
export function normalizeSupabaseUrl(value?: string) {
  return assertRostaSupabaseUrl(value?.trim() || CANONICAL_SUPABASE_URL);
}
