import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { kickAdminPushWorker } from "@/lib/pushWorker";

const WRITE_TIMEOUT_MS = 4_000;
const REQUIRED_VERIFIED_STREAK = 2;

type HealthStatus = "healthy" | "degraded" | "unhealthy";
type ProbeResult = {
  key: string;
  label: string;
  status: HealthStatus;
  detail: string;
  latencyMs: number;
  metadata?: Record<string, any>;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
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
        "x-rosta-service-health-monitor": "4",
        "user-agent": "rosta-service-health-monitor/4.2",
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

function healthy(key: string, label: string, detail: string, latencyMs: number, metadata: Record<string, any> = {}): ProbeResult {
  return { key, label, status: "healthy", detail, latencyMs, metadata: { ...metadata, verifiedFailure: false } };
}

function degraded(key: string, label: string, detail: string, latencyMs: number, metadata: Record<string, any> = {}): ProbeResult {
  return { key, label, status: "degraded", detail, latencyMs, metadata: { ...metadata, verifiedFailure: false } };
}

function unverified(key: string, label: string, detail: string, latencyMs: number, path?: string): ProbeResult {
  return degraded(key, label, detail, latencyMs, { transportError: true, path });
}

function verifiedFailure(key: string, label: string, detail: string, latencyMs: number, metadata: Record<string, any> = {}): ProbeResult {
  return { key, label, status: "unhealthy", detail, latencyMs, metadata: { ...metadata, verifiedFailure: true } };
}

function explicitFailure(payload: any) {
  if (payload?.confirmedFailure === true) return true;
  const reported = String(payload?.status || "").toLowerCase();
  return payload?.verified === true && (reported === "unhealthy" || reported === "failed");
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function dependencyLabel(name: string) {
  const value = name.toLowerCase();
  if (value.includes("basit") || value.includes("shipping") || value.includes("kargo")) return "Kargo Sağlayıcısı";
  if (value.includes("gmail") || value.includes("brevo") || value.includes("email") || value.includes("mail")) return "E-posta Sağlayıcısı";
  if (value.includes("meta")) return "Meta Ads";
  if (value.includes("paytr") || value.includes("payment")) return "Ödeme Sağlayıcısı";
  if (value.includes("vercel") || value.includes("storefront")) return "Storefront";
  return `Bağımlılık · ${name}`;
}

async function probeReadiness(baseUrl: string, secret: string): Promise<ProbeResult> {
  const path = "/api/health/ready";
  const started = Date.now();
  try {
    const { response, payload, latencyMs } = await requestJson(baseUrl, secret, path, 6_000);
    if (response.ok && payload?.ok !== false) {
      return healthy("database-ready", "Veritabanı Readiness", "Veritabanı readiness kontrolü başarılı.", latencyMs, { path, httpStatus: response.status });
    }
    if (explicitFailure(payload)) {
      return verifiedFailure(
        "database-ready",
        "Veritabanı Readiness",
        String(payload?.error || "Veritabanı readiness kontrolü doğrulanmış hata döndürdü."),
        latencyMs,
        { path, httpStatus: response.status, failureKind: payload?.failureKind || null },
      );
    }
    return unverified(
      "database-ready",
      "Veritabanı Readiness",
      `Veritabanı readiness bu turda doğrulanamadı (HTTP ${response.status}); servis arızalı sayılmadı.`,
      latencyMs,
      path,
    );
  } catch (caught) {
    return unverified(
      "database-ready",
      "Veritabanı Readiness",
      `Veritabanı readiness bağlantısı bu turda doğrulanamadı; servis arızalı sayılmadı: ${caught instanceof Error ? caught.message : "network error"}`,
      Date.now() - started,
      path,
    );
  }
}

async function probeAggregate(baseUrl: string, secret: string): Promise<ProbeResult[]> {
  const path = "/api/health";
  try {
    const { response, payload, latencyMs } = await requestJson(baseUrl, secret, path, 12_000);
    if (!Array.isArray(payload?.checks)) {
      return [unverified("admin-health-api", "Servis Sağlığı API", `Servis Sağlığı API geçerli kontrol listesi üretemedi (HTTP ${response.status}); alt servisler arızalı sayılmadı.`, latencyMs, path)];
    }

    const labels: Record<string, string> = {
      database: "Veritabanı",
      outbox: "Event Bus / Outbox",
      jobs: "Arka Plan İş Kuyruğu",
      "instant-data": "Anlık Veri / Read Model",
      "panel-sync": "Backend Sync Worker",
      "service-monitor": "24/7 Servis İzleyici",
    };

    const childResults: ProbeResult[] = payload.checks
      .filter((check: any) => labels[String(check?.name || "")])
      .map((check: any) => {
        const name = String(check?.name || "unknown");
        const key = `health-${name}`;
        const label = labels[name] || name;
        const status = String(check?.status || "").toLowerCase();
        const detail = String(check?.detail || `${label} kontrol edildi.`);
        const metadata = {
          pending: check?.pending,
          active: check?.active,
          deadLetter: check?.deadLetter,
          stale: check?.stale,
          errors: check?.errors,
          lastRunAt: check?.lastRunAt,
          confirmedFailure: check?.confirmedFailure === true,
        };

        if ((status === "unhealthy" || status === "failed") && check?.confirmedFailure === true) {
          return verifiedFailure(key, label, detail, latencyMs, metadata);
        }
        if (status === "degraded" || status === "warning" || status === "unhealthy" || status === "failed") {
          return degraded(key, label, detail, latencyMs, metadata);
        }
        return healthy(key, label, detail, latencyMs, metadata);
      });

    return [
      healthy(
        "admin-health-api",
        "Servis Sağlığı API",
        `Servis Sağlığı API geçerli kontrol listesi döndürdü (HTTP ${response.status}).`,
        latencyMs,
        { httpStatus: response.status, aggregateStatus: payload?.status || null },
      ),
      ...childResults,
    ];
  } catch (caught) {
    return [unverified("admin-health-api", "Servis Sağlığı API", `Servis Sağlığı API bağlantısı bu turda doğrulanamadı; alt servisler arızalı sayılmadı: ${caught instanceof Error ? caught.message : "network error"}`, 0, path)];
  }
}

async function probePlatform(baseUrl: string, secret: string): Promise<ProbeResult[]> {
  const path = "/api/health/platform";
  try {
    const { response, payload, latencyMs } = await requestJson(baseUrl, secret, path, 10_000);
    if (!Array.isArray(payload?.dependencies)) {
      return [unverified("platform-health", "Platform SLO / Circuit", `Platform sağlık verisi bu turda doğrulanamadı (HTTP ${response.status}); servis arızalı sayılmadı.`, latencyMs, path)];
    }

    const results: ProbeResult[] = [];
    const platformWarnings = [
      ...(Array.isArray(payload?.telemetryErrors) ? payload.telemetryErrors : []),
      ...(Array.isArray(payload?.breachedServices) ? payload.breachedServices.map((item: unknown) => `SLO: ${String(item)}`) : []),
      ...(Array.isArray(payload?.exhaustedErrorBudgets) ? payload.exhaustedErrorBudgets.map((item: unknown) => `Budget: ${String(item)}`) : []),
    ];

    results.push(platformWarnings.length
      ? degraded("platform-health", "Platform SLO / Circuit", `Platform izleme uyarıları: ${platformWarnings.slice(0, 5).join(" · ")}`, latencyMs, { httpStatus: response.status })
      : healthy("platform-health", "Platform SLO / Circuit", "Platform SLO ve circuit verileri okunabildi.", latencyMs, { httpStatus: response.status }));

    for (const dependency of payload.dependencies as Array<any>) {
      const name = String(dependency?.name || "unknown");
      const circuit = String(dependency?.circuit || "closed").toLowerCase();
      const key = `dependency-${slug(name)}`;
      const label = dependencyLabel(name);
      const metadata = {
        dependency: name,
        circuit,
        failures: Number(dependency?.failures || 0),
        samples: Number(dependency?.samples || 0),
        errorRate: Number(dependency?.errorRate || 0),
        p95Ms: dependency?.p95Ms ?? null,
      };
      if (circuit === "open") {
        results.push(verifiedFailure(key, label, `${label} circuit breaker açık; bağımlılık art arda başarısızlıklarla doğrulandı.`, latencyMs, metadata));
      } else if (circuit === "half_open") {
        results.push(degraded(key, label, `${label} toparlanma doğrulaması yapıyor; servis arızalı sayılmadı.`, latencyMs, metadata));
      } else {
        results.push(healthy(key, label, `${label} circuit breaker kapalı.`, latencyMs, metadata));
      }
    }
    return results;
  } catch (caught) {
    return [unverified("platform-health", "Platform SLO / Circuit", `Platform sağlık bağlantısı bu turda doğrulanamadı; servis arızalı sayılmadı: ${caught instanceof Error ? caught.message : "network error"}`, 0, path)];
  }
}

async function probeCommerceCore(baseUrl: string, secret: string): Promise<ProbeResult[]> {
  const path = "/api/commerce-core/health";
  try {
    const { response, payload, latencyMs } = await requestJson(baseUrl, secret, path, 12_000);
    const cores = Array.isArray(payload?.cores) ? payload.cores as Array<any> : [];
    if (!cores.length) {
      return [unverified("commerce-core", "Commerce Core", `Commerce Core bu turda doğrulanamadı (HTTP ${response.status}); çekirdekler arızalı sayılmadı.`, latencyMs, path)];
    }

    const results: ProbeResult[] = [];
    let warnings = 0;
    let confirmed = 0;
    for (const core of cores) {
      const coreName = String(core?.key || core?.title || "unknown");
      const key = `commerce-core-${slug(coreName)}`;
      const label = `Commerce Core · ${String(core?.title || coreName)}`;
      const status = String(core?.status || "healthy").toLowerCase();
      const detail = String(core?.detail || core?.description || `${label} kontrol edildi.`);
      if ((status === "failed" || status === "unhealthy") && (core?.confirmedFailure === true || core?.verified === true)) {
        confirmed += 1;
        results.push(verifiedFailure(key, label, detail, latencyMs, { core: coreName }));
      } else if (status === "failed" || status === "unhealthy" || status === "warning" || status === "degraded") {
        warnings += 1;
        results.push(degraded(key, label, detail, latencyMs, { core: coreName }));
      } else {
        results.push(healthy(key, label, detail, latencyMs, { core: coreName }));
      }
    }

    results.unshift(confirmed
      ? verifiedFailure("commerce-core", "Commerce Core", `${cores.length} çekirdek · ${confirmed} doğrulanmış hata · ${warnings} uyarı`, latencyMs, { engineCount: cores.length })
      : warnings
        ? degraded("commerce-core", "Commerce Core", `${cores.length} çekirdek · ${warnings} uyarı; doğrulanmış hata yok.`, latencyMs, { engineCount: cores.length })
        : healthy("commerce-core", "Commerce Core", `${cores.length} çekirdek sağlıklı.`, latencyMs, { engineCount: cores.length }));
    return results;
  } catch (caught) {
    return [unverified("commerce-core", "Commerce Core", `Commerce Core bağlantısı bu turda doğrulanamadı; çekirdekler arızalı sayılmadı: ${caught instanceof Error ? caught.message : "network error"}`, 0, path)];
  }
}

function shouldNotify(result: ProbeResult) {
  if (result.status !== "unhealthy" || result.metadata?.verifiedFailure !== true) return false;
  if (["health-outbox", "health-jobs", "health-instant-data", "health-panel-sync"].includes(result.key)) return false;
  // Individual core states remain visible in the panel, but notification fan-out is
  // suppressed. The verified aggregate `commerce-core` state emits one incident alert.
  if (result.key.startsWith("commerce-core-")) return false;
  return true;
}

async function persistBatch(supabase: any, rawResults: ProbeResult[], startedAt: number) {
  const nowIso = new Date().toISOString();
  const keys = [...new Set([...rawResults.map((item) => item.key), "service-health-monitor"])];
  const previousResult = await withTimeout<any>(
    supabase.from("panel_service_health_state").select("service_key,status,first_seen_at,last_alerted_at,recovered_at,metadata").in("service_key", keys),
    WRITE_TIMEOUT_MS,
    "health previous-state read",
  );
  if (previousResult.error) throw new Error(previousResult.error.message);

  const previousByKey = new Map<string, any>();
  for (const row of previousResult.data || []) previousByKey.set(String(row.service_key), row);

  const effectiveResults: ProbeResult[] = [];
  const stateRows: any[] = [];
  const alertRows: any[] = [];

  for (const raw of rawResults) {
    const previous = previousByKey.get(raw.key);
    const previousStatus = String(previous?.status || "healthy");
    const previousMetadata = (previous?.metadata || {}) as Record<string, any>;
    const candidateVerified = raw.status === "unhealthy" && raw.metadata?.verifiedFailure === true;
    const previousStreak = Number(previousMetadata.verifiedFailureStreak || 0);
    const verifiedFailureStreak = candidateVerified ? previousStreak + 1 : 0;
    const effectiveStatus: HealthStatus = candidateVerified && verifiedFailureStreak < REQUIRED_VERIFIED_STREAK
      ? "degraded"
      : raw.status;
    const effective: ProbeResult = {
      ...raw,
      status: effectiveStatus,
      detail: candidateVerified && effectiveStatus === "degraded"
        ? `${raw.detail} · ikinci doğrulama turu bekleniyor; henüz servis hatası sayılmadı.`
        : raw.detail,
      metadata: {
        ...(raw.metadata || {}),
        verifiedFailureStreak,
        verificationThreshold: REQUIRED_VERIFIED_STREAK,
      },
    };
    effectiveResults.push(effective);

    const enteringVerifiedFailure = effective.status === "unhealthy"
      && effective.metadata?.verifiedFailure === true
      && previousStatus !== "unhealthy";
    const recovered = effective.status === "healthy" && previousStatus !== "healthy";
    const firstSeenAt = effective.status === "healthy"
      ? nowIso
      : previousStatus === effective.status && previous?.first_seen_at
        ? String(previous.first_seen_at)
        : nowIso;
    const notify = enteringVerifiedFailure && shouldNotify(effective);

    stateRows.push({
      service_key: effective.key,
      status: effective.status,
      detail: effective.detail,
      first_seen_at: firstSeenAt,
      last_seen_at: nowIso,
      last_alerted_at: notify ? nowIso : previous?.last_alerted_at || null,
      recovered_at: recovered ? nowIso : previous?.recovered_at || null,
      metadata: {
        ...(effective.metadata || {}),
        label: effective.label,
        latencyMs: effective.latencyMs,
        monitoredBy: "service-health-monitor-v4.2",
      },
      updated_at: nowIso,
    });

    if (notify) {
      alertRows.push({
        kind: "health",
        dedupe_key: `service-health:v4.2:${effective.key}:${firstSeenAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
        payload: {
          service_key: effective.key,
          status: "unhealthy",
          title: `${effective.label} hatası`,
          body: effective.detail,
          verified: true,
          evidence: "two_consecutive_verified_checks",
        },
        target_url: "/system",
      });
    }
  }

  const verifiedUnhealthy = effectiveResults.filter((item) => item.status === "unhealthy" && item.metadata?.verifiedFailure === true);
  const degradedResults = effectiveResults.filter((item) => item.status === "degraded");
  const monitorStatus: HealthStatus = verifiedUnhealthy.length ? "unhealthy" : degradedResults.length ? "degraded" : "healthy";
  const previousMonitor = previousByKey.get("service-health-monitor");

  stateRows.push({
    service_key: "service-health-monitor",
    status: monitorStatus,
    detail: `${effectiveResults.length} kontrol · ${verifiedUnhealthy.length} doğrulanmış hata · ${degradedResults.length} uyarı/doğrulanamayan`,
    first_seen_at: monitorStatus === "healthy" ? nowIso : previousMonitor?.first_seen_at || nowIso,
    last_seen_at: nowIso,
    last_alerted_at: previousMonitor?.last_alerted_at || null,
    recovered_at: monitorStatus === "healthy" && previousMonitor?.status !== "healthy" ? nowIso : previousMonitor?.recovered_at || null,
    metadata: {
      monitoredServices: effectiveResults.length,
      unhealthy: verifiedUnhealthy.map((item) => item.key),
      degraded: degradedResults.map((item) => item.key),
      durationMs: Date.now() - startedAt,
      verifiedFailureOnly: true,
      monitorVersion: "4.2",
      transportFailuresNotify: false,
      verificationThreshold: REQUIRED_VERIFIED_STREAK,
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

  return { alertsQueued: alertRows.length, monitorStatus, effectiveResults };
}

export async function runServiceHealthMonitorV4(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const startedAt = Date.now();
  const baseUrl = internalBaseUrl(request);
  let secret = auth.internal ? String(auth.internalSecret || "") : "";
  if (!secret) {
    const config = await withTimeout<any>(
      auth.supabase.from("automation_cron_config").select("secret").eq("id", true).maybeSingle(),
      2_500,
      "health config read",
    );
    if (config.error || !config.data?.secret) return json({ ok: false, status: "degraded", confirmedFailure: false, error: "Servis izleyici secret bulunamadı." }, 200);
    secret = String(config.data.secret);
  }

  let rawResults: ProbeResult[];
  const transportStarted = Date.now();
  try {
    const transport = await requestJson(baseUrl, secret, "/api/health/live", 3_000);
    if (!transport.response.ok || transport.payload?.ok === false) {
      rawResults = [unverified("health-monitor-transport", "Servis İzleyici Bağlantısı", `Yerel monitor yolu doğrulanamadı (HTTP ${transport.response.status}); hiçbir alt servis arızalı sayılmadı.`, transport.latencyMs, "/api/health/live")];
    } else {
      const [readiness, aggregate, platform, core] = await Promise.all([
        probeReadiness(baseUrl, secret),
        probeAggregate(baseUrl, secret),
        probePlatform(baseUrl, secret),
        probeCommerceCore(baseUrl, secret),
      ]);
      rawResults = [readiness, ...aggregate, ...platform, ...core];
    }
  } catch (caught) {
    rawResults = [unverified("health-monitor-transport", "Servis İzleyici Bağlantısı", `Yerel monitor bağlantısı bu turda doğrulanamadı; hiçbir alt servis arızalı sayılmadı: ${caught instanceof Error ? caught.message : "network error"}`, Date.now() - transportStarted, "/api/health/live")];
  }

  let persistenceError: string | null = null;
  let alertsQueued = 0;
  let monitorStatus: HealthStatus = rawResults.some((item) => item.status === "degraded") ? "degraded" : "healthy";
  let effectiveResults = rawResults;

  try {
    const persisted = await persistBatch(auth.supabase, rawResults, startedAt);
    alertsQueued = persisted.alertsQueued;
    monitorStatus = persisted.monitorStatus;
    effectiveResults = persisted.effectiveResults;
  } catch (caught) {
    persistenceError = caught instanceof Error ? caught.message : "health persistence failed";
  }

  if (alertsQueued) void kickAdminPushWorker();

  const verifiedUnhealthy = effectiveResults.filter((item) => item.status === "unhealthy" && item.metadata?.verifiedFailure === true);
  const degradedResults = effectiveResults.filter((item) => item.status === "degraded");
  return json({
    ok: verifiedUnhealthy.length === 0 && !persistenceError,
    status: persistenceError ? "degraded" : monitorStatus,
    monitored: effectiveResults.length,
    verifiedUnhealthy: verifiedUnhealthy.length,
    degraded: degradedResults.length,
    alertsQueued,
    persistenceError,
    transportBase: baseUrl.startsWith("http://127.0.0.1:") ? "loopback" : "request-origin",
    monitorVersion: "4.2",
    issues: [...verifiedUnhealthy, ...degradedResults].map((item) => ({
      key: item.key,
      label: item.label,
      status: item.status,
      detail: item.detail,
      verified: item.metadata?.verifiedFailure === true && item.status === "unhealthy",
    })),
    completedAt: new Date().toISOString(),
  }, 200);
}
