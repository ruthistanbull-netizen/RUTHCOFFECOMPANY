import { NextResponse } from "next/server";
import {
  SOCIAL_MEDIA_PLATFORMS,
  normalizeSocialMediaSettings,
  type SocialMediaSettings,
} from "@ruth-commerce/contracts/social-media";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

const SETTING_KEY = "social_media";
const FALLBACK_SETTINGS: Partial<SocialMediaSettings> = {
  instagram: process.env.NEXT_PUBLIC_ROSTA_INSTAGRAM_URL || "",
  tiktok: process.env.NEXT_PUBLIC_ROSTA_TIKTOK_URL || "",
  whatsapp: process.env.NEXT_PUBLIC_ROSTA_WHATSAPP_URL || "",
};

function invalidPlatformEntries(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return SOCIAL_MEDIA_PLATFORMS.filter((platform) => {
    const raw = String(source[platform.key] || "").trim();
    if (!raw) return false;
    return !normalizeSocialMediaSettings({ [platform.key]: raw })[platform.key];
  });
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("site_settings")
    .select("setting_value,updated_at")
    .eq("setting_key", SETTING_KEY)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  }

  const settings = data
    ? normalizeSocialMediaSettings(data.setting_value)
    : normalizeSocialMediaSettings({}, FALLBACK_SETTINGS);

  return NextResponse.json({
    ok: true,
    settings,
    persisted: Boolean(data),
    updatedAt: data?.updated_at || null,
  }, { headers: noStoreHeaders() });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const rawSettings = body?.settings ?? body;
  const invalid = invalidPlatformEntries(rawSettings);
  if (invalid.length) {
    return NextResponse.json({
      ok: false,
      error: `Geçerli bağlantı girilmesi gereken alanlar: ${invalid.map((item) => item.label).join(", ")}.`,
    }, { status: 400, headers: noStoreHeaders() });
  }

  const settings = normalizeSocialMediaSettings(rawSettings);
  const now = new Date().toISOString();
  const { data, error } = await auth.supabase
    .from("site_settings")
    .upsert({
      setting_key: SETTING_KEY,
      setting_value: settings,
      is_public: true,
      updated_at: now,
    }, { onConflict: "setting_key" })
    .select("setting_key,setting_value,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  }

  const persisted = normalizeSocialMediaSettings(data?.setting_value);
  if (!data || JSON.stringify(persisted) !== JSON.stringify(settings)) {
    return NextResponse.json({
      ok: false,
      error: "Sosyal medya ayarları veritabanında doğrulanamadı.",
    }, { status: 409, headers: noStoreHeaders() });
  }

  const revalidate = await revalidateWebsite({
    source: "rosta-admin-social-media",
    scope: "theme",
    paths: ["/", "/contact"],
    tags: ["rosta-social-media", "rosta-theme"],
  });

  return NextResponse.json({
    ok: true,
    settings: persisted,
    persistedAt: data.updated_at,
    revalidate,
    warning: revalidate.ok ? null : revalidate.message || "Ayarlar kaydedildi; storefront cache'i kısa süre içinde yenilenecek.",
  }, { headers: noStoreHeaders() });
}
