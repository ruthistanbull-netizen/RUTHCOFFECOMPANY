import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const SETTING_KEY = "abandoned_cart_email_settings";

const DEFAULT_SETTINGS = {
  enabled: true,
  firstDelayHours: 3,
  secondDelayHours: 6,
  thirdDelayHours: 6,
};

function normalizeSettings(input: unknown) {
  const value = input && typeof input === "object" ? input as Record<string, any> : {};
  const cleanNumber = (next: unknown, fallback: number) => {
    const number = Number(next);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(72, Math.max(1, Math.round(number)));
  };

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
    firstDelayHours: cleanNumber(value.firstDelayHours, DEFAULT_SETTINGS.firstDelayHours),
    secondDelayHours: cleanNumber(value.secondDelayHours, DEFAULT_SETTINGS.secondDelayHours),
    thirdDelayHours: cleanNumber(value.thirdDelayHours, DEFAULT_SETTINGS.thirdDelayHours),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const { data, error } = await supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", SETTING_KEY)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    settings: normalizeSettings(data?.setting_value || DEFAULT_SETTINGS),
  });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const body = await request.json();
  const settings = normalizeSettings(body.settings || body);

  const { error } = await supabase
    .from("site_settings")
    .upsert({
      setting_key: SETTING_KEY,
      setting_value: settings,
      is_public: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "setting_key" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, settings });
}
