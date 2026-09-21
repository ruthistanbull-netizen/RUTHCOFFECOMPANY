import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCESS_KEY = "5zVr1Qn8LkT4mYp7Hx2Cd9Ua6Wf3Bs0Je8Gi4No1RcM";
const ADMIN_PROBE_KEY = "qJH8l1uM6wZKfTc5mDy4YbN9sR2xV7pE0aC3gL5iUoQ";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (process.env.VERCEL_ENV !== "production" || searchParams.get("key") !== ACCESS_KEY) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const target = `https://ruthcommerce.zeabur.app/api/internal/phase0-db-runtime-probe?key=${encodeURIComponent(ADMIN_PROBE_KEY)}`;
    const response = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    const raw = await response.text();
    let payload: unknown = raw;
    try { payload = raw ? JSON.parse(raw) : null; } catch {}

    return NextResponse.json(
      { ok: response.ok, upstreamStatus: response.status, result: payload },
      {
        status: response.ok ? 200 : 502,
        headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message.slice(0, 240) : "admin_runtime_probe_failed" },
      { status: 500, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" } },
    );
  }
}
