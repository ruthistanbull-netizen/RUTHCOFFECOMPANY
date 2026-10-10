import { NextResponse } from "next/server";
import { getStoreDesignV2Published } from "@/data/site";
import { inspectPanelPublishedTheme, readPanelPublishedTheme } from "@/lib/panelPublishedTheme";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const [panel, storefront, transport] = await Promise.all([
    readPanelPublishedTheme(),
    getStoreDesignV2Published(),
    inspectPanelPublishedTheme(),
  ]);
  const storefrontRevision = Number(storefront.revision || 0);
  const panelRevision = panel?.revision ?? null;
  const inSync = panelRevision !== null && storefrontRevision === panelRevision;
  return NextResponse.json({
    ok: inSync,
    panelReachable: Boolean(panel),
    panelStatusReachable: transport.reachable,
    panelStatusRevision: transport.revision,
    panelStatusMediaCount: transport.mediaCount,
    panelConnectionAttempts: transport.attempts,
    panelRevision,
    storefrontRevision,
    mediaCount: Object.keys(storefront.media || {}).length,
    inSync,
    note: !panel
      ? transport.reachable
        ? "Panelin kısa durum yanıtı alınıyor ancak tam yayınlanmış tasarım yanıtı okunamıyor."
        : "Storefront sunucusu panelin yayınlanmış tema adresine ulaşamıyor; panel bağlantı denemelerini kontrol et."
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
