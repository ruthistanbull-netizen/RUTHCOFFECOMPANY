import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeThemeDocument } from "@ruth-commerce/commerce-core/store-design-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREVIEW_PREFIX = "store_design_v2_preview_";

function cleanToken(value: string | null) {
  return (value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
}

function noStoreHeaders() {
  return {
    "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
    Pragma: "no-cache",
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = cleanToken(url.searchParams.get("token"));
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Önizleme tokenı gerekli." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("site_settings")
      .select("setting_value,updated_at")
      .eq("setting_key", `${PREVIEW_PREFIX}${token}`)
      .eq("is_public", false)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data?.setting_value) {
      return NextResponse.json(
        { ok: false, error: "Önizleme taslağı bulunamadı." },
        { status: 404, headers: noStoreHeaders() },
      );
    }

    return NextResponse.json({
      ok: true,
      document: normalizeThemeDocument(data.setting_value),
      updatedAt: data.updated_at || null,
    }, { headers: noStoreHeaders() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Önizleme taslağı okunamadı." },
      { status: 400, headers: noStoreHeaders() },
    );
  }
}
