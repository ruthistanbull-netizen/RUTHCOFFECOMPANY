import { processShippingWebhookInbox } from "@/lib/shippingWebhookProcessor";
import { syncShipmentForOrder } from "@/lib/basitKargoShipping";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 2;
const MAX_CONCURRENCY = 4;
const LEASE_TTL_SECONDS = 90;
const LEASE_TIMEOUT_MS = 1_500;
const ACTIVE_ORDER_STATUSES = [
  "paid",
  "queued",
  "in_production",
  "quality_control",
  "processing",
  "preparing",
  "ready_to_ship",
  "shipped",
  "delivered",
];

type PollerState = {
  started: boolean;
  running: boolean;
  holder?: string;
  timer?: ReturnType<typeof setInterval>;
};

type PollCandidate = {
  id: string;
  order_no?: string | null;
  status?: string | null;
  shipping_status?: string | null;
};

type GlobalWithBasitPoller = typeof globalThis & {
  __ruthBasitKargoPoller?: PollerState;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function configuredIntervalMs() {
  const value = Number(process.env.BASIT_KARGO_POLL_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  if (!Number.isFinite(value)) return DEFAULT_INTERVAL_MS;
  return Math.max(30_000, Math.min(10 * 60_000, Math.trunc(value)));
}

function configuredBatchSize() {
  const value = Number(process.env.BASIT_KARGO_POLL_BATCH_SIZE || DEFAULT_BATCH_SIZE);
  if (!Number.isFinite(value)) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(value)));
}

function configuredConcurrency() {
  const value = Number(process.env.BASIT_KARGO_POLL_CONCURRENCY || DEFAULT_CONCURRENCY);
  if (!Number.isFinite(value)) return DEFAULT_CONCURRENCY;
  return Math.max(1, Math.min(MAX_CONCURRENCY, Math.trunc(value)));
}

function pollingEnabled() {
  return Boolean(
    process.env.BASIT_KARGO_API_TOKEN?.trim()
      && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
      && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
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

async function acquireDistributedLease(supabase: ReturnType<typeof getSupabaseAdmin>, state: PollerState) {
  state.holder ||= `commerce-core-basit-kargo:${process.pid}:${crypto.randomUUID()}`;
  try {
    const result = await withTimeout(
      supabase.rpc("try_platform_lease", {
        p_name: "commerce-core-basit-kargo-status",
        p_holder: state.holder,
        p_ttl_seconds: LEASE_TTL_SECONDS,
      }),
      LEASE_TIMEOUT_MS,
      "Commerce Core Basit Kargo lease",
    );
    if (result.error) {
      if (/try_platform_lease|does not exist|could not find|schema cache/i.test(result.error.message)) return true;
      console.warn("[commerce-core-shipping] distributed lease error; cycle skipped", result.error.message);
      return false;
    }
    return result.data === true;
  } catch (caught) {
    console.warn("[commerce-core-shipping] distributed lease unavailable; cycle skipped", caught instanceof Error ? caught.message : caught);
    return false;
  }
}

async function mapWithConcurrency<T>(rows: T[], concurrency: number, worker: (row: T) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      await worker(rows[index]);
    }
  });
  await Promise.all(runners);
}

export async function reconcileBasitKargoStatuses() {
  const globalState = globalThis as GlobalWithBasitPoller;
  const state = globalState.__ruthBasitKargoPoller || { started: false, running: false };
  globalState.__ruthBasitKargoPoller = state;

  if (state.running) {
    return { ok: true, skipped: "already_running", checked: 0, changed: 0, failed: 0, webhooks: null };
  }

  state.running = true;
  try {
    const supabase = getSupabaseAdmin();
    if (!(await acquireDistributedLease(supabase, state))) {
      return { ok: true, skipped: "lease_not_acquired", checked: 0, changed: 0, failed: 0, webhooks: null };
    }

    let webhookSummary: unknown = null;
    try {
      webhookSummary = await processShippingWebhookInbox(supabase, {
        workerId: state.holder || `commerce-core-basit-kargo:${process.pid}`,
        limit: 10,
      });
    } catch (error) {
      console.error("[commerce-core-shipping] webhook inbox cycle failed:", error instanceof Error ? error.message : error);
    }

    const { data, error } = await supabase
      .from("orders")
      .select("id,order_no,status,shipping_status,shipping_updated_at,shipping_provider,basit_kargo_order_id,basit_kargo_barcode,cargo_tracking_no")
      .eq("shipping_provider", "basit_kargo")
      .or(
        `status.in.(${ACTIVE_ORDER_STATUSES.join(",")}),shipping_status.in.(ready_for_handover,in_transit,delivered,exception)`,
      )
      .or("basit_kargo_order_id.not.is.null,basit_kargo_barcode.not.is.null,cargo_tracking_no.not.is.null")
      .order("shipping_updated_at", { ascending: true, nullsFirst: true })
      .limit(configuredBatchSize());

    if (error) throw new Error(`Aktif kargolar alınamadı: ${error.message}`);

    const rows = (data || []) as PollCandidate[];
    let changed = 0;
    let failed = 0;

    await mapWithConcurrency(rows, configuredConcurrency(), async (order) => {
      try {
        const beforeOrderStatus = clean(order.status).toLowerCase();
        const beforeShipmentStatus = clean(order.shipping_status).toLowerCase();
        const result = await syncShipmentForOrder(supabase, order.id, "commerce_core_status_sync", {
          source: "commerce_core_basit_kargo_worker",
        });
        const afterOrderStatus = clean(result.order?.status).toLowerCase();
        const afterShipmentStatus = clean(result.order?.shipping_status).toLowerCase();

        if (beforeOrderStatus !== afterOrderStatus || beforeShipmentStatus !== afterShipmentStatus) {
          changed += 1;
          console.info(
            `[commerce-core-shipping] ${clean(order.order_no) || order.id} updated: order ${beforeOrderStatus || "-"} -> ${afterOrderStatus || "-"}, shipment ${beforeShipmentStatus || "-"} -> ${afterShipmentStatus || "-"}`,
          );
        }
      } catch (error) {
        failed += 1;
        console.error(
          `[commerce-core-shipping] ${clean(order.order_no) || order.id} sync failed:`,
          error instanceof Error ? error.message : error,
        );
      }
    });

    return { ok: failed === 0, checked: rows.length, changed, failed, webhooks: webhookSummary };
  } finally {
    state.running = false;
  }
}

export function startBasitKargoStatusPoller() {
  const globalState = globalThis as GlobalWithBasitPoller;
  const state = globalState.__ruthBasitKargoPoller || { started: false, running: false };
  globalState.__ruthBasitKargoPoller = state;

  if (state.started || !pollingEnabled()) return;
  state.started = true;

  const run = async () => {
    try {
      const summary = await reconcileBasitKargoStatuses();
      if (summary.changed || summary.failed) console.info("[commerce-core-shipping] cycle", summary);
    } catch (error) {
      console.error("[commerce-core-shipping] cycle failed:", error instanceof Error ? error.message : error);
    }
  };

  const initialTimer = setTimeout(() => void run(), 2_000);
  initialTimer.unref?.();

  state.timer = setInterval(() => void run(), configuredIntervalMs());
  state.timer.unref?.();

  console.info(
    `[commerce-core-shipping] started (${configuredIntervalMs()} ms interval · batch ${configuredBatchSize()} · concurrency ${configuredConcurrency()})`,
  );
}
