import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyRange } from "@/lib/ranges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  order_no: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  total_amount: number | null;
  currency: string | null;
  status: string | null;
  payment_status: string | null;
  created_at: string | null;
};

type IntentRow = { id: string; order_id: string | null; merchant_oid: string | null; status: string | null; amount_kurus: number | null; installment_count: number | null; card_type: string | null; created_at: string | null };
type RefundRow = { id: string; order_id: string | null; payment_intent_id: string | null; amount_kurus: number | null; status: string | null };

function normalize(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("tr-TR");
}

function moneyKurus(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const url = new URL(request.url);
  const query = normalize(url.searchParams.get("q"));
  const range = url.searchParams.get("range") || "all";
  const limit = Math.min(300, Math.max(20, Math.trunc(Number(url.searchParams.get("limit") || 160))));

  let ordersQuery = supabase
    .from("orders")
    .select("id,order_no,customer_name,customer_email,customer_phone,total_amount,currency,status,payment_status,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  ordersQuery = applyRange(ordersQuery, "created_at", range);
  const ordersResult = await ordersQuery;

  if (ordersResult.error) return NextResponse.json({ ok: false, error: ordersResult.error.message }, { status: 500, headers: { "Cache-Control": "no-store" } });

  const orders = (ordersResult.data || []) as OrderRow[];
  const orderIds = orders.map((order) => String(order.id)).filter(Boolean);
  const [intentsResult, refundsResult] = await Promise.all([
    orderIds.length ? supabase.from("payment_intents").select("id,order_id,merchant_oid,status,amount_kurus,installment_count,card_type,created_at").in("order_id", orderIds).order("created_at", { ascending: false }).limit(limit * 3) : Promise.resolve({ data: [] as IntentRow[], error: null }),
    orderIds.length ? supabase.from("payment_refunds").select("id,order_id,payment_intent_id,amount_kurus,status").in("order_id", orderIds).limit(limit * 4) : Promise.resolve({ data: [] as RefundRow[], error: null }),
  ]);
  const relatedError = intentsResult.error || refundsResult.error;
  if (relatedError) return NextResponse.json({ ok: false, error: relatedError.message }, { status: 500, headers: { "Cache-Control": "no-store" } });

  const intents = (intentsResult.data || []) as IntentRow[];
  const refunds = (refundsResult.data || []) as RefundRow[];
  const latestIntentByOrder = new Map<string, IntentRow>();
  const intentById = new Map<string, IntentRow>();
  for (const intent of intents) {
    const intentId = String(intent.id || "");
    const orderId = String(intent.order_id || "");
    if (intentId) intentById.set(intentId, intent);
    if (orderId && !latestIntentByOrder.has(orderId)) latestIntentByOrder.set(orderId, intent);
  }
  const refundsByOrder = new Map<string, RefundRow[]>();
  for (const refund of refunds) {
    const orderId = String(refund.order_id || intentById.get(String(refund.payment_intent_id || ""))?.order_id || "");
    if (!orderId) continue;
    refundsByOrder.set(orderId, [...(refundsByOrder.get(orderId) || []), refund]);
  }

  const rows = orders.map((order) => {
    const orderId = String(order.id);
    const intent = latestIntentByOrder.get(orderId);
    const orderRefunds = refundsByOrder.get(orderId) || [];
    const refundedKurus = orderRefunds.filter((refund) => ["requested", "processing", "succeeded", "success"].includes(normalize(refund.status))).reduce((sum, refund) => sum + Math.max(0, Number(refund.amount_kurus || 0)), 0);
    const totalKurus = intent?.amount_kurus != null ? Math.max(0, Number(intent.amount_kurus || 0)) : moneyKurus(order.total_amount);
    const searchable = normalize([order.order_no, order.customer_name, order.customer_email, order.customer_phone, intent?.merchant_oid].filter(Boolean).join(" "));
    return {
      id: orderId,
      orderNo: String(order.order_no || "-"),
      customerName: String(order.customer_name || "İsimsiz müşteri"),
      customerEmail: order.customer_email || null,
      customerPhone: order.customer_phone || null,
      totalAmount: Number(order.total_amount || totalKurus / 100 || 0),
      currency: String(order.currency || "TRY"),
      orderStatus: String(order.status || "draft"),
      paymentStatus: String(order.payment_status || intent?.status || "pending"),
      paymentSource: intent ? "commerce_v2" : "legacy",
      reference: String(intent?.merchant_oid || order.order_no || orderId),
      installmentCount: Math.max(0, Number(intent?.installment_count || 0)),
      cardType: intent?.card_type || null,
      refundedAmount: refundedKurus / 100,
      refundStatus: orderRefunds[0]?.status || null,
      createdAt: String(order.created_at || ""),
      searchable,
    };
  }).filter((row) => !query || row.searchable.includes(query));

  const paidRows = rows.filter((row) => ["paid", "succeeded", "success"].includes(normalize(row.paymentStatus)));
  const refundedTotal = rows.reduce((sum, row) => sum + Number(row.refundedAmount || 0), 0);
  const reviewRequired = rows.filter((row) => ["failed", "rejected", "requires_action", "pending", "waiting"].includes(normalize(row.paymentStatus))).length;

  return NextResponse.json({
    ok: true,
    rows: rows.map(({ searchable, ...row }) => row),
    summary: { totalCollected: paidRows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0), successfulCount: paidRows.length, refundedTotal, reviewRequired },
  }, { headers: { "Cache-Control": "no-store" } });
}
