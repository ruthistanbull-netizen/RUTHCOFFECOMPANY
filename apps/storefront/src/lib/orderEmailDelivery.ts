import { createDecipheriv, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const TOKEN_PREFIX = "enc:rosta:v1:";

type Integration = {
  id: string;
  email: string | null;
  sender_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  status: string;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function tokenKey() {
  const master = clean(process.env.GMAIL_TOKEN_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!master) throw new Error("Gmail token şifreleme anahtarı eksik.");
  return createHash("sha256").update(`rosta:gmail-refresh-token:v1:${master}`).digest();
}

function decryptRefreshToken(stored: string) {
  const value = clean(stored);
  if (!value) return "";
  if (!value.startsWith(TOKEN_PREFIX)) return value;
  const parts = value.slice(TOKEN_PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Gmail refresh token formatı geçersiz.");
  const [iv, tag, ciphertext] = parts;
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = clean(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = clean(process.env.GOOGLE_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw new Error("Gmail worker env eksik: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Gmail access token yenilenemedi.");
  return data as { access_token: string; expires_in?: number };
}

async function activeIntegration(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("email_integrations")
    .select("id,email,sender_name,access_token,refresh_token,expires_at,status")
    .eq("provider", "gmail")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Gmail entegrasyonu okunamadı: ${error.message}`);
  return data as Integration | null;
}

async function accessToken(supabase: SupabaseClient, integration: Integration) {
  const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : 0;
  if (clean(integration.access_token) && expiresAt > Date.now() + 90_000) {
    return clean(integration.access_token);
  }

  const refreshToken = decryptRefreshToken(clean(integration.refresh_token));
  if (!refreshToken) throw new Error("Gmail refresh token yok. Panelden Gmail hesabını yeniden bağla.");
  const refreshed = await refreshAccessToken(refreshToken);
  const nextExpiresAt = new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString();

  const { error } = await supabase
    .from("email_integrations")
    .update({
      access_token: refreshed.access_token,
      expires_at: nextExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id);
  if (error) throw new Error(`Gmail token kaydı güncellenemedi: ${error.message}`);
  integration.access_token = refreshed.access_token;
  integration.expires_at = nextExpiresAt;
  return refreshed.access_token;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(value: unknown, currency = "TRY") {
  const number = Number(value || 0);
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency || "TRY",
  }).format(Number.isFinite(number) ? number : 0);
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function rawMessage(input: { fromEmail: string; fromName: string; to: string; subject: string; html: string }) {
  const boundary = `rosta_alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const text = input.html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
  return [
    `From: ${encodeHeader(input.fromName)} <${input.fromEmail.replace(/[\r\n]/g, "")}>`,
    `To: ${input.to.replace(/[\r\n]/g, "")}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.html,
    "",
    `--${boundary}--`,
  ].join("\r\n");
}

async function sendGmail(accessTokenValue: string, raw: string) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessTokenValue}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Gmail gönderimi başarısız.");
  return data as { id: string; threadId?: string };
}

async function orderHtml(supabase: SupabaseClient, orderId: string) {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id,order_no,customer_name,customer_email,subtotal,shipping_fee,discount_total,total_amount,currency,shipping_city,shipping_town,shipping_address_line,shipping_address_text,order_items(id,product_name,variant_name,quantity,unit_price,total_price,image_url)")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) throw new Error(error?.message || "Sipariş maili için sipariş bulunamadı.");

  const items = (order.order_items || []).map((item: any) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const total = item.total_price ?? Number(item.unit_price || 0) * quantity;
    return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #ddd6ca">
          <div style="font-weight:700">${escapeHtml(item.product_name || "Ürün")}</div>
          ${clean(item.variant_name) ? `<div style="margin-top:4px;color:#6f725b;font-size:12px">${escapeHtml(item.variant_name)}</div>` : ""}
          <div style="margin-top:5px;color:#6f725b;font-size:12px">${quantity} adet × ${money(item.unit_price, order.currency)}</div>
        </td>
        <td style="padding:14px 0;border-bottom:1px solid #ddd6ca;text-align:right;font-weight:700">${money(total, order.currency)}</td>
      </tr>`;
  }).join("");

  const address = [
    clean(order.shipping_address_line) || clean(order.shipping_address_text),
    [clean(order.shipping_town), clean(order.shipping_city)].filter(Boolean).join(" / "),
  ].filter(Boolean).join(", ");

  const siteUrl = clean(process.env.NEXT_PUBLIC_SITE_URL || "https://rostacoffecompany.zeabur.app").replace(/\/$/, "");
  return {
    order,
    html: `<!doctype html><html lang="tr"><body style="margin:0;background:#f4f0e8;font-family:Arial,Helvetica,sans-serif;color:#111">
      <div style="padding:28px 12px">
        <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #ded8cf;border-radius:18px;overflow:hidden">
          <div style="padding:26px 28px;background:#111;color:#f4f0e8">
            <div style="font-size:25px;font-weight:900;letter-spacing:.12em">ROSTA</div>
            <div style="margin-top:4px;font-size:10px;letter-spacing:.2em">COFFEE CO.</div>
          </div>
          <div style="padding:30px 28px">
            <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b9563d">Siparişin alındı</div>
            <h1 style="margin:10px 0 12px;font-size:28px;line-height:1.2">Teşekkür ederiz.</h1>
            <p style="margin:0;color:#5f5b54;line-height:1.7">Merhaba ${escapeHtml(order.customer_name || "")}, ${escapeHtml(order.order_no)} numaralı siparişin başarıyla alındı.</p>
            <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:24px">${items}</table>
            <div style="margin-top:18px">
              <div style="display:flex;justify-content:space-between"><span>Ara Toplam</span><strong>${money(order.subtotal, order.currency)}</strong></div>
              <div style="display:flex;justify-content:space-between;margin-top:8px"><span>Kargo</span><strong>${Number(order.shipping_fee || 0) > 0 ? money(order.shipping_fee, order.currency) : "Ücretsiz"}</strong></div>
              ${Number(order.discount_total || 0) > 0 ? `<div style="display:flex;justify-content:space-between;margin-top:8px;color:#b9563d"><span>İndirim</span><strong>-${money(order.discount_total, order.currency)}</strong></div>` : ""}
              <div style="display:flex;justify-content:space-between;margin-top:14px;padding-top:14px;border-top:1px solid #ddd6ca;font-size:18px"><span>Toplam</span><strong>${money(order.total_amount, order.currency)}</strong></div>
            </div>
            ${address ? `<div style="margin-top:22px;padding:15px;background:#f4f0e8;border-radius:12px"><strong style="font-size:12px">Teslimat</strong><div style="margin-top:7px;font-size:13px;line-height:1.6">${escapeHtml(address)}</div></div>` : ""}
            <div style="margin-top:26px"><a href="${siteUrl}/order-tracking" style="display:inline-block;padding:13px 19px;background:#111;color:#fff;text-decoration:none;font-size:11px;letter-spacing:.14em;text-transform:uppercase">Siparişi Takip Et</a></div>
            <p style="margin:24px 0 0;color:#777;font-size:12px">ROSTA Coffee Co.</p>
          </div>
        </div>
      </div>
    </body></html>`,
  };
}

export async function deliverQueuedOrderConfirmations(supabase: SupabaseClient, limit = 10) {
  const { data: logs, error: logsError } = await supabase
    .from("email_logs")
    .select("id,order_id,to_email,subject,status")
    .eq("template_key", "order_confirmation")
    .in("status", ["queued", "failed"])
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(25, limit)));
  if (logsError) throw new Error(`E-posta kuyruğu okunamadı: ${logsError.message}`);
  if (!logs?.length) return { processed: 0, sent: 0, failed: 0, waitingForIntegration: false };

  const integration = await activeIntegration(supabase);
  if (!integration || !clean(integration.email)) {
    return { processed: 0, sent: 0, failed: 0, waitingForIntegration: true, queued: logs.length };
  }

  let sent = 0;
  let failed = 0;
  for (const log of logs) {
    const { data: claim, error: claimError } = await supabase
      .from("email_logs")
      .update({ status: "sending", error_message: null })
      .eq("id", log.id)
      .in("status", ["queued", "failed"])
      .select("id")
      .maybeSingle();
    if (claimError || !claim) continue;

    try {
      if (!log.order_id) throw new Error("Sipariş onay mailinde order_id eksik.");
      const { order, html } = await orderHtml(supabase, String(log.order_id));
      const to = clean(log.to_email || order.customer_email).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Geçerli müşteri e-postası yok.");

      const token = await accessToken(supabase, integration);
      const message = rawMessage({
        fromEmail: clean(integration.email),
        fromName: clean(integration.sender_name) || "ROSTA Coffee Co.",
        to,
        subject: clean(log.subject) || `ROSTA Coffee Co. · Siparişin alındı #${order.order_no}`,
        html,
      });
      const delivered = await sendGmail(token, message);
      const { error: sentError } = await supabase.from("email_logs").update({
        provider: "gmail",
        status: "sent",
        gmail_message_id: delivered.id,
        error_message: null,
        sent_at: new Date().toISOString(),
      }).eq("id", log.id);
      if (sentError) throw new Error(sentError.message);
      sent += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Sipariş e-postası gönderilemedi.";
      await supabase.from("email_logs").update({
        status: "failed",
        error_message: message.slice(0, 2000),
      }).eq("id", log.id);
    }
  }

  return { processed: sent + failed, sent, failed, waitingForIntegration: false };
}
