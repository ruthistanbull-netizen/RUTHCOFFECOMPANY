"use client";

import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminRequest, seedAdminApiCache } from "@/lib/adminApi";
import { ProductsPageInteractionPatch } from "@/components/base44-exact/ProductsPageInteractionPatch";

type LeanProductsResponse = {
  ok?: boolean;
  products?: any[];
  categories?: any[];
  collections?: any[];
  materials?: string[];
  pricing?: any[];
};

type State = "loading" | "ready" | "error";

export function LeanProductsPageBootstrap() {
  const startedRef = useRef(false);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const result = await adminRequest<LeanProductsResponse>("/api/products/list?q=", {
        hardRefresh: true,
        force: true,
        ttlMs: 0,
        staleMs: 0,
        timeoutMs: 5_000,
      });

      seedAdminApiCache("/api/products?q=", {
        ok: true,
        products: result.products || [],
        categories: result.categories || [],
        collections: result.collections || [],
      }, { ttlMs: 60_000, staleMs: 2 * 60 * 60_000 });
      seedAdminApiCache("/api/product-settings/materials", {
        ok: true,
        options: result.materials || ["925 Ayar Gümüş", "Pirinç", "Çelik"],
      }, { ttlMs: 60_000, staleMs: 2 * 60 * 60_000 });
      seedAdminApiCache("/api/products/discount-pricing", {
        ok: true,
        pricing: result.pricing || [],
      }, { ttlMs: 60_000, staleMs: 2 * 60 * 60_000 });

      setState("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ürünler alınamadı.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void load();
  }, [load]);

  if (state === "ready") return <ProductsPageInteractionPatch />;

  if (state === "error") {
    return (
      <div className="flex min-h-[260px] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-6 text-center shadow-card">
          <TriangleAlert className="mx-auto h-7 w-7 text-warning-foreground" />
          <p className="mt-3 text-sm font-semibold text-main">Ürünler alınamadı</p>
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
          <p className="text-sm font-semibold text-main">Güncel ürünler yükleniyor...</p>
          <p className="mt-1 text-xs text-muted">Sadece ürün ekranının ihtiyacı olan veriler alınıyor.</p>
        </div>
      </div>
    </div>
  );
}
