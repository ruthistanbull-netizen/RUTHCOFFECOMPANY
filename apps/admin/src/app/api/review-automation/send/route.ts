import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getActiveEmailIntegration, sendEmailWithIntegration } from "@/lib/mailDelivery";
import { buildMarketingEmailHtml, getReadyEmailTemplate } from "@/lib/emailTemplates";
import { loadPurposeCoupon, purposeCouponLabel } from "@/lib/purposeCoupons";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

const KEY = "review_request_email_settings";
const DEFAULTS = {
  enabled: true,
  delayDaysAfterDelivered: 1,
  discountPercent: 10,
  subject: "Ürünü değerlendir, %10 indirim kazan",
  template: "Merhaba {{customer_name}}, siparişindeki ürünleri değerlendirmek ister misin? Yorumunu gönderdiğinde %10 indirim hesabına tanımlanır. {{review_url}}",
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(input: any) {
  const value = input && typeof input === "object" ? input : {};
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULTS.enabled,
    delayDaysAfterDelivered: Math.max(1, Math.min(14, Math.round(Number(value.delayDaysAfterDelivered || DEFAULTS.delayDaysAfterDelivered)))),
    discountPercent: Math.max(1, Math.min(50, Math.round(Number(value.discountPercent || DEFAULTS.discountPercent)))),
    subject: String(value.subject || DEFAULTS.subject),
    template: String(value.template || DEFAULTS.template),
  };
}

function renderTemplate(template: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, value), template);
}

function reviewEmailHtml(
  settings: ReturnType<typeof normalize>,
  text: string,
  reviewUrl: string,
  coupon: Awaited<ReturnType<typeof loadPurposeCoupon>>,
) {
  const template = getReadyEmailTemplate("review_request");
  const label = purposeCouponLabel(coupon);
  const couponOffer = coupon
    ? `Değerlendirme mailine özel ${label} indirim kodun: ${coupon.code}. Bu kod yalnızca yorum / değerlendirme maili alan müşteriler için geçerlidir.`
    : `Yorumunu ve yıldız değerlendirmeni gönderdiğinde bir sonraki alışverişinde kullanabileceğin %${settings.discountPercent} indirim hesabına tanımlanır.`;
  return buildMarketingEmailHtml({
    ...template.fields,
    subject: coupon ? `Ürünü değerlendir · sana özel ${label} indirim` : settings.subject,
    headline: coupon ? `Deneyimini paylaş · ${label} kodun hazır` : `Deneyimini paylaş, %${settings.discountPercent} indirim kazan`,
    intro: text,
    offer: couponOffer,
    buttonUrl: reviewUrl,
  });
}

async function saveDeliveryResult(supabase: any, existingId: string | null, payload: Record<string, unknown>) {
  if (existingId) {
    const { error } = await supabase.from("review_request_emails").update(payload).eq("id", existingId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("review_request_emails").insert(payload);
  if (error) throw new Error(error.message);
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body: Record<string, unknown> = await request.json().catch(() => ({}));
  const rawIds: unknown[] = Array.isArray(body.order_ids) ? body.order_ids : [body.order_id];
  const orderIds: string[] = Array.from(
    new Set<string>(
      rawIds
        .map((value: unknown) => clean(value))
        .filter((value: string): value is string => value.length > 0),
    ),
  ).slice(0, 200);
  if (!orderIds.length) {
    return NextResponse.json({ ok: false, error: "Sipariş seçilmedi." }, { status: 400, headers: noStoreHeaders() });
  }

  const { supabase } = auth;
  let settingRow: { setting_value?: unknown } | null = null;
  let integration: Awaited<ReturnType<typeof getActiveEmailIntegration>> = null;
  let reviewCoupon: Awaited<ReturnType<typeof loadPurposeCoupon>> = null;

  try {
    const [settingResult, activeIntegration, purposeCoupon] = await Promise.all([
      supabase.from("site_settings").select("setting_value").eq("setting_key", KEY).maybeSingle(),
      getActiveEmailIntegration(supabase, auth.profile.id),
      loadPurposeCoupon(supabase, "review"),
    ]);
    if (settingResult.error) throw new Error(settingResult.error.message);
    settingRow = settingResult.data;
    integration = activeIntegration;
    reviewCoupon = purposeCoupon;
  } catch (integrationError) {
    const message = integrationError instanceof Error ? integrationError.message : String(integrationError);
    return NextResponse.json({ ok: false, error: `Mail ayarları alınamadı: ${message}` }, { status: 400, headers: noStoreHeaders() });
  }

  if (!integration) {
    return NextResponse.json({ ok: false, error: "Aktif mail sağlayıcısı yok." }, { status: 400, headers: noStoreHeaders() });
  }

  const settings = normalize(settingRow?.setting_value);
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, customer_email, profile_id")
    .in("id", orderIds);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  }

  const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || "https://rostacoffecompany.zeabur.app").replace(/\/$/, "");
  const results: Array<{ order_id: string; status: "sent" | "failed" | "skipped"; error?: string }> = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const order of orders || []) {
    const orderId = String((order as any).id);
    const to = clean((order as any).customer_email).toLowerCase();
    if (!to) {
      skipped += 1;
      results.push({ order_id: orderId, status: "skipped", error: "Müşteri e-postası yok." });
      continue;
    }

    const { data: existing } = await supabase
      .from("review_request_emails")
      .select("id")
      .eq("order_id", orderId)
      .maybeSingle();

    const reviewUrl = `${site}/account/orders?review=${encodeURIComponent((order as any).order_no || orderId)}`;
    const text = renderTemplate(settings.template, {
      customer_name: clean((order as any).customer_name) || "ROSTA Coffee Co. müşterisi",
      order_no: clean((order as any).order_no),
      review_url: reviewUrl,
      discount_percent: String(reviewCoupon?.discountType === "percent" ? reviewCoupon.value : settings.discountPercent),
      discount_code: reviewCoupon?.code || "",
    });
    const subject = reviewCoupon
      ? `Ürünü değerlendir · sana özel ${purposeCouponLabel(reviewCoupon)} indirim`
      : settings.subject;

    try {
      await sendEmailWithIntegration(supabase, integration, {
        to,
        subject,
        html: reviewEmailHtml(settings, text, reviewUrl, reviewCoupon),
      });

      const sentAt = new Date().toISOString();
      await saveDeliveryResult(supabase, existing?.id ? String(existing.id) : null, {
        order_id: orderId,
        profile_id: (order as any).profile_id || null,
        email: to,
        status: "sent",
        sent_at: sentAt,
        error_message: null,
      });
      sent += 1;
      results.push({ order_id: orderId, status: "sent" });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : String(sendError);
      try {
        await saveDeliveryResult(supabase, existing?.id ? String(existing.id) : null, {
          order_id: orderId,
          profile_id: (order as any).profile_id || null,
          email: to,
          status: "failed",
          sent_at: new Date().toISOString(),
          error_message: message,
        });
      } catch {
        // Asıl mail hatasını koru.
      }
      failed += 1;
      results.push({ order_id: orderId, status: "failed", error: message });
    }
  }

  const foundIds = new Set<string>((orders || []).map((order: any) => String(order.id)));
  for (const missingId of orderIds.filter((id) => !foundIds.has(id))) {
    skipped += 1;
    results.push({ order_id: missingId, status: "skipped", error: "Sipariş bulunamadı." });
  }

  const ok = failed === 0 && sent > 0;
  return NextResponse.json({ ok, sent, failed, skipped, results }, {
    status: sent > 0 ? 200 : 400,
    headers: noStoreHeaders(),
  });
}
