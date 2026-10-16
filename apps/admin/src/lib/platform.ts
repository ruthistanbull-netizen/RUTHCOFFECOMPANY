import { normalizeRostaSupabaseUrl, ROSTA_SELF_HOSTED_SUPABASE_URL, ROSTA_STORE_URL } from "@ruth-commerce/commerce-core/rosta-media";

export { ROSTA_SELF_HOSTED_SUPABASE_URL, ROSTA_STORE_URL };
export const ROSTA_PANEL_URL = "https://rostapanel.zeabur.app";
export const ROSTA_SUPABASE_URL = ROSTA_SELF_HOSTED_SUPABASE_URL;

// ROSTA's self-hosted gateway may use server-only env names instead of the
// cloud-hosted NEXT_PUBLIC_* convention. Only public/anon keys are eligible.
export const ROSTA_SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.SUPABASE_ANON_KEY?.trim() ||
  process.env.ANON_KEY?.trim() ||
  "";

export const assertRostaSupabaseUrl = normalizeRostaSupabaseUrl;
