"use client";

import {
  adminLastGoodStorageKey,
  meaningfulAdminPayload,
  shouldServeAdminContinuityFallback,
  suspiciousAdminEmptyTransition,
  validAdminPayload,
} from "@/lib/adminFreshnessPolicy";
import { recordAdminFreshnessMetric } from "@/lib/adminFreshnessTelemetry";
import { normalizePanelRoute } from "@/lib/panelSyncRegistry";

type RestoreCallback = (path: string, payload: Record<string, unknown>) => void;
type DropEmptyCallback = (path: string) => void;

type StoredPayload = {
  path: string;
  payload: Record<string, unknown>;
  storedAt: number;
};

const DAY = 24 * 60 * 60_000;
const MAX_BODY_CHARS = 950_000;
const PROBE_COOLDOWN_MS = 4_000;
const MAX_AGE_MS = 7 * DAY;

// These routes are infrastructure/auth/provider endpoints rather than durable
// continuity-owned views. Core Products/Orders/Customers are also deliberately
// excluded: matching the stable early-August panel, their page component owns the
// live request directly and no persisted last-good response may replace it.
const EXCLUDED_PREFIXES = [
  "/api/me",
  "/api/account",
  "/api/auth",
  "/api/instant-data",
  "/api/internal",
  "/api/telemetry",
  "/api/health",
  "/api/commerce-core/health",
  "/api/push",
  "/api/notifications",
  "/api/paytr/status",
  "/api/ruthie/realtime",
  "/api/meta-ads",
  "/api/products",
  "/api/orders",
  "/api/customers",
];

let installed = false;
let upstreamFetch: typeof window.fetch | null = null;
let restoreCallback: RestoreCallback | null = null;
let dropEmptyCallback: DropEmptyCallback | null = null;
const lastProbeAt = new Map<string, number>();

function guardedPath(pathname: string) {
  if (!pathname.startsWith("/api/")) return false;
  return !EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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

function storageKey(path: string) {
  return adminLastGoodStorageKey(normalizePanelRoute(path));
}

function storeGood(path: string, payload: Record<string, unknown>) {
  if (!meaningfulAdminPayload(payload)) return;
  try {
    const normalized = normalizePanelRoute(path);
    const value: StoredPayload = { path: normalized, payload, storedAt: Date.now() };
    const serialized = JSON.stringify(value);
    if (serialized.length <= MAX_BODY_CHARS) window.localStorage.setItem(storageKey(normalized), serialized);
  } catch {}
}

function readGood(path: string) {
  try {
    const normalized = normalizePanelRoute(path);
    const raw = window.localStorage.getItem(storageKey(normalized));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredPayload;
    if (!stored?.payload || !Number.isFinite(stored.storedAt) || Date.now() - stored.storedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(storageKey(normalized));
      return null;
    }
    if (!meaningfulAdminPayload(stored.payload)) {
      window.localStorage.removeItem(storageKey(normalized));
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

function restoreStoredPayloads() {
  if (typeof window === "undefined" || !restoreCallback) return;
  try {
    const keys: string[] = [];
    const prefix = adminLastGoodStorageKey("").replace(/%2F?$/i, "");
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }

    const now = Date.now();
    for (const key of keys) {
      try {
        const raw = window.localStorage.getItem(key);
        const stored = raw ? JSON.parse(raw) as StoredPayload : null;
        const path = stored?.path ? normalizePanelRoute(stored.path) : "";
        const pathname = path ? new URL(path, "https://admin.local").pathname : "";
        const valid = Boolean(
          path
          && pathname
          && guardedPath(pathname)
          && stored?.payload
          && meaningfulAdminPayload(stored.payload)
          && Number.isFinite(stored.storedAt)
          && now - stored.storedAt <= MAX_AGE_MS,
        );
        if (!valid) {
          window.localStorage.removeItem(key);
          continue;
        }
        restoreCallback(path, stored!.payload);
      } catch {
        window.localStorage.removeItem(key);
      }
    }
  } catch {}
}

export function clearAdminDataContinuity() {
  if (typeof window === "undefined") return;
  lastProbeAt.clear();
  try {
    const keys: string[] = [];
    const prefix = adminLastGoodStorageKey("").replace(/%2F?$/i, "");
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => {
      try { window.localStorage.removeItem(key); } catch {}
    });
  } catch {}
}

function continuityResponse(
  response: Response | null,
  stored: StoredPayload,
  state: string,
) {
  const headers = new Headers(response?.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("X-Ruth-Data-Continuity", state);
  if (response && !response.ok) headers.set("X-Ruth-Origin-Status", String(response.status));

  recordAdminFreshnessMetric({
    path: stored.path,
    reason: state,
    source: "persisted",
    at: Date.now(),
    durationMs: 0,
    ok: false,
    accepted: null,
    confirmedEmpty: false,
    sequence: null,
    revision: null,
    authoritativeAt: null,
    dataAgeMs: Math.max(0, Date.now() - stored.storedAt),
    error: response && !response.ok ? `origin-status-${response.status}` : state,
  });

  return new Response(JSON.stringify({
    ...stored.payload,
    __continuityGuard: true,
    __continuityState: state,
    __continuityStoredAt: stored.storedAt,
  }), {
    status: 200,
    statusText: "OK",
    headers,
  });
}

async function parseJson(response: Response) {
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) return null;
  try {
    const value = await response.clone().json();
    return validAdminPayload(value) ? value : null;
  } catch {
    return null;
  }
}

async function bypassedLiveFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  details: ReturnType<typeof requestDetails>,
) {
  if (!upstreamFetch) return null;
  const route = normalizePanelRoute(`${details.url.pathname}${details.url.search}`);
  const now = Date.now();
  const previousProbe = lastProbeAt.get(route) || 0;
  if (now - previousProbe < PROBE_COOLDOWN_MS) return null;
  lastProbeAt.set(route, now);

  const headers = new Headers(details.headers);
  headers.set("X-Ruth-Cache-Bypass", "1");
  headers.set("X-Ruth-Continuity-Probe", "1");
  const response = await upstreamFetch(input, {
    ...init,
    method: details.method,
    headers,
    cache: "no-store",
  }).catch(() => null);
  if (!response) return null;

  const payload = await parseJson(response);
  if (payload && meaningfulAdminPayload(payload)) {
    storeGood(route, payload);
    restoreCallback?.(route, payload);
  }
  return { response, payload };
}

export function installAdminDataContinuityGuard(options: {
  restore: RestoreCallback;
  dropEmptySnapshot: DropEmptyCallback;
}) {
  restoreCallback = options.restore;
  dropEmptyCallback = options.dropEmptySnapshot;
  if (installed || typeof window === "undefined") return;
  installed = true;

  // Rehydrate last-known-good API payloads only for continuity-owned resources.
  // Core Products/Orders/Customers are excluded and stale persisted copies are
  // removed here instead of being restored into adminApi.
  restoreStoredPayloads();

  upstreamFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const details = requestDetails(input, init);
    const sameOrigin = details.url.origin === window.location.origin;
    if (!sameOrigin || !upstreamFetch || !guardedPath(details.url.pathname)) return upstreamFetch!(input, init);

    const route = normalizePanelRoute(`${details.url.pathname}${details.url.search}`);
    const continuityProbe = details.headers.get("X-Ruth-Continuity-Probe") === "1";
    const cacheBypass = details.headers.get("X-Ruth-Cache-Bypass") === "1";
    const previous = details.method === "GET" && !continuityProbe ? readGood(route) : null;

    let response: Response;
    try {
      response = await upstreamFetch(input, init);
    } catch (error) {
      if (shouldServeAdminContinuityFallback({
        method: details.method,
        hasLastGood: Boolean(previous),
        continuityProbe,
        cacheBypass,
        networkError: true,
      }) && previous) {
        return continuityResponse(null, previous, "transport-network-fallback");
      }
      throw error;
    }

    if (details.method !== "GET" || continuityProbe) return response;

    if (shouldServeAdminContinuityFallback({
      method: details.method,
      status: response.status,
      hasLastGood: Boolean(previous),
      continuityProbe,
      cacheBypass,
    }) && previous) {
      return continuityResponse(response, previous, `transport-http-${response.status}-fallback`);
    }

    const payload = await parseJson(response);
    if (!payload) return response;

    if (meaningfulAdminPayload(payload) && (!previous || !suspiciousAdminEmptyTransition(previous.payload, payload))) {
      storeGood(route, payload);
      return response;
    }

    if (previous && suspiciousAdminEmptyTransition(previous.payload, payload)) {
      void bypassedLiveFetch(input, init, details);
      return continuityResponse(response, previous, "last-good-empty-regression");
    }

    const cacheState = String(response.headers.get("X-Ruth-Admin-Cache") || "").toUpperCase();
    if (["SERVER_SNAPSHOT", "HIT", "STALE", "SEEDED"].includes(cacheState)) {
      const live = await bypassedLiveFetch(input, init, details);
      if (live?.response && live.payload && meaningfulAdminPayload(live.payload)) return live.response;
    }

    return response;
  }) as typeof window.fetch;

  window.addEventListener("ruth-admin-api-cache-updated", ((event: CustomEvent<{
    path?: string;
    value?: Record<string, unknown>;
    seeded?: boolean;
  }>) => {
    const path = normalizePanelRoute(String(event.detail?.path || ""));
    const pathname = new URL(path || "/", "https://admin.local").pathname;
    const value = event.detail?.value;
    if (!path || !value || !guardedPath(pathname)) return;

    const previous = readGood(path);
    if (meaningfulAdminPayload(value) && (!previous || !suspiciousAdminEmptyTransition(previous.payload, value))) {
      storeGood(path, value);
      return;
    }

    if (previous && suspiciousAdminEmptyTransition(previous.payload, value)) {
      restoreCallback?.(path, previous.payload);
      return;
    }

    if (event.detail?.seeded && !meaningfulAdminPayload(value)) dropEmptyCallback?.(path);
  }) as EventListener);
}
