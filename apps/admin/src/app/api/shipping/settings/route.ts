import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

const SETTING_KEY = "shipping_settings";
const DEFAULT_THRESHOLD = 2000;
const DEFAULT_CUSTOMER_FEE = 79.9;

function normalizeSettings(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const threshold = Number(source.freeShippingThreshold ?? DEFAULT_THRESHOLD);
  const customerFee = Number(source.customerShippingFee ?? source.shippingFee ?? DEFAULT_CUSTOMER_FEE);
  return {
    freeShippingThreshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : DEFAULT_THRESHOLD,
    customerShippingFee: Number.isFinite(customerFee) && customerFee >= 0 ? customerFee : DEFAULT_CUSTOMER_FEE,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", SETTING_KEY)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  return NextResponse.json({ ok: true, settings: normalizeSettings(data?.setting_value) }, { headers: noStoreHeaders() });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const settings = normalizeSettings(body.settings || body);

  const { error } = await auth.supabase
    .from("site_settings")
    .upsert({
      setting_key: SETTING_KEY,
      setting_value: settings,
      is_public: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "setting_key" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });

  // Duyuru metni ücretsiz kargo bilgisini içeriyorsa tutarı da aynı anda güncel tut.
  const { data: themeRow } = await auth.supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", "theme_customizer")
    .maybeSingle();
  const theme = themeRow?.setting_value && typeof themeRow.setting_value === "object"
    ? themeRow.setting_value as Record<string, any>
    : null;
  if (theme?.announcement && typeof theme.announcement === "object") {
    const announcement = { ...theme.announcement };
    for (const key of ["text", "text2"] as const) {
      const current = typeof announcement[key] === "string" ? announcement[key] : "";
      if (/ücretsiz\s+kargo/i.test(current)) {
        announcement[key] = current.replace(/[\d.,]+\s*(?:TL|₺)/i, `${settings.freeShippingThreshold.toLocaleString("tr-TR")} TL`);
      }
    }
    await auth.supabase.from("site_settings").upsert({
      setting_key: "theme_customizer",
      setting_value: { ...theme, announcement },
      is_public: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "setting_key" });
  }

  const revalidate = await revalidateWebsite({
    source: "admin-shipping-settings",
    paths: ["/", "/products", "/cart", "/checkout"],
    tags: ["shipping-settings", "rosta-theme"],
  });

  return NextResponse.json({
    ok: true,
    settings,
    revalidate,
    warning: revalidate.ok ? null : revalidate.message,
  }, { headers: noStoreHeaders() });
}
