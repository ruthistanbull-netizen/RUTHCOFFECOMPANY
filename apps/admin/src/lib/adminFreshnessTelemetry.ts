"use client";

export type AdminFreshnessSource = "live" | "snapshot" | "memory" | "persisted" | "unknown";

export type AdminFreshnessMetric = {
  path: string;
  reason: string;
  source: AdminFreshnessSource;
  at: number;
  durationMs: number;
  ok: boolean;
  accepted: boolean | null;
  confirmedEmpty: boolean;
  sequence: number | null;
  revision: number | null;
  authoritativeAt: number | null;
  dataAgeMs: number | null;
  error?: string | null;
};

const STORAGE_KEY = "ruth_admin_freshness_metrics_v1";
const MAX_METRICS = 160;
const MAX_ERROR_CHARS = 180;

function storageAvailable() {
  if (typeof window === "undefined") return false;
  try {
    const storage = window.sessionStorage;
    return Boolean(storage);
  } catch {
    return false;
  }
}

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sanitize(metric: AdminFreshnessMetric): AdminFreshnessMetric {
  const now = Date.now();
  const authoritativeAt = finite(metric.authoritativeAt);
  const suppliedAge = finite(metric.dataAgeMs);
  return {
    ...metric,
    path: String(metric.path || "").slice(0, 260),
    reason: String(metric.reason || "unknown").slice(0, 60),
    at: finite(metric.at) ?? now,
    durationMs: Math.max(0, Math.round(finite(metric.durationMs) ?? 0)),
    sequence: finite(metric.sequence),
    revision: finite(metric.revision),
    authoritativeAt,
    dataAgeMs: authoritativeAt == null
      ? (suppliedAge == null ? null : Math.max(0, Math.round(suppliedAge)))
      : Math.max(0, now - authoritativeAt),
    error: metric.error ? String(metric.error).slice(0, MAX_ERROR_CHARS) : null,
  };
}

function readStored(): AdminFreshnessMetric[] {
  if (!storageAvailable()) return [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.slice(-MAX_METRICS) as AdminFreshnessMetric[] : [];
  } catch {
    return [];
  }
}

export function recordAdminFreshnessMetric(metric: AdminFreshnessMetric) {
  if (typeof window === "undefined") return;
  const value = sanitize(metric);
  if (storageAvailable()) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...readStored(), value].slice(-MAX_METRICS)));
    } catch {}
  }
  window.dispatchEvent(new CustomEvent("ruth-admin-freshness-metric", { detail: value }));
}

export function recentAdminFreshnessMetrics(limit = 40) {
  return readStored().slice(-Math.max(1, Math.min(MAX_METRICS, Math.trunc(limit || 40))));
}

export function clearAdminFreshnessMetrics() {
  if (!storageAvailable()) return;
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch {}
}
