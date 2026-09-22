"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, FileKey2, KeyRound, RefreshCw, ShieldCheck, ShieldOff, UsersRound } from "lucide-react";
import { ConfirmDialog } from "@ruth-commerce/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import { adminRequest } from "@/lib/adminApi";
import { hardRefreshAdminResource } from "@/lib/adminFreshnessActions";
import { ExactButton, ExactIconButton, ExactPageHeader, ExactSearchInput, ExactSegmentedControl, ExactSkeleton, ExactStatusBadge, useExactToast } from "./primitives";
import { ExactDataCard, ExactDataTable, ExactEmptyState, ExactMetricCard, type ExactColumn } from "./data";

type AuditLevel = "all" | "success" | "warning" | "error";
type AuditRow = {
  id: string;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  actor_email?: string | null;
  actor_profile_id?: string | null;
  status?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};
type AuditResponse = { rows?: AuditRow[]; events?: AuditRow[]; audits?: AuditRow[] };
type SessionState = { email: string; userId: string; expiresAt: number | null; lastSignInAt: string | null } | null;

const PRIMARY_AUDIT_PATH = "/api/audit?limit=200";
const FALLBACK_AUDIT_PATH = "/api/admin/audit?limit=200";

function dateTime(value?: string | number | null) {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value || "");
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function level(row: AuditRow): Exclude<AuditLevel, "all"> {
  const status = String(row.status || "").toLowerCase();
  const action = row.action.toLowerCase();
  if (["failed", "error", "denied"].some((value) => status.includes(value) || action.includes(value))) return "error";
  if (["warning", "retry", "pending"].some((value) => status.includes(value) || action.includes(value))) return "warning";
  return "success";
}

function auditRows(result: AuditResponse) {
  return result.rows || result.events || result.audits || [];
}

export function ExactSecurity() {
  const toast = useExactToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [session, setSession] = useState<SessionState>(null);
  const [filter, setFilter] = useState<AuditLevel>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [globalSignOutOpen, setGlobalSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const readAudit = useCallback(async (mode: "initial" | "refresh") => {
    let primaryError: unknown;
    try {
      return mode === "refresh"
        ? (await hardRefreshAdminResource<AuditResponse>(PRIMARY_AUDIT_PATH)).value
        : await adminRequest<AuditResponse>(PRIMARY_AUDIT_PATH);
    } catch (caught) {
      primaryError = caught;
    }

    try {
      return mode === "refresh"
        ? (await hardRefreshAdminResource<AuditResponse>(FALLBACK_AUDIT_PATH)).value
        : await adminRequest<AuditResponse>(FALLBACK_AUDIT_PATH);
    } catch {
      throw primaryError;
    }
  }, []);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const supabase = getSupabaseBrowser();
      const sessionResult = await supabase?.auth.getSession();
      const current = sessionResult?.data.session;
      setSession(current ? {
        email: current.user.email || "",
        userId: current.user.id,
        expiresAt: current.expires_at || null,
        lastSignInAt: current.user.last_sign_in_at || null,
      } : null);

      const result = await readAudit(mode);
      setRows(auditRows(result));

      if (mode === "initial") {
        void readAudit("refresh")
          .then((live) => setRows(auditRows(live)))
          .catch(() => undefined);
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Güvenlik kayıtları alınamadı.");
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [readAudit, toast]);

  useEffect(() => { void load("initial"); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((row) => (filter === "all" || level(row) === filter)
      && (!needle || `${row.action} ${row.resource_type || ""} ${row.resource_id || ""} ${row.actor_email || ""} ${row.ip_address || ""}`.toLocaleLowerCase("tr-TR").includes(needle)));
  }, [filter, query, rows]);

  const stats = useMemo(() => ({
    total: rows.length,
    success: rows.filter((row) => level(row) === "success").length,
    warning: rows.filter((row) => level(row) === "warning").length,
    error: rows.filter((row) => level(row) === "error").length,
  }), [rows]);

  const signOutEverywhere = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase?.auth.signOut({ scope: "global" }) || { error: null };
      if (error) throw error;
      window.location.href = "/login";
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Oturumlar kapatılamadı.");
      setSigningOut(false);
    }
  };

  const columns: ExactColumn<AuditRow>[] = [
    { key: "created_at", label: "Zaman", sortable: true, render: (row) => <span className="ruth-type-caption text-muted">{dateTime(row.created_at)}</span> },
    { key: "action", label: "İşlem", sortable: true, render: (row) => <div><p className="ruth-type-table font-medium text-main">{row.action}</p><p className="ruth-type-code text-subtle">{row.resource_type || "sistem"}{row.resource_id ? ` · ${row.resource_id}` : ""}</p></div> },
    { key: "actor_email", label: "Kullanıcı", render: (row) => <span className="ruth-type-caption text-muted">{row.actor_email || row.actor_profile_id || "Sistem"}</span> },
    { key: "status", label: "Sonuç", align: "center", render: (row) => <ExactStatusBadge status={level(row) === "success" ? "active" : level(row) === "warning" ? "pending" : "failed"} label={level(row) === "success" ? "Başarılı" : level(row) === "warning" ? "Uyarı" : "Hata"} size="sm" /> },
    { key: "ip_address", label: "IP", render: (row) => <span className="ruth-type-code text-subtle">{row.ip_address || "—"}</span> },
  ];

  return <div className="space-y-4 animate-fade-in" data-exact-base44-page="security">
    <ExactPageHeader
      title="Güvenlik ve Denetim"
      subtitle="Oturum, yetki ve kritik işlem kayıtlarını izle"
      actions={<>
        <Link href="/settings/users"><ExactButton variant="secondary" size="sm"><UsersRound className="h-4 w-4" /> Kullanıcılar</ExactButton></Link>
        <ExactIconButton icon={RefreshCw} label="Yenile" variant="secondary" onClick={() => void load("refresh")} loading={loading || refreshing} />
      </>}
    />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <ExactMetricCard label="Denetim Kaydı" value={stats.total} icon={FileKey2} />
      <ExactMetricCard label="Başarılı" value={stats.success} icon={CheckCircle2} />
      <ExactMetricCard label="Uyarı" value={stats.warning} icon={AlertTriangle} />
      <ExactMetricCard label="Hata / Engellenen" value={stats.error} icon={ShieldOff} />
    </div>
    <div className="grid lg:grid-cols-2 gap-3">
      <ExactDataCard title="Aktif Oturum"><div className="flex items-start gap-3"><div className="flex items-center justify-center h-10 w-10 radius-small bg-success-soft text-success-foreground"><ShieldCheck className="h-5 w-5" /></div><div className="flex-1"><p className="ruth-type-card-title text-main">{session?.email || "Oturum bulunamadı"}</p><p className="ruth-type-code mt-1 text-muted">Kullanıcı ID: {session?.userId || "—"}</p><p className="ruth-type-caption text-muted">Son giriş: {dateTime(session?.lastSignInAt)}</p><p className="ruth-type-caption text-muted">Oturum sonu: {dateTime(session?.expiresAt)}</p></div><ExactStatusBadge status={session ? "active" : "archived"} label={session ? "Aktif" : "Kapalı"} size="sm" /></div><ExactButton variant="destructive" size="sm" className="mt-4" onClick={() => setGlobalSignOutOpen(true)} disabled={!session}><KeyRound className="h-4 w-4" /> Tüm cihazlardan çıkış yap</ExactButton></ExactDataCard>
      <ExactDataCard title="Koruma Katmanları"><div className="space-y-2">{[
        { title: "Rol tabanlı yetki", text: "Her panel işlemi kullanıcı rolü ve kaynak yetkisiyle kontrol edilir." },
        { title: "Kritik işlem onayı", text: "İade, iptal ve veri değiştiren ROSTA Insight işlemleri açık onay gerektirir." },
        { title: "Değiştirilemez timeline", text: "Sipariş, ödeme ve kargo olayları denetim zincirinde saklanır." },
      ].map((item) => <div key={item.title} className="flex items-start gap-3 p-3 radius-small bg-surface-secondary"><ShieldCheck className="h-4 w-4 text-success-foreground mt-0.5" /><div><p className="ruth-type-card-title text-main">{item.title}</p><p className="ruth-type-caption mt-1 text-muted">{item.text}</p></div></div>)}</div></ExactDataCard>
    </div>
    <div className="flex flex-col sm:flex-row gap-3">
      <ExactSegmentedControl size="sm" value={filter} onChange={(value) => setFilter(value as AuditLevel)} options={[{ value: "all", label: "Tümü" }, { value: "success", label: "Başarılı" }, { value: "warning", label: "Uyarı" }, { value: "error", label: "Hata" }]} />
      <ExactSearchInput value={query} onChange={setQuery} placeholder="İşlem, kullanıcı, kaynak veya IP ara..." className="flex-1" />
    </div>
    {loading ? <div className="space-y-2"><ExactSkeleton className="h-16" /><ExactSkeleton className="h-16" /></div> : <ExactDataTable columns={columns} data={visible} emptyState={<ExactEmptyState icon={Clock3} title="Bu filtrede denetim kaydı yok" />} />}
    <ConfirmDialog
      open={globalSignOutOpen}
      title="Tüm cihazlardan çıkış yap"
      description="Bu hesap için açık olan bütün oturumlar kapatılacak. Devam etmek için tekrar giriş yapman gerekecek."
      confirmLabel="Tüm oturumları kapat"
      cancelLabel="Vazgeç"
      tone="danger"
      loading={signingOut}
      onClose={() => setGlobalSignOutOpen(false)}
      onConfirm={() => void signOutEverywhere()}
    />
  </div>;
}
