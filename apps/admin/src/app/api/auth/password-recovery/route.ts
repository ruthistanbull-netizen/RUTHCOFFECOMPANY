import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmailWithIntegration } from "@/lib/mailDelivery";
import {
  PASSWORD_RECOVERY_SUBJECT,
  buildPasswordRecoveryHtml,
  buildPasswordRecoveryUrl,
  isPasswordRecoveryTarget,
  isValidRecoveryEmail,
  normalizeRecoveryEmail,
} from "@/lib/passwordRecovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GENERIC_SUCCESS = {
  ok: true,
  message: "Bu e-posta ile bir hesap varsa şifre yenileme bağlantısı gönderildi.",
};

const BURST_WINDOW_MS = 10 * 60 * 1000;
const BURST_LIMIT = 12;
const burstRequests = new Map<string, { count: number; resetAt: number }>();

function requestIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown"
  );
}

function burstLimited(key: string) {
  const now = Date.now();
  const current = burstRequests.get(key);
  if (!current || current.resetAt <= now) {
    burstRequests.set(key, { count: 1, resetAt: now + BURST_WINDOW_MS });
    return false;
  }

  current.count += 1;
  if (current.count > BURST_LIMIT) return true;
  return false;
}

function genericSuccess() {
  return NextResponse.json(GENERIC_SUCCESS, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek." }, { status: 400 });
  }

  const email = normalizeRecoveryEmail(body.email);
  const target = body.target;

  if (!isValidRecoveryEmail(email) || !isPasswordRecoveryTarget(target)) {
    return NextResponse.json({ ok: false, error: "Geçerli e-posta ve hedef gerekli." }, { status: 400 });
  }

  // Admin requests arrive directly from the browser, so an IP burst guard is
  // useful there. Storefront requests may be proxied through the hosting layer and share
  // an outbound IP, so they rely on the durable per-address throttle below.
  if (target === "admin") {
    const ip = requestIp(request);
    if (burstLimited(`${ip}:admin`)) return genericSuccess();
  }

  const supabase = getSupabaseAdmin();

  // Do not reveal whether an admin account exists.
  if (target === "admin") {
    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (!adminProfile) return genericSuccess();
  }

  // Durable per-address throttle. A generic response is always returned so the
  // endpoint cannot be used to discover which e-mail addresses have accounts.
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("email_logs")
    .select("id", { count: "exact", head: true })
    .eq("template_key", "password_recovery")
    .eq("to_email", email)
    .gte("created_at", cutoff);

  if ((count || 0) >= 3) return genericSuccess();

  try {
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (linkError || !linkData) return genericSuccess();

    const properties = linkData.properties as {
      hashed_token?: string;
      action_link?: string;
    } | undefined;

    let tokenHash = properties?.hashed_token || "";
    if (!tokenHash && properties?.action_link) {
      try {
        tokenHash = new URL(properties.action_link).searchParams.get("token") || "";
      } catch {
        tokenHash = "";
      }
    }

    if (!tokenHash) return genericSuccess();

    const { data: integration } = await supabase
      .from("email_integrations")
      .select("*")
      .eq("provider", "gmail")
      .eq("status", "active")
      .not("email", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!integration) {
      console.error("ROSTA password recovery Gmail integration is not active.");
      return NextResponse.json(
        { ok: false, error: "Şifre yenileme e-postası şu anda gönderilemiyor." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const resetUrl = buildPasswordRecoveryUrl(target, tokenHash);
    const sent = await sendEmailWithIntegration(supabase, integration as any, {
      to: email,
      subject: PASSWORD_RECOVERY_SUBJECT,
      html: buildPasswordRecoveryHtml(resetUrl, target),
    });

    await supabase.from("email_logs").insert({
      provider: sent.provider,
      profile_id: integration.profile_id || null,
      to_email: email,
      subject: PASSWORD_RECOVERY_SUBJECT,
      template_key: "password_recovery",
      status: "sent",
      gmail_message_id: sent.id,
      sent_at: new Date().toISOString(),
    });

    return genericSuccess();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password recovery failed.";
    console.error("ROSTA password recovery error:", message);

    return NextResponse.json(
      { ok: false, error: "Şifre yenileme e-postası şu anda gönderilemiyor." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
