import { NextResponse } from "next/server";
import {
  availableInventory,
  calculatePaymentTerms,
  calculatePricing,
  normalizePaymentSummary,
  runRuthieCoreSelfTest,
} from "@ruth-commerce/commerce-core";
import { requireAdmin } from "@/lib/auth";
import { getRuthieOpenAIStatus } from "@/lib/ruthieOpenAI";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type CoreHealthStatus = "healthy" | "warning" | "failed";

type CoreConfigurationCheck = { status: CoreHealthStatus; detail: string };
type CoreDefinition = {
  key: string;
  title: string;
  owner: string;
  description: string;
  tables: string[];
  selfTest?: () => string;
  configurationCheck?: () => CoreConfigurationCheck;
};

type MonitorRow = {
  service_key: string;
  status: string | null;
  detail: string | null;
  last_seen_at: string | null;
  metadata: Record<string, any> | null;
};

const MONITOR_FRESH_MS = 3 * 60_000;

const definitions: CoreDefinition[] = [
  { key: "catalog", title: "Catalog Engine", owner: "Ürün, varyant, kategori, koleksiyon ve medya", description: "Katalog kayıtlarının okunabildiğini ve ürün modelinin erişilebilir olduğunu doğrular.", tables: ["products", "product_variants", "categories", "collections"] },
  { key: "pricing", title: "Pricing Engine", owner: "Kesin fiyat ve para dökümü", description: "Para hesaplarının güvenli tam sayı kuruş modeliyle üretildiğini doğrular.", tables: [], selfTest: () => { const result = calculatePricing({ calculationId: "health", lines: [{ quantity: 2, unitPrice: { amountMinor: 1000, currency: "TRY" } }], shipping: { amountMinor: 100, currency: "TRY" } }); if (result.total.amountMinor !== 2100) throw new Error("Fiyat toplamı beklenen değeri üretmedi."); return "Kuruş bazlı fiyat hesabı geçti"; } },
  { key: "promotion", title: "Promotion Engine", owner: "Kampanya ve kupon kuralları", description: "Kampanya ayarlarının güvenli server-side kaynağını doğrular.", tables: ["site_settings"] },
  { key: "cart", title: "Cart Engine", owner: "Sepet ve ürün doğrulaması", description: "Sepet ve checkout taslak kayıtlarının erişilebilir olduğunu doğrular.", tables: ["checkout_drafts"] },
  { key: "checkout", title: "Checkout Engine", owner: "Müşteri, adres, izin ve ödeme öncesi akış", description: "Checkout taslaklarının ve oturumlarının erişilebilir olduğunu doğrular.", tables: ["checkout_drafts"] },
  { key: "payment", title: "Payment Engine", owner: "PayTR, taksit, callback, refund ve mutabakat", description: "Ödeme özetinin ve taksit hesabının Commerce Core içinde üretildiğini doğrular.", tables: ["payment_intents"], selfTest: () => { const terms = calculatePaymentTerms({ orderAmountMinor: 10000, installmentCount: 3, installmentRateBps: 500 }); const summary = normalizePaymentSummary({ source: "commerce_v2", status: "paid", orderAmountMinor: 10000, chargedAmountMinor: terms.chargedAmount.amountMinor, installmentCount: 3 }); if (summary.chargedAmount.amountMinor < 10000) throw new Error("Ödeme toplamı sipariş tutarından düşük."); return "Taksit ve PaymentSummary testi geçti"; } },
  { key: "order", title: "Order Engine", owner: "Sipariş state machine, snapshot ve timeline", description: "Sipariş kayıtları ve state altyapısının erişilebilir olduğunu doğrular.", tables: ["orders", "order_items", "order_timeline_events"] },
  { key: "inventory", title: "Inventory Engine", owner: "Stok, rezervasyon ve hareket defteri", description: "Stok kullanılabilirlik formülünü ve varyant kayıtlarını doğrular.", tables: ["product_variants"], selfTest: () => { const available = availableInventory({ sku: "HEALTH", onHand: 10, reserved: 2, allocated: 3, safetyStock: 1 } as any); if (available !== 4) throw new Error("Kullanılabilir stok hesabı başarısız."); return "Stok kullanılabilirlik testi geçti"; } },
  { key: "shipping", title: "Shipping Engine", owner: "Kargo, etiket, takip, webhook ve reconciliation", description: "Gönderi ve kargo hareketi kayıtlarını doğrular.", tables: ["shipping_events"] },
  { key: "customer", title: "Customer Engine", owner: "Profil, adres, izin ve segment", description: "Müşteri profillerinin erişilebilir olduğunu doğrular.", tables: ["profiles"] },
  { key: "loyalty", title: "Loyalty Engine", owner: "ROSTA Points bakiye ve hareket defteri", description: "Puan bakiyesi ve işlem kayıtlarını doğrular.", tables: ["profiles", "ruthie_point_transactions"] },
  { key: "return", title: "Return Engine", owner: "İade ve değişim yaşam döngüsü", description: "İade vakaları ve tersine operasyon kayıtlarını doğrular.", tables: ["returns_exchanges"] },
  { key: "notification", title: "Notification Engine", owner: "Hizmet ve pazarlama mesajları, retry ve consent", description: "E-posta sağlayıcısı ve gönderim loglarını doğrular.", tables: ["email_integrations", "email_logs"] },
  { key: "cms", title: "CMS Engine", owner: "Tema, içerik ve yayın ayarları", description: "Storefront içerik ve tema ayarlarının erişilebilir olduğunu doğrular.", tables: ["site_settings"] },
  { key: "event-bus", title: "Event Bus / Outbox Engine", owner: "Domain eventleri, retry ve dead-letter kuyruğu", description: "Commerce eventlerinin güvenli outbox tablosuna yazılabildiğini doğrular.", tables: ["commerce_outbox"] },
  { key: "job-queue", title: "Job Queue Engine", owner: "Arka plan görevleri, worker ve yeniden deneme", description: "Commerce worker görev kuyruğunun erişilebilir olduğunu doğrular.", tables: ["commerce_jobs"] },
  {
    key: "rosta-insight",
    title: "ROSTA Insight Core",
    owner: "Intent, araç yönlendirme, izin, onay ve connector orkestrasyonu",
    description: "ROSTA Insight'ın diğer Commerce Core motorlarına yalnız command/query gateway üzerinden eriştiğini ve riskli işlemlerde açık onay istediğini doğrular.",
    tables: [],
    selfTest: runRuthieCoreSelfTest,
    configurationCheck: () => {
      const provider = getRuthieOpenAIStatus();
      if (!provider.configured) return { status: "warning", detail: `OpenAI provider yapılandırması eksik: ${provider.missing.join(", ")}` };
      return { status: "healthy", detail: `OpenAI Chat ${provider.models.chat}, Realtime ${provider.models.realtime} ve ${provider.models.voice} sesi yapılandırıldı` };
    },
  },
];

async function tableProbe(supabase: any, table: string) {
  const startedAt = Date.now();
  const result = await supabase.from(table).select("*", { head: true }).limit(1);
  return {
    table,
    ok: !result.error,
    latencyMs: Date.now() - startedAt,
    error: result.error?.message || null,
  };
}

function monitoredStatus(liveStatus: CoreHealthStatus, row: MonitorRow | undefined) {
  const lastSeenMs = row?.last_seen_at ? new Date(row.last_seen_at).getTime() : Number.NaN;
  const fresh = Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs <= MONITOR_FRESH_MS;
  const monitorStatus = String(row?.status || "").toLowerCase();
  const verifiedFailure = row?.metadata?.verifiedFailure === true;

  if (liveStatus === "failed") {
    if (fresh && monitorStatus === "unhealthy" && verifiedFailure) return { status: "failed" as const, fresh, verifiedFailure };
    return { status: "warning" as const, fresh, verifiedFailure: false };
  }
  if (liveStatus === "warning") return { status: "warning" as const, fresh, verifiedFailure: false };
  if (fresh && monitorStatus === "degraded") return { status: "warning" as const, fresh, verifiedFailure: false };
  if (fresh && monitorStatus === "unhealthy" && verifiedFailure) return { status: "warning" as const, fresh, verifiedFailure: false };
  return { status: "healthy" as const, fresh, verifiedFailure: false };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const startedAt = Date.now();
  const monitorCaller = request.headers.get("x-rosta-service-health-monitor") === "4";

  const [liveCoresRaw, monitorResult, paymentFinalizationResult] = await Promise.all([
    Promise.all(definitions.map(async (definition) => {
      const probes = await Promise.all(definition.tables.map((table) => tableProbe(auth.supabase, table)));
      let selfTest: { ok: boolean; detail: string } | null = null;
      let configuration: CoreConfigurationCheck | null = null;

      if (definition.selfTest) {
        try { selfTest = { ok: true, detail: definition.selfTest() }; }
        catch (error) { selfTest = { ok: false, detail: error instanceof Error ? error.message : "Çekirdek öz testi başarısız." }; }
      }
      if (definition.configurationCheck) {
        try { configuration = definition.configurationCheck(); }
        catch (error) { configuration = { status: "failed", detail: error instanceof Error ? error.message : "Çekirdek yapılandırması doğrulanamadı." }; }
      }

      const failures = probes.filter((probe) => !probe.ok);
      const status: CoreHealthStatus = failures.length || selfTest?.ok === false || configuration?.status === "failed"
        ? "failed"
        : configuration?.status === "warning" ? "warning" : "healthy";
      const detail = status === "failed"
        ? [
            ...failures.map((probe) => `${probe.table}: ${probe.error}`),
            ...(selfTest?.ok === false ? [selfTest.detail] : []),
            ...(configuration?.status === "failed" ? [configuration.detail] : []),
          ].join(" · ")
        : [selfTest?.detail, configuration?.detail, probes.length ? `${probes.length} veri kaynağı erişilebilir` : null].filter(Boolean).join(" · ");

      return {
        ...definition,
        status,
        liveStatus: status,
        liveDetail: detail || "Çekirdek modülü erişilebilir",
        confirmedFailure: status === "failed",
        detail: detail || "Çekirdek modülü erişilebilir",
        probes,
        selfTest,
        configuration,
      };
    })),
    auth.supabase
      .from("panel_service_health_state")
      .select("service_key,status,detail,last_seen_at,metadata")
      .like("service_key", "commerce-core-%"),
    auth.supabase
      .from("panel_service_health_state")
      .select("status,detail,last_seen_at,metadata")
      .eq("service_key", "payment-order-finalization")
      .maybeSingle(),
  ]);

  const paymentIntegrity = paymentFinalizationResult.error ? null : paymentFinalizationResult.data;
  const paymentIntegrityStatus = String(paymentIntegrity?.status || "healthy").toLowerCase();
  const paymentIntegrityDetail = String(paymentIntegrity?.detail || "");
  const paymentIntegrityVerified = paymentIntegrity?.metadata?.verifiedPaymentFinalizationWatch === true;

  const liveCores = liveCoresRaw.map((core) => {
    if (core.key !== "payment" || !paymentIntegrity || !paymentIntegrityVerified) return core;
    if (paymentIntegrityStatus === "unhealthy") {
      const detail = [core.liveDetail, paymentIntegrityDetail].filter(Boolean).join(" · ");
      return { ...core, status: "failed" as const, liveStatus: "failed" as const, liveDetail: detail, detail, confirmedFailure: true };
    }
    if (paymentIntegrityStatus === "degraded") {
      const detail = [core.liveDetail, paymentIntegrityDetail].filter(Boolean).join(" · ");
      return { ...core, status: "warning" as const, liveStatus: "warning" as const, liveDetail: detail, detail, confirmedFailure: false };
    }
    return core;
  });

  const monitorByKey = new Map<string, MonitorRow>();
  if (!monitorResult.error) {
    for (const row of (monitorResult.data || []) as MonitorRow[]) monitorByKey.set(String(row.service_key), row);
  }

  const cores = liveCores.map((core) => {
    const row = monitorByKey.get(`commerce-core-${core.key}`);
    const monitored = monitoredStatus(core.liveStatus, row);
    const monitorDetail = row?.detail || null;
    const detail = monitored.status === "failed"
      ? monitorDetail || core.detail
      : core.liveStatus === "failed"
        ? `${core.detail} · 24/7 izleyici ikinci doğrulamayı bekliyor; henüz çekirdek hatası sayılmadı.`
        : core.detail;

    return {
      ...core,
      status: monitored.status,
      detail,
      monitor: {
        status: row?.status || null,
        detail: monitorDetail,
        lastSeenAt: row?.last_seen_at || null,
        fresh: monitored.fresh,
        verifiedFailure: monitored.verifiedFailure,
        verifiedFailureStreak: Number(row?.metadata?.verifiedFailureStreak || 0),
        verificationThreshold: Number(row?.metadata?.verificationThreshold || 2),
        latencyMs: Number(row?.metadata?.latencyMs || 0) || null,
      },
    };
  });

  const responseCores = monitorCaller
    ? cores.map((core) => ({ ...core, status: core.liveStatus, detail: core.liveDetail }))
    : cores;
  const failed = responseCores.filter((core) => core.status === "failed").length;
  const warning = responseCores.filter((core) => core.status === "warning").length;
  const healthy = responseCores.length - failed - warning;
  const overallStatus: CoreHealthStatus = failed ? "failed" : warning ? "warning" : "healthy";

  // `ok` describes whether the health report itself was produced successfully.
  // A failed engine is operational data, not a failed API request; callers must
  // still receive all 17 cores so the panel can display the exact failing engine.
  return NextResponse.json({
    ok: true,
    healthy: failed === 0,
    status: overallStatus,
    package: "rosta-commerce-core",
    packageCount: 1,
    coreCount: responseCores.length,
    engineCount: responseCores.length,
    monitorBacked: true,
    summary: { healthy, warning, failed },
    cores: responseCores,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  }, { status: 200, headers: noStoreHeaders() });
}
