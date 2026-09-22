import { after, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 80;

type ClientMetric = {
  route?: unknown;
  durationMs?: unknown;
  ok?: unknown;
  status?: unknown;
  kind?: unknown;
  traceId?: unknown;
  at?: unknown;
};

function cleanKind(value: unknown) {
  return String(value || "resource").slice(0, 40);
}

function cleanRoute(value: unknown, kind: string) {
  const text = String(value || "").slice(0, 240);
  if (!text.startsWith("/") || text.startsWith("//")) return null;
  const route = text.split("?")[0] || "/";
  const uiMetric = kind === "navigation" || kind === "page-load";
  if (uiMetric) return route.startsWith("/api/") ? null : route;
  return route.startsWith("/api/") ? route : null;
}

function metricRow(metric: ClientMetric, profileId: string) {
  const kind = cleanKind(metric.kind);
  const route = cleanRoute(metric.route, kind);
  const durationMs = Math.max(0, Math.min(120_000, Math.round(Number(metric.durationMs) || 0)));
  if (!route || !durationMs) return null;
  const occurred = Number(metric.at);
  const uiMetric = kind === "navigation" || kind === "page-load";
  const mutationMetric = kind === "mutation";
  return {
    source: "admin-browser",
    service: uiMetric ? "admin-ui" : mutationMetric ? "admin-mutation" : "admin-api",
    route,
    kind,
    duration_ms: durationMs,
    ok: metric.ok === false ? false : true,
    status_code: uiMetric ? null : Number.isFinite(Number(metric.status)) ? Math.max(0, Math.min(599, Math.round(Number(metric.status)))) : null,
    trace_id: typeof metric.traceId === "string" ? metric.traceId.slice(0, 100) : null,
    metadata: { adminProfileId: profileId },
    occurred_at: Number.isFinite(occurred) && occurred > 0 ? new Date(occurred).toISOString() : new Date().toISOString(),
  };
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz telemetry payload." }, { status: 400 });
  }

  const list = Array.isArray(payload) ? payload : Array.isArray((payload as { metrics?: unknown[] })?.metrics) ? (payload as { metrics: unknown[] }).metrics : [];
  const rows = list.slice(0, MAX_BATCH)
    .map((item) => metricRow((item || {}) as ClientMetric, String(auth.profile.id)))
    .filter(Boolean);

  if (rows.length) {
    after(async () => {
      const { error } = await auth.supabase.from("platform_telemetry_events").insert(rows as any[]);
      if (error && !/does not exist/i.test(error.message)) console.warn("[telemetry] insert failed", error.message);
    });
  }

  return NextResponse.json({ ok: true, accepted: rows.length }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
