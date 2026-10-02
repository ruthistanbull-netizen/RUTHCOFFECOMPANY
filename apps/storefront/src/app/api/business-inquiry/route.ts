import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { normalizeBusinessInquiry, validateBusinessInquiry } from "@/lib/businessInquiry";
import { isAppointmentId } from "@ruth-commerce/commerce-core/appointments";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 20_000) return NextResponse.json({ ok: false, error: "Talep çok büyük." }, { status: 413 });
  let body: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 20_000) return NextResponse.json({ ok: false, error: "Talep çok büyük." }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Talep bilgileri okunamadı." }, { status: 400 });
  }
  if (body && typeof body === "object" && "company" in body && typeof body.company === "string" && body.company.trim()) return NextResponse.json({ ok: true }, { status: 201 });
  const form = normalizeBusinessInquiry(body);
  const errors = validateBusinessInquiry(form);
  if (Object.keys(errors).length) return NextResponse.json({ ok: false, error: "Lütfen işaretli alanları kontrol edin.", errors }, { status: 400 });
  const requestKey = body && typeof body === "object" && "requestKey" in body ? body.requestKey : crypto.randomUUID();
  if (!isAppointmentId(requestKey)) return NextResponse.json({ ok: false, error: "Talep kimliği geçerli değil." }, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  try {
    const { data, error } = await getSupabaseAdmin().rpc("submit_business_appointment", {
      p_request_key: requestKey, p_inquiry: form,
      p_ip_hash: crypto.createHash("sha256").update(`${process.env.CONTACT_IP_HASH_SALT || "rosta-contact-rate-limit-v1"}|${ip}`).digest("hex"),
    });
    if (error) {
      if (error.message.includes("appointment_rate_limited")) return NextResponse.json({ ok: false, error: "Çok fazla talep gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin." }, { status: 429 });
      if (error.message.includes("appointment_request_mismatch")) return NextResponse.json({ ok: false, error: "Talep değişmiş. Sayfayı yenileyip tekrar deneyin." }, { status: 409 });
      throw error;
    }
    if (!isAppointmentId(data)) throw new Error("Appointment save did not return an ID");
    // Keep the previous success contract for already-open storefront tabs.
    return NextResponse.json({ ok: true, appointmentId: data, messageId: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Appointment could not be saved", error instanceof Error ? error.message : "Database unavailable");
    return NextResponse.json({ ok: false, error: "Talebiniz şu anda kaydedilemedi. Bilgileriniz korundu; lütfen tekrar deneyin." }, { status: 503 });
  }
}
