import { after, NextResponse } from "next/server";
import {
  resilientFetch,
  resolveInternalServiceBaseUrl,
  joinInternalServiceUrl,
} from "@ruth-commerce/commerce-core";
import { requireAdmin } from "@/lib/auth";
import { enqueueDailyBackupPushIfDue } from "@/lib/dailyBackupPush";
import { kickAdminPushWorker } from "@/lib/pushWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

const PRIMARY_TIMEOUT_MS = 30_000;
const DELIVERY_TIMEOUT_MS = 10_000;
const PAYMENT_RECOVERY_TIMEOUT_MS = 15_000;
const SELF_HEAL_TIMEOUT_MS = 8_000;
const PUSH_TIMEOUT_MS = 8_000;

function internalBaseCandidates(configuredBaseUrl: string): string[] {
  const preferLoopback = Boolean(
    String(process.env.ZEABUR_SERVICE_ID || "").trim()
      || String(process.env.ZEABUR_PROJECT_ID || "").trim(),
  );
  const primary = resolveInternalServiceBaseUrl({
    configuredBaseUrl,
    internalBaseUrl: process.env.INTERNAL_SERVICE_BASE_URL,
    port: process.env.PORT,
    preferLoopback,
  });
  const fallback = configuredBaseUrl.replace(/\/$/, "");
  return primary && primary !== fallback ? [primary, fallback] : [fallback];
}

async function callInternal(
  baseUrl: string,
  secret: string,
  routePath: string,
  source: string,
  timeoutMs: number,
) {
  const started = Date.now();
  let lastError: unknown = null;
  const candidates = internalBaseCandidates(baseUrl);

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      const response = await resilientFetch(
        index === 0 ? `rosta-panel-self:${routePath}` : `rosta-panel-public-fallback:${routePath}`,
        joinInternalServiceUrl(candidate, routePath),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-rosta-internal-secret": secret,
            "x-rosta-platform-tick": "1",
            "x-rosta-retry-owner": "commerce-core-internal-transport",
            "user-agent": "rosta-platform-orchestrator/core-transport",
          },
          body: JSON.stringify({ source }),
          cache: "no-store",
        },
        {
          timeoutMs,
          retries: 1,
          baseDelayMs: 150,
          maxConcurrent: 6,
          failureThreshold: 3,
          resetAfterMs: 15_000,
          retryUnsafe: true,
          retryTimeouts: false,
        },
      );

      const payload = await response.json().catch(() => ({}));
      return {
        ok: response.ok && payload?.ok !== false,
        status: response.status,
        durationMs: Date.now() - started,
        skipped: payload?.skipped === true,
        processed: Number(payload?.processed || 0),
        succeeded: Number(payload?.succeeded || 0),
        failed: Number(payload?.failed || 0),
        pending: Number(payload?.pending || 0),
        autoRepairs: Number(payload?.autoRepairs || 0),
        manualAttention: Number(payload?.manualAttention || 0),
        recoveryStatus: payload?.status ? String(payload.status) : undefined,
        error: response.ok ? undefined : String(payload?.error || `${response.status} response`),
      };
    } catch (caught) {
      lastError = caught;
    }
  }

  return {
    ok: false,
    status: 0,
    durationMs: Date.now() - started,
    error: lastError instanceof Error ? lastError.message : "internal task failed",
  };
}

async function runPushCycle() {
  const backupReminder = await enqueueDailyBackupPushIfDue();
  if (!backupReminder.ok) {
    console.warn("[rosta-platform-tick] daily backup reminder enqueue failed", backupReminder);
  }
  const push = await kickAdminPushWorker();
  return { ...push, backupReminder };
}

async function boundedPushWorker() {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const result = await Promise.race([
      runPushCycle(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("push worker timeout")), PUSH_TIMEOUT_MS);
      }),
    ]);
    return { ...result, durationMs: Date.now() - started };
  } catch (caught) {
    return {
      ok: false,
      durationMs: Date.now() - started,
      error: caught instanceof Error ? caught.message : "push worker failed",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function run(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!auth.internal || !auth.internalSecret) {
    return NextResponse.json(
      { ok: false, error: "ROSTA platform tick yalnızca internal worker tarafından çalıştırılabilir." },
      { status: 403 },
    );
  }

  const { data: runtimeConfig, error: runtimeConfigError } = await auth.supabase
    .from("automation_cron_config")
    .select("admin_base_url,secret")
    .eq("id", true)
    .maybeSingle();

  if (runtimeConfigError || !runtimeConfig?.admin_base_url || !runtimeConfig?.secret) {
    return NextResponse.json(
      {
        ok: false,
        error: runtimeConfigError?.message || "ROSTA canonical platform runtime configuration is missing.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const baseUrl = String(runtimeConfig.admin_base_url).replace(/\/$/, "");
  const secret = String(runtimeConfig.secret);
  const now = new Date();
  const minute = now.getUTCMinutes();
  const bucket = Math.floor(now.getTime() / 60_000);
  const maintenanceDue = minute % 5 === 3;

  const [delivery, paymentRecovery, selfHeal, push] = await Promise.all([
    callInternal(
      baseUrl,
      secret,
      "/api/internal/platform-delivery-worker",
      `rosta_platform_tick:${bucket}:delivery`,
      DELIVERY_TIMEOUT_MS,
    ),
    callInternal(
      baseUrl,
      secret,
      "/api/internal/paid-order-recovery",
      `rosta_platform_tick:${bucket}:paid-order-recovery`,
      PAYMENT_RECOVERY_TIMEOUT_MS,
    ),
    callInternal(
      baseUrl,
      secret,
      "/api/internal/self-heal",
      `rosta_platform_tick:${bucket}:self-heal`,
      SELF_HEAL_TIMEOUT_MS,
    ),
    boundedPushWorker(),
  ]);

  after(async () => {
    const tasks = [
      {
        path: "/api/internal/service-health-monitor-v4",
        name: "health-v4",
        source: `rosta_platform_tick:${bucket}:health-v4`,
      },
      ...(maintenanceDue
        ? [{
            path: "/api/internal/panel-maintenance",
            name: "maintenance",
            source: `rosta_platform_tick:${bucket}:maintenance`,
          }]
        : []),
    ];

    const results = await Promise.all(
      tasks.map(async (task) => ({
        task: task.name,
        result: await callInternal(baseUrl, secret, task.path, task.source, PRIMARY_TIMEOUT_MS),
      })),
    );

    for (const item of results) {
      if (!item.result.ok) {
        console.warn("[rosta-platform-tick] background task failed", {
          bucket,
          task: item.task,
          result: item.result,
        });
      }
    }
  });

  const durableOk = delivery.ok && paymentRecovery.ok && selfHeal.ok && push.ok;
  if (!durableOk) {
    console.warn("[rosta-platform-tick] durable task failed", {
      bucket,
      delivery,
      paymentRecovery,
      selfHeal,
      push,
    });
  }

  return NextResponse.json(
    {
      ok: durableOk,
      accepted: true,
      bucket,
      healthMonitor: "v4",
      maintenanceDue,
      durableDelivery: delivery,
      durablePaymentRecovery: paymentRecovery,
      durableSelfHeal: selfHeal,
      durablePush: push,
      acceptedAt: now.toISOString(),
    },
    {
      status: durableOk ? 202 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
