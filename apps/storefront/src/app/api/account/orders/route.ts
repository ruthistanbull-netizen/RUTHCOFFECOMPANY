import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { claimPaidGuestOrderPointsForProfile } from "@/lib/rewardServer";

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
    if (userError || !userData.user) return NextResponse.json({ ok: false, error: "Oturum geçersiz." }, { status: 401 });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, full_name, phone, phone_normalized, birth_date, reward_points_balance, birthday_reward_points, birthday_reward_claimed_year, marketing_email_consent, terms_accepted")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const email = String(profile?.email || userData.user.email || "").trim().toLowerCase();

    if (profile?.id) {
      try {
        await claimPaidGuestOrderPointsForProfile({
          profileId: String(profile.id),
          email: email || null,
          phone: profile.phone_normalized || profile.phone,
        });
      } catch (claimError) {
        // Order history remains available through the existing profile/e-mail
        // fallback even if loyalty reconciliation has a transient failure.
        console.error("Misafir siparişleri hesap geçmişine bağlanamadı", {
          profileId: profile.id,
          error: claimError,
        });
      }
    }

    let ordersQuery = supabase
      .from("orders")
      .select(`
        id, order_no, status, payment_status, subtotal, shipping_fee, discount_total,
        total_amount, currency, customer_name, customer_email, customer_phone,
        cargo_company, cargo_tracking_no, shipping_address_text,
        shipping_status, basit_kargo_barcode, basit_kargo_return_barcode,
        customer_note, created_at,
        shipping_events (
          id, event_type, status, status_label, tracking_no, barcode, event_time, created_at
        ),
        order_items (
          id, product_id, variant_id, product_slug, product_name, variant_name,
          quantity, unit_price, total_price, image_url
        )
      `)
      .order("created_at", { ascending: false });

    if (profile?.id && email) ordersQuery = ordersQuery.or(`profile_id.eq.${profile.id},customer_email.eq.${email}`);
    else if (profile?.id) ordersQuery = ordersQuery.eq("profile_id", profile.id);
    else if (email) ordersQuery = ordersQuery.eq("customer_email", email);
    else return NextResponse.json({ ok: true, profile: profile || null, orders: [] });

    const { data: orders, error: ordersError } = await ordersQuery;
    if (ordersError) throw new Error(ordersError.message);

    const orderIds = (orders || []).map((order: any) => String(order.id));
    const returnsResult = orderIds.length
      ? await supabase
          .from("returns_exchanges")
          .select("id, order_id, type, status, reason, amount, return_mode, refunded_items, exchange_items, refund_status, refund_provider, refund_reference, refunded_at, notes, created_at, updated_at")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };

    const returnsByOrder = new Map<string, any[]>();
    if (!returnsResult.error) {
      for (const item of returnsResult.data || []) {
        const orderId = String(item.order_id);
        returnsByOrder.set(orderId, [...(returnsByOrder.get(orderId) || []), item]);
      }
    }

    const rows = (orders || []).map((order: any) => ({
      ...order,
      shipping_events: [...(order.shipping_events || [])].sort((a: any, b: any) => new Date(b.event_time || b.created_at || 0).getTime() - new Date(a.event_time || a.created_at || 0).getTime()).slice(0, 10),
      return_cases: returnsByOrder.get(String(order.id)) || [],
    }));

    return NextResponse.json(
      { ok: true, profile: profile || null, orders: rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Siparişler alınamadı." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
