import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { createStoredZip, type ZipEntry } from "@/lib/zipStore";

const CHUNK_SIZE = 1000;
const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;
const COMPLETED_JOB_TTL_MS = 30 * 60_000;
const FAILED_JOB_TTL_MS = 10 * 60_000;

type SupabaseAdminLike = {
  rpc: (name: string, params?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

type BackupTable = {
  schema_name: string;
  table_name: string;
  estimated_rows?: number;
};

type BackupManifest = {
  generated_at?: string;
  database?: string;
  schemas?: string[];
  tables?: BackupTable[];
  columns?: unknown[];
};

export type DatabaseBackupJobStatus = "running" | "completed" | "failed";

export type DatabaseBackupJobPublic = {
  id: string;
  status: DatabaseBackupJobStatus;
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

type DatabaseBackupJob = DatabaseBackupJobPublic & {
  archive: Buffer | null;
};

type BackupGlobal = typeof globalThis & {
  __ruthDatabaseBackupJobs?: Map<string, DatabaseBackupJob>;
};

const backupGlobal = globalThis as BackupGlobal;
const jobs = backupGlobal.__ruthDatabaseBackupJobs || new Map<string, DatabaseBackupJob>();
backupGlobal.__ruthDatabaseBackupJobs = jobs;

function safePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 160);
}

function stamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function publicJob(job: DatabaseBackupJob): DatabaseBackupJobPublic {
  const {
    archive: _archive,
    ...safe
  } = job;
  return safe;
}

function setProgress(job: DatabaseBackupJob, progress: number, stage: string, currentTable: string | null = job.currentTable) {
  job.progress = Math.max(job.progress, Math.min(99, Math.round(progress)));
  job.stage = stage;
  job.currentTable = currentTable;

  const elapsedSeconds = Math.max(0, (Date.now() - new Date(job.startedAt).getTime()) / 1000);
  if (job.progress >= 3 && job.progress < 100 && elapsedSeconds >= 1) {
    job.etaSeconds = Math.max(1, Math.round((elapsedSeconds / job.progress) * (100 - job.progress)));
  }
}

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (!job.finishedAt) continue;
    const age = now - new Date(job.finishedAt).getTime();
    const ttl = job.status === "completed" ? COMPLETED_JOB_TTL_MS : FAILED_JOB_TTL_MS;
    if (age > ttl) jobs.delete(id);
  }
}

async function runBackup(job: DatabaseBackupJob, supabase: SupabaseAdminLike) {
  try {
    setProgress(job, 2, "Veritabanı manifesti hazırlanıyor", null);
    const { data: manifestData, error: manifestError } = await supabase.rpc("ruth_backup_manifest");
    if (manifestError) throw new Error(`Backup manifest alınamadı: ${manifestError.message || "Bilinmeyen hata"}`);

    const manifest = (manifestData || {}) as BackupManifest;
    const tables = Array.isArray(manifest.tables)
      ? manifest.tables.filter((table) => table?.schema_name && table?.table_name)
      : [];
    if (!tables.length) throw new Error("Yedeklenecek Supabase tablosu bulunamadı.");

    job.totalTables = tables.length;
    setProgress(job, 5, `0 / ${tables.length} tablo hazırlandı`, null);

    const entries: ZipEntry[] = [];
    let archiveSourceBytes = 0;
    const tableResults: Array<{ schema: string; table: string; rows: number }> = [];

    entries.push({
      name: "README.txt",
      data: [
        "Ruth Istanbul self-hosted Supabase veri yedeği",
        `Oluşturulma: ${new Date().toISOString()}`,
        "",
        "Bu arşiv public, auth ve storage şemalarındaki veritabanı tablolarını JSONL olarak içerir.",
        "storage şemasındaki nesne metadata kayıtları dahildir; bucketlardaki fiziksel dosya binaryleri veritabanının parçası değildir.",
        "Dosya hassas müşteri/hesap verileri içerebilir. Güvenli yerde saklayın.",
      ].join("\n"),
    });

    for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
      const table = tables[tableIndex];
      const schemaName = String(table.schema_name || "");
      const tableName = String(table.table_name || "");
      const tableLabel = `${schemaName}.${tableName}`;
      const estimatedRows = Math.max(0, Number(table.estimated_rows || 0));
      const lines: string[] = [];
      let offset = 0;
      let rowCount = 0;

      setProgress(
        job,
        5 + (tableIndex / tables.length) * 88,
        `${tableLabel} yedekleniyor`,
        tableLabel,
      );

      while (true) {
        const { data, error } = await supabase.rpc("ruth_backup_table_chunk", {
          p_schema: schemaName,
          p_table: tableName,
          p_offset: offset,
          p_limit: CHUNK_SIZE,
        });
        if (error) throw new Error(`${tableLabel} yedeklenemedi: ${error.message || "Bilinmeyen hata"}`);

        const rows = Array.isArray(data) ? data : [];
        for (const row of rows) lines.push(JSON.stringify(row));
        rowCount += rows.length;
        job.processedRows += rows.length;
        offset += rows.length;

        if (estimatedRows > 0) {
          const tableFraction = Math.min(0.98, rowCount / estimatedRows);
          setProgress(
            job,
            5 + ((tableIndex + tableFraction) / tables.length) * 88,
            `${tableLabel} yedekleniyor · ${rowCount.toLocaleString("tr-TR")} satır`,
            tableLabel,
          );
        }

        if (rows.length < CHUNK_SIZE) break;
      }

      const body = Buffer.from(lines.length ? `${lines.join("\n")}\n` : "", "utf8");
      archiveSourceBytes += body.length;
      if (archiveSourceBytes > MAX_ARCHIVE_BYTES) {
        throw new Error("Veritabanı yedeği güvenli indirme sınırını aştı. Sunucu seviyesinde pg_dump yedeği kullanılmalı.");
      }

      entries.push({
        name: `data/${safePart(schemaName)}/${safePart(tableName)}.jsonl`,
        data: body,
      });
      tableResults.push({ schema: schemaName, table: tableName, rows: rowCount });
      job.processedTables = tableIndex + 1;
      setProgress(
        job,
        5 + (job.processedTables / tables.length) * 88,
        `${job.processedTables} / ${tables.length} tablo hazırlandı`,
        null,
      );
    }

    setProgress(job, 95, "Manifest dosyası ekleniyor", null);
    entries.push({
      name: "manifest.json",
      data: JSON.stringify({
        ...manifest,
        exported_at: new Date().toISOString(),
        format: "ruth-supabase-jsonl-v1",
        table_results: tableResults,
      }, null, 2),
    });

    setProgress(job, 97, "ZIP arşivi oluşturuluyor", null);
    const zip = createStoredZip(entries);
    const filename = `ruth-supabase-backup-${stamp()}.zip`;

    job.archive = zip;
    job.filename = filename;
    job.sizeBytes = zip.length;
    job.progress = 100;
    job.stage = "Yedek tamamlandı";
    job.currentTable = null;
    job.status = "completed";
    job.etaSeconds = 0;
    job.finishedAt = new Date().toISOString();
  } catch (caught) {
    job.status = "failed";
    job.stage = "Yedek oluşturulamadı";
    job.currentTable = null;
    job.error = caught instanceof Error ? caught.message : "Veritabanı yedeği oluşturulamadı.";
    job.finishedAt = new Date().toISOString();
    job.etaSeconds = null;
  }
}

export function startDatabaseBackupJob(supabase: SupabaseAdminLike) {
  pruneJobs();
  const existing = [...jobs.values()].find((job) => job.status === "running");
  if (existing) return publicJob(existing);

  const now = new Date().toISOString();
  const job: DatabaseBackupJob = {
    id: randomUUID(),
    status: "running",
    progress: 1,
    stage: "Yedek görevi başlatılıyor",
    currentTable: null,
    processedTables: 0,
    totalTables: 0,
    processedRows: 0,
    startedAt: now,
    finishedAt: null,
    etaSeconds: null,
    filename: null,
    sizeBytes: null,
    error: null,
    archive: null,
  };
  jobs.set(job.id, job);
  void runBackup(job, supabase);
  return publicJob(job);
}

export function getDatabaseBackupJob(jobId: string) {
  pruneJobs();
  const job = jobs.get(jobId);
  return job ? publicJob(job) : null;
}

export function getDatabaseBackupArchive(jobId: string) {
  pruneJobs();
  const job = jobs.get(jobId);
  if (!job || job.status !== "completed" || !job.archive || !job.filename) return null;
  return {
    archive: job.archive,
    filename: job.filename,
  };
}
