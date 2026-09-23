"use client";

import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { adminRequest, clearAdminApiCache } from "@/lib/adminApi";

type LiveFirstResourceGateProps = {
  resourcePath: string;
  cacheMatch: string;
  label: string;
  children: ReactNode;
  timeoutMs?: number;
};

type GateState = "loading" | "ready" | "error";

export function LiveFirstResourceGate({
  resourcePath,
  cacheMatch,
  label,
  children,
  timeoutMs = 7_000,
}: LiveFirstResourceGateProps) {
  const startedRef = useRef(false);
  const [state, setState] = useState<GateState>("loading");
  const [error, setError] = useState("");

  const loadLive = useCallback(async () => {
    setState("loading");
    setError("");

    // Critical operational lists must never paint a previous session's cache or
    // server snapshot on page entry. Clear the old resource generation first,
    // then perform one direct cache-bypassed API read. The child mounts only
    // after that live read has completed, so its own first request reuses only
    // the just-verified result.
    clearAdminApiCache(cacheMatch);

    try {
      await adminRequest(resourcePath, {
        hardRefresh: true,
        force: true,
        timeoutMs,
      });
      setState("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Güncel veri alınamadı.");
      setState("error");
    }
  }, [cacheMatch, resourcePath, timeoutMs]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void loadLive();
  }, [loadLive]);

  if (state === "ready") return <>{children}</>;

  if (state === "error") {
    return (
      <div className="flex min-h-[260px] items-center justify-center p-6" data-live-first-resource="error">
        <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-6 text-center shadow-card">
          <TriangleAlert className="mx-auto h-7 w-7 text-warning-foreground" />
          <p className="mt-3 text-sm font-semibold text-main">Güncel veri alınamadı</p>
          <p className="mt-1 text-xs leading-5 text-muted">{error}</p>
          <button
            type="button"
            onClick={() => void loadLive()}
            className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-4 text-xs font-semibold text-main"
          >
            <RefreshCw className="h-4 w-4" />
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[260px] items-center justify-center p-6" data-live-first-resource="loading" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
        <div>
          <p className="text-sm font-semibold text-main">{label}</p>
          <p className="mt-1 text-xs text-muted">En güncel veriler doğrudan veritabanından alınıyor.</p>
        </div>
      </div>
    </div>
  );
}
