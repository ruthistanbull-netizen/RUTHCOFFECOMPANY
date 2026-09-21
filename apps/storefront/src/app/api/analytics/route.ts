import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const ALLOWED_EVENTS = new Set([
  "session_start", "page_view", "page_leave", "product_view", "cart_created", "cart_add", "cart_open",
  "checkout_view", "payment_start", "session_ping", "session_end",
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

function clean(value: unknown) { return typeof value === "string" ? value.trim().slice(0, 500) : ""; }
function hashIp(value: string) { return value ? crypto.createHash("sha256").update(value).digest("hex") : null; }
function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "";
}
function geoHeaders(request: Request) {
  return {
    country: clean(request.headers.get("x-vercel-ip-country")),
    city: clean(request.headers.get("x-vercel-ip-city")),
    region: clean(request.headers.get("x-vercel-ip-country-region")),
  };
}

export async function POST(request: Request) {
  try {
    if (isThemePreviewRequest(request)) {
      return NextResponse.json(
        { ok: true, ignored: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const eventName = clean(body.event_name);
    const sessionId = clean(body.session_id);
    const path = clean(body.path);
    const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    if (!ALLOWED_EVENTS.has(eventName) || !sessionId) return NextResponse.json({ ok: false, error: "Geçersiz event." }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("analytics_events").insert({
      session_id: sessionId,
      event_name: eventName,
      path: path || null,
      metadata: { ...metadata, ...geoHeaders(request) },
      user_agent: request.headers.get("user-agent"),
      ip_hash: hashIp(clientIp(request)),
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Event kaydedilemedi." }, { status: 400 });
  }
}
