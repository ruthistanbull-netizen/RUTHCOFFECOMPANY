import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCESS_KEY = String(process.env.PHASE0_STOREFRONT_ADMIN_PROXY_KEY || "").trim();
const ADMIN_PROBE_KEY = String(process.env.PHASE0_ADMIN_DB_RUNTIME_PROBE_KEY || "").trim();
const ADMIN_BASE_URL = String(process.env.ROSTA_ADMIN_URL || process.env.ADMIN_BASE_URL || "https://rostapanel.zeabur.app").trim().replace(/\/$/, "");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (process.env.NODE_ENV !== "production" || !ACCESS_KEY || !ADMIN_PROBE_KEY || searchParams.get("key") !== ACCESS_KEY) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const target = `${ADMIN_BASE_URL}/api/internal/phase0-db-runtime-probe?key=${encodeURIComponent(ADMIN_PROBE_KEY)}`;
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
