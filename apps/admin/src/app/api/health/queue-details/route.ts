import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 60;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const kind = new URL(request.url).searchParams.get("kind") || "outbox-pending";

  if (kind === "instant-data") {
    const { data, error } = await auth.supabase
      .from("panel_read_models")
      .select("key,route_path,scope,status,revision,refreshed_at,expires_at,duration_ms,last_error,metadata")
      .order("refreshed_at", { ascending: true })
      .limit(180);
    if (error) return json({ ok: false, error: error.message }, 400);

    const now = Date.now();
    const rows = (data || []).filter((item: any) => {
      const expiresAt = item.expires_at ? new Date(item.expires_at).getTime() : Number.POSITIVE_INFINITY;
      return item.status !== "healthy" || (Number.isFinite(expiresAt) && expiresAt < now);
    }).map((item: any) => {
      const expiresAt = item.expires_at ? new Date(item.expires_at).getTime() : Number.POSITIVE_INFINITY;
      const expired = Number.isFinite(expiresAt) && expiresAt < now;
      return {
        id: item.key,
        scope: item.scope || "read-model",
        reason: item.route_path,
        status: item.status === "error" ? "failed" : "pending",
        attempts: 0,
        requested_at: item.refreshed_at,
        completed_at: item.refreshed_at,
        last_error: item.last_error || (expired ? `Snapshot süresi ${Math.max(1, Math.round((now - expiresAt) / 1000))} sn önce doldu.` : "Snapshot yenilenmeyi bekliyor."),
        metadata: {
          route: item.route_path,
          revision: item.revision,
          refreshedAt: item.refreshed_at,
          expiresAt: item.expires_at,
          durationMs: item.duration_ms,
          ...(item.metadata || {}),
        },
      };
    });

    return json({
      ok: true,
      kind,
      title: "Eski / hatalı hazır veriler",
      description: "Servis Sağlığı uyarısına neden olan read-model snapshotları. Route, son güncelleme ve hata nedeni burada görünür.",
      items: rows,
    });
  }

  if (kind === "outbox-pending" || kind === "outbox-dead") {
    let query = auth.supabase
      .from("commerce_outbox")
      .select("id,event_id,event_type,aggregate_type,aggregate_id,status,attempts,max_attempts,available_at,published_at,last_error,correlation_id,created_at,updated_at,payload")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    query = kind === "outbox-dead"
      ? query.eq("status", "dead_letter")
      : query.in("status", ["pending", "processing", "failed"]);
    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);
    return json({
      ok: true,
      kind,
      title: kind === "outbox-dead" ? "Outbox dead-letter" : "Outbox bekleyen olaylar",
      description: kind === "outbox-dead"
        ? "Maksimum yeniden deneme sınırına ulaşıp otomatik akıştan çıkan domain eventleri."
        : "Commerce Core tarafından üretilmiş, worker tarafından yayınlanmayı veya yeniden denenmeyi bekleyen domain eventleri.",
      items: data || [],
    });
  }

  if (kind === "jobs-pending" || kind === "jobs-dead") {
    let query = auth.supabase
      .from("commerce_jobs")
      .select("id,queue,job_type,status,priority,attempts,max_attempts,run_at,locked_at,locked_by,completed_at,last_error,correlation_id,created_at,updated_at,payload")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    query = kind === "jobs-dead"
      ? query.eq("status", "dead_letter")
      : query.in("status", ["queued", "running", "failed"]);
    const { data, error } = await query;
    if (error) return json({ ok: false, error: error.message }, 400);
    return json({
      ok: true,
      kind,
      title: kind === "jobs-dead" ? "Job dead-letter" : "Kuyruktaki işler",
      description: kind === "jobs-dead"
        ? "Tekrar deneme sınırına ulaşıp manuel inceleme gerektiren arka plan görevleri."
        : "Worker tarafından çalıştırılmayı, tamamlanmayı veya yeniden denenmeyi bekleyen arka plan görevleri.",
      items: data || [],
    });
  }

  if (kind === "panel-sync") {
    const [{ data: requests, error: requestError }, { data: runs, error: runError }] = await Promise.all([
      auth.supabase
        .from("panel_sync_requests")
        .select("id,scope,reason,status,attempts,requested_at,started_at,completed_at,last_error,metadata")
        .order("requested_at", { ascending: false })
        .limit(LIMIT),
      auth.supabase
        .from("panel_sync_runs")
        .select("id,worker_id,status,requested_scopes,refreshed_count,failed_count,details,started_at,completed_at")
        .order("started_at", { ascending: false })
        .limit(40),
    ]);
    if (requestError || runError) return json({ ok: false, error: requestError?.message || runError?.message }, 400);

    const requestRows = requests || [];
    const runRows = runs || [];
    const activeRequests = requestRows.filter((row: any) => row.status === "pending" || row.status === "running");
    const requestHistory = requestRows.filter((row: any) => row.status !== "pending" && row.status !== "running");

    const runningRuns = runRows.filter((row: any) => row.status === "running");
    const latestCompleted = runRows.find((row: any) => row.status !== "running") || null;
    const visibleRuns = [
      ...runningRuns,
      ...(latestCompleted ? [latestCompleted] : []),
    ].filter((row: any, index: number, rows: any[]) => rows.findIndex((other: any) => other.id === row.id) === index);
    const runHistory = runRows.filter((row: any) => !visibleRuns.some((visible: any) => visible.id === row.id));
    const historicalFailures = runHistory.filter((row: any) => row.status === "degraded" || row.status === "failed" || Number(row.failed_count || 0) > 0);

    const latestState = latestCompleted
      ? {
          status: latestCompleted.status,
          failed: Number(latestCompleted.failed_count || 0),
          refreshed: Number(latestCompleted.refreshed_count || 0),
          completedAt: latestCompleted.completed_at || latestCompleted.started_at,
          activeError: latestCompleted.status === "failed" || latestCompleted.status === "degraded" || Number(latestCompleted.failed_count || 0) > 0,
        }
      : {
          status: runningRuns.length ? "running" : "unknown",
          failed: 0,
          refreshed: 0,
          completedAt: null,
          activeError: false,
        };

    return json({
      ok: true,
      kind,
      title: "Panel backend senkronu",
      description: latestState.activeError
        ? "Şu anki/latest backend sync turunda aktif hata var."
        : "Şu anda aktif backend sync hatası yok. Eski hatalar aktif duruma karıştırılmaz.",
      items: activeRequests,
      runs: visibleRuns,
      current: latestState,
      history: {
        requests: requestHistory.slice(0, 30),
        failedRuns: historicalFailures.slice(0, 20),
      },
    });
  }

  return json({ ok: false, error: "Bilinmeyen kuyruk türü." }, 400);
}
