import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/auth";
import { getActiveEmailIntegration, sendEmailWithIntegration } from "@/lib/mailDelivery";
import { buildMarketingEmailHtml, getReadyEmailTemplate } from "@/lib/emailTemplates";
import { loadPurposeCoupon, purposeCouponLabel } from "@/lib/purposeCoupons";

export const runtime = "nodejs";

const KEY = "review_request_email_settings";
const TEST_REVIEW_EMAIL = String(process.env.ROSTA_REVIEW_TEST_EMAIL || "").trim().toLowerCase();
const PAGE_SIZE = 500;
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

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function incomingCronSecret(request: Request) {
  const urlSecret = new URL(request.url).searchParams.get("secret") || "";
  return clean(
    request.headers.get("x-cron-secret") ||
    request.headers.get("x-automation-cron-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    urlSecret,
  );
}

function normalize(input: any) {
  const value = input && typeof input === "object" ? input : {};
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULTS.enabled,
    // Review requests are intentionally fixed to exactly 1 day after delivery.
    delayDaysAfterDelivered: 1,
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
  return buildMarketingEmailHtml({
    ...template.fields,
    subject: coupon ? `Ürünü değerlendir · sana özel ${label} indirim` : settings.subject,
    headline: coupon ? `Deneyimini paylaş · ${label} kodun hazır` : `Deneyimini paylaş, %${settings.discountPercent} indirim kazan`,
    intro: text,
    offer: coupon
      ? `Değerlendirme mailine özel ${label} indirim kodun: ${coupon.code}. Bu kod yalnızca yorum / değerlendirme maili alan müşteriler için geçerlidir.`
      : `Yorumunu ve yıldız değerlendirmeni gönderdiğinde bir sonraki alışverişinde kullanabileceğin %${settings.discountPercent} indirim hesabına tanımlanır.`,
    buttonUrl: reviewUrl,
  });
}

async function sendReviewAutomationTest() {
  if (!TEST_REVIEW_EMAIL) return NextResponse.json({ ok: false, error: "ROSTA_REVIEW_TEST_EMAIL yapılandırılmamış." }, { status: 400 });
  const supabase = getSupabaseAdmin();
  const [{ data: settingRow }, reviewCoupon] = await Promise.all([
    supabase.from("site_settings").select("setting_value").eq("setting_key", KEY).maybeSingle(),
    loadPurposeCoupon(supabase, "review"),
  ]);
  const settings = normalize(settingRow?.setting_value);
  const integration = await getActiveEmailIntegration(supabase);
  if (!integration) return NextResponse.json({ ok: false, error: "Aktif mail sağlayıcısı yok." }, { status: 400 });

  const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || "https://rostacoffecompany.zeabur.app").replace(/\/$/, "");
  const reviewUrl = `${site}/account/orders`;
  const text = renderTemplate(settings.template, {
    customer_name: "ROSTA Coffee Co. müşterisi",
    order_no: "",
    review_url: reviewUrl,
    discount_percent: String(reviewCoupon?.discountType === "percent" ? reviewCoupon.value : settings.discountPercent),
    discount_code: reviewCoupon?.code || "",
  });
  const subject = reviewCoupon ? `Ürünü değerlendir · sana özel ${purposeCouponLabel(reviewCoupon)} indirim` : settings.subject;

  try {
    await sendEmailWithIntegration(supabase, integration, {
      to: TEST_REVIEW_EMAIL,
      subject,
      html: reviewEmailHtml(settings, text, reviewUrl, reviewCoupon),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, test: true, sent: 0, failed: 1, to: TEST_REVIEW_EMAIL, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }

  await supabase.from("site_settings").upsert({
    setting_key: "review_request_last_test",
    setting_value: { to: TEST_REVIEW_EMAIL, sentAt: new Date().toISOString() },
    is_public: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: "setting_key" });

  return NextResponse.json({ ok: true, test: true, sent: 1, failed: 0, to: TEST_REVIEW_EMAIL });
}

async function runDueReviewEmails() {
  const supabase = getSupabaseAdmin();
  const [{ data: settingRow }, reviewCoupon] = await Promise.all([
    supabase.from("site_settings").select("setting_value").eq("setting_key", KEY).maybeSingle(),
    loadPurposeCoupon(supabase, "review"),
  ]);
  const settings = normalize(settingRow?.setting_value);
  if (!settings.enabled) return NextResponse.json({ ok: true, sent: 0, message: "Değerlendirme otomasyonu kapalı." });

  const integration = await getActiveEmailIntegration(supabase);
  if (!integration) return NextResponse.json({ ok: false, error: "Aktif mail sağlayıcısı yok." }, { status: 400 });

  // Exactly 24 hours after the real delivery timestamp. Never fall back to updated_at:
  // an old completed order must not be treated as newly delivered.
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const allOrders: any[] = [];
  let from = 0;

  while (true) {
    const { data: page, error } = await supabase
      .from("orders")
      .select("id, order_no, customer_name, customer_email, status, delivered_at, profile_id")
      .in("status", ["completed", "delivered"])
      .not("delivered_at", "is", null)
      .lte("delivered_at", cutoffIso)
      .order("delivered_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    allOrders.push(...(page || []));
    if (!page || page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];
  const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || "https://rostacoffecompany.zeabur.app").replace(/\/$/, "");

  for (const order of allOrders) {
    const to = clean(order.customer_email).toLowerCase();
    if (!to) {
      skipped += 1;
      continue;
    }

    const { data: claimed, error: claimError } = await supabase.rpc("claim_review_request_email", {
      p_order_id: order.id,
      p_profile_id: order.profile_id || null,
      p_email: to,
    });
    if (claimError) {
      failed += 1;
      errors.push(`${order.order_no || order.id}: ${claimError.message}`);
      continue;
    }
    if (!claimed) {
      skipped += 1;
      continue;
    }

    const reviewUrl = `${site}/account/orders?review=${encodeURIComponent(order.order_no || order.id)}`;
    const text = renderTemplate(settings.template, {
      customer_name: clean(order.customer_name) || "ROSTA Coffee Co. müşterisi",
      order_no: clean(order.order_no),
      review_url: reviewUrl,
      discount_percent: String(reviewCoupon?.discountType === "percent" ? reviewCoupon.value : settings.discountPercent),
      discount_code: reviewCoupon?.code || "",
    });
    const subject = reviewCoupon ? `Ürünü değerlendir · sana özel ${purposeCouponLabel(reviewCoupon)} indirim` : settings.subject;

    try {
      await sendEmailWithIntegration(supabase, integration, {
        to,
        subject,
        html: reviewEmailHtml(settings, text, reviewUrl, reviewCoupon),
      });
      await supabase
        .from("review_request_emails")
        .update({ status: "sent", error_message: null, sent_at: new Date().toISOString() })
        .eq("order_id", order.id);
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("review_request_emails")
        .update({ status: "failed", error_message: message, sent_at: new Date().toISOString() })
        .eq("order_id", order.id);
      failed += 1;
      errors.push(`${order.order_no || order.id}: ${message}`);
    }
  }

  await supabase.from("site_settings").upsert({
    setting_key: "review_request_last_run",
    setting_value: {
      sent,
      failed,
      skipped,
      checked: allOrders.length,
      eligible: allOrders.length,
      delayDaysAfterDelivered: 1,
      errors,
      ranAt: new Date().toISOString(),
    },
    is_public: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: "setting_key" });

  return NextResponse.json({
    ok: failed === 0,
    sent,
    failed,
    skipped,
    checked: allOrders.length,
    eligible: allOrders.length,
    delayDaysAfterDelivered: 1,
    errors,
  });
}

async function runCron(request: Request) {
  const expected = clean(process.env.CRON_SECRET);
  const incoming = incomingCronSecret(request);
  if (!expected) return NextResponse.json({ ok: false, error: "CRON_SECRET yapılandırılmamış." }, { status: 503 });
  if (!incoming || !safeEqual(incoming, expected)) return NextResponse.json({ ok: false, error: "Cron secret hatalı." }, { status: 401 });
  return runDueReviewEmails();
}

export async function GET(request: Request) {
  return runCron(request);
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const test = ["1", "true", "yes"].includes((new URL(request.url).searchParams.get("test") || "").toLowerCase());
  if (test) return sendReviewAutomationTest();
  return runDueReviewEmails();
}
