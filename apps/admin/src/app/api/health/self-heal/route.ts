import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [state, events, policies, recovered24h, attention24h] = await Promise.all([
    auth.supabase
      .from("panel_service_health_state")
      .select("service_key,status,detail,last_seen_at,recovered_at,metadata")
      .eq("service_key", "self-heal-supervisor")
      .maybeSingle(),
    auth.supabase
      .from("commerce_recovery_events")
      .select("id,engine_key,action,status,item_count,detail,metadata,occurred_at")
      .neq("status", "noop")
      .order("occurred_at", { ascending: false })
      .limit(40),
    auth.supabase
      .from("commerce_recovery_policies")
      .select("engine_key,enabled,stuck_after_seconds,base_backoff_seconds,max_backoff_seconds,max_auto_retries,safe_dead_letter_replay,metadata,updated_at")
      .order("engine_key", { ascending: true }),
    auth.supabase
      .from("commerce_recovery_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "recovered")
      .gte("occurred_at", since24h),
    auth.supabase
      .from("commerce_recovery_events")
      .select("id", { count: "exact", head: true })
      .in("status", ["manual_review", "failed"])
      .gte("occurred_at", since24h),
  ]);

  const error = state.error || events.error || policies.error || recovered24h.error || attention24h.error;
  if (error) {
    return json({ ok: false, error: error.message }, 400);
  }

  const policyRows = policies.data || [];
  const activePolicies = policyRows.filter((row: any) => row.enabled !== false).length;
  const metadata = (state.data?.metadata || {}) as Record<string, any>;

  return json({
    ok: true,
    state: state.data || null,
    events: events.data || [],
    policies: policyRows,
    summary: {
      activePolicies,
      totalPolicies: policyRows.length,
      recovered24h: Number(recovered24h.count || 0),
      attention24h: Number(attention24h.count || 0),
      lastRunRepairs: Number(metadata.autoRepairs || 0),
      manualAttention: Number(metadata.manualAttention || 0),
    },
    checkedAt: new Date().toISOString(),
  });
}
