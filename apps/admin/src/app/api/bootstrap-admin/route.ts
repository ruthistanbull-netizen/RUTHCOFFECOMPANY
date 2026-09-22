import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function equalSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = clean(process.env.ADMIN_BOOTSTRAP_SECRET);
  const supplied = clean(request.headers.get("x-bootstrap-secret"));
  if (!expected || !supplied || !equalSecret(expected, supplied)) {
    return NextResponse.json({ ok: false, error: "Unauthorized bootstrap request." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const email = clean(body.email).toLocaleLowerCase("tr-TR");
  const password = clean(body.password);
  const fullName = clean(body.fullName) || "ROSTA Admin";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Geçerli e-posta gerekli." }, { status: 400 });
  }
  if (password.length < 10) {
    return NextResponse.json({ ok: false, error: "Admin şifresi en az 10 karakter olmalı." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { count, error: countError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (countError) return NextResponse.json({ ok: false, error: countError.message }, { status: 500 });
  if (Number(count || 0) > 0) {
    return NextResponse.json({ ok: false, error: "Bootstrap kapalı: admin hesabı zaten mevcut." }, { status: 409 });
  }

  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, rosta_admin: true },
  });
  if (created.error || !created.data.user) {
    return NextResponse.json(
      { ok: false, error: created.error?.message || "Admin auth kullanıcısı oluşturulamadı." },
      { status: 400 },
    );
  }

  const user = created.data.user;
  const { error: profileError } = await supabase.from("profiles").upsert({
    auth_user_id: user.id,
    email,
    full_name: fullName,
    role: "admin",
    updated_at: new Date().toISOString(),
  }, { onConflict: "auth_user_id" });

  if (profileError) {
    await supabase.auth.admin.deleteUser(user.id).catch(() => null);
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    admin: { id: user.id, email },
    next: "ADMIN_BOOTSTRAP_SECRET değişkenini kaldır.",
  });
}
