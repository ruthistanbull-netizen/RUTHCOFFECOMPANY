import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { renderTemplate } from "@/lib/gmail";
import { getActiveEmailIntegration, sendEmailWithIntegration } from "@/lib/mailDelivery";

export const runtime = "nodejs";

const SERVICE_TEMPLATE_KEYS = new Set(["order_created", "order_shipped"]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase, profile } = auth;
  const body = await request.json();

  const to = clean(body.to).toLocaleLowerCase("tr-TR");
  const subject = clean(body.subject);
  const rawHtml = clean(body.html);
  const templateKey = clean(body.template_key);
  const variables = body.variables && typeof body.variables === "object" ? body.variables : {};
  const orderId = clean(variables.order_id || body.order_id);

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ ok: false, error: "Geçerli alıcı e-posta gerekli." }, { status: 400 });
  }
  if (!subject) return NextResponse.json({ ok: false, error: "Konu gerekli." }, { status: 400 });
  if (!SERVICE_TEMPLATE_KEYS.has(templateKey)) {
    return NextResponse.json({
      ok: false,
      error: "Bu uç yalnız sipariş hizmet e-postaları için kullanılabilir. Pazarlama gönderimlerinde izin kontrollü toplu gönderim ekranını kullan.",
    }, { status: 400 });
  }
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "Hizmet e-postası için sipariş id gerekli." }, { status: 400 });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, customer_email")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order) {
    return NextResponse.json({ ok: false, error: orderError?.message || "Sipariş bulunamadı." }, { status: 404 });
  }
  if (clean(order.customer_email).toLocaleLowerCase("tr-TR") !== to) {
    return NextResponse.json({ ok: false, error: "Alıcı adresi siparişteki müşteri e-postasıyla eşleşmiyor." }, { status: 400 });
  }

  const integration = await getActiveEmailIntegration(supabase, profile.id);
  if (!integration) return NextResponse.json({ ok: false, error: "Önce Gmail hesabını bağla." }, { status: 400 });

  const { data: template, error: templateError } = await supabase
    .from("email_templates")
    .select("subject, html")
    .eq("template_key", templateKey)
    .eq("is_active", true)
    .maybeSingle();
  if (templateError || !template) {
    return NextResponse.json({ ok: false, error: templateError?.message || "Aktif hizmet e-posta şablonu bulunamadı." }, { status: 400 });
  }

  const finalSubject = renderTemplate(template.subject || subject, variables);
  const html = renderTemplate(template.html || rawHtml, variables);
  if (!html) return NextResponse.json({ ok: false, error: "E-posta içeriği gerekli." }, { status: 400 });

  const { data: existing } = await supabase
    .from("email_logs")
    .select("id")
    .eq("order_id", orderId)
    .eq("template_key", templateKey)
    .eq("status", "sent")
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    return NextResponse.json({ ok: true, skipped: true, reason: "already_sent" });
  }

  const logBase = {
    provider: "gmail",
    profile_id: profile.id,
    order_id: orderId,
    to_email: to,
    subject: finalSubject,
    template_key: templateKey,
    status: "failed",
  };

  try {
    const sent = await sendEmailWithIntegration(supabase, integration, {
      to,
      subject: finalSubject,
      html,
    });

    await supabase.from("email_logs").insert({
      ...logBase,
      status: "sent",
      gmail_message_id: sent.id,
      sent_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, provider: "gmail", messageId: sent.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "E-posta gönderilemedi.";
    await supabase.from("email_logs").insert({ ...logBase, status: "failed", error_message: message });
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
