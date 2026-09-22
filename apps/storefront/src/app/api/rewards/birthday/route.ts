import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POINTS = 2000;

function bearerToken(request: Request) {
  return (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

function todayIstanbul() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

function occurrence(year: number, month: number, day: number) {
  const max = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(day, max)));
}

function birthdayStatus(
  birthDate: string | null,
  claimedYear: number | null,
  birthdayPoints: number,
  rewardPointsBalance: number,
) {
  const today = todayIstanbul();
  if (!birthDate) {
    return {
      birthDate: null,
      eligible: false,
      claimed: false,
      windowEnd: null,
      claimYear: null,
      birthdayPoints,
      rewardPointsBalance,
    };
  }

  const [, month, day] = birthDate.split("-").map(Number);
  const year = today.getUTCFullYear();
  for (const claimYear of [year, year - 1]) {
    const start = occurrence(claimYear, month, day);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    if (today >= start && today <= end) {
      return {
        birthDate,
        eligible: claimedYear !== claimYear,
        claimed: claimedYear === claimYear,
        windowEnd: end.toISOString().slice(0, 10),
        claimYear,
        birthdayPoints,
        rewardPointsBalance,
      };
    }
  }

  return {
    birthDate,
    eligible: false,
    claimed: claimedYear === year,
    windowEnd: null,
    claimYear: null,
    birthdayPoints,
    rewardPointsBalance,
  };
}

async function authenticate(request: Request) {
  const accessToken = bearerToken(request);
  if (!accessToken) throw new Error("Oturum bulunamadı.");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Oturum geçersiz.");
  return { supabase, user: data.user };
}

export async function GET(request: Request) {
  try {
    const { supabase, user } = await authenticate(request);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, birth_date, birthday_reward_claimed_year, birthday_reward_points, reward_points_balance")
      .eq("auth_user_id", user.id)
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json(
      {
        ok: true,
        ...birthdayStatus(
          data.birth_date,
          data.birthday_reward_claimed_year,
          Number(data.birthday_reward_points || 0),
          Number(data.reward_points_balance || 0),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Bilgi alınamadı." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await authenticate(request);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, birth_date, birthday_reward_claimed_year, birthday_reward_points, reward_points_balance")
      .eq("auth_user_id", user.id)
      .single();
    if (error) throw new Error(error.message);

    const current = birthdayStatus(
      data.birth_date,
      data.birthday_reward_claimed_year,
      Number(data.birthday_reward_points || 0),
      Number(data.reward_points_balance || 0),
    );

    if (!current.birthDate) {
      return NextResponse.json({ ok: false, error: "Önce hesabına doğum tarihini ekle." }, { status: 400 });
    }
    if (!current.eligible || !current.claimYear) {
      return NextResponse.json(
        {
          ok: false,
          error: current.claimed
            ? "Bu yılın doğum günü puanını zaten aldın."
            : "Puan, doğum gününde ve sonraki 7 gün içinde alınabilir.",
        },
        { status: 400 },
      );
    }

    const { data: adjustment, error: adjustmentError } = await supabase.rpc("adjust_ruthie_points", {
      p_profile_id: data.id,
      p_amount: POINTS,
      p_reason: `${current.claimYear} doğum günü hediyesi`,
      p_transaction_type: "birthday",
      p_reference_type: "birthday_year",
      p_reference_id: String(current.claimYear),
      p_admin_profile_id: null,
    });
    if (adjustmentError) {
      throw new Error(`${adjustmentError.message}.`);
    }

    const balance = Math.max(0, Number(adjustment?.[0]?.balance ?? data.reward_points_balance ?? 0));
    const nextBirthdayPoints = Number(data.birthday_reward_points || 0) + POINTS;
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        birthday_reward_claimed_year: current.claimYear,
        birthday_reward_points: nextBirthdayPoints,
        birthday_reward_claimed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({
      ok: true,
      awarded: POINTS,
      ...birthdayStatus(data.birth_date, current.claimYear, nextBirthdayPoints, balance),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Puan eklenemedi." },
      { status: 400 },
    );
  }
}
