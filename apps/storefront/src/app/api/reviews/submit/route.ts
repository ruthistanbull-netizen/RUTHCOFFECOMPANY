import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function bearerToken(request: Request) {
  return (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function makeCode() {
  return `YORUM10-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

const paidOrDeliveredStatuses = new Set(["paid", "completed", "delivered", "shipped"]);

function isPaidOrDelivered(order: any) {
  if (!order) return false;
  return paidOrDeliveredStatuses.has(String(order.status || "")) || String(order.payment_status || "") === "paid";
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Yorum yazmak için giriş yapman gerekiyor." }, { status: 401 });
    }

    const body = await request.json();
    const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating || 0))));
    const productIdFromBody = clean(body.productId);
    const productSlug = clean(body.productSlug);
    const orderIdFromBody = clean(body.orderId);
    const orderItemIdFromBody = clean(body.orderItemId);
    const title = clean(body.title).slice(0, 90);
    const comment = clean(body.comment).slice(0, 900);

    if (!rating || (!productIdFromBody && !productSlug)) {
      return NextResponse.json({ ok: false, error: "Değerlendirme bilgileri eksik." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ ok: false, error: "Oturum geçersiz." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ ok: false, error: "Profil bulunamadı." }, { status: 401 });
    }

    let productId = productIdFromBody;
    let productName = clean(body.productName);

    if (!productId || !productName) {
      const query = supabase.from("products").select("id, name, slug").limit(1);
      const { data: productRow } = productId
        ? await query.eq("id", productId).maybeSingle()
        : await query.eq("slug", productSlug).maybeSingle();
      productId = productId || productRow?.id || "";
      productName = productName || productRow?.name || "";
    }

    if (!productId) {
      return NextResponse.json({ ok: false, error: "Ürün bulunamadı." }, { status: 404 });
    }

    let verifiedOrderId: string | null = null;
    let verifiedOrderItemId: string | null = null;

    if (orderIdFromBody && orderItemIdFromBody) {
      const { data: orderItem } = await supabase
        .from("order_items")
        .select("id, product_id, product_slug, product_name, order_id, orders!inner(id, profile_id, status, payment_status, order_no)")
        .eq("id", orderItemIdFromBody)
        .eq("order_id", orderIdFromBody)
        .maybeSingle();

      const order = Array.isArray((orderItem as any)?.orders) ? (orderItem as any).orders[0] : (orderItem as any)?.orders;
      const belongsToUser = order && order.profile_id === profile.id;
      const sameProduct = orderItem && ((orderItem as any).product_id === productId || (productSlug && (orderItem as any).product_slug === productSlug));

      if (belongsToUser && sameProduct && isPaidOrDelivered(order)) {
        verifiedOrderId = order.id;
        verifiedOrderItemId = (orderItem as any).id;
        productName = productName || (orderItem as any).product_name || "";
      }
    }

    if (!verifiedOrderItemId) {
      const { data: purchasedItem } = await supabase
        .from("order_items")
        .select("id, product_id, product_slug, product_name, order_id, orders!inner(id, profile_id, status, payment_status, created_at)")
        .or(`product_id.eq.${productId}${productSlug ? `,product_slug.eq.${productSlug}` : ""}`)
        .eq("orders.profile_id", profile.id)
        .limit(1)
        .maybeSingle();

      const order = Array.isArray((purchasedItem as any)?.orders) ? (purchasedItem as any).orders[0] : (purchasedItem as any)?.orders;
      if (purchasedItem && order && isPaidOrDelivered(order)) {
        verifiedOrderId = order.id;
        verifiedOrderItemId = (purchasedItem as any).id;
        productName = productName || (purchasedItem as any).product_name || "";
      }
    }

    let couponCode: string | null = null;
    if (verifiedOrderItemId) {
      const { data: existingReview } = await supabase
        .from("product_reviews")
        .select("coupon_code")
        .eq("order_item_id", verifiedOrderItemId)
        .eq("profile_id", profile.id)
        .maybeSingle();
      couponCode = clean(existingReview?.coupon_code) || makeCode();
    }

    const reviewerName = profile.full_name || profile.email || "ROSTA Coffee Co. müşterisi";
    const payload = {
      product_id: productId,
      product_slug: productSlug || null,
      product_name: productName || null,
      profile_id: profile.id,
      order_id: verifiedOrderId,
      order_item_id: verifiedOrderItemId,
      rating,
      title: title || null,
      comment: comment || null,
      status: "pending",
      reviewer_name: reviewerName,
      reviewer_email: profile.email,
      coupon_code: couponCode,
      updated_at: new Date().toISOString(),
    };

    let review: any = null;
    let reviewError: any = null;

    if (verifiedOrderItemId) {
      const response = await supabase
        .from("product_reviews")
        .upsert(payload, { onConflict: "order_item_id,profile_id" })
        .select("id, coupon_code")
        .single();
      review = response.data;
      reviewError = response.error;
    } else {
      const response = await supabase
        .from("product_reviews")
        .insert(payload)
        .select("id, coupon_code")
        .single();
      review = response.data;
      reviewError = response.error;
    }

    if (reviewError) throw new Error(reviewError.message);

    if (verifiedOrderItemId && (review?.coupon_code || couponCode)) {
      await supabase.from("review_reward_coupons").upsert({
        code: review?.coupon_code || couponCode,
        profile_id: profile.id,
        review_id: review?.id || null,
        discount_percent: 10,
        status: "cancelled",
        usage_limit: 1,
        used_count: 0,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 45).toISOString(),
      }, { onConflict: "code" });
    }

    return NextResponse.json({
      ok: true,
      status: "pending",
      verifiedPurchase: Boolean(verifiedOrderItemId),
      rewardEligible: Boolean(verifiedOrderItemId),
      rewardDiscountPercent: verifiedOrderItemId ? 10 : 0,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Değerlendirme gönderilemedi." }, { status: 400 });
  }
}
