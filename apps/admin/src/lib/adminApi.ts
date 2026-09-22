"use client";

import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

type AdminRequestInit = RequestInit & {
  timeoutMs?: number;
  force?: boolean;
  hardRefresh?: boolean;
  ttlMs?: number;
  staleMs?: number;
  invalidate?: string[] | false;
  confirmation?: string | false;
};

const memory = new Map<string, { value: unknown; expiresAt: number }>();

export function apiUrl(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

export async function adminAuthHeaders() {
  const { data, error } = await getSupabaseBrowser().auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("Panel oturumu bulunamadı.");
  return { Authorization: `Bearer ${token}` };
}

export function seedAdminApiCache(
  path: string,
  value: unknown,
  options: { ttlMs?: number; staleMs?: number } = {},
) {
  const ttl = Math.max(0, Number(options.ttlMs ?? 30_000));
  memory.set(path, { value, expiresAt: Date.now() + ttl });
}

export function clearAdminApiCache(match?: string) {
  for (const key of [...memory.keys()]) {
    if (!match || key.includes(match)) memory.delete(key);
  }
}

export async function adminWarmJson<T = unknown>(path: string) {
  try {
    return await adminRequest<T>(path, { force: true });
  } catch {
    return null;
  }
}

export async function hydrateAdminSnapshotBootstrap() {
  return { hydrated: 0 };
}

export async function adminRequest<T>(path: string, init: AdminRequestInit = {}): Promise<T> {
  const {
    timeoutMs = 30_000,
    force = false,
    hardRefresh = false,
    ttlMs = 0,
    staleMs: _staleMs,
    invalidate: _invalidate,
    confirmation: _confirmation,
    ...requestInit
  } = init;

  const method = String(requestInit.method || "GET").toUpperCase();
  const cacheable = method === "GET" && !force && !hardRefresh;
  const cached = cacheable ? memory.get(path) : null;
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  const authHeaders = await adminAuthHeaders();
  const headers = new Headers(requestInit.headers || {});
  for (const [key, value] of Object.entries(authHeaders)) headers.set(key, value);
  if (requestInit.body && !(requestInit.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const externalSignal = requestInit.signal;
  let externalAbort: (() => void) | null = null;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else {
      externalAbort = () => controller.abort();
      externalSignal.addEventListener("abort", externalAbort, { once: true });
    }
  }
  const timeout = window.setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs));

  try {
    const response = await fetch(apiUrl(path), {
      ...requestInit,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || "Panel isteği tamamlanamadı.");
    }
    if (method === "GET" && ttlMs > 0) {
      memory.set(path, { value: payload, expiresAt: Date.now() + ttlMs });
    }
    return payload as T;
  } finally {
    window.clearTimeout(timeout);
    if (externalSignal && externalAbort) externalSignal.removeEventListener("abort", externalAbort);
  }
}
