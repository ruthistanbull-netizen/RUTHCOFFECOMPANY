export type ProductBulkDiscountAction = "apply" | "remove";
export type ProductBulkPriceMode = "set" | "increase_percent" | "decrease_percent" | "increase_amount" | "decrease_amount" | "";
export type ProductBulkStockMode = "set" | "increase" | "decrease" | "";
export type ProductBulkStockScope = "total" | "each_variant";
export type ProductStockStatus = "in_stock" | "out_of_stock" | "preorder";
export type ProductBulkRelationAction = "add" | "remove";

export type ProductBulkPricingCommand = {
  discountAction?: ProductBulkDiscountAction;
  discountPercent?: number;
  priceMode?: ProductBulkPriceMode;
  priceValue?: number;
};

export type ProductBulkPricingResult = {
  price: number;
  compareAtPrice: number | null;
};

export type ProductBulkStockCommand = {
  mode: ProductBulkStockMode;
  scope?: ProductBulkStockScope;
  value?: number;
};

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function roundProductPrice(value: unknown) {
  return Math.max(0, Math.round(finite(value, 0) * 100) / 100);
}

function nonNegativePercent(value: unknown) {
  return Math.min(100, Math.max(0, finite(value, 0)));
}

/**
 * Canonical product/variant bulk-pricing rule.
 *
 * A product that is already discounted keeps its compare-at price as the
 * immutable discount base. Re-applying the same percentage therefore yields
 * the same result instead of discounting an already-discounted price again.
 */
export function applyProductBulkPricing(
  currentPrice: unknown,
  currentCompareAtPrice: unknown,
  command: ProductBulkPricingCommand,
): ProductBulkPricingResult {
  let price = roundProductPrice(currentPrice);
  let compareAtPrice = finite(currentCompareAtPrice, 0) > 0
    ? roundProductPrice(currentCompareAtPrice)
    : null;

  if (command.discountAction === "remove") {
    if (compareAtPrice != null) price = compareAtPrice;
    compareAtPrice = null;
  } else {
    const discountPercent = nonNegativePercent(command.discountPercent);
    if (discountPercent > 0) {
      const discountBase = compareAtPrice != null ? compareAtPrice : price;
      compareAtPrice = discountBase;
      price = roundProductPrice(discountBase * (1 - discountPercent / 100));
    }
  }

  const priceValue = finite(command.priceValue, 0);
  switch (command.priceMode || "") {
    case "set":
      price = roundProductPrice(priceValue);
      break;
    case "increase_percent":
      price = roundProductPrice(price * (1 + Math.max(0, priceValue) / 100));
      break;
    case "decrease_percent":
      price = roundProductPrice(price * (1 - nonNegativePercent(priceValue) / 100));
      break;
    case "increase_amount":
      price = roundProductPrice(price + Math.max(0, priceValue));
      break;
    case "decrease_amount":
      price = roundProductPrice(price - Math.max(0, priceValue));
      break;
  }

  return { price, compareAtPrice };
}

export function stockStatusForCount(
  count: unknown,
  requestedStatus?: ProductStockStatus | null,
): ProductStockStatus {
  const normalizedCount = Math.max(0, Math.trunc(finite(count, 0)));
  if (normalizedCount === 0) return "out_of_stock";
  return requestedStatus || "in_stock";
}

/**
 * Returns the complete next stock vector. Quantity mutations never invent a
 * variant: callers must surface the missing-variant condition to the user.
 */
export function applyProductBulkStock(
  currentStocks: readonly unknown[],
  command: ProductBulkStockCommand,
): number[] {
  const mode = command.mode || "";
  if (!mode) return currentStocks.map((value) => Math.max(0, Math.trunc(finite(value, 0))));
  if (currentStocks.length === 0) {
    throw new Error("Stok adedi toplu değiştirilemez: ürünün mevcut bir varyantı yok. Otomatik Standart varyant oluşturulmaz.");
  }

  const value = Math.max(0, Math.trunc(finite(command.value, 0)));
  const current = currentStocks.map((stock) => Math.max(0, Math.trunc(finite(stock, 0))));

  if (mode === "increase") return current.map((stock) => stock + value);
  if (mode === "decrease") return current.map((stock) => Math.max(0, stock - value));

  if ((command.scope || "total") === "each_variant") {
    return current.map(() => value);
  }

  const base = Math.floor(value / current.length);
  let remainder = value % current.length;
  return current.map(() => {
    const next = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return next;
  });
}

export function applyProductBulkRelation(
  existingIds: readonly string[],
  targetIds: readonly string[],
  action: ProductBulkRelationAction,
) {
  const existing = [...new Set(existingIds.map(String).map((value) => value.trim()).filter(Boolean))];
  const targets = [...new Set(targetIds.map(String).map((value) => value.trim()).filter(Boolean))];
  if (action === "remove") {
    const removed = new Set(targets);
    return existing.filter((id) => !removed.has(id));
  }
  const result = [...existing];
  for (const id of targets) if (!result.includes(id)) result.push(id);
  return result;
}
