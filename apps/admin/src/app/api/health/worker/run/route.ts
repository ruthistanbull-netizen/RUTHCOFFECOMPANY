import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ROSTA_SUPABASE_URL } from "@/lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

function runsOf(value: unknown) {
  const parsed = Math.trunc(Number(value || 1));
  return Math.max(1, Math.min(5, Number.isFinite(parsed) ? parsed : 1));
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const maxRuns = runsOf(body.runs);

  const { data: config, error: configError } = await auth.supabase
    .from("commerce_worker_config")
    .select("worker_secret,enabled")
    .eq("id", true)
    .maybeSingle();

  if (configError || !config?.worker_secret || config.enabled === false) {
    return NextResponse.json({
      ok: false,
      error: configError?.message || "ROSTA commerce worker yapılandırması bulunamadı.",
    }, { status: 503 });
  }

  const functionUrl = `${ROSTA_SUPABASE_URL}/functions/v1/commerce-worker`;
  const runs: unknown[] = [];
  let pendingOutbox: number | null = null;
  let pendingJobs: number | null = null;

  for (let index = 0; index < maxRuns; index += 1) {
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-worker-secret": String(config.worker_secret),
        "user-agent": "rosta-admin-manual-worker/1.0",
      },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });

    const result = await response.json().catch(() => ({}));
    runs.push({ status: response.status, result });

    if (!response.ok && response.status !== 207) {
      return NextResponse.json({
        ok: false,
        error: result?.error || `ROSTA commerce worker ${response.status} döndürdü.`,
        runs,
      }, { status: 502 });
    }

    const checks = Array.isArray(result?.health?.checks) ? result.health.checks : [];
    pendingOutbox = Number(checks.find((item: any) => item?.name === "outbox")?.pending ?? NaN);
    pendingJobs = Number(checks.find((item: any) => item?.name === "jobs")?.pending ?? NaN);
    if (pendingOutbox === 0 && pendingJobs === 0) break;
  }

  return NextResponse.json({
    ok: true,
    runCount: runs.length,
    pendingOutbox: Number.isFinite(pendingOutbox) ? pendingOutbox : null,
    pendingJobs: Number.isFinite(pendingJobs) ? pendingJobs : null,
    runs,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
