import { NextResponse } from "next/server";
import { resilientFetch, resolveInternalServiceBaseUrl, joinInternalServiceUrl } from "@ruth-commerce/commerce-core";
import { requireAdmin } from "@/lib/auth";
import { kickAdminPushWorker } from "@/lib/pushWorker";
import { executeWebsiteRevalidate } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type MaintenanceResult = { key: string; path: string; ok: boolean; durationMs: number; detail: string; payload?: any };

function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }); }

function internalBaseCandidates(configuredBaseUrl: string): string[] {
  const preferLoopback = Boolean(String(process.env.ZEABUR_SERVICE_ID || "").trim() || String(process.env.ZEABUR_PROJECT_ID || "").trim());
  const primary = resolveInternalServiceBaseUrl({
    configuredBaseUrl,
    internalBaseUrl: process.env.INTERNAL_SERVICE_BASE_URL,
    port: process.env.PORT,
    preferLoopback,
  });
  return [...new Set([primary, configuredBaseUrl.replace(/\/$/, "")].filter((value): value is string => Boolean(value)))];
}

async function invoke(baseUrl: string, fallbackBaseUrl: string, secret: string, key: string, path: string, timeoutMs = 50_000): Promise<MaintenanceResult> {
  const started = Date.now();
  const candidates = internalBaseCandidates(baseUrl);
  let lastError: unknown = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const dependency = index === 0 ? `panel-self:${key}` : `panel-public-fallback:${key}`;
    try {
      const response = await resilientFetch(
        dependency,
        joinInternalServiceUrl(candidate, path),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-rosta-internal-secret": secret,
            "x-ruth-cache-bypass": "1",
            "x-rosta-panel-maintenance": "1",
            "x-rosta-retry-owner": "commerce-core-internal-transport",
            "user-agent": "rosta-panel-maintenance/2.0",
          },
          body: "{}",
          cache: "no-store",
        },
        {
          timeoutMs,
          retries: 1,
          baseDelayMs: 150,
          maxConcurrent: 4,
          failureThreshold: 3,
          resetAfterMs: 15_000,
          retryUnsafe: true,
          retryTimeouts: false,
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || (payload?.ok === false && payload?.error)) {
        return {
          key,
          path,
          ok: false,
          durationMs: Date.now() - started,
          detail: String(payload?.error || `${response.status} yanıtı alındı.`),
          payload,
        };
      }
      return {
        key,
        path,
        ok: true,
        durationMs: Date.now() - started,
        detail: key === "orders-reconcile"
          ? `Sipariş uzlaştırması tamamlandı${payload?.updated != null ? ` · ${payload.updated} kayıt güncellendi` : ""}.`
          : `Kargo uzlaştırması tamamlandı${payload?.removed != null ? ` · ${payload.removed} kaldırılmış gönderi işlendi` : ""}.`,
        payload,
      };
    } catch (caught) {
      lastError = caught;
      if (index === candidates.length - 1) break;
    }
  }

  return {
    key,
    path,
    ok: false,
    durationMs: Date.now() - started,
    detail: lastError instanceof Error ? lastError.message : "Bakım görevi çalıştırılamadı.",
  };
}

async function repairStorefrontReadModel(supabase: any): Promise<MaintenanceResult> {
  const started = Date.now();
  const path = "rpc:repair_storefront_product_read_models";
  try {
    const { data, error } = await supabase.rpc("repair_storefront_product_read_models", { p_limit: 250 });
    if (error) {
      const message = String(error.message || "Storefront read-model bakım RPC'si çalışmadı.");
      const migrationPending = /PGRST202|could not find the function|schema cache/i.test(message);
      return { key: "storefront-read-model", path, ok: migrationPending, durationMs: Date.now() - started, detail: migrationPending ? "Storefront read-model self-heal migrationı henüz uygulanmamış; bakım görevi geçici olarak atlandı." : message, payload: { skipped: migrationPending, error: message } };
    }
    const payload = data && typeof data === "object" ? data as Record<string, any> : {};
    const repaired = Number(payload.repaired || 0);
    const triggerRepairs = Number(payload.triggerRepairs || 0);
    const orphanDeleted = Number(payload.orphanDeleted || 0);
    const changed = Number(payload.changed || repaired + triggerRepairs + orphanDeleted);
    let cacheRevalidate: Awaited<ReturnType<typeof executeWebsiteRevalidate>> | null = null;
    if (changed > 0) cacheRevalidate = await executeWebsiteRevalidate({ source: "storefront-read-model-repair", scope: "catalog" });
    const projectionHealthy = payload.ok !== false && payload.health?.healthy !== false;
    const cacheHealthy = !cacheRevalidate || cacheRevalidate.ok === true;
    const ok = projectionHealthy && cacheHealthy;
    const health = payload.health || {};
    return {
      key: "storefront-read-model",
      path,
      ok,
      durationMs: Date.now() - started,
      detail: changed > 0
        ? `Storefront read-model otomatik onarıldı · ${repaired} projection · ${triggerRepairs} trigger · ${orphanDeleted} orphan${cacheHealthy ? " · cache yenilendi" : " · cache yenilemesi başarısız"}.`
        : `Storefront read-model sağlıklı · ${Number(health.activeReadModels || 0)} aktif projection · drift yok.`,
      payload: { ...payload, changed, cacheRevalidate },
    };
  } catch (caught) {
    return { key: "storefront-read-model", path, ok: false, durationMs: Date.now() - started, detail: caught instanceof Error ? caught.message : "Storefront read-model bakımı çalıştırılamadı." };
  }
}

function changedCount(result: MaintenanceResult) {
  if (!result.ok || !result.payload || typeof result.payload !== "object") return 0;
  const payload = result.payload as Record<string, unknown>;
  return ["updated", "removed", "created", "deleted", "changed", "repaired", "triggerRepairs", "orphanDeleted"]
    .map((key) => Number(payload[key] || 0)).filter((value) => Number.isFinite(value) && value > 0).reduce((sum, value) => sum + value, 0);
}

async function updateHealth(supabase: any, result: MaintenanceResult) {
  const now = new Date();
  const { data: previous } = await supabase.from("panel_service_health_state").select("status,last_alerted_at,first_seen_at").eq("service_key", result.key).maybeSingle();
  const status = result.ok ? "healthy" : "degraded";
  const wasProblem = previous?.status && previous.status !== "healthy";
  const lastAlertedAt = previous?.last_alerted_at ? new Date(previous.last_alerted_at).getTime() : 0;
  const shouldAlert = !result.ok && (!wasProblem || !lastAlertedAt || now.getTime() - lastAlertedAt > 30 * 60_000);
  await supabase.from("panel_service_health_state").upsert({ service_key: result.key, status, detail: result.detail, first_seen_at: previous?.first_seen_at || now.toISOString(), last_seen_at: now.toISOString(), last_alerted_at: shouldAlert ? now.toISOString() : previous?.last_alerted_at || null, recovered_at: result.ok && wasProblem ? now.toISOString() : null, metadata: { path: result.path, durationMs: result.durationMs, changedCount: changedCount(result) }, updated_at: now.toISOString() }, { onConflict: "service_key" });
  if (shouldAlert) {
    const bucket = Math.floor(now.getTime() / (30 * 60_000));
    await supabase.from("admin_push_jobs").insert({ kind: "health", dedupe_key: `health:${result.key}:degraded:${bucket}`, payload: { service_key: result.key, status: "degraded", title: "Ruth Panel bakım uyarısı", body: result.detail }, target_url: "/system" });
  }
  return shouldAlert;
}

async function run(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { data: config, error } = await auth.supabase.from("automation_cron_config").select("admin_base_url,secret").eq("id", true).maybeSingle();
  if (error || !config?.admin_base_url || !config?.secret) return json({ ok: false, error: error?.message || "Bakım worker yapılandırması bulunamadı." }, 503);
  const configuredBaseUrl = String(config.admin_base_url).replace(/\/$/, "");
  const secret = String(config.secret);
  const results = await Promise.all([
    invoke(configuredBaseUrl, configuredBaseUrl, secret, "orders-reconcile", "/api/orders/reconcile"),
    invoke(configuredBaseUrl, configuredBaseUrl, secret, "shipping-reconcile", "/api/shipping/basit-kargo/reconcile"),
    repairStorefrontReadModel(auth.supabase),
  ]);
  let alertQueued = false;
  for (const result of results) alertQueued = (await updateHealth(auth.supabase, result)) || alertQueued;
  if (alertQueued) void kickAdminPushWorker();
  const ordersResult = results.find((item) => item.key === "orders-reconcile");
  const shippingResult = results.find((item) => item.key === "shipping-reconcile");
  const storefrontResult = results.find((item) => item.key === "storefront-read-model");
  const ordersChanged = ordersResult ? changedCount(ordersResult) > 0 : false;
  const shippingChanged = shippingResult ? changedCount(shippingResult) > 0 : false;
  const storefrontChanged = storefrontResult ? changedCount(storefrontResult) > 0 : false;
  if (ordersChanged) await auth.supabase.rpc("request_panel_sync", { p_scope: "orders", p_reason: "backend_reconcile_changed" });
  if (shippingChanged) await auth.supabase.rpc("request_panel_sync", { p_scope: "shipping", p_reason: "backend_reconcile_changed" });
  return json({ ok: results.every((item) => item.ok), results, changes: { orders: ordersChanged, shipping: shippingChanged, storefrontCatalog: storefrontChanged }, alertsQueued: alertQueued, completedAt: new Date().toISOString() }, results.every((item) => item.ok) ? 200 : 207);
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
