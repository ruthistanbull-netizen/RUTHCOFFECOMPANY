import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { RUTHIE_POINTS_PER_TL, RUTHIE_WELCOME_POINTS } from "@/lib/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nonNegativeInteger(value: unknown, fallback: number) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("loyalty_reward_settings")
      .select("signup_points, birthday_points, updated_at")
      .eq("id", "default")
      .single();

    if (error || !data) throw new Error(error?.message || "Ruthie Points ayarı bulunamadı.");

    return NextResponse.json({
      ok: true,
      signupPoints: nonNegativeInteger(data.signup_points, RUTHIE_WELCOME_POINTS),
      birthdayPoints: nonNegativeInteger(data.birthday_points, 0),
      pointsPerTl: RUTHIE_POINTS_PER_TL,
      updatedAt: data.updated_at || null,
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("Public Ruthie Points settings could not be loaded", error);
    return NextResponse.json({
      ok: true,
      signupPoints: RUTHIE_WELCOME_POINTS,
      birthdayPoints: 0,
      pointsPerTl: RUTHIE_POINTS_PER_TL,
      updatedAt: null,
      fallback: true,
    }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}
