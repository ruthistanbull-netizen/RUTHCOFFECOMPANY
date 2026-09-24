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

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeDiscountRule(): DiscountRule {
  return {
    id: createId("discount"),
    name: "Yeni İndirim",
    enabled: true,
    targetType: "all",
    targetIds: [],
    discountType: "percent",
    value: 10,
    startsAt: "",
    endsAt: "",
    stackable: false,
    note: "",
  };
}

export function makeCouponRule(): CouponCodeRule {
  return {
    id: createId("coupon"),
    code: "ROSTA10",
    name: "Yeni Kupon",
    enabled: true,
    discountType: "percent",
    value: 10,
    minOrderAmount: 0,
    usageLimit: null,
    perCustomerLimit: 1,
    targetType: "all",
    targetIds: [],
    startsAt: "",
    endsAt: "",
    usageContext: "general",
    note: "",
  };
}

export function makeCampaignRule(): CampaignRule {
  return {
    id: createId("campaign"),
    name: "Yeni Kampanya",
    enabled: true,
    audience: "new_member",
    benefitType: "percent",
    value: 10,
    minOrderAmount: 0,
    couponCode: "WELCOME10",
    startsAt: "",
    endsAt: "",
    description: "Siteye yeni üye olan müşterilere özel avantaj.",
  };
}

export const defaultDiscountCampaignSettings: DiscountCampaignSettings = {
  discounts: [],
  coupons: [],
  campaigns: [],
};

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function discountValue(value: unknown, type: DiscountValueType) {
  const amount = numberValue(value, 0);
  return type === "percent" ? Math.min(100, amount) : amount;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null;
}

function targetType(value: unknown): DiscountTargetType {
  return ["all", "collection", "category", "product"].includes(String(value))
    ? value as DiscountTargetType
    : "all";
}

function valueType(value: unknown): DiscountValueType {
  return value === "amount" ? "amount" : "percent";
}

function usageContext(value: unknown): CouponUsageContext {
  return ["abandoned_cart", "review"].includes(String(value))
    ? value as CouponUsageContext
    : "general";
}

function targetIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
}

export function normalizeDiscountCampaignSettings(input: unknown): DiscountCampaignSettings {
  const raw = input && typeof input === "object" ? input as Record<string, any> : {};

  const discounts: DiscountRule[] = Array.isArray(raw.discounts)
    ? raw.discounts.map((item: any, index: number) => {
        const type = valueType(item?.discountType);
        return {
          id: stringValue(item?.id, `discount-${index}`),
          name: stringValue(item?.name, "İndirim"),
          enabled: Boolean(item?.enabled),
          targetType: targetType(item?.targetType),
          targetIds: targetIds(item?.targetIds),
          discountType: type,
          value: discountValue(item?.value, type),
          startsAt: stringValue(item?.startsAt),
          endsAt: stringValue(item?.endsAt),
          stackable: Boolean(item?.stackable),
          note: stringValue(item?.note),
        };
      })
    : [];

  const coupons: CouponCodeRule[] = Array.isArray(raw.coupons)
    ? raw.coupons.map((item: any, index: number) => {
        const type = valueType(item?.discountType);
        return {
          id: stringValue(item?.id, `coupon-${index}`),
          code: stringValue(item?.code, "ROSTA10").toLocaleUpperCase("tr-TR").replace(/\s+/g, ""),
          name: stringValue(item?.name, "Kupon"),
          enabled: Boolean(item?.enabled),
          discountType: type,
          value: discountValue(item?.value, type),
          minOrderAmount: numberValue(item?.minOrderAmount),
          usageLimit: nullableNumber(item?.usageLimit),
          perCustomerLimit: nullableNumber(item?.perCustomerLimit),
          targetType: targetType(item?.targetType),
          targetIds: targetIds(item?.targetIds),
          startsAt: stringValue(item?.startsAt),
          endsAt: stringValue(item?.endsAt),
          usageContext: usageContext(item?.usageContext),
          note: stringValue(item?.note),
        };
      })
    : [];

  const campaigns: CampaignRule[] = Array.isArray(raw.campaigns)
    ? raw.campaigns.map((item: any, index: number) => {
        const benefitType = ["percent", "amount", "free_shipping"].includes(item?.benefitType)
          ? item.benefitType as CampaignRule["benefitType"]
          : "percent";
        return {
          id: stringValue(item?.id, `campaign-${index}`),
          name: stringValue(item?.name, "Kampanya"),
          enabled: Boolean(item?.enabled),
          audience: ["new_member", "all_members", "first_order", "cart_value"].includes(item?.audience)
            ? item.audience
            : "new_member",
          benefitType,
          value: benefitType === "free_shipping" ? 0 : discountValue(item?.value, benefitType),
          minOrderAmount: numberValue(item?.minOrderAmount),
          couponCode: stringValue(item?.couponCode).toLocaleUpperCase("tr-TR").replace(/\s+/g, ""),
          startsAt: stringValue(item?.startsAt),
          endsAt: stringValue(item?.endsAt),
          description: stringValue(item?.description),
        };
      })
    : [];

  return {
    discounts,
    coupons,
    campaigns,
    updatedAt: stringValue(raw.updatedAt),
  };
}
