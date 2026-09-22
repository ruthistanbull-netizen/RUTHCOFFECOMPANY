import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { sendOrderConfirmationEmail } from "@/lib/orderConfirmationEmail";
import { kickAdminPushWorker } from "@/lib/pushWorker";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifySignature(body: string, timestamp: string, signature: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const numericTimestamp = Number(timestamp);
  if (!secret || !Number.isFinite(numericTimestamp) || Math.abs(Date.now() - numericTimestamp) > MAX_CLOCK_SKEW_MS) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return safeEqual(expected, signature);
}

export async function POST(request: Request) {
  const timestamp = request.headers.get("x-rosta-timestamp") || "";
  const signature = request.headers.get("x-rosta-signature") || "";
  const rawBody = await request.text();

  if (!verifySignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ ok: false, error: "İç servis imzası geçersiz." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 });
  }

  const orderId = typeof body.order_id === "string" ? body.order_id.trim() : "";
  if (!orderId) return NextResponse.json({ ok: false, error: "Sipariş id yok." }, { status: 400 });

  const supabase = getSupabaseAdmin();
  try {
    // The paid-order DB trigger has already enqueued the admin push job by the
    // time this durable post-payment endpoint is called. Kick delivery here so
    // the customer confirmation e-mail and the admin order notification begin
    // together instead of waiting for the once-per-minute recovery tick.
    const [emailResult, pushResult] = await Promise.allSettled([
      sendOrderConfirmationEmail(supabase, orderId),
      kickAdminPushWorker(),
    ]);

    if (pushResult.status === "rejected") {
      console.warn("Sipariş push worker anlık tetiklenemedi; dakikalık fallback devrede.", {
        orderId,
        error: pushResult.reason instanceof Error ? pushResult.reason.message : String(pushResult.reason),
      });
    } else if (!pushResult.value.ok) {
      console.warn("Sipariş push worker anlık gönderimi tamamlayamadı; dakikalık fallback devrede.", {
        orderId,
        result: pushResult.value,
      });
    }

    if (emailResult.status === "rejected") throw emailResult.reason;
    return NextResponse.json({
      ...emailResult.value,
      push: pushResult.status === "fulfilled" ? pushResult.value : { ok: false, fallback: true },
    }, { status: emailResult.value.ok ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Sipariş onay maili gönderilemedi.",
    }, { status: 500 });
  }
}