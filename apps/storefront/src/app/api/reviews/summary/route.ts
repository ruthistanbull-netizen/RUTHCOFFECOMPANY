import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const productId = clean(url.searchParams.get("productId"));
    const slug = clean(url.searchParams.get("slug"));
    const supabase = getSupabaseAdmin();

    let resolvedProductId = productId;
    if (!resolvedProductId && slug) {
      const { data: product } = await supabase.from("products").select("id").eq("slug", slug).maybeSingle();
      resolvedProductId = product?.id || "";
    }

    if (!resolvedProductId) {
      return NextResponse.json({ ok: true, averageRating: 0, reviewCount: 0, reviews: [] });
    }

    const { data, error } = await supabase
      .from("product_reviews")
      .select("id, rating, title, comment, reviewer_name, created_at, order_id, order_item_id")
      .eq("product_id", resolvedProductId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: true, averageRating: 0, reviewCount: 0, reviews: [] });
    }

    const allReviews = data || [];
    const reviewCount = allReviews.length;
    const averageRating = reviewCount
      ? allReviews.reduce((sum, item: any) => sum + Number(item.rating || 0), 0) / reviewCount
      : 0;

    const reviews = allReviews.slice(0, 12).map((review: any) => ({
      id: review.id,
      rating: review.rating,
      title: review.title,
      comment: review.comment,
      reviewer_name: review.reviewer_name,
      created_at: review.created_at,
      verified_purchase: Boolean(review.order_id || review.order_item_id),
    }));

    return NextResponse.json({ ok: true, averageRating, reviewCount, reviews });
  } catch {
    return NextResponse.json({ ok: true, averageRating: 0, reviewCount: 0, reviews: [] });
  }
}
