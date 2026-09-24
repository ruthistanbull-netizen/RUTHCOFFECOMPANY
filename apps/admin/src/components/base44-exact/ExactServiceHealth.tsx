"use client";

import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  Database,
  HeartPulse,
  Mail,
  PackageCheck,
  RefreshCw,
  Server,
  ShoppingBag,
  Truck,
  Workflow,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  ExactDetailDrawer,
  ExactIconButton,
  ExactPageHeader,
  ExactSkeleton,
  ExactStatusBadge,
  useExactToast,
} from "./primitives";
import { ExactDataCard, ExactMetricCard } from "./data";

type HealthState = "healthy" | "warning" | "failed" | "checking";
type ServiceResult = {
  id: string;
  name: string;
  description: string;
  state: HealthState;
  latency?: number;
  detail?: string;
  checkedAt?: string;
};
type HealthCheck = {
  name?: string;
  status?: string;
  pending?: number;
  active?: number;
  deadLetter?: number;
  latencyMs?: number;
  detail?: string | null;
  total?: number;
  stale?: number;
  errors?: number;
  lastRunAt?: string | null;
  lastRunAgeMs?: number | null;
  refreshed?: number;
  failed?: number;
  monitored?: number;
  observedUnhealthy?: number;
  observedDegraded?: number;
};
type HealthPayload = {
  ok?: boolean;
  status?: string;
  checks?: HealthCheck[];
  latestSnapshot?: { generated_at?: string | null } | null;
  instantData?: {
    readModelCount?: number;
    staleCount?: number;
    errorCount?: number;
    pendingSync?: number;
    latestRun?: {
      status?: string;
      refreshed_count?: number;
      failed_count?: number;
      started_at?: string;
      completed_at?: string;
    } | null;
  };
  serviceMonitor?: {
    status?: string;
    lastSeenAt?: string | null;
    ageMs?: number | null;
    monitoredServices?: number;
    observedUnhealthy?: number;
    observedDegraded?: number;
  };
};
type CoreMonitor = {
  status?: string | null;
  detail?: string | null;
  lastSeenAt?: string | null;
  fresh?: boolean;
  verifiedFailure?: boolean;
  verifiedFailureStreak?: number;
  verificationThreshold?: number;
  latencyMs?: number | null;
};
type CoreResult = {
  key?: string;
  title?: string;
  owner?: string;
  description?: string;
  status?: string;
  liveStatus?: string;
  detail?: string;
  confirmedFailure?: boolean;
  probes?: Array<{ table?: string; ok?: boolean; latencyMs?: number; error?: string | null }>;
  selfTest?: { ok?: boolean; detail?: string } | null;
  configuration?: { status?: string; detail?: string } | null;
  monitor?: CoreMonitor;
};
type CorePayload = {
  ok?: boolean;
  coreCount?: number;
  engineCount?: number;
  monitorBacked?: boolean;
  summary?: { healthy?: number; warning?: number; failed?: number };
  cores?: CoreResult[];
  checkedAt?: string;
  durationMs?: number;
};
type ShippingHealthPayload = {
  ok?: boolean;
  status?: string;
  monitorStatus?: string;
  confirmedFailure?: boolean;
  confirmedWarning?: boolean;
  fresh?: boolean;
  detail?: string;
  latencyMs?: number | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
};
type QueueKind = "outbox-pending" | "outbox-dead" | "jobs-pending" | "jobs-dead" | "panel-sync";
type QueuePayload = {
  ok?: boolean;
  title?: string;
  description?: string;
  items?: any[];
  runs?: any[];
};
type CheckResult<T> =
  | { ok: true; value: T; latency: number }
  | { ok: false; error: string; latency: number };

function stateLabel(state: HealthState) {
  if (state === "healthy") return "Çalışıyor";
  if (state === "warning") return "Doğrulanamadı";
  if (state === "failed") return "Hata";
  return "Kontrol ediliyor";
}

function stateFromBackend(status?: string): HealthState {
  if (status === "healthy") return "healthy";
  if (status === "degraded" || status === "warning") return "warning";
  if (status === "unhealthy" || status === "failed") return "failed";
  return "checking";
}

function coreDisplayName(title?: string, key?: string) {
  const raw = String(title || key || "Commerce Core");
  if (/Ruthie Assistant Core/i.test(raw)) return "Ruthie Assistant Çekirdeği";
  return raw.replace(/\s+Engine$/i, " Çekirdeği").replace(/\s+Core$/i, " Çekirdeği");
}

function dateTime(value?: string | null) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(date);
}

function shortJson(value: unknown) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value ?? ""); }
}

async function timed<T>(request: () => Promise<T>): Promise<CheckResult<T>> {
  const started = performance.now();
  try {
    return { ok: true, value: await request(), latency: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Servis yanıtı doğrulanamadı.",
      latency: Math.round(performance.now() - started),
    };
  }
}

function unverifiedDetail(label: string, error: string) {
  return `${label} bu tarayıcı kontrolünde doğrulanamadı; servis arızalı sayılmadı. ${error}`;
}

const iconMap: Record<string, LucideIcon> = {
  session: HeartPulse,
  orders: ShoppingBag,
  payments: Activity,
  shipping: Truck,
  email: Mail,
  storefront: PackageCheck,
  database: Database,
  "instant-data": Zap,
  "panel-sync": Workflow,
  "service-monitor": BellRing,
};

export function ExactServiceHealth() {
  const toast = useExactToast();
  const [services, setServices] = useState<ServiceResult[]>([]);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [coreHealth, setCoreHealth] = useState<CorePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<string | null>(null);
  const [queueKind, setQueueKind] = useState<QueueKind | null>(null);
  const [queueDetail, setQueueDetail] = useState<QueuePayload | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    const checks = await Promise.all([
      timed(() => adminRequest("/api/me", { hardRefresh: true })),
      timed(() => adminRequest<{ orders?: unknown[] }>("/api/orders?range=today&payment=all&q=", { hardRefresh: true })),
      timed(() => adminRequest("/api/payments/list?limit=5", { hardRefresh: true })),
      timed(() => adminRequest("/api/shipping/basit-kargo/handlers", { hardRefresh: true })),
      timed(() => adminRequest<ShippingHealthPayload>("/api/health/shipping", { hardRefresh: true })),
      timed(() => adminRequest("/api/email/status", { hardRefresh: true })),
      timed(() => adminRequest("/api/theme", { hardRefresh: true })),
      timed(() => adminRequest<HealthPayload>("/api/health", { hardRefresh: true })),
      timed(() => adminRequest<CorePayload>("/api/commerce-core/health", { hardRefresh: true })),
    ]);

    const [session, orders, payments, shipping, shippingMonitor, email, storefront, healthResult, coreResult] = checks;
    const now = new Date().toISOString();
    setLastCheck(now);
    const healthValue = healthResult.ok ? healthResult.value : null;
    const coreValue = coreResult.ok ? coreResult.value : null;
    setHealth(healthValue);
    setCoreHealth(coreValue);

    const backendChecks = new Map((healthValue?.checks || []).map((item) => [item.name, item]));
    const databaseCheck = backendChecks.get("database");
    const instantCheck = backendChecks.get("instant-data");
    const syncCheck = backendChecks.get("panel-sync");
    const serviceMonitorCheck = backendChecks.get("service-monitor");

    const shippingTruth = shippingMonitor.ok ? shippingMonitor.value : null;
    const shippingState: HealthState = shipping.ok
      ? "healthy"
      : shippingTruth?.status === "healthy"
        ? "healthy"
        : shippingTruth?.confirmedFailure
          ? "failed"
          : "warning";
    const shippingLatency = shipping.ok
      ? shipping.latency
      : Number(shippingTruth?.latencyMs || shipping.latency);
    const shippingDetail = shipping.ok
      ? "Kargo sağlayıcı listesi alınabildi."
      : shippingTruth?.status === "healthy"
        ? `Tarayıcı canlı kontrolü geçici hata verdi (${shipping.error}), ancak backend servis izleyici Kargo Servisi'ni sağlıklı doğruladı.`
        : shippingTruth?.confirmedFailure
          ? shippingTruth.detail || shipping.error
          : `Kargo servisi bu kontrolde doğrulanamadı; doğrulanmış arıza yok. ${shippingTruth?.detail || shipping.error}`;

    const next: ServiceResult[] = [
      { id: "session", name: "Admin Oturumu", description: "Kimlik doğrulama ve RBAC", state: session.ok ? "healthy" : "warning", latency: session.latency, detail: session.ok ? "Yönetici oturumu doğrulandı." : unverifiedDetail("Admin Oturumu", session.error), checkedAt: now },
      { id: "orders", name: "Sipariş API", description: "Sipariş okuma ve operasyon akışı", state: orders.ok ? "healthy" : "warning", latency: orders.latency, detail: orders.ok ? `${orders.value.orders?.length || 0} güncel sipariş okundu.` : unverifiedDetail("Sipariş API", orders.error), checkedAt: now },
      { id: "payments", name: "Ödeme Servisi", description: "PayTR ve ödeme kayıtları", state: payments.ok ? "healthy" : "warning", latency: payments.latency, detail: payments.ok ? "Ödeme kayıt servisi yanıt verdi." : unverifiedDetail("Ödeme Servisi", payments.error), checkedAt: now },
      { id: "shipping", name: "Kargo Servisi", description: "Basit Kargo sağlayıcı bağlantısı", state: shippingState, latency: shippingLatency, detail: shippingDetail, checkedAt: now },
      { id: "email", name: "E-posta Servisi", description: "Gmail ve Brevo gönderim altyapısı", state: email.ok ? "healthy" : "warning", latency: email.latency, detail: email.ok ? "E-posta entegrasyon durumu okunabildi." : unverifiedDetail("E-posta Servisi", email.error), checkedAt: now },
      { id: "storefront", name: "Storefront Tema", description: "Tema ve yayınlama servisi", state: storefront.ok ? "healthy" : "warning", latency: storefront.latency, detail: storefront.ok ? "Tema verisi erişilebilir." : unverifiedDetail("Storefront Tema", storefront.error), checkedAt: now },
      { id: "database", name: "Veritabanı", description: "Supabase temel sağlık kontrolü", state: databaseCheck ? stateFromBackend(databaseCheck.status) : healthResult.ok ? "healthy" : "warning", latency: Number(databaseCheck?.latencyMs || healthResult.latency), detail: databaseCheck?.detail || (healthResult.ok ? "Supabase sağlık kontrolü yanıt verdi." : unverifiedDetail("Veritabanı", healthResult.error)), checkedAt: now },
      { id: "instant-data", name: "Anlık Veri / Read Model", description: "Tüm panel sayfalarının hazır backend snapshot katmanı", state: stateFromBackend(instantCheck?.status), latency: healthResult.latency, detail: instantCheck?.detail || "Read-model sağlık verisi bekleniyor.", checkedAt: now },
      { id: "panel-sync", name: "Backend Sync Worker", description: "Panel kapalıyken API ve değişiklik senkronizasyonu", state: stateFromBackend(syncCheck?.status), latency: healthResult.latency, detail: syncCheck?.detail || "Sync worker sağlık verisi bekleniyor.", checkedAt: now },
      { id: "service-monitor", name: "PWA Servis İzleyici", description: "Tüm servisleri panel kapalıyken 24/7 izler ve yalnız doğrulanmış hatalarda bildirim yollar", state: stateFromBackend(serviceMonitorCheck?.status), latency: healthResult.latency, detail: serviceMonitorCheck?.detail || "24/7 servis izleyici heartbeat'i bekleniyor.", checkedAt: now },
    ];

    setServices(next);
    setLoading(false);
    const failed = next.filter((service) => service.state === "failed").length + Number(coreValue?.summary?.failed || 0);
    const warnings = next.filter((service) => service.state === "warning").length + Number(coreValue?.summary?.warning || 0);
    if (failed) toast.error(`${failed} doğrulanmış servis/çekirdek hatası var.`);
    else if (warnings) toast.success(`Sağlık kontrolü tamamlandı; ${warnings} kontrol doğrulanamadı veya uyarıda.`);
    else toast.success("Servis ve çekirdek sağlık kontrolü tamamlandı.");
  }, [toast]);

  useEffect(() => { void check(); }, [check]);

  const openQueue = useCallback(async (kind: QueueKind) => {
    setQueueKind(kind);
    setQueueDetail(null);
    setQueueLoading(true);
    try {
      setQueueDetail(await adminRequest<QueuePayload>(`/api/health/queue-details?kind=${kind}`, { hardRefresh: true }));
    } catch (caught) {
      setQueueDetail({ ok: false, title: "Kuyruk detayı", description: caught instanceof Error ? caught.message : "Kuyruk detayı alınamadı.", items: [] });
    } finally {
      setQueueLoading(false);
    }
  }, []);

  const summary = useMemo(() => ({
    healthy: services.filter((item) => item.state === "healthy").length,
    warning: services.filter((item) => item.state === "warning").length,
    failed: services.filter((item) => item.state === "failed").length,
    average: services.length ? Math.round(services.reduce((sum, item) => sum + Number(item.latency || 0), 0) / services.length) : 0,
  }), [services]);

  const coreSummary = useMemo(() => {
    const cores = coreHealth?.cores || [];
    const healthy = cores.filter((core) => stateFromBackend(core.status) === "healthy").length;
    const warning = cores.filter((core) => stateFromBackend(core.status) === "warning").length;
    const failed = cores.filter((core) => stateFromBackend(core.status) === "failed").length;
    return { total: Number(coreHealth?.coreCount || cores.length || 0), healthy, warning, failed };
  }, [coreHealth]);

  const overall: HealthState = summary.failed || coreSummary.failed
    ? "failed"
    : summary.warning || coreSummary.warning
      ? "warning"
      : services.length || coreSummary.total
        ? "healthy"
        : "checking";
  const outbox = health?.checks?.find((item) => item.name === "outbox");
  const jobs = health?.checks?.find((item) => item.name === "jobs");
  const instant = health?.checks?.find((item) => item.name === "instant-data");
  const sync = health?.checks?.find((item) => item.name === "panel-sync");

  const queueCards: Array<{ kind: QueueKind; label: string; value: number | string; hint: string; danger?: boolean }> = [
    { kind: "outbox-pending", label: "Outbox bekleyen", value: outbox?.pending ?? "—", hint: "Yayınlanmayı veya yeniden denenmeyi bekleyen domain eventleri" },
    { kind: "outbox-dead", label: "Outbox dead-letter", value: outbox?.deadLetter ?? "—", hint: "Otomatik retry sınırını aşan eventler", danger: Boolean(outbox?.deadLetter) },
    { kind: "jobs-pending", label: "Kuyruktaki işler", value: jobs?.pending ?? "—", hint: "Worker tarafından çalıştırılmayı bekleyen görevler" },
    { kind: "jobs-dead", label: "Job dead-letter", value: jobs?.deadLetter ?? "—", hint: "Manuel inceleme gerektiren başarısız görevler", danger: Boolean(jobs?.deadLetter) },
  ];

  return (
    <div className="space-y-4 animate-fade-in" data-exact-base44-page="service-health">
      <ExactPageHeader
        title="Servis Sağlığı"
        subtitle="Panel, storefront, backend sync, hazır veri katmanı ve gerçek Commerce çekirdekleri"
        actions={<><div className="ruth-type-caption hidden items-center gap-2 text-subtle sm:flex"><Clock3 className="h-3.5 w-3.5" /> Son kontrol: {dateTime(lastCheck)}</div><ExactIconButton icon={RefreshCw} label="Tekrar kontrol et" variant="secondary" onClick={() => void check()} loading={loading} /></>}
      />

      <ExactDataCard className={overall === "healthy" ? "border border-success/20 bg-success-soft" : overall === "warning" ? "border border-warning/20 bg-warning-soft" : overall === "failed" ? "border border-danger/20 bg-danger-soft" : ""}>
        <div className="flex items-center gap-4">
          <div className={`flex h-14 w-14 items-center justify-center rounded-full ${overall === "healthy" ? "bg-success text-white" : overall === "warning" ? "bg-warning text-white" : overall === "failed" ? "bg-danger text-white" : "bg-accent text-white"}`}>
            {overall === "healthy" ? <CheckCircle2 className="h-7 w-7" /> : overall === "warning" ? <AlertTriangle className="h-7 w-7" /> : overall === "failed" ? <XCircle className="h-7 w-7" /> : <HeartPulse className="h-7 w-7 animate-pulse" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="ruth-type-section-title text-main">{overall === "healthy" ? "Tüm temel servisler ve çekirdekler çalışıyor" : overall === "warning" ? "Bazı kontroller doğrulanamadı" : overall === "failed" ? "Doğrulanmış servis veya çekirdek hatası var" : "Servisler kontrol ediliyor"}</p>
            <p className="ruth-type-caption mt-1 text-muted">{coreSummary.total || "—"} gerçek Commerce çekirdeği 24/7 sağlık sistemine bağlı. Yalnız doğrulanmış gerçek sorunlar hata sayılır.</p>
          </div>
        </div>
      </ExactDataCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <ExactMetricCard label="Gerçek Çekirdekler" value={coreSummary.total} icon={Server} />
        <ExactMetricCard label="Sağlıklı Servis" value={summary.healthy} icon={CheckCircle2} />
        <ExactMetricCard label="Servis Uyarısı" value={summary.warning} icon={AlertTriangle} />
        <ExactMetricCard label="Doğrulanmış Hata" value={summary.failed + coreSummary.failed} icon={XCircle} />
        <ExactMetricCard label="Ort. Yanıt" value={summary.average} suffix=" ms" icon={Activity} />
      </div>

      {loading ? <div className="grid gap-3 md:grid-cols-2"><ExactSkeleton className="h-40" /><ExactSkeleton className="h-40" /><ExactSkeleton className="h-40" /><ExactSkeleton className="h-40" /></div> : (
        <div className="grid gap-3 md:grid-cols-2">
          {services.map((service) => {
            const Icon = iconMap[service.id] || Server;
            return <ExactDataCard key={service.id} className="transition-all hover:shadow-floating"><div className="flex items-start gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center radius-small ${service.state === "healthy" ? "bg-success-soft text-success-foreground" : service.state === "warning" || service.state === "checking" ? "bg-warning-soft text-warning-foreground" : "bg-danger-soft text-danger-foreground"}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="ruth-type-card-title text-main">{service.name}</p><ExactStatusBadge status={service.state} label={stateLabel(service.state)} size="sm" /></div><p className="ruth-type-caption mt-0.5 text-subtle">{service.description}</p><p className="ruth-type-caption mt-3 text-muted">{service.detail}</p><div className="ruth-type-caption mt-3 flex items-center justify-between text-subtle"><span>{service.latency ?? 0} ms</span><span>{dateTime(service.checkedAt)}</span></div></div></div></ExactDataCard>;
          })}
        </div>
      )}

      <ExactDataCard
        title="Gerçek Commerce Çekirdekleri"
        action={<div className="ruth-type-caption flex items-center gap-2 text-subtle"><Server className="h-4 w-4 text-accent" /><span>{coreSummary.total || "—"} çekirdek · {coreSummary.healthy} sağlıklı · {coreSummary.warning} uyarı · {coreSummary.failed} hata</span></div>}
      >
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><ExactSkeleton className="h-44" /><ExactSkeleton className="h-44" /><ExactSkeleton className="h-44" /><ExactSkeleton className="h-44" /><ExactSkeleton className="h-44" /><ExactSkeleton className="h-44" /></div>
        ) : !coreHealth?.cores?.length ? (
          <div className="ruth-type-caption rounded-[var(--radius-small)] bg-warning-soft p-4 text-warning-foreground">Gerçek çekirdek sağlık listesi bu kontrolde alınamadı; çekirdekler arızalı sayılmadı.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {coreHealth.cores.map((core) => {
              const state = stateFromBackend(core.status);
              const probeCount = core.probes?.length || 0;
              return (
                <div key={core.key || core.title} className="rounded-[var(--radius-small)] border border-border-subtle bg-surface-primary p-4 transition-all hover:-translate-y-0.5 hover:shadow-card">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center radius-small ${state === "healthy" ? "bg-success-soft text-success-foreground" : state === "warning" || state === "checking" ? "bg-warning-soft text-warning-foreground" : "bg-danger-soft text-danger-foreground"}`}><Server className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><p className="ruth-type-card-title text-main">{coreDisplayName(core.title, core.key)}</p><p className="ruth-type-code mt-0.5 text-subtle">{core.owner || core.key}</p></div>
                        <ExactStatusBadge status={state} label={stateLabel(state)} size="sm" />
                      </div>
                      <p className="ruth-type-caption mt-3 text-muted">{core.description}</p>
                      <div className={`ruth-type-caption mt-3 rounded-lg p-2.5 ${state === "healthy" ? "bg-success-soft text-success-foreground" : state === "failed" ? "bg-danger-soft text-danger-foreground" : "bg-warning-soft text-warning-foreground"}`}>{core.detail || "Çekirdek sağlık bilgisi bekleniyor."}</div>
                      <div className="ruth-type-caption mt-3 flex flex-wrap items-center justify-between gap-2 text-subtle">
                        <span>{probeCount ? `${probeCount} gerçek veri kaynağı` : core.selfTest ? "Öz test bağlı" : "Core runtime bağlı"}</span>
                        <span>{core.monitor?.fresh ? "24/7 izleyici bağlı" : "Canlı doğrulama"}</span>
                      </div>
                      <div className="ruth-type-caption mt-1 flex flex-wrap items-center justify-between gap-2 text-subtle">
                        <span>{core.monitor?.verifiedFailure ? `Doğrulama ${core.monitor.verifiedFailureStreak || 0}/${core.monitor.verificationThreshold || 2}` : "Doğrulanmış hata yok"}</span>
                        <span>{dateTime(core.monitor?.lastSeenAt || coreHealth.checkedAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="ruth-type-caption mt-3 flex items-start gap-2 rounded-[var(--radius-small)] bg-accent-soft px-3 py-2 text-accent"><HeartPulse className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Bu liste sabit altı “engine” kartı değildir. Backend’de tanımlı gerçek Commerce çekirdeklerinin tamamı gerçek tablo erişimi, öz test ve yapılandırma kontrolleriyle ölçülür; 24/7 izleyici iki ardışık doğrulama olmadan çekirdeği hata durumuna geçirmez.</span></div>
      </ExactDataCard>

      <ExactDataCard title="Anlık Veri Mimarisi" action={<ExactStatusBadge status={stateFromBackend(instant?.status)} label={stateLabel(stateFromBackend(instant?.status))} size="sm" />}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <button type="button" onClick={() => void openQueue("panel-sync")} className="rounded-[var(--radius-small)] bg-surface-secondary p-3 text-left transition-all hover:bg-surface-tertiary"><p className="ruth-type-label text-subtle">Hazır veri seti</p><p className="ruth-type-metric mt-1 text-main">{instant?.total ?? health?.instantData?.readModelCount ?? "—"}</p><p className="ruth-type-caption mt-2 text-muted">Sayfalar için backend’de hazır tutulan snapshot</p></button>
          <button type="button" onClick={() => void openQueue("panel-sync")} className="rounded-[var(--radius-small)] bg-surface-secondary p-3 text-left transition-all hover:bg-surface-tertiary"><p className="ruth-type-label text-subtle">Eski / hatalı</p><p className="ruth-type-metric mt-1 text-main">{Number(instant?.stale || 0) + Number(instant?.errors || 0)}</p><p className="ruth-type-caption mt-2 text-muted">Yenilenmesi veya kontrol edilmesi gereken snapshot</p></button>
          <button type="button" onClick={() => void openQueue("panel-sync")} className="rounded-[var(--radius-small)] bg-surface-secondary p-3 text-left transition-all hover:bg-surface-tertiary"><p className="ruth-type-label text-subtle">Bekleyen sync</p><p className="ruth-type-metric mt-1 text-main">{sync?.pending ?? health?.instantData?.pendingSync ?? "—"}</p><p className="ruth-type-caption mt-2 text-muted">DB değişikliklerinden gelen gecikmiş yenileme talepleri</p></button>
          <button type="button" onClick={() => void openQueue("panel-sync")} className="rounded-[var(--radius-small)] bg-surface-secondary p-3 text-left transition-all hover:bg-surface-tertiary"><p className="ruth-type-label text-subtle">Son backend sync</p><p className="ruth-type-code mt-1 text-main">{dateTime(sync?.lastRunAt || health?.instantData?.latestRun?.completed_at || health?.instantData?.latestRun?.started_at)}</p><p className="ruth-type-caption mt-2 text-muted">{sync?.refreshed ?? health?.instantData?.latestRun?.refreshed_count ?? 0} yenilendi · {sync?.failed ?? health?.instantData?.latestRun?.failed_count ?? 0} hata</p></button>
        </div>
        <div className="ruth-type-caption mt-3 flex items-start gap-2 rounded-[var(--radius-small)] bg-accent-soft px-3 py-2 text-accent"><Zap className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Bu katman panel açık olmasa da backend’de çalışır. Bir veri değiştiğinde ilgili scope yenilenir ve açık cihazlara Realtime ile yalnız değişen snapshot gönderilir.</span></div>
      </ExactDataCard>

      <ExactDataCard title="Arka Plan İşleri ve Olay Kuyruğu" action={<Database className="h-4 w-4 text-accent" />}>
        <div className="grid gap-3 sm:grid-cols-4">
          {queueCards.map((card) => <button key={card.kind} type="button" onClick={() => void openQueue(card.kind)} className={`rounded-[var(--radius-small)] p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-card ${card.danger ? "bg-danger-soft" : "bg-surface-secondary hover:bg-surface-tertiary"}`}><p className="ruth-type-label text-subtle">{card.label}</p><p className={`ruth-type-metric mt-1 ${card.danger ? "text-danger-foreground" : "text-main"}`}>{card.value}</p><p className="ruth-type-caption mt-2 text-muted">{card.hint}</p><p className="ruth-type-control mt-2 text-accent">Detayları görmek için tıkla →</p></button>)}
        </div>
        <p className="ruth-type-caption mt-3 text-muted">Son Commerce Core operasyon özeti: {dateTime(health?.latestSnapshot?.generated_at)}</p>
      </ExactDataCard>

      <ExactDetailDrawer open={Boolean(queueKind)} onClose={() => { setQueueKind(null); setQueueDetail(null); }} title={queueDetail?.title || "Kuyruk detayı"} subtitle={queueDetail?.description || "Event ve arka plan işlerinin gerçek kayıtları"} width={820}>
        {queueLoading ? <div className="space-y-2"><ExactSkeleton className="h-24" /><ExactSkeleton className="h-24" /><ExactSkeleton className="h-24" /></div> : (
          <div className="space-y-3">
            {queueKind === "panel-sync" && queueDetail?.runs?.length ? <div className="space-y-2"><p className="ruth-type-card-title text-main">Son worker turları</p>{queueDetail.runs.slice(0, 8).map((run: any) => <div key={run.id} className="rounded-[var(--radius-small)] bg-surface-secondary p-3"><div className="flex items-center justify-between gap-2"><p className="ruth-type-code text-main">{run.worker_id}</p><ExactStatusBadge status={run.status === "healthy" ? "active" : run.status === "degraded" ? "pending" : "failed"} label={run.status} size="sm" /></div><p className="ruth-type-caption mt-1 text-muted">{dateTime(run.started_at)} → {dateTime(run.completed_at)} · {run.refreshed_count || 0} yenilendi · {run.failed_count || 0} hata</p>{run.details?.failed?.length ? <pre className="ruth-type-code mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-primary p-2 text-muted">{shortJson(run.details.failed)}</pre> : null}</div>)}</div> : null}
            <p className="ruth-type-card-title text-main">Kayıtlar</p>
            {!queueDetail?.items?.length ? <div className="ruth-type-caption rounded-[var(--radius-small)] bg-success-soft p-4 text-success-foreground">Bu bölümde gösterilecek aktif kayıt yok.</div> : queueDetail.items.map((item: any) => {
              const isOutbox = queueKind?.startsWith("outbox");
              const isJob = queueKind?.startsWith("jobs");
              const title = isOutbox ? item.event_type : isJob ? item.job_type : `${item.scope || "sync"} · ${item.reason || "yenileme"}`;
              const subtitle = isOutbox ? `${item.aggregate_type || "aggregate"} · ${item.aggregate_id || "—"}` : isJob ? `${item.queue || "commerce"} kuyruğu` : `İstek #${item.id}`;
              return <div key={`${queueKind}:${item.id}`} className="rounded-[var(--radius-small)] border border-border-subtle bg-surface-primary p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="ruth-type-card-title break-words text-main">{title}</p><p className="ruth-type-code mt-0.5 text-subtle">{subtitle}</p></div><ExactStatusBadge status={["done","published","completed","healthy"].includes(item.status) ? "active" : ["dead_letter","failed"].includes(item.status) ? "failed" : "pending"} label={item.status || "bekliyor"} size="sm" /></div><div className="ruth-type-caption mt-3 grid grid-cols-2 gap-2 text-muted"><span>Deneme: <strong className="text-main">{item.attempts ?? 0}{item.max_attempts != null ? ` / ${item.max_attempts}` : ""}</strong></span><span>Oluşma: <strong className="text-main">{dateTime(item.created_at || item.requested_at)}</strong></span></div>{item.last_error ? <div className="ruth-type-caption mt-2 rounded-lg bg-danger-soft p-2 text-danger-foreground">{item.last_error}</div> : null}{item.payload && Object.keys(item.payload || {}).length ? <details className="mt-2"><summary className="ruth-type-control cursor-pointer text-accent">Payload verisini göster</summary><pre className="ruth-type-code mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-secondary p-2 text-muted">{shortJson(item.payload)}</pre></details> : null}</div>;
            })}
          </div>
        )}
      </ExactDetailDrawer>
    </div>
  );
}
