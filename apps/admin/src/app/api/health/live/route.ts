import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: "live",
    service: "rosta-admin",
    uptimeSeconds: Math.round(process.uptime()),
    commit: process.env.ZEABUR_GIT_COMMIT_SHA || process.env.ZEABUR_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || null,
    checkedAt: new Date().toISOString(),
  }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
