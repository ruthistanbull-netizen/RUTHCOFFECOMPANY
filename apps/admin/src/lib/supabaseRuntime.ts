import { normalizeRostaSupabaseUrl, rostaPublicMediaReferences, rostaPublicMediaUrl, ROSTA_SELF_HOSTED_SUPABASE_URL } from "@ruth-commerce/commerce-core/rosta-media";

export const CANONICAL_SUPABASE_URL = ROSTA_SELF_HOSTED_SUPABASE_URL;
export const normalizeSupabaseUrl = normalizeRostaSupabaseUrl;
export const previewRostaPublicMediaUrl = rostaPublicMediaUrl;
export const rewriteRostaPublicMediaReferences = rostaPublicMediaReferences;
