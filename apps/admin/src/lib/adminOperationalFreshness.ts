"use client";

import {
  adminAuthHeaders,
  apiUrl,
  clearAdminApiCache,
  seedAdminApiCache,
} from "@/lib/adminApi";
import { AdminFreshnessKernel, explicitPayloadTimestamp } from "@/lib/adminFreshnessKernel";
import {
  adminLastGoodStorageKey,
  meaningfulAdminPayload,
  payloadRevision,
  suspiciousAdminEmptyTransition,
  validAdminPayload,
} from "@/lib/adminFreshnessPolicy";
import { sameAdminPayload } from "@/lib/adminPayloadFingerprint";
import { recordAdminFreshnessMetric } from "@/lib/adminFreshnessTelemetry";
import { normalizePanelRoute, panelSnapshotEligible } from "@/lib/panelSyncRegistry";

export type AdminFreshnessReason =
  | "page-entry"
  | "window-focus"
  | "pwa-resume"
  | "manual-refresh"
  | "mutation-reconcile"
  | "safety-reconcile"
  | "realtime-confirm";

type ReconcileOptions = {
  reason?: AdminFreshnessReason;
  timeoutMs?: number;
  supersede?: boolean;
};

type ReconcileResult<T = any> = {
  path: string;
  value: T;
  accepted: boolean;
  sequence: number;
  confirmedEmpty: boolean;
};

type StoredLastGood = {
  path?: string;
  payload?: Record<string, unknown>;
  storedAt?: number;
};

type CacheUpdatedEvent = {
  path?: string;
  value?: unknown;
  seeded?: boolean;
};

const MAX_ACCEPTED_RESOURCE_PATHS = 220;
const kernel = new AdminFreshnessKernel();
const acceptedPayloads = new Map<string, any>();
const latestAcceptedByPathname = new Map<string, string>();
const reconcileInFlight = new Map<string, Promise<ReconcileResult<any>>>();
let cacheGuardInstalled = false;

function routePathname(path: string) {
  try {
    return new URL(path, "https://admin.local").pathname;
  } catch {
    return path.split("?")[0] || path;
  }
}

function routeTimeout(path: string) {
  return routePathname(path).startsWith("/api/meta-ads") ? 45_000 : 12_000;
}

function apiErrorMessage(payload: any, status: number) {
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
  if (typeof payload?.error?.message === "string" && payload.error.message.trim()) return payload.error.message;
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
  return `Canlı veri isteği başarısız oldu (${status}).`;
}

function readPersistedLastGood(path: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(adminLastGoodStorageKey(path));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredLastGood;
    return validAdminPayload(stored?.payload) ? stored.payload : null;
  } catch {
    return null;
  }
}

function removePersistedLastGood(path: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(adminLastGoodStorageKey(path)); } catch {}
}

function previousPayload(path: string) {
  return acceptedPayloads.get(path) ?? readPersistedLastGood(path);
}

function publishAccepted(path: string, value: any, sequence: number, reason: AdminFreshnessReason, confirmedEmpty: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ruth-admin-freshness-accepted", {
    detail: {
      path,
      value,
      sequence,
      reason,
      confirmedEmpty,
      revision: payloadRevision(value),
      authoritativeAt: explicitPayloadTimestamp(value),
    },
  }));
}

function rebuildLatestAcceptedRoutes() {
  latestAcceptedByPathname.clear();
  for (const path of acceptedPayloads.keys()) latestAcceptedByPathname.set(routePathname(path), path);
}

function rememberAcceptedPayload(path: string, value: any) {
  acceptedPayloads.delete(path);
  acceptedPayloads.set(path, value);
  latestAcceptedByPathname.set(routePathname(path), path);

  while (acceptedPayloads.size > MAX_ACCEPTED_RESOURCE_PATHS) {
    const oldest = acceptedPayloads.keys().next().value as string | undefined;
    if (!oldest) break;
    acceptedPayloads.delete(oldest);
  }
  rebuildLatestAcceptedRoutes();
}

function restoreAcceptedPayload(path: string) {
  const current = acceptedPayloads.get(path);
  if (current == null || !meaningfulAdminPayload(current)) return;
  seedAdminApiCache(path, current);
}

function acceptCandidate<T>(path: string, value: T, sequence: number, reason: AdminFreshnessReason, confirmedEmpty = false) {
  const accepted = kernel.accept(path, {
    sequence,
    revision: payloadRevision(value),
    authoritativeAt: explicitPayloadTimestamp(value),
  });

  if (!accepted) {
    restoreAcceptedPayload(path);
    return { accepted: false, value, sequence, confirmedEmpty };
  }

  rememberAcceptedPayload(path, value);
  if (meaningfulAdminPayload(value)) seedAdminApiCache(path, value);
  publishAccepted(path, value, sequence, reason, confirmedEmpty);
  return { accepted: true, value, sequence, confirmedEmpty };
}

async function authoritativeRead<T>(path: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const authHeaders = await adminAuthHeaders();
    const headers = new Headers(authHeaders);
    headers.set("X-Ruth-Admin-Request", "1");
    headers.set("X-Ruth-Cache-Bypass", "1");
    headers.set("X-Ruth-Continuity-Probe", "1");

    const response = await fetch(apiUrl(path), {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) throw new Error(apiErrorMessage(payload, response.status));
    return payload as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Canlı veri isteği ${Math.ceil(timeoutMs / 1000)} saniye içinde yanıt vermedi.`);
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function commitConfirmedEmpty<T>(path: string, value: T, sequence: number, reason: AdminFreshnessReason) {
  removePersistedLastGood(path);
  clearAdminApiCache(path);
  const committed = acceptCandidate(path, value, sequence, reason, true);
  if (committed.accepted) seedAdminApiCache(path, value);
  return committed;
}

async function runReconcile<T>(path: string, options: ReconcileOptions): Promise<ReconcileResult<T>> {
  const reason = options.reason || "page-entry";
  const timeoutMs = options.timeoutMs ?? routeTimeout(path);
  const firstSequence = kernel.begin(path);
  const first = await authoritativeRead<T>(path, timeoutMs);
  const previous = previousPayload(path);

  if (!suspiciousAdminEmptyTransition(previous, first) && meaningfulAdminPayload(first)) {
    return { path, ...acceptCandidate(path, first, firstSequence, reason, false) };
  }

  const secondSequence = kernel.begin(path);
  const second = await authoritativeRead<T>(path, timeoutMs);

  if (!suspiciousAdminEmptyTransition(previous, second) && meaningfulAdminPayload(second)) {
    return { path, ...acceptCandidate(path, second, secondSequence, reason, false) };
  }

  if (kernel.latestSequence(path) !== secondSequence) {
    const current = acceptedPayloads.get(path) ?? second;
    return { path, value: current as T, accepted: false, sequence: secondSequence, confirmedEmpty: false };
  }

  return { path, ...commitConfirmedEmpty(path, second, secondSequence, reason) };
}

export function reconcileAdminResource<T = any>(inputPath: string, options: ReconcileOptions = {}) {
  const path = normalizePanelRoute(inputPath);
  if (!path) return Promise.reject(new Error("Geçersiz admin veri rotası."));

  if (!options.supersede) {
    const existing = reconcileInFlight.get(path);
    if (existing) return existing as Promise<ReconcileResult<T>>;
  }

  const reason = options.reason || "page-entry";
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const elapsed = () => Math.max(0, Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt));

  const promise = runReconcile<T>(path, options)
    .then((result) => {
      recordAdminFreshnessMetric({
        path,
        reason,
        source: "live",
        at: Date.now(),
        durationMs: elapsed(),
        ok: true,
        accepted: result.accepted,
        confirmedEmpty: result.confirmedEmpty,
        sequence: result.sequence,
        revision: payloadRevision(result.value),
        authoritativeAt: explicitPayloadTimestamp(result.value),
        dataAgeMs: null,
      });
      return result;
    })
    .catch((error) => {
      recordAdminFreshnessMetric({
        path,
        reason,
        source: "live",
        at: Date.now(),
        durationMs: elapsed(),
        ok: false,
        accepted: false,
        confirmedEmpty: false,
        sequence: kernel.latestSequence(path) || null,
        revision: kernel.current(path)?.revision ?? null,
        authoritativeAt: kernel.current(path)?.authoritativeAt ?? null,
        dataAgeMs: null,
        error: error instanceof Error ? error.message : String(error || "Canlı veri hatası"),
      });
      throw error;
    })
    .finally(() => {
      if (reconcileInFlight.get(path) === promise) reconcileInFlight.delete(path);
    });
  reconcileInFlight.set(path, promise);
  return promise;
}

export function reconcileAdminResources(paths: string[], options: ReconcileOptions = {}) {
  const unique = [...new Set(paths.map((path) => normalizePanelRoute(path)).filter(Boolean))];
  return Promise.allSettled(unique.map((path) => reconcileAdminResource(path, options)));
}

export function clearAdminOperationalFreshness(match?: string) {
  kernel.clear(match);
  for (const key of [...acceptedPayloads.keys()]) if (!match || key.includes(match)) acceptedPayloads.delete(key);
  for (const key of [...reconcileInFlight.keys()]) if (!match || key.includes(match)) reconcileInFlight.delete(key);
  rebuildLatestAcceptedRoutes();
}

export function installAdminOperationalFreshnessCacheGuard() {
  if (cacheGuardInstalled || typeof window === "undefined") return;
  cacheGuardInstalled = true;

  window.addEventListener("ruth-admin-api-cache-clear", ((event: CustomEvent<{ match?: string | null }>) => {
    const match = event.detail?.match;
    if (match == null) {
      clearAdminOperationalFreshness();
      return;
    }
    const affectsInFlight = [...reconcileInFlight.keys()].some((path) => path.includes(match));
    if (!affectsInFlight) clearAdminOperationalFreshness(match);
  }) as EventListener);

  window.addEventListener("ruth-admin-api-cache-updated", ((event: CustomEvent<CacheUpdatedEvent>) => {
    const detail = event.detail;
    const path = normalizePanelRoute(String(detail?.path || ""));
    if (!path || reconcileInFlight.has(path)) return;

    // Core live-owned routes (products/orders/customers) are deliberately excluded
    // from panel snapshots in panelSyncRegistry. Do not silently re-introduce a
    // second freshness owner when their normal page request updates adminApi cache.
    if (!panelSnapshotEligible(path)) return;

    if (!acceptedPayloads.has(path)) {
      void reconcileAdminResource(path, { reason: "safety-reconcile" });
      return;
    }

    if (detail?.seeded) return;

    const acceptedValue = acceptedPayloads.get(path);
    if (sameAdminPayload(acceptedValue, detail?.value)) return;

    const current = kernel.current(path);
    const nextRevision = payloadRevision(detail?.value);
    const nextAt = explicitPayloadTimestamp(detail?.value);
    const definitelyOlder = Boolean(
      current
      && (
        (current.revision != null && nextRevision != null && nextRevision < current.revision)
        || (current.authoritativeAt != null && nextAt != null && nextAt < current.authoritativeAt)
      )
    );

    if (definitelyOlder) {
      restoreAcceptedPayload(path);
      return;
    }

    void reconcileAdminResource(path, { reason: "safety-reconcile" });
  }) as EventListener);
}

export function currentAcceptedAdminPayload<T = any>(inputPath: string): T | null {
  return acceptedPayloads.get(normalizePanelRoute(inputPath)) ?? null;
}

export function acceptedAdminResourcePaths() {
  return [...latestAcceptedByPathname.values()];
}
