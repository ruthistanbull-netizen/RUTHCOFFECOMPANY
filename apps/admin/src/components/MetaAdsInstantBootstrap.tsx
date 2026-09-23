"use client";

import { useEffect } from "react";
import { adminRequest } from "@/lib/adminApi";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const SESSION_CACHE_PREFIX = "ruth_admin_api_cache_v6:";
const PERSISTENT_CACHE_PREFIX = "ruth_meta_instant_cache_v1:";
const MAX_SNAPSHOT_AGE_MS = 24 * 60 * 60_000;
const MAX_BALANCE_AGE_MS = 2 * 60 * 60_000;
const RESTORED_FRESH_MS = 4_000;

const PRIORITY_META_PATHS = [
  "/api/meta-ads?range=30d",
  "/api/meta-ads/creatives",
  "/api/meta-ads?range=today",
  "/api/meta-ads/account-balance",
] as const;

type CacheEntry = {
  value: unknown;
  freshUntil: number;
  staleUntil: number;
  storedAt: number;
};

let restoredOnce = false;

function metaPath(path: string) {
  try {
    const url = new URL(path, "https://admin.local");
    if (url.pathname === "/api/meta-ads/creatives" || url.pathname === "/api/meta-ads/account-balance") return true;
    if (url.pathname !== "/api/meta-ads") return false;
    const range = url.searchParams.get("range") || "30d";
    return ["today", "7d", "30d", "90d", "all"].includes(range);
  } catch {
    return false;
  }
}

function istanbulDay(timestamp: number) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(timestamp));
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return year && month && day ? `${year}-${month}-${day}` : "";
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

function maxAgeFor(path: string) {
  return path.startsWith("/api/meta-ads/account-balance") ? MAX_BALANCE_AGE_MS : MAX_SNAPSHOT_AGE_MS;
}

function snapshotUsable(path: string, entry: CacheEntry, now: number) {
  if (!entry || !entry.value || !Number.isFinite(entry.storedAt)) return false;
  if (now - entry.storedAt > maxAgeFor(path)) return false;
  if (path.includes("range=today") && istanbulDay(entry.storedAt) !== istanbulDay(now)) return false;
  return true;
}

function restorePersistentMetaSnapshots() {
  if (typeof window === "undefined" || restoredOnce) return;
  restoredOnce = true;
  const now = Date.now();

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(PERSISTENT_CACHE_PREFIX)) continue;
      const path = key.slice(PERSISTENT_CACHE_PREFIX.length);
      if (!metaPath(path)) continue;

      const raw = window.localStorage.getItem(key);
      const entry = raw ? JSON.parse(raw) as CacheEntry : null;
      if (!entry || !snapshotUsable(path, entry, now)) {
        window.localStorage.removeItem(key);
        continue;
      }

      const sessionKey = `${SESSION_CACHE_PREFIX}${path}`;
      let existing: CacheEntry | null = null;
      try {
        const current = window.sessionStorage.getItem(sessionKey);
        existing = current ? JSON.parse(current) as CacheEntry : null;
      } catch {
        existing = null;
      }
      if (existing?.storedAt && existing.storedAt >= entry.storedAt) continue;

      const restored: CacheEntry = {
        ...entry,
        freshUntil: now + RESTORED_FRESH_MS,
        staleUntil: now + maxAgeFor(path),
      };
      window.sessionStorage.setItem(sessionKey, JSON.stringify(restored));
    }
  } catch {
    // Storage is an acceleration layer only; never block the panel if unavailable.
  }
}

function persistSessionSnapshot(path: string) {
  if (typeof window === "undefined" || !metaPath(path)) return;
  try {
    const raw = window.sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${path}`);
    if (!raw) return;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry?.value || !entry.storedAt) return;
    window.localStorage.setItem(`${PERSISTENT_CACHE_PREFIX}${path}`, raw);
  } catch {
    // Ignore quota/private-mode failures; network loading remains available.
  }
}

function persistExistingPrioritySnapshots() {
  PRIORITY_META_PATHS.forEach(persistSessionSnapshot);
}

function clearPersistentSnapshots() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(PERSISTENT_CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // noop
  }
}

// Do this during client render, before page effects request Meta data.
restorePersistentMetaSnapshots();

export function MetaAdsInstantBootstrap() {
  useEffect(() => {
    if (window.location.pathname === "/login") return;

    persistExistingPrioritySnapshots();

    const onCacheUpdated = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path;
      if (path) persistSessionSnapshot(path);
    };
    window.addEventListener("ruth-admin-api-cache-updated", onCacheUpdated as EventListener);

    // Highest-priority warmup: prime both Meta pages immediately after admin boot.
    // These requests dedupe with page requests inside adminRequest, so opening a
    // Meta page while warmup is running does not create another blocking fetch.
    void Promise.allSettled([
      adminRequest(PRIORITY_META_PATHS[0]),
      adminRequest(PRIORITY_META_PATHS[1]),
    ]);
    window.setTimeout(() => {
      void Promise.allSettled([
        adminRequest(PRIORITY_META_PATHS[2]),
        adminRequest(PRIORITY_META_PATHS[3]),
      ]);
    }, 120);

    const supabase = getSupabaseBrowser();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") clearPersistentSnapshots();
    });

    return () => {
      window.removeEventListener("ruth-admin-api-cache-updated", onCacheUpdated as EventListener);
      data.subscription.unsubscribe();
    };
  }, []);

  return null;
}
