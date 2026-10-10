export const ROSTA_SUPABASE_PROJECT_REF = "fposvxuryzidmeuwytbg";
export const CANONICAL_SUPABASE_URL = `https://${ROSTA_SUPABASE_PROJECT_REF}.supabase.co`;
export const ROSTA_SELF_HOSTED_SUPABASE_URL = "https://rosta-supabase.tail178b60.ts.net";

const ALLOWED_ROSTA_SUPABASE_HOSTNAMES = new Set([
  new URL(CANONICAL_SUPABASE_URL).hostname,
  new URL(ROSTA_SELF_HOSTED_SUPABASE_URL).hostname,
]);

function clean(value?: string) {
  return value?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "") || "";
}

export function normalizeSupabaseUrl(value?: string) {
  const normalized = clean(value) || CANONICAL_SUPABASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("ROSTA Supabase URL geçersiz.");
  }

  if (
    parsed.protocol !== "https:" ||
    !ALLOWED_ROSTA_SUPABASE_HOSTNAMES.has(parsed.hostname.toLowerCase()) ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error("ROSTA güvenlik kilidi: yalnızca ROSTA Cloud veya OVHcloud Supabase adresine bağlanılabilir.");
  }

  return parsed.origin;
}

/**
 * Convert only ROSTA's own *public* Supabase Storage URLs.
 * Never touch Ruth, foreign URLs, private/signed URLs, or records in the DB.
 * If Zeabur is misconfigured, media rendering should not crash the entire
 * storefront/editor SSR tree; the public API issue can be diagnosed separately.
 */
/**
 * Browser-facing public media must not point to the private Tailscale address.
 * Storefront serves known public bucket objects via its own origin. Old public
 * Cloud URLs are migrated only when the configured database is the self-host.
 * This is display-only: never mutate media URLs in database documents.
 */
export function rewriteRostaPublicStorageUrl(source: string): string {
  if (!source || !/^https:\/\//i.test(source)) return source;
  try {
    const current = new URL(source);
    const validPath = current.pathname.match(/^\/storage\/v1\/(?:object|render\/image)\/public\/(rosta-media|website-media)\/(.+)$/);
    if (!validPath) return source;

    const fromPrivateSelfHost = current.origin === ROSTA_SELF_HOSTED_SUPABASE_URL;
    const fromRetiredCloud = current.origin === CANONICAL_SUPABASE_URL;
    if (!fromPrivateSelfHost && !fromRetiredCloud) return source;

    const configured = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (!fromPrivateSelfHost && configured !== ROSTA_SELF_HOSTED_SUPABASE_URL) return source;

    const mediaPath = validPath[2];
    return `https://rostacoffecompany.zeabur.app/api/rosta-media/${validPath[1]}/${mediaPath}${current.search}${current.hash}`;
  } catch {
    return source;
  }
}

export const rewriteRostaThemeStorageUrl = rewriteRostaPublicStorageUrl;

/** Update public media URLs in CMS theme documents without changing stored data. */
export function rewriteRostaPublicMediaReferences<T>(value: T): T {
  if (typeof value === "string") return rewriteRostaPublicStorageUrl(value) as T;
  if (Array.isArray(value)) return value.map((item) => rewriteRostaPublicMediaReferences(item)) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, rewriteRostaPublicMediaReferences(item)]),
  ) as T;
}
