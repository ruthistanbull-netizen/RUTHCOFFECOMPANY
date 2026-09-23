"use client";

import { Loader2 } from "lucide-react";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { clearAdminApiCache } from "@/lib/adminApi";

const CORE_CONTEXTS = {
  "/api/products": "ruth-products-resource-context-v1",
  "/api/orders": "ruth-orders-resource-context-v1",
  "/api/customers": "ruth-customers-resource-context-v1",
} as const;

function sanitizeCoreListContext(cacheMatch: string) {
  if (typeof window === "undefined") return false;
  const entry = Object.entries(CORE_CONTEXTS).find(([prefix]) => cacheMatch.startsWith(prefix));
  if (!entry) return false;

  const [, storageKey] = entry;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (cacheMatch.startsWith("/api/products")) {
      window.sessionStorage.setItem(storageKey, JSON.stringify({
        ...parsed,
        search: "",
        collection: null,
        material: null,
        status: null,
        page: 1,
        scrollY: 0,
      }));
      return true;
    }

    if (cacheMatch.startsWith("/api/orders")) {
      window.sessionStorage.setItem(storageKey, JSON.stringify({
        ...parsed,
        query: "",
        statusFilter: "all",
        paymentFilter: "all",
        page: 1,
        scrollY: 0,
      }));
      return true;
    }

    window.sessionStorage.setItem(storageKey, JSON.stringify({
      ...parsed,
      query: "",
      membership: "all",
      sort: "recent",
      page: 1,
      scrollY: 0,
    }));
    return true;
  } catch {
    try { window.sessionStorage.removeItem(storageKey); } catch {}
    return true;
  }
}

export function CoreLivePageGate({ cacheMatch, label, children }: { cacheMatch: string; label: string; children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const coreList = sanitizeCoreListContext(cacheMatch);
    // Core lists now have their own verified-live bootstrap. Preserve an existing
    // non-empty cache as a continuity fallback instead of deleting it before the
    // authoritative check. Non-core pages retain the previous hard cache reset.
    if (!coreList) clearAdminApiCache(cacheMatch);
    setReady(true);
  }, [cacheMatch]);

  if (!ready) {
    return (
      <div className="flex min-h-[clamp(300px,56dvh,620px)] items-center justify-center p-6" aria-live="polite">
        <div className="flex flex-col items-center gap-3.5 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent lg:h-[34px] lg:w-[34px]" />
          <p className="text-[15px] font-semibold leading-snug text-main lg:text-base">Güncel {label} yükleniyor...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
