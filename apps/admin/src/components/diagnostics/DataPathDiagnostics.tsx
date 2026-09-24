"use client";

import { Copy, RefreshCw, SearchCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAuthHeaders, apiUrl } from "@/lib/adminApi";
import { currentAcceptedAdminPayload } from "@/lib/adminOperationalFreshness";

type DiagnosticPayload = {
  ok: boolean;
  state: "healthy" | "mismatch" | "degraded";
  checkedAt: string;
  fingerprint: string;
  runtime: {
    supabaseOrigin: string;
    supabaseHost: string;
    envSource: string;
    authSource: string;
    authContinuity: boolean;
    authMs: number;
    totalMs: number;
  };
  comparison: {
    productCountMismatch: boolean;
    orderCountMismatch: boolean;
    customerReadModelMismatch: boolean;
    failedChecks: string[];
  };
  counts: {
    productsTotal: number | null;
    productsActive: number | null;
    productsPanelVisible: number | null;
    productsRawPostgrest: number | null;
    storefrontActive: number | null;
    ordersTotal: number | null;
    ordersRawPostgrest: number | null;
    profilesTotal: number | null;
    customerReadModelTotal: number | null;
    customerSummaryCount: number | null;
  };
  checks: Record<string, { ok: boolean; value: unknown; durationMs: number; error: string | null }>;
};

type ProbeDefinition = {
  key: string;
  label: string;
  path: string;
  field: "products" | "orders" | "customers";
};

type EndpointProbe = ProbeDefinition & {
  ok: boolean;
  status: number | null;
  count: number | null;
  durationMs: number;
  error: string | null;
  browserCacheCount: number | null;
  freshnessCount: number | null;
};

const CACHE_PREFIX = "ruth_admin_api_cache_v6:";
const PROBES: ProbeDefinition[] = [
  { key: "productsLean", label: "Ürünler · lean", path: "/api/products/list?q=", field: "products" },
  { key: "productsLegacy", label: "Ürünler · sayfa", path: "/api/products?q=", field: "products" },
  { key: "ordersLean", label: "Siparişler · lean", path: "/api/orders/list?range=all&payment=all&q=", field: "orders" },
  { key: "ordersLegacy", label: "Siparişler · sayfa", path: "/api/orders?range=all&payment=all&q=", field: "orders" },
  { key: "customers", label: "Müşteriler · sayfa", path: "/api/customers/list?page=1&pageSize=25&membership=all&sort=recent", field: "customers" },
];

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function statusText(state?: DiagnosticPayload["state"]) {
  if (state === "healthy") return "Sağlıklı";
  if (state === "mismatch") return "Tutarsızlık yakalandı";
  if (state === "degraded") return "Bağlantı / sorgu hatası";
  return "Kontrol edilmedi";
}

function statusClass(state?: DiagnosticPayload["state"]) {
  if (state === "healthy") return "bg-success-soft text-success-foreground";
  if (state === "mismatch") return "bg-warning-soft text-warning-foreground";
  if (state === "degraded") return "bg-danger-soft text-danger-foreground";
  return "bg-surface-secondary text-muted";
}

function CountCard({ label, value, compare }: { label: string; value: number | null; compare?: number | null }) {
  const mismatch = compare != null && value != null && compare !== value;
  return (
    <div className={`rounded-[var(--radius-card)] border p-4 ${mismatch ? "border-warning/40 bg-warning-soft" : "border-border-subtle bg-surface-primary"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-main">{value == null ? "—" : value.toLocaleString("tr-TR")}</p>
      {compare != null ? <p className={`mt-1 text-[10px] ${mismatch ? "font-semibold text-warning-foreground" : "text-muted"}`}>Ham PostgREST: {compare.toLocaleString("tr-TR")}</p> : null}
    </div>
  );
}

function arrayCount(value: unknown, field: ProbeDefinition["field"]) {
  const payload = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Array.isArray(payload[field]) ? payload[field].length : null;
}

function browserCacheCount(path: string, field: ProbeDefinition["field"]) {
  try {
    const raw = window.sessionStorage.getItem(`${CACHE_PREFIX}${path}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { value?: unknown };
    return arrayCount(entry.value, field);
  } catch {
    return null;
  }
}

function freshnessCount(path: string, field: ProbeDefinition["field"]) {
  try {
    return arrayCount(currentAcceptedAdminPayload(path), field);
  } catch {
    return null;
  }
}

export function DataPathDiagnostics() {
  const [latest, setLatest] = useState<DiagnosticPayload | null>(null);
  const [history, setHistory] = useState<DiagnosticPayload[]>([]);
  const [endpointProbes, setEndpointProbes] = useState<EndpointProbe[]>([]);
  const [loading, setLoading] = useState(false);
  const [bursting, setBursting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const authHeaders = useCallback(async () => {
    const auth = await adminAuthHeaders();
    const headers = new Headers(auth);
    headers.set("X-Ruth-Admin-Request", "1");
    headers.set("X-Ruth-Cache-Bypass", "1");
    headers.set("X-Ruth-Continuity-Probe", "1");
    return headers;
  }, []);

  const requestDiagnostic = useCallback(async () => {
    const headers = await authHeaders();
    const response = await fetch(apiUrl(`/api/diagnostics/data-path?t=${Date.now()}`), {
      method: "GET",
      headers,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || payload?.message || `Teşhis isteği başarısız (${response.status}).`);
    return payload as DiagnosticPayload;
  }, [authHeaders]);

  const requestPageEndpoints = useCallback(async () => {
    const headers = await authHeaders();
    return Promise.all(PROBES.map(async (probe): Promise<EndpointProbe> => {
      const started = performance.now();
      try {
        const separator = probe.path.includes("?") ? "&" : "?";
        const response = await fetch(apiUrl(`${probe.path}${separator}__diag=${Date.now()}`), {
          method: "GET",
          headers,
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        const durationMs = Math.max(0, Math.round(performance.now() - started));
        if (!response.ok || payload?.ok === false) {
          return {
            ...probe,
            ok: false,
            status: response.status,
            count: null,
            durationMs,
            error: payload?.error || payload?.message || `HTTP ${response.status}`,
            browserCacheCount: browserCacheCount(probe.path, probe.field),
            freshnessCount: freshnessCount(probe.path, probe.field),
          };
        }
        return {
          ...probe,
          ok: true,
          status: response.status,
          count: arrayCount(payload, probe.field),
          durationMs,
          error: null,
          browserCacheCount: browserCacheCount(probe.path, probe.field),
          freshnessCount: freshnessCount(probe.path, probe.field),
        };
      } catch (caught) {
        return {
          ...probe,
          ok: false,
          status: null,
          count: null,
          durationMs: Math.max(0, Math.round(performance.now() - started)),
          error: caught instanceof Error ? caught.message : "Endpoint isteği başarısız.",
          browserCacheCount: browserCacheCount(probe.path, probe.field),
          freshnessCount: freshnessCount(probe.path, probe.field),
        };
      }
    }));
  }, [authHeaders]);

  const commit = useCallback((payload: DiagnosticPayload) => {
    setLatest(payload);
    setHistory((current) => [payload, ...current].slice(0, 12));
  }, []);

  const runOnce = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [diagnostic, probes] = await Promise.all([requestDiagnostic(), requestPageEndpoints()]);
      commit(diagnostic);
      setEndpointProbes(probes);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Teşhis çalıştırılamadı.");
    } finally {
      setLoading(false);
    }
  }, [commit, requestDiagnostic, requestPageEndpoints]);

  const runBurst = useCallback(async () => {
    if (bursting) return;
    setBursting(true);
    setError("");
    try {
      for (let index = 0; index < 5; index += 1) {
        const [diagnostic, probes] = await Promise.all([requestDiagnostic(), requestPageEndpoints()]);
        commit(diagnostic);
        setEndpointProbes(probes);
        if (index < 4) await sleep(350);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Seri teşhis tamamlanamadı.");
    } finally {
      setBursting(false);
    }
  }, [bursting, commit, requestDiagnostic, requestPageEndpoints]);

  useEffect(() => { void runOnce(); }, [runOnce]);

  const intermittent = useMemo(() => {
    if (history.length < 2) return false;
    const signatures = new Set(history.slice(0, 6).map((item) => [item.counts.productsPanelVisible, item.counts.ordersTotal, item.counts.customerReadModelTotal, item.counts.productsRawPostgrest, item.counts.ordersRawPostgrest].join(":")));
    return signatures.size > 1;
  }, [history]);

  const frontendSignal = useMemo(() => {
    if (!endpointProbes.length) return null;
    const productsLean = endpointProbes.find((item) => item.key === "productsLean");
    const productsLegacy = endpointProbes.find((item) => item.key === "productsLegacy");
    const ordersLean = endpointProbes.find((item) => item.key === "ordersLean");
    const ordersLegacy = endpointProbes.find((item) => item.key === "ordersLegacy");
    const customers = endpointProbes.find((item) => item.key === "customers");

    if ((productsLean?.count || 0) > 0 && (productsLegacy?.count || 0) === 0) return "Ürün lean endpointi dolu ama sayfanın kullandığı /api/products boş dönüyor.";
    if ((ordersLean?.count || 0) > 0 && (ordersLegacy?.count || 0) === 0) return "Sipariş lean endpointi dolu ama sayfanın kullandığı /api/orders boş dönüyor.";
    if ((productsLegacy?.count || 0) > 0 && productsLegacy?.browserCacheCount === 0) return "Ürün endpointi dolu fakat browser cache 0 ürün tutuyor. Sorun frontend cache/freshness katmanında.";
    if ((ordersLegacy?.count || 0) > 0 && ordersLegacy?.browserCacheCount === 0) return "Sipariş endpointi dolu fakat browser cache 0 sipariş tutuyor. Sorun frontend cache/freshness katmanında.";
    if ((customers?.count || 0) > 0 && customers?.browserCacheCount === 0) return "Müşteri endpointi dolu fakat browser cache 0 müşteri tutuyor. Sorun frontend cache/freshness katmanında.";
    if ((productsLegacy?.count || 0) > 0 && (ordersLegacy?.count || 0) > 0 && (customers?.count || 0) > 0) return "Sayfa endpointleri de dolu. Sayfa hâlâ boşsa sorun React component state/remount zincirinde.";
    return null;
  }, [endpointProbes]);

  const copy = async () => {
    if (!latest) return;
    await navigator.clipboard.writeText(JSON.stringify({ diagnostic: latest, endpointProbes }, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4 pb-10" data-exact-base44-page="data-path-diagnostics">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-main">Veri Yolu Teşhisi</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted">DB → PostgREST → panel endpointleri → browser cache/freshness zincirini hiçbir veriyi değiştirmeden karşılaştırır. Sayfa “ürün yok / sipariş yok / müşteri yok” dediği anda bu ekranı aynı sekmede açıp test et.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void runOnce()} disabled={loading || bursting} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-4 text-xs font-semibold text-main disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Canlı Kontrol</button>
          <button type="button" onClick={() => void runBurst()} disabled={loading || bursting} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 text-xs font-semibold text-accent-foreground disabled:opacity-50"><SearchCheck className={`h-4 w-4 ${bursting ? "animate-pulse" : ""}`} /> {bursting ? "5 test çalışıyor..." : "5x Seri Test"}</button>
        </div>
      </div>

      {error ? <div className="rounded-[var(--radius-card)] bg-danger-soft p-4 text-xs text-danger-foreground">{error}</div> : null}
      {intermittent ? <div className="rounded-[var(--radius-card)] bg-warning-soft p-4 text-xs font-semibold text-warning-foreground">Aralıklı DB/PostgREST sayı farkı yakalandı.</div> : null}
      {frontendSignal ? <div className="rounded-[var(--radius-card)] border border-accent/20 bg-accent-soft p-4 text-xs font-semibold text-accent">Teşhis sinyali: {frontendSignal}</div> : null}

      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(latest?.state)}`}>{statusText(latest?.state)}</span>
        <span className="text-[10px] text-muted">Origin: <strong className="text-main">{latest?.runtime.supabaseHost || "—"}</strong></span>
        <span className="text-[10px] text-muted">Fingerprint: <strong className="font-mono text-main">{latest?.fingerprint || "—"}</strong></span>
        <span className="text-[10px] text-muted">Auth: <strong className="text-main">{latest ? `${latest.runtime.authMs} ms` : "—"}</strong></span>
        <span className="text-[10px] text-muted">Toplam: <strong className="text-main">{latest ? `${latest.runtime.totalMs} ms` : "—"}</strong></span>
        <button type="button" disabled={!latest} onClick={() => void copy()} className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 text-[10px] font-semibold text-main disabled:opacity-40"><Copy className="h-3.5 w-3.5" /> {copied ? "Kopyalandı" : "JSON'u Kopyala"}</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <CountCard label="Panel Ürün" value={latest?.counts.productsPanelVisible ?? null} compare={latest?.counts.productsRawPostgrest ?? null} />
        <CountCard label="Aktif Ürün" value={latest?.counts.productsActive ?? null} />
        <CountCard label="Storefront Ürün" value={latest?.counts.storefrontActive ?? null} />
        <CountCard label="Sipariş" value={latest?.counts.ordersTotal ?? null} compare={latest?.counts.ordersRawPostgrest ?? null} />
        <CountCard label="Müşteri Read Model" value={latest?.counts.customerReadModelTotal ?? null} compare={latest?.counts.customerSummaryCount ?? null} />
      </div>

      <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4">
        <h2 className="text-sm font-semibold text-main">Sayfaların Gerçek Endpointleri</h2>
        <p className="mt-1 text-[10px] text-muted">Canlı endpoint cevabı ile aynı sekmedeki browser cache ve freshness authority yan yana.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-[10px]">
            <thead className="text-subtle"><tr><th className="pb-2">Kaynak</th><th className="pb-2">Canlı cevap</th><th className="pb-2">Browser cache</th><th className="pb-2">Freshness</th><th className="pb-2">HTTP</th><th className="pb-2">ms</th><th className="pb-2">Hata</th></tr></thead>
            <tbody className="divide-y divide-border-subtle">{endpointProbes.map((probe) => {
              const mismatch = probe.count != null && ((probe.browserCacheCount != null && probe.browserCacheCount !== probe.count) || (probe.freshnessCount != null && probe.freshnessCount !== probe.count));
              return <tr key={probe.key} className={mismatch ? "bg-warning-soft/50" : ""}><td className="py-2 font-semibold text-main">{probe.label}<div className="font-mono text-[8px] font-normal text-subtle">{probe.path}</div></td><td className="py-2 font-semibold text-main">{probe.count ?? "—"}</td><td className="py-2 text-main">{probe.browserCacheCount ?? "—"}</td><td className="py-2 text-main">{probe.freshnessCount ?? "—"}</td><td className={`py-2 font-semibold ${probe.ok ? "text-success-foreground" : "text-danger-foreground"}`}>{probe.status ?? "—"}</td><td className="py-2 text-muted">{probe.durationMs}</td><td className="max-w-[260px] py-2 text-danger-foreground">{probe.error || "—"}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4">
          <h2 className="text-sm font-semibold text-main">Son Kontrol Detayı</h2>
          <div className="mt-3 space-y-2">{latest ? Object.entries(latest.checks).map(([name, check]) => <div key={name} className="flex items-start justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-2"><div className="min-w-0"><p className="text-[10px] font-semibold text-main">{name}</p>{check.error ? <p className="mt-0.5 break-words text-[9px] text-danger-foreground">{check.error}</p> : null}</div><span className={`shrink-0 text-[10px] font-semibold ${check.ok ? "text-success-foreground" : "text-danger-foreground"}`}>{check.ok ? "OK" : "HATA"} · {check.durationMs} ms</span></div>) : <p className="text-xs text-muted">Kontrol bekleniyor.</p>}</div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4">
          <h2 className="text-sm font-semibold text-main">Test Geçmişi</h2>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-[10px]"><thead className="text-subtle"><tr><th className="pb-2">Saat</th><th className="pb-2">Durum</th><th className="pb-2">Ürün</th><th className="pb-2">Raw Ürün</th><th className="pb-2">Sipariş</th><th className="pb-2">Müşteri</th><th className="pb-2">ms</th></tr></thead><tbody className="divide-y divide-border-subtle">{history.map((item, index) => <tr key={`${item.checkedAt}-${index}`}><td className="py-2 text-muted">{new Date(item.checkedAt).toLocaleTimeString("tr-TR")}</td><td className="py-2 font-semibold text-main">{statusText(item.state)}</td><td className="py-2 text-main">{item.counts.productsPanelVisible ?? "—"}</td><td className="py-2 text-main">{item.counts.productsRawPostgrest ?? "—"}</td><td className="py-2 text-main">{item.counts.ordersTotal ?? "—"}</td><td className="py-2 text-main">{item.counts.customerReadModelTotal ?? "—"}</td><td className="py-2 text-muted">{item.runtime.totalMs}</td></tr>)}</tbody></table></div>
        </div>
      </div>

      {latest ? <details className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4"><summary className="cursor-pointer text-xs font-semibold text-main">Ham JSON</summary><pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg bg-surface-secondary p-3 text-[9px] leading-4 text-muted">{JSON.stringify({ diagnostic: latest, endpointProbes }, null, 2)}</pre></details> : null}
    </div>
  );
}
