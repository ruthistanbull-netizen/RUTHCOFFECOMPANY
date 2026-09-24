import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STARTUP_TIMEOUT_MS = 1_500;
let startupReady = false;
let startupReadyAt: string | null = null;

async function databaseReadyOnce() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const supabase = getSupabaseAdmin();
    const result = await Promise.race([
      Promise.resolve(supabase.from("automation_cron_config").select("id").eq("id", true).maybeSingle()),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("startup readiness timeout")), STARTUP_TIMEOUT_MS);
      }),
    ]);
    if (result.error) throw result.error;
    startupReady = true;
    startupReadyAt = new Date().toISOString();
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET() {
  if (!startupReady && !(await databaseReadyOnce())) {
    return NextResponse.json({
      ok: false,
      status: "starting",
      process: "alive",
      databaseValidated: false,
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({
    ok: true,
    status: "healthy",
    process: "alive",
    databaseValidated: true,
    startupReadyAt,
    uptimeSeconds: Math.round(process.uptime()),
  }, { headers: { "Cache-Control": "no-store" } });
}
