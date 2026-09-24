import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { normalizeSupabaseUrl } from "@/lib/supabaseRuntime";

export const runtime = "nodejs";

const TUS_VERSION = "1.0.0";
const MAX_PROXY_CHUNK_BYTES = 2 * 1024 * 1024;
const STORAGE_REQUEST_TIMEOUT_MS = 45_000;

function noStoreHeaders() {
  return { "Cache-Control": "no-store" };
}

function allowedStorageOrigin() {
  const base = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  return new URL(base).origin;
}

function serviceStorageHeaders() {
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!key) throw new Error("Supabase service-role anahtarı eksik.");

  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function validatedUploadUrl(request: Request) {
  const raw = String(request.headers.get("x-ruth-upload-url") || "").trim();
  if (!raw) throw new Error("Video upload oturum adresi eksik.");
  const url = new URL(raw);
  if (url.origin !== allowedStorageOrigin()) throw new Error("Video upload oturum adresi geçersiz.");
  if (!url.pathname.startsWith("/storage/v1/upload/resumable")) {
    throw new Error("Video upload oturum yolu geçersiz.");
  }
  return url.toString();
}

async function storageFetch(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORAGE_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Storage isteği 45 saniye içinde tamamlanamadı.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const uploadUrl = validatedUploadUrl(request);
    const response = await storageFetch(uploadUrl, {
      method: "HEAD",
      headers: {
        ...serviceStorageHeaders(),
        "Tus-Resumable": TUS_VERSION,
      },
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: message || `Video upload konumu okunamadı (${response.status}).` },
        { status: response.status, headers: noStoreHeaders() },
      );
    }

    const offset = Number(response.headers.get("Upload-Offset") || 0);
    return NextResponse.json(
      { ok: true, offset: Number.isFinite(offset) && offset >= 0 ? offset : 0 },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Video upload konumu okunamadı." },
      { status: 400, headers: noStoreHeaders() },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const uploadUrl = validatedUploadUrl(request);
    const offset = Number(request.headers.get("x-ruth-upload-offset") || 0);
    if (!Number.isFinite(offset) || offset < 0) {
      return NextResponse.json({ ok: false, error: "Video parça konumu geçersiz." }, { status: 400, headers: noStoreHeaders() });
    }

    const body = await request.arrayBuffer();
    if (!body.byteLength) {
      return NextResponse.json({ ok: false, error: "Video parçası boş." }, { status: 400, headers: noStoreHeaders() });
    }
    if (body.byteLength > MAX_PROXY_CHUNK_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Video parçası 2 MB sınırını aşıyor." },
        { status: 413, headers: noStoreHeaders() },
      );
    }

    const response = await storageFetch(uploadUrl, {
      method: "PATCH",
      headers: {
        ...serviceStorageHeaders(),
        "Tus-Resumable": TUS_VERSION,
        "Upload-Offset": String(offset),
        "Content-Type": "application/offset+octet-stream",
      },
      body: Buffer.from(body),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: message || `Video parçası Storage'a aktarılamadı (${response.status}).` },
        { status: response.status, headers: noStoreHeaders() },
      );
    }

    const nextOffset = Number(response.headers.get("Upload-Offset") || offset + body.byteLength);
    return NextResponse.json(
      {
        ok: true,
        nextOffset: Number.isFinite(nextOffset) && nextOffset >= 0 ? nextOffset : offset + body.byteLength,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Video parçası yüklenemedi." },
      { status: 400, headers: noStoreHeaders() },
    );
  }
}
