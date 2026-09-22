import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function run(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!auth.internal || !auth.internalSecret) {
    return json({ ok: false, error: "Self-heal yalnızca internal worker tarafından çalıştırılabilir." }, 403);
  }

  const started = Date.now();
  const { data, error } = await auth.supabase.rpc("run_global_self_heal_supervisor");

  // Code can deploy before the SQL migration on self-host Supabase. Do not make
  // platform-tick unhealthy during that short rollout window; surface the exact
  // migration state instead. Any other RPC error is operational and must be visible.
  if (error) {
    const missingFunction = String(error.code || "") === "42883"
      || /run_global_self_heal_supervisor/i.test(String(error.message || ""))
        && /does not exist|not found/i.test(String(error.message || ""));

    if (missingFunction) {
      return json({
        ok: true,
        skipped: true,
        status: "pending_migration",
        detail: "Global self-heal SQL migration henüz uygulanmadı.",
        durationMs: Date.now() - started,
      });
    }

    return json({
      ok: false,
      status: "degraded",
      error: error.message,
      durationMs: Date.now() - started,
    }, 503);
  }

  const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return json({
    ok: result.ok !== false,
    ...result,
    durationMs: Date.now() - started,
  }, result.ok === false ? 503 : 200);
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
