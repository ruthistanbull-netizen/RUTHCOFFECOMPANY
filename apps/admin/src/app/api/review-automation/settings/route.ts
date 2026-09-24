import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const KEY = "review_request_email_settings";
const DEFAULTS = {
  enabled: true,
  delayDaysAfterDelivered: 1,
  discountPercent: 10,
  subject: "Ürünü değerlendir, %10 indirim kazan",
  template: "Merhaba {{customer_name}}, siparişindeki ürünleri değerlendirmek ister misin? Yorumunu gönderdiğinde %10 indirim hesabına tanımlanır. {{review_url}}",
};

function normalize(input: any) {
  const value = input && typeof input === "object" ? input : {};
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULTS.enabled,
    // This automation is intentionally fixed: exactly 1 day after delivery.
    delayDaysAfterDelivered: 1,
    discountPercent: Math.max(1, Math.min(50, Math.round(Number(value.discountPercent || DEFAULTS.discountPercent)))),
    subject: String(value.subject || DEFAULTS.subject),
    template: String(value.template || DEFAULTS.template),
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { data, error } = await auth.supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", KEY)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, settings: normalize(data?.setting_value) });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const settings = normalize(body.settings || body);
  const { error } = await auth.supabase.from("site_settings").upsert(
    {
      setting_key: KEY,
      setting_value: settings,
      is_public: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "setting_key" },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, settings });
}
