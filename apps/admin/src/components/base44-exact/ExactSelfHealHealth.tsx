"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  History,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import { ExactSkeleton, ExactStatusBadge } from "./primitives";
import { ExactDataCard } from "./data";

type RecoveryEvent = {
  id: string;
  engine_key?: string | null;
  action?: string | null;
  status?: string | null;
  item_count?: number | null;
  detail?: string | null;
  metadata?: Record<string, any> | null;
  occurred_at?: string | null;
};

type RecoveryPolicy = {
  engine_key?: string | null;
  enabled?: boolean | null;
  stuck_after_seconds?: number | null;
  max_auto_retries?: number | null;
  metadata?: Record<string, any> | null;
};

type SelfHealPayload = {
  ok?: boolean;
  state?: {
    service_key?: string;
    status?: string;
    detail?: string | null;
    last_seen_at?: string | null;
    recovered_at?: string | null;
    metadata?: Record<string, any> | null;
  } | null;
  events?: RecoveryEvent[];
  policies?: RecoveryPolicy[];
  summary?: {
    activePolicies?: number;
    totalPolicies?: number;
    recovered24h?: number;
    attention24h?: number;
    lastRunRepairs?: number;
    manualAttention?: number;
  };
  checkedAt?: string;
};

function dateTime(value?: string | null) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(date);
}

function ageLabel(value?: string | null) {
  const time = new Date(value || "").getTime();
  if (!Number.isFinite(time)) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds} sn önce`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  return `${Math.round(minutes / 60)} sa önce`;
}

function eventLabel(action?: string | null, engine?: string | null) {
  if (action === "supervisor_tick") return engine === "global" ? "Global recovery turu" : "Recovery turu";
  if (action === "recover_stale_leases") return "Takılı worker lease kurtarma";
  if (action === "read_model_repair") return "Read-model onarımı";
  return String(action || engine || "Otomatik onarım").replaceAll("_", " ");
}

function eventVisual(status?: string | null) {
  if (status === "recovered") {
    return {
      icon: CheckCircle2,
      badge: "active" as const,
      label: "Onarıldı",
      iconClass: "bg-success-soft text-success-foreground",
    };
  }
  if (status === "failed") {
    return {
      icon: XCircle,
      badge: "failed" as const,
      label: "Başarısız",
      iconClass: "bg-danger-soft text-danger-foreground",
    };
  }
  if (status === "manual_review") {
    return {
      icon: AlertTriangle,
      badge: "pending" as const,
      label: "İnceleme",
      iconClass: "bg-warning-soft text-warning-foreground",
    };
  }
  return {
    icon: Wrench,
    badge: "pending" as const,
    label: status || "İşleniyor",
    iconClass: "bg-accent-soft text-accent",
  };
}

export function ExactSelfHealHealth() {
  const [data, setData] = useState<SelfHealPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await adminRequest<SelfHealPayload>("/api/health/self-heal", { hardRefresh: true });
      setData(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Self-heal geçmişi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const state = String(data?.state?.status || "checking");
  const healthy = state === "healthy";
  const warning = state === "degraded" || state === "warning";
  const badgeState = healthy ? "healthy" : warning ? "warning" : state === "unhealthy" || state === "failed" ? "failed" : "checking";
  const metadata = data?.state?.metadata || {};
  const events = data?.events || [];
  const visibleEvents = expanded ? events : events.slice(0, 8);
  const activePolicies = useMemo(() => (data?.policies || []).filter((policy) => policy.enabled !== false), [data?.policies]);

  return (
    <div className="mt-4 space-y-4" data-self-heal-health>
      <ExactDataCard
        title="Self-Heal Supervisor"
        action={<ExactStatusBadge status={badgeState} label={healthy ? "Çalışıyor" : warning ? "Uyarı" : state === "checking" ? "Kontrol ediliyor" : "Hata"} size="sm" />}
        className={healthy ? "border border-success/20" : warning ? "border border-warning/20" : state === "failed" || state === "unhealthy" ? "border border-danger/20" : ""}
      >
        {loading && !data ? (
          <div className="space-y-3">
            <ExactSkeleton className="h-20" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <ExactSkeleton className="h-24" />
              <ExactSkeleton className="h-24" />
              <ExactSkeleton className="h-24" />
              <ExactSkeleton className="h-24" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`flex items-start gap-3 rounded-[var(--radius-small)] p-3 ${healthy ? "bg-success-soft" : warning ? "bg-warning-soft" : "bg-surface-secondary"}`}>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center radius-small ${healthy ? "bg-success text-white" : warning ? "bg-warning text-white" : "bg-accent text-white"}`}>
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="ruth-type-card-title text-main">{healthy ? "Otomatik kurtarma aktif" : "Otomatik kurtarma izleniyor"}</p>
                <p className="ruth-type-caption mt-1 text-muted">{data?.state?.detail || "Supervisor heartbeat bilgisi bekleniyor."}</p>
                <div className="ruth-type-caption mt-2 flex flex-wrap gap-x-4 gap-y-1 text-subtle">
                  <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> Son tur: {ageLabel(data?.state?.last_seen_at)}</span>
                  <span>DB fallback: 2 dakikada bir</span>
                  <span>Platform tick: her dakika</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3">
                <p className="ruth-type-label text-subtle">Son tur onarım</p>
                <p className="ruth-type-metric mt-1 text-main">{data?.summary?.lastRunRepairs ?? Number(metadata.autoRepairs || 0)}</p>
                <p className="ruth-type-caption mt-2 text-muted">Son supervisor turunda otomatik kurtarılan problem</p>
              </div>
              <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3">
                <p className="ruth-type-label text-subtle">Son 24 saat</p>
                <p className="ruth-type-metric mt-1 text-main">{data?.summary?.recovered24h ?? 0}</p>
                <p className="ruth-type-caption mt-2 text-muted">Başarıyla tamamlanan recovery turu</p>
              </div>
              <div className={`rounded-[var(--radius-small)] p-3 ${Number(data?.summary?.manualAttention || 0) > 0 ? "bg-warning-soft" : "bg-surface-secondary"}`}>
                <p className="ruth-type-label text-subtle">İnceleme bekleyen</p>
                <p className="ruth-type-metric mt-1 text-main">{data?.summary?.manualAttention ?? Number(metadata.manualAttention || 0)}</p>
                <p className="ruth-type-caption mt-2 text-muted">Kör retry yapılmayan güvenlik-kritik kayıt</p>
              </div>
              <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3">
                <p className="ruth-type-label text-subtle">Aktif recovery policy</p>
                <p className="ruth-type-metric mt-1 text-main">{data?.summary?.activePolicies ?? activePolicies.length}</p>
                <p className="ruth-type-caption mt-2 text-muted">Engine ve sync katmanları için merkezi iyileşme kuralı</p>
              </div>
            </div>

            {error ? (
              <div className="ruth-type-caption rounded-[var(--radius-small)] bg-warning-soft p-3 text-warning-foreground">
                Self-heal geçmişi bu turda yenilenemedi: {error}. Son doğrulanmış veri korunuyor.
              </div>
            ) : null}
          </div>
        )}
      </ExactDataCard>

      <ExactDataCard
        title="Son Otomatik Onarımlar"
        action={<div className="ruth-type-caption flex items-center gap-2 text-subtle"><History className="h-4 w-4 text-accent" /><span>{events.length ? `${events.length} son kayıt` : "Kayıt bekleniyor"}</span></div>}
      >
        {loading && !data ? (
          <div className="space-y-2">
            <ExactSkeleton className="h-20" />
            <ExactSkeleton className="h-20" />
            <ExactSkeleton className="h-20" />
          </div>
        ) : !events.length ? (
          <div className="ruth-type-caption flex items-start gap-2 rounded-[var(--radius-small)] bg-success-soft p-4 text-success-foreground">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Henüz gösterilecek otomatik onarım olayı yok. Supervisor normal kontrollerini arka planda sürdürüyor.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleEvents.map((event) => {
              const visual = eventVisual(event.status);
              const Icon = visual.icon;
              return (
                <div key={event.id} className="rounded-[var(--radius-small)] border border-border-subtle bg-surface-primary p-3">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center radius-small ${visual.iconClass}`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="ruth-type-card-title text-main">{eventLabel(event.action, event.engine_key)}</p>
                          <p className="ruth-type-code mt-0.5 text-subtle">{event.engine_key || "global"} · {dateTime(event.occurred_at)}</p>
                        </div>
                        <ExactStatusBadge status={visual.badge} label={visual.label} size="sm" />
                      </div>
                      <p className="ruth-type-caption mt-2 text-muted">{event.detail || "Recovery olayı kaydedildi."}</p>
                      <div className="ruth-type-caption mt-2 flex flex-wrap gap-x-4 gap-y-1 text-subtle">
                        <span>Onarılan: <strong className="text-main">{Number(event.item_count || 0)}</strong></span>
                        {event.metadata?.manualAttention != null ? <span>İnceleme: <strong className="text-main">{Number(event.metadata.manualAttention || 0)}</strong></span> : null}
                        {event.metadata?.readModelScopesQueued != null ? <span>Read-model scope: <strong className="text-main">{Number(event.metadata.readModelScopesQueued || 0)}</strong></span> : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {events.length > 8 ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="ruth-type-control flex w-full items-center justify-center gap-2 rounded-[var(--radius-small)] bg-surface-secondary px-3 py-2 text-accent transition-colors hover:bg-surface-tertiary"
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {expanded ? "Geçmişi daralt" : `Tüm geçmişi göster (${events.length})`}
              </button>
            ) : null}
          </div>
        )}

        <div className="ruth-type-caption mt-3 flex items-start gap-2 rounded-[var(--radius-small)] bg-accent-soft px-3 py-2 text-accent">
          <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Ödeme, refund, stok ve provider write işlemleri burada kör retry edilmez; güvenli reconciliation sahibine bırakılır.</span>
        </div>
      </ExactDataCard>
    </div>
  );
}
