import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { transitionAdminOrder } from "@/lib/orderStateTransitions";
import { noStoreHeaders, revalidateWebsite } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function transitionErrorStatus(message: string) {
  if (/not found/i.test(message)) return 404;
  if (/another operation|reload and retry/i.test(message)) return 409;
  return 400;
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const orderId = String(body.order_id || body.id || "").trim();
  const requestedStatus = String(body.next_status || body.status || "").trim();

  if (!orderId || !requestedStatus) {
    return NextResponse.json(
      { ok: false, error: "Sipariş id ve hedef durum gerekli." },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  const { data: current, error: currentError } = await auth.supabase
    .from("orders")
    .select(`
      id,
      order_no,
      status,
      payment_status,
      shipping_status,
      shipping_provider,
      cargo_company,
      cargo_tracking_no,
      cargo_tracking_url,
      state_version
    `)
    .eq("id", orderId)
    .single();

  if (currentError || !current) {
    return NextResponse.json(
      { ok: false, error: currentError?.message || "Sipariş bulunamadı." },
      { status: 404, headers: noStoreHeaders() },
    );
  }

  if (body.expected_version != null && Number(body.expected_version) !== Number(current.state_version || 0)) {
    return NextResponse.json(
      { ok: false, error: "Sipariş başka bir işlem tarafından değiştirildi. Sayfayı yenileyip tekrar dene." },
      { status: 409, headers: noStoreHeaders() },
    );
  }

  const result = await transitionAdminOrder({
    supabase: auth.supabase,
    order: current,
    requestedStatus,
    actorId: String(auth.profile?.id || auth.user.id),
    reason: body.reason ? String(body.reason) : null,
    source: "admin",
    correlationId: String(body.correlation_id || request.headers.get("x-correlation-id") || crypto.randomUUID()),
    idempotencyKey: body.idempotency_key ? String(body.idempotency_key) : undefined,
    cargoCompany: body.cargo_company ? String(body.cargo_company) : null,
    trackingNumber: body.cargo_tracking_no ? String(body.cargo_tracking_no) : null,
    trackingUrl: body.cargo_tracking_url ? String(body.cargo_tracking_url) : null,
    metadata: {
      route: "/api/orders/transition",
      user_agent: request.headers.get("user-agent"),
    },
  });

  if (result.error) {
    return NextResponse.json(
      { ok: false, error: result.error.message, correlation_id: result.correlationId },
      { status: transitionErrorStatus(result.error.message), headers: noStoreHeaders() },
    );
  }

  const revalidate = result.changed
    ? await revalidateWebsite({ source: "admin-order-transition" })
    : { ok: true, message: "Durum zaten güncel." };

  return NextResponse.json(
    {
      ok: true,
      changed: result.changed,
      order: result.data,
      correlation_id: result.correlationId || null,
      revalidate,
      warning: revalidate.ok ? null : revalidate.message,
    },
    { headers: noStoreHeaders() },
  );
}
