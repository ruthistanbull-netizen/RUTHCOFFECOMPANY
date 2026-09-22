import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  defaultDiscountCampaignSettings,
  normalizeDiscountCampaignSettings,
  type DiscountTargetType,
} from "@/lib/discountCampaignSettings";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";
import { resolveCatalogId, slugifyCatalogValue } from "@/lib/catalogGroups";

export const runtime = "nodejs";

const SETTING_KEY = "discount_campaigns";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveProductId(supabase: any, idOrSlug: string) {
  const raw = String(idOrSlug || "").trim();
  if (!raw) return null;

  let query = supabase.from("products").select("id,name,slug,status").limit(1);
  query = UUID_PATTERN.test(raw)
    ? query.eq("id", raw)
    : query.eq("slug", slugifyCatalogValue(raw));

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Ürün bulunamadı. Ürünler menüsünden aktif ürünü seç.");
  if (data.status && data.status !== "active") throw new Error(`${data.name || "Ürün"} aktif değil.`);
  return String(data.id);
}

async function resolveTargets(supabase: any, targetType: DiscountTargetType, ids: string[]) {
  if (targetType === "all") return [];

  const resolved = await Promise.all((ids || []).map((id) => {
    if (targetType === "product") return resolveProductId(supabase, id);
    return resolveCatalogId(supabase, targetType === "category" ? "categories" : "collections", id);
  }));

  const unique = [...new Set(resolved.filter(Boolean).map(String))];
  if (!unique.length) {
    const label = targetType === "product" ? "ürün" : targetType === "category" ? "kategori" : "koleksiyon";
    throw new Error(`Bu kural için en az bir aktif ${label} seç.`);
  }
  return unique;
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const { data, error } = await supabase
    .from("site_settings")
    .select("setting_value,updated_at")
    .eq("setting_key", SETTING_KEY)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });

  return NextResponse.json({
    ok: true,
    settings: normalizeDiscountCampaignSettings(data?.setting_value || defaultDiscountCampaignSettings),
    databaseUpdatedAt: data?.updated_at || null,
  }, { headers: noStoreHeaders() });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const body = await request.json();
  const settings = normalizeDiscountCampaignSettings({
    ...(body.settings || body),
    updatedAt: new Date().toISOString(),
  });

  try {
    for (const item of settings.discounts) {
      item.targetIds = await resolveTargets(supabase, item.targetType, item.targetIds);
    }
    for (const item of settings.coupons) {
      item.targetIds = await resolveTargets(supabase, item.targetType, item.targetIds);
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "İndirim hedefleri çözülemedi." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const { error } = await supabase
    .from("site_settings")
    .upsert({
      setting_key: SETTING_KEY,
      setting_value: settings,
      is_public: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: "setting_key" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });

  const revalidate = await revalidateWebsite({ source: "admin-discount-campaigns" });
  return NextResponse.json({
    ok: true,
    settings,
    revalidate,
    warning: revalidate.ok ? null : revalidate.message,
  }, { headers: noStoreHeaders() });
}
