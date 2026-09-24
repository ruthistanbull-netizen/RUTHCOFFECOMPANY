import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadRostaInlineLogo } from "@/lib/gmail";
import { getActiveEmailIntegration, sendEmailWithIntegration } from "@/lib/mailDelivery";
import { buildMarketingEmailHtml, buildSubject, getReadyEmailTemplate } from "@/lib/emailTemplates";
import { loadPurposeCoupon, purposeCouponLabel } from "@/lib/purposeCoupons";
import { applyRange } from "@/lib/ranges";

export const runtime = "nodejs";

function asObj(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function customerName(customer: Record<string, any>) {
  return clean(customer.fullName) || clean(customer.full_name) || clean(customer.name) || "ROSTA Coffee Co. müşterisi";
}

function customerEmail(customer: Record<string, any>) {
  return clean(customer.email).toLocaleLowerCase("tr-TR");
}

const ABANDONED_CART_SETTING_KEY = "abandoned_cart_email_settings";
const MANUAL_RANGE_KEYS = new Set(["today", "7d", "30d", "90d", "all"]);

const DEFAULT_ABANDONED_CART_SETTINGS = {
  enabled: true,
  firstDelayHours: 3,
  secondDelayHours: 6,
  thirdDelayHours: 6,
};

function normalizeAbandonedCartSettings(input: unknown) {
  const value = input && typeof input === "object" ? input as Record<string, any> : {};
  const cleanNumber = (next: unknown, fallback: number) => {
    const number = Number(next);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(72, Math.max(1, Math.round(number)));
  };

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_ABANDONED_CART_SETTINGS.enabled,
    firstDelayHours: cleanNumber(value.firstDelayHours, DEFAULT_ABANDONED_CART_SETTINGS.firstDelayHours),
    secondDelayHours: cleanNumber(value.secondDelayHours, DEFAULT_ABANDONED_CART_SETTINGS.secondDelayHours),
    thirdDelayHours: cleanNumber(value.thirdDelayHours, DEFAULT_ABANDONED_CART_SETTINGS.thirdDelayHours),
  };
}

async function getAbandonedCartSettings(supabase: any) {
  const { data } = await supabase
    .from("site_settings")
    .select("setting_value")
    .eq("setting_key", ABANDONED_CART_SETTING_KEY)
    .maybeSingle();

  return normalizeAbandonedCartSettings(data?.setting_value || DEFAULT_ABANDONED_CART_SETTINGS);
}

async function writeAbandonedLastRun(supabase: any, payload: Record<string, any>) {
  await supabase.from("site_settings").upsert({
    setting_key: "abandoned_cart_last_run",
    setting_value: { ...payload, ranAt: new Date().toISOString() },
    is_public: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: "setting_key" });
}

function minutesAgo(dateValue: string | null | undefined) {
  if (!dateValue) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(dateValue).getTime()) / 60000;
}

function getCheckoutUrl(draft: any) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || "https://rostacoffecompany.zeabur.app").replace(/\/$/, "");
  const token = clean(draft.resume_token) || clean(draft.merchant_oid) || clean(draft.order_no) || clean(draft.id);
  return `${siteUrl}/checkout?draft=${encodeURIComponent(token)}`;
}

function dueReminderNo(draft: any, settings: ReturnType<typeof normalizeAbandonedCartSettings>) {
  if (!settings.enabled) return null;

  const count = Number(draft.abandoned_email_count || 0);
  if (count >= 3) return null;

  if (count === 0) {
    return minutesAgo(draft.created_at) >= settings.firstDelayHours * 60 ? 1 : null;
  }

  if (count === 1) {
    return minutesAgo(draft.abandoned_email_last_sent_at) >= settings.secondDelayHours * 60 ? 2 : null;
  }

  if (count === 2) {
    return minutesAgo(draft.abandoned_email_last_sent_at) >= settings.thirdDelayHours * 60 ? 3 : null;
  }

  return null;
}

function nextReminderNo(draft: any, settings: ReturnType<typeof normalizeAbandonedCartSettings>) {
  if (!settings.enabled) return null;
  const count = Number(draft.abandoned_email_count || 0);
  if (count >= 3) return null;
  return Math.max(1, Math.min(3, count + 1));
}

function normalizeManualRange(value: unknown) {
  const range = String(value || "all").trim().toLocaleLowerCase("en-US");
  return MANUAL_RANGE_KEYS.has(range) ? range : "all";
}

async function requestedManualRange(request: Request) {
  const url = new URL(request.url);
  const queryRange = url.searchParams.get("range");
  let range = normalizeManualRange(queryRange);
  let explicitRange = Boolean(queryRange);

  if (request.method === "POST") {
    try {
      const body = await request.clone().json() as { range?: unknown };
      if (body?.range) {
        range = normalizeManualRange(body.range);
        explicitRange = true;
      }
    } catch {
      // Backward-compatible calls without a JSON body keep normal due-time behavior.
    }
  }

  return { range, explicitRange };
}

async function runAbandonedCartEmails(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase, profile } = auth;
  const { range, explicitRange } = await requestedManualRange(request);

  let integration;
  try {
    integration = await getActiveEmailIntegration(supabase, profile.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mail sağlayıcısı okunamadı.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  if (!integration) return NextResponse.json({ ok: false, error: "Önce Gmail hesabını bağla." }, { status: 400 });

  let draftQuery = supabase
    .from("checkout_drafts")
    .select("id, merchant_oid, order_no, customer, items, total_amount, currency, status, order_id, created_at, abandoned_email_count, abandoned_email_last_sent_at, resume_token")
    .in("status", ["payment_reached", "waiting", "failed"])
    .is("order_id", null);

  draftQuery = applyRange(draftQuery, "created_at", range);

  const { data: drafts, error: draftError } = await draftQuery
    .order("created_at", { ascending: true })
    .limit(200);

  if (draftError) return NextResponse.json({ ok: false, error: draftError.message }, { status: 400 });

  const [abandonedCartSettings, abandonedCoupon] = await Promise.all([
    getAbandonedCartSettings(supabase),
    loadPurposeCoupon(supabase, "abandoned_cart"),
  ]);

  const dueDrafts = (drafts || [])
    .filter((draft: any) => Boolean(customerEmail(asObj(draft.customer))))
    .map((draft: any) => ({
      draft,
      reminderNo: explicitRange
        ? nextReminderNo(draft, abandonedCartSettings)
        : dueReminderNo(draft, abandonedCartSettings),
    }))
    .filter((item: any) => item.reminderNo);

  if (!dueDrafts.length) {
    await writeAbandonedLastRun(supabase, { ok: true, sent: 0, failed: 0, source: "manual", range, explicitRange, matched: drafts?.length || 0, message: "Seçili tarih aralığında gönderilecek uygun terk sepet yok." });
    return NextResponse.json({ ok: true, sent: 0, failed: 0, range, matched: drafts?.length || 0, message: "Seçili tarih aralığında gönderilecek uygun terk sepet yok." });
  }

  const template = getReadyEmailTemplate("abandoned_cart");
  const logoUrl = integration.provider === "gmail"
    ? "cid:rosta-email-logo"
    : `${process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || "https://rostacoffecompany.zeabur.app"}/rosta-coffee-co.svg`;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of dueDrafts) {
    const draft = item.draft;
    const reminderNo = Number(item.reminderNo);
    const customer = asObj(draft.customer);
    const to = customerEmail(customer);

    if (!to) continue;

    const couponLabel = purposeCouponLabel(abandonedCoupon);
    const couponCode = abandonedCoupon?.code || "";
    const offerText = abandonedCoupon
      ? `Sana özel ${couponLabel} indirim kodun: ${couponCode}. Bu kod yalnızca terk edilmiş sepet hatırlatması alan müşteriler için geçerlidir.`
      : "Sepetindeki kahveler seni bekliyor. Kaldığın yerden güvenle devam edebilirsin.";
    const variables = {
      customer_name: customerName(customer),
      checkout_url: getCheckoutUrl(draft),
      order_no: draft.order_no || "",
      total_amount: draft.total_amount || 0,
      reminder_no: reminderNo,
      discount_code: couponCode,
    };

    const fields = {
      ...template.fields,
      logoUrl,
      subject: reminderNo === 1
        ? abandonedCoupon ? `Sana özel ${couponLabel}: Sepetindeki kahveler seni bekliyor` : "Sepetindeki kahveler seni bekliyor"
        : reminderNo === 2
          ? abandonedCoupon ? `Sepetin hâlâ hazır · ${couponLabel} kodun aktif` : "Sepetin hâlâ hazır"
          : abandonedCoupon ? `Son hatırlatma · ${couponLabel} kodun hazır` : "Son hatırlatma: sepetine dön",
      headline: reminderNo === 3 ? "Sepetin için son hatırlatma" : template.fields.headline,
      buttonUrl: "{{checkout_url}}",
      offer: offerText,
    };

    const subject = buildSubject(fields, variables);
    const html = buildMarketingEmailHtml(fields, variables);

    const logBase = {
      provider: integration.provider,
      profile_id: profile.id,
      to_email: to,
      subject,
      template_key: `abandoned_cart_${reminderNo}`,
      status: "failed",
      order_id: null,
      campaign_group: "abandoned_cart",
      campaign_name: `Terk Sepet ${reminderNo}. Mail`,
    };

    try {
      const result = await sendEmailWithIntegration(supabase, integration, {
        to,
        subject,
        html,
        inlineImages: integration.provider === "gmail" ? loadRostaInlineLogo() : [],
      });
      const now = new Date().toISOString();

      await supabase.from("email_logs").insert({
        ...logBase,
        provider: result.provider,
        status: "sent",
        gmail_message_id: result.id,
        sent_at: now,
      });

      await supabase
        .from("checkout_drafts")
        .update({
          abandoned_email_count: reminderNo,
          abandoned_email_last_sent_at: now,
          abandoned_email_status: reminderNo >= 3 ? "completed" : "partial",
          abandoned_email_error: null,
          updated_at: now,
        })
        .eq("id", draft.id);

      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terk sepet e-postası gönderilemedi.";
      await supabase.from("email_logs").insert({ ...logBase, error_message: message });
      await supabase
        .from("checkout_drafts")
        .update({
          abandoned_email_error: message,
          abandoned_email_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", draft.id);

      failed += 1;
      errors.push(`${draft.order_no}: ${message}`);
    }
  }

  await writeAbandonedLastRun(supabase, { ok: failed === 0, sent, failed, errors, source: "manual", range, explicitRange, matched: drafts?.length || 0, eligible: dueDrafts.length, provider: integration.provider });

  return NextResponse.json({ ok: failed === 0, sent, failed, errors, range, matched: drafts?.length || 0, eligible: dueDrafts.length });
}

export async function POST(request: Request) {
  return runAbandonedCartEmails(request);
}

export async function GET(request: Request) {
  return runAbandonedCartEmails(request);
}
