import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const profileId = String(body.profileId || body.profile_id || "").trim();
  const operation = body.operation === "remove" ? "remove" : "add";
  const requested = Math.max(0, Math.trunc(Number(body.points || 0)));
  const reason = String(body.reason || "").trim() || "Panel puan düzenlemesi";
  if (!profileId || requested <= 0) {
    return NextResponse.json({ ok: false, error: "Profil ve puan miktarı gerekli." }, { status: 400 });
  }

  const current = await auth.supabase.from("profiles").select("id,reward_points_balance").eq("id", profileId).maybeSingle();
  if (current.error || !current.data) {
    return NextResponse.json({ ok: false, error: current.error?.message || "Müşteri profili bulunamadı." }, { status: 404 });
  }

  const oldBalance = Math.max(0, Number(current.data.reward_points_balance || 0));
  const signed = operation === "remove" ? -requested : requested;
  const appliedAmount = operation === "remove" ? -Math.min(requested, oldBalance) : requested;
  const balance = Math.max(0, oldBalance + appliedAmount);

  const update = await auth.supabase
    .from("profiles")
    .update({ reward_points_balance: balance, updated_at: new Date().toISOString() })
    .eq("id", profileId)
    .select("id,reward_points_balance")
    .single();

  if (update.error) return NextResponse.json({ ok: false, error: update.error.message }, { status: 400 });

  const tx = await auth.supabase.from("rosta_point_transactions").insert({
    profile_id: profileId,
    amount: appliedAmount,
    balance_after: balance,
    transaction_type: operation === "remove" ? "admin_remove" : "admin_add",
    reason,
    reference_type: "admin",
    reference_id: null,
    admin_profile_id: auth.profile.id,
  });
  if (tx.error) {
    await auth.supabase.from("profiles").update({ reward_points_balance: oldBalance, updated_at: new Date().toISOString() }).eq("id", profileId);
    return NextResponse.json({ ok: false, error: tx.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, appliedAmount, balance, requestedAmount: signed });
}
