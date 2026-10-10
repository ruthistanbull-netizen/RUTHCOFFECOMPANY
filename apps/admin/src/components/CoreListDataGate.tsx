"use client";

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  adminRequest,
  seedAdminApiCache,
} from "@/lib/adminApi";

type CoreListKind = "products" | "orders" | "customers";
type CoreListPayload = Record<string, any>;
type CountPayload = {
  ok?: boolean;
  counts?: Partial<Record<CoreListKind, number>>;
  error?: string;
};

type CoreConfig = {
  sourcePath: string;
  rowKey: string;
};

const CORE_CONFIG: Record<CoreListKind, CoreConfig> = {
  products: {
    sourcePath: "/api/products/list?page=1&pageSize=25&q=",
    rowKey: "products",
  },
  orders: {
    sourcePath: "/api/orders/list?range=all&payment=all&q=",
    rowKey: "orders",
  },
  customers: {
    sourcePath: "/api/customers/list?page=1&pageSize=25&membership=all&sort=recent",
    rowKey: "customers",
  },
};

function rowsOf(config: CoreConfig, payload: CoreListPayload) {
  const value = payload?.[config.rowKey];
  return Array.isArray(value) ? value : [];
}

function seedCoreList(kind: CoreListKind, payload: CoreListPayload) {
  if (kind === "products") {
    seedAdminApiCache("/api/products?q=", {
      ok: true,
      products: payload.products || [],
      categories: payload.categories || [],
      collections: payload.collections || [],
      pagination: payload.pagination || null,
    }, { ttlMs: 60_000, staleMs: 2 * 60 * 60_000 });
    seedAdminApiCache("/api/product-settings/materials", {
      ok: true,
      options: payload.materials || ["925 Ayar Gümüş", "Pirinç", "Çelik"],
    }, { ttlMs: 60_000, staleMs: 2 * 60 * 60_000 });
    seedAdminApiCache("/api/products/discount-pricing", {
      ok: true,
      pricing: payload.pricing || [],
    }, { ttlMs: 60_000, staleMs: 2 * 60 * 60_000 });
    return;
  }

  if (kind === "orders") {
    seedAdminApiCache("/api/orders?range=all&payment=all&q=", {
      ok: true,
      orders: payload.orders || [],
    }, { ttlMs: 45_000, staleMs: 45 * 60_000 });
    return;
  }

  seedAdminApiCache(CORE_CONFIG.customers.sourcePath, payload, {
    ttlMs: 60_000,
    staleMs: 2 * 60 * 60_000,
  });
}

export function CoreListDataGate({
  kind,
  label,
  children,
}: {
  kind: CoreListKind;
  label: string;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const mountedRef = useRef(true);
  const runningRef = useRef<Promise<void> | null>(null);
  const config = CORE_CONFIG[kind];

  const verify = useCallback(async (blocking = false) => {
    if (runningRef.current) return runningRef.current;

    const run = (async () => {
      if (blocking && mountedRef.current) {
        setReady(false);
        setError("");
      }

      try {
        const listPayload = await adminRequest<CoreListPayload>(config.sourcePath, {
          hardRefresh: true,
          force: true,
          headers: { "X-Ruth-Core-Live": "1" },
        });
        if (!Array.isArray(listPayload?.[config.rowKey])) throw new Error(`${label} listesi eksik döndü.`);
        const rows = rowsOf(config, listPayload);
        // Non-empty lists are already verified by their route's PostgREST body
        // and count checks. Never block them on counts for unrelated tables.
        const expected = rows.length > 0 ? rows.length : await adminRequest<CountPayload>(
          `/api/core-list-counts?kind=${kind}`,
          { hardRefresh: true },
        ).then((payload) => {
          const count = payload.counts?.[kind];
          if (!Number.isSafeInteger(count) || Number(count) < 0) throw new Error("Liste sayacı doğrulanamadı.");
          return Number(count);
        });
        // This is the failure mode that used to become “Ürün bulunamadı”: the DB
        // still has rows while the list request transiently returns []. Never seed
        // or render that false empty response.
        if (expected > 0 && rows.length === 0) {
          throw new Error(`DB'de ${expected} ${label} var ama canlı liste endpointi 0 kayıt döndürdü.`);
        }

        seedCoreList(kind, listPayload);
        if (!mountedRef.current) return;
        setError("");
        setReady(true);
        setRevision((current) => current + 1);
        return;
      } catch (caught) {
        if (!mountedRef.current) return;
        setError(caught instanceof Error ? caught.message : `Canlı ${label} verisi alınamadı.`);
        if (blocking) setReady(false);
      }
    })().finally(() => {
      runningRef.current = null;
    });

    runningRef.current = run;
    return run;
  }, [config, kind, label]);

  useEffect(() => {
    mountedRef.current = true;
    void verify(true);

    // Deliberately no focus/visibility/90s background reconcile here. These three
    // pages keep one owner after the initial verified live bootstrap, so an open
    // page cannot fall back into loading/remount loops. Pull-to-refresh is the only
    // explicit in-place recheck.
    const onPullRefresh = () => void verify(false);
    window.addEventListener("ruth:pull-refresh", onPullRefresh as EventListener);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("ruth:pull-refresh", onPullRefresh as EventListener);
    };
  }, [verify]);

  if (!ready) {
    return (
      <section className="flex min-h-[280px] items-center justify-center rounded-[var(--radius-card)] bg-surface-primary p-6 shadow-card" data-core-list-gate={kind}>
        {error ? (
          <div className="max-w-md text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning-foreground">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <h2 className="mt-3 text-base font-semibold text-main">{label.charAt(0).toLocaleUpperCase("tr-TR") + label.slice(1)} doğrulanamadı</h2>
            <p className="mt-1 text-sm text-muted">Yanlış boş liste göstermiyorum. Canlı liste ile DB sayacı uyuşmadı.</p>
            <p className="mt-2 break-words text-[11px] text-subtle">{error}</p>
            <button
              type="button"
              onClick={() => void verify(true)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 text-sm font-semibold text-white shadow-card"
            >
              <RefreshCw className="h-4 w-4" /> Tekrar dene
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
            <p className="text-sm font-semibold text-main">Güncel {label} yükleniyor...</p>
          </div>
        )}
      </section>
    );
  }

  return (
    <div key={revision} style={{ display: "contents" }} data-core-list-verified={kind}>
      {children}
    </div>
  );
}
