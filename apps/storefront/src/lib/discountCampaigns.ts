import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type DiscountTargetType = "all" | "collection" | "category" | "product";
export type DiscountValueType = "percent" | "amount";
export type CouponUsageContext = "general" | "abandoned_cart" | "review";

export type DiscountRule = {
  id: string;
  name: string;
  enabled: boolean;
  targetType: DiscountTargetType;
  targetIds: string[];
  discountType: DiscountValueType;
  value: number;
  startsAt: string;
  endsAt: string;
  stackable: boolean;
  note: string;
};

export type CouponCodeRule = {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  discountType: DiscountValueType;
  value: number;
  minOrderAmount: number;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  targetType: DiscountTargetType;
  targetIds: string[];
  startsAt: string;
  endsAt: string;
  usageContext: CouponUsageContext;
  note: string;
};

export type CampaignRule = {
  id: string;
  name: string;
  enabled: boolean;
  audience: "new_member" | "all_members" | "first_order" | "cart_value";
  benefitType: DiscountValueType | "free_shipping";
  value: number;
  minOrderAmount: number;
  couponCode: string;
  startsAt: string;
  endsAt: string;
  description: string;
};

export type DiscountCampaignSettings = {
  discounts: DiscountRule[];
  coupons: CouponCodeRule[];
  campaigns: CampaignRule[];
  updatedAt?: string;
};

export type DiscountableItem = {
  productId: string | null;
  categoryIds: string[];
  collectionIds: string[];
  quantity: number;
  unitPrice: number;
};

export type AppliedBenefit = {
  id: string;
  code: string | null;
  name: string;
  source: "automatic" | "coupon" | "campaign" | "review";
  discount: number;
  freeShipping: boolean;
};

export type DiscountEvaluation = {
  automaticDiscount: number;
  couponDiscount: number;
  freeShipping: boolean;
  applied: AppliedBenefit[];
  couponCode: string | null;
};

const EMPTY_SETTINGS: DiscountCampaignSettings = {
  discounts: [],
  coupons: [],
  campaigns: [],
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function cleanNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function nullableInt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null;
}

function targetType(value: unknown): DiscountTargetType {
  return ["category", "collection", "product"].includes(String(value))
    ? value as DiscountTargetType
    : "all";
}

function valueType(value: unknown): DiscountValueType {
  return value === "amount" ? "amount" : "percent";
}

function couponUsageContext(value: unknown): CouponUsageContext {
  return ["abandoned_cart", "review"].includes(String(value))
    ? value as CouponUsageContext
    : "general";
}

function targetIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => cleanString(item)).filter(Boolean))]
    : [];
}

function validatedDiscountValue(value: unknown, type: DiscountValueType) {
  const amount = cleanNumber(value);
  return type === "percent" ? Math.min(100, amount) : amount;
}

export function normalizeDiscountCampaignSettings(value: unknown): DiscountCampaignSettings {
  const raw = value && typeof value === "object" ? value as Record<string, any> : {};
  return {
    discounts: Array.isArray(raw.discounts) ? raw.discounts.map((item: any, index: number): DiscountRule => {
      const discountType = valueType(item?.discountType);
      return {
        id: cleanString(item?.id, `discount-${index}`),
        name: cleanString(item?.name, "İndirim"),
        enabled: Boolean(item?.enabled),
        targetType: targetType(item?.targetType),
        targetIds: targetIds(item?.targetIds),
        discountType,
        value: validatedDiscountValue(item?.value, discountType),
        startsAt: cleanString(item?.startsAt),
        endsAt: cleanString(item?.endsAt),
        stackable: Boolean(item?.stackable),
        note: cleanString(item?.note),
      };
    }) : [],
    coupons: Array.isArray(raw.coupons) ? raw.coupons.map((item: any, index: number): CouponCodeRule => {
      const discountType = valueType(item?.discountType);
      return {
        id: cleanString(item?.id, `coupon-${index}`),
        code: cleanString(item?.code).toLocaleUpperCase("tr-TR").replace(/\s+/g, ""),
        name: cleanString(item?.name, "Kupon"),
        enabled: Boolean(item?.enabled),
        discountType,
        value: validatedDiscountValue(item?.value, discountType),
        minOrderAmount: cleanNumber(item?.minOrderAmount),
        usageLimit: nullableInt(item?.usageLimit),
        perCustomerLimit: nullableInt(item?.perCustomerLimit),
        targetType: targetType(item?.targetType),
        targetIds: targetIds(item?.targetIds),
        startsAt: cleanString(item?.startsAt),
        endsAt: cleanString(item?.endsAt),
        usageContext: couponUsageContext(item?.usageContext),
        note: cleanString(item?.note),
      };
    }) : [],
    campaigns: Array.isArray(raw.campaigns) ? raw.campaigns.map((item: any, index: number): CampaignRule => {
      const benefitType = ["percent", "amount", "free_shipping"].includes(item?.benefitType)
        ? item.benefitType as CampaignRule["benefitType"]
        : "percent";
      return {
        id: cleanString(item?.id, `campaign-${index}`),
        name: cleanString(item?.name, "Kampanya"),
        enabled: Boolean(item?.enabled),
        audience: ["new_member", "all_members", "first_order", "cart_value"].includes(item?.audience) ? item.audience : "cart_value",
        benefitType,
        value: benefitType === "free_shipping" ? 0 : validatedDiscountValue(item?.value, benefitType),
        minOrderAmount: cleanNumber(item?.minOrderAmount),
        couponCode: cleanString(item?.couponCode).toLocaleUpperCase("tr-TR").replace(/\s+/g, ""),
        startsAt: cleanString(item?.startsAt),
        endsAt: cleanString(item?.endsAt),
        description: cleanString(item?.description),
      };
    }) : [],
    updatedAt: cleanString(raw.updatedAt),
  };
}

export async function loadDiscountCampaignSettings(): Promise<DiscountCampaignSettings> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("site_settings")
      .select("setting_value")
      .eq("setting_key", "discount_campaigns")
      .maybeSingle();
    if (error) {
      console.error("İndirim ayarları okunamadı:", error.message);
      return EMPTY_SETTINGS;
    }
    return normalizeDiscountCampaignSettings(data?.setting_value);
  } catch (error) {
    console.error("İndirim ayarları okunamadı:", error);
    return EMPTY_SETTINGS;
  }
}

export function isRuleActive(rule: { enabled: boolean; startsAt?: string; endsAt?: string }, now = Date.now()) {
  if (!rule.enabled) return false;
  const starts = cleanString(rule.startsAt);
  const ends = cleanString(rule.endsAt);
  const startTime = starts ? new Date(starts).getTime() : 0;
  const endTime = ends ? new Date(ends).getTime() : 0;
  if (starts && (!Number.isFinite(startTime) || startTime > now)) return false;
  if (ends && (!Number.isFinite(endTime) || endTime < now)) return false;
  return true;
}

function itemMatchesTarget(item: DiscountableItem, type: DiscountTargetType, ids: string[]) {
  if (type === "all") return true;
  if (!ids.length) return false;
  const accepted = new Set(ids.map(String));
  if (type === "product") return Boolean(item.productId && accepted.has(String(item.productId)));
  const values = type === "category" ? item.categoryIds : item.collectionIds;
  return values.some((id) => accepted.has(String(id)));
}

function amountForValue(base: number, type: DiscountValueType, value: number) {
  if (base <= 0 || value <= 0) return 0;
  if (type === "amount") return Math.min(base, value);
  return Math.min(base, Number(((base * Math.min(100, value)) / 100).toFixed(2)));
}

export function automaticDiscountForItem(item: DiscountableItem, settings: DiscountCampaignSettings) {
  const lineTotal = Number((Math.max(0, item.unitPrice) * Math.max(1, item.quantity)).toFixed(2));
  const rules = settings.discounts.filter((rule) => isRuleActive(rule) && itemMatchesTarget(item, rule.targetType, rule.targetIds));
  if (!rules.length) return { discount: 0, rules: [] as DiscountRule[] };

  const nonStackable = rules
    .filter((rule) => !rule.stackable)
    .map((rule) => ({ rule, discount: amountForValue(lineTotal, rule.discountType, rule.value) }))
    .sort((a, b) => b.discount - a.discount)[0];
  const stackable = rules.filter((rule) => rule.stackable);

  let remaining = lineTotal;
  let total = 0;
  const applied: DiscountRule[] = [];
  if (nonStackable?.discount) {
    total += nonStackable.discount;
    remaining = Math.max(0, lineTotal - total);
    applied.push(nonStackable.rule);
  }
  for (const rule of stackable) {
    const discount = amountForValue(remaining, rule.discountType, rule.value);
    if (discount <= 0) continue;
    total += discount;
    remaining = Math.max(0, remaining - discount);
    applied.push(rule);
  }
  return { discount: Number(Math.min(lineTotal, total).toFixed(2)), rules: applied };
}

function targetedSubtotal(items: DiscountableItem[], type: DiscountTargetType, ids: string[]) {
  return Number(items
    .filter((item) => itemMatchesTarget(item, type, ids))
    .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    .toFixed(2));
}

async function customerOrderCount(email: string | null, profileId: string | null) {
  if (!email && !profileId) return 0;
  const supabase = getSupabaseAdmin();
  let query = supabase.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "paid");
  if (profileId) query = query.eq("profile_id", profileId);
  else query = query.eq("customer_email", email as string);
  const { count, error } = await query;
  if (error) return 0;
  return Number(count || 0);
}

async function redemptionCounts(ruleId: string, code: string, email: string | null, profileId: string | null) {
  const supabase = getSupabaseAdmin();
  const totalQuery = await supabase
    .from("discount_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("rule_id", ruleId)
    .eq("code", code)
    .eq("status", "used");

  let customerCount = 0;
  if (profileId || email) {
    let query = supabase
      .from("discount_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("rule_id", ruleId)
      .eq("code", code)
      .eq("status", "used");
    query = profileId ? query.eq("profile_id", profileId) : query.eq("customer_email", email as string);
    const result = await query;
    customerCount = Number(result.count || 0);
  }
  return { total: Number(totalQuery.count || 0), customer: customerCount };
}

async function isCouponContextEligible(coupon: CouponCodeRule, email: string | null, profileId: string | null) {
  if (coupon.usageContext === "general") return true;
  const supabase = getSupabaseAdmin();

  if (coupon.usageContext === "review") {
    if (!email && !profileId) return false;
    let query = supabase
      .from("review_request_emails")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent");
    query = profileId ? query.eq("profile_id", profileId) : query.eq("email", email as string);
    const { count, error } = await query;
    return !error && Number(count || 0) > 0;
  }

  if (!email) return false;
  const normalizedEmail = email.trim().toLocaleLowerCase("tr-TR");
  const { data, error } = await supabase
    .from("checkout_drafts")
    .select("id,customer")
    .in("status", ["payment_reached", "waiting", "failed"])
    .is("order_id", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return false;
  return (data || []).some((draft: any) => {
    const customer = draft?.customer && typeof draft.customer === "object" ? draft.customer : {};
    return cleanString(customer.email).toLocaleLowerCase("tr-TR") === normalizedEmail;
  });
}

export async function evaluateDiscounts({
  items,
  couponCode,
  customerEmail,
  profileId,
  shippingFee,
  settings: suppliedSettings,
}: {
  items: DiscountableItem[];
  couponCode?: string | null;
  customerEmail?: string | null;
  profileId?: string | null;
  shippingFee: number;
  settings?: DiscountCampaignSettings;
}): Promise<DiscountEvaluation> {
  const settings = suppliedSettings || await loadDiscountCampaignSettings();
  const applied: AppliedBenefit[] = [];
  let automaticDiscount = 0;

  for (const item of items) {
    const result = automaticDiscountForItem(item, settings);
    automaticDiscount += result.discount;
    for (const rule of result.rules) {
      if (!applied.some((entry) => entry.id === rule.id)) {
        applied.push({ id: rule.id, code: null, name: rule.name, source: "automatic", discount: 0, freeShipping: false });
      }
    }
  }
  automaticDiscount = Number(automaticDiscount.toFixed(2));

  const cleanCode = cleanString(couponCode).toLocaleUpperCase("tr-TR").replace(/\s+/g, "");
  let couponDiscount = 0;
  let freeShipping = false;
  let usedCode: string | null = null;
  const subtotal = Number(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2));
  const afterAutomatic = Math.max(0, subtotal - automaticDiscount);

  if (cleanCode) {
    const coupon = settings.coupons.find((rule) => rule.code === cleanCode && isRuleActive(rule));
    if (coupon) {
      const contextEligible = await isCouponContextEligible(coupon, customerEmail || null, profileId || null);
      if (!contextEligible) {
        if (coupon.usageContext === "abandoned_cart") throw new Error("Bu kupon yalnızca terk edilmiş sepet hatırlatması alan müşteriler için geçerli.");
        if (coupon.usageContext === "review") throw new Error("Bu kupon yalnızca yorum / değerlendirme maili alan müşteriler için geçerli.");
        throw new Error("Bu kupon bu alışverişte kullanılamıyor.");
      }
      if (subtotal < coupon.minOrderAmount) throw new Error(`Bu kupon için minimum sepet tutarı ${coupon.minOrderAmount.toFixed(2)} TL.`);
      const counts = await redemptionCounts(coupon.id, cleanCode, customerEmail || null, profileId || null);
      if (coupon.usageLimit !== null && counts.total >= coupon.usageLimit) throw new Error("Bu kuponun kullanım limiti doldu.");
      if (coupon.perCustomerLimit !== null && counts.customer >= coupon.perCustomerLimit) throw new Error("Bu kuponu daha önce kullandın.");
      const targetBase = Math.min(afterAutomatic, targetedSubtotal(items, coupon.targetType, coupon.targetIds));
      if (targetBase <= 0) throw new Error("Bu kupon sepetindeki ürünlerde geçerli değil.");
      couponDiscount = amountForValue(targetBase, coupon.discountType, coupon.value);
      usedCode = cleanCode;
      applied.push({ id: coupon.id, code: cleanCode, name: coupon.name, source: "coupon", discount: couponDiscount, freeShipping: false });
    } else {
      const campaign = settings.campaigns.find((rule) => rule.couponCode === cleanCode && isRuleActive(rule));
      if (!campaign) throw new Error("Kupon kodu geçersiz veya süresi dolmuş.");
      if (subtotal < campaign.minOrderAmount) throw new Error(`Bu kampanya için minimum sepet tutarı ${campaign.minOrderAmount.toFixed(2)} TL.`);
      const orderCount = await customerOrderCount(customerEmail || null, profileId || null);
      if (campaign.audience === "all_members" && !profileId) throw new Error("Bu kampanya yalnızca üyelere özel.");
      if ((campaign.audience === "new_member" || campaign.audience === "first_order") && (!profileId || orderCount > 0)) {
        throw new Error("Bu kampanya yalnızca ilk siparişini veren yeni üyelere özel.");
      }
      if (campaign.benefitType === "free_shipping") freeShipping = shippingFee > 0;
      else couponDiscount = amountForValue(afterAutomatic, campaign.benefitType, campaign.value);
      usedCode = cleanCode;
      applied.push({ id: campaign.id, code: cleanCode, name: campaign.name, source: "campaign", discount: couponDiscount, freeShipping });
    }
  } else {
    const automaticCampaigns = settings.campaigns.filter((rule) =>
      isRuleActive(rule) && rule.audience === "cart_value" && !rule.couponCode && subtotal >= rule.minOrderAmount
    );
    for (const campaign of automaticCampaigns) {
      let campaignDiscount = 0;
      let campaignFreeShipping = false;
      if (campaign.benefitType === "free_shipping") {
        campaignFreeShipping = shippingFee > 0;
        freeShipping = freeShipping || campaignFreeShipping;
      } else {
        campaignDiscount = amountForValue(
          Math.max(0, afterAutomatic - couponDiscount),
          campaign.benefitType,
          campaign.value,
        );
        couponDiscount += campaignDiscount;
      }
      applied.push({
        id: campaign.id,
        code: null,
        name: campaign.name,
        source: "campaign",
        discount: campaignDiscount,
        freeShipping: campaignFreeShipping,
      });
    }
  }

  return {
    automaticDiscount,
    couponDiscount: Number(Math.min(afterAutomatic, couponDiscount).toFixed(2)),
    freeShipping,
    applied,
    couponCode: usedCode,
  };
}

export async function recordDiscountRedemptions({
  applied,
  orderId,
  orderNo,
  profileId,
  customerEmail,
}: {
  applied: AppliedBenefit[];
  orderId: string;
  orderNo: string;
  profileId: string | null;
  customerEmail: string | null;
}) {
  const rows = applied
    .filter((item) => item.code && item.source !== "review")
    .map((item) => ({
      rule_id: item.id,
      code: item.code,
      source_type: item.source,
      order_id: orderId,
      order_no: orderNo,
      profile_id: profileId,
      customer_email: customerEmail,
      discount_amount: item.discount,
      free_shipping: item.freeShipping,
      status: "used",
      used_at: new Date().toISOString(),
    }));
  if (!rows.length) return;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("discount_redemptions").upsert(rows, { onConflict: "rule_id,order_id" });
  if (error) throw new Error(`İndirim kullanımı kaydedilemedi: ${error.message}`);
}
