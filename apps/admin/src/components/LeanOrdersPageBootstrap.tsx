"use client";

import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminRequest, seedAdminApiCache } from "@/lib/adminApi";
import { ExactOrdersPopupHost } from "@/components/base44-exact/ExactOrdersPopupHost";
import { OrdersMobileDetailRouteBridge } from "@/components/orders/OrdersMobileDetailRouteBridge";

type LeanOrdersResponse = { ok?: boolean; orders?: any[] };
type State = "loading" | "ready" | "error";

const LIST_PATH = "/api/orders/list?range=all&payment=all&q=";
const LEGACY_CACHE_PATH = "/api/orders?range=all&payment=all&q=";

export function LeanOrdersPageBootstrap() {
  const startedRef = useRef(false);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const result = await adminRequest<LeanOrdersResponse>(LIST_PATH, {
        hardRefresh: true,
        force: true,
        ttlMs: 0,
        staleMs: 0,
        timeoutMs: 5_000,
      });
      seedAdminApiCache(LEGACY_CACHE_PATH, {
        ok: true,
        orders: result.orders || [],
      }, { ttlMs: 60_000, staleMs: 45 * 60_000 });
      setState("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Siparişler alınamadı.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void load();
  }, [load]);

  if (state === "ready") {
    return (
      <OrdersMobileDetailRouteBridge>
        <ExactOrdersPopupHost />
      </OrdersMobileDetailRouteBridge>
    );
  }

  if (state === "error") {
    return (
      <div className="flex min-h-[260px] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-6 text-center shadow-card">
          <TriangleAlert className="mx-auto h-7 w-7 text-warning-foreground" />
          <p className="mt-3 text-sm font-semibold text-main">Siparişler alınamadı</p>
          <p className="mt-1 text-xs leading-5 text-muted">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-4 text-xs font-semibold text-main">
            <RefreshCw className="h-4 w-4" /> Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[260px] items-center justify-center p-6" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
        <div>
          <p className="text-sm font-semibold text-main">Güncel siparişler yükleniyor...</p>
          <p className="mt-1 text-xs text-muted">Sipariş listesi tek sorguda alınıyor.</p>
        </div>
      </div>
    </div>
  );
}
