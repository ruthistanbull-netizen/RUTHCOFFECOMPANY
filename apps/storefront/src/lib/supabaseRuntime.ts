import {
  normalizeRostaSupabaseUrl,
  rostaPublicMediaReferences,
  rostaPublicMediaUrl,
  ROSTA_SELF_HOSTED_SUPABASE_URL,
} from "@ruth-commerce/commerce-core/rosta-media";

export { ROSTA_SELF_HOSTED_SUPABASE_URL };
export const CANONICAL_SUPABASE_URL = ROSTA_SELF_HOSTED_SUPABASE_URL;
export const normalizeSupabaseUrl = normalizeRostaSupabaseUrl;

// Rendering migrated media must not depend on build-time DB credentials.
export function rewriteRostaPublicStorageUrl(source: string): string {
  return rostaPublicMediaUrl(source, "");
}
export const rewriteRostaThemeStorageUrl = rewriteRostaPublicStorageUrl;
export function rewriteRostaPublicMediaReferences<T>(value: T): T {
  return rostaPublicMediaReferences(value, "");
}
