import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const PRODUCT_BULK_CHUNK_SIZE = 40;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function sendOrderConfirmation(adminUrl: string, serviceRoleKey: string, orderId: string) {
  if (!/^https:\/\//i.test(adminUrl)) throw new Error("Admin internal URL geçersiz.");
  if (!orderId) throw new Error("Sipariş id bulunamadı.");

  const body = JSON.stringify({ order_id: orderId });
  const timestamp = String(Date.now());
  const signature = await hmacSha256(serviceRoleKey, `${timestamp}.${body}`);
  const response = await fetch(`${adminUrl.replace(/\/$/, "")}/api/internal/order-confirmation`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-rosta-timestamp": timestamp,
      "x-rosta-signature": signature,
    },
    body,
    signal: AbortSignal.timeout(45_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    throw new Error(result?.error || `Admin mail servisi ${response.status} döndürdü.`);
  }
  return result;
}

async function runProductBulkChunk(
  adminUrl: string,
  internalSecret: string,
  job: any,
) {
  if (!/^https:\/\//i.test(adminUrl)) throw new Error("Admin internal URL geçersiz.");
  if (!internalSecret) throw new Error("Admin internal secret bulunamadı.");

  const command = job.payload?.command && typeof job.payload.command === "object"
    ? { ...job.payload.command }
    : {};
  const ids = Array.isArray(command.ids)
    ? [...new Set(command.ids.map((value: unknown) => clean(value)).filter(Boolean))]
    : [];
  if (!ids.length) throw new Error("Product bulk job ürün listesi boş.");

  const cursor = Math.max(0, Math.min(ids.length, Math.trunc(Number(job.payload?.cursor || 0))));
  const chunkIds = ids.slice(cursor, cursor + PRODUCT_BULK_CHUNK_SIZE);
  if (!chunkIds.length) {
    return { done: true, processed: ids.length, total: ids.length, result: null };
  }

  const baseIdempotencyKey = clean(command.idempotency_key)
    || clean(job.correlation_id)
    || clean(job.id)
    || crypto.randomUUID();
  const chunkIdempotencyKey = `${baseIdempotencyKey}:chunk:${cursor}`;
  const actor = job.payload?.actor && typeof job.payload.actor === "object" ? job.payload.actor : {};
  const payload = {
    ...command,
    ids: chunkIds,
    idempotency_key: chunkIdempotencyKey,
    _job_id: clean(job.id),
    _actor_id: clean(actor.id),
    _actor_name: clean(actor.name) || clean(actor.email) || "ROSTA Platform Worker",
  };
  const response = await fetch(`${adminUrl.replace(/\/$/, "")}/api/products/bulk-update`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-rosta-internal-secret": internalSecret,
      "x-rosta-background-request": "1",
      "x-idempotency-key": chunkIdempotencyKey,
      "x-correlation-id": clean(job.correlation_id) || baseIdempotencyKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    throw new Error(result?.error || `Admin product bulk servisi ${response.status} döndürdü.`);
  }

  const processed = Math.min(ids.length, cursor + chunkIds.length);
  return { done: processed >= ids.length, processed, total: ids.length, result };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, error: "Supabase environment is missing." }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [{ data: config, error: configError }, { data: internalConfig }] = await Promise.all([
    supabase
      .from("commerce_worker_config")
      .select("worker_secret, admin_internal_url")
      .eq("id", true)
      .maybeSingle(),
    supabase
      .from("automation_cron_config")
      .select("secret")
      .eq("id", true)
      .maybeSingle(),
  ]);
  if (configError || !config?.worker_secret) {
    return json({ ok: false, error: configError?.message || "Commerce worker configuration is missing." }, 503);
  }
  if (request.headers.get("x-worker-secret") !== config.worker_secret) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const adminInternalUrl = clean(config.admin_internal_url) || "https://rostapanel.zeabur.app";
  const adminInternalSecret = clean(internalConfig?.secret);
  const workerId = `supabase:${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();
  const failures: Array<{ source: string; id: string; error: string }> = [];
  let published = 0;
  let completedJobs = 0;

  const { data: outboxRows, error: claimOutboxError } = await supabase.rpc("claim_commerce_outbox", {
    p_worker: workerId,
    p_limit: 100,
  });
  if (claimOutboxError) return json({ ok: false, error: `Outbox claim failed: ${claimOutboxError.message}` }, 500);

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
        p_worker: workerId,
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
        p_worker: workerId,
        p_success: false,
        p_error: message,
        p_retry_delay_seconds: Math.min(3600, 30 * Math.max(1, Number(event.attempts || 1))),
      });
    }
  }

  const { data: jobs, error: claimJobsError } = await supabase.rpc("claim_commerce_jobs", {
    p_worker: workerId,
    p_queue: "commerce",
    p_limit: 50,
  });
  if (claimJobsError) return json({ ok: false, error: `Job claim failed: ${claimJobsError.message}` }, 500);

  for (const job of jobs || []) {
    try {
      let requeued = false;
      if (job.job_type === "commerce.health_snapshot") {
        const [outboxPending, outboxDead, jobsPending, jobsDead] = await Promise.all([
          supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).in("status", ["pending", "failed", "processing"]),
          supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
          supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "failed", "running"]),
          supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
        ]);
        const checks = [
          { name: "database", status: "healthy", detail: "Supabase service-role query succeeded." },
          { name: "outbox", status: Number(outboxDead.count || 0) > 0 ? "degraded" : "healthy", pending: Number(outboxPending.count || 0), deadLetter: Number(outboxDead.count || 0) },
          { name: "jobs", status: Number(jobsDead.count || 0) > 0 ? "degraded" : "healthy", pending: Number(jobsPending.count || 0), deadLetter: Number(jobsDead.count || 0) },
        ];
        const status = checks.some((check) => check.status === "degraded") ? "degraded" : "healthy";
        const { error: snapshotError } = await supabase.from("commerce_health_snapshots").insert({ status, checks });
        if (snapshotError) throw new Error(snapshotError.message);
      } else if (job.job_type === "email.order_confirmation") {
        const orderId = clean(job.payload?.order_id);
        await sendOrderConfirmation(adminInternalUrl, serviceRoleKey, orderId);
      } else if (job.job_type === "products.bulk") {
        const chunk = await runProductBulkChunk(adminInternalUrl, adminInternalSecret, job);
        const progress = {
          total: chunk.total,
          processed: chunk.processed,
          percent: chunk.total > 0 ? Math.round((chunk.processed / chunk.total) * 100) : 100,
          state: chunk.done ? "succeeded" : "queued",
        };
        const nextPayload = { ...(job.payload || {}), cursor: chunk.processed, total: chunk.total, progress };
        const { error: progressError } = await supabase
          .from("commerce_jobs")
          .update({
            payload: nextPayload,
            ...(chunk.done ? {} : {
              status: "queued",
              run_at: new Date().toISOString(),
              locked_at: null,
              locked_by: null,
              last_error: null,
            }),
          })
          .eq("id", job.id)
          .eq("locked_by", workerId)
          .eq("status", "running");
        if (progressError) throw new Error(progressError.message);
        requeued = !chunk.done;
      } else {
        throw new Error(`No worker handler registered for ${clean(job.job_type)}.`);
      }

      if (requeued) continue;
      const { error } = await supabase.rpc("complete_commerce_job", {
        p_id: job.id,
        p_worker: workerId,
        p_success: true,
        p_error: null,
        p_retry_delay_seconds: 60,
      });
      if (error) throw new Error(error.message);
      completedJobs += 1;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown job execution error";
      failures.push({ source: "job", id: String(job.id), error: message });
      if (job.job_type === "products.bulk") {
        const total = Math.max(0, Math.trunc(Number(job.payload?.total || job.payload?.progress?.total || 0)));
        const processed = Math.max(0, Math.trunc(Number(job.payload?.cursor || job.payload?.progress?.processed || 0)));
        await supabase.from("commerce_jobs").update({
          payload: {
            ...(job.payload || {}),
            progress: {
              total,
              processed,
              percent: total > 0 ? Math.round((processed / total) * 100) : 0,
              state: "failed",
            },
          },
        }).eq("id", job.id).eq("locked_by", workerId);
      }
      await supabase.rpc("complete_commerce_job", {
        p_id: job.id,
        p_worker: workerId,
        p_success: false,
        p_error: message,
        p_retry_delay_seconds: Math.min(3600, 30 * Math.max(1, Number(job.attempts || 1))),
      });
    }
  }

  const [outboxPending, outboxDead, jobsPending, jobsDead] = await Promise.all([
    supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).in("status", ["pending", "failed", "processing"]),
    supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
    supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "failed", "running"]),
    supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
  ]);
  const checks = [
    { name: "database", status: "healthy", detail: "Supabase service-role query succeeded." },
    { name: "outbox", status: Number(outboxDead.count || 0) > 0 ? "degraded" : "healthy", pending: Number(outboxPending.count || 0), deadLetter: Number(outboxDead.count || 0) },
    { name: "jobs", status: Number(jobsDead.count || 0) > 0 ? "degraded" : "healthy", pending: Number(jobsPending.count || 0), deadLetter: Number(jobsDead.count || 0) },
  ];
  const healthStatus = checks.some((check) => check.status === "degraded") ? "degraded" : "healthy";
  await supabase.from("commerce_health_snapshots").insert({ status: healthStatus, checks });
  await supabase.from("commerce_audit_logs").insert({
    action: "commerce.worker_completed",
    entity_type: "worker_run",
    entity_id: workerId,
    actor_type: "system",
    correlation_id: workerId,
    after_data: { published, completedJobs, failures: failures.length, health: healthStatus },
    metadata: { started_at: startedAt, completed_at: new Date().toISOString(), runtime: "rosta-supabase-edge" },
  });

  return json({
    ok: failures.length === 0,
    workerId,
    published,
    completedJobs,
    failures,
    health: { status: healthStatus, checks },
  }, failures.length === 0 ? 200 : 207);
});