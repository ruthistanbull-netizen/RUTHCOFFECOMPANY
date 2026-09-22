import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { deliverQueuedOrderConfirmations } from "@/lib/orderEmailDelivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request) {
  const expected = (process.env.COMMERCE_WORKER_SECRET || process.env.CRON_SECRET || "").trim();
  const supplied = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && supplied && supplied === expected);
}

function workerId() {
  return `rosta:${process.env.ZEABUR_REGION || process.env.REGION || "unknown"}:${crypto.randomUUID()}`;
}

async function healthSnapshot(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const [outboxPending, outboxDead, jobsPending, jobsDead, emailPending, emailFailed] = await Promise.all([
    supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).in("status", ["pending", "failed", "processing"]),
    supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
    supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "failed", "running"]),
    supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
    supabase.from("email_logs").select("id", { count: "exact", head: true }).in("status", ["queued", "sending"]),
    supabase.from("email_logs").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);

  const checks = [
    { name: "database", status: "healthy", detail: "Supabase service-role query succeeded." },
    { name: "outbox", status: Number(outboxDead.count || 0) > 0 ? "degraded" : "healthy", pending: Number(outboxPending.count || 0), deadLetter: Number(outboxDead.count || 0) },
    { name: "jobs", status: Number(jobsDead.count || 0) > 0 ? "degraded" : "healthy", pending: Number(jobsPending.count || 0), deadLetter: Number(jobsDead.count || 0) },
    { name: "email", status: Number(emailFailed.count || 0) > 0 ? "degraded" : "healthy", pending: Number(emailPending.count || 0), failed: Number(emailFailed.count || 0) },
  ];
  const status = checks.some((check) => check.status === "degraded") ? "degraded" : "healthy";
  const { error } = await supabase.from("commerce_health_snapshots").insert({ status, checks });
  if (error) throw new Error(`Health snapshot could not be persisted: ${error.message}`);
  return { status, checks };
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized commerce worker request." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const id = workerId();
  const startedAt = new Date().toISOString();
  const failures: Array<{ source: string; id: string; error: string }> = [];
  let published = 0;
  let completedJobs = 0;

  const { data: outboxRows, error: claimOutboxError } = await supabase.rpc("claim_commerce_outbox", {
    p_worker: id,
    p_limit: 50,
  });
  if (claimOutboxError) throw new Error(`Outbox claim failed: ${claimOutboxError.message}`);

  for (const event of outboxRows || []) {
    try {
      console.info("Commerce outbox event published", {
        eventId: event.event_id,
        eventType: event.event_type,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        correlationId: event.correlation_id,
      });
      const { error } = await supabase.rpc("complete_commerce_outbox", {
        p_id: event.id,
        p_worker: id,
        p_success: true,
        p_error: null,
        p_retry_delay_seconds: 60,
      });
      if (error) throw new Error(error.message);
      published += 1;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown outbox dispatch error";
      failures.push({ source: "outbox", id: String(event.id), error: message });
      await supabase.rpc("complete_commerce_outbox", {
        p_id: event.id,
        p_worker: id,
        p_success: false,
        p_error: message,
        p_retry_delay_seconds: Math.min(3600, 30 * Math.max(1, Number(event.attempts || 1))),
      });
    }
  }

  const { data: jobs, error: claimJobsError } = await supabase.rpc("claim_commerce_jobs", {
    p_worker: id,
    p_queue: "commerce",
    p_limit: 25,
  });
  if (claimJobsError) throw new Error(`Job claim failed: ${claimJobsError.message}`);

  for (const job of jobs || []) {
    try {
      if (job.job_type === "commerce.health_snapshot") {
        await healthSnapshot(supabase);
      } else {
        throw new Error(`No worker handler registered for ${job.job_type}.`);
      }
      const { error } = await supabase.rpc("complete_commerce_job", {
        p_id: job.id,
        p_worker: id,
        p_success: true,
        p_error: null,
        p_retry_delay_seconds: 60,
      });
      if (error) throw new Error(error.message);
      completedJobs += 1;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown job execution error";
      failures.push({ source: "job", id: String(job.id), error: message });
      await supabase.rpc("complete_commerce_job", {
        p_id: job.id,
        p_worker: id,
        p_success: false,
        p_error: message,
        p_retry_delay_seconds: Math.min(3600, 30 * Math.max(1, Number(job.attempts || 1))),
      });
    }
  }

  const emailDelivery = await deliverQueuedOrderConfirmations(supabase, 10);
  if (emailDelivery.failed > 0) {
    failures.push({ source: "email_queue", id: "*", error: `${emailDelivery.failed} sipariş e-postası gönderilemedi.` });
  }

  const health = await healthSnapshot(supabase);
  await supabase.from("commerce_audit_logs").insert({
    action: "commerce.worker_completed",
    entity_type: "worker_run",
    entity_id: id,
    actor_type: "system",
    correlation_id: id,
    after_data: { published, completedJobs, emailDelivery, failures: failures.length, health: health.status },
    metadata: { started_at: startedAt, completed_at: new Date().toISOString(), region: process.env.ZEABUR_REGION || process.env.REGION || null },
  });

  return NextResponse.json({
    ok: failures.length === 0,
    workerId: id,
    published,
    completedJobs,
    emailDelivery,
    failures,
    health,
  }, { status: failures.length === 0 ? 200 : 207, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    return await run(request);
  } catch (error) {
    console.error("Commerce worker failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Commerce worker failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
