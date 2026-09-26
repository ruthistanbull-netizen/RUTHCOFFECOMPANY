import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminBaseUrl() {
  return String(
    process.env.ROSTA_ADMIN_URL ||
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    "https://rostapanel.zeabur.app"
  ).replace(/\/+$/, "");
}

export async function GET(request: NextRequest) {
  try {
    const cityId = String(request.nextUrl.searchParams.get("cityId") || "").trim();
    const query = cityId ? `?cityId=${encodeURIComponent(cityId)}` : "";
    const response = await fetch(
      `${adminBaseUrl()}/api/shipping/basit-kargo/locations${query}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 86400 },
      },
    );
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || `Basit Kargo konum servisi ${response.status} döndürdü.`);
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        source: "basit_kargo",
        error: error instanceof Error ? error.message : "Basit Kargo konum listesi alınamadı.",
      },
      { status: 503 },
    );
  }
}
