import { NextResponse } from "next/server";

type ApiProvince = {
  id?: number;
  name?: string;
  districts?: Array<{ name?: string } | string>;
};

const LOCATIONS_URL = "https://turkiyeapi.dev/api/v1/provinces?fields=id,name,districts&sort=name";

export const runtime = "nodejs";
export const revalidate = 86400;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProvince(row: ApiProvince) {
  const province = clean(row.name);
  if (!province) return null;

  const districts = (Array.isArray(row.districts) ? row.districts : [])
    .map((district) => typeof district === "string" ? district : clean(district?.name))
    .filter(Boolean);

  return { province, districts: [...new Set(districts)].sort((a, b) => a.localeCompare(b, "tr")) };
}

export async function GET() {
  try {
    const response = await fetch(LOCATIONS_URL, {
      next: { revalidate: 86400 },
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Adres kaynağı ${response.status} döndürdü.`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data as ApiProvince[] : [];
    const locations = rows.map(normalizeProvince).filter(Boolean);

    if (!locations.length) {
      throw new Error("Adres kaynağından il/ilçe listesi alınamadı.");
    }

    return NextResponse.json(
      { ok: true, locations },
      { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Adres listesi alınamadı." },
      { status: 503 },
    );
  }
}
