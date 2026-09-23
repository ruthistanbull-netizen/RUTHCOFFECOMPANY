import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applyRange, getDateRange } from "@/lib/ranges";
import { isHistoricalImportedOrder, normalizeOrderStatus } from "@/lib/statusLabels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type QueryError = { message: string } | null;
type QueryResult<T> = { data: T[] | null; error: QueryError; count?: number | null };

type DashboardCheckoutDraft = {
  id: string;
  status?: string | null;
  order_id?: string | null;
  customer?: unknown;
  attribution?: unknown;
};

type DashboardOrder = {
  id: string;
  order_no?: string | null;
  customer_name?: string | null;
  total_amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  payment_status?: string | null;
  created_at?: string | null;
  imported_source?: string | null;
  customer_note?: string | null;
  admin_note?: string | null;
  shipping_status?: string | null;
  shipping_error?: string | null;
  basit_kargo_order_id?: string | null;
  basit_kargo_barcode?: string | null;
  cargo_tracking_no?: string | null;
  purchase_session_id?: string | null;
};

function testSource(order: Pick<DashboardOrder, "imported_source" | "customer_note" | "admin_note">) {
  const source = String(order.imported_source || "").trim().toLocaleLowerCase("tr-TR");
  const note = `${String(order.customer_note || "")} ${String(order.admin_note || "")}`.toLocaleLowerCase("tr-TR");
  return source === "test" || source.includes("sandbox") || source.includes("demo") || note.includes("test sipariş") || note.includes("test siparis");
}

function paid(order: Pick<DashboardOrder, "payment_status" | "status">) {
  const payment = String(order.payment_status || "").toLocaleLowerCase("tr-TR");
  const status = String(order.status || "").toLocaleLowerCase("tr-TR");
  return ["paid", "succeeded", "success"].includes(payment) || ["paid", "completed"].includes(status);
}

function isVisibleCartDraft(draft: DashboardCheckoutDraft) {
  const status = String(draft.status || "").toLocaleLowerCase("tr-TR");
  if (["superseded", "converted"].includes(status)) return false;
  if (status === "paid" || Boolean(draft.order_id)) return true;

  const customer = draft.customer && typeof draft.customer === "object" && !Array.isArray(draft.customer)
    ? draft.customer as Record<string, unknown>
    : {};
  const email = String(customer.email || "").trim().toLocaleLowerCase("tr-TR");
  const phoneDigits = String(customer.phone || "").replace(/\D/g, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phoneDigits.length >= 10;
}

function checkoutDraftSessionId(draft: DashboardCheckoutDraft) {
  const attribution = draft.attribution && typeof draft.attribution === "object" && !Array.isArray(draft.attribution)
    ? draft.attribution as Record<string, unknown>
    : {};
  return String(attribution.session_id || "").trim();
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function rows<T>(query: PromiseLike<QueryResult<T>>, label: string, warnings: string[], required = false): Promise<T[]> {
  try {
    const result = await query;
    if (result.error) {
      if (required) throw new Error(`${label}: ${result.error.message}`);
      warnings.push(`${label}: ${result.error.message}`);
      return [];
    }
    return Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : `${label} alınamadı.`;
    if (required) throw new Error(message);
    warnings.push(message);
    return [];
  }
}

async function countRows(query: PromiseLike<QueryResult<unknown>>, label: string, warnings: string[]) {
  try {
    const result = await query;
    if (result.error) {
      warnings.push(`${label}: ${result.error.message}`);
      return 0;
    }
    return Number(result.count || 0);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : `${label} alınamadı.`);
    return 0;
  }
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const url = new URL(request.url);
  const range = url.searchParams.get("range") || "today";
  const bounds = getDateRange(range);
  const warnings: string[] = [];

  try {
    const selectedOrdersPromise = rows<DashboardOrder>(
      (applyRange(
        supabase.from("orders").select("id,order_no,customer_name,total_amount,currency,status,payment_status,created_at,imported_source,customer_note,admin_note,shipping_status,shipping_error,basit_kargo_order_id,basit_kargo_barcode,cargo_tracking_no,purchase_session_id"),
        "created_at",
        range,
      ) as any).order("created_at", { ascending: false }),
      "Sipariş özeti",
      warnings,
      true,
    );

    const analyticsPromise = Promise.all([
      rows<{ session_id: string | null }>(
        (applyRange(
          supabase.from("analytics_events").select("session_id").eq("event_name", "session_start"),
          "created_at",
          range,
        ) as any).limit(5000),
        "Oturum olayları",
        warnings,
      ),
      rows<{ session_id: string | null }>(
        (applyRange(
          supabase.from("analytics_events").select("session_id").in("event_name", ["cart_created", "cart_add"]),
          "created_at",
          range,
        ) as any).limit(5000),
        "Sepet olayları",
        warnings,
      ),
      rows<{ session_id: string | null }>(
        (applyRange(
          supabase.from("analytics_events").select("session_id").in("event_name", ["checkout_view", "payment_start"]),
          "created_at",
          range,
        ) as any).limit(5000),
        "Ödeme adımı olayları",
        warnings,
      ),
    ]).then(([sessionRows, cartRows, checkoutRows]) => {
      const uniqueSessions = (rows: Array<{ session_id: string | null }>) =>
        new Set(rows.map((row) => String(row.session_id || "").trim()).filter(Boolean)).size;
      return {
        data: [{
          total_sessions: uniqueSessions(sessionRows),
          cart_sessions: uniqueSessions(cartRows),
          checkout_sessions: uniqueSessions(checkoutRows),
        }],
        error: null as QueryError,
      };
    }).catch((error) => ({
      data: null,
      error: { message: error instanceof Error ? error.message : "Analitik özeti alınamadı." },
    }));

    const [
      selectedOrders,
      analyticsResult,
      returnsCount,
      openReturnsCount,
      productCount,
      checkoutDrafts,
      paymentIntents,
      paymentRows,
      shippingWebhookRows,
      shippingDeadLetterCount,
    ] = await Promise.all([
      selectedOrdersPromise,
      analyticsPromise,
      countRows(applyRange(supabase.from("returns_exchanges").select("id", { count: "exact", head: true }), "created_at", range) as any, "İade/değişim vakaları", warnings),
      countRows(supabase.from("returns_exchanges").select("id", { count: "exact", head: true }).in("status", ["open", "approved"]) as any, "Açık iade/değişim vakaları", warnings),
      countRows(supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active") as any, "Aktif ürünler", warnings),
      rows<DashboardCheckoutDraft>(
        applyRange(supabase.from("checkout_drafts").select("id,status,order_id,customer,attribution"), "created_at", range) as any,
        "Sepet taslakları",
        warnings,
      ),
      rows<{ order_id: string | null; amount_kurus: number | null }>(applyRange(supabase.from("payment_intents").select("order_id,amount_kurus").eq("status", "succeeded").not("succeeded_at", "is", null) as any, "succeeded_at", range) as any, "Başarılı ödeme niyetleri", warnings),
      rows<{ order_id: string | null; amount: number | null }>(applyRange(supabase.from("payments").select("order_id,amount").in("status", ["paid", "succeeded"]).not("paid_at", "is", null) as any, "paid_at", range) as any, "Başarılı ödemeler", warnings),
      rows<{ status: string | null }>(supabase.from("shipping_webhook_inbox").select("status").in("status", ["received", "processing", "failed", "dead_letter"]).limit(1000) as any, "Kargo webhook kuyruğu", warnings),
      countRows(supabase.from("commerce_dead_letters").select("id", { count: "exact", head: true }).eq("source", "shipping_webhook").in("status", ["open", "retrying"]) as any, "Kargo dead-letter kuyruğu", warnings),
    ]);

    const visibleCartDrafts = checkoutDrafts.filter(isVisibleCartDraft);
    const visibleDraftKeys = new Set(
      visibleCartDrafts.map((draft) => checkoutDraftSessionId(draft) || `draft:${draft.id}`),
    );
    const visibleDraftSessionIds = [...new Set(
      visibleCartDrafts.map(checkoutDraftSessionId).filter(Boolean),
    )];
    const matchingCartEvents = visibleDraftSessionIds.length
      ? await rows<{ session_id: string | null }>(
          applyRange(
            supabase
              .from("analytics_events")
              .select("session_id")
              .in("event_name", ["cart_created", "cart_add"])
              .in("session_id", visibleDraftSessionIds),
            "created_at",
            range,
          ).limit(1000) as any,
          "Sepet taslak eşleşmeleri",
          warnings,
        )
      : [];
    const matchedDraftSessions = new Set(
      matchingCartEvents.map((event) => String(event.session_id || "").trim()).filter(Boolean),
    );
    const untrackedVisibleCartDraftCount = Math.max(0, visibleDraftKeys.size - matchedDraftSessions.size);

    const analyticsRow = !analyticsResult.error && Array.isArray(analyticsResult.data)
      ? analyticsResult.data[0] as { total_sessions?: number | string | null; cart_sessions?: number | string | null; checkout_sessions?: number | string | null } | undefined
      : undefined;

    let sessionCount = number(analyticsRow?.total_sessions);
    let cartCount = number(analyticsRow?.cart_sessions);
    let checkoutReached = number(analyticsRow?.checkout_sessions);

    if (analyticsResult.error || !analyticsRow) {
      if (analyticsResult.error) warnings.push(`Analitik özeti: ${analyticsResult.error.message}`);
      const [sessionStartCount, cartCreatedCount, checkoutEventCount] = await Promise.all([
        countRows(applyRange(supabase.from("analytics_events").select("id", { count: "exact", head: true }).eq("event_name", "session_start"), "created_at", range) as any, "Oturum olayları", warnings),
        countRows(applyRange(supabase.from("analytics_events").select("id", { count: "exact", head: true }).in("event_name", ["cart_created", "cart_add"]), "created_at", range) as any, "Sepet olayları", warnings),
        countRows(applyRange(supabase.from("analytics_events").select("id", { count: "exact", head: true }).in("event_name", ["checkout_view", "payment_start"]), "created_at", range) as any, "Ödeme adımı olayları", warnings),
      ]);
      sessionCount = sessionStartCount;
      cartCount = cartCreatedCount;
      checkoutReached = checkoutEventCount;
    }

    sessionCount = Math.max(0, sessionCount);
    // A checkout draft remains a normal cart. Only drafts whose canonical
    // session is already present in analytics are deduplicated.
    cartCount = Math.max(0, cartCount) + untrackedVisibleCartDraftCount;
    checkoutReached = Math.max(0, checkoutReached, checkoutDrafts.length);

    const reportOrders = selectedOrders.filter((order) => !testSource(order));
    const paidReportOrders = reportOrders.filter(paid);
    const paidReportIds = new Set(paidReportOrders.map((order) => String(order.id)));

    const grossByOrderId = new Map<string, number>();
    for (const intent of paymentIntents) {
      const orderId = String(intent.order_id || "");
      if (!orderId || !paidReportIds.has(orderId) || grossByOrderId.has(orderId)) continue;
      grossByOrderId.set(orderId, Math.max(0, number(intent.amount_kurus)) / 100);
    }
    for (const payment of paymentRows) {
      const orderId = String(payment.order_id || "");
      if (!orderId || !paidReportIds.has(orderId) || grossByOrderId.has(orderId)) continue;
      grossByOrderId.set(orderId, Math.max(0, number(payment.amount)));
    }
    for (const order of paidReportOrders) {
      const orderId = String(order.id);
      if (!grossByOrderId.has(orderId)) grossByOrderId.set(orderId, Math.max(0, number(order.total_amount)));
    }

    const paidOrderIds = [...paidReportIds];
    const paymentRefunds = paidOrderIds.length
      ? await rows<{ order_id: string | null; amount_kurus: number | null }>(
          supabase.from("payment_refunds").select("order_id,amount_kurus").in("order_id", paidOrderIds).in("status", ["succeeded", "success", "completed", "refunded"]) as any,
          "Tamamlanan ödeme iadeleri",
          warnings,
        )
      : [];

    const refundsByOrderId = new Map<string, number>();
    for (const refund of paymentRefunds) {
      const orderId = String(refund.order_id || "");
      if (!orderId || !paidReportIds.has(orderId)) continue;
      refundsByOrderId.set(orderId, (refundsByOrderId.get(orderId) || 0) + Math.max(0, number(refund.amount_kurus)) / 100);
    }

    const grossRevenue = Number([...grossByOrderId.values()].reduce((sum, amount) => sum + amount, 0).toFixed(2));
    let refundedTotal = 0;
    for (const [orderId, gross] of grossByOrderId.entries()) {
      refundedTotal += Math.min(gross, Math.max(0, refundsByOrderId.get(orderId) || 0));
    }
    refundedTotal = Number(refundedTotal.toFixed(2));
    const netRevenue = Number(Math.max(0, grossRevenue - refundedTotal).toFixed(2));
    const paidOrdersCount = paidReportOrders.length;

    const purchaseSessionIds = new Set(
      paidReportOrders
        .map((order) => String(order.purchase_session_id || "").trim())
        .filter(Boolean),
    );
    const unattributedPaidOrders = paidReportOrders.filter((order) => !String(order.purchase_session_id || "").trim()).length;
    const purchaseSessionsCount = purchaseSessionIds.size + unattributedPaidOrders;

    const normalizedRecentOrders = reportOrders
      .slice(0, 8)
      .map((order) => ({ ...order, status: normalizeOrderStatus(order.status, order) }));

    const operationalOrders = reportOrders.filter((order) => !isHistoricalImportedOrder(order));
    const normalizedOperational = operationalOrders.map((order) => ({ order, status: normalizeOrderStatus(order.status, order) }));
    const orderExceptions = operationalOrders.filter((order) => {
      const shipping = String(order.shipping_status || "").toLocaleLowerCase("tr-TR");
      return Boolean(order.shipping_error) || shipping === "exception" || String(order.status || "").toLocaleLowerCase("tr-TR") === "return_requested";
    }).length;

    const waitingWebhooks = shippingWebhookRows.filter((row) => ["received", "processing"].includes(String(row.status || ""))).length;
    const failedWebhooks = shippingWebhookRows.filter((row) => row.status === "failed").length;
    const inboxDeadLetters = shippingWebhookRows.filter((row) => row.status === "dead_letter").length;
    const deadLetters = Math.max(inboxDeadLetters, shippingDeadLetterCount);
    const shippingCounts = { orderExceptions, waitingWebhooks, failedWebhooks, deadLetters };

    const operationCounts = {
      newOrders: normalizedOperational.filter(({ order, status }) => status === "created" && paid(order)).length,
      preparing: normalizedOperational.filter(({ status }) => status === "preparing").length,
      ready: normalizedOperational.filter(({ status }) => status === "ready").length,
      shippingAttention: orderExceptions + failedWebhooks + deadLetters,
    };

    const reviewRequired = reportOrders.filter((order) => ["pending", "waiting", "requires_action", "failed", "rejected"].includes(String(order.payment_status || "").toLocaleLowerCase("tr-TR"))).length;
    const paymentSummary = { totalCollected: grossRevenue, successfulCount: paidOrdersCount, refundedTotal, reviewRequired };
    const conversion = {
      cartRate: percent(cartCount, sessionCount),
      checkoutRate: percent(checkoutReached, sessionCount),
      purchaseRate: percent(purchaseSessionsCount, sessionCount),
      carts: cartCount,
      checkoutReached,
      paidOrders: purchaseSessionsCount,
      purchaseSessions: purchaseSessionsCount,
      orderCount: paidOrdersCount,
      sessions: sessionCount,
    };

    return NextResponse.json({
      ok: true,
      summary: {
        orders: paidOrdersCount,
        paidOrders: paidOrdersCount,
        revenue: netRevenue,
        grossRevenue,
        refundedTotal,
        sessions: sessionCount,
        carts: cartCount,
        checkoutReached,
        returns: returnsCount,
        products: productCount,
        conversionRate: conversion.purchaseRate,
        conversion,
      },
      paymentSummary,
      shippingCounts,
      operationCounts,
      openReturns: openReturnsCount,
      recentOrders: normalizedRecentOrders,
      dataQuality: {
        warningCount: warnings.length,
        warnings,
        reportOrderCount: reportOrders.length,
        operationOrderCount: operationalOrders.length,
        attributedPurchaseSessionCount: purchaseSessionIds.size,
        generatedAt: new Date().toISOString(),
      },
    }, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        "Server-Timing": `summary;dur=${Date.now() - startedAt}`,
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Kontrol merkezi verileri doğrulanamadı.",
      warnings,
    }, {
      status: 500,
      headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
    });
  }
}
