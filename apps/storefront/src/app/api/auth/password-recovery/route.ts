import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CANONICAL_SUPABASE_URL } from "@/lib/supabaseRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROSTA_STORE_URL = "https://rostacoffecompany.zeabur.app";
const ROSTA_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_6Zoqk9z0WEDsvNZ79-b2Qw_fnKVuWhb";

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
    const supabase = createClient(CANONICAL_SUPABASE_URL, ROSTA_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${ROSTA_STORE_URL}/reset-password?type=recovery`,
    });
    if (error) throw error;

    return NextResponse.json(
      { ok: true, message: "Bu e-posta ile bir hesap varsa şifre yenileme bağlantısı gönderildi." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("ROSTA password recovery failed", error);
    return NextResponse.json(
      { ok: false, error: "Şifre yenileme e-postası şu anda gönderilemiyor." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
