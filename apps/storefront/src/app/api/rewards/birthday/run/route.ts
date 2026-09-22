import { NextResponse } from "next/server";
import { claimBirthdayRewardsForToday } from "@/lib/loyaltyRewardServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = (process.env.CRON_SECRET || process.env.COMMERCE_WORKER_SECRET || "").trim();
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && supplied && supplied === expected);
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized birthday reward request." }, { status: 401 });
  }

  const result = await claimBirthdayRewardsForToday();
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    return await run(request);
  } catch (error) {
    console.error("Birthday reward cron failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Birthday reward cron failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
