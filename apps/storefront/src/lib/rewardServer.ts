import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePhone } from "@/lib/phone";

type ClaimPaidGuestOrderPointsInput = {
  profileId: string;
  email?: string | null;
  phone?: string | null;
};

type PaidOrderRow = {
  id: string;
  order_no: string;
  profile_id: string | null;
  customer_id: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  total_amount: number | string;
};

export type PaidGuestOrderPointsClaim = {
  matchedOrders: number;
  linkedOrders: number;
  awardedPoints: number;
  balance: number;
  customerId: string | null;
};

function normalizedEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function pointsForPaidTotal(value: unknown) {
  const total = Number(value || 0);
  return Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
}

function emptyClaim(balance = 0, customerId: string | null = null): PaidGuestOrderPointsClaim {
  return {
    matchedOrders: 0,
    linkedOrders: 0,
    awardedPoints: 0,
    balance: Math.max(0, Math.floor(Number(balance || 0))),
    customerId,
  };
}

/**
 * Promotes paid guest orders into a member account through the canonical
 * Customer Engine identity graph. E-mail OR normalized phone can resolve the
 * same guest customer. Orders are then permanently linked to profile_id and
 * their Ruthie Points are reconciled with the immutable order reference.
 *
 * Safe to call after registration, login/account sync, order-history reads and
 * reward-balance reads. adjust_rosta_points is idempotent for the same
 * profile + order reference, so repeated reconciliation never double-awards.
 */
export async function claimPaidGuestOrderPointsForProfile({
  profileId,
  email,
  phone,
}: ClaimPaidGuestOrderPointsInput): Promise<PaidGuestOrderPointsClaim> {
  const cleanProfileId = String(profileId || "").trim();
  if (!cleanProfileId) return emptyClaim();

  const supabase = getSupabaseAdmin();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, phone_normalized, reward_points_balance")
    .eq("id", cleanProfileId)
    .maybeSingle();

  if (profileError) throw new Error(`Ruthie Points profili alınamadı: ${profileError.message}`);
  if (!profile) throw new Error("Ruthie Points profili bulunamadı.");

  const cleanEmail = normalizedEmail(profile.email || email);
  const cleanPhone = normalizePhone(profile.phone_normalized || profile.phone || phone);
  const currentBalance = Math.max(0, Math.floor(Number(profile.reward_points_balance || 0)));
  if (!cleanEmail && !cleanPhone) return emptyClaim(currentBalance);

  // Resolving the member profile against both identities upgrades/merges an
  // existing guest customer instead of creating a second customer. The Customer
  // Engine also moves historical orders to the surviving canonical customer_id.
  const { data: resolvedCustomerId, error: identityError } = await supabase.rpc(
    "resolve_or_create_customer",
    {
      p_profile_id: cleanProfileId,
      p_full_name: String(profile.full_name || "").trim() || null,
      p_email: cleanEmail || null,
      p_phone: cleanPhone || null,
      p_source: "profile",
      p_seen_at: new Date().toISOString(),
      p_marketing_email_consent: false,
      p_marketing_consent_at: null,
      p_consent_source: "guest_order_account_claim",
    },
  );

  if (identityError) {
    throw new Error(`Müşteri kimliği hesaba bağlanamadı: ${identityError.message}`);
  }

  const customerId = resolvedCustomerId ? String(resolvedCustomerId) : null;
  const selectColumns = "id, order_no, profile_id, customer_id, customer_email, customer_phone, total_amount";
  const orderQueries = [
    supabase
      .from("orders")
      .select(selectColumns)
      .eq("payment_status", "paid")
      .eq("profile_id", cleanProfileId),
  ];

  if (customerId) {
    orderQueries.push(
      supabase
        .from("orders")
        .select(selectColumns)
        .eq("payment_status", "paid")
        .eq("customer_id", customerId),
    );
  }

  // E-mail remains a compatibility fallback for older website orders created
  // before the canonical customer_id assignment was deployed.
  if (cleanEmail) {
    orderQueries.push(
      supabase
        .from("orders")
        .select(selectColumns)
        .eq("payment_status", "paid")
        .eq("customer_email", cleanEmail),
    );
  }

  const orderResults = await Promise.all(orderQueries);
  for (const result of orderResults) {
    if (result.error) throw new Error(`Ödenmiş siparişler alınamadı: ${result.error.message}`);
  }

  const ordersById = new Map<string, PaidOrderRow>();
  for (const result of orderResults) {
    for (const row of (result.data || []) as unknown as PaidOrderRow[]) {
      ordersById.set(String(row.id), row);
    }
  }

  const eligibleOrders = [...ordersById.values()].filter((order) => {
    if (order.profile_id && String(order.profile_id) !== cleanProfileId) return false;

    const profileMatch = String(order.profile_id || "") === cleanProfileId;
    const customerMatch = Boolean(customerId && String(order.customer_id || "") === customerId);
    const emailMatch = Boolean(cleanEmail && normalizedEmail(order.customer_email) === cleanEmail);
    const phoneMatch = Boolean(cleanPhone && normalizePhone(order.customer_phone) === cleanPhone);
    return profileMatch || customerMatch || emailMatch || phoneMatch;
  });

  if (!eligibleOrders.length) return emptyClaim(currentBalance, customerId);

  const eligibleOrderIds = eligibleOrders.map((order) => String(order.id));
  const linkedOrders = eligibleOrders.filter((order) => !order.profile_id).length;

  // Link the order first so the account history no longer relies on mutable
  // e-mail/phone snapshots after this reconciliation succeeds.
  const { error: linkOrdersError } = await supabase
    .from("orders")
    .update({ profile_id: cleanProfileId, updated_at: new Date().toISOString() })
    .in("id", eligibleOrderIds)
    .is("profile_id", null);
  if (linkOrdersError) throw new Error(`Misafir siparişleri hesaba bağlanamadı: ${linkOrdersError.message}`);

  // Keep the paid checkout source linked as well; this makes future payment and
  // operational reads agree with the canonical account relationship.
  const { error: linkDraftsError } = await supabase
    .from("checkout_drafts")
    .update({ profile_id: cleanProfileId, updated_at: new Date().toISOString() })
    .in("order_id", eligibleOrderIds)
    .eq("status", "paid")
    .is("profile_id", null);
  if (linkDraftsError) {
    throw new Error(`Ödeme kayıtları hesaba bağlanamadı: ${linkDraftsError.message}`);
  }

  const { data: existingTransactions, error: transactionLookupError } = await supabase
    .from("rosta_point_transactions")
    .select("reference_id")
    .eq("profile_id", cleanProfileId)
    .eq("transaction_type", "order_earned")
    .eq("reference_type", "order")
    .in("reference_id", eligibleOrderIds);

  if (transactionLookupError) {
    throw new Error(`Ruthie Points geçmişi alınamadı: ${transactionLookupError.message}`);
  }

  const previouslyRewarded = new Set(
    (existingTransactions || [])
      .map((transaction) => String(transaction.reference_id || ""))
      .filter(Boolean),
  );

  let awardedPoints = 0;
  for (const order of eligibleOrders) {
    const points = pointsForPaidTotal(order.total_amount);
    if (points <= 0) continue;

    const { error: awardError } = await supabase.rpc("adjust_rosta_points", {
      p_profile_id: cleanProfileId,
      p_amount: points,
      p_reason: `${order.order_no} siparişinden kazanılan Ruthie Points`,
      p_transaction_type: "order_earned",
      p_reference_type: "order",
      p_reference_id: String(order.id),
      p_admin_profile_id: null,
    });
    if (awardError) throw new Error(`Sipariş puanı eklenemedi: ${awardError.message}`);

    if (!previouslyRewarded.has(String(order.id))) awardedPoints += points;
  }

  const { data: refreshedProfile, error: balanceError } = await supabase
    .from("profiles")
    .select("reward_points_balance")
    .eq("id", cleanProfileId)
    .single();
  if (balanceError) throw new Error(`Ruthie Points bakiyesi yenilenemedi: ${balanceError.message}`);

  return {
    matchedOrders: eligibleOrders.length,
    linkedOrders,
    awardedPoints,
    balance: Math.max(0, Math.floor(Number(refreshedProfile.reward_points_balance || 0))),
    customerId,
  };
}
