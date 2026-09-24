import type {
  DiscountCampaignSettings,
  DiscountRule,
  DiscountTargetType,
  DiscountValueType,
} from "@/lib/discountCampaignSettings";

export type ProductDiscountRuleBreakdown = {
  id: string;
  name: string;
  targetType: DiscountTargetType;
  discountType: DiscountValueType;
  value: number;
  stackable: boolean;
  amount: number;
};

export type ProductDiscountPricing = {
  productId: string;
  originalPrice: number;
  discountedPrice: number;
  discountAmount: number;
  discountPercentage: number;
  rules: ProductDiscountRuleBreakdown[];
};

type DiscountableProduct = {
  productId: string;
  categoryIds: string[];
  collectionIds: string[];
  unitPrice: number;
};

function active(rule: Pick<DiscountRule, "enabled" | "startsAt" | "endsAt">, now = Date.now()) {
  if (!rule.enabled) return false;
  const start = String(rule.startsAt || "").trim();
  const end = String(rule.endsAt || "").trim();
  const startAt = start ? new Date(start).getTime() : 0;
  const endAt = end ? new Date(end).getTime() : 0;
  if (start && (!Number.isFinite(startAt) || startAt > now)) return false;
  if (end && (!Number.isFinite(endAt) || endAt < now)) return false;
  return true;
}

function matchesTarget(product: DiscountableProduct, type: DiscountTargetType, ids: string[]) {
  if (type === "all") return true;
  if (!ids.length) return false;
  const accepted = new Set(ids.map(String));
  if (type === "product") return accepted.has(String(product.productId));
  const values = type === "category" ? product.categoryIds : product.collectionIds;
  return values.some((id) => accepted.has(String(id)));
}

function amountForValue(base: number, type: DiscountValueType, value: number) {
  if (base <= 0 || value <= 0) return 0;
  if (type === "amount") return Math.min(base, value);
  return Math.min(base, Number(((base * Math.min(100, value)) / 100).toFixed(2)));
}

export function calculateProductDiscountPricing(
  product: DiscountableProduct,
  settings: DiscountCampaignSettings,
): ProductDiscountPricing {
  const originalPrice = Number(Math.max(0, Number(product.unitPrice || 0)).toFixed(2));
  const matching = settings.discounts.filter(
    (rule) => active(rule) && matchesTarget(product, rule.targetType, rule.targetIds),
  );

  const nonStackable = matching
    .filter((rule) => !rule.stackable)
    .map((rule) => ({ rule, amount: amountForValue(originalPrice, rule.discountType, rule.value) }))
    .sort((a, b) => b.amount - a.amount)[0];
  const stackable = matching.filter((rule) => rule.stackable);

  let remaining = originalPrice;
  let discountAmount = 0;
  const rules: ProductDiscountRuleBreakdown[] = [];

  if (nonStackable?.amount) {
    discountAmount += nonStackable.amount;
    remaining = Math.max(0, originalPrice - discountAmount);
    rules.push({
      id: nonStackable.rule.id,
      name: nonStackable.rule.name,
      targetType: nonStackable.rule.targetType,
      discountType: nonStackable.rule.discountType,
      value: nonStackable.rule.value,
      stackable: false,
      amount: nonStackable.amount,
    });
  }

  for (const rule of stackable) {
    const amount = amountForValue(remaining, rule.discountType, rule.value);
    if (amount <= 0) continue;
    discountAmount += amount;
    remaining = Math.max(0, remaining - amount);
    rules.push({
      id: rule.id,
      name: rule.name,
      targetType: rule.targetType,
      discountType: rule.discountType,
      value: rule.value,
      stackable: true,
      amount,
    });
  }

  discountAmount = Number(Math.min(originalPrice, discountAmount).toFixed(2));
  const discountedPrice = Number(Math.max(0, originalPrice - discountAmount).toFixed(2));
  const discountPercentage = originalPrice > 0 && discountAmount > 0
    ? Math.max(1, Math.round((discountAmount / originalPrice) * 100))
    : 0;

  return {
    productId: product.productId,
    originalPrice,
    discountedPrice,
    discountAmount,
    discountPercentage,
    rules,
  };
}
