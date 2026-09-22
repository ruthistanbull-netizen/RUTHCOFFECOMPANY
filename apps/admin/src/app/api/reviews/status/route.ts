import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const id = String(body.id || "");
  const nextStatus = String(body.status || "");
  if (!id || !["approved", "rejected", "pending"].includes(nextStatus)) {
    return NextResponse.json({ ok: false, error: "Geçersiz işlem." }, { status: 400, headers: noStoreHeaders() });
  }

  const { data: currentReview, error: lookupError } = await auth.supabase
    .from("product_reviews")
    .select("id, product_id, coupon_code, order_item_id")
    .eq("id", id)
    .single();
  if (lookupError || !currentReview) {
    return NextResponse.json({ ok: false, error: lookupError?.message || "Yorum bulunamadı." }, { status: 404, headers: noStoreHeaders() });
  }

  const { data, error } = await auth.supabase
    .from("product_reviews")
    .update({
      status: nextStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });

  const couponCode = String(currentReview.coupon_code || "").trim();
  if (couponCode) {
    const verifiedPurchase = Boolean(currentReview.order_item_id);
    const couponStatus = nextStatus === "approved" && verifiedPurchase ? "active" : "cancelled";
    const { error: couponError } = await auth.supabase
      .from("review_reward_coupons")
      .update({ status: couponStatus })
      .eq("code", couponCode)
      .in("status", ["active", "cancelled"]);
    if (couponError) {
      return NextResponse.json({ ok: false, error: `Yorum güncellendi ancak kupon durumu değiştirilemedi: ${couponError.message}` }, { status: 400, headers: noStoreHeaders() });
    }
  }

  const productId = String(currentReview.product_id || "").trim();
  const revalidate = await revalidateWebsite({
    source: "admin-review-status",
    productIds: productId ? [productId] : [],
  });

  return NextResponse.json({
    ok: true,
    review: data,
    revalidate,
    warning: revalidate.ok ? null : revalidate.message,
  }, { headers: noStoreHeaders() });
}
