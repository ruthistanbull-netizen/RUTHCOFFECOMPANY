import { NextRequest, NextResponse } from "next/server";
import { basitKargoRequest } from "@/lib/basitKargo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LocationRow = { id: string; name: string };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let citiesCache: { expiresAt: number; rows: LocationRow[] } | null = null;
const townsCache = new Map<string, { expiresAt: number; rows: LocationRow[] }>();

function rowsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const source = payload as Record<string, unknown>;
  for (const key of ["data", "result", "cities", "towns", "items"]) {
    if (Array.isArray(source[key])) return source[key] as unknown[];
  }
  return [];
}

function normalizeRows(payload: unknown): LocationRow[] {
  const seen = new Set<string>();
  return rowsFromPayload(payload)
    .map((row) => {
      if (typeof row === "string") return { id: row, name: row };
      if (!row || typeof row !== "object") return null;
      const record = row as Record<string, unknown>;
      const name = String(record.name ?? record.label ?? record.title ?? "").trim();
      const id = String(record.id ?? record.code ?? name).trim();
      if (!name || !id) return null;
      return { id, name };
    })
    .filter((row): row is LocationRow => Boolean(row))
    .filter((row) => {
      const key = row.name.toLocaleLowerCase("tr-TR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

async function loadCities() {
  const now = Date.now();
  if (citiesCache && citiesCache.expiresAt > now) return citiesCache.rows;
  const rows = normalizeRows(await basitKargoRequest("/country/TR/cities"));
  citiesCache = { rows, expiresAt: now + CACHE_TTL_MS };
  return rows;
}

async function loadTowns(cityId: string) {
  const now = Date.now();
  const cached = townsCache.get(cityId);
  if (cached && cached.expiresAt > now) return cached.rows;
  const rows = normalizeRows(await basitKargoRequest(`/city/${encodeURIComponent(cityId)}/towns`));
  townsCache.set(cityId, { rows, expiresAt: now + CACHE_TTL_MS });
  return rows;
}

export async function GET(request: NextRequest) {
  try {
    const cityId = String(request.nextUrl.searchParams.get("cityId") || "").trim();
    if (cityId) {
      if (!/^[a-zA-Z0-9_-]+$/.test(cityId)) {
        return NextResponse.json({ ok: false, error: "Geçersiz şehir kimliği." }, { status: 400 });
      }
      const towns = await loadTowns(cityId);
      return NextResponse.json(
        { ok: true, source: "basit_kargo", towns },
        { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } },
      );
    }

    const cities = await loadCities();
    return NextResponse.json(
      { ok: true, source: "basit_kargo", cities },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch (error) {
    console.error("Basit Kargo konum listesi alınamadı:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Basit Kargo konum listesi alınamadı." },
      { status: 503 },
    );
  }
}
