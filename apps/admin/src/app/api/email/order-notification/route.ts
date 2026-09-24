import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { defaultOrderHtml } from "@/lib/gmail";
import { getActiveEmailIntegration, sendEmailWithIntegration } from "@/lib/mailDelivery";
import { sendOrderLifecycleEmail } from "@/lib/orderLifecycleEmails";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase, profile } = auth;
  const body = await request.json();
  const orderId = clean(body.order_id);
  const requestedStatus = clean(body.status);
  const type = clean(body.type) === "order_created" ? "order_created" : "order_shipped";

  if (!orderId) return NextResponse.json({ ok: false, error: "Sipariş id yok." }, { status: 400 });

  if (requestedStatus || type === "order_shipped") {
    const lifecycleResult = await sendOrderLifecycleEmail(
      supabase,
      orderId,
      requestedStatus || "shipped",
    );
    if (!lifecycleResult.ok) {
      return NextResponse.json(
        { ok: false, error: lifecycleResult.error || "Sipariş durum e-postası gönderilemedi." },
        { status: 400 },
      );
    }
    if (lifecycleResult.skipped === "no_email") {
      return NextResponse.json({ ok: false, error: "Müşterinin e-posta adresi yok." }, { status: 400 });
    }
    if (lifecycleResult.skipped === "no_integration") {
      return NextResponse.json({ ok: false, error: "Aktif e-posta entegrasyonu bulunamadı." }, { status: 400 });
    }
    if (lifecycleResult.skipped === "status") {
      return NextResponse.json({ ok: false, error: "Bu sipariş durumu için e-posta şablonu bulunamadı." }, { status: 400 });
    }
    return NextResponse.json(lifecycleResult);
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, customer_email, cargo_company, cargo_tracking_no")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) return NextResponse.json({ ok: false, error: orderError.message }, { status: 400 });
  if (!order) return NextResponse.json({ ok: false, error: "Sipariş bulunamadı." }, { status: 404 });
  if (!order.customer_email) return NextResponse.json({ ok: false, error: "Müşteri e-postası yok." }, { status: 400 });

  const integration = await getActiveEmailIntegration(supabase, profile.id);
  if (!integration) return NextResponse.json({ ok: false, error: "Önce Brevo veya Gmail mail sağlayıcısını bağla." }, { status: 400 });

  const vars = {
    customer_name: order.customer_name || "",
    order_no: order.order_no || "",
    cargo_company: order.cargo_company || "",
    cargo_tracking_no: order.cargo_tracking_no || "",
  };
  const subject = `Siparişini aldık - ${order.order_no}`;
  const html = defaultOrderHtml("order_created", vars);

  try {
    const sent = await sendEmailWithIntegration(supabase, integration, {
      to: order.customer_email,
      subject,
      html,
    });

    await supabase.from("email_logs").insert({
      provider: sent.provider,
      profile_id: profile.id,
      order_id: order.id,
      to_email: order.customer_email,
      subject,
      template_key: type,
      status: "sent",
      gmail_message_id: sent.id,
      sent_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, provider: sent.provider, messageId: sent.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sipariş e-postası gönderilemedi.";
    await supabase.from("email_logs").insert({
      provider: integration.provider,
      profile_id: profile.id,
      order_id: order.id,
      to_email: order.customer_email,
      subject,
      template_key: type,
      status: "failed",
      error_message: message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
