import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { kickAdminPushWorker } from "@/lib/pushWorker";
import {
  PANEL_SYNC_BY_ROUTE,
  PANEL_SYNC_TARGETS,
  defaultDynamicTarget,
  normalizePanelRoute,
  panelSnapshotEligible,
  type PanelSyncTarget,
} from "@/lib/panelSyncRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONCURRENCY = 5;
const MAX_TARGETS_PER_RUN = 45;
const DEGRADED_ALERT_GRACE_MS = 2 * 60_000;
const ALERT_REPEAT_MS = 30 * 60_000;
const WORKER_LEASE_SECONDS = 75;

type ExistingModel = {
  key: string;
  route_path: string;
  scope: string;
  revision: number | null;
  refreshed_at: string | null;
  expires_at: string | null;
  status: string | null;
  metadata?: Record<string, any> | null;
};

type TargetResult = {
  target: PanelSyncTarget;
  ok: boolean;
  durationMs: number;
  error?: string;
};

type HealthOptions = {
  notify?: boolean;
  degradedGraceMs?: number;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function readableError(value: unknown, fallback: string) {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    try {
      const text = JSON.stringify(value);
      if (text && text !== "{}") return text;
    } catch {}
  }
  return fallback;
}

async function mapLimit<T, R>(values: T[], limit: number, fn: (value: T) => Promise<R>) {
  const output = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await fn(values[index]);
    }
  }));
  return output;
}

function due(target: PanelSyncTarget, model: ExistingModel | undefined, requestedScopes: Set<string>, now: number) {
  if (!model?.refreshed_at) return true;
  if (requestedScopes.has("general") || requestedScopes.has(target.scope)) return true;
  const refreshed = new Date(model.refreshed_at).getTime();
  return !Number.isFinite(refreshed) || now - refreshed >= target.intervalMs;
}

async function fetchTarget(baseUrl: string, secret: string, target: PanelSyncTarget) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), target.scope === "meta" ? 45_000 : 20_000);
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}${target.route}`, {
      method: "GET",
      headers: {
        "x-rosta-internal-secret": secret,
        "x-ruth-cache-bypass": "1",
        "x-rosta-panel-sync": "1",
        "user-agent": "rosta-panel-sync/2.0",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(readableError(payload?.error, `${target.route} ${response.status} yanıtı verdi.`));
    }
    return { payload, durationMs: Date.now() - started };
  } finally {
    clearTimeout(timeout);
  }
}

async function setHealthState(
  supabase: any,
  key: string,
  status: "healthy" | "degraded" | "unhealthy",
  detail: string,
  metadata: Record<string, unknown> = {},
  options: HealthOptions = {},
) {
  const now = new Date();
  const nowMs = now.getTime();
  const notify = options.notify !== false;
  const degradedGraceMs = options.degradedGraceMs ?? DEGRADED_ALERT_GRACE_MS;
  const { data: previous } = await supabase
    .from("panel_service_health_state")
    .select("status,last_alerted_at,first_seen_at,recovered_at")
    .eq("service_key", key)
    .maybeSingle();

  const previousStatus = String(previous?.status || "");
  const wasProblem = Boolean(previousStatus && previousStatus !== "healthy");
  const isProblem = status !== "healthy";
  const statusChanged = previousStatus !== status;
  const firstSeenAt = statusChanged ? now.toISOString() : previous?.first_seen_at || now.toISOString();
  const firstSeenMs = new Date(firstSeenAt).getTime();
  const lastAlertedMs = previous?.last_alerted_at ? new Date(previous.last_alerted_at).getTime() : 0;
  const alertedThisIncident = Boolean(lastAlertedMs && Number.isFinite(firstSeenMs) && lastAlertedMs >= firstSeenMs);
  const repeatDue = !lastAlertedMs || nowMs - lastAlertedMs >= ALERT_REPEAT_MS;
  const problemAgeMs = Number.isFinite(firstSeenMs) ? Math.max(0, nowMs - firstSeenMs) : 0;

  const shouldAlertUnhealthy = status === "unhealthy" && (!alertedThisIncident || repeatDue);
  const shouldAlertDegraded = status === "degraded"
    && previousStatus === "degraded"
    && problemAgeMs >= degradedGraceMs
    && (!alertedThisIncident || repeatDue);
  const shouldAlert = notify && isProblem && (shouldAlertUnhealthy || shouldAlertDegraded);

  await supabase.from("panel_service_health_state").upsert({
    service_key: key,
    status,
    detail,
    first_seen_at: firstSeenAt,
    last_seen_at: now.toISOString(),
    last_alerted_at: shouldAlert ? now.toISOString() : previous?.last_alerted_at || null,
    recovered_at: !isProblem && wasProblem ? now.toISOString() : previous?.recovered_at || null,
    metadata: {
      ...metadata,
      problemAgeMs: isProblem ? problemAgeMs : 0,
      alertPolicy: status === "degraded" ? `persistent_${Math.round(degradedGraceMs / 1000)}s` : "unhealthy_immediate",
    },
    updated_at: now.toISOString(),
  }, { onConflict: "service_key" });

  if (shouldAlert) {
    const bucket = Math.floor(nowMs / ALERT_REPEAT_MS);
    await supabase.from("admin_push_jobs").insert({
      kind: "health",
      dedupe_key: `health:${key}:${status}:${bucket}`,
      payload: {
        service_key: key,
        status,
        title: status === "unhealthy" ? "Ruth Panel servis hatası" : "Ruth Panel servis uyarısı",
        body: detail,
      },
      target_url: "/system",
    }).then(() => undefined, () => undefined);
  }
  return shouldAlert;
}

async function inspectCoreHealth(baseUrl: string, secret: string) {
  try {
    const response = await fetch(`${baseUrl}/api/commerce-core/health`, {
      headers: { "x-rosta-internal-secret": secret, "x-ruth-cache-bypass": "1", "user-agent": "rosta-panel-sync/2.0" },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    return Array.isArray(payload?.cores) ? payload.cores : [];
  } catch {
    return [];
  }
}

async function run(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const supabase = auth.supabase;
  const workerId = `panel-sync:${crypto.randomUUID()}`;
  const now = Date.now();
  const startedAt = new Date(now).toISOString();

  const { data: config, error: configError } = await supabase
    .from("automation_cron_config")
    .select("admin_base_url,secret")
    .eq("id", true)
    .maybeSingle();
  if (configError || !config?.admin_base_url || !config?.secret) {
    return json({ ok: false, error: configError?.message || "Panel sync yapılandırması bulunamadı." }, 503);
  }
  const baseUrl = String(config.admin_base_url).replace(/\/$/, "");
  const secret = String(config.secret);

  const { data: leaseClaimed, error: leaseError } = await supabase.rpc("claim_panel_sync_lease", {
    p_worker_id: workerId,
    p_lease_seconds: WORKER_LEASE_SECONDS,
  });
  if (leaseError) {
    return json({ ok: false, error: `Panel sync lease alınamadı: ${leaseError.message}` }, 503);
  }
  if (!leaseClaimed) {
    return json({
      ok: true,
      status: "busy",
      skipped: true,
      workerId,
      detail: "Başka bir backend sync worker aktif; bu tetik güvenli şekilde atlandı.",
      completedAt: new Date().toISOString(),
    });
  }

  try {
    const [{ data: requests }, { data: models }] = await Promise.all([
      supabase.from("panel_sync_requests").select("id,scope,reason,status,attempts").eq("status", "pending").order("requested_at", { ascending: true }).limit(120),
      supabase.from("panel_read_models").select("key,route_path,scope,revision,refreshed_at,expires_at,status,metadata").limit(250),
    ]);

    const requestRows = requests || [];
    const requestIds = requestRows.map((row: any) => row.id);
    if (requestIds.length) {
      await supabase.from("panel_sync_requests").update({ status: "running", started_at: startedAt }).in("id", requestIds);
    }
    const requestedScopes = new Set<string>(requestRows.map((row: any) => String(row.scope || "general")));

    const modelByRoute = new Map<string, ExistingModel>();
    for (const row of (models || []) as ExistingModel[]) modelByRoute.set(normalizePanelRoute(row.route_path), row);

    const targetMap = new Map<string, PanelSyncTarget>();
    for (const target of PANEL_SYNC_TARGETS) targetMap.set(normalizePanelRoute(target.route), target);
    for (const row of (models || []) as ExistingModel[]) {
      const route = normalizePanelRoute(row.route_path);
      if (!panelSnapshotEligible(route) || targetMap.has(route)) continue;
      const dynamic = defaultDynamicTarget(route);
      const metadata = row.metadata || {};
      targetMap.set(route, {
        ...dynamic,
        scope: row.scope || dynamic.scope,
        intervalMs: Number(metadata.intervalMs || dynamic.intervalMs),
        maxAgeMs: Number(metadata.maxAgeMs || dynamic.maxAgeMs),
        priority: Number(metadata.priority || dynamic.priority),
      });
    }

    const selected = [...targetMap.values()]
      .filter((target) => due(target, modelByRoute.get(normalizePanelRoute(target.route)), requestedScopes, now))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, MAX_TARGETS_PER_RUN);

    const { data: runRow } = await supabase.from("panel_sync_runs").insert({
      worker_id: workerId,
      status: "running",
      requested_scopes: [...requestedScopes],
      started_at: startedAt,
    }).select("id").single();

    const results = await mapLimit(selected, CONCURRENCY, async (target): Promise<TargetResult> => {
      const route = normalizePanelRoute(target.route);
      const existing = modelByRoute.get(route);
      try {
        const fetched = await fetchTarget(baseUrl, secret, { ...target, route });
        const refreshedAt = new Date().toISOString();
        const expiresAt = new Date(Date.now() + target.maxAgeMs).toISOString();
        const revision = Number(existing?.revision || 0) + 1;
        const key = existing?.key || PANEL_SYNC_BY_ROUTE.get(route)?.key || target.key;
        const { error } = await supabase.from("panel_read_models").upsert({
          key,
          route_path: route,
          scope: target.scope,
          payload: fetched.payload,
          status: "healthy",
          revision,
          refreshed_at: refreshedAt,
          expires_at: expiresAt,
          duration_ms: fetched.durationMs,
          last_error: null,
          metadata: {
            intervalMs: target.intervalMs,
            maxAgeMs: target.maxAgeMs,
            priority: target.priority,
            workerId,
          },
          updated_at: refreshedAt,
        }, { onConflict: "key" });
        if (error) throw new Error(error.message);
        return { target, ok: true, durationMs: fetched.durationMs };
      } catch (caught) {
        const error = readableError(caught, "Snapshot yenilenemedi.");
        const durationMs = 0;
        if (existing) {
          const refreshed = new Date(existing.refreshed_at || 0).getTime();
          const expired = !Number.isFinite(refreshed) || Date.now() - refreshed > target.maxAgeMs;
          await supabase.from("panel_read_models").update({
            status: expired ? "error" : "stale",
            last_error: error,
            updated_at: new Date().toISOString(),
          }).eq("key", existing.key);
        }
        return { target, ok: false, durationMs, error };
      }
    });

    const failed = results.filter((item) => !item.ok);
    const completedAt = new Date().toISOString();

    for (const requestRow of requestRows as any[]) {
      const scopeFailures = failed.filter((item) => requestRow.scope === "general" || item.target.scope === requestRow.scope);
      await supabase.from("panel_sync_requests").update({
        status: scopeFailures.length ? "failed" : "done",
        attempts: Number(requestRow.attempts || 0) + 1,
        completed_at: completedAt,
        last_error: scopeFailures.length ? scopeFailures.slice(0, 3).map((item) => item.error).join(" | ") : null,
      }).eq("id", requestRow.id);
    }

    const { data: freshnessRows } = await supabase
      .from("panel_read_models")
      .select("status,expires_at,last_error")
      .limit(300);
    const staleCount = (freshnessRows || []).filter((row: any) => row.status !== "healthy" || (row.expires_at && new Date(row.expires_at).getTime() < Date.now())).length;
    const errorCount = (freshnessRows || []).filter((row: any) => row.status === "error").length;

    const [{ count: outboxPending }, { count: outboxDead }, { count: jobsPending }, { count: jobsDead }] = await Promise.all([
      supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).in("status", ["pending", "processing", "failed"]),
      supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
      supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running", "failed"]),
      supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
    ]);

    let alertQueued = false;
    alertQueued = (await setHealthState(
      supabase,
      "instant-data",
      errorCount > 5 ? "unhealthy" : staleCount > 0 || failed.length > 0 ? "degraded" : "healthy",
      errorCount > 5
        ? `${errorCount} read-model hata durumunda.`
        : staleCount > 0 || failed.length > 0
          ? `${staleCount} snapshot eski, bu turda ${failed.length} yenileme başarısız.`
          : `${freshnessRows?.length || 0} read-model güncel ve hazır.`,
      { staleCount, errorCount, failedTargets: failed.length },
      { notify: errorCount > 5 },
    )) || alertQueued;

    alertQueued = (await setHealthState(
      supabase,
      "event-outbox",
      Number(outboxDead || 0) > 0 ? "unhealthy" : Number(outboxPending || 0) > 500 ? "degraded" : "healthy",
      `Outbox bekleyen ${Number(outboxPending || 0)}, dead-letter ${Number(outboxDead || 0)}.`,
      { pending: Number(outboxPending || 0), deadLetter: Number(outboxDead || 0) },
    )) || alertQueued;

    alertQueued = (await setHealthState(
      supabase,
      "job-queue",
      Number(jobsDead || 0) > 0 ? "unhealthy" : Number(jobsPending || 0) > 100 ? "degraded" : "healthy",
      `Kuyrukta ${Number(jobsPending || 0)} iş, dead-letter ${Number(jobsDead || 0)}.`,
      { pending: Number(jobsPending || 0), deadLetter: Number(jobsDead || 0) },
    )) || alertQueued;

    const processedScopes = new Set(results.map((item) => item.target.scope));
    for (const scope of processedScopes) {
      const scopeFailures = failed.filter((item) => item.target.scope === scope);
      alertQueued = (await setHealthState(
        supabase,
        `sync-${scope}`,
        scopeFailures.length >= 3 ? "unhealthy" : scopeFailures.length ? "degraded" : "healthy",
        scopeFailures.length ? `${scope} senkronunda ${scopeFailures.length} veri kaynağı yenilenemedi.` : `${scope} senkronu güncel.`,
        { failures: scopeFailures.map((item) => ({ route: item.target.route, error: item.error })) },
      )) || alertQueued;
    }

    const cores = await inspectCoreHealth(baseUrl, secret);
    if (!cores.length) {
      alertQueued = (await setHealthState(supabase, "commerce-core-monitor", "degraded", "Commerce Core sağlık raporu alınamadı.")) || alertQueued;
    } else {
      await setHealthState(supabase, "commerce-core-monitor", "healthy", `${cores.length} Commerce Core çekirdeği kontrol edildi.`);
      for (const core of cores) {
        const state = core.status === "failed" ? "unhealthy" : core.status === "warning" ? "degraded" : "healthy";
        alertQueued = (await setHealthState(
          supabase,
          `core-${core.key}`,
          state,
          `${core.title || core.key}: ${core.detail || core.description || core.status}`,
          { core: core.key, status: core.status },
        )) || alertQueued;
      }
    }

    const runStatus = failed.length >= Math.max(3, Math.ceil(results.length / 3)) ? "failed" : failed.length ? "degraded" : "healthy";
    if (runRow?.id) {
      await supabase.from("panel_sync_runs").update({
        status: runStatus,
        refreshed_count: results.length - failed.length,
        failed_count: failed.length,
        details: {
          selected: results.length,
          failed: failed.map((item) => ({ route: item.target.route, scope: item.target.scope, error: item.error })),
          staleCount,
          errorCount,
        },
        completed_at: completedAt,
      }).eq("id", runRow.id);
    }

    const workerAlert = await setHealthState(
      supabase,
      "panel-sync-worker",
      runStatus === "failed" ? "unhealthy" : runStatus === "degraded" ? "degraded" : "healthy",
      `Son tur: ${results.length - failed.length} başarılı, ${failed.length} başarısız.`,
      { workerId, startedAt, completedAt, selected: results.length },
      { notify: runStatus === "failed" && !alertQueued },
    );
    alertQueued = workerAlert || alertQueued;

    if (alertQueued) void kickAdminPushWorker();

    return json({
      ok: runStatus !== "failed",
      workerId,
      status: runStatus,
      refreshed: results.length - failed.length,
      failed: failed.length,
      selected: results.length,
      requestedScopes: [...requestedScopes],
      staleCount,
      errorCount,
      alertsQueued: alertQueued,
      failures: failed.slice(0, 10).map((item) => ({ route: item.target.route, scope: item.target.scope, error: item.error })),
      completedAt,
    }, runStatus === "failed" ? 207 : 200);
  } finally {
    try {
      await supabase.rpc("release_panel_sync_lease", { p_worker_id: workerId });
    } catch {}
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
