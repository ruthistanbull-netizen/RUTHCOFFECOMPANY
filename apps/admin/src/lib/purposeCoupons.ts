import {
  normalizeDiscountCampaignSettings,
  type CouponCodeRule,
  type CouponUsageContext,
} from "@/lib/discountCampaignSettings";

function active(rule: CouponCodeRule, now = Date.now()) {
  if (!rule.enabled || !rule.code) return false;
  const start = rule.startsAt ? new Date(rule.startsAt).getTime() : 0;
  const end = rule.endsAt ? new Date(rule.endsAt).getTime() : 0;
  if (rule.startsAt && (!Number.isFinite(start) || start > now)) return false;
  if (rule.endsAt && (!Number.isFinite(end) || end < now)) return false;
  return true;
}

export function purposeCouponLabel(coupon: CouponCodeRule | null) {
  if (!coupon) return "";
  if (coupon.discountType === "percent") return `%${Math.max(0, Number(coupon.value || 0))}`;
  return `${Math.max(0, Number(coupon.value || 0)).toLocaleString("tr-TR")} TL`;
}

export async function loadPurposeCoupon(
  supabase: any,
  purpose: Exclude<CouponUsageContext, "general">,
): Promise<CouponCodeRule | null> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", "discount_campaigns")
    .maybeSingle();

  if (error) return null;
  const settings = normalizeDiscountCampaignSettings(data?.setting_value || {});
  return settings.coupons.find((coupon) => coupon.usageContext === purpose && active(coupon)) || null;
}
