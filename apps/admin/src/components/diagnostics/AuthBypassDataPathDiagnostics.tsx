"use client";

import { Copy, RefreshCw, SearchCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminAuthHeaders, apiUrl } from "@/lib/adminApi";
import { currentAcceptedAdminPayload } from "@/lib/adminOperationalFreshness";

type CountPayload = {
  ok?: boolean;
  state?: string;
  checkedAt?: string;
  fingerprint?: string;
  runtime?: { supabaseHost?: string; authMs?: number; totalMs?: number };
  counts?: {
    productsPanelVisible?: number | null;
    productsRawPostgrest?: number | null;
    productsActive?: number | null;
    storefrontActive?: number | null;
    ordersTotal?: number | null;
    ordersRawPostgrest?: number | null;
    customerReadModelTotal?: number | null;
    customerSummaryCount?: number | null;
  };
};

type Probe = {
  label: string;
  path: string;
  field: "products" | "orders" | "customers";
};

type ProbeResult = Probe & {
  count: number | null;
  status: number | null;
  ms: number;
  error: string | null;
  browserCache: number | null;
  freshness: number | null;
};

type AuthState = {
  storage: "session" | "local" | "none";
  tokenPresent: boolean;
  tokenExpiresAt: number | null;
  tokenRemainingSeconds: number | null;
  meStatus: number | null;
  meMs: number | null;
  meError: string | null;
  helperMs: number | null;
  helperError: string | null;
};

const STORAGE_KEY = "ruth_admin_auth_session_v1";
const CACHE_PREFIX = "ruth_admin_api_cache_v6:";
const PROBES: Probe[] = [
  { label: "Ürünler · lean", path: "/api/products/list?q=", field: "products" },
  { label: "Ürünler · sayfa", path: "/api/products?q=", field: "products" },
  { label: "Siparişler · lean", path: "/api/orders/list?range=all&payment=all&q=", field: "orders" },
  { label: "Siparişler · sayfa", path: "/api/orders?range=all&payment=all&q=", field: "orders" },
  { label: "Müşteriler · sayfa", path: "/api/customers/list?page=1&pageSize=25&membership=all&sort=recent", field: "customers" },
];

function readStoredSession() {
  const candidates: Array<["session" | "local", Storage]> = [
    ["session", window.sessionStorage],
    ["local", window.localStorage],
  ];
  for (const [storageName, storage] of candidates) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) continue;
      const value = JSON.parse(raw) as { access_token?: string; expires_at?: number };
      if (!value.access_token) continue;
      return { storage: storageName, token: value.access_token, expiresAt: Number(value.expires_at || 0) * 1000 || null };
    } catch {}
  }
  return { storage: "none" as const, token: "", expiresAt: null };
}

function arrayCount(value: unknown, field: Probe["field"]) {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  return Array.isArray(payload[field]) ? payload[field].length : null;
}

function browserCacheCount(path: string, field: Probe["field"]) {
  try {
    const raw = window.sessionStorage.getItem(`${CACHE_PREFIX}${path}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { value?: unknown };
    return arrayCount(entry.value, field);
  } catch {
    return null;
  }
}

function freshnessCount(path: string, field: Probe["field"]) {
  try {
    return arrayCount(currentAcceptedAdminPayload(path), field);
  } catch {
    return null;
  }
}

async function fetchJsonWithToken(path: string, token: string, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(apiUrl(path), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Ruth-Admin-Request": "1",
        "X-Ruth-Cache-Bypass": "1",
        "X-Ruth-Continuity-Probe": "1",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return {
      response,
      payload,
      ms: Math.max(0, Math.round(performance.now() - started)),
    };
  } finally {
    window.clearTimeout(timer);
  }
}

async function probeAdminAuthHelper(timeoutMs = 5000) {
  const started = performance.now();
  let timer = 0;
  try {
    await Promise.race([
      adminAuthHeaders(),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(`adminAuthHeaders ${timeoutMs} ms içinde çözülmedi.`)), timeoutMs);
      }),
    ]);
    return { ms: Math.max(0, Math.round(performance.now() - started)), error: null };
  } catch (error) {
    return {
      ms: Math.max(0, Math.round(performance.now() - started)),
      error: error instanceof Error ? error.message : "adminAuthHeaders başarısız.",
    };
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

export function AuthBypassDataPathDiagnostics() {
  const [diagnostic, setDiagnostic] = useState<CountPayload | null>(null);
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [probes, setProbes] = useState<ProbeResult[]>([]);
  const [history, setHistory] = useState<Array<{ at: string; products: number | null; orders: number | null; customers: number | null; me: number | null; helperError: string | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [bursting, setBursting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const run = useCallback(async () => {
    const stored = readStoredSession();
    const remaining = stored.expiresAt == null ? null : Math.round((stored.expiresAt - Date.now()) / 1000);
    const helperPromise = probeAdminAuthHelper();

    if (!stored.token) {
      const helper = await helperPromise;
      const nextAuth: AuthState = {
        storage: stored.storage,
        tokenPresent: false,
        tokenExpiresAt: stored.expiresAt,
        tokenRemainingSeconds: remaining,
        meStatus: null,
        meMs: null,
        meError: "Tarayıcı storage içinde admin access token bulunamadı.",
        helperMs: helper.ms,
        helperError: helper.error,
      };
      setAuthState(nextAuth);
      throw new Error("Ham admin token bulunamadı. Sorun auth/session persistence katmanında.");
    }

    const mePromise = fetchJsonWithToken(`/api/me?__diag=${Date.now()}`, stored.token).catch((caught) => ({
      response: null as Response | null,
      payload: {},
      ms: null as number | null,
      error: caught instanceof Error ? caught.message : "api/me başarısız",
    }));
    const diagnosticPromise = fetchJsonWithToken(`/api/diagnostics/data-path?t=${Date.now()}`, stored.token);
    const probePromises = PROBES.map(async (probe): Promise<ProbeResult> => {
      const separator = probe.path.includes("?") ? "&" : "?";
      try {
        const result = await fetchJsonWithToken(`${probe.path}${separator}__diag=${Date.now()}`, stored.token);
        const ok = result.response.ok && result.payload?.ok !== false;
        return {
          ...probe,
          count: ok ? arrayCount(result.payload, probe.field) : null,
          status: result.response.status,
          ms: result.ms,
          error: ok ? null : result.payload?.error || result.payload?.message || `HTTP ${result.response.status}`,
          browserCache: browserCacheCount(probe.path, probe.field),
          freshness: freshnessCount(probe.path, probe.field),
        };
      } catch (caught) {
        return {
          ...probe,
          count: null,
          status: null,
          ms: 0,
          error: caught instanceof Error ? caught.message : "Endpoint isteği başarısız.",
          browserCache: browserCacheCount(probe.path, probe.field),
          freshness: freshnessCount(probe.path, probe.field),
        };
      }
    });

    const [helper, me, diag, nextProbes] = await Promise.all([
      helperPromise,
      mePromise,
      diagnosticPromise,
      Promise.all(probePromises),
    ]);

    const meResponse = "response" in me ? me.response : null;
    const mePayload = "payload" in me ? me.payload : {};
    const meError = "error" in me ? me.error : null;
    const nextAuth: AuthState = {
      storage: stored.storage,
      tokenPresent: true,
      tokenExpiresAt: stored.expiresAt,
      tokenRemainingSeconds: remaining,
      meStatus: meResponse?.status ?? null,
      meMs: "ms" in me ? me.ms : null,
      meError: meError || (meResponse && (!meResponse.ok || mePayload?.ok === false) ? mePayload?.error || mePayload?.message || `HTTP ${meResponse.status}` : null),
      helperMs: helper.ms,
      helperError: helper.error,
    };
    setAuthState(nextAuth);

    if (!diag.response.ok || diag.payload?.ok === false) {
      throw new Error(diag.payload?.error || diag.payload?.message || `Diagnostic HTTP ${diag.response.status}`);
    }

    setDiagnostic(diag.payload as CountPayload);
    setProbes(nextProbes);
    setHistory((current) => [{
      at: new Date().toISOString(),
      products: Number((diag.payload as CountPayload)?.counts?.productsPanelVisible ?? null),
      orders: Number((diag.payload as CountPayload)?.counts?.ordersTotal ?? null),
      customers: Number((diag.payload as CountPayload)?.counts?.customerReadModelTotal ?? null),
      me: nextAuth.meStatus,
      helperError: nextAuth.helperError,
    }, ...current].slice(0, 12));
  }, []);

  const runOnce = useCallback(async () => {
    setLoading(true);
    setError("");
    try { await run(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Teşhis çalıştırılamadı."); }
    finally { setLoading(false); }
  }, [run]);

  const runBurst = useCallback(async () => {
    if (bursting) return;
    setBursting(true);
    setError("");
    try {
      for (let index = 0; index < 5; index += 1) {
        await run();
        if (index < 4) await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Seri teşhis tamamlanamadı.");
    } finally { setBursting(false); }
  }, [bursting, run]);

  useEffect(() => { void runOnce(); }, [runOnce]);

  const signal = useMemo(() => {
    if (!authState) return null;
    if (!authState.tokenPresent) return "Ham token yok: auth/session storage katmanı kopuyor.";
    if ((authState.tokenRemainingSeconds ?? 999) <= 0) return "Tarayıcıdaki admin token süresi dolmuş.";
    if (authState.meStatus === 200 && authState.helperError) return "Ham token ile /api/me çalışıyor ama adminAuthHeaders takılıyor: sorun client auth helper / Supabase auth mutex katmanında.";
    if (authState.meStatus === 401 || authState.meStatus === 403) return "Ham token sunucu tarafından reddediliyor: session refresh/token yenileme sorunu.";
    const productPage = probes.find((item) => item.label === "Ürünler · sayfa");
    if ((productPage?.count || 0) > 0 && productPage?.browserCache === 0) return "Canlı ürün endpointi dolu, browser cache 0: frontend cache/freshness hatası.";
    if ((productPage?.count || 0) > 0 && productPage?.freshness === 0) return "Canlı ürün endpointi dolu, freshness authority 0: global freshness boş veriyi kabul ediyor.";
    if ((productPage?.count || 0) > 0 && productPage?.browserCache !== 0 && productPage?.freshness !== 0) return "Canlı endpoint/cache/freshness doluysa ama sayfa boşsa React state/remount katmanı hatalı.";
    return null;
  }, [authState, probes]);

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify({ authState, diagnostic, probes, history, signal }, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="text-xl font-semibold text-main">Veri Yolu Teşhisi · Auth Bypass</h1><p className="mt-1 max-w-3xl text-xs leading-5 text-muted">Normal admin auth helper takılsa bile tarayıcıdaki ham token ile endpointleri test eder. Sayfalar boşaldığı anda bu ekran çalışmaya devam etmelidir.</p></div>
        <div className="flex gap-2"><button onClick={() => void runOnce()} disabled={loading || bursting} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] border border-border-subtle bg-surface-secondary px-4 text-xs font-semibold"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Canlı Kontrol</button><button onClick={() => void runBurst()} disabled={loading || bursting} className="inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] bg-accent px-4 text-xs font-semibold text-accent-foreground"><SearchCheck className="h-4 w-4" /> 5x Seri Test</button></div>
      </div>

      {error ? <div className="rounded-[var(--radius-card)] bg-danger-soft p-4 text-xs text-danger-foreground">{error}</div> : null}
      {signal ? <div className="rounded-[var(--radius-card)] border border-accent/20 bg-accent-soft p-4 text-xs font-semibold text-accent">Teşhis sinyali: {signal}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4"><p className="text-[10px] text-subtle">HAM TOKEN</p><p className="mt-2 text-lg font-semibold text-main">{authState?.tokenPresent ? "VAR" : "YOK"}</p><p className="mt-1 text-[10px] text-muted">{authState?.storage || "—"} · {authState?.tokenRemainingSeconds == null ? "—" : `${authState.tokenRemainingSeconds}s`}</p></div>
        <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4"><p className="text-[10px] text-subtle">/API/ME</p><p className="mt-2 text-lg font-semibold text-main">{authState?.meStatus ?? "—"}</p><p className="mt-1 text-[10px] text-muted">{authState?.meMs == null ? "—" : `${authState.meMs} ms`}</p></div>
        <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4"><p className="text-[10px] text-subtle">AUTH HELPER</p><p className="mt-2 text-lg font-semibold text-main">{authState?.helperError ? "HATA" : authState ? "OK" : "—"}</p><p className="mt-1 text-[10px] text-muted">{authState?.helperMs == null ? "—" : `${authState.helperMs} ms`}</p></div>
        <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4"><p className="text-[10px] text-subtle">ÜRÜN</p><p className="mt-2 text-lg font-semibold text-main">{diagnostic?.counts?.productsPanelVisible ?? "—"}</p><p className="mt-1 text-[10px] text-muted">raw {diagnostic?.counts?.productsRawPostgrest ?? "—"}</p></div>
        <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4"><p className="text-[10px] text-subtle">SİPARİŞ / MÜŞTERİ</p><p className="mt-2 text-lg font-semibold text-main">{diagnostic?.counts?.ordersTotal ?? "—"} / {diagnostic?.counts?.customerReadModelTotal ?? "—"}</p></div>
      </div>

      {(authState?.meError || authState?.helperError) ? <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4 text-[10px] leading-5 text-muted"><div><strong className="text-main">/api/me:</strong> {authState?.meError || "OK"}</div><div><strong className="text-main">adminAuthHeaders:</strong> {authState?.helperError || "OK"}</div></div> : null}

      <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-main">Sayfaların Gerçek Endpointleri</h2><button onClick={() => void copy()} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border-subtle px-2.5 text-[10px] font-semibold"><Copy className="h-3.5 w-3.5" /> {copied ? "Kopyalandı" : "JSON'u Kopyala"}</button></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-[10px]"><thead className="text-subtle"><tr><th className="pb-2">Kaynak</th><th className="pb-2">Canlı</th><th className="pb-2">Browser cache</th><th className="pb-2">Freshness</th><th className="pb-2">HTTP</th><th className="pb-2">ms</th><th className="pb-2">Hata</th></tr></thead><tbody className="divide-y divide-border-subtle">{probes.map((probe) => <tr key={probe.label}><td className="py-2 font-semibold text-main">{probe.label}</td><td>{probe.count ?? "—"}</td><td>{probe.browserCache ?? "—"}</td><td>{probe.freshness ?? "—"}</td><td>{probe.status ?? "—"}</td><td>{probe.ms}</td><td className="max-w-[260px] truncate text-danger-foreground">{probe.error || "—"}</td></tr>)}</tbody></table></div></div>

      <div className="rounded-[var(--radius-card)] border border-border-subtle bg-surface-primary p-4"><h2 className="text-sm font-semibold text-main">Test Geçmişi</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-[10px]"><thead className="text-subtle"><tr><th className="pb-2">Saat</th><th>Ürün</th><th>Sipariş</th><th>Müşteri</th><th>/api/me</th><th>Auth helper</th></tr></thead><tbody className="divide-y divide-border-subtle">{history.map((row) => <tr key={row.at}><td className="py-2 text-muted">{new Date(row.at).toLocaleTimeString("tr-TR")}</td><td>{row.products ?? "—"}</td><td>{row.orders ?? "—"}</td><td>{row.customers ?? "—"}</td><td>{row.me ?? "—"}</td><td className={row.helperError ? "text-danger-foreground" : "text-success-foreground"}>{row.helperError ? "HATA" : "OK"}</td></tr>)}</tbody></table></div></div>
    </div>
  );
}
