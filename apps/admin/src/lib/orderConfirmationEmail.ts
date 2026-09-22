import { getActiveEmailIntegration, sendEmailWithIntegration } from "@/lib/mailDelivery";
import { orderEmailPalette } from "@/lib/tokens";

const TEMPLATE_KEY = "order_created";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatMoney(value: unknown, currency = "TRY") {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function safeImageUrl(value: unknown) {
  const url = clean(value);
  return /^https:\/\//i.test(url) ? url : "";
}

async function loadOrder(supabase: any, orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id, profile_id, order_no, customer_name, customer_email, customer_phone,
      subtotal, shipping_fee, discount_total, total_amount, currency,
      shipping_city, shipping_town, shipping_address_line, shipping_address_text,
      order_items (
        id, product_id, variant_id, product_name, variant_name, quantity,
        unit_price, total_price, image_url,
        product:products (main_image_url),
        variant:product_variants (image_url)
      )
    `)
    .eq("id", orderId)
    .single();

  if (error || !data) throw new Error(error?.message || "Sipariş bulunamadı.");
  return data;
}

function buildOrderConfirmationHtml(order: any) {
  const siteUrl = clean(process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL) || "https://ruthistanbull.tr";
  const trackingUrl = `${siteUrl.replace(/\/$/, "")}/order-tracking`;
  const address = [
    clean(order.shipping_address_line) || clean(order.shipping_address_text),
    [clean(order.shipping_town), clean(order.shipping_city)].filter(Boolean).join(" / "),
  ].filter(Boolean).join(", ");
  const items = (order.order_items || []).map((item: any) => {
    const imageUrl = safeImageUrl(item.image_url)
      || safeImageUrl(item.variant?.image_url)
      || safeImageUrl(item.product?.main_image_url);
    const quantity = Math.max(1, Number(item.quantity || 1));
    const lineTotal = item.total_price ?? Number(item.unit_price || 0) * quantity;

    return `
      <tr>
        <td style="width:76px;padding:14px 12px 14px 0;border-bottom:1px solid ${orderEmailPalette.border};vertical-align:top">
          ${imageUrl
            ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.product_name || "Ürün")}" width="64" height="80" style="display:block;width:64px;height:80px;border-radius:10px;object-fit:cover;background:${orderEmailPalette.surfaceMuted};border:1px solid ${orderEmailPalette.border}" />`
            : `<div style="width:64px;height:80px;border-radius:10px;background:${orderEmailPalette.surfaceMuted};border:1px solid ${orderEmailPalette.border};text-align:center;line-height:80px;font-family:Georgia,serif;font-size:20px;color:${orderEmailPalette.accent}">R</div>`}
        </td>
        <td style="padding:14px 8px 14px 0;border-bottom:1px solid ${orderEmailPalette.border};vertical-align:top">
          <div style="font-size:14px;font-weight:700;color:${orderEmailPalette.ink};line-height:1.45">${escapeHtml(item.product_name || "Ürün")}</div>
          ${clean(item.variant_name) ? `<div style="margin-top:5px;font-size:12px;color:${orderEmailPalette.muted};line-height:1.45">${escapeHtml(item.variant_name)}</div>` : ""}
          <div style="margin-top:7px;font-size:12px;color:${orderEmailPalette.muted}">${quantity} adet × ${formatMoney(item.unit_price, order.currency)}</div>
        </td>
        <td style="padding:14px 0;border-bottom:1px solid ${orderEmailPalette.border};text-align:right;vertical-align:top;font-size:13px;font-weight:700;color:${orderEmailPalette.ink};white-space:nowrap">${formatMoney(lineTotal, order.currency)}</td>
      </tr>
    `;
  }).join("");

  return `<!doctype html>
  <html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#f5efe5;font-family:Arial,Helvetica,sans-serif;color:#211a14">
    <div style="padding:24px 12px">
      <div style="max-width:640px;margin:0 auto;background:#fffaf2;border:1px solid #e8dccb;border-radius:22px;overflow:hidden">
        <div style="padding:28px 28px 18px;text-align:center;border-bottom:1px solid #eadfce">
          <div style="font-family:Georgia,serif;font-size:26px;letter-spacing:.13em">RUTH ISTANBUL</div>
          <div style="margin-top:6px;font-size:9px;letter-spacing:.22em;color:#9a7b52">HANDMADE JEWELRY</div>
        </div>
        <div style="padding:30px 28px">
          <div style="text-align:center;font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:#9a7b52">Siparişiniz Alındı</div>
          <h1 style="margin:12px 0 14px;text-align:center;font-family:Georgia,serif;font-size:30px;line-height:1.2;font-weight:500">Bizi tercih ettiğiniz için teşekkür ederiz</h1>
          <p style="margin:0;text-align:center;color:#6f6255;font-size:15px;line-height:1.75">Merhaba ${escapeHtml(order.customer_name || "")},</p>
          <p style="margin:10px auto 0;max-width:520px;text-align:center;color:#6f6255;font-size:15px;line-height:1.75">${escapeHtml(order.order_no)} numaralı siparişin başarıyla alındı. Hazırlık ve kargo sürecindeki önemli gelişmeleri e-posta ile paylaşacağız.</p>

          <div style="margin-top:24px;padding:18px;border:1px solid #eadfce;border-radius:16px;background:#fff">
            <div style="display:flex;justify-content:space-between;gap:16px"><span style="color:#817466;font-size:12px">Sipariş No</span><strong style="font-size:13px">${escapeHtml(order.order_no)}</strong></div>
          </div>

          <div style="margin-top:24px">
            <div style="font-family:Georgia,serif;font-size:18px">Sipariş Detayları</div>
            <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:8px">${items}</table>
            <div style="margin-top:14px;border-top:1px solid ${orderEmailPalette.border};padding-top:14px">
              <div style="display:flex;justify-content:space-between;gap:16px;color:${orderEmailPalette.summary};font-size:13px"><span>Ara Toplam</span><strong>${formatMoney(order.subtotal, order.currency)}</strong></div>
              <div style="display:flex;justify-content:space-between;gap:16px;margin-top:9px;color:${orderEmailPalette.summary};font-size:13px"><span>Kargo</span><strong>${Number(order.shipping_fee || 0) > 0 ? formatMoney(order.shipping_fee, order.currency) : "Ücretsiz"}</strong></div>
              ${Number(order.discount_total || 0) > 0 ? `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:9px;color:${orderEmailPalette.discount};font-size:13px"><span>İndirim</span><strong>-${formatMoney(order.discount_total, order.currency)}</strong></div>` : ""}
              <div style="display:flex;justify-content:space-between;gap:16px;margin-top:16px;font-family:Georgia,serif;font-size:19px"><span>Toplam</span><strong>${formatMoney(order.total_amount, order.currency)}</strong></div>
            </div>
          </div>

          ${address ? `<div style="margin-top:22px;padding:16px;border-radius:14px;background:#f5efe5"><div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#9a7b52">Teslimat Adresi</div><div style="margin-top:8px;font-size:13px;line-height:1.65;color:#5f5348">${escapeHtml(address)}</div></div>` : ""}

          <div style="margin-top:26px;text-align:center">
            <a href="${escapeHtml(trackingUrl)}" style="display:inline-block;padding:15px 24px;background:#211a14;color:#fffaf2;text-decoration:none;font-size:11px;letter-spacing:.18em;text-transform:uppercase">Siparişini Takip Et</a>
          </div>
          <p style="margin:24px 0 0;text-align:center;color:#9a8d80;font-size:11px;line-height:1.6">Sevgiler,<br>Ruth Istanbul</p>
        </div>
      </div>
    </div>
  </body></html>`;
}

export async function sendOrderConfirmationEmail(supabase: any, orderId: string, profileId?: string | null) {
  const order = await loadOrder(supabase, orderId);
  const to = clean(order.customer_email).toLocaleLowerCase("tr-TR");
  if (!to || !to.includes("@")) return { ok: true, skipped: "no_email" };

  const integration = await getActiveEmailIntegration(supabase, profileId || null);
  if (!integration) return { ok: false, error: "Aktif e-posta entegrasyonu bulunamadı." };

  const subject = `Siparişini aldık, teşekkür ederiz - ${clean(order.order_no) || order.id}`;
  const { data: claim, error: claimError } = await supabase
    .from("email_logs")
    .insert({
      provider: integration.provider,
      profile_id: (integration as any).profile_id || profileId || order.profile_id || null,
      order_id: order.id,
      to_email: to,
      subject,
      template_key: TEMPLATE_KEY,
      status: "pending",
    })
    .select("id")
    .single();

  if (claimError) {
    if (claimError.code === "23505") return { ok: true, skipped: "already_claimed" };
    throw new Error(`Sipariş onay maili kaydı açılamadı: ${claimError.message}`);
  }

  try {
    const sent = await sendEmailWithIntegration(supabase, integration, {
      to,
      subject,
      html: buildOrderConfirmationHtml(order),
    });
    const { error: updateError } = await supabase
      .from("email_logs")
      .update({
        provider: sent.provider,
        status: "sent",
        gmail_message_id: sent.id,
        error_message: null,
        sent_at: new Date().toISOString(),
      })
      .eq("id", claim.id);
    if (updateError) throw new Error(`Sipariş onay maili logu tamamlanamadı: ${updateError.message}`);
    return { ok: true, sent: true, provider: sent.provider, messageId: sent.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sipariş onay maili gönderilemedi.";
    await supabase
      .from("email_logs")
      .update({ status: "failed", error_message: message })
      .eq("id", claim.id);
    return { ok: false, error: message };
  }
}
