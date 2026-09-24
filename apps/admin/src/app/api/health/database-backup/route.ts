import { createHmac, timingSafeEqual } from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import {
  getDatabaseBackupArchive,
  getDatabaseBackupJob,
  startDatabaseBackupJob,
} from "@/lib/databaseBackupJobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
const DOWNLOAD_TICKET_TTL_MS = 2 * 60_000;

function downloadSecret() {
  return String(process.env.ROSTA_BACKUP_DOWNLOAD_SECRET || process.env.RUTH_BACKUP_DOWNLOAD_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

function signDownload(jobId: string, expires: number) {
  const secret = downloadSecret();
  if (!secret) throw new Error("Yedek indirme imza anahtarı yapılandırılmamış.");
  return createHmac("sha256", secret).update(`${jobId}.${expires}`).digest("base64url");
}

function validDownloadTicket(jobId: string, expires: number, ticket: string) {
  if (!jobId || !ticket || !Number.isFinite(expires) || expires <= Date.now()) return false;
  try {
    const expected = signDownload(jobId, expires);
    const left = Buffer.from(ticket);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function downloadResponse(jobId: string) {
  const archive = getDatabaseBackupArchive(jobId);
  if (!archive) {
    const job = getDatabaseBackupJob(jobId);
    if (!job) {
      return Response.json({ ok: false, error: "Yedek görevi bulunamadı veya süresi doldu." }, {
        status: 404,
        headers: NO_STORE_HEADERS,
      });
    }
    return Response.json({
      ok: false,
      error: job.status === "failed" ? job.error || "Yedek oluşturulamadı." : "Yedek henüz tamamlanmadı.",
      job,
    }, {
      status: job.status === "failed" ? 500 : 409,
      headers: NO_STORE_HEADERS,
    });
  }

  return new Response(new Uint8Array(archive.archive), {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=\"${archive.filename}\"`,
      "Content-Length": String(archive.archive.length),
    },
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const job = startDatabaseBackupJob(auth.supabase as any);
  return Response.json({ ok: true, job }, {
    status: job.status === "running" ? 202 : 200,
    headers: NO_STORE_HEADERS,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = String(url.searchParams.get("jobId") || "").trim();
  const wantsDownload = url.searchParams.get("download") === "1";
  const wantsDownloadUrl = url.searchParams.get("prepareDownload") === "1";
  const expires = Number(url.searchParams.get("expires") || 0);
  const ticket = String(url.searchParams.get("ticket") || "").trim();

  if (!jobId) {
    return Response.json({ ok: false, error: "Backup jobId zorunlu." }, {
      status: 400,
      headers: NO_STORE_HEADERS,
    });
  }

  // Signed URLs let the browser own the transfer. This avoids downloading the
  // whole ZIP into a JS Blob before the browser download UI can even appear.
  if (wantsDownload && validDownloadTicket(jobId, expires, ticket)) {
    return downloadResponse(jobId);
  }

  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  if (wantsDownloadUrl) {
    const archive = getDatabaseBackupArchive(jobId);
    if (!archive) {
      const job = getDatabaseBackupJob(jobId);
      if (!job) {
        return Response.json({ ok: false, error: "Yedek görevi bulunamadı veya süresi doldu." }, {
          status: 404,
          headers: NO_STORE_HEADERS,
        });
      }
      return Response.json({
        ok: false,
        error: job.status === "failed" ? job.error || "Yedek oluşturulamadı." : "Yedek henüz tamamlanmadı.",
        job,
      }, {
        status: job.status === "failed" ? 500 : 409,
        headers: NO_STORE_HEADERS,
      });
    }

    const signedExpires = Date.now() + DOWNLOAD_TICKET_TTL_MS;
    const signedTicket = signDownload(jobId, signedExpires);
    const downloadUrl = `/api/health/database-backup?jobId=${encodeURIComponent(jobId)}&download=1&expires=${signedExpires}&ticket=${encodeURIComponent(signedTicket)}`;
    return Response.json({
      ok: true,
      downloadUrl,
      filename: archive.filename,
      sizeBytes: archive.archive.length,
      expiresAt: new Date(signedExpires).toISOString(),
    }, { headers: NO_STORE_HEADERS });
  }

  if (wantsDownload) return downloadResponse(jobId);

  const job = getDatabaseBackupJob(jobId);
  if (!job) {
    return Response.json({ ok: false, error: "Yedek görevi bulunamadı veya süresi doldu." }, {
      status: 404,
      headers: NO_STORE_HEADERS,
    });
  }

  return Response.json({ ok: true, job }, { headers: NO_STORE_HEADERS });
}