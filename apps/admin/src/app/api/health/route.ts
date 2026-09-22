import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function count(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const startedAt = Date.now();
  const { supabase } = auth;

  const [
    outboxPending, outboxDead, jobsPending, jobsDead,
    readModels, pendingSync, latestRun, latestSnapshot, serviceMonitor,
  ] = await Promise.all([
    supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).in("status", ["pending","processing","failed"]),
    supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
    supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).in("status", ["queued","running","failed"]),
    supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
    supabase.from("panel_read_models").select("key,status,expires_at"),
    supabase.from("panel_sync_requests").select("id", { count: "exact", head: true }).in("status", ["pending","running"]),
    supabase.from("panel_sync_runs").select("status,refreshed_count,failed_count,started_at,completed_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("commerce_health_snapshots").select("status,checks,generated_at").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("panel_service_health_state").select("status,last_seen_at,metadata").eq("service_key","service-health-monitor").maybeSingle(),
  ]);

  const databaseError = [
    outboxPending.error, outboxDead.error, jobsPending.error, jobsDead.error,
    readModels.error, pendingSync.error, latestRun.error, latestSnapshot.error, serviceMonitor.error,
  ].find(Boolean);

  const now = Date.now();
  const readRows = readModels.data || [];
  const staleCount = readRows.filter((row: any) => {
    if (row.status === "stale") return true;
    const expires = row.expires_at ? new Date(row.expires_at).getTime() : Number.POSITIVE_INFINITY;
    return Number.isFinite(expires) && expires < now;
  }).length;
  const errorCount = readRows.filter((row: any) => row.status === "error").length;
  const monitorMeta = (serviceMonitor.data?.metadata || {}) as Record<string, unknown>;
  const monitorLastSeen = serviceMonitor.data?.last_seen_at ? String(serviceMonitor.data.last_seen_at) : null;
  const monitorAge = monitorLastSeen ? Math.max(0, now - new Date(monitorLastSeen).getTime()) : null;

  const checks = [
    {
      name: "database",
      status: databaseError ? "degraded" : "healthy",
      latencyMs: Date.now() - startedAt,
      detail: databaseError ? databaseError.message : "ROSTA Supabase veri katmanı erişilebilir.",
    },
    {
      name: "outbox",
      status: count(outboxDead.count) > 0 ? "degraded" : "healthy",
      pending: count(outboxPending.count),
      deadLetter: count(outboxDead.count),
      detail: count(outboxDead.count) > 0 ? "Dead-letter eventleri inceleme bekliyor." : "Outbox kuyruğu erişilebilir.",
    },
    {
      name: "jobs",
      status: count(jobsDead.count) > 0 ? "degraded" : "healthy",
      pending: count(jobsPending.count),
      deadLetter: count(jobsDead.count),
      detail: count(jobsDead.count) > 0 ? "Dead-letter işler inceleme bekliyor." : "Commerce job kuyruğu erişilebilir.",
    },
    {
      name: "instant-data",
      status: errorCount > 0 ? "degraded" : staleCount > 0 ? "degraded" : "healthy",
      total: readRows.length,
      stale: staleCount,
      errors: errorCount,
      detail: readRows.length ? "Panel hazır veri kayıtları kontrol edildi." : "Hazır veri kaydı henüz üretilmedi.",
    },
    {
      name: "panel-sync",
      status: latestRun.data?.status === "failed" ? "degraded" : "healthy",
      pending: count(pendingSync.count),
      refreshed: count(latestRun.data?.refreshed_count),
      failed: count(latestRun.data?.failed_count),
      lastRunAt: latestRun.data?.completed_at || latestRun.data?.started_at || null,
      detail: latestRun.data ? "Panel sync çalışma geçmişi erişilebilir." : "Panel sync henüz çalıştırılmadı.",
    },
    {
      name: "service-monitor",
      status: String(serviceMonitor.data?.status || "healthy"),
      monitored: count(monitorMeta.monitoredServices),
      observedUnhealthy: Array.isArray(monitorMeta.unhealthy) ? monitorMeta.unhealthy.length : 0,
      observedDegraded: Array.isArray(monitorMeta.degraded) ? monitorMeta.degraded.length : 0,
      detail: serviceMonitor.data ? "Servis izleyici durumu erişilebilir." : "Servis izleyicinin ilk sonucu bekleniyor.",
    },
  ];

  const degraded = checks.some((item) => item.status === "degraded" || item.status === "unhealthy");
  return NextResponse.json({
    ok: true,
    status: degraded ? "degraded" : "healthy",
    checks,
    latestSnapshot: latestSnapshot.data || null,
    instantData: {
      readModelCount: readRows.length,
      staleCount,
      errorCount,
      pendingSync: count(pendingSync.count),
      latestRun: latestRun.data || null,
    },
    serviceMonitor: {
      status: serviceMonitor.data?.status || "unknown",
      lastSeenAt: monitorLastSeen,
      ageMs: monitorAge,
      monitoredServices: count(monitorMeta.monitoredServices),
      observedUnhealthy: Array.isArray(monitorMeta.unhealthy) ? monitorMeta.unhealthy.length : 0,
      observedDegraded: Array.isArray(monitorMeta.degraded) ? monitorMeta.degraded.length : 0,
    },
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
