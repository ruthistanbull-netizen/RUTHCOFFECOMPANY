import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BATCH_SIZE = 8;
const STATUS_TIMEOUT_MS = 6_000;
const STUCK_AFTER_MS = 2 * 60_000;
const UNHEALTHY_AFTER_MS = 5 * 60_000;
const DEFAULT_STOREFRONT_URL = "https://rostacoffecompany.zeabur.app";

type PaidDraft = {
  id: string;
  order_no: string | null;
  merchant_oid: string | null;
  paid_at: string | null;
  updated_at: string | null;
};

function storefrontBaseUrl() {
  return String(
    process.env.NEXT_PUBLIC_STOREFRONT_URL
      || process.env.NEXT_PUBLIC_SITE_URL
      || DEFAULT_STOREFRONT_URL,
  ).trim().replace(/\/$/, "");
}

function ageMs(draft: PaidDraft, now = Date.now()) {
  const timestamp = new Date(draft.paid_at || draft.updated_at || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? Math.max(0, now - timestamp) : Number.POSITIVE_INFINITY;
}

async function triggerStatusRecovery(baseUrl: string, orderNo: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/paytr/status?order=${encodeURIComponent(orderNo)}`, {
      method: "GET",
      cache: "no-store",
      headers: { "user-agent": "rosta-paid-order-recovery/1.0" },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return {
      ok: response.ok && payload?.status === "paid",
      status: response.status,
      providerVerified: payload?.providerVerified === true,
      orderPending: payload?.orderPending === true,
    };
  } catch {
    return { ok: false, status: 0, providerVerified: false, orderPending: false };
  } finally {
    clearTimeout(timer);
  }
}

async function writeHealth(
  supabase: any,
  input: {
    status: "healthy" | "degraded" | "unhealthy";
    pending: number;
    oldestAgeMs: number;
    attempted: number;
    failed: number;
    storefrontBase: string;
  },
) {
  const nowIso = new Date().toISOString();
  const { data: previous } = await supabase
    .from("panel_service_health_state")
    .select("status,first_seen_at,last_alerted_at,recovered_at")
    .eq("service_key", "payment-order-finalization")
    .maybeSingle();

  const healthy = input.status === "healthy";
  const previousHealthy = !previous || previous.status === "healthy";
  const firstSeenAt = healthy
    ? nowIso
    : previousHealthy
      ? nowIso
      : String(previous.first_seen_at || nowIso);
  const recovered = healthy && previous && previous.status !== "healthy";
  const oldestSeconds = Number.isFinite(input.oldestAgeMs) ? Math.round(input.oldestAgeMs / 1000) : null;
  const detail = healthy
    ? "PayTR tahsilatları ile sipariş finalizasyonu uyumlu."
    : `${input.pending} tahsil edilmiş ödeme sipariş finalizasyonu bekliyor${oldestSeconds == null ? "" : ` · en eski ${oldestSeconds} sn`}.`;

  await supabase.from("panel_service_health_state").upsert({
    service_key: "payment-order-finalization",
    status: input.status,
    detail,
    first_seen_at: firstSeenAt,
    last_seen_at: nowIso,
    last_alerted_at: input.status === "unhealthy" && previous?.status !== "unhealthy"
      ? nowIso
      : previous?.last_alerted_at || null,
    recovered_at: recovered ? nowIso : previous?.recovered_at || null,
    metadata: {
      pendingPaidDrafts: input.pending,
      oldestAgeMs: Number.isFinite(input.oldestAgeMs) ? input.oldestAgeMs : null,
      attempted: input.attempted,
      failed: input.failed,
      storefrontBase: input.storefrontBase,
      verifiedPaymentFinalizationWatch: true,
    },
    updated_at: nowIso,
  }, { onConflict: "service_key" });

  if (input.status === "unhealthy" && previous?.status !== "unhealthy") {
    await supabase.from("admin_push_jobs").upsert({
      kind: "health",
      dedupe_key: `payment-finalization:${firstSeenAt.replace(/[^0-9]/g, "").slice(0, 14)}`,
      payload: {
        service_key: "payment-order-finalization",
        status: "unhealthy",
        title: "Tahsilat sonrası sipariş gecikmesi",
        body: detail,
        verified: true,
      },
      target_url: "/system",
    }, { onConflict: "dedupe_key", ignoreDuplicates: true });
  }
}

async function run(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!auth.internal) {
    return NextResponse.json({ ok: false, error: "Paid-order recovery yalnız internal worker tarafından çalıştırılabilir." }, { status: 403 });
  }

  const { supabase } = auth;
  const storefrontBase = storefrontBaseUrl();
  const { data: drafts, error } = await supabase
    .from("checkout_drafts")
    .select("id,order_no,merchant_oid,paid_at,updated_at")
    .eq("status", "paid")
    .is("order_id", null)
    .order("paid_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ ok: false, error: `Paid checkout taraması başarısız: ${error.message}` }, { status: 503 });
  }

  const pending = (drafts || []) as PaidDraft[];
  if (!pending.length) {
    await writeHealth(supabase, {
      status: "healthy",
      pending: 0,
      oldestAgeMs: 0,
      attempted: 0,
      failed: 0,
      storefrontBase,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, processed: 0, succeeded: 0, failed: 0, pending: 0 });
  }

  const results = await Promise.all(pending.map(async (draft) => {
    if (!draft.order_no) return { ok: false };
    return triggerStatusRecovery(storefrontBase, draft.order_no);
  }));
  const succeeded = results.filter((item) => item.ok).length;
  const failed = results.length - succeeded;

  const { data: unresolvedRows, error: unresolvedError } = await supabase
    .from("checkout_drafts")
    .select("id,order_no,merchant_oid,paid_at,updated_at")
    .eq("status", "paid")
    .is("order_id", null)
    .order("paid_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  const unresolved = unresolvedError ? pending : (unresolvedRows || []) as PaidDraft[];
  const oldestAge = unresolved.length ? Math.max(...unresolved.map((draft) => ageMs(draft))) : 0;
  const status: "healthy" | "degraded" | "unhealthy" = !unresolved.length
    ? "healthy"
    : oldestAge >= UNHEALTHY_AFTER_MS
      ? "unhealthy"
      : oldestAge >= STUCK_AFTER_MS
        ? "degraded"
        : "healthy";

  await writeHealth(supabase, {
    status,
    pending: unresolved.length,
    oldestAgeMs: oldestAge,
    attempted: pending.length,
    failed,
    storefrontBase,
  }).catch(() => undefined);

  const ok = failed === 0 && status !== "unhealthy";
  return NextResponse.json({
    ok,
    processed: pending.length,
    succeeded,
    failed,
    pending: unresolved.length,
    status,
  }, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
