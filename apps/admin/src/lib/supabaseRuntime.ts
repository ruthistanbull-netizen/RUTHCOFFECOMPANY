import { assertRostaSupabaseUrl, ROSTA_SUPABASE_URL } from "@/lib/platform";

export const CANONICAL_SUPABASE_URL = ROSTA_SUPABASE_URL;

/**
 * Reject Ruth or third-party hosts. Never silently rewrite a configured
 * endpoint back to the retired Cloud project.
 */
export function normalizeSupabaseUrl(value?: string) {
  return assertRostaSupabaseUrl(value?.trim() || CANONICAL_SUPABASE_URL);
}

/** View only: never change the published theme or Storage metadata. */
export function previewRostaPublicMediaUrl(value: string): string {
  if (!value || !value.startsWith("https://")) return value;
  try {
    const host = new URL(value);
    if (host.origin !== ROSTA_SUPABASE_URL ||
      !/^\/storage\/v1\/(?:object|render\/image)\/public\/(?:rosta-media|website-media)\//.test(host.pathname)) return value;
    const endpoint = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const objectPath = host.pathname.replace(/^\/storage\/v1\/render\/image\/public\//, "/storage/v1/object/public/");
    return endpoint + objectPath + host.search + host.hash;
  } catch {
    return value;
  }
}
