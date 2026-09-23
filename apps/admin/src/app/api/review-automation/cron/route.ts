import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveEmailIntegration } from "@/lib/mailDelivery";
import { reviewSettings, sendReviewRequests } from "@/lib/reviewAutomation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function incomingCronSecret(request: Request) {
  return clean(
    request.headers.get("x-cron-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "",
  );
}

async function runReviewQueue(supabase: any, profileId: string) {
  try {
    const settings = await reviewSettings(supabase);
    if (!settings.enabled) {
      return NextResponse.json({ ok: true, sent: 0, failed: 0, skipped: 0 });
    }

    const cutoff = new Date(
      Date.now() - settings.delayDaysAfterDelivered * 86_400_000,
    ).toISOString();

    const orders = await supabase
      .from("orders")
      .select("id")
      .in("status", ["delivered", "completed", "fulfilled"])
      .lte("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(100);

    if (orders.error) throw new Error(orders.error.message);

    const ids = (orders.data || []).map((row: any) => String(row.id));
    const sentAlready = ids.length
      ? await supabase
          .from("review_request_emails")
          .select("order_id,status")
          .in("order_id", ids)
      : { data: [], error: null };

    if (sentAlready.error) throw new Error(sentAlready.error.message);

    const done = new Set(
      (sentAlready.data || [])
        .filter((row: any) => row.status === "sent")
        .map((row: any) => String(row.order_id)),
    );
    const pending = ids.filter((id: string) => !done.has(id));

    const result = await sendReviewRequests(supabase, profileId, pending);
    return NextResponse.json({
      ok: true,
      ...result,
      skipped: result.skipped + done.size,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error
          ? error.message
          : "Değerlendirme otomasyonu çalıştırılamadı.",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  return runReviewQueue(auth.supabase, auth.profile.id);
}

export async function GET(request: Request) {
  const expectedSecret = clean(process.env.CRON_SECRET);
  const suppliedSecret = incomingCronSecret(request);

  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET yapılandırılmamış." },
      { status: 503 },
    );
  }
  if (!suppliedSecret || !safeEqual(suppliedSecret, expectedSecret)) {
    return NextResponse.json(
      { ok: false, error: "Cron secret hatalı." },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();

  try {
    const integration = await getActiveEmailIntegration(supabase);
    let profileId = clean(integration?.profile_id);

    if (!profileId) {
      const profile = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (profile.error) throw new Error(profile.error.message);
      profileId = clean(profile.data?.id);
    }

    if (!profileId) {
      return NextResponse.json(
        { ok: false, error: "Değerlendirme otomasyonu için admin profili bulunamadı." },
        { status: 503 },
      );
    }

    return runReviewQueue(supabase, profileId);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error
          ? error.message
          : "Değerlendirme otomasyonu başlatılamadı.",
      },
      { status: 400 },
    );
  }
}
