import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const expected = clean(process.env.COMMERCE_HEALTH_SECRET || process.env.COMMERCE_WORKER_SECRET);
  const incoming = clean(
    request.headers.get("x-health-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "",
  );

  if (!expected || !incoming || !safeEqual(incoming, expected)) {
    return NextResponse.json({ ok: true, service: "rosta-storefront" }, {
      status: 200,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const startedAt = Date.now();
    const [database, outbox, deadLetters, jobs, emailPending, emailFailed, latestSnapshot] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }).limit(1),
      supabase.from("commerce_outbox").select("id", { count: "exact", head: true }).in("status", ["pending", "processing", "failed"]),
      supabase.from("commerce_dead_letters").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("commerce_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running", "failed"]),
      supabase.from("email_logs").select("id", { count: "exact", head: true }).in("status", ["queued", "sending"]),
      supabase.from("email_logs").select("id", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("commerce_health_snapshots").select("status, checks, generated_at").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const checks = [
      { name: "database", status: database.error ? "unhealthy" : "healthy", latencyMs: Date.now() - startedAt, detail: database.error?.message || null },
      { name: "outbox", status: outbox.error ? "unhealthy" : "healthy", pending: Number(outbox.count || 0), detail: outbox.error?.message || null },
      { name: "dead_letters", status: deadLetters.error ? "unhealthy" : Number(deadLetters.count || 0) > 0 ? "degraded" : "healthy", open: Number(deadLetters.count || 0), detail: deadLetters.error?.message || null },
      { name: "jobs", status: jobs.error ? "unhealthy" : "healthy", pending: Number(jobs.count || 0), detail: jobs.error?.message || null },
      { name: "email", status: emailPending.error || emailFailed.error ? "unhealthy" : Number(emailFailed.count || 0) > 0 ? "degraded" : "healthy", pending: Number(emailPending.count || 0), failed: Number(emailFailed.count || 0), detail: emailPending.error?.message || emailFailed.error?.message || null },
    ];
    const status = checks.some((check) => check.status === "unhealthy")
      ? "unhealthy"
      : checks.some((check) => check.status === "degraded")
        ? "degraded"
        : "healthy";

    return NextResponse.json({
      ok: status !== "unhealthy",
      service: "rosta-storefront",
      status,
      checks,
      latestSnapshot: latestSnapshot.error ? null : latestSnapshot.data,
      timestamp: new Date().toISOString(),
    }, { status: status === "unhealthy" ? 503 : 200, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      service: "rosta-storefront",
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Commerce health check failed.",
      timestamp: new Date().toISOString(),
    }, { status: 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  }
}
