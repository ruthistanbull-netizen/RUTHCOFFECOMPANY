import { NextResponse } from "next/server";

export const appointmentColumns = "id,source,context,inquiry,business_name,contact_name,scheduled_date,scheduled_time,meeting,address,status,admin_notes,revision,created_at,updated_at";
export function appointmentFailure(error: { code?: string; message?: string }) {
  if (error.code === "23505") return NextResponse.json({ ok: false, error: "Bu saat için onaylı bir randevu var. Başka bir saat seçin." }, { status: 409 });
  if (error.message?.includes("appointment_request_mismatch")) return NextResponse.json({ ok: false, error: "Bu talep kimliği farklı bir randevuda kullanılmış. Yeniden deneyin." }, { status: 409 });
  if (error.message?.includes("invalid_appointment")) return NextResponse.json({ ok: false, error: "Randevu bilgilerini ve gelecekte bir saat seçtiğinizi kontrol edin." }, { status: 400 });
  console.error("Appointment database request failed", error.code || "unavailable");
  return NextResponse.json({ ok: false, error: "Randevu işlemi tamamlanamadı. Lütfen tekrar deneyin." }, { status: 503 });
}
export async function readAppointmentBody(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get("content-length")) > 24_000) return null;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 24_000) return null;
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}
