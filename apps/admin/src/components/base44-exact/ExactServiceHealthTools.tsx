"use client";

import { DatabaseBackup, Download, LoaderCircle, Play, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { adminRequest } from "@/lib/adminApi";
import {
  DATABASE_BACKUP_EVENT,
  downloadDatabaseBackup,
  formatBackupBytes,
  formatBackupEta,
  getDatabaseBackupStatus,
  readRememberedDatabaseBackupId,
  rememberDatabaseBackup,
  startDatabaseBackup,
  type DatabaseBackupClientJob,
} from "@/lib/databaseBackupClient";
import { ExactButton, useExactToast } from "./primitives";
import { ExactDataCard } from "./data";

export function ExactServiceHealthTools() {
  const toast = useExactToast();
  const [backupJob, setBackupJob] = useState<DatabaseBackupClientJob | null>(null);
  const [backupStarting, setBackupStarting] = useState(false);
  const [backupDownloading, setBackupDownloading] = useState(false);
  const [workerLoading, setWorkerLoading] = useState(false);

  useEffect(() => {
    const onStatus = (event: Event) => {
      setBackupJob((event as CustomEvent<DatabaseBackupClientJob | null>).detail || null);
    };
    window.addEventListener(DATABASE_BACKUP_EVENT, onStatus as EventListener);

    const remembered = readRememberedDatabaseBackupId();
    if (remembered) {
      void getDatabaseBackupStatus(remembered).then(setBackupJob).catch(() => {
        rememberDatabaseBackup(null);
        setBackupJob(null);
      });
    }

    return () => window.removeEventListener(DATABASE_BACKUP_EVENT, onStatus as EventListener);
  }, []);

  const beginBackup = async () => {
    if (backupStarting || backupJob?.status === "running") return;
    setBackupStarting(true);
    try {
      const job = await startDatabaseBackup();
      setBackupJob(job);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Veritabanı yedeği başlatılamadı.");
    } finally {
      setBackupStarting(false);
    }
  };

  const downloadBackup = async () => {
    if (!backupJob || backupJob.status !== "completed" || backupDownloading) return;
    setBackupDownloading(true);
    try {
      const result = await downloadDatabaseBackup(backupJob.id, backupJob.filename);
      if (result.mode === "ready-to-share") {
        toast.info("ZIP uygulamada hazır. iPhone'da Dosyalara Kaydet ekranını açmak için tekrar dokun.");
      } else if (result.mode === "native-share") {
        toast.success("Yedek iPhone paylaşım ekranından kaydedildi veya paylaşıldı.");
      } else {
        toast.success("Yedek indirme başlatıldı. Gerekirse tekrar indirebilirsin.");
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Veritabanı yedeği indirilemedi.");
    } finally {
      setBackupDownloading(false);
    }
  };

  const drainQueues = async () => {
    if (workerLoading) return;
    setWorkerLoading(true);
    try {
      const result = await adminRequest<{ runCount?: number; pendingOutbox?: number | null; pendingJobs?: number | null }>("/api/health/worker/run", {
        method: "POST",
        body: JSON.stringify({ runs: 3 }),
      });
      const pendingOutbox = result.pendingOutbox == null ? "?" : result.pendingOutbox;
      const pendingJobs = result.pendingJobs == null ? "?" : result.pendingJobs;
      toast.success(`${result.runCount || 1} worker turu çalıştı. Kalan outbox: ${pendingOutbox}, kalan job: ${pendingJobs}. Servis Sağlığı'nı yenileyebilirsin.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Commerce worker manuel çalıştırılamadı.");
    } finally {
      setWorkerLoading(false);
    }
  };

  const backupProgress = Math.max(0, Math.min(100, Number(backupJob?.progress || 0)));
  const backupMeta = backupJob ? [
    backupJob.totalTables ? `${backupJob.processedTables}/${backupJob.totalTables} tablo` : null,
    backupJob.processedRows ? `${backupJob.processedRows.toLocaleString("tr-TR")} satır` : null,
    backupJob.status === "running" ? formatBackupEta(backupJob.etaSeconds) : null,
    backupJob.status === "completed" ? formatBackupBytes(backupJob.sizeBytes) : null,
  ].filter(Boolean).join(" · ") : "";

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-2" data-service-health-tools>
      <ExactDataCard title="Veritabanı Yedeği" action={<DatabaseBackup className="h-4 w-4 text-accent" />}>
        <div className="space-y-3">
          <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3">
            <p className="ruth-type-card-title text-main">Self-hosted Supabase tam veri arşivi</p>
            <p className="ruth-type-caption mt-1 text-muted">public, auth ve storage tablolarındaki müşteri, ürün, sipariş, üyelik, puan, ayar ve diğer tüm veritabanı kayıtları tek ZIP içinde JSONL dosyaları olarak hazırlanır.</p>
          </div>
          <div className="ruth-type-caption flex items-start gap-2 text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground" />
            <span>Yedek sunucuda arka planda hazırlanır. Başka panel sayfasına geçsen de işlem devam eder; bittiğinde küçük tamamlandı bildirimi görünür.</span>
          </div>

          {backupJob?.status === "running" ? (
            <div className="rounded-[var(--radius-small)] border border-border-subtle bg-surface-primary p-3" aria-live="polite">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-main">{backupJob.stage}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted">{backupMeta || "İlerleme hesaplanıyor"}</p>
                </div>
                <strong className="shrink-0 text-sm text-main">%{backupProgress}</strong>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-tertiary" role="progressbar" aria-label="Supabase yedekleme ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={backupProgress}>
                <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${backupProgress}%` }} />
              </div>
            </div>
          ) : backupJob?.status === "completed" ? (
            <ExactButton size="lg" className="w-full" onClick={() => void downloadBackup()} disabled={backupDownloading}>
              {backupDownloading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {backupDownloading ? "ZIP hazırlanıyor..." : `Yedek hazır · ZIP'i indir${backupMeta ? ` (${backupMeta})` : ""}`}
            </ExactButton>
          ) : (
            <ExactButton size="lg" className="w-full" onClick={() => void beginBackup()} disabled={backupStarting}>
              {backupStarting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
              {backupStarting ? "Yedek görevi başlatılıyor..." : "Supabase Yedeğini Oluştur"}
            </ExactButton>
          )}

          {backupJob?.status === "failed" ? <p className="ruth-type-caption text-danger">{backupJob.error || "Yedek oluşturulamadı. Tekrar deneyebilirsin."}</p> : null}
          <p className="ruth-type-caption text-subtle">Her gece 00:00 için yedek indirme hatırlatıcısı ayrıca aktiftir.</p>
        </div>
      </ExactDataCard>

      <ExactDataCard title="Kuyruk Müdahalesi" action={<Play className="h-4 w-4 text-accent" />}>
        <div className="space-y-3">
          <div className="rounded-[var(--radius-small)] bg-surface-secondary p-3">
            <p className="ruth-type-card-title text-main">Bekleyen Outbox ve Job kayıtlarını şimdi işle</p>
            <p className="ruth-type-caption mt-1 text-muted">Commerce worker normalde self-hosted Supabase üzerinde 2 dakikada bir çalışır. Yığılma varsa bu buton worker'ı birkaç güvenli tur manuel tetikler.</p>
          </div>
          <p className="ruth-type-caption text-muted">Dead-letter sayısı 0 olduğu sürece ekrandaki bekleyen sayılar kalıcı başarısızlık değil; yayınlanmayı, yeniden denenmeyi veya worker tarafından işlenmeyi bekleyen kayıtlardır.</p>
          <ExactButton variant="secondary" size="lg" className="w-full" onClick={() => void drainQueues()} disabled={workerLoading}>
            {workerLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {workerLoading ? "Kuyruklar işleniyor..." : "Kuyrukları Şimdi İşle"}
          </ExactButton>
        </div>
      </ExactDataCard>
    </div>
  );
}
