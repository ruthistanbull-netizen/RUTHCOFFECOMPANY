import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { revalidateStorefront } from "@/lib/storefront";
import { normalizeThemeCustomizerSettings } from "@ruth-commerce/commerce-core/theme";
import { normalizeThemeSectionSettings } from "@ruth-commerce/commerce-core/theme-sections";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEYS = ["theme_customizer", "theme_sections"] as const;

const ROSTA_COLORS = {
  ivory: "#F4F0E8",
  cream: "#F4F0E8",
  ink: "#111111",
  gold: "#B9563D",
  goldDark: "#2B1B16",
  muted: "#6F725B",
};

function normalizeValue(key: string, value: unknown) {
  if (key === "theme_customizer") {
    const settings = normalizeThemeCustomizerSettings(value);
    return {
      ...settings,
      colors: { ...ROSTA_COLORS },
      logo: {
        ...settings.logo,
        src: "/rosta-coffee-co.svg",
      },
    };
  }
  if (key === "theme_sections") return normalizeThemeSectionSettings(value);
  return value ?? {};
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("site_settings")
    .select("setting_key,setting_value")
    .in("setting_key", [...KEYS]);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const settings = Object.fromEntries((data || []).map((row: any) => [
    row.setting_key,
    normalizeValue(row.setting_key, row.setting_value),
  ]));
  return NextResponse.json({ ok: true, settings }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const key = String(body.key || "");
  if (!KEYS.includes(key as any)) {
    return NextResponse.json({ ok: false, error: "Desteklenmeyen tema anahtarı." }, { status: 400 });
  }

  const value = normalizeValue(key, body.value);
  const { error } = await auth.supabase.from("site_settings").upsert({
    setting_key: key,
    setting_value: value,
    is_public: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "setting_key" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const delivery = await revalidateStorefront("rosta-admin-theme-update", "theme");
  return NextResponse.json({ ok: true, value, storefront: delivery });
}
