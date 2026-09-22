import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type RewardRpcRow = {
  points_awarded?: number | string | null;
  balance?: number | string | null;
  transaction_id?: string | null;
  processed?: boolean | null;
  claim_year?: number | string | null;
};

export type ConfiguredRewardResult = {
  processed: boolean;
  awardedPoints: number;
  balance: number;
  transactionId: string | null;
  claimYear?: number;
};

export type BirthdayRewardBatchResult = {
  processedProfiles: number;
  awardedPoints: number;
  claimYear: number;
};

function nonNegativeInteger(value: unknown) {
  const parsed = Math.floor(Number(value || 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function firstRpcRow(data: unknown): RewardRpcRow {
  return Array.isArray(data) ? ((data[0] || {}) as RewardRpcRow) : ((data || {}) as RewardRpcRow);
}

/**
 * Returns the immutable signup ledger snapshot. The database trigger records
 * it in the same transaction that creates a new web registration profile.
 */
export async function awardSignupRewardForProfile(profileId: string): Promise<ConfiguredRewardResult> {
  const cleanProfileId = String(profileId || "").trim();
  if (!cleanProfileId) throw new Error("Ruthie Points profili gerekli.");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("award_rosta_signup_reward", {
    p_profile_id: cleanProfileId,
  });
  if (error) throw new Error(`Üyelik Ruthie Points ödülü eklenemedi: ${error.message}`);

  const row = firstRpcRow(data);
  return {
    processed: true,
    awardedPoints: nonNegativeInteger(row.points_awarded),
    balance: nonNegativeInteger(row.balance),
    transactionId: row.transaction_id || null,
  };
}

/**
 * Claims today's reward using Europe/Istanbul date. Profile + year is stored
 * once, including a zero-point snapshot, so later setting changes are never
 * applied retroactively.
 */
export async function claimBirthdayRewardForProfile(profileId: string): Promise<ConfiguredRewardResult> {
  const cleanProfileId = String(profileId || "").trim();
  if (!cleanProfileId) throw new Error("Ruthie Points profili gerekli.");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("claim_rosta_birthday_reward", {
    p_profile_id: cleanProfileId,
  });
  if (error) throw new Error(`Doğum günü Ruthie Points ödülü işlenemedi: ${error.message}`);

  const row = firstRpcRow(data);
  return {
    processed: row.processed === true,
    awardedPoints: nonNegativeInteger(row.points_awarded),
    balance: nonNegativeInteger(row.balance),
    transactionId: row.transaction_id || null,
    claimYear: nonNegativeInteger(row.claim_year) || undefined,
  };
}

export async function claimBirthdayRewardsForToday(): Promise<BirthdayRewardBatchResult> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("claim_all_rosta_birthday_rewards", {
    p_limit: 5_000,
  });
  if (error) throw new Error(`Günlük doğum günü Ruthie Points işi tamamlanamadı: ${error.message}`);

  const row = Array.isArray(data) ? (data[0] || {}) : (data || {});
  return {
    processedProfiles: nonNegativeInteger((row as any).processed_profiles),
    awardedPoints: nonNegativeInteger((row as any).awarded_points),
    claimYear: nonNegativeInteger((row as any).claim_year),
  };
}
