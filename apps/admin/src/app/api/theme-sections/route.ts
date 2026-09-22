import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  defaultThemeSectionSettings,
  normalizeThemeSectionSettings,
} from "@ruth-commerce/commerce-core/theme-sections";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

const KEY = "theme_sections";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", KEY)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({
    ok: true,
    settings: normalizeThemeSectionSettings(data?.setting_value || defaultThemeSectionSettings),
  }, { headers: noStoreHeaders() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json();
  const token = typeof body.token === "string"
    ? body.token.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120)
    : "";
  if (!token) return NextResponse.json({ ok: false, error: "Preview token gerekli." }, { status: 400 });
  const settings = normalizeThemeSectionSettings(body.settings);
  const { data, error } = await auth.supabase.from("site_settings").upsert({
    setting_key: `theme_sections_preview_${token}`,
    setting_value: settings,
    // Preview drafts are server-read with the service role. They must never become public storefront settings.
    is_public: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: "setting_key" }).select("setting_key,updated_at").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: "Önizleme taslağı doğrulanamadı." }, { status: 500, headers: noStoreHeaders() });
  return NextResponse.json({ ok: true, persistedAt: data.updated_at }, { headers: noStoreHeaders() });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json();
  const settings = normalizeThemeSectionSettings(body.settings || body);
  const { data, error } = await auth.supabase.from("site_settings").upsert({
    setting_key: KEY,
    setting_value: settings,
    is_public: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "setting_key" }).select("setting_key,setting_value,updated_at").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ ok: false, error: "Bölüm kaydı doğrulanamadı." }, { status: 500, headers: noStoreHeaders() });
  const persisted = normalizeThemeSectionSettings(data.setting_value);
  if (JSON.stringify(persisted) !== JSON.stringify(settings)) {
    return NextResponse.json({ ok: false, error: "Bölüm kaydı veritabanında beklenen değerlerle eşleşmedi." }, { status: 409, headers: noStoreHeaders() });
  }
  const revalidate = await revalidateWebsite({
    source: "admin-theme-sections",
    scope: "theme",
    paths: ["/", "/products", "/collections", "/categories"],
    tags: ["ruth-theme"],
  });
  return NextResponse.json({ ok: true, settings: persisted, persistedAt: data.updated_at, revalidate }, { headers: noStoreHeaders() });
}
