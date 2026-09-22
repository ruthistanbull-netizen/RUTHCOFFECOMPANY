import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const supabase = getSupabaseAdmin();
    const [products, settings] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }).limit(1),
      supabase.from("site_settings").select("setting_key", { count: "exact", head: true }).limit(1),
    ]);
    const error = products.error || settings.error;
    if (error) throw error;

    return NextResponse.json(
      {
        ok: true,
        service: "rosta-admin",
        status: "ready",
        latencyMs: Date.now() - started,
        time: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "rosta-admin",
        status: "not_ready",
        error: error instanceof Error ? error.message : "Supabase readiness failed.",
        time: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
    );
  }
}
