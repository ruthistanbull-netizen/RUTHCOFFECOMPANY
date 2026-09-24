import { runServiceHealthMonitorV4 } from "@/lib/serviceHealthMonitorV4";
import { kickAdminPushWorker } from "@/lib/pushWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

async function run(request: Request) {
  const response = await runServiceHealthMonitorV4(request);
  if (!response) {
    return new Response(JSON.stringify({
      ok: false,
      status: "degraded",
      confirmedFailure: false,
      error: "Service health monitor did not return a response.",
    }), {
      status: 500,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  try {
    const payload = await response.clone().json();
    if (Number(payload?.alertsQueued || 0) > 0) {
      await kickAdminPushWorker();
    }
  } catch {
    // The health response remains authoritative even if push delivery has a
    // transient problem. The durable queue will be retried by platform-tick.
  }
  return response;
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
