"use client";

import { CheckCircle2, DatabaseBackup, Download, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DATABASE_BACKUP_EVENT,
  DATABASE_BACKUP_STORAGE_KEY,
  dismissDatabaseBackup,
  downloadDatabaseBackup,
  formatBackupBytes,
  formatBackupEta,
  getDatabaseBackupStatus,
  isDatabaseBackupDismissed,
  isDatabaseBackupPreparedForIos,
  isIosStandalonePwa,
  prepareDatabaseBackupForIos,
  readRememberedDatabaseBackupId,
  rememberDatabaseBackup,
  type DatabaseBackupClientJob,
} from "@/lib/databaseBackupClient";

export function AdminBackupProgress() {
  const [job, setJob] = useState<DatabaseBackupClientJob | null>(null);
  const [jobId, setJobId] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [downloadHint, setDownloadHint] = useState("");
  const [shareReady, setShareReady] = useState(false);
  const dismissedJobRef = useRef("");

  useEffect(() => {
    const remembered = readRememberedDatabaseBackupId();
    if (remembered) setJobId(remembered);

    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent<DatabaseBackupClientJob | null>).detail;
      if (detail && (dismissedJobRef.current === detail.id || isDatabaseBackupDismissed(detail.id))) return;
      setJob(detail || null);
      setJobId(detail?.id || "");
      if (detail?.status !== "completed") {
        setDownloadError("");
        setDownloadHint("");
        setShareReady(false);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DATABASE_BACKUP_STORAGE_KEY) return;
      const nextId = String(event.newValue || "");
      if (nextId && isDatabaseBackupDismissed(nextId)) return;
      setJobId(nextId);
      if (!nextId) setJob(null);
    };

    window.addEventListener(DATABASE_BACKUP_EVENT, onStatus as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DATABASE_BACKUP_EVENT, onStatus as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!jobId || isDatabaseBackupDismissed(jobId)) return;
    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const next = await getDatabaseBackupStatus(jobId);
        if (cancelled || dismissedJobRef.current === next.id || isDatabaseBackupDismissed(next.id)) return;
        setJob(next);
        if (next.status === "running") timer = window.setTimeout(poll, 900);
      } catch {
        if (cancelled || dismissedJobRef.current === jobId) return;
        rememberDatabaseBackup(null);
        setJobId("");
        setJob(null);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [jobId]);

  useEffect(() => {
    if (!job || job.status !== "completed" || !isIosStandalonePwa()) {
      setShareReady(false);
      return;
    }

    let cancelled = false;
    if (isDatabaseBackupPreparedForIos(job.id)) {
      setShareReady(true);
      return;
    }

    void prepareDatabaseBackupForIos(job.id, job.filename)
      .then((prepared) => {
        if (cancelled || dismissedJobRef.current === job.id) return;
        if (prepared) {
          setShareReady(true);
          setDownloadHint("ZIP uygulamada hazır. Dosyalara kaydetmek için butona dokun.");
        }
      })
      .catch(() => {
        // Background preparation is best effort. If it fails, tapping the button will
        // retry and show the actual error instead of surfacing a noisy passive alert.
      });

    return () => {
      cancelled = true;
    };
  }, [job]);

  const close = useCallback(() => {
    if (job?.id) {
      dismissedJobRef.current = job.id;
      dismissDatabaseBackup(job.id);
    }
    setJob(null);
    setJobId("");
    setDownloadError("");
    setDownloadHint("");
    setShareReady(false);
  }, [job]);

  const download = useCallback(async () => {
    if (!job || job.status !== "completed" || downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const result = await downloadDatabaseBackup(job.id, job.filename);
      if (result.mode === "ready-to-share") {
        setShareReady(true);
        setDownloadHint("ZIP hazır. iPhone'da Dosyalara Kaydet ekranını açmak için tekrar dokun.");
      } else {
        setShareReady(false);
        setDownloadHint("");
      }
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : "Yedek indirilemedi.");
    } finally {
      setDownloading(false);
    }
  }, [downloading, job]);

  if (!job) return null;

  const progress = Math.max(0, Math.min(100, Number(job.progress || 0)));
  const meta = [
    job.totalTables ? `${job.processedTables}/${job.totalTables} tablo` : null,
    job.processedRows ? `${job.processedRows.toLocaleString("tr-TR")} satır` : null,
    job.status === "running" ? formatBackupEta(job.etaSeconds) : null,
    job.status === "completed" ? formatBackupBytes(job.sizeBytes) : null,
  ].filter(Boolean).join(" · ");
  const iosPwa = isIosStandalonePwa();

  return (
    <aside
      className="fixed bottom-[calc(104px+env(safe-area-inset-bottom))] left-3 right-3 z-[1400] mx-auto w-auto max-w-[410px] rounded-2xl border border-border-subtle bg-surface-primary p-4 shadow-overlay md:bottom-5 md:left-auto md:right-5 md:mx-0 md:w-[390px]"
      aria-live="polite"
      data-admin-global-surface="backup-progress"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          {job.status === "completed" ? <CheckCircle2 className="h-5 w-5" /> : <DatabaseBackup className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-main">{job.status === "completed" ? "Supabase yedeği tamamlandı" : job.status === "failed" ? "Supabase yedeği başarısız" : "Supabase yedeği hazırlanıyor"}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted">{job.status === "failed" ? job.error || job.stage : job.stage}</p>
            </div>
            {job.status !== "running" ? (
              <button
                type="button"
                onClick={close}
                className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-secondary hover:text-main active:bg-surface-secondary"
                aria-label="Yedek bildirimini kapat"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {job.status === "running" ? (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]">
                <span className="truncate text-muted">{meta}</span>
                <strong className="shrink-0 text-main">%{progress}</strong>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-tertiary" role="progressbar" aria-label="Supabase yedekleme ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : null}

          {job.status === "completed" ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[11px] text-muted">{meta || "ZIP indirmeye hazır"}</span>
                <button type="button" onClick={() => void download()} disabled={downloading} className="inline-flex min-h-10 shrink-0 touch-manipulation items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-50">
                  <Download className="h-3.5 w-3.5" />
                  {downloading ? (shareReady ? "Açılıyor" : "ZIP hazırlanıyor") : (iosPwa && shareReady ? "Dosyalara Kaydet" : "ZIP'i indir")}
                </button>
              </div>
              {downloadHint ? <p className="text-[11px] font-medium text-muted">{downloadHint}</p> : null}
              {downloadError ? <p role="alert" className="text-[11px] font-medium text-danger">{downloadError}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
