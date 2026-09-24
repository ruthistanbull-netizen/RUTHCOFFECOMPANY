import { hash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { SearchDiagnostics, SearchGroup, SearchResponse } from "@ruth-commerce/contracts";
import {
  normalizeSearchText,
  paginateRankedSearchResults,
  rankSearchCandidates,
  type SearchCandidate,
} from "@ruth-commerce/commerce-core";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDER = "admin-payment-search-v1";
const ALLOWED_FIELDS = [
  "order_no",
  "customer_name",
  "customer_email",
  "customer_phone",
  "merchant_oid",
  "transaction_reference",
  "refund_reference",
] as const;

type PaymentSearchField = typeof ALLOWED_FIELDS[number];

type PaymentSearchEntity = {
  orderId: string;
  orderNo: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  totalAmount: number;
  currency: string;
  orderStatus: string;
  paymentStatus: string;
  paymentSource: "commerce_v2" | "legacy";
  merchantOids: string[];
  transactionReferences: string[];
  refundReferences: string[];
  createdAt: string;
};

function safePattern(value: string): string {
  return value.replace(/[,%()_*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function parseFields(value: string | null): PaymentSearchField[] {
  if (!value) return [...ALLOWED_FIELDS];
  const requested = value.split(",").map((field) => field.trim()).filter(Boolean);
  const allowed = requested.filter((field): field is PaymentSearchField => ALLOWED_FIELDS.includes(field as PaymentSearchField));
  return allowed.length > 0 ? [...new Set(allowed)] : [...ALLOWED_FIELDS];
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function queryHash(value: string): string {
  return hash("sha256", value, "hex");
}

function logDiagnostics(diagnostics: SearchDiagnostics, query: string, cursorUsed: boolean) {
  console.info("admin-payment-search", {
    correlationId: `admin-payment-search:${diagnostics.queryId}`,
    provider: diagnostics.provider,
    queryHash: queryHash(query),
    queryLength: query.length,
    resultCount: diagnostics.resultCount,
    zeroResult: diagnostics.zeroResult,
    searchedFields: diagnostics.searchedFields,
    durationMs: diagnostics.durationMs,
    cursorUsed,
  });
}


export async function GET(request: Request) {
  const startedAt = Date.now();
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const rawQuery = safePattern(url.searchParams.get("q") || "");
  const normalizedQuery = normalizeSearchText(rawQuery);
  const fields = parseFields(url.searchParams.get("fields"));
  const cursor = url.searchParams.get("cursor") || undefined;
  const limit = Math.min(20, Math.max(1, Math.trunc(Number(url.searchParams.get("limit") || 8))));
  const queryId = randomUUID();
  const { supabase } = auth;

  if (normalizedQuery.length < 2) {
    const diagnostics: SearchDiagnostics = {
      queryId,
      normalizedText: normalizedQuery,
      durationMs: Date.now() - startedAt,
      resultCount: 0,
      zeroResult: true,
      searchedFields: fields,
      provider: PROVIDER,
    };
    const response: SearchResponse<PaymentSearchEntity> = {
      groups: [{ key: "payments", label: "Ödemeler ve İadeler", results: [], total: 0 }],
      diagnostics,
    };
    return NextResponse.json({ ok: true, ...response }, { headers: { "Cache-Control": "no-store" } });
  }

  const pattern = `%${rawQuery}%`;
  const orderConditions = fields.flatMap((field) => {
    if (field === "order_no") return [`order_no.ilike.${pattern}`];
    if (field === "customer_name") return [`customer_name.ilike.${pattern}`];
    if (field === "customer_email") return [`customer_email.ilike.${pattern}`];
    if (field === "customer_phone") return [`customer_phone.ilike.${pattern}`];
    return [];
  });

  const emptyResult = { data: [] as any[], error: null as any };
  const [ordersResult, intentMatches, transactionMatches, refundMatches, refundAttemptMatches] = await Promise.all([
    orderConditions.length > 0
      ? supabase
          .from("orders")
          .select("id,order_no,customer_name,customer_email,customer_phone,total_amount,currency,status,payment_status,created_at")
          .or(orderConditions.join(","))
          .order("created_at", { ascending: false })
          .limit(80)
      : Promise.resolve(emptyResult),
    fields.includes("merchant_oid")
      ? supabase.from("payment_intents").select("id,order_id,merchant_oid").ilike("merchant_oid", pattern).limit(80)
      : Promise.resolve(emptyResult),
    fields.includes("transaction_reference")
      ? supabase.from("payment_transactions").select("payment_intent_id,provider_reference").ilike("provider_reference", pattern).limit(80)
      : Promise.resolve(emptyResult),
    fields.includes("refund_reference")
      ? supabase.from("payment_refunds").select("id,order_id,payment_intent_id,provider_reference").ilike("provider_reference", pattern).limit(80)
      : Promise.resolve(emptyResult),
    fields.includes("refund_reference")
      ? supabase.from("payment_refund_attempts").select("refund_id,provider_reference").ilike("provider_reference", pattern).limit(80)
      : Promise.resolve(emptyResult),
  ]);

  const initialError = ordersResult.error || intentMatches.error || transactionMatches.error || refundMatches.error || refundAttemptMatches.error;
  if (initialError) {
    return NextResponse.json({ ok: false, error: initialError.message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const matchedRefundIds = uniqueStrings((refundAttemptMatches.data || []).map((row: any) => row.refund_id));
  const extraRefundsResult = matchedRefundIds.length > 0
    ? await supabase.from("payment_refunds").select("id,order_id,payment_intent_id,provider_reference").in("id", matchedRefundIds)
    : emptyResult;
  if (extraRefundsResult.error) {
    return NextResponse.json({ ok: false, error: extraRefundsResult.error.message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const matchedRefunds = [...(refundMatches.data || []), ...(extraRefundsResult.data || [])];
  const referencedIntentIds = uniqueStrings([
    ...(transactionMatches.data || []).map((row: any) => row.payment_intent_id),
    ...matchedRefunds.map((row: any) => row.payment_intent_id),
  ]);
  const referencedIntentsResult = referencedIntentIds.length > 0
    ? await supabase.from("payment_intents").select("id,order_id,merchant_oid").in("id", referencedIntentIds)
    : emptyResult;
  if (referencedIntentsResult.error) {
    return NextResponse.json({ ok: false, error: referencedIntentsResult.error.message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const candidateOrderIds = new Set<string>();
  for (const order of ordersResult.data || []) candidateOrderIds.add(String(order.id));
  for (const intent of [...(intentMatches.data || []), ...(referencedIntentsResult.data || [])]) {
    if (intent.order_id) candidateOrderIds.add(String(intent.order_id));
  }
  for (const refund of matchedRefunds) {
    if (refund.order_id) candidateOrderIds.add(String(refund.order_id));
  }

  const directOrders = new Map<string, any>((ordersResult.data || []).map((order: any) => [String(order.id), order]));
  const missingOrderIds = [...candidateOrderIds].filter((id) => !directOrders.has(id));
  if (missingOrderIds.length > 0) {
    const missingOrders = await supabase
      .from("orders")
      .select("id,order_no,customer_name,customer_email,customer_phone,total_amount,currency,status,payment_status,created_at")
      .in("id", missingOrderIds)
      .limit(100);
    if (missingOrders.error) {
      return NextResponse.json({ ok: false, error: missingOrders.error.message }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
    for (const order of missingOrders.data || []) directOrders.set(String(order.id), order);
  }

  const orderIds = [...directOrders.keys()];
  const allIntentsResult = orderIds.length > 0
    ? await supabase
        .from("payment_intents")
        .select("id,order_id,merchant_oid,status,amount_kurus,created_at")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false })
        .limit(300)
    : emptyResult;
  if (allIntentsResult.error) {
    return NextResponse.json({ ok: false, error: allIntentsResult.error.message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const intentIds = uniqueStrings((allIntentsResult.data || []).map((intent: any) => intent.id));
  const [allTransactionsResult, allRefundsResult] = await Promise.all([
    intentIds.length > 0
      ? supabase.from("payment_transactions").select("payment_intent_id,provider_reference").in("payment_intent_id", intentIds).limit(500)
      : Promise.resolve(emptyResult),
    orderIds.length > 0
      ? supabase.from("payment_refunds").select("id,order_id,payment_intent_id,provider_reference").in("order_id", orderIds).limit(500)
      : Promise.resolve(emptyResult),
  ]);
  const relatedError = allTransactionsResult.error || allRefundsResult.error;
  if (relatedError) {
    return NextResponse.json({ ok: false, error: relatedError.message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const refundIds = uniqueStrings((allRefundsResult.data || []).map((refund: any) => refund.id));
  const allRefundAttemptsResult = refundIds.length > 0
    ? await supabase.from("payment_refund_attempts").select("refund_id,provider_reference").in("refund_id", refundIds).limit(500)
    : emptyResult;
  if (allRefundAttemptsResult.error) {
    return NextResponse.json({ ok: false, error: allRefundAttemptsResult.error.message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const intentById = new Map((allIntentsResult.data || []).map((intent: any) => [String(intent.id), intent]));
  const intentsByOrder = new Map<string, any[]>();
  for (const intent of allIntentsResult.data || []) {
    const orderId = String(intent.order_id || "");
    if (!orderId) continue;
    intentsByOrder.set(orderId, [...(intentsByOrder.get(orderId) || []), intent]);
  }

  const transactionReferencesByOrder = new Map<string, string[]>();
  for (const transaction of allTransactionsResult.data || []) {
    const orderId = String(intentById.get(String(transaction.payment_intent_id))?.order_id || "");
    if (!orderId || !transaction.provider_reference) continue;
    transactionReferencesByOrder.set(orderId, uniqueStrings([...(transactionReferencesByOrder.get(orderId) || []), transaction.provider_reference]));
  }

  const refundById = new Map((allRefundsResult.data || []).map((refund: any) => [String(refund.id), refund]));
  const refundReferencesByOrder = new Map<string, string[]>();
  for (const refund of allRefundsResult.data || []) {
    const orderId = String(refund.order_id || intentById.get(String(refund.payment_intent_id))?.order_id || "");
    if (!orderId || !refund.provider_reference) continue;
    refundReferencesByOrder.set(orderId, uniqueStrings([...(refundReferencesByOrder.get(orderId) || []), refund.provider_reference]));
  }
  for (const attempt of allRefundAttemptsResult.data || []) {
    const refund = refundById.get(String(attempt.refund_id));
    const orderId = String(refund?.order_id || intentById.get(String(refund?.payment_intent_id))?.order_id || "");
    if (!orderId || !attempt.provider_reference) continue;
    refundReferencesByOrder.set(orderId, uniqueStrings([...(refundReferencesByOrder.get(orderId) || []), attempt.provider_reference]));
  }

  const candidates: Array<SearchCandidate<PaymentSearchEntity>> = [...directOrders.values()].map((order: any) => {
    const intents = intentsByOrder.get(String(order.id)) || [];
    const merchantOids = uniqueStrings(intents.map((intent) => intent.merchant_oid));
    const transactionReferences = transactionReferencesByOrder.get(String(order.id)) || [];
    const refundReferences = refundReferencesByOrder.get(String(order.id)) || [];
    const entity: PaymentSearchEntity = {
      orderId: String(order.id),
      orderNo: String(order.order_no || ""),
      customerName: String(order.customer_name || "İsimsiz müşteri"),
      customerEmail: order.customer_email || null,
      customerPhone: order.customer_phone || null,
      totalAmount: Number(order.total_amount || 0),
      currency: String(order.currency || "TRY"),
      orderStatus: String(order.status || "draft"),
      paymentStatus: String(order.payment_status || "pending"),
      paymentSource: intents.length > 0 ? "commerce_v2" : "legacy",
      merchantOids,
      transactionReferences,
      refundReferences,
      createdAt: String(order.created_at || ""),
    };

    return {
      id: entity.orderId,
      entityType: "payment_order",
      title: entity.orderNo,
      subtitle: `${entity.customerName} · ${entity.customerEmail || entity.customerPhone || "iletişim bilgisi yok"}`,
      createdAt: entity.createdAt,
      entity,
      fields: [
        ...(fields.includes("order_no") ? [{ field: "order_no", value: entity.orderNo, weight: 320 }] : []),
        ...(fields.includes("customer_name") ? [{ field: "customer_name", value: entity.customerName, weight: 170 }] : []),
        ...(fields.includes("customer_email") ? [{ field: "customer_email", value: entity.customerEmail, weight: 230 }] : []),
        ...(fields.includes("customer_phone") ? [{ field: "customer_phone", value: entity.customerPhone, weight: 220 }] : []),
        ...(fields.includes("merchant_oid") ? merchantOids.map((value) => ({ field: "merchant_oid", value, weight: 290 })) : []),
        ...(fields.includes("transaction_reference") ? transactionReferences.map((value) => ({ field: "transaction_reference", value, weight: 280 })) : []),
        ...(fields.includes("refund_reference") ? refundReferences.map((value) => ({ field: "refund_reference", value, weight: 280 })) : []),
      ],
    };
  });

  const ranked = rankSearchCandidates(normalizedQuery, candidates);
  const page = paginateRankedSearchResults(ranked, { limit, cursor });
  const group: SearchGroup<PaymentSearchEntity> = {
    key: "payments",
    label: "Ödemeler ve İadeler",
    results: page.results,
    total: ranked.length,
    nextCursor: page.nextCursor,
  };
  const diagnostics: SearchDiagnostics = {
    queryId,
    normalizedText: normalizedQuery,
    durationMs: Date.now() - startedAt,
    resultCount: ranked.length,
    zeroResult: ranked.length === 0,
    searchedFields: fields,
    provider: PROVIDER,
  };

  logDiagnostics(diagnostics, normalizedQuery, Boolean(cursor));

  const response: SearchResponse<PaymentSearchEntity> = { groups: [group], diagnostics };
  return NextResponse.json({ ok: true, ...response }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
