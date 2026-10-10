import { NextResponse } from "next/server";
import { getStoreDesignV2Published } from "@/data/site";
import { readPanelPublishedTheme } from "@/lib/panelPublishedTheme";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const [panel, storefront] = await Promise.all([
    readPanelPublishedTheme(),
    getStoreDesignV2Published(),
  ]);
  const storefrontRevision = Number(storefront.revision || 0);
  const panelRevision = panel?.revision ?? null;
  const inSync = panelRevision !== null && storefrontRevision === panelRevision;
  return NextResponse.json({
    ok: inSync,
    panelReachable: Boolean(panel),
    panelRevision,
    storefrontRevision,
    mediaCount: Object.keys(storefront.media || {}).length,
    inSync,
    note: !panel
      ? "Panelin yayınlanmış tema kaydına erişilemiyor."
      : inSync
        ? "Canlı storefront ve panel aynı yayın sürümünü okuyor."
        : "Panel ve canlı storefront farklı tema sürümleri okuyor.",
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
    status: inSync ? 200 : 503,
  });
}
