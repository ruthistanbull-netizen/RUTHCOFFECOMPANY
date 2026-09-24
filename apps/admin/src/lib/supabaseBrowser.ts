"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";
import { assertRostaSupabaseUrl, ROSTA_SUPABASE_PUBLISHABLE_KEY, ROSTA_SUPABASE_URL } from "@/lib/platform";

let client: SupabaseClient | null = null;
const SUPABASE_BROWSER_TIMEOUT_MS = 12_000;
const AUTH_SESSION_READ_TIMEOUT_MS = 4_000;
const AUTH_SESSION_MIN_VALIDITY_MS = 20_000;
const ADMIN_AUTH_STORAGE_KEY = "rosta_admin_auth_session_v1";
const ADMIN_REMEMBER_STORAGE_KEY = "rosta_admin_remember_session_v1";
const EVICTABLE_LOCAL_PREFIXES = [
  "rosta_admin_instant_cache_v1:",
  "rosta_admin_last_good_v2:",
];
const EVICTABLE_SESSION_PREFIXES = [
  "rosta_admin_api_cache_",
  "rosta_admin_fetch_cache_",
  "rosta_admin_stable_resource_",
  "rosta_admin_mutation_key_",
];
let legacyStorageNormalized = false;

function safeStorage(kind: "local" | "session") {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function storageKeys(storage: Storage, prefix: string) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}

function evictByPrefixes(storage: Storage, prefixes: string[]) {
  const remove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) remove.push(key);
  }
  remove.forEach((key) => {
    try { storage.removeItem(key); } catch {}
  });
}

function safeSet(storage: Storage | null, key: string, value: string, evictablePrefixes: string[]) {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    evictByPrefixes(storage, evictablePrefixes);
    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }
}

export function adminRememberSessionEnabled() {
  const local = safeStorage("local");
  if (!local) return false;
  try {
    return local.getItem(ADMIN_REMEMBER_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function normalizeLegacyStorage() {
  if (legacyStorageNormalized || typeof window === "undefined") return;
  legacyStorageNormalized = true;
  const local = safeStorage("local");
  if (!local || adminRememberSessionEnabled()) return;

  // The previous implementation persisted every admin login automatically.
  // Once the explicit "Oturumu açık tut" option exists, those old tokens must
  // not silently remain durable without user consent.
  for (const key of storageKeys(local, ADMIN_AUTH_STORAGE_KEY)) {
    try { local.removeItem(key); } catch {}
  }
}

export function setAdminRememberSession(remember: boolean) {
  if (typeof window === "undefined") return false;
  normalizeLegacyStorage();
  const local = safeStorage("local");
  const session = safeStorage("session");

  if (remember) {
    if (!safeSet(local, ADMIN_REMEMBER_STORAGE_KEY, "1", EVICTABLE_LOCAL_PREFIXES)) return false;

    if (local && session) {
      for (const key of storageKeys(session, ADMIN_AUTH_STORAGE_KEY)) {
        const value = session.getItem(key);
        if (!value) continue;
        if (safeSet(local, key, value, EVICTABLE_LOCAL_PREFIXES)) {
          try { session.removeItem(key); } catch {}
        }
      }
    }

    try { void navigator.storage?.persist?.(); } catch {}
    return true;
  }

  if (local) {
    try { local.removeItem(ADMIN_REMEMBER_STORAGE_KEY); } catch {}
    for (const key of storageKeys(local, ADMIN_AUTH_STORAGE_KEY)) {
      const value = local.getItem(key);
      if (value && session) safeSet(session, key, value, EVICTABLE_SESSION_PREFIXES);
      try { local.removeItem(key); } catch {}
    }
  }
  return true;
}

function adaptiveAuthStorage() {
  if (typeof window === "undefined") return undefined;
  normalizeLegacyStorage();

  return {
    getItem(key: string) {
      const local = safeStorage("local");
      const session = safeStorage("session");
      if (adminRememberSessionEnabled()) {
        try { return local?.getItem(key) || session?.getItem(key) || null; } catch { return null; }
      }
      try { return session?.getItem(key) || null; } catch { return null; }
    },
    setItem(key: string, value: string) {
      const local = safeStorage("local");
      const session = safeStorage("session");
      if (adminRememberSessionEnabled()) {
        if (safeSet(local, key, value, EVICTABLE_LOCAL_PREFIXES)) {
          try { session?.removeItem(key); } catch {}
          return;
        }
        // Never let a browser quota problem break authentication. If durable
        // storage still cannot accept the token after cache eviction, fall back
        // to the current app session and disable the durable preference.
        try { local?.removeItem(ADMIN_REMEMBER_STORAGE_KEY); } catch {}
      }
      safeSet(session, key, value, EVICTABLE_SESSION_PREFIXES);
    },
    removeItem(key: string) {
      try { safeStorage("local")?.removeItem(key); } catch {}
      try { safeStorage("session")?.removeItem(key); } catch {}
    },
  };
}

function persistedAdminSession() {
  if (typeof window === "undefined") return null;
  const storage = adaptiveAuthStorage();
  let raw: string | null = null;
  try { raw = storage?.getItem(ADMIN_AUTH_STORAGE_KEY) || null; } catch { return null; }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<Session> | null;
    if (!parsed?.access_token) return null;
    const expiresAt = Number(parsed.expires_at || 0) * 1000;
    if (expiresAt > 0 && expiresAt <= Date.now() + AUTH_SESSION_MIN_VALIDITY_MS) return null;
    return parsed as Session;
  } catch {
    return null;
  }
}

async function boundedAuthCall<T>(value: PromiseLike<T>, timeoutMs: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function clearAdminAuthPersistence() {
  if (typeof window === "undefined") return;
  const local = safeStorage("local");
  const session = safeStorage("session");
  try { local?.removeItem(ADMIN_REMEMBER_STORAGE_KEY); } catch {}
  if (local) storageKeys(local, ADMIN_AUTH_STORAGE_KEY).forEach((key) => {
    try { local.removeItem(key); } catch {}
  });
  if (session) storageKeys(session, ADMIN_AUTH_STORAGE_KEY).forEach((key) => {
    try { session.removeItem(key); } catch {}
  });
}

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const upstreamSignal = init?.signal;
  let timeoutTriggered = false;

  const onUpstreamAbort = () => controller.abort();
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener("abort", onUpstreamAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort();
  }, SUPABASE_BROWSER_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (caught) {
    if (timeoutTriggered) {
      throw new Error("Supabase Auth 12 saniye içinde yanıt vermedi. Bağlantıyı veya Supabase erişimini kontrol et.");
    }
    throw caught;
  } finally {
    clearTimeout(timer);
    upstreamSignal?.removeEventListener("abort", onUpstreamAbort);
  }
};

function installBoundedSessionBridge(supabase: SupabaseClient) {
  const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
  const originalRefreshSession = supabase.auth.refreshSession.bind(supabase.auth);

  const getSession: typeof supabase.auth.getSession = async () => {
    const stored = persistedAdminSession();
    if (stored) return { data: { session: stored }, error: null };
    return boundedAuthCall(
      originalGetSession(),
      AUTH_SESSION_READ_TIMEOUT_MS,
      "Yönetici oturumu 4 saniye içinde okunamadı.",
    );
  };

  const refreshSession: typeof supabase.auth.refreshSession = async (currentSession) => boundedAuthCall(
    originalRefreshSession(currentSession),
    SUPABASE_BROWSER_TIMEOUT_MS,
    "Yönetici oturumu 12 saniye içinde yenilenemedi.",
  );

  Reflect.set(supabase.auth, "getSession", getSession);
  Reflect.set(supabase.auth, "refreshSession", refreshSession);
  return supabase;
}

function installPasswordResetEmailBridge(supabase: SupabaseClient) {
  const resetPasswordForEmail: typeof supabase.auth.resetPasswordForEmail = async (email) => {
    const response = await fetch("/api/auth/password-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, target: "admin" }),
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Şifre yenileme e-postası gönderilemedi.");
    }

    return { data: {}, error: null } as Awaited<ReturnType<typeof supabase.auth.resetPasswordForEmail>>;
  };

  Reflect.set(supabase.auth, "resetPasswordForEmail", resetPasswordForEmail);
  return supabase;
}

export function getSupabaseBrowser() {
  const url = assertRostaSupabaseUrl(normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || ROSTA_SUPABASE_URL));
  const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ROSTA_SUPABASE_PUBLISHABLE_KEY).trim();

  if (!anonKey) {
    throw new Error("ROSTA Supabase publishable key eksik.");
  }

  if (!client) {
    client = installBoundedSessionBridge(installPasswordResetEmailBridge(createClient(url, anonKey, {
      global: {
        fetch: fetchWithTimeout,
      },
      auth: {
        storage: adaptiveAuthStorage(),
        storageKey: ADMIN_AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })));
  }

  return client;
}