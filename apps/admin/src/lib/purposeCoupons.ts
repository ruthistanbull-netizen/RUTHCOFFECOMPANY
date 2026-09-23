import {
  defaultDiscountCampaignSettings,
  normalizeDiscountCampaignSettings,
  type CouponCodeRule,
  type CouponUsageContext,
} from "@/lib/discountCampaignSettings";

type Purpose = Exclude<CouponUsageContext, "general">;

function isActiveNow(coupon: CouponCodeRule, now = Date.now()) {
  if (!coupon.enabled || !coupon.code) return false;
  if (coupon.startsAt) {
    const startsAt = new Date(coupon.startsAt).getTime();
    if (Number.isFinite(startsAt) && startsAt > now) return false;
  }
  if (coupon.endsAt) {
    const endsAt = new Date(coupon.endsAt).getTime();
    if (Number.isFinite(endsAt) && endsAt < now) return false;
  }
  return true;
}

export async function loadPurposeCoupon(
  supabase: any,
  purpose: Purpose,
): Promise<CouponCodeRule | null> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", "discount_campaigns")
    .maybeSingle();

  if (error) throw new Error(error.message);

  const settings = normalizeDiscountCampaignSettings(
    data?.setting_value || defaultDiscountCampaignSettings,
  );

  return settings.coupons.find(
    (coupon) => coupon.usageContext === purpose && isActiveNow(coupon),
  ) || null;
}

export function purposeCouponLabel(coupon?: CouponCodeRule | null) {
  if (!coupon) return "";
  const value = Number(coupon.value || 0);
  if (coupon.discountType === "amount") {
    return `${value.toLocaleString("tr-TR")} TL indirim`;
  }
  return `%${value.toLocaleString("tr-TR")} indirim`;
}
