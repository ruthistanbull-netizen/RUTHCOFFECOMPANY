import { NextResponse } from "next/server";
import { businessInquiryMessage, normalizeBusinessInquiry, validateBusinessInquiry } from "@/lib/businessInquiry";
import { saveContactMessage } from "@/lib/contactSubmission";

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
  const message = businessInquiryMessage(form);
  if (message.length > 4000) return NextResponse.json({ ok: false, error: "Lütfen talebinizi biraz kısaltın." }, { status: 413 });
  return saveContactMessage(request, { name: form.contactName, email: form.email, phone: form.phone, message });
}
