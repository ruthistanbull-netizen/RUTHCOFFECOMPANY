import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function notifyOrderConfirmationEmail(orderId: string) {
  const supabase = getSupabaseAdmin();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id,profile_id,order_no,customer_email,customer_name,total_amount,currency")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) throw new Error(`Sipariş e-posta kuyruğu için okunamadı: ${orderError.message}`);
  if (!order) throw new Error("Sipariş e-posta kuyruğu için bulunamadı.");

  const email = String(order.customer_email || "").trim().toLocaleLowerCase("tr-TR");
  if (!email) return { ok: true, skipped: true, reason: "missing_customer_email" };

  const { data: existing, error: existingError } = await supabase
    .from("email_logs")
    .select("id,status")
    .eq("order_id", order.id)
    .eq("template_key", "order_confirmation")
    .in("status", ["queued", "sending", "sent", "failed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(`Sipariş e-posta kuyruğu kontrol edilemedi: ${existingError.message}`);
  if (existing) return { ok: true, queued: existing.status !== "sent", deduped: true, id: existing.id };

  const subject = `ROSTA Coffee Co. · Siparişin alındı #${order.order_no}`;
  const { data: queued, error: queueError } = await supabase
    .from("email_logs")
    .insert({
      provider: "rosta",
      profile_id: order.profile_id || null,
      order_id: order.id,
      to_email: email,
      subject,
      template_key: "order_confirmation",
      status: "queued",
      campaign_group: "transactional",
      campaign_name: "order_confirmation",
    })
    .select("id,status")
    .single();

  if (queueError || !queued) {
    throw new Error(`Sipariş e-posta kuyruğa alınamadı: ${queueError?.message || "kayıt dönmedi"}`);
  }

  return { ok: true, queued: true, id: queued.id };
}
