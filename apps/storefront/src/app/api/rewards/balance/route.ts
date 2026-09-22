import { NextResponse } from "next/server";
import { claimPaidGuestOrderPointsForProfile } from "@/lib/rewardServer";
import { claimBirthdayRewardForProfile } from "@/lib/loyaltyRewardServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

export async function GET(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) return NextResponse.json({ ok: false, error: "Oturum bulunamadı." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ ok: false, error: "Oturum geçersiz." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, phone, phone_normalized, reward_points_balance")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);
    if (!profile) {
      return NextResponse.json({ ok: true, points: 0 }, { headers: { "Cache-Control": "no-store" } });
    }

    let points = Math.max(0, Math.floor(Number(profile.reward_points_balance || 0)));
    try {
      const claim = await claimPaidGuestOrderPointsForProfile({
        profileId: String(profile.id),
        email: profile.email || userData.user.email,
        phone: profile.phone_normalized || profile.phone,
      });
      points = claim.balance;
    } catch (claimError) {
      console.error("Misafir sipariş ROSTA Points uzlaştırması tamamlanamadı", {
        profileId: profile.id,
        error: claimError,
      });
    }

    try {
      const birthday = await claimBirthdayRewardForProfile(String(profile.id));
      points = birthday.balance;
    } catch (birthdayError) {
      // Günlük worker tekrar deneyeceği için geçici birthday hatası bakiye
      // ekranını kapatmaz. Başarılı claim aynı profile + yıl için idempotenttir.
      console.error("Doğum günü ROSTA Points işlemi tamamlanamadı", {
        profileId: profile.id,
        error: birthdayError,
      });
    }

    return NextResponse.json(
      { ok: true, points },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Puan bakiyesi alınamadı." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
