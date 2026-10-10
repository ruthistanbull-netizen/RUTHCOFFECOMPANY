import { ROSTA_SELF_HOSTED_SUPABASE_URL, ROSTA_STORE_URL, ROSTA_SUPABASE_URL, assertRostaSupabaseUrl } from "@/lib/platform";

export const CANONICAL_SUPABASE_URL = ROSTA_SUPABASE_URL;

export function normalizeSupabaseUrl(value?: string) {
  return assertRostaSupabaseUrl(value?.trim() || CANONICAL_SUPABASE_URL);
}

/** Browser previews use the storefront same-origin public media gateway. */
export function previewRostaPublicMediaUrl(value: string): string {
  if (!value || !/^https:\/\//i.test(value)) return value;
  try {
    const current = new URL(value);
    const parsed = current.pathname.match(/^\/storage\/v1\/(?:object|render\/image)\/public\/(rosta-media|website-media)\/(.+)$/);
    if (!parsed) return value;
    if (current.origin !== ROSTA_SELF_HOSTED_SUPABASE_URL && current.origin !== ROSTA_SUPABASE_URL) return value;
    if (current.origin === ROSTA_SUPABASE_URL) {
      const configured = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
      if (configured !== ROSTA_SELF_HOSTED_SUPABASE_URL) return value;
    }
    return `${ROSTA_STORE_URL}/api/rosta-media/${parsed[1]}/${parsed[2]}${current.search}${current.hash}`;
  } catch {
    return value;
  }
}
