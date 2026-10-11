import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEYS = ["store_design_v2_published", "theme_customizer"] as const;

/**
 * Only already-published PUBLIC store settings, never draft or preview keys.
 * This lets ROSTA's live storefront read from the exact self-host database
 * the panel writes to, even if the storefront's own DB env is stale.
 */
export async function GET(request: Request) {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("site_settings")
      .select("setting_key,setting_value,updated_at")
      .eq("is_public", true)
      .in("setting_key", [...KEYS]);

    if (error) throw new Error(error.message);
    const published = data?.find((row) => row.setting_key === KEYS[0]);
    const customizer = data?.find((row) => row.setting_key === KEYS[1]);

    const statusOnly = new URL(request.url).searchParams.get("status") === "1";
    const raw = published?.setting_value;
    const theme = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
    const media = theme?.media && typeof theme.media === "object" && !Array.isArray(theme.media)
      ? theme.media as Record<string, unknown> : {};

    return NextResponse.json({
      ok: Boolean(published?.setting_value),
      source: "rosta-panel-selfhost",
      publishedAt: published?.updated_at || null,
      revision: typeof theme?.revision === "number" ? theme.revision : null,
      mediaCount: Object.keys(media).length,
      ...(!statusOnly ? {
        published: published?.setting_value || null,
        customizer: customizer?.setting_value || null,
      } : {}),
    }, {
      status: published?.setting_value ? 200 : 503,
      headers: {
        ...noStoreHeaders(),
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("[ROSTA published theme] self-host read failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "Yayınlanmış tema okunamadı." }, {
      status: 503,
      headers: noStoreHeaders(),
    });
  }
}
