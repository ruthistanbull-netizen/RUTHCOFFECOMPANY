import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PROBE_TIMEOUT_MS = 5_000;
const DB_TIMEOUT_MS = 2_500;
const MIN_RUN_GAP_MS = 45_000;
const LEASE_SECONDS = 240;
const DEFAULT_ADMIN_BASE_URL = "https://rostapanel.zeabur.app";
const ARCHITECTURE_VERSION = "resilience-v4.0.0";
let lastRunAt = 0;

type Probe = { ok: boolean; status: number; latencyMs: number; error?: string };

function authorized(request: Request) {
  const expected = String(process.env.CRON_SECRET || process.env.COMMERCE_WORKER_SECRET || "").trim();
  if (!expected) return false;
  const supplied = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return Boolean(supplied && supplied === expected);
}

async function withTimeout<T>(value: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probe(url: string): Promise<Probe> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "user-agent": "rosta-platform-watchdog/4.0" },
      cache: "no-store",
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (caught) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: caught instanceof Error ? caught.message : "probe failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function acquireLease(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const holder = `rosta-storefront:${process.env.ZEABUR_SERVICE_ID || process.env.VERCEL_DEPLOYMENT_ID || crypto.randomUUID()}`;
  try {
    const { data, error } = await withTimeout<any>(
      supabase.rpc("try_platform_lease", {
        p_name: "external-platform-watchdog",
        p_holder: holder,
        p_ttl_seconds: LEASE_SECONDS,
      }),
      2_000,
      "watchdog lease",
    );
    if (error) {
      if (/does not exist|could not find/i.test(error.message)) return true;
      throw error;
    }
    return data === true;
  } catch (caught) {
    console.warn("[rosta-watchdog] lease unavailable; continuing probe", caught);
    return true;
  }
}

async function resolveAdminBase(supabase: ReturnType<typeof getSupabaseAdmin>) {
  try {
    const result = await withTimeout<any>(
      supabase.from("commerce_worker_config").select("admin_internal_url").eq("id", true).maybeSingle(),
      DB_TIMEOUT_MS,
      "watchdog admin base read",
    );
    const fromDb = String(result.data?.admin_internal_url || "").trim();
    if (!result.error && fromDb) return fromDb.replace(/\/$/, "");
  } catch {}

  return String(
    process.env.ADMIN_BASE_URL ||
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    process.env.NEXT_PUBLIC_PANEL_URL ||
    DEFAULT_ADMIN_BASE_URL
  ).replace(/\/$/, "");
}

async function persistObservation(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  live: Probe,
  ready: Probe,
  adminBase: string,
  nowIso: string,
) {
  const healthy = live.ok && ready.ok;
  const previousResult = await withTimeout<any>(
    supabase
      .from("panel_service_health_state")
      .select("status,first_seen_at,last_seen_at,last_alerted_at,recovered_at")
      .eq("service_key", "external-platform-watchdog")
      .maybeSingle(),
    DB_TIMEOUT_MS,
    "watchdog previous-state read",
  );
  const previous: any = previousResult.data || null;

  const previousHealthy = !previous || previous.status === "healthy";
  const firstSeenAt = healthy ? nowIso : previousHealthy ? nowIso : String(previous.first_seen_at || nowIso);
  const observedAgain = !healthy && !previousHealthy;
  const status = healthy ? "healthy" : observedAgain ? "unhealthy" : "degraded";
  const recovered = healthy && previous && previous.status !== "healthy";
  const detail = healthy
    ? `ROSTA watchdog: panel live ${live.latencyMs}ms · ready ${ready.latencyMs}ms.`
    : `ROSTA watchdog doğrulaması: live=${live.ok ? "ok" : live.error || live.status} ready=${ready.ok ? "ok" : ready.error || ready.status}`;

  await withTimeout<any>(
    supabase.from("panel_service_health_state").upsert({
      service_key: "external-platform-watchdog",
      status,
      detail,
      first_seen_at: firstSeenAt,
      last_seen_at: nowIso,
      last_alerted_at: status === "unhealthy" && previous?.status !== "unhealthy"
        ? nowIso
        : previous?.last_alerted_at || null,
      recovered_at: recovered ? nowIso : previous?.recovered_at || null,
      metadata: {
        runtime: "rosta-storefront",
        architectureVersion: ARCHITECTURE_VERSION,
        live,
        ready,
        adminBase,
        verifiedPlatformProbe: true,
      },
      updated_at: nowIso,
    }, { onConflict: "service_key" }),
    DB_TIMEOUT_MS,
    "watchdog state write",
  );

  if (status === "unhealthy" && previous?.status !== "unhealthy") {
    await withTimeout<any>(
      supabase.from("admin_push_jobs").upsert({
        kind: "health",
        dedupe_key: `external-watchdog:v4:${firstSeenAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
        payload: {
          service_key: "external-platform-watchdog",
          status: "unhealthy",
          title: "Panel dış erişim doğrulaması başarısız",
          body: detail,
          verified: true,
        },
        target_url: "/system",
      }, { onConflict: "dedupe_key", ignoreDuplicates: true }),
      DB_TIMEOUT_MS,
      "watchdog alert write",
    );
  }
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized watchdog request." }, { status: 401 });
  }

  const nowMs = Date.now();
  if (nowMs - lastRunAt < MIN_RUN_GAP_MS) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "local_rate_limited",
      architectureVersion: ARCHITECTURE_VERSION,
    });
  }
  lastRunAt = nowMs;

  const supabase = getSupabaseAdmin();
  if (!(await acquireLease(supabase))) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: "lease_held_elsewhere",
        architectureVersion: ARCHITECTURE_VERSION,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const adminBase = await resolveAdminBase(supabase);
  const [live, ready] = await Promise.all([
    probe(`${adminBase}/api/health/live`),
    probe(`${adminBase}/api/health/ready`),
  ]);
  const healthy = live.ok && ready.ok;
  const nowIso = new Date().toISOString();

  try {
    await persistObservation(supabase, live, ready, adminBase, nowIso);
  } catch (caught) {
    console.error("[rosta-watchdog] persistence unavailable", caught);
  }

  return NextResponse.json({
    ok: healthy,
    service: "rosta-storefront-watchdog",
    status: healthy ? "healthy" : "unhealthy",
    architectureVersion: ARCHITECTURE_VERSION,
    live,
    ready,
    adminBaseSource: "database-first",
    checkedAt: nowIso,
  }, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
