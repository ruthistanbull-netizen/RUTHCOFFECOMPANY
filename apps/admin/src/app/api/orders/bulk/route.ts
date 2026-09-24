import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canonicalOrderState, transitionAdminOrder } from "@/lib/orderStateTransitions";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body: Record<string, unknown> = await request.json().catch(() => ({}));
  const rawIds: unknown[] = Array.isArray(body.ids) ? body.ids : [];
  const ids: string[] = Array.from(
    new Set<string>(
      rawIds
        .map((value: unknown) => clean(value))
        .filter((value: string): value is string => value.length > 0),
    ),
  ).slice(0, 500);
  if (!ids.length) {
    return NextResponse.json({ ok: false, error: "Sipariş seçilmedi." }, { status: 400, headers: noStoreHeaders() });
  }

  const action = clean(body.action);
  if (action === "status") {
    const requestedStatus = clean(body.status);
    if (!canonicalOrderState(requestedStatus)) {
      return NextResponse.json({ ok: false, error: "Geçersiz sipariş durumu." }, { status: 400, headers: noStoreHeaders() });
    }

    const { data: orders, error: fetchError } = await auth.supabase
      .from("orders")
      .select(`
        id,
        order_no,
        status,
        payment_status,
        state_version,
        shipping_status,
        shipping_provider,
        cargo_company,
        cargo_tracking_no,
        cargo_tracking_url
      `)
      .in("id", ids);

    if (fetchError) {
      return NextResponse.json({ ok: false, error: fetchError.message }, { status: 400, headers: noStoreHeaders() });
    }

    const actorId = String(auth.profile?.id || auth.user.id);
    const correlationId = String(request.headers.get("x-correlation-id") || crypto.randomUUID());
    const results = await Promise.all((orders || []).map(async (order) => {
      const transition = await transitionAdminOrder({
        supabase: auth.supabase,
        order,
        requestedStatus,
        actorId,
        reason: body.reason ? clean(body.reason) : null,
        source: "admin-orders-bulk",
        correlationId,
        idempotencyKey: `admin-bulk-order-transition:${correlationId}:${order.id}:${order.state_version || 0}:${requestedStatus}`,
        cargoCompany: order.cargo_company,
        trackingNumber: order.cargo_tracking_no,
        trackingUrl: order.cargo_tracking_url,
        metadata: { route: "/api/orders/bulk", batch_size: ids.length },
      });
      return {
        id: order.id,
        order_no: order.order_no,
        ok: !transition.error,
        changed: transition.changed,
        error: transition.error?.message || null,
      };
    }));

    const failed = results.filter((item) => !item.ok);
    const updated = results.filter((item) => item.ok && item.changed).length;
    const unchanged = results.filter((item) => item.ok && !item.changed).length;
    const revalidate = updated > 0
      ? await revalidateWebsite({ source: "admin-orders-bulk-status" })
      : { ok: true, message: "Durumlar zaten güncel." };

    return NextResponse.json({
      ok: failed.length === 0,
      partial: failed.length > 0 && failed.length < results.length,
      updated,
      unchanged,
      failed: failed.length,
      failures: failed.slice(0, 25),
      correlation_id: correlationId,
      revalidate,
      warning: revalidate.ok ? null : revalidate.message,
    }, { status: failed.length === results.length ? 400 : 200, headers: noStoreHeaders() });
  }

  if (action === "cargo_company") {
    const cargoCompany = clean(body.cargo_company);
    if (!cargoCompany) {
      return NextResponse.json({ ok: false, error: "Kargo firması yazılmalı." }, { status: 400, headers: noStoreHeaders() });
    }

    const { data, error } = await auth.supabase
      .from("orders")
      .update({ cargo_company: cargoCompany, updated_at: new Date().toISOString() })
      .in("id", ids)
      .select("id");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
    }

    const revalidate = await revalidateWebsite({ source: "admin-orders-bulk-cargo_company" });
    return NextResponse.json({
      ok: true,
      updated: data?.length || 0,
      revalidate,
      warning: revalidate.ok ? null : revalidate.message,
    }, { headers: noStoreHeaders() });
  }

  return NextResponse.json({ ok: false, error: "Toplu işlem seçilmedi." }, { status: 400, headers: noStoreHeaders() });
}
