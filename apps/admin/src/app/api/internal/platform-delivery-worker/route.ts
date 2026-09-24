import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { executeWebsiteRevalidate, type WebsiteRevalidateInput } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

// Immediate post-commit delivery handles the common path. This worker is recovery
// only, so a small batch keeps each scheduler tick safely inside its time budget.
const CLAIM_LIMIT = 3;
const DB_RPC_TIMEOUT_MS = 2_500;

type DeliveryJob = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
};

function retryDelay(attempts: number) {
  return Math.min(1800, Math.max(15, Math.round(15 * (2 ** Math.min(Math.max(attempts, 1), 7)))));
}

async function withTimeout<T>(value: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function run(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!auth.internal) return NextResponse.json({ ok: false, error: "Delivery worker yalnızca internal scheduler tarafından çalıştırılabilir." }, { status: 403 });

  const workerId = `platform-delivery:${crypto.randomUUID()}`;
  let claim: any;
  try {
    claim = await withTimeout(
      auth.supabase.rpc("claim_platform_delivery_jobs", { p_worker: workerId, p_limit: CLAIM_LIMIT }),
      DB_RPC_TIMEOUT_MS,
      "delivery claim",
    );
  } catch (caught) {
    return NextResponse.json({
      ok: false,
      workerId,
      error: caught instanceof Error ? caught.message : "Delivery queue claim failed",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  if (claim.error) {
    const missing = /claim_platform_delivery_jobs|does not exist|schema cache/i.test(claim.error.message);
    return NextResponse.json({ ok: missing, skipped: missing, error: missing ? undefined : claim.error.message, workerId }, { status: missing ? 200 : 503 });
  }

  const jobs = (Array.isArray(claim.data) ? claim.data : []) as DeliveryJob[];
  const results: Array<Record<string, unknown>> = [];

  for (const job of jobs) {
    let success = false;
    let error: string | undefined;
    try {
      if (job.kind !== "storefront-revalidate") throw new Error(`Unknown delivery kind: ${job.kind}`);
      const delivery = await executeWebsiteRevalidate(job.payload as unknown as WebsiteRevalidateInput);
      success = delivery.ok;
      error = delivery.ok ? undefined : delivery.message || `Storefront revalidate failed (${delivery.status || "no-status"})`;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Delivery worker failed";
    }

    let completionError: string | null = null;
    try {
      const completion: any = await withTimeout(
        auth.supabase.rpc("complete_platform_delivery_job", {
          p_id: job.id,
          p_worker: workerId,
          p_success: success,
          p_error: error || null,
          p_retry_seconds: retryDelay(job.attempts),
        }),
        DB_RPC_TIMEOUT_MS,
        "delivery completion",
      );
      completionError = completion.error?.message || null;
    } catch (caught) {
      completionError = caught instanceof Error ? caught.message : "Delivery completion failed";
    }

    results.push({ id: job.id, kind: job.kind, success, completionError, error: error || null });
  }

  return NextResponse.json({
    ok: results.every((item) => item.success === true && !item.completionError),
    workerId,
    claimed: jobs.length,
    succeeded: results.filter((item) => item.success === true).length,
    failed: results.filter((item) => item.success !== true).length,
    results,
    completedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
