"use client";

import { useEffect } from "react";

const MUTATION_PREFIX = "ruth_admin_mutation_key_v1:";
const EVICTABLE_PREFIXES = [
  MUTATION_PREFIX,
  "ruth_admin_api_cache_v6:",
  "ruth_admin_fetch_cache_",
  "ruth_admin_stable_resource_",
  "ruth_admin_api_cache_",
];

function isQuotaError(error: unknown) {
  if (!(error instanceof DOMException)) return false;
  return error.name === "QuotaExceededError"
    || error.name === "NS_ERROR_DOM_QUOTA_REACHED"
    || error.code === 22
    || error.code === 1014;
}

function keys(storage: Storage) {
  const result: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) result.push(key);
  }
  return result;
}

function removeOldMutationKeys(storage: Storage, keepKey?: string) {
  for (const key of keys(storage)) {
    if (!key.startsWith(MUTATION_PREFIX) || key === keepKey) continue;
    try { storage.removeItem(key); } catch {}
  }
}

function freeCacheSpace(storage: Storage, keepKey?: string) {
  removeOldMutationKeys(storage, keepKey);

  const candidates = keys(storage)
    .filter((key) => key !== keepKey && EVICTABLE_PREFIXES.some((prefix) => key.startsWith(prefix)))
    .map((key) => {
      let size = 0;
      try { size = storage.getItem(key)?.length || 0; } catch {}
      return { key, size };
    })
    .sort((left, right) => right.size - left.size);

  for (const candidate of candidates.slice(0, 24)) {
    try { storage.removeItem(candidate.key); } catch {}
  }
}

export function AdminStorageQuotaGuard() {
  useEffect(() => {
    if (typeof window === "undefined" || typeof Storage === "undefined") return;

    try { removeOldMutationKeys(window.sessionStorage); } catch {}

    const prototype = Storage.prototype;
    const originalSetItem = prototype.setItem;

    function safeSetItem(this: Storage, key: string, value: string) {
      try {
        originalSetItem.call(this, key, value);
        return;
      } catch (error) {
        if (!isQuotaError(error)) throw error;
      }

      freeCacheSpace(this, key);
      try {
        originalSetItem.call(this, key, value);
      } catch (error) {
        if (key.startsWith(MUTATION_PREFIX) && isQuotaError(error)) return;
        throw error;
      }
    }

    prototype.setItem = safeSetItem;
    return () => {
      if (prototype.setItem === safeSetItem) prototype.setItem = originalSetItem;
    };
  }, []);

  return null;
}
