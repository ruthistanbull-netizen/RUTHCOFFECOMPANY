import { NextResponse } from "next/server";
import { saveContactMessage } from "@/lib/contactSubmission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 20_000) {
    return NextResponse.json({ ok: false, error: "Mesaj çok büyük." }, { status: 413 });
  }

  const body = await request.json().catch(() => ({}));
  if (clean(body.company, 120)) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const name = clean(body.name, 120);
  const email = clean(body.email, 180).toLocaleLowerCase("tr-TR");
  const phone = clean(body.phone, 40);
  const message = clean(body.message, 4000);

  if (name.length < 2) {
    return NextResponse.json({ ok: false, error: "Ad soyad gerekli." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Geçerli bir e-posta adresi gerekli." }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json({ ok: false, error: "Mesaj en az 10 karakter olmalı." }, { status: 400 });
  }

  return saveContactMessage(request, { name, email, phone, message });
}
