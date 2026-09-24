import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { defaultThemeCustomizerSettings, normalizeThemeCustomizerSettings } from "@/lib/themeCustomizer";
import { normalizeThemeMediaSettings } from "@/lib/themeMedia";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

const THEME_KEY = "theme_customizer";

const ROSTA_COLORS = {
  ivory: "#F4F0E8",
  cream: "#F4F0E8",
  ink: "#111111",
  gold: "#B9563D",
  goldDark: "#2B1B16",
  muted: "#6F725B",
};

function preserveHeaderChildren(settings: any) {
  const header = settings?.header && typeof settings.header === "object" ? settings.header : {};
  if (!Array.isArray(header.links)) return settings;

  return {
    ...settings,
    header: {
      ...header,
      links: header.links.map((link: any) => ({
        ...link,
        children: Array.isArray(link?.children) ? link.children : [],
      })),
    },
  };
}

function normalizedTheme(settings: unknown) {
  const normalized = normalizeThemeCustomizerSettings(preserveHeaderChildren(settings));
  const media = normalizeThemeMediaSettings(normalized);
  return {
    ...media,
    colors: { ...ROSTA_COLORS },
    logo: {
      ...media.logo,
      src: "/rosta-coffee-co.svg",
    },
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", THEME_KEY)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    settings: normalizedTheme(data?.setting_value || defaultThemeCustomizerSettings),
    updatedAt: new Date().toISOString(),
  }, { headers: noStoreHeaders() });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const rawSettings = body?.settings ?? (body?.key === THEME_KEY ? body?.value : body);
  const settings = normalizedTheme(rawSettings);

  const { data, error } = await auth.supabase
    .from("site_settings")
    .upsert({
      setting_key: THEME_KEY,
      setting_value: settings,
      is_public: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "setting_key" })
    .select("setting_key,setting_value,updated_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Tema kaydı doğrulanamadı." },
      { status: 500, headers: noStoreHeaders() },
    );
  }

  const persisted = normalizedTheme(data.setting_value);
  if (JSON.stringify(persisted) !== JSON.stringify(settings)) {
    return NextResponse.json(
      { ok: false, error: "Tema kaydı veritabanında beklenen değerlerle eşleşmedi." },
      { status: 409, headers: noStoreHeaders() },
    );
  }

  const revalidate = await revalidateWebsite({
    source: "rosta-admin-theme-customizer",
    scope: "theme",
    paths: ["/", "/products", "/collections", "/categories"],
    tags: ["rosta-theme"],
  });

  return NextResponse.json({
    ok: true,
    settings: persisted,
    persistedAt: data.updated_at,
    revalidate,
    warning: revalidate.ok ? null : revalidate.message || "Tema kaydedildi ama storefront cache yenilemesi doğrulanamadı.",
  }, { headers: noStoreHeaders() });
}
