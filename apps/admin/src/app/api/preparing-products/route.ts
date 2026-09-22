import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getLocalProductImage } from "@/lib/localProductImages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PREPARING_ORDER_STATUSES = ["preparing", "queued", "in_production", "quality_control", "processing"] as const;
const preparingStatusSet = new Set<string>(PREPARING_ORDER_STATUSES);
const preparationTerminalStatusSet = new Set(["shipped", "sent", "in_transit", "out_for_delivery", "delivered", "completed", "fulfilled", "returned", "cancelled", "canceled"]);

type RawItem = { product_id?: string | null; variant_id?: string | null; product_slug?: string | null; product_name?: string | null; variant_name?: string | null; quantity?: number | string | null; image_url?: string | null; };
type RawOrder = { id: string; order_no?: string | null; customer_name?: string | null; customer_email?: string | null; status?: string | null; shipping_status?: string | null; fulfillment_status?: string | null; created_at?: string | null; order_items?: RawItem[] | null; };
type CustomerBucket = { orderId: string; orderNo: string; name: string; email: string | null; quantity: number; };
type VariantBucket = { id: string; name: string; quantity: number; customers: Map<string, CustomerBucket>; };
type ProductBucket = { id: string; name: string; slug: string; imageUrl: string | null; totalQuantity: number; variants: Map<string, VariantBucket>; customers: Map<string, CustomerBucket>; };

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function normalizedStatus(value: unknown) { return clean(value).toLocaleLowerCase("en-US"); }
function itemQuantity(value: unknown) { const parsed = Math.trunc(Number(value || 0)); return Number.isFinite(parsed) ? Math.max(1, parsed) : 1; }
function keyPart(value: unknown) { return clean(value).toLocaleLowerCase("tr-TR").replace(/\s+/g, " "); }
function customerKey(order: RawOrder) { return clean(order.id) || `${clean(order.order_no)}:${keyPart(order.customer_name)}`; }
function stillNeedsPreparation(order: RawOrder) { if (!preparingStatusSet.has(normalizedStatus(order.status))) return false; if (preparationTerminalStatusSet.has(normalizedStatus(order.shipping_status))) return false; if (preparationTerminalStatusSet.has(normalizedStatus(order.fulfillment_status))) return false; return true; }
function addCustomer(target: Map<string, CustomerBucket>, order: RawOrder, quantity: number) { const key = customerKey(order); const current = target.get(key); if (current) { current.quantity += quantity; return; } target.set(key, { orderId: clean(order.id), orderNo: clean(order.order_no) || "—", name: clean(order.customer_name) || clean(order.customer_email) || "İsimsiz müşteri", email: clean(order.customer_email) || null, quantity }); }

export async function GET(request: Request) {
  const auth = await requireAdmin(request); if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { data, error } = await supabase.from("orders").select(`
      id, order_no, customer_name, customer_email, status, shipping_status, fulfillment_status, created_at,
      order_items (product_id, variant_id, product_slug, product_name, variant_name, quantity, image_url)
    `).in("status", [...PREPARING_ORDER_STATUSES]).order("created_at", { ascending: true }).limit(500);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: { "Cache-Control": "private, no-store" } });

  const orders = ((data || []) as RawOrder[]).filter(stillNeedsPreparation);
  const productIds = [...new Set(orders.flatMap((order) => order.order_items || []).map((item) => clean(item.product_id)).filter(Boolean))];
  const productMainById = new Map<string, string>();
  const productSlugById = new Map<string, string>();
  if (productIds.length) {
    const productsResult = await supabase.from("products").select("id, slug, main_image_url").in("id", productIds);
    for (const product of productsResult.data || []) {
      const image = clean(product.main_image_url);
      if (image) productMainById.set(String(product.id), image);
      if (product.slug) productSlugById.set(String(product.id), String(product.slug));
    }
    const galleryResult = await supabase.from("product_images").select("product_id, image_url, is_main, sort_order").in("product_id", productIds).order("is_main", { ascending: false }).order("sort_order", { ascending: true }).limit(Math.max(300, productIds.length * 6));
    for (const image of galleryResult.data || []) {
      const id = String(image.product_id || "");
      const url = clean(image.image_url);
      if (id && url && !productMainById.has(id)) productMainById.set(id, url);
    }
  }

  const products = new Map<string, ProductBucket>(); let totalQuantity = 0;
  for (const order of orders) for (const item of order.order_items || []) {
    const quantity = itemQuantity(item.quantity); const name = clean(item.product_name) || "Ürün"; const slug = clean(item.product_slug); const productId = clean(item.product_id); const productKey = productId || slug || `name:${keyPart(name)}`; const variantName = clean(item.variant_name) || "Standart"; const variantKey = clean(item.variant_id) || `name:${keyPart(variantName)}`;
    const mainImage = productId ? productMainById.get(productId) : null;
    const fallbackImage = getLocalProductImage(slug, name);
    let product = products.get(productKey);
    if (!product) product = { id: productKey, name, slug: productId ? (productSlugById.get(productId) || slug) : slug, imageUrl: mainImage || fallbackImage || null, totalQuantity: 0, variants: new Map(), customers: new Map() }, products.set(productKey, product);
    else if (!product.imageUrl && (mainImage || fallbackImage)) product.imageUrl = mainImage || fallbackImage || null;
    let variant = product.variants.get(variantKey);
    if (!variant) product.variants.set(variantKey, variant = { id: variantKey, name: variantName, quantity: 0, customers: new Map() });
    variant.quantity += quantity; product.totalQuantity += quantity; totalQuantity += quantity; addCustomer(variant.customers, order, quantity); addCustomer(product.customers, order, quantity);
  }

  const result = Array.from(products.values()).map((product) => ({ id: product.id, name: product.name, slug: product.slug, imageUrl: product.imageUrl, totalQuantity: product.totalQuantity, orderCount: product.customers.size, customers: Array.from(product.customers.values()).sort((a, b) => a.name.localeCompare(b.name, "tr-TR")), variants: Array.from(product.variants.values()).map((variant) => ({ id: variant.id, name: variant.name, quantity: variant.quantity, orderCount: variant.customers.size, customers: Array.from(variant.customers.values()) })).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "tr-TR")) })).sort((a, b) => b.totalQuantity - a.totalQuantity || a.name.localeCompare(b.name, "tr-TR"));
  return NextResponse.json({ ok: true, products: result, stats: { preparingOrders: orders.length, distinctProducts: result.length, totalQuantity } }, { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } });
}
