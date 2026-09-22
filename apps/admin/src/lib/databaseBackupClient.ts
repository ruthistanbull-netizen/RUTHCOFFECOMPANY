"use client";

import { adminAuthHeaders } from "@/lib/adminApi";

export const DATABASE_BACKUP_STORAGE_KEY = "ruth-active-database-backup-v1";
export const DATABASE_BACKUP_EVENT = "ruth:database-backup-status";
const DATABASE_BACKUP_DISMISSED_STORAGE_KEY = "ruth-dismissed-database-backup-v1";

export type DatabaseBackupClientJob = {
  id: string;
  status: "running" | "completed" | "failed";
  progress: number;
  stage: string;
  currentTable: string | null;
  processedTables: number;
  totalTables: number;
  processedRows: number;
  startedAt: string;
  finishedAt: string | null;
  etaSeconds: number | null;
  filename: string | null;
  sizeBytes: number | null;
  error: string | null;
};

export type DatabaseBackupDownloadResult = {
  filename: string;
  mode: "browser" | "native-share" | "ready-to-share";
};

let volatileBackupId = "";
const preparedIosBackupFiles = new Map<string, File>();
const preparingIosBackupFiles = new Map<string, Promise<File>>();

function emit(job: DatabaseBackupClientJob | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DATABASE_BACKUP_EVENT, { detail: job }));
}

function safeSetStorage(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveStorage(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Browser storage may be unavailable/full. The live in-memory event still keeps
    // the backup visible across normal Next.js panel navigation.
  }
}

function safeReadStorage(storage: Storage, key: string) {
  try {
    return String(storage.getItem(key) || "").trim();
  } catch {
    return "";
  }
}

function readDismissedDatabaseBackupId() {
  if (typeof window === "undefined") return "";
  return safeReadStorage(window.localStorage, DATABASE_BACKUP_DISMISSED_STORAGE_KEY)
    || safeReadStorage(window.sessionStorage, DATABASE_BACKUP_DISMISSED_STORAGE_KEY);
}

export function isDatabaseBackupDismissed(jobId: string) {
  return Boolean(jobId) && readDismissedDatabaseBackupId() === jobId;
}

export function dismissDatabaseBackup(jobId: string) {
  if (typeof window === "undefined" || !jobId) return;

  const savedLocally = safeSetStorage(window.localStorage, DATABASE_BACKUP_DISMISSED_STORAGE_KEY, jobId);
  if (!savedLocally) safeSetStorage(window.sessionStorage, DATABASE_BACKUP_DISMISSED_STORAGE_KEY, jobId);
  safeRemoveStorage(window.localStorage, DATABASE_BACKUP_STORAGE_KEY);
  safeRemoveStorage(window.sessionStorage, DATABASE_BACKUP_STORAGE_KEY);
  if (volatileBackupId === jobId) volatileBackupId = "";
}

export function rememberDatabaseBackup(job: DatabaseBackupClientJob | null) {
  if (typeof window === "undefined") return;

  volatileBackupId = job?.id || "";
  if (job) {
    const dismissedId = readDismissedDatabaseBackupId();
    if (dismissedId && dismissedId !== job.id) {
      safeRemoveStorage(window.localStorage, DATABASE_BACKUP_DISMISSED_STORAGE_KEY);
      safeRemoveStorage(window.sessionStorage, DATABASE_BACKUP_DISMISSED_STORAGE_KEY);
    }

    // Store only the tiny job id, never progress payloads or ZIP data. If localStorage
    // is already at quota, fall back to sessionStorage and never fail the backup itself.
    const savedLocally = safeSetStorage(window.localStorage, DATABASE_BACKUP_STORAGE_KEY, job.id);
    if (!savedLocally) safeSetStorage(window.sessionStorage, DATABASE_BACKUP_STORAGE_KEY, job.id);
  } else {
    safeRemoveStorage(window.localStorage, DATABASE_BACKUP_STORAGE_KEY);
    safeRemoveStorage(window.sessionStorage, DATABASE_BACKUP_STORAGE_KEY);
  }

  emit(job);
}

export function readRememberedDatabaseBackupId() {
  if (typeof window === "undefined") return "";
  const remembered = safeReadStorage(window.localStorage, DATABASE_BACKUP_STORAGE_KEY)
    || safeReadStorage(window.sessionStorage, DATABASE_BACKUP_STORAGE_KEY)
    || volatileBackupId;
  return remembered && !isDatabaseBackupDismissed(remembered) ? remembered : "";
}

async function request(path: string, init?: RequestInit) {
  const authHeaders = await adminAuthHeaders();
  return fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...authHeaders,
      "X-Ruth-Admin-Request": "1",
      ...(init?.headers || {}),
    },
  });
}

export function isIosStandalonePwa() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const userAgent = nav.userAgent || "";
  const isIosDevice = /iPad|iPhone|iPod/i.test(userAgent)
    || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const isStandalone = nav.standalone === true
    || window.matchMedia?.("(display-mode: standalone)").matches === true;
  return isIosDevice && isStandalone;
}

function safeBackupFilename(value: string | null | undefined) {
  const filename = String(value || "").trim();
  return filename && filename.toLowerCase().endsWith(".zip")
    ? filename
    : `ruth-supabase-backup-${Date.now()}.zip`;
}

function canShareBackupFile(file: File) {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return true;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

async function prepareIosBackupFile(jobId: string, filename?: string | null) {
  const existing = preparedIosBackupFiles.get(jobId);
  if (existing) return existing;

  const inFlight = preparingIosBackupFiles.get(jobId);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const response = await request(`/api/health/database-backup?jobId=${encodeURIComponent(jobId)}&download=1`, {
      headers: { Accept: "application/octet-stream, application/zip" },
    });
    if (!response.ok) {
      const message = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(message.error || `Yedek dosyası ${response.status} döndürdü.`);
    }

    const blob = await response.blob();
    if (!blob.size) throw new Error("Yedek dosyası boş döndü.");

    const file = new File([blob], safeBackupFilename(filename), {
      type: "application/zip",
      lastModified: Date.now(),
    });
    preparedIosBackupFiles.clear();
    preparedIosBackupFiles.set(jobId, file);
    return file;
  })();

  preparingIosBackupFiles.set(jobId, promise);
  try {
    return await promise;
  } finally {
    preparingIosBackupFiles.delete(jobId);
  }
}

export async function prepareDatabaseBackupForIos(jobId: string, filename?: string | null) {
  if (!isIosStandalonePwa()) return false;
  await prepareIosBackupFile(jobId, filename);
  return true;
}

export function isDatabaseBackupPreparedForIos(jobId: string) {
  return isIosStandalonePwa() && preparedIosBackupFiles.has(jobId);
}

async function sharePreparedIosBackup(jobId: string) {
  const file = preparedIosBackupFiles.get(jobId);
  if (!file) return null;
  if (!canShareBackupFile(file)) {
    throw new Error("iPhone bu ZIP dosyasını uygulama içinden paylaşamıyor.");
  }

  try {
    await navigator.share({
      files: [file],
      title: "Supabase yedeği",
    });
    preparedIosBackupFiles.delete(jobId);
    return {
      filename: file.name,
      mode: "native-share" as const,
    };
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") {
      return {
        filename: file.name,
        mode: "ready-to-share" as const,
      };
    }
    throw caught;
  }
}

export async function startDatabaseBackup() {
  const response = await request("/api/health/database-backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const result = await response.json().catch(() => ({})) as { ok?: boolean; job?: DatabaseBackupClientJob; error?: string };
  if (!response.ok || !result.ok || !result.job) throw new Error(result.error || `Yedek servisi ${response.status} döndürdü.`);
  rememberDatabaseBackup(result.job);
  return result.job;
}

export async function getDatabaseBackupStatus(jobId: string) {
  const response = await request(`/api/health/database-backup?jobId=${encodeURIComponent(jobId)}`);
  const result = await response.json().catch(() => ({})) as { ok?: boolean; job?: DatabaseBackupClientJob; error?: string };
  if (!response.ok || !result.ok || !result.job) throw new Error(result.error || `Yedek durumu ${response.status} döndürdü.`);
  if (!isDatabaseBackupDismissed(result.job.id)) emit(result.job);
  return result.job;
}

export async function downloadDatabaseBackup(jobId: string, filename?: string | null): Promise<DatabaseBackupDownloadResult> {
  if (isIosStandalonePwa()) {
    // iOS installed PWAs do not reliably honor <a download> or browser navigation
    // for Blob/ZIP responses. Keep the ZIP as a File and hand it to the native share
    // sheet, where the user can choose "Save to Files". If background preparation
    // has not finished yet, prepare it here and immediately attempt the same share
    // flow instead of requiring a second tap.
    const alreadyPrepared = await sharePreparedIosBackup(jobId);
    if (alreadyPrepared) return alreadyPrepared;

    await prepareIosBackupFile(jobId, filename);
    const shared = await sharePreparedIosBackup(jobId);
    if (shared) return shared;

    return {
      filename: safeBackupFilename(filename),
      mode: "ready-to-share",
    };
  }

  const response = await request(`/api/health/database-backup?jobId=${encodeURIComponent(jobId)}&prepareDownload=1`, {
    headers: { Accept: "application/json" },
  });
  const result = await response.json().catch(() => ({})) as {
    ok?: boolean;
    error?: string;
    downloadUrl?: string;
    filename?: string;
  };
  if (!response.ok || !result.ok || !result.downloadUrl) {
    throw new Error(result.error || `Yedek indirme servisi ${response.status} döndürdü.`);
  }

  const downloadUrl = new URL(result.downloadUrl, window.location.origin);
  if (downloadUrl.origin !== window.location.origin) {
    throw new Error("Yedek indirme adresi güvenli origin dışında oluşturuldu.");
  }
  window.location.assign(downloadUrl.toString());
  return {
    filename: result.filename || safeBackupFilename(filename),
    mode: "browser",
  };
}

export function formatBackupEta(seconds: number | null | undefined) {
  const value = Math.max(0, Number(seconds || 0));
  if (!value) return "Hesaplanıyor";
  if (value < 60) return `~${Math.max(1, Math.round(value))} sn kaldı`;
  return `~${Math.ceil(value / 60)} dk kaldı`;
}

export function formatBackupBytes(value: number | null | undefined) {
  const bytes = Math.max(0, Number(value || 0));
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
