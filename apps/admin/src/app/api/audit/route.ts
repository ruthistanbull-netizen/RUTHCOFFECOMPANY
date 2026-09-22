import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function limitOf(value: string | null) {
  const parsed = Math.trunc(Number(value || 100));
  return Math.max(1, Math.min(500, Number.isFinite(parsed) ? parsed : 100));
}

function statusFrom(row: any) {
  const explicit = String(row?.metadata?.status || row?.metadata?.result || "").trim().toLowerCase();
  if (explicit) return explicit;
  const action = String(row?.action || "").toLowerCase();
  if (/(failed|error|denied|rejected|cancelled)/.test(action)) return "error";
  if (/(warning|retry|pending|degraded)/.test(action)) return "warning";
  return "success";
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const limit = limitOf(url.searchParams.get("limit"));

  const { data, error } = await auth.supabase
    .from("commerce_audit_logs")
    .select("id,action,entity_type,entity_id,actor_type,actor_id,actor_name,metadata,ip_address,user_agent,occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  const actorIds = [...new Set((data || []).map((row: any) => String(row.actor_id || "")).filter(Boolean))];
  const profilesResult = actorIds.length
    ? await auth.supabase.from("profiles").select("id,email").in("id", actorIds)
    : { data: [], error: null };

  const emailById = new Map<string,string>();
  for (const profile of profilesResult.data || []) {
    emailById.set(String(profile.id), String(profile.email || ""));
  }

  const rows = (data || []).map((row: any) => ({
    id: String(row.id),
    action: String(row.action || "unknown"),
    resource_type: row.entity_type || null,
    resource_id: row.entity_id || null,
    actor_email: emailById.get(String(row.actor_id || "")) || row.actor_name || null,
    actor_profile_id: row.actor_id || null,
    status: statusFrom(row),
    ip_address: row.ip_address || null,
    user_agent: row.user_agent || null,
    metadata: row.metadata || null,
    created_at: row.occurred_at,
  }));

  return NextResponse.json({ ok: true, rows }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
