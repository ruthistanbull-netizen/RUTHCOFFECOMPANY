import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READY_CACHE_MS = 5_000;
const READY_TIMEOUT_MS = 4_000;

type ReadinessState = {
  ok: boolean;
  checkedAt: number;
  latencyMs: number;
  error?: string;
  confirmedFailure: boolean;
  failureKind?: "database_error" | "timeout" | "unknown";
};

let cached: ReadinessState | null = null;
let inFlight: Promise<ReadinessState> | null = null;

async function checkDatabase(): Promise<ReadinessState> {
  const now = Date.now();
  if (cached && now - cached.checkedAt < READY_CACHE_MS) return cached;
  if (inFlight) return inFlight;

  inFlight = (async (): Promise<ReadinessState> => {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const supabase = getSupabaseAdmin();
      const result = await Promise.race([
        Promise.resolve(
          supabase.from("products").select("id").limit(1),
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("database readiness timeout")), READY_TIMEOUT_MS);
        }),
      ]);

      const next: ReadinessState = {
        ok: !result.error,
        checkedAt: Date.now(),
        latencyMs: Date.now() - started,
        error: result.error?.message,
        confirmedFailure: Boolean(result.error),
        failureKind: result.error ? "database_error" : undefined,
      };
      cached = next;
      return next;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "database readiness failed";
      const timedOut = /timeout/i.test(message);
      const next: ReadinessState = {
        ok: false,
        checkedAt: Date.now(),
        latencyMs: Date.now() - started,
        error: message,
        confirmedFailure: false,
        failureKind: timedOut ? "timeout" : "unknown",
      };
      cached = next;
      return next;
    } finally {
      if (timer) clearTimeout(timer);
      inFlight = null;
    }
  })();

  return inFlight;
}

export async function GET() {
  const state = await checkDatabase();
  return NextResponse.json({
    ok: state.ok,
    status: state.ok ? "ready" : state.confirmedFailure ? "not_ready" : "unknown",
    database: state.ok ? "reachable" : state.confirmedFailure ? "unreachable" : "unverified",
    latencyMs: state.latencyMs,
    error: state.ok ? undefined : state.error,
    confirmedFailure: state.confirmedFailure,
    failureKind: state.failureKind,
    checkedAt: new Date(state.checkedAt).toISOString(),
  }, {
    status: state.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
