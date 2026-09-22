import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "Supabase environment is missing." }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: config, error: configError } = await supabase
    .from("commerce_worker_config")
    .select("worker_secret,enabled")
    .eq("id", true)
    .maybeSingle();

  if (configError || !config?.worker_secret || config.enabled === false) {
    return json({ ok: false, error: configError?.message || "ROSTA commerce worker configuration is missing or disabled." }, 503);
  }
  if (request.headers.get("x-worker-secret") !== config.worker_secret) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const workerId = `rosta-supabase:${crypto.randomUUID()}`;
  const startedAt = new Date().toISOString();
  const failures: Array<{ source: string; id: string; error: string }> = [];
  let published = 0;
  let completedJobs = 0;

  const { data: outboxRows, error: claimOutboxError } = await supabase.rpc("claim_commerce_outbox", {
    p_worker: workerId,
    p_limit: 100,
  });
  if (claimOutboxError) {
    return json({ ok: false, error: `Outbox claim failed: ${claimOutboxError.message}` }, 500);
  }

  for (const event of outboxRows || []) {
    try {
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
        p_retry_delay_seconds: 60,
      });
    }
  }

  const { data: jobs, error: claimJobsError } = await supabase.rpc("claim_commerce_jobs", {
    p_worker: workerId,
    p_queue: "commerce",
    p_limit: 50,
  });
  if (claimJobsError) {
    return json({ ok: false, error: `Job claim failed: ${claimJobsError.message}` }, 500);
  }

  for (const job of jobs || []) {
    try {
      if (job.job_type === "commerce.health_snapshot") {
        const [outboxPending, outboxDead, jobsPending, jobsDead] = await Promise.all([
          supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).in("status", ["pending", "failed", "processing"]),
          supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
          supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "failed", "running"]),
          supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).eq("status", "dead_letter"),
        ]);
        const checks = [
          { name: "database", status: "healthy", detail: "ROSTA Supabase service-role query succeeded." },
          { name: "outbox", status: Number(outboxDead.count || 0) > 0 ? "degraded" : "healthy", pending: Number(outboxPending.count || 0), deadLetter: Number(outboxDead.count || 0) },
          { name: "jobs", status: Number(jobsDead.count || 0) > 0 ? "degraded" : "healthy", pending: Number(jobsPending.count || 0), deadLetter: Number(jobsDead.count || 0) },
        ];
        const status = checks.some((check) => check.status === "degraded") ? "degraded" : "healthy";
        const { error: snapshotError } = await supabase.from("commerce_health_snapshots").insert({ status, checks });
        if (snapshotError) throw new Error(snapshotError.message);
      } else {
        throw new Error(`ROSTA worker handler is not registered yet for ${clean(job.job_type)}.`);
      }

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
      await supabase.rpc("complete_commerce_job", {
        p_id: job.id,
        p_worker: workerId,
        p_success: false,
        p_error: message,
        p_retry_delay_seconds: 120,
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
    { name: "database", status: "healthy", detail: "ROSTA Supabase service-role query succeeded." },
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
