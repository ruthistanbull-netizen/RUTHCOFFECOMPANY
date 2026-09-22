import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { kickAdminPushWorker } from "@/lib/pushWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

async function run(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!auth.internal) {
    return NextResponse.json({ ok: false, error: "Push worker yalnız internal çağrıyla çalıştırılabilir." }, { status: 403 });
  }

  try {
    const result = await kickAdminPushWorker();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Push worker çalıştırılamadı.",
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) { return run(request); }
export async function GET(request: Request) { return run(request); }
