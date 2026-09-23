import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

type CheckResult<T> = {
  ok: boolean;
  value: T | null;
  durationMs: number;
  error: string | null;
};

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

async function timed<T>(task: () => Promise<T>): Promise<CheckResult<T>> {
  const started = nowMs();
  try {
    return {
      ok: true,
      value: await task(),
      durationMs: Math.max(0, Math.round(nowMs() - started)),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      value: null,
      durationMs: Math.max(0, Math.round(nowMs() - started)),
      error: error instanceof Error ? error.message : String(error || "Bilinmeyen hata"),
    };
  }
}

function countOrThrow(result: { count: number | null; error: { message?: string } | null }) {
  if (result.error) throw new Error(result.error.message || "Count sorgusu başarısız.");
  return Number(result.count || 0);
}

function safeHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return "invalid-url";
  }
}

function parseContentRangeCount(value: string | null) {
  if (!value) return null;
  const match = value.match(/\/(\d+|\*)$/);
  if (!match || match[1] === "*") return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

async function rawRestCount(path: string, query: string) {
  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY eksik.");

  const url = `${supabaseUrl}/rest/v1/${path}?${query}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`PostgREST ${response.status}: ${body.slice(0, 180) || response.statusText}`);
  }
  return {
    count: parseContentRangeCount(response.headers.get("content-range")),
    contentRange: response.headers.get("content-range"),
  };
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20);
}

export async function GET(request: Request) {
  const requestStarted = nowMs();
  const authStarted = nowMs();
  const auth = await requireAdmin(request);
  const authMs = Math.max(0, Math.round(nowMs() - authStarted));
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

  const [
    productsTotal,
    productsActive,
    productsPanelVisible,
    ordersTotal,
    profilesTotal,
    customerReadModelTotal,
    customerSummary,
    storefrontActive,
    productsSample,
    ordersSample,
    panelReadModels,
    rawProductsVisible,
    rawOrdersTotal,
  ] = await Promise.all([
    timed(async () => countOrThrow(await supabase.from("products").select("id", { count: "exact", head: true }))),
    timed(async () => countOrThrow(await supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active"))),
    timed(async () => countOrThrow(await supabase.from("products").select("id", { count: "exact", head: true }).neq("status", "deleted").neq("status", "archived"))),
    timed(async () => countOrThrow(await supabase.from("orders").select("id", { count: "exact", head: true }))),
    timed(async () => countOrThrow(await supabase.from("profiles").select("id", { count: "exact", head: true }))),
    timed(async () => countOrThrow(await supabase.from("customer_read_model").select("id", { count: "exact", head: true }))),
    timed(async () => {
      const result = await supabase
        .from("customer_summary_read_model")
        .select("customer_count,member_count,non_member_count,customers_with_orders,total_paid_revenue")
        .limit(1)
        .maybeSingle();
      if (result.error) throw new Error(result.error.message);
      return result.data || null;
    }),
    timed(async () => countOrThrow(await supabase.from("storefront_product_read_models").select("product_id", { count: "exact", head: true }).eq("status", "active"))),
    timed(async () => {
      const result = await supabase.from("products").select("id,status,name").order("id", { ascending: true }).limit(5);
      if (result.error) throw new Error(result.error.message);
      return result.data || [];
    }),
    timed(async () => {
      const result = await supabase.from("orders").select("id,order_no,status,payment_status").order("id", { ascending: true }).limit(5);
      if (result.error) throw new Error(result.error.message);
      return result.data || [];
    }),
    timed(async () => {
      const result = await supabase
        .from("panel_read_models")
        .select("route_path,status,revision,refreshed_at,expires_at,duration_ms,last_error")
        .in("route_path", ["/api/products", "/api/orders", "/api/customers/list"])
        .order("route_path", { ascending: true });
      if (result.error) throw new Error(result.error.message);
      return result.data || [];
    }),
    timed(() => rawRestCount("products", "select=id&status=neq.deleted&status=neq.archived&limit=1")),
    timed(() => rawRestCount("orders", "select=id&limit=1")),
  ]);

  const identityMaterial = {
    originHost: safeHost(supabaseUrl),
    productsTotal: productsTotal.value,
    productsActive: productsActive.value,
    productsPanelVisible: productsPanelVisible.value,
    ordersTotal: ordersTotal.value,
    profilesTotal: profilesTotal.value,
    customerReadModelTotal: customerReadModelTotal.value,
    storefrontActive: storefrontActive.value,
    productsSample: productsSample.value,
    ordersSample: ordersSample.value,
  };

  const checks = {
    productsTotal,
    productsActive,
    productsPanelVisible,
    ordersTotal,
    profilesTotal,
    customerReadModelTotal,
    customerSummary,
    storefrontActive,
    productsSample,
    ordersSample,
    panelReadModels,
    rawProductsVisible,
    rawOrdersTotal,
  };

  const failedChecks = Object.entries(checks).filter(([, check]) => !check.ok).map(([name]) => name);
  const productCountMismatch = productsPanelVisible.value != null
    && rawProductsVisible.value?.count != null
    && productsPanelVisible.value !== rawProductsVisible.value.count;
  const orderCountMismatch = ordersTotal.value != null
    && rawOrdersTotal.value?.count != null
    && ordersTotal.value !== rawOrdersTotal.value.count;
  const customerSummaryCount = Number((customerSummary.value as any)?.customer_count ?? -1);
  const customerReadModelMismatch = customerReadModelTotal.value != null
    && customerSummaryCount >= 0
    && customerReadModelTotal.value !== customerSummaryCount;

  const state = failedChecks.length > 0
    ? "degraded"
    : productCountMismatch || orderCountMismatch || customerReadModelMismatch
      ? "mismatch"
      : "healthy";

  return NextResponse.json({
    ok: true,
    state,
    checkedAt: new Date().toISOString(),
    fingerprint: fingerprint(identityMaterial),
    runtime: {
      supabaseOrigin: supabaseUrl,
      supabaseHost: safeHost(supabaseUrl),
      envSource: process.env.SUPABASE_URL ? "SUPABASE_URL" : "NEXT_PUBLIC_SUPABASE_URL",
      authSource: (auth as any).authSource || "unknown",
      authContinuity: Boolean((auth as any).continuity),
      authMs,
      totalMs: Math.max(0, Math.round(nowMs() - requestStarted)),
    },
    comparison: {
      productCountMismatch,
      orderCountMismatch,
      customerReadModelMismatch,
      failedChecks,
    },
    counts: {
      productsTotal: productsTotal.value,
      productsActive: productsActive.value,
      productsPanelVisible: productsPanelVisible.value,
      productsRawPostgrest: rawProductsVisible.value?.count ?? null,
      storefrontActive: storefrontActive.value,
      ordersTotal: ordersTotal.value,
      ordersRawPostgrest: rawOrdersTotal.value?.count ?? null,
      profilesTotal: profilesTotal.value,
      customerReadModelTotal: customerReadModelTotal.value,
      customerSummaryCount: customerSummaryCount >= 0 ? customerSummaryCount : null,
    },
    checks,
  }, {
    headers: {
      ...NO_STORE_HEADERS,
      "X-ROSTA-Data-Path-State": state,
      "X-ROSTA-Data-Path-Fingerprint": fingerprint(identityMaterial),
      "Server-Timing": `auth;dur=${authMs}, total;dur=${Math.max(0, Math.round(nowMs() - requestStarted))}`,
    },
  });
}
