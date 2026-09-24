import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { kickAdminPushWorker } from "@/lib/pushWorker";

const WARNING_GRACE_MS = 90_000;
const WRITE_TIMEOUT_MS = 4_000;

type HealthStatus = "healthy" | "degraded" | "unhealthy";
type ProbeResult = {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
  latencyMs: number;
  metadata?: Record<string, unknown>;
};

type ServiceProbe = {
  key: string;
  label: string;
  path: string;
  timeoutMs: number;
};

const SERVICE_PROBES: ServiceProbe[] = [
  { key: "database-ready", label: "Veritabanı Readiness", path: "/api/health/ready", timeoutMs: 4_000 },
  { key: "admin-session", label: "Admin Oturumu", path: "/api/me", timeoutMs: 6_000 },
  { key: "shipping-api", label: "Kargo Servisi", path: "/api/shipping/basit-kargo/handlers", timeoutMs: 12_000 },
  { key: "email-api", label: "E-posta Servisi", path: "/api/email/status", timeoutMs: 10_000 },
  { key: "storefront-theme", label: "Storefront Tema", path: "/api/theme", timeoutMs: 10_000 },
  { key: "platform-health", label: "Platform SLO / Circuit", path: "/api/health/platform", timeoutMs: 6_000 },
];

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function messageOf(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) return record.message;
    if (typeof record.error === "string" && record.error.trim()) return record.error;
    try {
      const text = JSON.stringify(record);
      if (text && text !== "{}") return text.slice(0, 600);
    } catch {}
  }
  return "Servis yanıt vermedi.";
}

async function withTimeout<T>(value: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function internalBaseUrl(request: Request) {
  const port = String(process.env.PORT || "").trim();
  if (port && /^\d+$/.test(port)) return `http://127.0.0.1:${port}`;
  return new URL(request.url).origin.replace(/\/$/, "");
}

async function requestJson(baseUrl: string, secret: string, path: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`health probe timeout: ${path}`)), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        "x-rosta-internal-secret": secret,
        "x-rosta-service-health-monitor": "3",
        "user-agent": "rosta-service-health-monitor/3.0",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function transportResult(detail: string, latencyMs = 0): ProbeResult {
  return {
    key: "health-monitor-transport",
    label: "Servis İzleyici Bağlantısı",
    status: "unhealthy",
    detail,
    latencyMs,
    metadata: { transportError: true },
  };
}

async function probeTransport(baseUrl: string, secret: string): Promise<ProbeResult | null> {
  const started = Date.now();
  try {
    const { response, payload, latencyMs } = await requestJson(baseUrl, secret, "/api/health/live", 3_000);
    if (!response.ok || payload?.ok === false) {
      return transportResult(`Servis izleyici yerel health endpointine ulaşamadı: HTTP ${response.status}`, latencyMs);
    }
    return null;
  } catch (caught) {
    return transportResult(
      `Servis izleyici yerel bağlantısı başarısız: ${caught instanceof Error ? caught.message : "fetch failed"}`,
      Date.now() - started,
    );
  }
}

async function probeEndpoint(baseUrl: string, secret: string, probe: ServiceProbe): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const { response, payload, latencyMs } = await requestJson(baseUrl, secret, probe.path, probe.timeoutMs);
    if (!response.ok || payload?.ok === false) {
      return {
        key: probe.key,
        label: probe.label,
        status: "unhealthy",
        detail: `${probe.label}: ${messageOf(payload?.error || payload?.message || `${response.status} yanıtı`)}`,
        latencyMs,
        metadata: {
          path: probe.path,
          httpStatus: response.status,
          openCircuits: payload?.openCircuits,
          breachedServices: payload?.breachedServices,
          exhaustedErrorBudgets: payload?.exhaustedErrorBudgets,
        },
      };
    }
    return {
      key: probe.key,
      label: probe.label,
      status: "healthy",
      detail: `${probe.label} normal yanıt verdi.`,
      latencyMs,
      metadata: { path: probe.path, httpStatus: response.status },
    };
  } catch (caught) {
    return {
      key: probe.key,
      label: probe.label,
      status: "unhealthy",
      detail: `${probe.label}: ${caught instanceof Error ? caught.message : "fetch failed"}`,
      latencyMs: Date.now() - started,
      metadata: { path: probe.path, transportError: true },
    };
  }
}

async function probeHealthAggregate(baseUrl: string, secret: string): Promise<ProbeResult[]> {
  try {
    const { response, payload, latencyMs } = await requestJson(baseUrl, secret, "/api/health", 10_000);
    if (!response.ok || !Array.isArray(payload?.checks)) {
      return [{
        key: "admin-health-api",
        label: "Servis Sağlığı API",
        status: "unhealthy",
        detail: `Servis Sağlığı API geçerli kontrol listesi döndürmedi: ${response.status}`,
        latencyMs,
      }];
    }

    const labels: Record<string, string> = {
      database: "Veritabanı",
      outbox: "Event Bus / Outbox",
      jobs: "Arka Plan İş Kuyruğu",
      "instant-data": "Anlık Veri / Read Model",
      "panel-sync": "Backend Sync Worker",
    };

    return payload.checks
      .filter((check: any) => labels[String(check?.name || "")])
      .map((check: any) => ({
        key: `health-${String(check.name)}`,
        label: labels[String(check.name)],
        status: check.status === "unhealthy" ? "unhealthy" : check.status === "degraded" ? "degraded" : "healthy",
        detail: String(check.detail || `${labels[String(check.name)]} kontrol edildi.`),
        latencyMs,
        metadata: {
          pending: check.pending,
          active: check.active,
          deadLetter: check.deadLetter,
          stale: check.stale,
          errors: check.errors,
          lastRunAt: check.lastRunAt,
        },
      }));
  } catch (caught) {
    return [{
      key: "admin-health-api",
      label: "Servis Sağlığı API",
      status: "unhealthy",
      detail: `Servis Sağlığı API: ${caught instanceof Error ? caught.message : "fetch failed"}`,
      latencyMs: 0,
      metadata: { path: "/api/health", transportError: true },
    }];
  }
}

async function probeCommerceCore(baseUrl: string, secret: string): Promise<ProbeResult[]> {
  try {
    const { response, payload, latencyMs } = await requestJson(baseUrl, secret, "/api/commerce-core/health", 12_000);
    const cores = Array.isArray(payload?.cores) ? payload.cores as Array<any> : [];
    if (!response.ok || !cores.length) {
      return [{
        key: "commerce-core",
        label: "Commerce Core",
        status: "unhealthy",
        detail: `Commerce Core sağlık raporu alınamadı: ${messageOf(payload?.error || `${response.status} yanıtı`)}`,
        latencyMs,
      }];
    }

    const failed = cores.filter((core) => core?.status === "failed").length;
    const warning = cores.filter((core) => core?.status === "warning").length;
    const results: ProbeResult[] = [{
      key: "commerce-core",
      label: "Commerce Core",
      status: failed ? "unhealthy" : warning ? "degraded" : "healthy",
      detail: `${cores.length} çekirdek · ${cores.length - failed - warning} çalışıyor · ${warning} uyarı · ${failed} hata`,
      latencyMs,
      metadata: { engineCount: cores.length, failed, warning },
    }];

    for (const core of cores) {
      const key = String(core?.key || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-");
      results.push({
        key: `commerce-core-${key}`,
        label: `Commerce Core · ${String(core?.title || core?.key || "Çekirdek")}`,
        status: core?.status === "failed" ? "unhealthy" : core?.status === "warning" ? "degraded" : "healthy",
        detail: String(core?.detail || core?.description || core?.status || "Çekirdek kontrol edildi."),
        latencyMs,
        metadata: { core: core?.key, reportedStatus: core?.status },
      });
    }
    return results;
  } catch (caught) {
    return [{
      key: "commerce-core",
      label: "Commerce Core",
      status: "unhealthy",
      detail: `Commerce Core: ${caught instanceof Error ? caught.message : "fetch failed"}`,
      latencyMs: 0,
      metadata: { path: "/api/commerce-core/health", transportError: true },
    }];
  }
}

function collapseTransportStorm(results: ProbeResult[]) {
  const transportFailures = results.filter((item) => item.metadata?.transportError === true);
  if (transportFailures.length < 3 || transportFailures.length < Math.ceil(results.length / 2)) return results;
  const examples = transportFailures.slice(0, 3).map((item) => item.detail).join(" · ");
  return [transportResult(`Servis izleyici ortak transport hatası algıladı; alt servisler ayrı ayrı arızalı sayılmadı. ${examples}`)];
}

function alertOwnedHere(result: ProbeResult) {
  if (["health-outbox", "health-jobs", "health-instant-data", "health-panel-sync"].includes(result.key)) return false;
  if (result.key === "commerce-core" || result.key.startsWith("commerce-core-")) return false;
  return true;
}

async function persistBatch(supabase: any, results: ProbeResult[], startedAt: number) {
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const keys = [...new Set([...results.map((item) => item.key), "service-health-monitor"])];

  const previousResult = await withTimeout<any>(
    supabase
      .from("panel_service_health_state")
      .select("service_key,status,first_seen_at,last_alerted_at,recovered_at")
      .in("service_key", keys),
    WRITE_TIMEOUT_MS,
    "health previous-state read",
  );
  if (previousResult.error) throw new Error(previousResult.error.message);

  const previousByKey = new Map<string, any>();
  for (const row of previousResult.data || []) previousByKey.set(String(row.service_key), row);

  const stateRows: any[] = [];
  const alertRows: any[] = [];

  for (const result of results) {
    const previous = previousByKey.get(result.key);
    const previousStatus = String(previous?.status || "healthy");
    const enteringProblem = result.status !== "healthy" && previousStatus === "healthy";
    const severityChanged = result.status !== "healthy" && previousStatus !== result.status;
    const firstSeenAt = result.status === "healthy"
      ? nowIso
      : enteringProblem || !previous?.first_seen_at ? nowIso : String(previous.first_seen_at);
    const problemAgeMs = result.status === "healthy" ? 0 : Math.max(0, nowMs - new Date(firstSeenAt).getTime());
    const notify = alertOwnedHere(result);
    const shouldAlert = notify && (result.status === "unhealthy"
      ? (enteringProblem || severityChanged)
      : result.status === "degraded"
        ? problemAgeMs >= WARNING_GRACE_MS && (enteringProblem || severityChanged)
        : false);
    const recovered = result.status === "healthy" && previousStatus !== "healthy";

    stateRows.push({
      service_key: result.key,
      status: result.status,
      detail: result.detail,
      first_seen_at: firstSeenAt,
      last_seen_at: nowIso,
      last_alerted_at: shouldAlert ? nowIso : previous?.last_alerted_at || null,
      recovered_at: recovered ? nowIso : previous?.recovered_at || null,
      metadata: {
        ...(result.metadata || {}),
        label: result.label,
        latencyMs: result.latencyMs,
        monitoredBy: "service-health-monitor-v3",
        alertOwner: notify ? "service-health-monitor" : "panel-sync",
      },
      updated_at: nowIso,
    });

    if (shouldAlert) {
      const incidentStarted = firstSeenAt.replace(/[^0-9]/g, "").slice(0, 14);
      alertRows.push({
        kind: "health",
        dedupe_key: `service-health:${result.key}:${result.status}:${incidentStarted}`,
        payload: {
          service_key: result.key,
          status: result.status,
          title: result.status === "unhealthy" ? `${result.label} hatası` : `${result.label} uyarısı`,
          body: result.detail,
        },
        target_url: "/system",
      });
    }
  }

  const unhealthy = results.filter((item) => item.status === "unhealthy");
  const degraded = results.filter((item) => item.status === "degraded");
  const monitorStatus: HealthStatus = unhealthy.length ? "unhealthy" : degraded.length ? "degraded" : "healthy";
  const previousMonitor = previousByKey.get("service-health-monitor");

  stateRows.push({
    service_key: "service-health-monitor",
    status: monitorStatus,
    detail: `${results.length} servis kontrol edildi · ${unhealthy.length} hata · ${degraded.length} uyarı`,
    first_seen_at: monitorStatus === "healthy" ? nowIso : previousMonitor?.first_seen_at || nowIso,
    last_seen_at: nowIso,
    last_alerted_at: previousMonitor?.last_alerted_at || null,
    recovered_at: monitorStatus === "healthy" && previousMonitor?.status !== "healthy" ? nowIso : previousMonitor?.recovered_at || null,
    metadata: {
      monitoredServices: results.length,
      unhealthy: unhealthy.map((item) => item.key),
      degraded: degraded.map((item) => item.key),
      durationMs: Date.now() - startedAt,
      batchWriter: true,
      transportSafe: true,
    },
    updated_at: nowIso,
  });

  const stateWrite = await withTimeout<any>(
    supabase.from("panel_service_health_state").upsert(stateRows, { onConflict: "service_key" }),
    WRITE_TIMEOUT_MS,
    "health state batch write",
  );
  if (stateWrite.error) throw new Error(stateWrite.error.message);

  if (alertRows.length) {
    const alertWrite = await withTimeout<any>(
      supabase.from("admin_push_jobs").upsert(alertRows, { onConflict: "dedupe_key", ignoreDuplicates: true }),
      WRITE_TIMEOUT_MS,
      "health alert batch write",
    );
    if (alertWrite.error) throw new Error(alertWrite.error.message);
  }

  return { alertsQueued: alertRows.length, monitorStatus };
}

export async function runServiceHealthMonitor(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const startedAt = Date.now();
  const baseUrl = internalBaseUrl(request);
  let secret = auth.internal ? String(auth.internalSecret || "") : "";

  if (!auth.internal) {
    const config = await withTimeout<any>(
      auth.supabase.from("automation_cron_config").select("secret").eq("id", true).maybeSingle(),
      2_500,
      "health config read",
    );
    if (config.error || !config.data?.secret) {
      return json({ ok: false, error: config.error?.message || "Servis izleyici yapılandırması bulunamadı." }, 503);
    }
    secret = String(config.data.secret);
  }

  if (!secret) return json({ ok: false, error: "Servis izleyici secret eksik." }, 503);

  const transportFailure = await probeTransport(baseUrl, secret);
  let results: ProbeResult[];
  if (transportFailure) {
    results = [transportFailure];
  } else {
    const [endpointResults, aggregateResults, coreResults] = await Promise.all([
      Promise.all(SERVICE_PROBES.map((probe) => probeEndpoint(baseUrl, secret, probe))),
      probeHealthAggregate(baseUrl, secret),
      probeCommerceCore(baseUrl, secret),
    ]);
    results = collapseTransportStorm([...endpointResults, ...aggregateResults, ...coreResults]);
  }

  let persistenceError: string | null = null;
  let alertsQueued = 0;
  let monitorStatus: HealthStatus = results.some((item) => item.status === "unhealthy")
    ? "unhealthy"
    : results.some((item) => item.status === "degraded") ? "degraded" : "healthy";

  try {
    const persisted = await persistBatch(auth.supabase, results, startedAt);
    alertsQueued = persisted.alertsQueued;
    monitorStatus = persisted.monitorStatus;
  } catch (caught) {
    persistenceError = caught instanceof Error ? caught.message : "health batch persistence failed";
  }

  if (alertsQueued) void kickAdminPushWorker();

  const unhealthy = results.filter((item) => item.status === "unhealthy");
  const degraded = results.filter((item) => item.status === "degraded");
  return json({
    ok: unhealthy.length === 0 && !persistenceError,
    status: persistenceError ? "degraded" : monitorStatus,
    monitored: results.length,
    healthy: results.filter((item) => item.status === "healthy").length,
    degraded: degraded.length,
    unhealthy: unhealthy.length,
    alertsQueued,
    persistenceError,
    transportBase: baseUrl.startsWith("http://127.0.0.1:") ? "loopback" : "request-origin",
    durationMs: Date.now() - startedAt,
    issues: [...unhealthy, ...degraded].map((item) => ({ key: item.key, label: item.label, status: item.status, detail: item.detail })),
    completedAt: new Date().toISOString(),
  }, unhealthy.length || persistenceError ? 207 : 200);
}
