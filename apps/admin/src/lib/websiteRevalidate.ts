import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getStorefrontRevalidationSecret } from "@/lib/storefrontRevalidationSecret";
import { ROSTA_STORE_URL } from "@/lib/platform";

export type WebsiteRevalidateResult = {
  ok: boolean;
  skipped?: boolean;
  deferred?: boolean;
  durable?: boolean;
  status?: number;
  message?: string;
  scope?: "all" | "catalog" | "theme" | "discounts";
  attempts?: number;
};

export type WebsiteRevalidateScope = "all" | "catalog" | "theme" | "discounts";
export type WebsiteRevalidateInput = {
  source: string;
  scope?: WebsiteRevalidateScope;
  paths?: string[];
  tags?: string[];
  productIds?: string[];
  immediate?: boolean;
};

const REVALIDATE_ATTEMPT_TIMEOUT_MS = 1_500;
const DURABLE_ENQUEUE_BUDGET_MS = 220;

type DurableJob = { id: string; dedupeKey: string };

function inferScope(source: string): WebsiteRevalidateScope {
  const normalized = String(source || "").toLocaleLowerCase("en-US");
  if (normalized.includes("theme") || normalized.includes("appearance") || normalized.includes("storefront")) return "theme";
  if (normalized.includes("discount") || normalized.includes("campaign") || normalized.includes("coupon")) return "discounts";
  if (
    normalized.includes("product") || normalized.includes("catalog") || normalized.includes("category") ||
    normalized.includes("collection") || normalized.includes("review") || normalized.includes("inventory") || normalized.includes("stock")
  ) return "catalog";
  return "all";
}

function pause(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function payloadFor(input: WebsiteRevalidateInput) {
  const scope = input.scope || inferScope(input.source);
  return {
    source: input.source,
    scope,
    paths: input.paths || ["/", "/products", "/collections", "/categories"],
    tags: input.tags || ["rosta-products", "rosta-categories", "rosta-collections", "rosta-theme"],
    productIds: input.productIds || [],
  } satisfies WebsiteRevalidateInput & { scope: WebsiteRevalidateScope; paths: string[]; tags: string[]; productIds: string[] };
}

function resolveTarget(input: WebsiteRevalidateInput) {
  const baseUrl = (
    process.env.WEBSITE_REVALIDATE_URL || process.env.NEXT_PUBLIC_STOREFRONT_URL ||
    process.env.STOREFRONT_ORIGIN || process.env.PUBLIC_SITE_URL || ROSTA_STORE_URL
  ).trim().replace(/\/$/, "");
  const scope = input.scope || inferScope(input.source);
  const target = baseUrl.includes("/api/revalidate") ? baseUrl : `${baseUrl}/api/revalidate`;
  return { scope, target };
}

export async function executeWebsiteRevalidate(input: WebsiteRevalidateInput): Promise<WebsiteRevalidateResult> {
  const { scope, target } = resolveTarget(input);
  const secret = await getStorefrontRevalidationSecret();
  if (!secret) {
    return { ok: false, skipped: true, scope, attempts: 0, message: "Canlı mağaza yenileme bağlantısı hazırlanamadı; önbellek süresi dolunca yenilenecek." };
  }

  const payload = payloadFor(input);
  let lastStatus: number | undefined;
  let lastMessage = "Website revalidate çağrısı başarısız.";
  let attempts = 0;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    try {
      const response = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-revalidate-secret": secret,
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ ...payload, at: new Date().toISOString() }),
        cache: "no-store",
        signal: AbortSignal.timeout(REVALIDATE_ATTEMPT_TIMEOUT_MS),
      });
      const data = await response.json().catch(() => ({}));
      lastStatus = response.status;
      if (response.ok && data?.ok === true && data?.revalidated === true) return { ok: true, status: response.status, scope, attempts: attempt };
      lastMessage = data?.error || "Website cache temizlenemedi.";
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) break;
    } catch (error) {
      lastMessage = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        ? "Website cache yenileme isteği zaman aşımına uğradı."
        : error instanceof Error ? error.message : "Website revalidate çağrısı başarısız.";
    }
    if (attempt < 2) await pause(80);
  }
  return { ok: false, status: lastStatus, scope, attempts, message: lastMessage };
}

function deliveryDedupeKey() {
  // Two saves of the same product/scope can contain different values. A recently
  // completed delivery must never suppress recovery of a subsequent save.
  return `storefront-revalidate:${randomUUID()}`;
}

async function enqueueDurableDelivery(input: WebsiteRevalidateInput): Promise<DurableJob | null> {
  const dedupeKey = deliveryDedupeKey();
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const supabase = getSupabaseAdmin();
    const result = await Promise.race([
      Promise.resolve(
        supabase.from("platform_delivery_jobs").upsert({
          kind: "storefront-revalidate",
          dedupe_key: dedupeKey,
          payload: payloadFor(input),
          status: "pending",
          available_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id,dedupe_key").maybeSingle(),
      ),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("durable storefront enqueue timeout")), DURABLE_ENQUEUE_BUDGET_MS);
      }),
    ]);
    if (result.error) throw new Error(result.error.message);
    if (result.data?.id) return { id: String(result.data.id), dedupeKey: String(result.data.dedupe_key || dedupeKey) };

    return null;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "durable enqueue failed";
    if (!/platform_delivery_jobs|does not exist|schema cache|durable storefront enqueue timeout/i.test(message)) {
      console.warn("[storefront-delivery] durable enqueue failed", message);
    }
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function acknowledgeImmediateDelivery(job: DurableJob) {
  try {
    await getSupabaseAdmin().from("platform_delivery_jobs").update({
      status: "succeeded",
      completed_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", job.id).in("status", ["pending", "failed"]);
  } catch {}
}

/**
 * User saves await cache invalidation, concurrently with bounded durable recovery
 * persistence. Background maintenance may explicitly opt into after-response
 * delivery with immediate: false. The worker retries failures with backoff/DLQ.
 */
export async function revalidateWebsite(input: WebsiteRevalidateInput): Promise<WebsiteRevalidateResult> {
  const { scope } = resolveTarget(input);
  const secret = await getStorefrontRevalidationSecret();
  if (!secret) {
    return { ok: false, skipped: true, scope, attempts: 0, message: "Canlı mağaza yenileme bağlantısı hazırlanamadı; önbellek süresi dolunca yenilenecek." };
  }

  if (input.immediate !== false) {
    const [durableJob, result] = await Promise.all([
      enqueueDurableDelivery(input),
      executeWebsiteRevalidate(input),
    ]);
    if (result.ok) {
      if (durableJob) after(() => acknowledgeImmediateDelivery(durableJob));
      return {
        ...result,
        deferred: false,
        durable: Boolean(durableJob),
        message: "Canlı mağaza önbelleği anında yenilendi.",
      };
    }

    if (!result.skipped) {
      console.warn("[storefront-delivery] immediate revalidate failed; durable worker will retry", {
        source: input.source, scope: result.scope, status: result.status, message: result.message,
        durable: Boolean(durableJob),
      });
    }
    if (durableJob) {
      return {
        ok: false,
        deferred: true,
        durable: true,
        scope,
        status: result.status,
        attempts: result.attempts,
        message: result.message || "Anlık yenileme gecikti; kalıcı teslim işçisi tekrar deneyecek.",
      };
    }
    return result;
  }

  const durableJob = await enqueueDurableDelivery(input);
  after(async () => {
    const result = await executeWebsiteRevalidate(input);
    if (result.ok && durableJob) {
      await acknowledgeImmediateDelivery(durableJob);
      return;
    }
    if (!result.ok && !result.skipped) {
      console.warn("[storefront-delivery] immediate revalidate failed; durable worker will retry", {
        source: input.source, scope: result.scope, status: result.status, message: result.message,
        durable: Boolean(durableJob),
      });
    }
  });

  return {
    ok: true,
    deferred: true,
    durable: Boolean(durableJob),
    scope,
    attempts: 0,
    message: durableJob ? "Storefront yenilemesi kalıcı teslim kuyruğuna alındı." : "Storefront yenilemesi post-commit olarak başlatıldı.",
  };
}

export function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "X-ROSTA-Revalidation-Version": "2.1",
  };
}
