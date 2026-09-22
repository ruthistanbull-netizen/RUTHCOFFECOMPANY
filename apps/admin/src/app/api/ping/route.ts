import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, status: "pong", timestamp: new Date().toISOString() });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
