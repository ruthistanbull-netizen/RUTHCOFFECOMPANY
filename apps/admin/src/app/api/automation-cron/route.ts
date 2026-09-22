import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { GET as runAbandonedCartCron } from "@/app/api/email/abandoned-cart/cron/route";
import { GET as runReviewRequestCron } from "@/app/api/review-automation/cron/route";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function incomingSecret(request: Request) {
  return clean(
    request.headers.get("x-automation-cron-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "",
  );
}

async function responsePayload(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function internalCronRequest(request: Request, path: string, secret: string) {
  const target = new URL(path, request.url);
  return new Request(target.toString(), {
    method: "GET",
    headers: {
      authorization: `Bearer ${secret}`,
      "x-cron-secret": secret,
    },
  });
}

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  const suppliedSecret = incomingSecret(request);
  const { data: config, error: configError } = await supabase
    .from("automation_cron_config")
    .select("secret")
    .eq("id", true)
    .maybeSingle();

  if (configError) {
    return NextResponse.json({ ok: false, error: `Cron yapılandırması okunamadı: ${configError.message}` }, { status: 500 });
  }

  const databaseSecret = clean(config?.secret);
  if (!databaseSecret) {
    return NextResponse.json({ ok: false, error: "Automation cron secret bulunamadı." }, { status: 503 });
  }
  if (!suppliedSecret || !safeEqual(suppliedSecret, databaseSecret)) {
    return NextResponse.json({ ok: false, error: "Automation cron secret hatalı." }, { status: 401 });
  }

  // Normal panel çağrılarında mevcut CRON_SECRET korunur. Render ortamında bu
  // değişken yoksa DB secret'ı yalnız server process içindeki handler doğrulaması
  // için kullanılır; URL/query veya client cevabına taşınmaz.
  const internalSecret = clean(process.env.CRON_SECRET) || databaseSecret;
  if (!clean(process.env.CRON_SECRET)) process.env.CRON_SECRET = internalSecret;

  const kind = clean(new URL(request.url).searchParams.get("kind") || "all").toLowerCase();
  const startedAt = new Date().toISOString();
  const result: Record<string, unknown> = { startedAt, kind };
  let ok = true;

  if (kind === "all" || kind === "abandoned") {
    try {
      const response = await runAbandonedCartCron(
        internalCronRequest(request, "/api/email/abandoned-cart/cron", internalSecret),
      );
      const payload = await responsePayload(response);
      result.abandoned = { status: response.status, ...payload };
      if (!response.ok || payload?.ok === false) ok = false;
    } catch (error) {
      ok = false;
      result.abandoned = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  if (kind === "all" || kind === "review") {
    try {
      const response = await runReviewRequestCron(
        internalCronRequest(request, "/api/review-automation/cron", internalSecret),
      );
      const payload = await responsePayload(response);
      result.review = { status: response.status, ...payload };
      if (!response.ok || payload?.ok === false) ok = false;
    } catch (error) {
      ok = false;
      result.review = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const finishedAt = new Date().toISOString();
  result.finishedAt = finishedAt;

  await supabase.from("site_settings").upsert({
    setting_key: `automation_cron_last_run_${kind}`,
    setting_value: { ok, ...result },
    is_public: false,
    updated_at: finishedAt,
  }, { onConflict: "setting_key" });

  return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 500 });
}
