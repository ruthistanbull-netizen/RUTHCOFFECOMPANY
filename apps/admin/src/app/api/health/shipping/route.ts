import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MONITOR_STALE_MS = 3 * 60_000;
const SECOND_FAILURE_EVIDENCE_MS = 1_000;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("panel_service_health_state")
    .select("status,detail,first_seen_at,last_seen_at,metadata,updated_at")
    .eq("service_key", "shipping-api")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!data) {
    return NextResponse.json({
      ok: true,
      status: "unknown",
      confirmedFailure: false,
      fresh: false,
      detail: "Kargo servis izleyicisinin ilk sonucu bekleniyor.",
      latencyMs: null,
      firstSeenAt: null,
      lastSeenAt: null,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const now = Date.now();
  const status = String(data.status || "unknown");
  const firstSeenAt = data.first_seen_at ? String(data.first_seen_at) : null;
  const lastSeenAt = data.last_seen_at ? String(data.last_seen_at) : null;
  const firstSeenMs = firstSeenAt ? new Date(firstSeenAt).getTime() : Number.NaN;
  const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : Number.NaN;
  const fresh = Number.isFinite(lastSeenMs) && now - lastSeenMs <= MONITOR_STALE_MS;

  // recordHealthAndMaybeAlert writes first_seen_at and last_seen_at to the same
  // timestamp on the first failure. A later last_seen_at while first_seen_at stays
  // unchanged proves that the backend monitor observed the same failure again.
  const repeatedProblem = status !== "healthy"
    && Number.isFinite(firstSeenMs)
    && Number.isFinite(lastSeenMs)
    && lastSeenMs - firstSeenMs >= SECOND_FAILURE_EVIDENCE_MS;

  const confirmedFailure = fresh && status === "unhealthy" && repeatedProblem;
  const confirmedWarning = fresh && status === "degraded" && repeatedProblem;
  const metadata = (data.metadata || {}) as Record<string, unknown>;

  const effectiveStatus = status === "healthy" && fresh
    ? "healthy"
    : confirmedFailure
      ? "unhealthy"
      : confirmedWarning || (fresh && status !== "healthy")
        ? "degraded"
        : "unknown";

  return NextResponse.json({
    ok: true,
    status: effectiveStatus,
    monitorStatus: status,
    confirmedFailure,
    confirmedWarning,
    fresh,
    detail: String(data.detail || "Kargo servis durumu kontrol edildi."),
    latencyMs: Number(metadata.latencyMs || 0) || null,
    httpStatus: metadata.httpStatus ?? null,
    firstSeenAt,
    lastSeenAt,
  }, { headers: { "Cache-Control": "no-store" } });
}
