import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { claimPaidGuestOrderPointsForProfile } from "@/lib/rewardServer";
import { awardSignupRewardForProfile } from "@/lib/loyaltyRewardServer";

export const runtime = "nodejs";

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const GENERIC_DUPLICATE_MESSAGE = "Kayıt tamamlanamadı. Bilgilerinden biri mevcut bir hesapla eşleşiyor olabilir. Giriş yapmayı veya şifre yenilemeyi dene.";

function duplicateResponse() {
  return NextResponse.json({
    ok: false,
    code: "ACCOUNT_ALREADY_EXISTS",
    error: GENERIC_DUPLICATE_MESSAGE,
    redirectTo: "/login",
  }, { status: 409 });
}

function validBirth(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date <= new Date();
}

function clientIp(request: Request) {
  return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function rateHash(request: Request) {
  const salt = process.env.ACCOUNT_RATE_LIMIT_SALT || "ruth-account-register-v1";
  return crypto.createHash("sha256").update(`${salt}|${clientIp(request)}`).digest("hex");
}

async function claimRegistrationOrderPoints(profileId: string, email: string, phone: string) {
  try {
    return await claimPaidGuestOrderPointsForProfile({ profileId, email, phone });
  } catch (error) {
    console.error("Kayıt sonrası misafir sipariş puanı aktarılamadı", { profileId, error });
    return { matchedOrders: 0, linkedOrders: 0, awardedPoints: 0, balance: 0, customerId: null };
  }
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 20_000) return NextResponse.json({ ok: false, error: "Kayıt isteği çok büyük." }, { status: 413 });

    const body = await request.json();
    const email = clean(body.email).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = clean(body.fullName);
    const phone = clean(body.phone);
    const phoneNormalized = normalizePhone(phone);
    const birthDate = clean(body.birthDate) || null;
    const termsAccepted = body.termsAccepted === true;
    const marketing = body.marketingEmailConsent === true;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false, error: "Geçerli e-posta gerekli." }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ ok: false, error: "Şifre en az 6 karakter olmalı." }, { status: 400 });
    if (!fullName) return NextResponse.json({ ok: false, error: "Ad soyad gerekli." }, { status: 400 });
    if (!isValidPhone(phone)) return NextResponse.json({ ok: false, error: "Geçerli telefon numarası gerekli." }, { status: 400 });
    if (!termsAccepted) return NextResponse.json({ ok: false, error: "Kullanım şartları ve KVKK metnini kabul etmelisin." }, { status: 400 });
    if (birthDate && !validBirth(birthDate)) return NextResponse.json({ ok: false, error: "Doğum tarihi geçersiz." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data: rateAccepted, error: rateError } = await supabase.rpc("claim_public_action_rate", {
      p_action: "account_register",
      p_identifier_hash: rateHash(request),
      p_limit: 8,
      p_window_seconds: 3600,
    });
    if (rateError) console.error("Registration rate limit failed", rateError);
    if (rateAccepted === false) return NextResponse.json({ ok: false, error: "Çok fazla kayıt denemesi yapıldı. Lütfen daha sonra tekrar dene." }, { status: 429 });

    const { data: existingRows, error: existingError } = await supabase
      .from("profiles")
      .select("id, auth_user_id, is_legacy_member, email, phone, phone_normalized, full_name, reward_points_balance")
      .or(`email.eq.${email},phone_normalized.eq.${phoneNormalized}`)
      .limit(5);

    if (existingError) {
      const message = String(existingError.message || "");
      if (message.includes("is_legacy_member")) {
        return NextResponse.json({ ok: false, error: "Üyelik işlemi şu anda tamamlanamıyor. Lütfen daha sonra tekrar dene." }, { status: 400 });
      }
      throw new Error(message);
    }

    const existingByEmail = (existingRows || []).find((row: any) => clean(row.email).toLowerCase() === email) || null;
    const existingByPhone = (existingRows || []).find((row: any) => clean(row.phone_normalized) === phoneNormalized) || null;
    const existing = existingByEmail || existingByPhone;
    const canActivateLegacy = Boolean(
      existing
      && existing.is_legacy_member === true
      && !existing.auth_user_id
      && existingByEmail?.id === existing.id
    );

    if (existing?.auth_user_id) return duplicateResponse();

    if (!canActivateLegacy) {
      const [emailIdentityResult, phoneIdentityResult] = await Promise.all([
        supabase
          .from("customer_identities")
          .select("customer_id")
          .eq("identity_type", "email")
          .eq("normalized_value", email)
          .maybeSingle(),
        supabase
          .from("customer_identities")
          .select("customer_id")
          .eq("identity_type", "phone")
          .eq("normalized_value", phoneNormalized)
          .maybeSingle(),
      ]);

      if (emailIdentityResult.error) throw new Error(emailIdentityResult.error.message);
      if (phoneIdentityResult.error) throw new Error(phoneIdentityResult.error.message);

      const customerIds = [...new Set([
        emailIdentityResult.data?.customer_id,
        phoneIdentityResult.data?.customer_id,
      ].filter((value): value is string => Boolean(value)))];

      if (customerIds.length) {
        const { data: matchedCustomers, error: customerError } = await supabase
          .from("customers")
          .select("id, membership_status")
          .in("id", customerIds);
        if (customerError) throw new Error(customerError.message);
        if ((matchedCustomers || []).some((customer: any) => customer.membership_status === "member")) {
          return duplicateResponse();
        }
      }
    }

    const now = new Date().toISOString();
    const ip = clientIp(request) === "unknown" ? null : clientIp(request);

    if (canActivateLegacy && existing) {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, phone, phone_normalized: phoneNormalized, birth_date: birthDate, migrated_member: true },
      });

      if (createError) {
        return createError.message.toLowerCase().includes("already")
          ? duplicateResponse()
          : NextResponse.json({ ok: false, error: "Hesap şu anda oluşturulamadı." }, { status: 400 });
      }
      if (!created.user) throw new Error("Hesap oluşturulamadı.");

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          auth_user_id: created.user.id,
          email,
          full_name: fullName || existing.full_name || null,
          phone,
          phone_normalized: phoneNormalized,
          birth_date: birthDate,
          terms_accepted: true,
          terms_accepted_at: now,
          terms_version: "2026-07-15",
          marketing_email_consent: marketing,
          marketing_email_consent_at: marketing ? now : null,
          marketing_consent_version: marketing ? "2026-07-15" : null,
          consent_source: "ikas_member_activation",
          consent_ip: ip,
        })
        .eq("id", existing.id);

      if (updateError) {
        await supabase.auth.admin.deleteUser(created.user.id).catch(() => undefined);
        if (updateError.message.includes("ACCOUNT_ALREADY_EXISTS")) return duplicateResponse();
        throw new Error(updateError.message);
      }

      const rewardClaim = await claimRegistrationOrderPoints(String(existing.id), email, phone);
      return NextResponse.json({
        ok: true,
        migrated: true,
        welcomePoints: 0,
        claimedOrderPoints: rewardClaim.awardedPoints,
        claimedOrders: rewardClaim.matchedOrders,
        rewardPointsBalance: rewardClaim.balance || Number(existing.reward_points_balance || 0),
      });
    }

    if (existing) return duplicateResponse();

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone, phone_normalized: phoneNormalized, birth_date: birthDate },
    });
    if (createError) {
      return createError.message.toLowerCase().includes("already")
        ? duplicateResponse()
        : NextResponse.json({ ok: false, error: "Hesap şu anda oluşturulamadı." }, { status: 400 });
    }
    if (!created.user) throw new Error("Hesap oluşturulamadı.");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .upsert({
        auth_user_id: created.user.id,
        email,
        full_name: fullName,
        phone,
        phone_normalized: phoneNormalized,
        birth_date: birthDate,
        terms_accepted: true,
        terms_accepted_at: now,
        terms_version: "2026-07-15",
        marketing_email_consent: marketing,
        marketing_email_consent_at: marketing ? now : null,
        marketing_consent_version: marketing ? "2026-07-15" : null,
        consent_source: "web_register",
        consent_ip: ip,
        reward_points_balance: 0,
      }, { onConflict: "auth_user_id" })
      .select("id, reward_points_balance")
      .single();

    if (profileError || !profile) {
      await supabase.auth.admin.deleteUser(created.user.id).catch(() => undefined);
      if (profileError?.message.includes("ACCOUNT_ALREADY_EXISTS")) return duplicateResponse();
      throw new Error(profileError?.message || "Müşteri profili oluşturulamadı.");
    }

    // The migration trigger grants this in the profile transaction. Calling the
    // RPC again is intentional: it returns the immutable ledger snapshot and is
    // idempotent by profile + auth user reference.
    const welcomeReward = await awardSignupRewardForProfile(String(profile.id));
    const rewardClaim = await claimRegistrationOrderPoints(String(profile.id), email, phone);
    return NextResponse.json({
      ok: true,
      migrated: false,
      welcomePoints: welcomeReward.awardedPoints,
      claimedOrderPoints: rewardClaim.awardedPoints,
      claimedOrders: rewardClaim.matchedOrders,
      rewardPointsBalance: rewardClaim.balance || welcomeReward.balance,
    });
  } catch (error) {
    console.error("Account registration failed", error);
    if (error instanceof Error && error.message.includes("ACCOUNT_ALREADY_EXISTS")) {
      return duplicateResponse();
    }
    return NextResponse.json({ ok: false, error: "Kayıt şu anda tamamlanamadı. Lütfen daha sonra tekrar dene." }, { status: 400 });
  }
}
