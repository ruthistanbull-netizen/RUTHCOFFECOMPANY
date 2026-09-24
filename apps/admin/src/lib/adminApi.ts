"use client";

import { requestAdminConfirmation } from "@/lib/adminConfirmation";
import { normalizePanelRoute, panelSnapshotEligible } from "@/lib/panelSyncRegistry";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const apiBase = "";
const DEFAULT_TIMEOUT_MS = 12_000;
const MUTATION_TIMEOUT_MS = 30_000;
const META_TIMEOUT_MS = 45_000;
const DEFAULT_TTL_MS = 45_000;
const DEFAULT_STALE_MS = 30 * 60_000;
const CACHE_PREFIX = "rosta_admin_api_cache_v6:";
const MUTATION_KEY_PREFIX = "rosta_admin_mutation_key_v1:";
const SNAPSHOT_BOOTSTRAP_KEY = "rosta_admin_snapshot_bootstrap_v1";
const SNAPSHOT_BOOTSTRAP_COOLDOWN_MS = 60_000;
const MAX_PERSISTED_CHARS = 800_000;
const SERVER_SNAPSHOT_TIMEOUT_MS = 1_200;
const SNAPSHOT_BOOTSTRAP_TIMEOUT_MS = 2_500;

type AdminRequestInit = RequestInit & {
  timeoutMs?: number;
  confirmation?: string | false;
  force?: boolean;
  hardRefresh?: boolean;
  ttlMs?: number;
  staleMs?: number;
  invalidate?: string[] | false;
};

type CacheEntry = { value: any; freshUntil: number; staleUntil: number; storedAt: number };
const memory = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<any>>();
const serverSnapshotInFlight = new Map<string, Promise<any | null>>();
const registeredPanelRoutes = new Set<string>();
let cacheGeneration = 0;
let tokenCache: { token: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;
let snapshotBootstrapRequest: Promise<{ hydrated: number; generatedAt?: string } | null> | null = null;
let lastSyncKickAt = 0;
let syncKickScheduled = false;

function parseJsonBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") return {} as Record<string, unknown>;
  try {
    const value = JSON.parse(body);
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function sensitiveCommandConfirmation(path: string, init: RequestInit) {
  const method = String(init.method || "GET").toUpperCase();
  const body = parseJsonBody(init.body);
  if (path === "/api/products/safe-update" && method === "DELETE") return "Ürün arşivlenecek ve storefront görünürlüğü değişecek. Devam edilsin mi?";
  if (path === "/api/shipping/basit-kargo/shipments" && method === "POST") return "Basit Kargo gönderisi ve barkodu oluşturulacak. Devam edilsin mi?";
  if (path === "/api/shipping/basit-kargo/bulk" && method === "POST") return "Seçili siparişler için toplu Basit Kargo gönderisi oluşturulacak. Devam edilsin mi?";
  if (/^\/api\/shipping\/basit-kargo\/shipments\/[^/]+\/cancel$/.test(path) && method === "POST") return "Kargo gönderisi iptal edilecek. Devam etmek istediğine emin misin?";
  if (/^\/api\/shipping\/basit-kargo\/shipments\/[^/]+\/return$/.test(path) && method === "POST") return "İade kargo kodu oluşturulacak. Devam edilsin mi?";
  if (path.startsWith("/api/email/status?provider=") && method === "DELETE") return "E-posta servis bağlantısı kesilecek ve gönderimler durabilir. Devam edilsin mi?";
  if (path === "/api/reviews/status" && method === "PUT" && String(body.status || "").toLowerCase() === "rejected") return "Bu müşteri yorumu reddedilecek. Devam etmek istediğine emin misin?";
  if (path === "/api/push/subscriptions" && method === "DELETE") return "Bu cihazın push bildirim aboneliği kapatılacak. Devam edilsin mi?";
  if (path === "/api/push/test" && method === "POST") return "Bu cihaza gerçek bir test push bildirimi gönderilecek. Devam edilsin mi?";
  if (path === "/api/review-automation/cron" && method === "POST") return "Değerlendirme otomasyonu şimdi çalışacak ve uygun alıcılara e-posta gönderebilir. Devam edilsin mi?";
  if (path === "/api/email/abandoned-cart/run" && method === "POST") return "Terk sepet otomasyonu şimdi çalışacak ve uygun alıcılara e-posta gönderebilir. Devam edilsin mi?";
  if (path === "/api/shipping/operations" && method === "POST" && body.action === "retry_all_webhooks") return "Başarısız ve dead-letter webhook kayıtları yeniden kuyruğa alınacak. Devam edilsin mi?";
  return null;
}

function routeRangePath(path: string, method: string) {
  if (method !== "GET" || typeof window === "undefined") return path;
  const activeRange = new URLSearchParams(window.location.search).get("range");
  if (!activeRange) return path;
  const pathname = window.location.pathname;
  const applies = (pathname === "/shipping" && path.startsWith("/api/shipping/basit-kargo/orders"))
    || (pathname === "/returns" && path.startsWith("/api/returns?"))
    || (pathname === "/abandoned-carts" && path.startsWith("/api/abandoned-carts?"));
  if (!applies) return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("range", activeRange);
  return `${url.pathname}${url.search}`;
}

function routePathname(path: string) {
  try {
    return new URL(path, typeof window === "undefined" ? "https://admin.local" : window.location.origin).pathname;
  } catch {
    return path.split("?")[0] || path;
  }
}

function requestTimeout(path: string, method = "GET") {
  if (routePathname(path).startsWith("/api/meta-ads")) return META_TIMEOUT_MS;
  return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())
    ? DEFAULT_TIMEOUT_MS
    : MUTATION_TIMEOUT_MS;
}

function cachePolicy(path: string) {
  const pathname = routePathname(path);
  if (pathname === "/api/summary") return { ttlMs: 45_000, staleMs: 45 * 60_000 };
  if (pathname === "/api/orders") return { ttlMs: 35_000, staleMs: 45 * 60_000 };
  if (pathname === "/api/preparing-products") return { ttlMs: 30_000, staleMs: 30 * 60_000 };
  if (pathname.startsWith("/api/dashboard/")) return { ttlMs: 45_000, staleMs: 45 * 60_000 };
  if (pathname.startsWith("/api/payments")) return { ttlMs: 35_000, staleMs: 45 * 60_000 };
  if (pathname === "/api/products" || pathname.startsWith("/api/product-")) return { ttlMs: 90_000, staleMs: 2 * 60 * 60_000 };
  if (pathname.startsWith("/api/customers")) return { ttlMs: 90_000, staleMs: 2 * 60 * 60_000 };
  if (pathname.startsWith("/api/shipping") || pathname.startsWith("/api/returns")) return { ttlMs: 35_000, staleMs: 45 * 60_000 };
  if (pathname.startsWith("/api/email") || pathname.startsWith("/api/reviews") || pathname.startsWith("/api/discount")) return { ttlMs: 60_000, staleMs: 90 * 60_000 };
  if (pathname.startsWith("/api/meta-ads")) return { ttlMs: 30_000, staleMs: 2 * 60 * 60_000 };
  if (pathname.startsWith("/api/theme") || pathname.startsWith("/api/site-settings")) return { ttlMs: 5 * 60_000, staleMs: 6 * 60 * 60_000 };
  if (pathname.startsWith("/api/health") || pathname.startsWith("/api/commerce-core/health")) return { ttlMs: 20_000, staleMs: 5 * 60_000 };
  return { ttlMs: DEFAULT_TTL_MS, staleMs: DEFAULT_STALE_MS };
}

function mutationInvalidation(path: string) {
  const pathname = routePathname(path);
  if (pathname.startsWith("/api/products") || pathname.startsWith("/api/product-") || pathname.startsWith("/api/catalog")) return ["/api/products", "/api/product-", "/api/catalog", "/api/dashboard/catalog-counts", "/api/summary"];
  if (pathname.startsWith("/api/orders")) return ["/api/orders", "/api/preparing-products", "/api/summary", "/api/dashboard/", "/api/payments", "/api/returns", "/api/shipping", "/api/customers", "/api/crm"];
  if (pathname.startsWith("/api/payments") || pathname.startsWith("/api/paytr")) return ["/api/payments", "/api/paytr", "/api/orders", "/api/summary", "/api/dashboard/", "/api/returns"];
  if (pathname.startsWith("/api/shipping")) return ["/api/shipping", "/api/orders", "/api/summary", "/api/returns"];
  if (pathname.startsWith("/api/returns")) return ["/api/returns", "/api/orders", "/api/payments", "/api/summary"];
  if (pathname.startsWith("/api/customers") || pathname.startsWith("/api/rosta-points") || pathname.startsWith("/api/ruthie-points")) return ["/api/customers", "/api/rosta-points", "/api/ruthie-points", "/api/orders", "/api/summary"];
  if (pathname.startsWith("/api/email") || pathname.startsWith("/api/reviews") || pathname.startsWith("/api/contact")) return ["/api/email", "/api/reviews", "/api/contact", "/api/customers"];
  if (pathname.startsWith("/api/discount")) return ["/api/discount", "/api/products", "/api/theme"];
  if (pathname.startsWith("/api/theme") || pathname.startsWith("/api/site-settings")) return ["/api/theme", "/api/site-settings"];
  return null;
}

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function cacheKey(path: string) {
  return `${CACHE_PREFIX}${path}`;
}

function readCache(path: string) {
  const now = Date.now();
  const key = cacheKey(path);
  let entry = memory.get(key) || null;
  if (!entry && storageAvailable()) {
    try {
      const raw = window.sessionStorage.getItem(key);
      entry = raw ? JSON.parse(raw) as CacheEntry : null;
      if (entry) memory.set(key, entry);
    } catch {
      entry = null;
    }
  }
  if (!entry || entry.staleUntil <= now) {
    memory.delete(key);
    if (storageAvailable()) window.sessionStorage.removeItem(key);
    return null;
  }
  return { entry, fresh: entry.freshUntil > now };
}

function writeCache(path: string, value: any, ttlMs: number, staleMs: number, generation = cacheGeneration) {
  if (generation !== cacheGeneration || !value || value.ok === false) return;
  const now = Date.now();
  const safeTtl = Math.max(0, ttlMs);
  const safeStale = Math.max(1_000, staleMs || DEFAULT_STALE_MS);
  const entry: CacheEntry = { value, storedAt: now, freshUntil: now + safeTtl, staleUntil: now + safeTtl + safeStale };
  const key = cacheKey(path);
  memory.set(key, entry);
  while (memory.size > 220) memory.delete(memory.keys().next().value as string);
  if (!storageAvailable()) return;

  const persist = () => {
    if (generation !== cacheGeneration) return;
    try {
      const serialized = JSON.stringify(entry);
      if (serialized.length <= MAX_PERSISTED_CHARS) window.sessionStorage.setItem(key, serialized);
    } catch {}
  };
  const idle = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number }).requestIdleCallback;
  if (idle) idle(persist, { timeout: 350 });
  else window.setTimeout(persist, 0);
}

export function seedAdminApiCache(path: string, value: any, options: { ttlMs?: number; staleMs?: number } = {}) {
  const normalized = normalizePanelRoute(path);
  const policy = cachePolicy(normalized);
  const ttlMs = options.ttlMs ?? policy.ttlMs;
  const staleMs = options.staleMs ?? policy.staleMs;
  writeCache(normalized, value, ttlMs, staleMs);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ruth-admin-api-cache-updated", {
      detail: { path: normalized, value, fresh: ttlMs > 0, seeded: true },
    }));
  }
}

export function hydrateAdminSnapshotBootstrap(force = false) {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (snapshotBootstrapRequest) return snapshotBootstrapRequest;

  if (!force && storageAvailable()) {
    const previous = Number(window.sessionStorage.getItem(SNAPSHOT_BOOTSTRAP_KEY) || 0);
    if (Number.isFinite(previous) && previous > 0 && Date.now() - previous < SNAPSHOT_BOOTSTRAP_COOLDOWN_MS) {
      return Promise.resolve({ hydrated: 0 });
    }
  }

  snapshotBootstrapRequest = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SNAPSHOT_BOOTSTRAP_TIMEOUT_MS);
    try {
      const authHeaders = await adminAuthHeaders();
      const response = await fetch("/api/instant-data?bootstrap=1", {
        method: "GET",
        headers: { ...authHeaders, "X-Ruth-Admin-Request": "1" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const body = await response.json().catch(() => ({}));
      const entries = Array.isArray(body?.entries) ? body.entries : [];
      let hydrated = 0;
      const now = Date.now();

      for (const entry of entries) {
        const route = normalizePanelRoute(String(entry?.route_path || ""));
        const payload = entry?.payload;
        if (!route || !panelSnapshotEligible(route) || !payload || payload.ok === false) continue;
        const policy = cachePolicy(route);
        const expiresAt = entry?.expires_at ? new Date(entry.expires_at).getTime() : 0;
        const healthy = String(entry?.status || "healthy") === "healthy";
        const ttlMs = healthy && Number.isFinite(expiresAt) && expiresAt > now
          ? Math.max(1_000, Math.min(policy.ttlMs, expiresAt - now))
          : 0;
        seedAdminApiCache(route, payload, { ttlMs, staleMs: policy.staleMs });
        registeredPanelRoutes.add(route);
        hydrated += 1;
      }

      if (storageAvailable()) window.sessionStorage.setItem(SNAPSHOT_BOOTSTRAP_KEY, String(Date.now()));
      window.dispatchEvent(new CustomEvent("ruth-admin-snapshot-bootstrap", {
        detail: { hydrated, knownTargets: Number(body?.knownTargets || 0), generatedAt: body?.generatedAt || null },
      }));
      return { hydrated, generatedAt: body?.generatedAt as string | undefined };
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  })().finally(() => { snapshotBootstrapRequest = null; });

  return snapshotBootstrapRequest;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function mutationStorageKey(path: string, method: string, body: BodyInit | null | undefined) {
  const bodyValue = typeof body === "string" ? body : body instanceof URLSearchParams ? body.toString() : "";
  return `${MUTATION_KEY_PREFIX}${method}:${stableHash(`${path}|${bodyValue}`)}`;
}

function mutationIdempotency(path: string, init: RequestInit) {
  const method = String(init.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return null;
  const existingHeader = new Headers(init.headers || {}).get("x-idempotency-key");
  if (existingHeader) return { key: existingHeader, storageKey: null as string | null };

  const storageKey = mutationStorageKey(path, method, init.body);
  if (!storageAvailable()) return { key: crypto.randomUUID(), storageKey: null as string | null };
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return { key: existing, storageKey };
  const key = crypto.randomUUID();
  window.sessionStorage.setItem(storageKey, key);
  return { key, storageKey };
}

export function clearAdminApiCache(match?: string) {
  cacheGeneration += 1;
  for (const key of [...memory.keys()]) if (!match || key.includes(match)) memory.delete(key);
  for (const path of [...inFlight.keys()]) if (!match || path.includes(match)) inFlight.delete(path);
  if (storageAvailable()) {
    const remove: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(CACHE_PREFIX) && (!match || key.includes(match))) remove.push(key);
    }
    remove.forEach((key) => window.sessionStorage.removeItem(key));
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("ruth-admin-api-cache-clear", { detail: { match: match || null } }));
}

function cacheMatch(value: string, matches: string[] | null) {
  return !matches || matches.some((match) => value.includes(match));
}

function markCachesStale(matches: string[] | null) {
  cacheGeneration += 1;
  const normalizedMatches = matches ? [...new Set(matches)] : null;
  const now = Date.now();
  const minimumStaleUntil = now + DEFAULT_STALE_MS;

  for (const [key, entry] of [...memory.entries()]) {
    if (!cacheMatch(key, normalizedMatches)) continue;
    memory.set(key, {
      ...entry,
      freshUntil: 0,
      staleUntil: Math.max(entry.staleUntil, minimumStaleUntil),
    });
  }

  for (const path of [...inFlight.keys()]) {
    if (cacheMatch(path, normalizedMatches)) inFlight.delete(path);
  }

  if (storageAvailable()) {
    const updates: Array<{ key: string; entry: CacheEntry }> = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(CACHE_PREFIX) || !cacheMatch(key, normalizedMatches)) continue;
      try {
        const raw = window.sessionStorage.getItem(key);
        const entry = raw ? JSON.parse(raw) as CacheEntry : null;
        if (!entry?.value || entry.value.ok === false) continue;
        updates.push({
          key,
          entry: {
            ...entry,
            freshUntil: 0,
            staleUntil: Math.max(Number(entry.staleUntil || 0), minimumStaleUntil),
          },
        });
      } catch {}
    }
    for (const update of updates) {
      try { window.sessionStorage.setItem(update.key, JSON.stringify(update.entry)); } catch {}
      memory.set(update.key, update.entry);
    }
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ruth-admin-api-cache-stale", {
      detail: { matches: normalizedMatches },
    }));
  }
}

function invalidateCaches(matches: string[] | null) {
  markCachesStale(matches);
}

function tokenExpiry(token: string) {
  try {
    const raw = token.split(".")[1];
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return Number(payload.exp || 0) * 1000;
  } catch {
    return 0;
  }
}

export function apiUrl(path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  return apiBase ? `${apiBase}${path}` : path;
}

export async function adminAuthHeaders() {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 15_000) return { Authorization: `Bearer ${tokenCache.token}` };
  if (!tokenRequest) {
    tokenRequest = (async () => {
      const { data, error } = await getSupabaseBrowser().auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token || "";
      if (!token) throw new Error("Oturum bulunamadı.");
      const expiry = tokenExpiry(token);
      tokenCache = { token, expiresAt: expiry > now ? expiry - 30_000 : now + 5 * 60_000 };
      return token;
    })().finally(() => { tokenRequest = null; });
  }
  const token = await tokenRequest;
  return { Authorization: `Bearer ${token}` };
}

function withCacheBypass(init: RequestInit) {
  const headers = new Headers(init.headers || {});
  headers.set("X-Ruth-Cache-Bypass", "1");
  return { ...init, headers };
}

function apiErrorMessage(payload: any) {
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
  if (typeof payload?.error?.message === "string" && payload.error.message.trim()) return payload.error.message;
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  return "İşlem tamamlanamadı.";
}

async function fetchRequest<T>(path: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const externalSignal = init.signal;
  const abort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abort();
  else externalSignal?.addEventListener("abort", abort, { once: true });
  const timeoutId = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const idempotency = mutationIdempotency(path, init);

  try {
    const authHeaders = await adminAuthHeaders();
    const requestHeaders = new Headers(init.headers || {});
    Object.entries(authHeaders).forEach(([key, value]) => requestHeaders.set(key, value));
    requestHeaders.set("X-Ruth-Admin-Request", "1");
    if (init.body && !(init.body instanceof FormData) && !requestHeaders.has("Content-Type")) requestHeaders.set("Content-Type", "application/json");
    if (idempotency) requestHeaders.set("x-idempotency-key", idempotency.key);

    const response = await fetch(apiUrl(path), {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: requestHeaders,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) throw new Error(apiErrorMessage(payload));
    if (idempotency?.storageKey && storageAvailable()) window.sessionStorage.removeItem(idempotency.storageKey);
    return payload as T;
  } catch (error) {
    if (timedOut) throw new Error(`İstek ${Math.ceil(timeoutMs / 1000)} saniye içinde yanıt vermedi.`);
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abort);
  }
}

async function fetchServerSnapshot<T>(path: string): Promise<{ value: T; status: string; refreshedAt?: string } | null> {
  if (!panelSnapshotEligible(path)) return null;
  const normalized = normalizePanelRoute(path);
  const existing = serverSnapshotInFlight.get(normalized);
  if (existing) return existing;

  const promise = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SERVER_SNAPSHOT_TIMEOUT_MS);
    try {
      const authHeaders = await adminAuthHeaders();
      const response = await fetch(`/api/instant-data?path=${encodeURIComponent(normalized)}`, {
        method: "GET",
        headers: { ...authHeaders, "X-Ruth-Admin-Request": "1" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const body = await response.json().catch(() => ({}));
      if (!body?.found || !body?.entry?.payload || body.entry.payload.ok === false) return null;
      return { value: body.entry.payload as T, status: String(body.entry.status || "healthy"), refreshedAt: body.entry.refreshed_at };
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  })().finally(() => serverSnapshotInFlight.delete(normalized));

  serverSnapshotInFlight.set(normalized, promise);
  return promise;
}

async function registerPanelRoute(path: string) {
  const normalized = normalizePanelRoute(path);
  if (!panelSnapshotEligible(normalized) || registeredPanelRoutes.has(normalized)) return;
  registeredPanelRoutes.add(normalized);
  try {
    const authHeaders = await adminAuthHeaders();
    await fetch("/api/instant-data", {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
        "X-Ruth-Admin-Request": "1",
        "X-Ruth-Background-Request": "1",
      },
      body: JSON.stringify({ path: normalized }),
      cache: "no-store",
    });
  } catch {
    registeredPanelRoutes.delete(normalized);
  }
}

function kickPanelSync() {
  const now = Date.now();
  if (syncKickScheduled || now - lastSyncKickAt < 15_000) return;
  syncKickScheduled = true;

  const run = async () => {
    syncKickScheduled = false;
    lastSyncKickAt = Date.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1_500);
    try {
      const authHeaders = await adminAuthHeaders();
      await fetch("/api/internal/panel-sync", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "X-Ruth-Admin-Request": "1",
          "X-Ruth-Background-Request": "1",
        },
        body: "{}",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      // The minute worker remains the fallback; mutations never fail because a refresh kick failed.
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const idle = (window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  }).requestIdleCallback;
  if (idle) idle(() => { void run(); }, { timeout: 2_500 });
  else window.setTimeout(() => { void run(); }, 1_200);
}

function startBackgroundRefresh<T>(path: string, requestInit: RequestInit, timeoutMs: number, ttlMs: number, staleMs: number) {
  if (inFlight.has(path)) return;
  const generation = cacheGeneration;
  const refresh = fetchRequest<T>(path, withCacheBypass(requestInit), timeoutMs)
    .then((value) => {
      writeCache(path, value, ttlMs, staleMs, generation);
      void registerPanelRoute(path);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ruth-admin-api-cache-updated", { detail: { path, value, fresh: ttlMs > 0 } }));
      }
      return value;
    })
    .catch(() => undefined)
    .finally(() => {
      if (inFlight.get(path) === refresh) inFlight.delete(path);
    });
  inFlight.set(path, refresh);
}

export async function adminRequest<T = any>(inputPath: string, init: AdminRequestInit = {}): Promise<T> {
  const method = String(init.method || "GET").toUpperCase();
  const rangedPath = routeRangePath(inputPath, method);
  const path = method === "GET" ? normalizePanelRoute(rangedPath) : rangedPath;
  const {
    timeoutMs = requestTimeout(path, method),
    confirmation,
    force = false,
    hardRefresh = false,
    ttlMs: requestedTtlMs,
    staleMs: requestedStaleMs,
    invalidate,
    ...requestInit
  } = init;

  const policy = cachePolicy(path);
  const ttlMs = requestedTtlMs ?? policy.ttlMs;
  const staleMs = requestedStaleMs ?? policy.staleMs;
  const confirmationMessage = confirmation === false ? null : typeof confirmation === "string" ? confirmation : sensitiveCommandConfirmation(path, requestInit);
  if (confirmationMessage && !(await requestAdminConfirmation(confirmationMessage))) throw new Error("İşlem kullanıcı tarafından iptal edildi.");

  const cacheable = method === "GET" && !requestInit.body;
  const effectiveHardRefresh = hardRefresh;
  const cached = cacheable ? readCache(path) : null;

  if (cacheable && cached && !effectiveHardRefresh) {
    if (force || !cached.fresh) startBackgroundRefresh<T>(path, requestInit, timeoutMs, ttlMs, staleMs);
    return {
      ...cached.entry.value,
      __fromCache: true,
      __stale: !cached.fresh,
      __revalidating: Boolean(force || !cached.fresh),
    } as T;
  }

  if (cacheable && !effectiveHardRefresh && inFlight.has(path)) return inFlight.get(path) as Promise<T>;

  // Cold browser/device: use the server-maintained read model before touching a
  // slow provider API. The live endpoint is then revalidated in the background.
  if (cacheable && !effectiveHardRefresh && panelSnapshotEligible(path)) {
    const snapshot = await fetchServerSnapshot<T>(path);
    if (snapshot) {
      seedAdminApiCache(path, snapshot.value, { ttlMs: snapshot.status === "healthy" ? ttlMs : 0, staleMs });
      startBackgroundRefresh<T>(path, requestInit, timeoutMs, ttlMs, staleMs);
      return {
        ...(snapshot.value as any),
        __fromCache: true,
        __fromServerSnapshot: true,
        __stale: snapshot.status !== "healthy",
        __revalidating: true,
        __snapshotRefreshedAt: snapshot.refreshedAt || null,
      } as T;
    }
  }

  const effectiveInit = (force || effectiveHardRefresh) && cacheable ? withCacheBypass(requestInit) : requestInit;
  const generation = cacheGeneration;
  const promise = fetchRequest<T>(path, effectiveInit, timeoutMs)
    .then((value) => {
      if (cacheable) {
        writeCache(path, value, ttlMs, staleMs, generation);
        void registerPanelRoute(path);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("ruth-admin-api-cache-updated", { detail: { path, value, fresh: ttlMs > 0 } }));
        }
      } else if (invalidate !== false) {
        invalidateCaches(Array.isArray(invalidate) ? invalidate : mutationInvalidation(path));
        void kickPanelSync();
      }
      return value;
    })
    .finally(() => {
      if (cacheable && inFlight.get(path) === promise) inFlight.delete(path);
    });

  if (cacheable) inFlight.set(path, promise);
  return promise;
}

export function adminWarmJson(paths: string[], ttlMs?: number) {
  if (typeof window === "undefined") return;
  void Promise.allSettled([...new Set(paths)].map((path) => adminRequest(path, ttlMs == null ? {} : { ttlMs })));
}
