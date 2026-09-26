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

function canonicalTurkishName(value: unknown) {
  const text = clean(value);
  if (!text) return "";

  // Bazı adres kaynakları isimleri tamamen büyük harfle döndürebiliyor.
  // Kullanıcıya daima doğal Türkçe yazım göster; eşleşme kodu zaten case-insensitive.
  if (text !== text.toLocaleUpperCase("tr-TR")) return text;

  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/(^|[\s\-/'’])(\p{L})/gu, (match, prefix: string, letter: string) =>
      `${prefix}${letter.toLocaleUpperCase("tr-TR")}`,
    );
}

function normalizeProvince(row: ApiProvince) {
  const province = canonicalTurkishName(row.name);
  if (!province) return null;

  const districts = (Array.isArray(row.districts) ? row.districts : [])
    .map((district) =>
      canonicalTurkishName(typeof district === "string" ? district : district?.name),
    )
    .filter(Boolean);

  return {
    province,
    districts: [...new Set(districts)].sort((a, b) => a.localeCompare(b, "tr")),
  };
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
    const rows = Array.isArray(payload?.data) ? (payload.data as ApiProvince[]) : [];
    const locations = rows.map(normalizeProvince).filter(Boolean);

    if (!locations.length) {
      throw new Error("Adres kaynağından il/ilçe listesi alınamadı.");
    }

    return NextResponse.json(
      { ok: true, source: "turkiye_api", locations },
      {
        headers: {
          "Cache-Control":
            "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Adres listesi alınamadı.",
      },
      { status: 503 },
    );
  }
}
