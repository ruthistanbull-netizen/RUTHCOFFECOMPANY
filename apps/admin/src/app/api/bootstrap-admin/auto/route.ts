import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOTSTRAP_EMAIL = String(process.env.ROSTA_ADMIN_EMAIL || process.env.ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
const BOOTSTRAP_NAME = String(process.env.ROSTA_ADMIN_NAME || "ROSTA Admin").trim();

export async function POST() {
  const enabled = String(process.env.ADMIN_BOOTSTRAP_SECRET || "").trim();
  const password = String(process.env.PASSWORD || "").trim();

  if (!enabled) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_BOOTSTRAP_SECRET tanımlı değil." },
      { status: 503 },
    );
  }

  if (password.length < 10) {
    return NextResponse.json(
      { ok: false, error: "PASSWORD env en az 10 karakter olmalı." },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: existingProfile, error: profileLookupError } = await supabase
    .from("profiles")
    .select("id,auth_user_id,email,role")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (profileLookupError) {
    return NextResponse.json(
      { ok: false, error: profileLookupError.message },
      { status: 500 },
    );
  }

  if (existingProfile) {
    const authUserId = String(existingProfile.auth_user_id || "").trim();

    if (authUserId) {
      const current = await supabase.auth.admin.getUserById(authUserId);
      if (current.error) {
        return NextResponse.json(
          { ok: false, error: current.error.message },
          { status: 500 },
        );
      }

      // İlk giriş hiç yapılmadıysa Zeabur'daki PASSWORD env'i kaynak kabul edip
      // bootstrap hesabının şifresini yeniden eşitle. Başarılı ilk girişten sonra
      // bu blok bir daha şifreye dokunmaz.
      if (!current.data.user?.last_sign_in_at) {
        const synced = await supabase.auth.admin.updateUserById(authUserId, {
          password,
          email_confirm: true,
          user_metadata: {
            ...(current.data.user?.user_metadata || {}),
            full_name: BOOTSTRAP_NAME,
            rosta_admin: true,
          },
        });

        if (synced.error) {
          return NextResponse.json(
            { ok: false, error: synced.error.message },
            { status: 500 },
          );
        }

        return NextResponse.json({ ok: true, existing: true, passwordSynced: true });
      }
    }

    return NextResponse.json({ ok: true, existing: true });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(BOOTSTRAP_EMAIL)) {
    return NextResponse.json(
      { ok: false, error: "ROSTA_ADMIN_EMAIL veya ADMIN_BOOTSTRAP_EMAIL env tanımlı değil." },
      { status: 503 },
    );
  }

  const created = await supabase.auth.admin.createUser({
    email: BOOTSTRAP_EMAIL,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: BOOTSTRAP_NAME,
      rosta_admin: true,
    },
  });

  if (created.error || !created.data.user) {
    const message = created.error?.message || "Admin auth kullanıcısı oluşturulamadı.";

    // Auth kullanıcısı önceden oluştuysa ama profil eksik kaldıysa onu bulup admin profiline bağla.
    const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existingUser = listed.data?.users?.find(
      (user) => String(user.email || "").toLowerCase() === BOOTSTRAP_EMAIL,
    );

    if (!existingUser) {
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }

    const { error: repairError } = await supabase.from("profiles").upsert({
      auth_user_id: existingUser.id,
      email: BOOTSTRAP_EMAIL,
      full_name: BOOTSTRAP_NAME,
      role: "admin",
      updated_at: new Date().toISOString(),
    }, { onConflict: "auth_user_id" });

    if (repairError) {
      return NextResponse.json({ ok: false, error: repairError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, repaired: true });
  }

  const user = created.data.user;
  const { error: profileError } = await supabase.from("profiles").upsert({
    auth_user_id: user.id,
    email: BOOTSTRAP_EMAIL,
    full_name: BOOTSTRAP_NAME,
    role: "admin",
    updated_at: new Date().toISOString(),
  }, { onConflict: "auth_user_id" });

  if (profileError) {
    await supabase.auth.admin.deleteUser(user.id).catch(() => null);
    return NextResponse.json({ ok: false, error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, created: true });
}
