import { getActiveEmailIntegration, sendEmailWithIntegration } from "@/lib/mailDelivery";
import {
  buildOrderLifecycleHtml,
  lifecycleCopy,
  lifecycleForStatus,
  type OrderLifecycle,
} from "@/lib/orderLifecycleEmailContent";

export {
  buildOrderLifecycleHtml,
  lifecycleCopy,
  lifecycleForStatus,
  type OrderLifecycle,
} from "@/lib/orderLifecycleEmailContent";

type LifecycleEmailDependencies = {
  getIntegration?: (supabase: any) => Promise<any>;
  sendMail?: (
    supabase: any,
    integration: any,
    input: { to: string; subject: string; html: string },
  ) => Promise<{ provider: string; id?: string | null }>;
  now?: () => Date;
  allowRepeat?: boolean;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function loadOrder(supabase: any, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id, profile_id, order_no, customer_name, customer_email, customer_phone,
      total_amount, currency, cargo_company, cargo_tracking_no, basit_kargo_barcode,
      shipping_status, shipping_city, shipping_town, shipping_address_line, shipping_address_text,
      order_items (id, product_name, variant_name, quantity, unit_price, total_price, image_url)
    `)
    .eq("id", orderId)
    .single();
  if (error || !data) throw new Error(error?.message || "Sipariş bulunamadı.");
  return data;
}

export async function sendOrderLifecycleEmail(
  supabase: any,
  orderId: string,
  status: unknown,
  dependencies: LifecycleEmailDependencies = {},
) {
  const lifecycle = lifecycleForStatus(status);
  if (!lifecycle) return { ok: true, skipped: "status" };

  const templateKey = `order_lifecycle_${lifecycle}`;
  if (!dependencies.allowRepeat) {
    const { data: existing } = await supabase
      .from("email_logs")
      .select("id")
      .eq("order_id", orderId)
      .eq("template_key", templateKey)
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();
    if (existing?.id) return { ok: true, skipped: "already_sent", lifecycle };
  }

  const order = await loadOrder(supabase, orderId);
  const to = clean(order.customer_email).toLocaleLowerCase("tr-TR");
  if (!to || !to.includes("@")) return { ok: true, skipped: "no_email", lifecycle };

  const getIntegration = dependencies.getIntegration || getActiveEmailIntegration;
  const sendMail = dependencies.sendMail || sendEmailWithIntegration;
  const now = dependencies.now || (() => new Date());

  const integration = await getIntegration(supabase);
  if (!integration) return { ok: true, skipped: "no_integration", lifecycle };

  const copy = lifecycleCopy(lifecycle as OrderLifecycle, order);
  const logBase = {
    provider: integration.provider,
    profile_id: integration.profile_id || null,
    order_id: order.id,
    to_email: to,
    subject: copy.subject,
    template_key: templateKey,
  };

  try {
    const sent = await sendMail(supabase, integration, {
      to,
      subject: copy.subject,
      html: buildOrderLifecycleHtml(lifecycle as OrderLifecycle, order),
    });
    await supabase.from("email_logs").insert({
      ...logBase,
      provider: sent.provider,
      status: "sent",
      gmail_message_id: sent.id || null,
      sent_at: now().toISOString(),
    });
    return { ok: true, sent: true, lifecycle };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sipariş durum e-postası gönderilemedi.";
    await supabase.from("email_logs").insert({
      ...logBase,
      status: "failed",
      error_message: message,
    });
    return { ok: false, error: message, lifecycle };
  }
}
