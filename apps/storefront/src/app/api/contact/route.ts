import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clientIp(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function ipHash(request: Request) {
  const salt = process.env.CONTACT_IP_HASH_SALT || "ruth-contact-rate-limit-v1";
  return crypto.createHash("sha256").update(`${salt}|${clientIp(request)}`).digest("hex");
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

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("submit_contact_message", {
    p_name: name,
    p_email: email,
    p_phone: phone || null,
    p_message: message,
    p_ip_hash: ipHash(request),
    p_user_agent: clean(request.headers.get("user-agent"), 500),
  });

  if (error) {
    const raw = String(error.message || "");
    if (raw.includes("contact_rate_limited")) {
      return NextResponse.json({ ok: false, error: "Çok fazla mesaj gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin." }, { status: 429 });
    }
    console.error("Contact message could not be saved", error);
    return NextResponse.json({ ok: false, error: "Mesajınız şu anda gönderilemedi. WhatsApp üzerinden bize ulaşabilirsiniz." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, messageId: data }, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
