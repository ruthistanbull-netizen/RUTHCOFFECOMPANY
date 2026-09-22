"use client";

import { adminAuthHeaders } from "@/lib/adminApi";

type Metric = {
  route: string;
  durationMs: number;
  ok: boolean;
  status?: number | null;
  kind: string;
  traceId?: string | null;
  at: number;
};

type ClientRecoveryPayload = {
  phase: "detected" | "recovered" | "suppressed";
  kind: "dom_reconciliation";
  route: string;
  fingerprint: string;
  message: string;
  source: string;
  stack?: string | null;
};

type PendingRecovery = Omit<ClientRecoveryPayload, "phase"> & { startedAt: number };

const queue: Metric[] = [];
let flushTimer: number | null = null;
let flushing = false;
let installed = false;
let runtimeRecoveryInFlight = false;

const RECOVERY_PENDING_KEY = "ruth_admin_client_recovery_pending_v1";
const RECOVERY_ATTEMPT_PREFIX = "ruth_admin_client_recovery_attempt_v1:";
const RECOVERY_COOLDOWN_MS = 2 * 60_000;
const RECOVERY_SETTLE_MS = 1_200;

const DOM_RECONCILIATION_PATTERNS = [
  /failed to execute ['\"]removechild['\"] on ['\"]node['\"]/i,
  /the node to be removed is not a child of this node/i,
  /failed to execute ['\"]insertbefore['\"] on ['\"]node['\"]/i,
  /the node before which the new node is to be inserted is not a child of this node/i,
  /notfounderror.*removechild/i,
  /notfounderror.*insertbefore/i,
];

function routeFromName(name: string) {
  try {
    const url = new URL(name, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/") || url.pathname.startsWith("/api/telemetry/")) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

function mutationDetails(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const request = input instanceof Request ? input : null;
    const rawUrl = request ? request.url : input instanceof URL ? input.toString() : String(input);
    const url = new URL(rawUrl, window.location.origin);
    const method = String(init?.method || request?.method || "GET").toUpperCase();
    const headers = new Headers(request?.headers);
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    if (headers.get("X-Ruth-Background-Request") === "1") return null;
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/") || url.pathname.startsWith("/api/telemetry/")) return null;
    if (["GET", "HEAD", "OPTIONS"].includes(method)) return null;
    return { route: url.pathname, method };
  } catch {
    return null;
  }
}

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message || value.name || "Unknown client error";
  if (value && typeof value === "object" && "message" in value) return String((value as { message?: unknown }).message || "Unknown client error");
  return String(value || "Unknown client error");
}

function errorStack(value: unknown) {
  if (value instanceof Error && value.stack) return value.stack.slice(0, 2400);
  if (value && typeof value === "object" && "stack" in value) return String((value as { stack?: unknown }).stack || "").slice(0, 2400);
  return "";
}

function normalizeRecoveryMessage(value: unknown) {
  return errorMessage(value).replace(/\s+/g, " ").trim().slice(0, 700);
}

function simpleHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function storageRead<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function storageWrite(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function storageRemove(key: string) {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(key); } catch {}
}

export function classifyRecoverableClientError(value: unknown): "dom_reconciliation" | null {
  const message = normalizeRecoveryMessage(value);
  return DOM_RECONCILIATION_PATTERNS.some((pattern) => pattern.test(message)) ? "dom_reconciliation" : null;
}

async function reportClientRecovery(payload: ClientRecoveryPayload) {
  try {
    const headers = await adminAuthHeaders();
    await fetch("/api/internal/client-recovery", {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "X-Ruth-Admin-Request": "1",
        "X-Ruth-Background-Request": "1",
      },
      body: JSON.stringify(payload),
      keepalive: true,
      cache: "no-store",
    });
  } catch {
    // Recovery telemetry is best-effort. It must never block the actual repair.
  }
}

function currentRecoveryRoute() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

export function attemptClientRuntimeRecovery(value: unknown, source = "window") {
  if (typeof window === "undefined") return false;
  const kind = classifyRecoverableClientError(value);
  if (!kind) return false;
  if (runtimeRecoveryInFlight) return true;

  const route = currentRecoveryRoute();
  const message = normalizeRecoveryMessage(value);
  const stack = errorStack(value);
  const fingerprint = `${kind}:${simpleHash(`${route}|${message}`)}`;
  const attemptKey = `${RECOVERY_ATTEMPT_PREFIX}${fingerprint}`;
  const previous = storageRead<{ at?: number }>(attemptKey);
  const previousAt = Number(previous?.at || 0);

  const basePayload: Omit<ClientRecoveryPayload, "phase"> = {
    kind,
    route,
    fingerprint,
    message,
    source: String(source || "window").slice(0, 80),
    stack: stack || null,
  };

  if (previousAt > 0 && Date.now() - previousAt < RECOVERY_COOLDOWN_MS) {
    void reportClientRecovery({ ...basePayload, phase: "suppressed" });
    return false;
  }

  runtimeRecoveryInFlight = true;
  const startedAt = Date.now();
  storageWrite(attemptKey, { at: startedAt });
  storageWrite(RECOVERY_PENDING_KEY, { ...basePayload, startedAt } satisfies PendingRecovery);
  void reportClientRecovery({ ...basePayload, phase: "detected" });

  window.setTimeout(() => {
    try {
      window.location.reload();
    } catch {
      runtimeRecoveryInFlight = false;
    }
  }, 180);
  return true;
}

function settlePendingClientRecovery() {
  if (typeof window === "undefined") return;
  const pending = storageRead<PendingRecovery>(RECOVERY_PENDING_KEY);
  if (!pending?.fingerprint || !pending.startedAt) return;
  const age = Date.now() - Number(pending.startedAt || 0);
  if (!Number.isFinite(age) || age < 0 || age > 60_000) {
    storageRemove(RECOVERY_PENDING_KEY);
    return;
  }

  window.setTimeout(() => {
    const active = storageRead<PendingRecovery>(RECOVERY_PENDING_KEY);
    if (!active || active.fingerprint !== pending.fingerprint) return;
    void reportClientRecovery({
      phase: "recovered",
      kind: active.kind,
      route: currentRecoveryRoute(),
      fingerprint: active.fingerprint,
      message: active.message,
      source: `${active.source}:post-reload`,
      stack: active.stack || null,
    });
    storageRemove(RECOVERY_PENDING_KEY);
    runtimeRecoveryInFlight = false;
  }, RECOVERY_SETTLE_MS);
}

async function flush() {
  if (flushing || !queue.length || typeof window === "undefined") return;
  flushing = true;
  const batch = queue.splice(0, 60);
  try {
    const headers = await adminAuthHeaders();
    await fetch("/api/telemetry/client", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", "X-Ruth-Admin-Request": "1" },
      body: JSON.stringify({ metrics: batch }),
      keepalive: true,
      cache: "no-store",
    });
  } catch {
    // Telemetry is strictly best-effort and can never block panel operations.
  } finally {
    flushing = false;
    if (queue.length) scheduleFlush();
  }
}

function scheduleFlush() {
  if (flushTimer != null || typeof window === "undefined") return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 8_000);
}

export function recordClientMetric(metric: Metric) {
  queue.push(metric);
  if (queue.length > 200) queue.splice(0, queue.length - 200);
  if (queue.length >= 40) void flush();
  else scheduleFlush();
}

export function installClientPerformanceTelemetry() {
  if (typeof window === "undefined" || installed) return () => {};
  installed = true;

  const previousFetch = window.fetch;
  const measuredFetch: typeof window.fetch = async (input, init) => {
    const mutation = mutationDetails(input, init);
    if (!mutation) return previousFetch(input, init);
    const started = performance.now();
    try {
      const response = await previousFetch(input, init);
      recordClientMetric({
        route: mutation.route,
        durationMs: Math.max(1, Math.round(performance.now() - started)),
        ok: response.ok,
        status: response.status,
        kind: "mutation",
        at: Date.now(),
      });
      return response;
    } catch (error) {
      recordClientMetric({
        route: mutation.route,
        durationMs: Math.max(1, Math.round(performance.now() - started)),
        ok: false,
        status: null,
        kind: "mutation",
        at: Date.now(),
      });
      throw error;
    }
  };
  window.fetch = measuredFetch;

  const observer = typeof PerformanceObserver === "undefined" ? null : new PerformanceObserver((list) => {
    for (const raw of list.getEntries()) {
      if (raw.entryType !== "resource") continue;
      const resource = raw as PerformanceResourceTiming & { responseStatus?: number };
      const route = routeFromName(resource.name);
      if (!route) continue;
      const responseStatus = Number(resource.responseStatus || 0);
      recordClientMetric({
        route,
        durationMs: Math.max(1, Math.round(resource.duration)),
        ok: responseStatus ? responseStatus < 500 : true,
        status: responseStatus || null,
        kind: "resource",
        at: Date.now(),
      });
    }
  });
  try { observer?.observe({ type: "resource", buffered: true }); } catch {}

  const onHidden = () => {
    if (document.visibilityState === "hidden") void flush();
  };
  const onRuntimeError = (event: ErrorEvent) => {
    const candidate = event.error || event.message;
    if (classifyRecoverableClientError(candidate)) attemptClientRuntimeRecovery(candidate, "window.error");
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (classifyRecoverableClientError(event.reason)) attemptClientRuntimeRecovery(event.reason, "window.unhandledrejection");
  };

  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("error", onRuntimeError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  settlePendingClientRecovery();

  return () => {
    installed = false;
    observer?.disconnect();
    document.removeEventListener("visibilitychange", onHidden);
    window.removeEventListener("error", onRuntimeError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    if (window.fetch === measuredFetch) window.fetch = previousFetch;
    if (flushTimer != null) window.clearTimeout(flushTimer);
    flushTimer = null;
    void flush();
  };
}
