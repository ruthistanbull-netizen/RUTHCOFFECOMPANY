import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone } from "@/lib/phone";
import {
  claimPaidGuestOrderPointsForProfile,
  type PaidGuestOrderPointsClaim,
} from "@/lib/rewardServer";

export const runtime = "nodejs";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) {
      return NextResponse.json({ ok: false, error: "Oturum bulunamadı." }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ ok: false, error: "Oturum geçersiz." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const user = userData.user;
    const requestedFullName = clean(body.fullName) || clean(user.user_metadata?.full_name);
    const requestedPhone = clean(body.phone) || clean(user.user_metadata?.phone);
    const requestedPhoneNormalized = normalizePhone(requestedPhone);

    const { data: existingProfile, error: lookupError } = await supabase
      .from("profiles")
      .select("id, email, full_name, phone, phone_normalized, role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (lookupError) throw new Error(lookupError.message);

    let profile = existingProfile;

    if (!profile) {
      const profilePayload: Record<string, string | null> = {
        auth_user_id: user.id,
        email: user.email || null,
        full_name: requestedFullName || null,
        phone: requestedPhone || null,
        phone_normalized: requestedPhoneNormalized || null,
      };

      let createResult = await supabase
        .from("profiles")
        .insert(profilePayload)
        .select("id, email, full_name, phone, phone_normalized, role")
        .single();

      if (createResult.error && createResult.error.message.toLocaleLowerCase("tr-TR").includes("phone_normalized")) {
        const { phone_normalized: _phoneNormalized, ...fallbackPayload } = profilePayload;
        createResult = await supabase
          .from("profiles")
          .insert(fallbackPayload)
          .select("id, email, full_name, phone, phone_normalized, role")
          .single();
      }

      if (createResult.error) throw new Error(createResult.error.message);
      profile = createResult.data;
    } else {
      const profileUpdates: Record<string, string | null> = {};
      if (!clean(profile.full_name) && requestedFullName) profileUpdates.full_name = requestedFullName;
      if (!clean(profile.phone) && requestedPhone) {
        profileUpdates.phone = requestedPhone;
        profileUpdates.phone_normalized = requestedPhoneNormalized || null;
      }

      if (Object.keys(profileUpdates).length) {
        const updateResult = await supabase
          .from("profiles")
          .update(profileUpdates)
          .eq("id", profile.id)
          .select("id, email, full_name, phone, phone_normalized, role")
          .single();

        if (updateResult.error) throw new Error(updateResult.error.message);
        profile = updateResult.data;
      }
    }

    if (!profile) throw new Error("Profil bulunamadı.");

    const canonicalEmail = clean(profile.email) || user.email || "";
    const canonicalPhone = clean(profile.phone) || requestedPhone;
    const canonicalFullName = clean(profile.full_name) || requestedFullName;

    const { error: identityError } = await supabase.rpc("resolve_or_create_customer", {
      p_profile_id: profile.id,
      p_full_name: canonicalFullName || null,
      p_email: canonicalEmail || null,
      p_phone: canonicalPhone || null,
      p_source: "profile",
      p_seen_at: new Date().toISOString(),
      p_marketing_email_consent: false,
      p_marketing_consent_at: null,
      p_consent_source: "account_sync",
    });

    if (identityError) throw new Error(identityError.message);

    let guestOrderClaim: PaidGuestOrderPointsClaim | null = null;
    try {
      guestOrderClaim = await claimPaidGuestOrderPointsForProfile({
        profileId: String(profile.id),
        email: canonicalEmail || null,
        phone: canonicalPhone || null,
      });
    } catch (claimError) {
      // Account creation/login must not fail because a reward reconciliation
      // worker had a transient problem. Orders/balance endpoints retry safely.
      console.error("Hesap senkronunda misafir siparişleri uzlaştırılamadı", {
        profileId: profile.id,
        error: claimError,
      });
    }

    return NextResponse.json({ ok: true, profile, guestOrderClaim });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Profil kaydedilemedi." },
      { status: 400 }
    );
  }
}
