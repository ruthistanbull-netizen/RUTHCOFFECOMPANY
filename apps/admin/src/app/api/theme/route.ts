import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefront } from "@/lib/storefront";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEYS = ["theme_customizer", "theme_sections"] as const;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("site_settings")
    .select("setting_key,setting_value")
    .in("setting_key", [...KEYS]);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const settings = Object.fromEntries((data || []).map((row: any) => [row.setting_key, row.setting_value]));
  return NextResponse.json({ ok: true, settings }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const key = String(body.key || "");
  if (!KEYS.includes(key as any)) return NextResponse.json({ ok: false, error: "Desteklenmeyen tema anahtarı." }, { status: 400 });

  const { error } = await auth.supabase.from("site_settings").upsert({
    setting_key: key,
    setting_value: body.value ?? {},
    is_public: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "setting_key" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const delivery = await revalidateStorefront("rosta-admin-theme-update", "theme");
  return NextResponse.json({ ok: true, storefront: delivery });
}
