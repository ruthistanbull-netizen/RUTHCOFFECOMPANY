import {
  DEFAULT_LOYALTY_REWARD_SETTINGS,
  normalizeLoyaltyRewardSettings,
} from "@ruth-commerce/commerce-core";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanSearch(value: string) {
  return value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
}

function safePoints(value: unknown) {
  const points = Math.floor(Number(value || 0));
  if (!Number.isFinite(points) || points <= 0) throw new Error("Geçerli bir puan miktarı gir.");
  return Math.min(points, 10_000_000);
}

function requestKey(value: unknown) {
  const key = String(value || "").trim();
  if (!/^[a-zA-Z0-9._:-]{8,160}$/.test(key)) {
    throw new Error("Puan işlemi için geçerli işlem anahtarı gerekli. Sayfayı yenileyip tekrar dene.");
  }
  return key;
}

function withMembership(profile: any) {
  return {
    ...profile,
    is_member: Boolean(profile?.auth_user_id || profile?.is_legacy_member),
    membership_source: profile?.auth_user_id ? "new_site" : profile?.is_legacy_member ? "ikas" : null,
    reward_points_balance: Math.max(0, Math.floor(Number(profile?.reward_points_balance || 0))),
    birthday_reward_points: Math.max(0, Math.floor(Number(profile?.birthday_reward_points || 0))),
  };
}

function serializeSettings(row: any) {
  return {
    signupPoints: Math.max(0, Math.floor(Number(row?.signup_points ?? DEFAULT_LOYALTY_REWARD_SETTINGS.signupPoints))),
    birthdayPoints: Math.max(0, Math.floor(Number(row?.birthday_points ?? DEFAULT_LOYALTY_REWARD_SETTINGS.birthdayPoints))),
    updatedAt: row?.updated_at || null,
    updatedByProfileId: row?.updated_by_profile_id || null,
  };
}

async function loadRewardSettings(supabase: any) {
  const { data, error } = await supabase
    .from("loyalty_reward_settings")
    .select("signup_points, birthday_points, updated_at, updated_by_profile_id")
    .eq("id", "default")
    .maybeSingle();
  if (error) {
    throw new Error(`${error.message}. Supabase loyalty reward settings migrationını çalıştır.`);
  }
  return serializeSettings(data);
}

async function loadAllProfiles(supabase: any) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 1_000_000; from += pageSize) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, auth_user_id, is_legacy_member, ikas_account_status, full_name, email, phone, reward_points_balance, birthday_reward_points, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

function normalizedIdentity(profile: any) {
  const email = String(profile?.email || "").trim().toLocaleLowerCase("tr-TR");
  if (email) return `email:${email}`;
  const phone = String(profile?.phone || "").replace(/\D/g, "");
  if (phone) return `phone:${phone.slice(-10)}`;
  return `id:${profile?.id}`;
}

function dedupeProfiles(rows: any[]) {
  const byIdentity = new Map<string, any>();
  for (const row of rows) {
    const key = normalizedIdentity(row);
    const current = byIdentity.get(key);
    if (!current) {
      byIdentity.set(key, row);
      continue;
    }
    const rowScore = Number(Boolean(row.auth_user_id)) * 100 + Number(Boolean(row.is_legacy_member)) * 10 + Number(row.reward_points_balance || 0);
    const currentScore = Number(Boolean(current.auth_user_id)) * 100 + Number(Boolean(current.is_legacy_member)) * 10 + Number(current.reward_points_balance || 0);
    if (rowScore > currentScore) byIdentity.set(key, row);
  }
  return [...byIdentity.values()];
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const { supabase } = auth;
    const url = new URL(request.url);
    const settingsOnly = url.searchParams.get("settingsOnly") === "1";
    if (settingsOnly) {
      return NextResponse.json({ ok: true, settings: await loadRewardSettings(supabase) });
    }

    const q = cleanSearch(url.searchParams.get("q") || "").toLocaleLowerCase("tr-TR");
    const profileId = (url.searchParams.get("profileId") || "").trim();
    const page = Math.max(1, Math.trunc(Number(url.searchParams.get("page") || 1)));
    const pageSize = Math.min(50, Math.max(10, Math.trunc(Number(url.searchParams.get("pageSize") || 25))));

    const [allRows, historyResult, settings] = await Promise.all([
      loadAllProfiles(supabase),
      profileId
        ? supabase
            .from("rosta_point_transactions")
            .select("id, amount, balance_after, transaction_type, reason, reference_type, reference_id, created_at")
            .eq("profile_id", profileId)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
      loadRewardSettings(supabase),
    ]);

    if (historyResult.error) throw new Error(`${historyResult.error.message}. Supabase'te ROSTA Points altyapı migrationları dosyasını çalıştır.`);

    const uniqueProfiles = dedupeProfiles(allRows);
    const filtered = q
      ? uniqueProfiles.filter((profile) => [profile.full_name, profile.email, profile.phone].some((value) => String(value || "").toLocaleLowerCase("tr-TR").includes(q)))
      : uniqueProfiles;
    const from = (page - 1) * pageSize;
    const profiles = filtered.slice(from, from + pageSize).map(withMembership);
    const memberCount = uniqueProfiles.filter((profile) => Boolean(profile.auth_user_id || profile.is_legacy_member)).length;

    return NextResponse.json({
      ok: true,
      settings,
      customers: profiles,
      transactions: historyResult.data || [],
      pagination: { page, pageSize, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)) },
      summary: {
        customerCount: uniqueProfiles.length,
        memberCount,
        nonMemberCount: Math.max(0, uniqueProfiles.length - memberCount),
        totalPoints: uniqueProfiles.reduce((sum, profile) => sum + Math.max(0, Number(profile.reward_points_balance || 0)), 0),
        customersWithPoints: uniqueProfiles.filter((profile) => Number(profile.reward_points_balance || 0) > 0).length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "ROSTA Points bilgileri alınamadı." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const { supabase, profile: adminProfile } = auth;
    const body = await request.json();
    const idempotencyKey = requestKey(body.requestId || request.headers.get("x-idempotency-key"));
    const settings = normalizeLoyaltyRewardSettings({
      signupPoints: body.signupPoints,
      birthdayPoints: body.birthdayPoints,
    });

    const { data, error } = await supabase.rpc("update_loyalty_reward_settings", {
      p_signup_points: settings.signupPoints,
      p_birthday_points: settings.birthdayPoints,
      p_admin_profile_id: adminProfile?.id || null,
      p_correlation_id: idempotencyKey,
    });
    if (error) throw new Error(`${error.message}. Supabase loyalty reward settings migrationını çalıştır.`);

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      ok: true,
      requestId: idempotencyKey,
      futureEventsOnly: true,
      settings: serializeSettings(row),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "ROSTA Points ödül ayarları güncellenemedi." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const { supabase, profile: adminProfile } = auth;
    const body = await request.json();
    const idempotencyKey = requestKey(body.requestId || request.headers.get("x-idempotency-key"));
    const profileId = String(body.profileId || "").trim();
    const profileIds: string[] = Array.isArray(body.profileIds)
      ? Array.from(new Set<string>(body.profileIds.map((value: unknown) => String(value || "").trim()).filter((value: string) => Boolean(value)))).slice(0, 500)
      : [];
    const operation = body.operation === "remove" ? "remove" : "add";
    const points = safePoints(body.points);
    const amount = operation === "remove" ? -points : points;
    const reason = String(body.reason || "").trim().slice(0, 300) || (operation === "remove" ? "Panelden puan çıkarma" : "Panelden puan ekleme");

    if (profileIds.length > 0) {
      const results: Array<{ profileId: string; ok: boolean; appliedAmount?: number; balance?: number; error?: string }> = [];
      for (const currentProfileId of profileIds) {
        const { data: adjustment, error: adjustmentError } = await supabase.rpc("adjust_rosta_points", {
          p_profile_id: currentProfileId,
          p_amount: amount,
          p_reason: reason,
          p_transaction_type: "admin_adjustment",
          p_reference_type: "bulk_admin_adjustment",
          p_reference_id: `${idempotencyKey}:${currentProfileId}`,
          p_admin_profile_id: adminProfile?.id || null,
        });
        if (adjustmentError) {
          results.push({ profileId: currentProfileId, ok: false, error: adjustmentError.message });
          continue;
        }
        const result = adjustment?.[0] || null;
        results.push({
          profileId: currentProfileId,
          ok: true,
          appliedAmount: Number(result?.applied_amount || 0),
          balance: Math.max(0, Math.floor(Number(result?.balance || 0))),
        });
      }

      const successCount = results.filter((result) => result.ok).length;
      const failedCount = results.length - successCount;
      return NextResponse.json({
        ok: successCount > 0,
        partial: successCount > 0 && failedCount > 0,
        requestId: idempotencyKey,
        successCount,
        failedCount,
        results,
      }, { status: successCount === 0 ? 400 : failedCount > 0 ? 207 : 200 });
    }

    if (!profileId) throw new Error("Müşteri seçmelisin.");

    const { data: adjustment, error: adjustmentError } = await supabase.rpc("adjust_rosta_points", {
      p_profile_id: profileId,
      p_amount: amount,
      p_reason: reason,
      p_transaction_type: "admin_adjustment",
      p_reference_type: "admin_adjustment",
      p_reference_id: `${idempotencyKey}:${profileId}`,
      p_admin_profile_id: adminProfile?.id || null,
    });

    if (adjustmentError) {
      throw new Error(`${adjustmentError.message}. Supabase'te ROSTA Points altyapı migrationları dosyasını çalıştır.`);
    }

    const result = adjustment?.[0] || null;
    const { data: customer, error: customerError } = await supabase
      .from("profiles")
      .select("id, auth_user_id, is_legacy_member, ikas_account_status, full_name, email, phone, reward_points_balance, birthday_reward_points, created_at")
      .eq("id", profileId)
      .single();
    if (customerError) throw new Error(customerError.message);

    return NextResponse.json({
      ok: true,
      requestId: idempotencyKey,
      customer: withMembership(customer),
      appliedAmount: Number(result?.applied_amount || 0),
      balance: Math.max(0, Math.floor(Number(result?.balance ?? customer.reward_points_balance ?? 0))),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Puan güncellenemedi." },
      { status: 400 },
    );
  }
}
