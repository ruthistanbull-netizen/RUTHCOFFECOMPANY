"use client";

import { useEffect } from "react";

const CACHE_EPOCH_KEY = "ruth_admin_cache_epoch";
const CACHE_EPOCH = "2026-08-18-instant-data-v1";
const SESSION_CACHE_PREFIXES = [
  "ruth_admin_api_cache_",
  "ruth_admin_fetch_cache_",
  "ruth_admin_mutation_key_",
];

export function AdminCacheEpoch() {
  useEffect(() => {
    try {
      // Keep the epoch across browser/app sessions. The old implementation used
      // sessionStorage, so every new tab looked like a new cache version and
      // forced a full page reload before the panel could render.
      if (window.localStorage.getItem(CACHE_EPOCH_KEY) === CACHE_EPOCH) return;

      const remove: string[] = [];
      for (let index = 0; index < window.sessionStorage.length; index += 1) {
        const key = window.sessionStorage.key(index);
        if (key && SESSION_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) remove.push(key);
      }
      remove.forEach((key) => window.sessionStorage.removeItem(key));
      window.localStorage.setItem(CACHE_EPOCH_KEY, CACHE_EPOCH);

      // No reload here. The currently loaded bundle is already the new version;
      // forcing another navigation only makes first paint slower and discards
      // useful persistent snapshots.
    } catch {
      // Storage unavailable: continue with the network version.
    }
  }, []);

  return null;
}
