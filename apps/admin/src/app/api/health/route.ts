import { NextResponse } from "next/server";
import { panelSnapshotEligible } from "@/lib/panelSyncRegistry";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TRANSIENT_GRACE_MS = 90_000;
const MONITOR_STALE_MS = 3 * 60_000;

async function diagnostics() {
  const supabase = getSupabaseAdmin();
  const startedAt = Date.now();
  const [
    database,
    outboxPending,
    outboxDead,
    jobsPending,
    jobsDead,
    latestSnapshot,
    readModels,
    activeSync,
    latestSyncRun,
    serviceMonitor,
    paymentFinalization,
    selfHeal,
  ] = await Promise.all([
    supabase.from("orders").select("id", { count: "exact", head: true }).limit(1),
    supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).in("status", ["pending", "processing", "failed"]),
    supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
    supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running", "failed"]),
    supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
    supabase.from("commerce_health_snapshots").select("status, checks, generated_at").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("panel_read_models").select("route_path,status,last_error"),
    supabase.from("panel_sync_requests").select("id,status,requested_at,started_at").in("status", ["pending", "running"]).limit(250),
    supabase.from("panel_sync_runs")
      .select("id,worker_id,status,refreshed_count,failed_count,details,started_at,completed_at")
      .in("status", ["healthy", "degraded", "failed"])
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("panel_service_health_state")
      .select("status,detail,last_seen_at,metadata")
      .eq("service_key", "service-health-monitor")
      .maybeSingle(),
    supabase.from("panel_service_health_state")
      .select("status,detail,last_seen_at,metadata")
      .eq("service_key", "payment-order-finalization")
      .maybeSingle(),
    supabase.from("panel_service_health_state")
      .select("status,detail,last_seen_at,metadata")
      .eq("service_key", "self-heal-supervisor")
      .maybeSingle(),
  ]);

  const now = Date.now();
  const lastSyncAt = latestSyncRun.data?.completed_at || latestSyncRun.data?.started_at || null;
  const lastSyncAgeMs = lastSyncAt ? now - new Date(lastSyncAt).getTime() : Number.POSITIVE_INFINITY;
  const modelRows = (readModels.data || []).filter((row: any) => panelSnapshotEligible(String(row?.route_path || "")));
  const readModelCount = modelRows.length;

  // Read models are event-driven. Time passing does not make a snapshot wrong if
  // its source data did not change. Only an explicit failed event refresh marks a
  // currently-owned row stale/error. Volatile/live-only routes never affect health.
  const modelErrors = modelRows.filter((row: any) => row.status === "error").length;
  const staleCount = modelRows.filter((row: any) => row.status === "stale").length;
  const unresolvedReadModelCount = modelErrors + staleCount;

  const activeRows = activeSync.data || [];
  const activeSyncCount = activeRows.length;
  const delayedSyncCount = activeRows.filter((row: any) => {
    const since = row.status === "running"
      ? new Date(row.started_at || row.requested_at || 0).getTime()
      : new Date(row.requested_at || 0).getTime();
    return !Number.isFinite(since) || now - since > TRANSIENT_GRACE_MS;
  }).length;
  const syncRunStatus = String(latestSyncRun.data?.status || "missing");
  const unresolvedFailedRun = syncRunStatus === "failed"
    && (unresolvedReadModelCount > 0 || delayedSyncCount > 0 || activeSyncCount > 0);

  const monitorLastSeenAt = serviceMonitor.data?.last_seen_at || null;
  const monitorAgeMs = monitorLastSeenAt ? now - new Date(monitorLastSeenAt).getTime() : Number.POSITIVE_INFINITY;
  const monitorMetadata = (serviceMonitor.data?.metadata || {}) as Record<string, any>;
  const monitorOperationalStatus = serviceMonitor.error || !monitorLastSeenAt || monitorAgeMs > MONITOR_STALE_MS
    ? "degraded"
    : "healthy";

  const paymentFinalizationStatus = paymentFinalization.error
    ? "degraded"
    : String(paymentFinalization.data?.status || "healthy");
  const paymentFinalizationMetadata = (paymentFinalization.data?.metadata || {}) as Record<string, any>;
  const paymentFinalizationVerified = paymentFinalizationMetadata.verifiedPaymentFinalizationWatch === true;

  const selfHealLastSeenAt = selfHeal.data?.last_seen_at || null;
  const selfHealAgeMs = selfHealLastSeenAt ? now - new Date(selfHealLastSeenAt).getTime() : Number.POSITIVE_INFINITY;
  const selfHealMetadata = (selfHeal.data?.metadata || {}) as Record<string, any>;
  const selfHealStatus = selfHeal.error || !selfHealLastSeenAt || selfHealAgeMs > MONITOR_STALE_MS
    ? "degraded"
    : String(selfHeal.data?.status || "healthy");

  const checks = [
    {
      name: "database",
      status: database.error ? "degraded" : "healthy",
      confirmedFailure: false,
      latencyMs: Date.now() - startedAt,
      detail: database.error?.message || "Supabase query succeeded.",
    },
    {
      name: "outbox",
      status: outboxPending.error || outboxDead.error || Number(outboxDead.count || 0) > 0 ? "degraded" : "healthy",
      confirmedFailure: false,
      pending: Number(outboxPending.count || 0),
      deadLetter: Number(outboxDead.count || 0),
      detail: outboxPending.error?.message || outboxDead.error?.message || null,
    },
    {
      name: "jobs",
      status: jobsPending.error || jobsDead.error || Number(jobsDead.count || 0) > 0 ? "degraded" : "healthy",
      confirmedFailure: false,
      pending: Number(jobsPending.count || 0),
      deadLetter: Number(jobsDead.count || 0),
      detail: jobsPending.error?.message || jobsDead.error?.message || null,
    },
    {
      name: "payment-finalization",
      status: paymentFinalizationStatus,
      confirmedFailure: paymentFinalizationStatus === "unhealthy" && paymentFinalizationVerified,
      pending: Number(paymentFinalizationMetadata.pendingPaidDrafts || 0),
      lastRunAt: paymentFinalization.data?.last_seen_at || null,
      detail: paymentFinalization.error?.message
        || paymentFinalization.data?.detail
        || "Ödeme → sipariş finalizasyon watchdog ilk turunu bekliyor.",
    },
    {
      name: "instant-data",
      status: readModels.error || modelErrors > 0 || staleCount > 0 || readModelCount === 0 ? "degraded" : "healthy",
      confirmedFailure: false,
      total: readModelCount,
      stale: staleCount,
      refreshing: activeSyncCount,
      errors: modelErrors,
      detail: readModels.error?.message || `${readModelCount} hazır veri seti · ${staleCount} event-refresh gecikmiş · ${modelErrors} hata`,
    },
    {
      name: "panel-sync",
      status: latestSyncRun.error || activeSync.error || delayedSyncCount > 0 || unresolvedFailedRun
        ? "degraded"
        : "healthy",
      confirmedFailure: false,
      pending: delayedSyncCount,
      active: activeSyncCount,
      lastRunAt: lastSyncAt,
      lastRunAgeMs: Number.isFinite(lastSyncAgeMs) ? lastSyncAgeMs : null,
      refreshed: Number(latestSyncRun.data?.refreshed_count || 0),
      failed: unresolvedFailedRun ? Number(latestSyncRun.data?.failed_count || 0) : 0,
      detail: latestSyncRun.error?.message || activeSync.error?.message || (delayedSyncCount > 0
        ? `${delayedSyncCount} backend sync isteği gecikmiş durumda.`
        : unresolvedFailedRun
          ? `Son backend sync turunda ${Number(latestSyncRun.data?.failed_count || 0)} kaynak başarısız; ${unresolvedReadModelCount} read-model hâlâ repair bekliyor.`
          : activeSyncCount > 0
            ? `${activeSyncCount} backend sync isteği şu an işleniyor.`
            : lastSyncAt
              ? `Event-driven backend sync hazır · son çalışma ${Math.max(0, Math.round(lastSyncAgeMs / 1000))} sn önce.`
              : "Event-driven backend sync hazır; ilk veri değişikliği bekleniyor."),
    },
    {
      name: "self-heal",
      status: selfHealStatus,
      confirmedFailure: false,
      lastRunAt: selfHealLastSeenAt,
      lastRunAgeMs: Number.isFinite(selfHealAgeMs) ? selfHealAgeMs : null,
      repaired: Number(selfHealMetadata.autoRepairs || 0),
      pending: Number(selfHealMetadata.manualAttention || 0),
      detail: selfHeal.error?.message
        || selfHeal.data?.detail
        || "Global self-heal supervisor ilk turunu bekliyor.",
    },
    {
      name: "service-monitor",
      status: monitorOperationalStatus,
      confirmedFailure: false,
      lastRunAt: monitorLastSeenAt,
      lastRunAgeMs: Number.isFinite(monitorAgeMs) ? monitorAgeMs : null,
      monitored: Number(monitorMetadata.monitoredServices || 0),
      observedUnhealthy: Array.isArray(monitorMetadata.unhealthy) ? monitorMetadata.unhealthy.length : 0,
      observedDegraded: Array.isArray(monitorMetadata.degraded) ? monitorMetadata.degraded.length : 0,
      detail: serviceMonitor.error?.message || (monitorLastSeenAt
        ? `PWA servis izleyici ${Math.max(0, Math.round(monitorAgeMs / 1000))} sn önce kontrol yaptı · ${Number(monitorMetadata.monitoredServices || 0)} servis izleniyor.`
        : "PWA servis izleyici ilk heartbeat'i bekleniyor."),
    },
  ];

  const status = checks.some((check) => check.status !== "healthy") ? "degraded" : "healthy";

  return {
    status,
    checks,
    latestSnapshot: latestSnapshot.error ? null : latestSnapshot.data,
    instantData: {
      readModelCount,
      staleCount,
      refreshingCount: activeSyncCount,
      errorCount: modelErrors,
      pendingSync: delayedSyncCount,
      activeSync: activeSyncCount,
      latestRun: latestSyncRun.error ? null : latestSyncRun.data,
    },
    selfHeal: {
      status: selfHealStatus,
      lastSeenAt: selfHealLastSeenAt,
      ageMs: Number.isFinite(selfHealAgeMs) ? selfHealAgeMs : null,
      autoRepairs: Number(selfHealMetadata.autoRepairs || 0),
      manualAttention: Number(selfHealMetadata.manualAttention || 0),
    },
    serviceMonitor: {
      status: monitorOperationalStatus,
      lastSeenAt: monitorLastSeenAt,
      ageMs: Number.isFinite(monitorAgeMs) ? monitorAgeMs : null,
      monitoredServices: Number(monitorMetadata.monitoredServices || 0),
      observedUnhealthy: Array.isArray(monitorMetadata.unhealthy) ? monitorMetadata.unhealthy.length : 0,
      observedDegraded: Array.isArray(monitorMetadata.degraded) ? monitorMetadata.degraded.length : 0,
    },
  };
}

export async function GET() {
  try {
    const result = await diagnostics();
    return NextResponse.json({
      ok: true,
      service: "ruth-admin-panel",
      status: result.status,
      checks: result.checks,
      latestSnapshot: result.latestSnapshot,
      instantData: result.instantData,
      selfHeal: result.selfHeal,
      serviceMonitor: result.serviceMonitor,
      timestamp: new Date().toISOString(),
    }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      service: "ruth-admin-panel",
      status: "degraded",
      confirmedFailure: false,
      error: error instanceof Error ? error.message : "Health check could not be verified.",
      timestamp: new Date().toISOString(),
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}

export async function HEAD() {
  try {
    await diagnostics();
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 200 });
  }
}
