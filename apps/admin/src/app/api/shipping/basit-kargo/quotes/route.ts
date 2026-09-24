import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { basitKargoRequest, isBasitKargoConfigured, normalizeBasitKargoQuotes } from "@/lib/basitKargo";
import { normalizePackages } from "@/lib/basitKargoShipping";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

function calculateDesiKg(packages: Array<{ height: number; width: number; depth: number; weight: number }>) {
  const total = packages.reduce((sum, item) => {
    const desi = (item.height * item.width * item.depth) / 3000;
    return sum + Math.max(desi, item.weight);
  }, 0);
  return Math.max(1, Math.ceil(total));
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  if (!isBasitKargoConfigured()) {
    return NextResponse.json(
      { ok: true, configured: false, packages: [], quotes: [], source: "unbound" },
      { headers: noStoreHeaders() },
    );
  }
  try {
    const body = await request.json().catch(() => ({}));
    const packages = normalizePackages(body.packages);
    const primaryPayload = await basitKargoRequest("/handlers/fee/packages", {
      method: "POST",
      body: JSON.stringify(packages.map((item) => ({
        height: String(item.height),
        width: String(item.width),
        depth: String(item.depth),
        weight: String(item.weight),
      }))),
    });

    let quotes = normalizeBasitKargoQuotes(primaryPayload);
    let source = "packages";

    // Bazı hesaplarda paket uç noktası boş dizi dönebiliyor. Aynı paketin desi/kg değeriyle ikinci resmi uç noktayı dene.
    if (!quotes.length) {
      const desiKg = calculateDesiKg(packages);
      const fallbackPayload = await basitKargoRequest(`/handlers/fee/desiKg/${desiKg}`);
      quotes = normalizeBasitKargoQuotes(fallbackPayload);
      source = "desiKg";
    }

    const sorted = quotes
      .filter((quote) => Number.isFinite(Number(quote.price)))
      .sort((a, b) => Number(a.price) - Number(b.price));

    return NextResponse.json({ ok: true, configured: true, packages, quotes: sorted, source }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Canlı fiyatlar alınamadı." }, { status: 400, headers: noStoreHeaders() });
  }
}
