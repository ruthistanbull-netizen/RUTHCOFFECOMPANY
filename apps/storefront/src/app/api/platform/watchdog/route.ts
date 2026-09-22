import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ROSTA_PANEL_URL = "https://rostapanel.zeabur.app";
const PROBE_TIMEOUT_MS = 5_000;

type Probe = { ok: boolean; status: number; latencyMs: number; error?: string };

function authorized(request: Request) {
  const expected = String(process.env.CRON_SECRET || process.env.COMMERCE_WORKER_SECRET || "").trim();
  if (!expected) return false;
  const supplied = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return Boolean(supplied && supplied === expected);
}

async function probe(path: string): Promise<Probe> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${ROSTA_PANEL_URL}${path}`, {
      method: "GET",
      headers: { "user-agent": "rosta-platform-watchdog/1.0" },
      cache: "no-store",
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "probe_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized watchdog request." }, { status: 401 });
  }

  const [live, ready] = await Promise.all([
    probe("/api/health/live"),
    probe("/api/health/ready"),
  ]);
  const healthy = live.ok && ready.ok;

  return NextResponse.json(
    {
      ok: healthy,
      service: "rosta-storefront-watchdog",
      panel: ROSTA_PANEL_URL,
      status: healthy ? "healthy" : "unhealthy",
      live,
      ready,
      checkedAt: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    },
  );
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
