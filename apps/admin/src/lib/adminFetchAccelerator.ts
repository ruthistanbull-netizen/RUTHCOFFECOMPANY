"use client";

import { normalizePanelRoute, panelSnapshotEligible } from "@/lib/panelSyncRegistry";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

type ResponseSnapshot = {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
  storedAt: number;
  freshUntil: number;
  staleUntil: number;
};

type CacheState = "HIT" | "STALE" | "DEDUPED" | "MUTATION_DEDUPED" | "SERVER_SNAPSHOT" | "SEEDED";

const CACHE_PREFIX = "ruth_admin_fetch_cache_v4:";
const MAX_MEMORY_ENTRIES = 220;
const MAX_PERSISTED_BODY_CHARS = 900_000;
const SERVER_SNAPSHOT_TIMEOUT_MS = 1_000;
const memoryCache = new Map<string, ResponseSnapshot>();
const inFlight = new Map<string, Promise<ResponseSnapshot | null>>();
const serverSnapshotInFlight = new Map<string, Promise<ResponseSnapshot | null>>();
const mutationInFlight = new Map<string, Promise<ResponseSnapshot>>();
let installed = false;
let originalFetch: typeof window.fetch | null = null;
let tokenCache: { token: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

function now() { return Date.now(); }

function ttlFor(pathname: string) {
  if (pathname === "/api/summary") return 45_000;
  if (pathname === "/api/orders") return 35_000;
  if (pathname === "/api/preparing-products") return 30_000;
  if (pathname.startsWith("/api/dashboard/")) return 45_000;
  if (pathname === "/api/payments/list" || pathname === "/api/payments") return 35_000;
  if (pathname === "/api/products" || pathname.startsWith("/api/product-")) return 90_000;
  if (pathname.startsWith("/api/customers")) return 90_000;
  if (pathname.startsWith("/api/ruthie-points")) return 30_000;
  if (pathname.startsWith("/api/shipping") || pathname.startsWith("/api/returns")) return 35_000;
  if (pathname.startsWith("/api/reviews") || pathname.startsWith("/api/discount") || pathname.startsWith("/api/email")) return 60_000;
  if (pathname === "/api/theme" || pathname.startsWith("/api/site-settings")) return 120_000;
  if (pathname.startsWith("/api/meta-ads")) return 30_000;
  return 45_000;
}

function staleFor(pathname: string) {
  if (pathname === "/api/products" || pathname.startsWith("/api/product-") || pathname.startsWith("/api/customers") || pathname.startsWith("/api/meta-ads")) return 2 * 60 * 60_000;
  if (pathname === "/api/theme" || pathname.startsWith("/api/site-settings")) return 6 * 60 * 60_000;
  return 45 * 60_000;
}

function shouldSkip(pathname: string) {
  return pathname === "/api/me"
    || pathname.startsWith("/api/instant-data")
    || pathname.startsWith("/api/internal")
    || pathname.startsWith("/api/telemetry")
    || pathname.startsWith("/api/health")
    || pathname.startsWith("/api/commerce-core/health")
    || pathname.startsWith("/api/push")
    || pathname.startsWith("/api/paytr/status")
    || pathname.startsWith("/api/notifications");
}

function mutationInvalidation(pathname: string) {
  if (pathname.startsWith("/api/products") || pathname.startsWith("/api/product-") || pathname.startsWith("/api/catalog")) return ["/api/products", "/api/product-", "/api/catalog", "/api/dashboard/catalog-counts", "/api/summary"];
  if (pathname.startsWith("/api/orders")) return ["/api/orders", "/api/preparing-products", "/api/summary", "/api/dashboard/", "/api/payments", "/api/returns", "/api/shipping", "/api/customers", "/api/crm"];
  if (pathname.startsWith("/api/payments") || pathname.startsWith("/api/paytr")) return ["/api/payments", "/api/paytr", "/api/orders", "/api/summary", "/api/dashboard/", "/api/returns"];
  if (pathname.startsWith("/api/shipping")) return ["/api/shipping", "/api/orders", "/api/summary", "/api/returns"];
  if (pathname.startsWith("/api/returns")) return ["/api/returns", "/api/orders", "/api/payments", "/api/summary"];
  if (pathname.startsWith("/api/customers") || pathname.startsWith("/api/ruthie-points")) return ["/api/customers", "/api/ruthie-points", "/api/orders", "/api/summary"];
  if (pathname.startsWith("/api/email") || pathname.startsWith("/api/reviews") || pathname.startsWith("/api/contact")) return ["/api/email", "/api/reviews", "/api/contact", "/api/customers"];
  if (pathname.startsWith("/api/discount")) return ["/api/discount", "/api/products", "/api/theme"];
  if (pathname.startsWith("/api/theme") || pathname.startsWith("/api/site-settings")) return ["/api/theme", "/api/site-settings"];
  return null;
}

function normalizeUrl(url: URL) {
  const normalized = new URL(url.toString());
  for (const parameter of ["t", "_", "ts", "timestamp", "cacheBust", "cache_bust"]) {
    const value = normalized.searchParams.get(parameter);
    if (value && /^\d{8,}$/.test(value)) normalized.searchParams.delete(parameter);
  }
  normalized.searchParams.sort();
  return normalized;
}

function cacheKey(url: URL) {
  const normalized = normalizeUrl(url);
  return `${CACHE_PREFIX}${normalized.pathname}${normalized.search}`;
}

function touch(key: string, snapshot: ResponseSnapshot) {
  memoryCache.delete(key);
  memoryCache.set(key, snapshot);
  while (memoryCache.size > MAX_MEMORY_ENTRIES) {
    const oldest = memoryCache.keys().next().value as string | undefined;
    if (!oldest) break;
    memoryCache.delete(oldest);
  }
}

function removeKey(key: string) {
  memoryCache.delete(key);
  try { window.sessionStorage.removeItem(key); } catch {}
}

function readSnapshot(key: string) {
  const timestamp = now();
  const memory = memoryCache.get(key);
  if (memory) {
    if (memory.staleUntil <= timestamp) { removeKey(key); return null; }
    touch(key, memory);
    return { snapshot: memory, fresh: memory.freshUntil > timestamp };
  }
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as ResponseSnapshot;
    if (!snapshot?.body || snapshot.staleUntil <= timestamp) { removeKey(key); return null; }
    touch(key, snapshot);
    return { snapshot, fresh: snapshot.freshUntil > timestamp };
  } catch {
    return null;
  }
}

function scheduleIdle(callback: () => void, timeout = 350) {
  const idle = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number }).requestIdleCallback;
  if (idle) idle(callback, { timeout });
  else window.setTimeout(callback, 0);
}

function persistSnapshot(key: string, snapshot: ResponseSnapshot) {
  if (snapshot.body.length > MAX_PERSISTED_BODY_CHARS) return;
  scheduleIdle(() => {
    try { window.sessionStorage.setItem(key, JSON.stringify(snapshot)); } catch {}
  });
}

function responseFromSnapshot(snapshot: ResponseSnapshot, cacheState: CacheState) {
  const headers = new Headers(snapshot.headers);
  headers.set("X-Ruth-Admin-Cache", cacheState);
  return new Response(snapshot.body, { status: snapshot.status, statusText: snapshot.statusText, headers });
}

function snapshotFromPayload(path: string, payload: unknown, fresh = true): ResponseSnapshot | null {
  if (!payload || typeof payload !== "object" || (payload as any).ok === false) return null;
  const pathname = new URL(path, window.location.origin).pathname;
  const timestamp = now();
  const ttlMs = fresh ? ttlFor(pathname) : 0;
  return {
    status: 200,
    statusText: "OK",
    headers: [["content-type", "application/json; charset=utf-8"]],
    body: JSON.stringify(payload),
    storedAt: timestamp,
    freshUntil: timestamp + ttlMs,
    staleUntil: timestamp + ttlMs + staleFor(pathname),
  };
}

export function seedAcceleratedAdminFetch(path: string, payload: unknown, fresh = true) {
  if (typeof window === "undefined") return;
  const normalized = normalizePanelRoute(path);
  if (!panelSnapshotEligible(normalized)) return;
  const url = new URL(normalized, window.location.origin);
  const snapshot = snapshotFromPayload(normalized, payload, fresh);
  if (!snapshot) return;
  const key = cacheKey(url);
  touch(key, snapshot);
  persistSnapshot(key, snapshot);
}

async function snapshotResponse(response: Response, pathname: string) {
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) return null;
  const clone = response.clone();
  const body = await clone.text();
  const timestamp = now();
  const ttlMs = ttlFor(pathname);
  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers.entries()],
    body,
    storedAt: timestamp,
    freshUntil: timestamp + ttlMs,
    staleUntil: timestamp + ttlMs + staleFor(pathname),
  } satisfies ResponseSnapshot;
}

async function snapshotMutationResponse(response: Response) {
  const clone = response.clone();
  const body = await clone.text();
  const timestamp = now();
  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers.entries()],
    body,
    storedAt: timestamp,
    freshUntil: timestamp,
    staleUntil: timestamp,
  } satisfies ResponseSnapshot;
}

function requestDetails(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : null;
  const rawUrl = input instanceof Request ? input.url : input instanceof URL ? input.toString() : String(input);
  const url = new URL(rawUrl, window.location.origin);
  const method = String(init?.method || request?.method || "GET").toUpperCase();
  const headers = new Headers(request?.headers);
  if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return { url, method, headers };
}

async function adminBearer() {
  const timestamp = now();
  if (tokenCache && tokenCache.expiresAt > timestamp + 15_000) return tokenCache.token;
  if (!tokenRequest) {
    tokenRequest = (async () => {
      const { data, error } = await getSupabaseBrowser().auth.getSession();
      if (error || !data.session?.access_token) return "";
      const token = data.session.access_token;
      tokenCache = { token, expiresAt: Number(data.session.expires_at || 0) * 1000 || timestamp + 5 * 60_000 };
      return token;
    })().finally(() => { tokenRequest = null; });
  }
  return tokenRequest;
}

export function clearAcceleratedAdminFetch(match?: string) {
  for (const key of [...memoryCache.keys()]) if (!match || key.includes(match)) memoryCache.delete(key);
  if (!match) tokenCache = null;
  scheduleIdle(() => {
    try {
      const keys: string[] = [];
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (key?.startsWith(CACHE_PREFIX) && (!match || key.includes(match))) keys.push(key);
      }
      keys.forEach((key) => window.sessionStorage.removeItem(key));
    } catch {}
  }, 500);
}

function invalidateAcceleratedCache(pathname: string) {
  const matches = mutationInvalidation(pathname);
  if (!matches) { clearAcceleratedAdminFetch(); return; }
  [...new Set(matches)].forEach((match) => clearAcceleratedAdminFetch(match));
}

function startNetworkSnapshot(input: RequestInfo | URL, init: RequestInit | undefined, details: ReturnType<typeof requestDetails>, key: string) {
  if (!originalFetch) return Promise.resolve(null);
  const promise = originalFetch(input, init)
    .then((response) => snapshotResponse(response, details.url.pathname))
    .then((snapshot) => {
      if (snapshot) { touch(key, snapshot); persistSnapshot(key, snapshot); }
      return snapshot;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function fetchServerSnapshot(details: ReturnType<typeof requestDetails>, key: string) {
  if (!originalFetch) return null;
  const route = normalizePanelRoute(`${details.url.pathname}${details.url.search}`);
  if (!panelSnapshotEligible(route)) return null;
  const existing = serverSnapshotInFlight.get(route);
  if (existing) return existing;

  const promise = (async () => {
    const token = await adminBearer();
    if (!token) return null;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), SERVER_SNAPSHOT_TIMEOUT_MS);
    try {
      const response = await originalFetch!(`/api/instant-data?path=${encodeURIComponent(route)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, "X-Ruth-Admin-Request": "1" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const body = await response.json().catch(() => ({}));
      if (!body?.found || !body?.entry?.payload || body.entry.payload.ok === false) return null;
      const fresh = String(body.entry.status || "healthy") === "healthy"
        && (!body.entry.expires_at || new Date(body.entry.expires_at).getTime() > Date.now());
      const snapshot = snapshotFromPayload(route, body.entry.payload, fresh);
      if (snapshot) { touch(key, snapshot); persistSnapshot(key, snapshot); }
      return snapshot;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
    }
  })().finally(() => serverSnapshotInFlight.delete(route));
  serverSnapshotInFlight.set(route, promise);
  return promise;
}

async function acceleratedMutation(input: RequestInfo | URL, init: RequestInit | undefined, details: ReturnType<typeof requestDetails>) {
  if (!originalFetch) return window.fetch(input, init);
  const idempotencyKey = details.headers.get("x-idempotency-key");
  const mutationKey = idempotencyKey ? `${details.method}:${details.url.pathname}${details.url.search}:${idempotencyKey}` : "";
  if (mutationKey) {
    const existing = mutationInFlight.get(mutationKey);
    if (existing) return responseFromSnapshot(await existing, "MUTATION_DEDUPED");
  }
  const networkPromise = originalFetch(input, init);
  if (mutationKey) {
    const snapshotPromise = networkPromise.then((response) => snapshotMutationResponse(response)).finally(() => mutationInFlight.delete(mutationKey));
    mutationInFlight.set(mutationKey, snapshotPromise);
  }
  const response = await networkPromise;
  const background = details.headers.get("X-Ruth-Background-Request") === "1";
  if (response.ok && !background) invalidateAcceleratedCache(details.url.pathname);
  return response;
}

export function installAdminFetchAccelerator() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  originalFetch = window.fetch.bind(window);

  window.addEventListener("ruth-admin-api-cache-clear", ((event: CustomEvent<{ match?: string | null }>) => {
    clearAcceleratedAdminFetch(event.detail?.match || undefined);
  }) as EventListener);
  window.addEventListener("ruth-admin-api-cache-updated", ((event: CustomEvent<{ path?: string; value?: unknown; fresh?: boolean }>) => {
    if (event.detail?.path && event.detail.value) seedAcceleratedAdminFetch(event.detail.path, event.detail.value, event.detail.fresh !== false);
  }) as EventListener);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const details = requestDetails(input, init);
    const isSameOriginApi = details.url.origin === window.location.origin && details.url.pathname.startsWith("/api/");
    if (!isSameOriginApi || !originalFetch) return (originalFetch || window.fetch)(input, init);

    // adminRequest owns its GET SWR/read-model state. Mutations still pass through
    // this layer so repeated clicks carrying the same idempotency key collapse.
    if (details.headers.get("X-Ruth-Admin-Request") === "1") {
      if (details.method === "GET") return originalFetch(input, init);
      return acceleratedMutation(input, init, details);
    }
    if (details.method !== "GET") return acceleratedMutation(input, init, details);
    if (shouldSkip(details.url.pathname) || details.headers.get("X-Ruth-Cache-Bypass") === "1") return originalFetch(input, init);

    const key = cacheKey(details.url);
    const cached = readSnapshot(key);
    if (cached?.fresh) return responseFromSnapshot(cached.snapshot, "HIT");
    if (cached && !cached.fresh) {
      if (!inFlight.has(key)) void startNetworkSnapshot(input, init, details, key);
      return responseFromSnapshot(cached.snapshot, "STALE");
    }

    const existing = inFlight.get(key);
    if (existing) {
      const snapshot = await existing;
      if (snapshot) return responseFromSnapshot(snapshot, "DEDUPED");
      return originalFetch(input, init);
    }

    // Central compatibility path: even legacy/raw GET callers receive the durable
    // server read-model first. The live endpoint refreshes silently afterwards.
    const serverSnapshot = await fetchServerSnapshot(details, key);
    if (serverSnapshot) {
      if (!inFlight.has(key)) void startNetworkSnapshot(input, init, details, key);
      return responseFromSnapshot(serverSnapshot, "SERVER_SNAPSHOT");
    }

    const networkResponse = await originalFetch(input, init);
    const snapshotPromise = snapshotResponse(networkResponse, details.url.pathname)
      .then((snapshot) => {
        if (snapshot) { touch(key, snapshot); persistSnapshot(key, snapshot); }
        return snapshot;
      })
      .catch(() => null)
      .finally(() => inFlight.delete(key));
    inFlight.set(key, snapshotPromise);
    void snapshotPromise;
    return networkResponse;
  };
}
