import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyRange } from "@/lib/ranges";
import { getLocalProductImage } from "@/lib/localProductImages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type DashboardOrder = {
  id: string;
  order_no?: string | null;
  customer_name?: string | null;
  total_amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  payment_status?: string | null;
  created_at?: string | null;
  imported_source?: string | null;
  customer_note?: string | null;
  admin_note?: string | null;
  traffic_source?: string | null;
  order_items?: Array<{
    id?: string | null;
    product_id?: string | null;
    product_slug?: string | null;
    product_name?: string | null;
    variant_name?: string | null;
    quantity?: number | string | null;
    unit_price?: number | string | null;
    total_price?: number | string | null;
    image_url?: string | null;
  }>;
};

function number(value: unknown) { const parsed = Number(value || 0); return Number.isFinite(parsed) ? parsed : 0; }
function testSource(order: Pick<DashboardOrder, "imported_source" | "customer_note" | "admin_note">) { const source = String(order.imported_source || "").trim().toLocaleLowerCase("tr-TR"); const note = `${String(order.customer_note || "")} ${String(order.admin_note || "")}`.toLocaleLowerCase("tr-TR"); return source === "test" || source.includes("sandbox") || source.includes("demo") || note.includes("test sipariş") || note.includes("test siparis"); }
function paid(order: Pick<DashboardOrder, "payment_status" | "status">) { const payment = String(order.payment_status || "").toLocaleLowerCase("tr-TR"); const status = String(order.status || "").toLocaleLowerCase("tr-TR"); return ["paid", "succeeded", "success"].includes(payment) || ["paid", "completed"].includes(status); }
function cleanImage(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "today";

  try {
    const ordersResult = await (applyRange(
      supabase.from("orders").select(`
        id, order_no, customer_name, total_amount, currency, status, payment_status, created_at,
        imported_source, customer_note, admin_note, traffic_source,
        order_items (id, product_id, product_slug, product_name, variant_name, quantity, unit_price, total_price, image_url)
      `),
      "created_at", range,
    ) as any).order("created_at", { ascending: false }).limit(250);

    if (ordersResult.error) throw new Error(ordersResult.error.message);

    const reportOrders = ((ordersResult.data || []) as DashboardOrder[]).filter((order) => !testSource(order));
    const paidOrders = reportOrders.filter(paid);
    const paidIds = paidOrders.map((order) => String(order.id || "")).filter(Boolean);

    const intentsBaseQuery = supabase.from("payment_intents").select("order_id,amount_kurus,succeeded_at").eq("status", "succeeded").not("succeeded_at", "is", null).in("order_id", paidIds) as any;
    const paymentsBaseQuery = supabase.from("payments").select("order_id,amount,paid_at").in("status", ["paid", "succeeded"]).not("paid_at", "is", null).in("order_id", paidIds) as any;
    const intentsPromise = paidIds.length ? applyRange(intentsBaseQuery, "succeeded_at", range).order("succeeded_at", { ascending: false }) : Promise.resolve({ data: [], error: null });
    const paymentsPromise = paidIds.length ? applyRange(paymentsBaseQuery, "paid_at", range).order("paid_at", { ascending: false }) : Promise.resolve({ data: [], error: null });
    const [intentsResult, paymentsResult] = await Promise.all([intentsPromise, paymentsPromise]);

    const collectedByOrder = new Map<string, number>();
    if (!intentsResult.error) for (const intent of intentsResult.data || []) { const orderId = String(intent.order_id || ""); if (!orderId || collectedByOrder.has(orderId)) continue; collectedByOrder.set(orderId, Math.max(0, number(intent.amount_kurus)) / 100); }
    if (!paymentsResult.error) for (const payment of paymentsResult.data || []) { const orderId = String(payment.order_id || ""); if (!orderId || collectedByOrder.has(orderId)) continue; collectedByOrder.set(orderId, Math.max(0, number(payment.amount))); }

    const productIds = [...new Set(paidOrders.flatMap((order) => order.order_items || []).map((item) => cleanImage(item.product_id)).filter(Boolean) as string[])];
    const productsResult = productIds.length ? await supabase.from("products").select("id,main_image_url,slug,name").in("id", productIds) : { data: [], error: null };
    const mainImageById = new Map<string, string>();
    const mainImageBySlug = new Map<string, string>();
    const mainImageByName = new Map<string, string>();
    for (const product of productsResult.data || []) {
      const image = cleanImage(product.main_image_url);
      if (!image) continue;
      mainImageById.set(String(product.id), image);
      if (product.slug) mainImageBySlug.set(String(product.slug), image);
      if (product.name) mainImageByName.set(String(product.name), image);
    }

    const orders = paidOrders.map((order) => {
      const collectedAmount = collectedByOrder.has(String(order.id)) ? collectedByOrder.get(String(order.id)) || 0 : Math.max(0, number(order.total_amount));
      return {
        id: order.id,
        order_no: order.order_no || "—",
        customer_name: order.customer_name || "Müşteri",
        currency: order.currency || "TRY",
        status: order.status || "",
        payment_status: order.payment_status || "",
        created_at: order.created_at || "",
        traffic_source: order.traffic_source || "direct",
        collected_amount: Number(collectedAmount.toFixed(2)),
        item_count: (order.order_items || []).reduce((sum, item) => sum + Math.max(1, Math.trunc(number(item.quantity) || 1)), 0),
        items: (order.order_items || []).map((item) => {
          const quantity = Math.max(1, Math.trunc(number(item.quantity) || 1));
          const unitPrice = Math.max(0, number(item.unit_price));
          const mainImage = (item.product_id ? mainImageById.get(String(item.product_id)) : null) ||
            (item.product_slug ? mainImageBySlug.get(String(item.product_slug)) : null) ||
            (item.product_name ? mainImageByName.get(String(item.product_name)) : null);
          return {
            id: item.id || null,
            product_slug: item.product_slug || "",
            product_name: item.product_name || "Ürün",
            variant_name: item.variant_name || null,
            quantity,
            unit_price: unitPrice,
            total_price: Math.max(0, number(item.total_price)) || unitPrice * quantity,
            image_url: mainImage || cleanImage(item.image_url) || getLocalProductImage(item.product_slug, item.product_name) || null,
          };
        }),
      };
    });

    return NextResponse.json({ ok: true, orders, totals: { orders: orders.length, products: orders.reduce((sum, order) => sum + order.item_count, 0), collected_amount: Number(orders.reduce((sum, order) => sum + order.collected_amount, 0).toFixed(2)) }, truncated: reportOrders.length >= 250 }, { headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Net satış siparişleri alınamadı." }, { status: 500 });
  }
}
