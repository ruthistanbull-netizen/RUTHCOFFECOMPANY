/** ROSTA's database owner and public media delivery contract, shared by both apps. */
export const ROSTA_SELF_HOSTED_SUPABASE_URL = "https://rosta-supabase.tail178b60.ts.net";
export const ROSTA_RETIRED_CLOUD_URL = "https://fposvxuryzidmeuwytbg.supabase.co";
export const ROSTA_STORE_URL = "https://rostacoffecompany.zeabur.app";

export function normalizeRostaSupabaseUrl(value?: string): string {
  const normalized = value?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "") || ROSTA_SELF_HOSTED_SUPABASE_URL;
  let url: URL;
  try { url = new URL(normalized); }
  catch { throw new Error("ROSTA Supabase URL geçersiz."); }
  if (url.protocol !== "https:" ||
      ![ROSTA_SELF_HOSTED_SUPABASE_URL, ROSTA_RETIRED_CLOUD_URL].includes(url.origin) ||
      url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("ROSTA güvenlik kilidi: yalnızca ROSTA self-host Supabase adresine bağlanılabilir.");
  }
  // The old host is an input alias, never a database or Storage fallback.
  return ROSTA_SELF_HOSTED_SUPABASE_URL;
}

/** Signed/private and foreign assets keep their original access semantics. */
export function rostaPublicMediaUrl(source: string, deliveryOrigin = ROSTA_STORE_URL): string {
  if (!source || !/^https:\/\//i.test(source)) return source;
  try {
    const url = new URL(source);
    const gatewayPath = url.pathname.match(/^\/api\/rosta-media\/(rosta-media|website-media)\/.+$/);
    if (url.origin === ROSTA_STORE_URL && gatewayPath && !url.username && !url.password) {
      return `${deliveryOrigin}${url.pathname}${url.search}${url.hash}`;
    }
    if (url.username || url.password ||
        ![ROSTA_SELF_HOSTED_SUPABASE_URL, ROSTA_RETIRED_CLOUD_URL].includes(url.origin)) return source;
    const path = url.pathname.match(/^\/storage\/v1\/(?:object|render\/image)\/public\/(rosta-media|website-media)\/(.+)$/);
    if (!path) return source;
    return `${deliveryOrigin}/api/rosta-media/${path[1]}/${path[2]}${url.search}${url.hash}`;
  } catch { return source; }
}

export function rostaPublicMediaReferences<T>(value: T, deliveryOrigin = ROSTA_STORE_URL): T {
  if (typeof value === "string") return rostaPublicMediaUrl(value, deliveryOrigin) as T;
  if (Array.isArray(value)) return value.map((item) => rostaPublicMediaReferences(item, deliveryOrigin)) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, rostaPublicMediaReferences(item, deliveryOrigin)],
  )) as T;
}

/** Upload paths contain a fresh timestamp/UUID and are never overwritten. */
export function rostaMediaCacheControl(path: readonly string[]): string {
  const immutable = /^\d{13}-[a-f0-9]{8}(?:-[a-f0-9]{4}){0,3}(?:-[a-f0-9]{12})?-/i.test(path.at(-1) || "");
  return immutable
    ? "public, max-age=31536000, immutable"
    : "public, max-age=300, stale-while-revalidate=60";
}

/** Bound connection/header time, not the entire streamed video download. */
export async function fetchRostaMediaHeaders(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  try { return await fetch(url, { ...init, signal }); }
  finally { clearTimeout(timer); }
}
