import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyRange } from "@/lib/ranges";
import { getLocalProductImage } from "@/lib/localProductImages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CartEvent = {
  id: string;
  session_id: string | null;
  event_name: string;
  path: string | null;
  metadata: unknown;
  created_at: string;
};

type CheckoutDraftRow = {
  id: string;
  status: string | null;
  order_id: string | null;
  customer: unknown;
  items: unknown;
  total_amount: number | string | null;
  attribution: unknown;
  callback_payload: unknown;
  created_at: string;
  updated_at: string | null;
};

type CartItem = {
  product_slug: string;
  product_name: string;
  variant_id: string | null;
  quantity: number;
  price: number;
  image_url: string | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function metadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hasRecoverableContact(value: unknown) {
  const customer = metadata(value);
  const email = clean(customer.email).toLocaleLowerCase("tr-TR");
  const phoneDigits = clean(customer.phone).replace(/\D/g, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phoneDigits.length >= 10;
}

function isVisibleCheckoutDraft(draft: CheckoutDraftRow) {
  const status = clean(draft.status).toLocaleLowerCase("tr-TR");
  if (["superseded", "converted"].includes(status)) return false;
  return (Array.isArray(draft.items) && draft.items.length > 0)
    && (status === "paid" || Boolean(draft.order_id) || hasRecoverableContact(draft.customer));
}

function checkoutDraftItems(value: unknown): Array<Omit<CartItem, "image_url">> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = metadata(item);
    return {
      product_slug: clean(row.productSlug) || clean(row.product_slug) || clean(row.slug),
      product_name: clean(row.productName) || clean(row.product_name) || clean(row.name) || "Ürün",
      variant_id: clean(row.variantId) || clean(row.variant_id) || null,
      quantity: Math.max(1, Math.trunc(numeric(row.quantity, 1))),
      price: Math.max(0, numeric(row.unitPrice ?? row.unit_price ?? row.price)),
    };
  }).filter((item) => Boolean(item.product_slug || item.product_name));
}

function isoMin(values: string[]) {
  return [...values].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0] || new Date().toISOString();
}

function isoMax(values: string[]) {
  return [...values].sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || new Date().toISOString();
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "today";

  try {
    const eventQuery = applyRange(
      supabase
        .from("analytics_events")
        .select("id,session_id,event_name,path,metadata,created_at")
        .in("event_name", ["cart_add", "cart_created"]),
      "created_at",
      range,
    ) as any;
    const draftQuery = applyRange(
      supabase
        .from("checkout_drafts")
        .select("id,status,order_id,customer,items,total_amount,attribution,callback_payload,created_at,updated_at"),
      "created_at",
      range,
    ) as any;

    const [eventResult, draftResult] = await Promise.all([
      eventQuery.order("created_at", { ascending: false }).limit(1000),
      draftQuery.order("created_at", { ascending: false }).limit(1000),
    ]);

    if (eventResult.error) {
      return NextResponse.json({ ok: false, error: eventResult.error.message }, { status: 400 });
    }
    if (draftResult.error) {
      return NextResponse.json({ ok: false, error: draftResult.error.message }, { status: 400 });
    }

    const events = (eventResult.data || []) as CartEvent[];
    const draftRows = (draftResult.data || []) as CheckoutDraftRow[];
    const bySession = new Map<string, CartEvent[]>();

    for (const event of events) {
      const sessionId = clean(event.session_id);
      if (!sessionId) continue;
      const current = bySession.get(sessionId) || [];
      current.push(event);
      bySession.set(sessionId, current);
    }

    const sessionDrafts = [...bySession.entries()].map(([sessionId, sessionEvents]) => {
      const addEvents = sessionEvents.filter((event) => event.event_name === "cart_add");
      const productEvents = addEvents.length ? addEvents : sessionEvents.filter((event) => event.event_name === "cart_created");
      const itemMap = new Map<string, Omit<CartItem, "image_url">>();
      let reportedItemCount = 0;

      for (const event of productEvents) {
        const meta = metadata(event.metadata);
        const slug = clean(meta.product_slug);
        const productName = clean(meta.product_name) || slug || "Ürün";
        const variantId = clean(meta.variant_id) || null;
        const quantity = Math.max(1, Math.trunc(numeric(meta.quantity, 1)));
        const price = Math.max(0, numeric(meta.price));
        const key = `${slug || productName}:${variantId || "standard"}`;
        const current = itemMap.get(key);

        if (current) {
          current.quantity += quantity;
          if (!current.price && price) current.price = price;
        } else {
          itemMap.set(key, {
            product_slug: slug,
            product_name: productName,
            variant_id: variantId,
            quantity,
            price,
          });
        }

        reportedItemCount = Math.max(reportedItemCount, Math.trunc(numeric(meta.cart_item_count)));
      }

      const latestEvent = [...sessionEvents].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      const latestMeta = metadata(latestEvent?.metadata);
      const items = [...itemMap.values()];
      const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
      const timestamps = sessionEvents.map((event) => event.created_at).filter(Boolean);

      return {
        session_id: sessionId,
        created_at: isoMin(timestamps),
        last_activity_at: isoMax(timestamps),
        path: latestEvent?.path || null,
        source: clean(latestMeta.source) || "direct",
        medium: clean(latestMeta.medium) || "direct",
        campaign: clean(latestMeta.campaign) || null,
        city: clean(latestMeta.city) || null,
        country: clean(latestMeta.country) || null,
        device_type: clean(latestMeta.device_type) || null,
        item_count: Math.max(reportedItemCount, items.length),
        quantity,
        items,
        checkout_draft_id: null as string | null,
        is_abandoned: false,
        is_recovered: false,
      };
    });

    const checkoutCarts = draftRows
      .filter(isVisibleCheckoutDraft)
      .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
      .map((draft) => {
        const attribution = metadata(draft.attribution);
        const items = checkoutDraftItems(draft.items);
        const status = clean(draft.status).toLocaleLowerCase("tr-TR");
        const recovered = status === "paid" || Boolean(draft.order_id);
        const sessionId = clean(attribution.session_id) || `draft:${draft.id}`;
        return {
          session_id: sessionId,
          created_at: draft.created_at,
          last_activity_at: draft.updated_at || draft.created_at,
          path: "/checkout",
          source: clean(attribution.source) || "direct",
          medium: clean(attribution.medium) || "direct",
          campaign: clean(attribution.campaign) || null,
          city: null,
          country: null,
          device_type: null,
          item_count: items.length,
          quantity: items.reduce((sum, item) => sum + item.quantity, 0),
          items,
          checkout_draft_id: draft.id,
          is_abandoned: !recovered,
          is_recovered: recovered,
        };
      });

    const cartBySession = new Map(sessionDrafts.map((cart) => [cart.session_id, cart]));
    for (const draftCart of checkoutCarts) {
      const existing = cartBySession.get(draftCart.session_id);
      if (!existing) {
        cartBySession.set(draftCart.session_id, draftCart);
        continue;
      }

      cartBySession.set(draftCart.session_id, {
        ...existing,
        created_at: isoMin([existing.created_at, draftCart.created_at]),
        last_activity_at: isoMax([existing.last_activity_at, draftCart.last_activity_at]),
        path: draftCart.path,
        source: existing.source !== "direct" ? existing.source : draftCart.source,
        medium: existing.medium !== "direct" ? existing.medium : draftCart.medium,
        campaign: existing.campaign || draftCart.campaign,
        item_count: draftCart.item_count,
        quantity: draftCart.quantity,
        items: draftCart.items,
        checkout_draft_id: draftCart.checkout_draft_id,
        is_abandoned: draftCart.is_abandoned,
        is_recovered: draftCart.is_recovered,
      });
    }
    const mergedCartDrafts = [...cartBySession.values()];

    const slugs = [...new Set(mergedCartDrafts.flatMap((cart) => cart.items.map((item) => item.product_slug)).filter(Boolean))];
    const productRows = slugs.length
      ? await supabase
          .from("products")
          .select("id,name,slug,price,main_image_url,product_variants(id,price,image_url,option_summary)")
          .in("slug", slugs)
      : { data: [], error: null };

    const productBySlug = new Map<string, any>();
    const variantById = new Map<string, any>();
    if (!productRows.error) {
      for (const product of productRows.data || []) {
        productBySlug.set(String(product.slug || ""), product);
        for (const variant of product.product_variants || []) {
          if (variant?.id) variantById.set(String(variant.id), variant);
        }
      }
    }

    const carts = mergedCartDrafts
      .map((cart) => {
        const items = cart.items.map((item) => {
          const product = productBySlug.get(item.product_slug);
          const variant = item.variant_id ? variantById.get(item.variant_id) : null;
          const productPrice = Math.max(0, numeric(product?.price, 0));
          const variantPrice = Math.max(0, numeric(variant?.price, 0));
          const resolvedPrice = item.price > 0
            ? item.price
            : variantPrice > 0
              ? variantPrice
              : productPrice;
          const imageUrl = clean(variant?.image_url)
            || clean(product?.main_image_url)
            || getLocalProductImage(item.product_slug, item.product_name)
            || null;

          return {
            ...item,
            product_name: item.product_name || clean(product?.name) || "Ürün",
            price: resolvedPrice,
            image_url: imageUrl,
          };
        });
        const estimatedAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        return {
          ...cart,
          items,
          estimated_amount: Number(estimatedAmount.toFixed(2)),
        };
      })
      .sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime());

    const totals = {
      carts: carts.length,
      products: carts.reduce((sum, cart) => sum + cart.quantity, 0),
      estimated_amount: Number(carts.reduce((sum, cart) => sum + cart.estimated_amount, 0).toFixed(2)),
    };

    return NextResponse.json({
      ok: true,
      carts,
      totals,
      truncated: events.length >= 1000 || draftRows.length >= 1000,
    }, {
      headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Sepet aktivitesi alınamadı.",
    }, { status: 500 });
  }
}
