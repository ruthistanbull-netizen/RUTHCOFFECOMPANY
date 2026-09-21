import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendGa4MeasurementEvent, sendMetaCapiEvent } from "@/lib/analytics/serverMarketing";

export const runtime = "nodejs";

const ALLOWED_EVENTS = new Set([
  "session_start",
  "page_view",
  "product_view",
  "page_leave",
  "cart_created",
  "cart_add",
  "cart_open",
  "checkout_view",
  "payment_start",
  "session_ping",
  "session_end",
]);

function isThemePreviewRequest(request: Request) {
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    const params = new URL(referer).searchParams;
    return params.get("themeEditor") === "1" || params.has("themePreview");
  } catch {
    return false;
  }
}

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function hashIp(value: string) {
  if (!value) return "unknown";
  const salt = process.env.ANALYTICS_IP_HASH_SALT || "ruth-analytics-rate-v1";
  return crypto.createHash("sha256").update(`${salt}|${value}`).digest("hex");
}

function clientIp(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    ""
  );
}

function sanitizedMetadata(value: unknown) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const allowedKeys = new Set([
    "event_id", "visitor_id", "source", "medium", "campaign", "content", "term", "referrer",
    "landing_page", "click_id", "fbp", "fbc", "browser", "os", "device_type", "language",
    "timezone", "screen_width", "screen_height", "pathname", "query", "page_title", "product_slug",
    "product_name", "quantity", "item_count", "entry_path", "active_seconds", "event_client_at",
    "marketing_consent",
  ]);
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!allowedKeys.has(key)) continue;
    if (typeof raw === "string") result[key] = raw.slice(0, 500);
    else if (typeof raw === "number" && Number.isFinite(raw)) result[key] = Math.max(-1_000_000, Math.min(1_000_000, raw));
    else if (typeof raw === "boolean") result[key] = raw;
  }
  return result;
}

export async function POST(request: Request) {
  try {
    if (isThemePreviewRequest(request)) {
      return NextResponse.json(
        { ok: true, ignored: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 16_000) {
      return NextResponse.json({ ok: false, error: "Event payload çok büyük." }, { status: 413 });
    }

    const body = await request.json().catch(() => ({}));
    const eventName = clean(body.event_name, 100);
    const sessionId = clean(body.session_id);
    const path = clean(body.path);
    const metadata = sanitizedMetadata(body.metadata);

    if (!ALLOWED_EVENTS.has(eventName) || !sessionId) {
      return NextResponse.json({ ok: false, error: "Geçersiz event." }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const ip = clientIp(request);
    const ipDigest = hashIp(ip);
    const { data: accepted, error } = await supabase.rpc("collect_analytics_event", {
      p_session_id: sessionId,
      p_event_name: eventName,
      p_path: path || null,
      p_metadata: metadata,
      p_user_agent: clean(request.headers.get("user-agent"), 1000) || null,
      p_ip_hash: ipDigest,
    });

    if (error) {
      console.error("Analytics event could not be collected", error);
      return NextResponse.json({ ok: false, error: "Event kaydedilemedi." }, { status: 400 });
    }
    if (!accepted) {
      return NextResponse.json({ ok: false, error: "Event hız sınırı aşıldı." }, { status: 429 });
    }

    const eventMap: Record<string, "PageView" | "ViewContent" | "AddToCart" | "InitiateCheckout" | "AddPaymentInfo"> = {
      page_view: "PageView",
      product_view: "ViewContent",
      cart_add: "AddToCart",
      checkout_view: "InitiateCheckout",
      payment_start: "AddPaymentInfo",
    };
    const gaMap: Record<string, string> = {
      page_view: "page_view",
      product_view: "view_item",
      cart_add: "add_to_cart",
      checkout_view: "begin_checkout",
      payment_start: "add_payment_info",
    };
    const eventId = clean(metadata.event_id) || crypto.randomUUID();
    const visitorId = clean(metadata.visitor_id);
    const origin = new URL(request.url).origin;
    const eventSourceUrl = `${origin}${path || "/"}`;
    const productSlug = clean(metadata.product_slug, 160);
    const quantity = Math.max(0, Math.min(100, Math.trunc(Number(metadata.quantity ?? metadata.item_count ?? 0) || 0))) || undefined;
    const metaEvent = eventMap[eventName];
    const marketingConsent = metadata.marketing_consent === true;

    // First-party analytics is collected for storefront operations regardless of
    // optional marketing consent. Meta CAPI and GA4 only receive explicitly
    // consented events.
    if (marketingConsent && metaEvent) {
      void sendMetaCapiEvent({
        eventName: metaEvent,
        eventId,
        eventSourceUrl,
        clientIp: ip,
        userAgent: request.headers.get("user-agent") || undefined,
        visitorId,
        fbp: clean(metadata.fbp),
        fbc: clean(metadata.fbc),
        currency: "TRY",
        contentIds: productSlug ? [productSlug] : undefined,
        numItems: quantity,
      });
    }
    if (marketingConsent && gaMap[eventName] && visitorId) {
      void sendGa4MeasurementEvent(gaMap[eventName], visitorId, {
        page_location: eventSourceUrl,
        currency: "TRY",
        session_id: sessionId,
        source: clean(metadata.source),
        medium: clean(metadata.medium),
        campaign: clean(metadata.campaign),
      });
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Event kaydedilemedi." },
      { status: 400 },
    );
  }
}
