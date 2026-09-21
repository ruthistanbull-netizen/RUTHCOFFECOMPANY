import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function bearerToken(request: Request) {
  return (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

export async function GET(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) return NextResponse.json({ ok: true, discounts: [] });

    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return NextResponse.json({ ok: true, discounts: [] });

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    if (!profile?.id) return NextResponse.json({ ok: true, discounts: [] });

    const { data, error } = await supabase
      .from("review_reward_coupons")
      .select("code, discount_percent, status, usage_limit, used_count, expires_at, created_at")
      .eq("profile_id", profile.id)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const now = Date.now();
    const discounts = (data || [])
      .filter((item: any) => !item.expires_at || new Date(item.expires_at).getTime() > now)
      .filter((item: any) => Number(item.used_count || 0) < Number(item.usage_limit || 1))
      .map((item: any) => ({
        code: item.code,
        title: "Yorum indirimi",
        discountPercent: Number(item.discount_percent || 10),
        expiresAt: item.expires_at || null,
        createdAt: item.created_at || null,
      }));

    return NextResponse.json({ ok: true, discounts });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "İndirimler getirilemedi.", discounts: [] }, { status: 400 });
  }
}
