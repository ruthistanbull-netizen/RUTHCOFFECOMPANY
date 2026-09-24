import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { dependencySnapshots } from "@/lib/platformResilience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIAGNOSTIC_TIMEOUT_MS = 3_000;

async function withTimeout<T>(value: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(value),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), DIAGNOSTIC_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  let slo: any[] = [];
  let errorBudgets: any[] = [];
  let latestRecoveryDrill: any = null;
  const errors: string[] = [];

  const [sloResult, budgetResult, drillResult] = await Promise.allSettled([
    withTimeout(auth.supabase.rpc("platform_slo_snapshot"), "SLO snapshot"),
    withTimeout(auth.supabase.rpc("platform_error_budget_snapshot"), "error budget snapshot"),
    withTimeout(
      auth.supabase.from("platform_recovery_drills").select("status,checks,missing_objects,ran_at").order("ran_at", { ascending: false }).limit(1).maybeSingle(),
      "recovery drill",
    ),
  ]);

  if (sloResult.status === "fulfilled" && !sloResult.value.error) slo = Array.isArray(sloResult.value.data) ? sloResult.value.data : [];
  else errors.push("SLO snapshot alınamadı.");

  if (budgetResult.status === "fulfilled" && !budgetResult.value.error) errorBudgets = Array.isArray(budgetResult.value.data) ? budgetResult.value.data : [];
  else errors.push("Error budget snapshot alınamadı.");

  if (drillResult.status === "fulfilled" && !drillResult.value.error) latestRecoveryDrill = drillResult.value.data || null;
  else errors.push("Recovery drill sonucu alınamadı.");

  const dependencies = dependencySnapshots();
  const openCircuits = dependencies.filter((item) => item.circuit !== "closed");
  const breached = slo.filter((item) => item?.within_slo === false);
  const exhaustedBudgets = errorBudgets.filter((item) => item?.exhausted === true);
  const recoveryHealthy = !latestRecoveryDrill || latestRecoveryDrill.status === "passed";
  const healthy = errors.length === 0
    && openCircuits.length === 0
    && breached.length === 0
    && exhaustedBudgets.length === 0
    && recoveryHealthy;

  const issueParts = [
    openCircuits.length ? `açık circuit: ${openCircuits.map((item) => item.name).join(", ")}` : "",
    breached.length ? `SLO ihlali: ${breached.map((item) => item.service).join(", ")}` : "",
    exhaustedBudgets.length ? `error budget tükendi: ${exhaustedBudgets.map((item) => item.service).join(", ")}` : "",
    !recoveryHealthy ? "son DR kontrolü başarısız" : "",
    ...errors,
  ].filter(Boolean);

  return NextResponse.json({
    ok: healthy,
    status: healthy ? "healthy" : "degraded",
    error: healthy ? null : `Platform sağlığı bozuldu · ${issueParts.join(" · ")}`,
    dependencies,
    slo,
    errorBudgets,
    latestRecoveryDrill,
    telemetryErrors: errors,
    openCircuits: openCircuits.map((item) => item.name),
    breachedServices: breached.map((item) => item.service),
    exhaustedErrorBudgets: exhaustedBudgets.map((item) => item.service),
    checkedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
