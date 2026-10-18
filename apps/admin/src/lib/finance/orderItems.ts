import { getLocalProductImage } from "@/lib/localProductImages";
import type { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type Db = ReturnType<typeof getSupabaseAdmin>;

export type FinanceOrderProduct = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  image_url: string | null;
};

function safeImage(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeNumber(value: unknown): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

/** Uses the purchased order items, not today's catalog composition.
 * Main catalog media is only an image fallback, never used for names or prices.
 */
export async function financeOrderItems(
  db: Db,
  orderIds: string[],
): Promise<Map<string, FinanceOrderProduct[]>> {
  const ids = [...new Set(orderIds.filter(Boolean))].slice(0, 150);
  const grouped = new Map<string, FinanceOrderProduct[]>();
  if (!ids.length) return grouped;

  const items = await db.from("order_items").select(
    "id,order_id,product_id,product_slug,product_name,variant_name,quantity,unit_price,total_price,image_url",
  ).in("order_id", ids).limit(2500);
  if (items.error) throw new Error(items.error.message);

  const productIds = [...new Set((items.data || []).map((item) =>
    String(item.product_id || "")).filter(Boolean))];

  const imageByProduct = new Map<string, string>();
  if (productIds.length) {
    const images = await db.from("products").select("id,main_image_url")
      .in("id", productIds);
    // The purchased order remains visible even when the catalog product is gone.
    if (!images.error) {
      for (const product of images.data || []) {
        const image = safeImage(product.main_image_url);
        if (image) imageByProduct.set(String(product.id), image);
      }
    }
  }

  for (const item of items.data || []) {
    const orderId = String(item.order_id || "");
    if (!orderId) continue;
    const productName = String(item.product_name || "Ürün");
    const productId = item.product_id ? String(item.product_id) : null;
    const quantity = Math.max(1, Math.trunc(safeNumber(item.quantity) || 1));
    const unitPrice = Math.max(0, safeNumber(item.unit_price));
    const product: FinanceOrderProduct = {
      id: String(item.id),
      order_id: orderId,
      product_id: productId,
      product_name: productName,
      variant_name: item.variant_name || null,
      quantity,
      unit_price: unitPrice,
      total_price: Math.max(0, safeNumber(item.total_price)) || unitPrice * quantity,
      image_url: (productId && imageByProduct.get(productId)) ||
        safeImage(item.image_url) ||
        getLocalProductImage(item.product_slug, productName) || null,
    };
    grouped.set(orderId, [...(grouped.get(orderId) || []), product]);
  }
  return grouped;
}
