import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  PANEL_SYNC_BY_ROUTE,
  PANEL_SYNC_TARGETS,
  defaultDynamicTarget,
  normalizePanelRoute,
  panelReadModelKey,
  panelSnapshotEligible,
  panelSnapshotExpired,
} from "@/lib/panelSyncRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

async function queueRepair(supabase: any, scope: string, reason: string) {
  try {
    await supabase.rpc("request_panel_sync", {
      p_scope: scope || "general",
      p_reason: reason,
    });
    return true;
  } catch {
    return false;
  }
}

function healthySnapshot(row: any, now = Date.now()) {
  return String(row?.status || "") === "healthy" && !panelSnapshotExpired(row?.expires_at, now);
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const bootstrap = url.searchParams.get("bootstrap") === "1";

  if (bootstrap) {
    const { data, error } = await auth.supabase
      .from("panel_read_models")
      .select("key,route_path,scope,payload,status,revision,refreshed_at,expires_at,duration_ms,last_error,metadata")
      .order("refreshed_at", { ascending: false })
      .limit(250);
    if (error) return noStore({ ok: false, error: error.message }, 400);

    const rows = data || [];
    const now = Date.now();
    const ownedRows = rows.filter((row: any) => panelSnapshotEligible(String(row?.route_path || "")));
    const unhealthy = ownedRows.filter((row: any) => !healthySnapshot(row, now));

    // Expired snapshots are not authoritative even when an old worker left their
    // status as `healthy`. Repair only the affected scopes and let live reads own
    // correctness until a newer revision arrives.
    const repairScopes = [...new Set(unhealthy.map((row: any) => String(row?.scope || "general")))];
    for (const scope of repairScopes) {
      void queueRepair(auth.supabase, scope, "bootstrap_unhealthy_or_expired_read_models");
    }

    // Never hydrate the browser with stale/error/expired authority. The browser can
    // still retain its own last-known-good paint while adminApi performs a live read.
    const entries = ownedRows
      .filter((row: any) => healthySnapshot(row, now))
      .filter((row: any) => row?.payload && Object.keys(row.payload || {}).length > 0)
      .sort((left: any, right: any) => {
        const leftRoute = normalizePanelRoute(String(left.route_path || ""));
        const rightRoute = normalizePanelRoute(String(right.route_path || ""));
        const leftPriority = PANEL_SYNC_BY_ROUTE.get(leftRoute)?.priority ?? Number(left?.metadata?.priority || 0);
        const rightPriority = PANEL_SYNC_BY_ROUTE.get(rightRoute)?.priority ?? Number(right?.metadata?.priority || 0);
        if (rightPriority !== leftPriority) return rightPriority - leftPriority;
        return new Date(right.refreshed_at || 0).getTime() - new Date(left.refreshed_at || 0).getTime();
      })
      .slice(0, 180);

    return noStore({
      ok: true,
      entries,
      unhealthyCount: unhealthy.length,
      repairQueued: repairScopes.length > 0,
      repairScopes,
      knownTargets: PANEL_SYNC_TARGETS.length,
      generatedAt: new Date().toISOString(),
    });
  }

  const raw = url.searchParams.get("path") || "";
  const path = normalizePanelRoute(raw);
  if (!raw || !panelSnapshotEligible(path)) return noStore({ ok: false, found: false, error: "Bu rota anlık snapshot için uygun değil." }, 400);

  const { data, error } = await auth.supabase
    .from("panel_read_models")
    .select("key,route_path,scope,payload,status,revision,refreshed_at,expires_at,duration_ms,last_error")
    .eq("route_path", path)
    .maybeSingle();
  if (error) return noStore({ ok: false, found: false, error: error.message }, 400);

  if (!data?.payload || Object.keys(data.payload || {}).length === 0 || !healthySnapshot(data)) {
    const scope = String(data?.scope || PANEL_SYNC_BY_ROUTE.get(path)?.scope || defaultDynamicTarget(path).scope || "general");
    const expired = Boolean(data?.expires_at && panelSnapshotExpired(data.expires_at));
    const repairQueued = await queueRepair(auth.supabase, scope, expired ? "snapshot_expired_fallback" : "snapshot_read_fallback");
    return noStore({
      ok: true,
      found: false,
      path,
      status: expired ? "expired" : data?.status || "missing",
      lastError: data?.last_error || null,
      repairQueued,
    });
  }

  return noStore({ ok: true, found: true, entry: data });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const raw = String(body?.path || "");
  const path = normalizePanelRoute(raw);
  if (!raw || !panelSnapshotEligible(path)) return noStore({ ok: false, error: "Rota snapshot sistemine kaydedilemez." }, 400);

  const { data: existing, error: existingError } = await auth.supabase
    .from("panel_read_models")
    .select("key,scope,status,expires_at")
    .eq("route_path", path)
    .maybeSingle();
  if (existingError) return noStore({ ok: false, error: existingError.message }, 400);
  if (existing?.key) {
    const unhealthy = String(existing.status || "") !== "healthy" || panelSnapshotExpired(existing.expires_at);
    const repairQueued = unhealthy
      ? await queueRepair(auth.supabase, String(existing.scope || "general"), "route_existing_unhealthy_or_expired")
      : false;
    return noStore({
      ok: true,
      registered: false,
      exists: true,
      path,
      key: existing.key,
      scope: existing.scope,
      status: unhealthy ? "expired_or_unhealthy" : existing.status,
      repairQueued,
    });
  }

  const registered = PANEL_SYNC_BY_ROUTE.get(path) || defaultDynamicTarget(path);
  const key = PANEL_SYNC_BY_ROUTE.has(path) ? registered.key : panelReadModelKey(path);
  const now = new Date().toISOString();
  const immediatelyDue = new Date(0).toISOString();

  const { error } = await auth.supabase.from("panel_read_models").upsert({
    key,
    route_path: path,
    scope: registered.scope,
    payload: {},
    status: "stale",
    refreshed_at: immediatelyDue,
    expires_at: immediatelyDue,
    metadata: {
      autoRegistered: !PANEL_SYNC_BY_ROUTE.has(path),
      intervalMs: registered.intervalMs,
      maxAgeMs: registered.maxAgeMs,
      priority: registered.priority,
      registeredAt: now,
    },
    updated_at: now,
  }, { onConflict: "key", ignoreDuplicates: true });
  if (error) return noStore({ ok: false, error: error.message }, 400);

  // Event-only architecture: a newly discovered route needs exactly one scope
  // event for first hydration. The DB trigger immediately kicks the worker;
  // a recovery cron also retries only when pending work actually exists.
  await queueRepair(auth.supabase, registered.scope, "route_registered");

  return noStore({ ok: true, registered: true, path, key, scope: registered.scope });
}
