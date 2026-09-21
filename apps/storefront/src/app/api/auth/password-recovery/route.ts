import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ORIGIN = (process.env.ADMIN_API_ORIGIN || "https://ruthcommerce.zeabur.app").replace(/\/+$/, "");

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("tr-TR") : "";
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Geçersiz istek." }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Geçerli bir e-posta adresi gerekli." }, { status: 400 });
  }

  try {
    const response = await fetch(`${ADMIN_ORIGIN}/api/auth/password-recovery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, target: "storefront" }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: data.error || "Şifre yenileme e-postası şu anda gönderilemiyor." },
        { status: response.status >= 500 ? 503 : response.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Bu e-posta ile bir hesap varsa şifre yenileme bağlantısı gönderildi.",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Şifre yenileme servisine şu anda ulaşılamıyor." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
