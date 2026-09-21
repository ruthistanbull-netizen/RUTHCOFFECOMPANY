import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeBirthDate } from "@/lib/manualDate";

export const runtime = "nodejs";

function token(request: Request) {
  return (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

export async function POST(request: Request) {
  try {
    const access = token(request);
    if (!access) return NextResponse.json({ ok: false, error: "Oturum bulunamadı." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabase.auth.getUser(access);
    if (userError || !userData.user) return NextResponse.json({ ok: false, error: "Oturum geçersiz." }, { status: 401 });

    const body = await request.json();
    const birthDate = normalizeBirthDate(String(body.birthDate || ""));
    if (!birthDate) return NextResponse.json({ ok: false, error: "Doğum tarihini GG.AA.YYYY biçiminde gir." }, { status: 400 });

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,birth_date")
      .eq("auth_user_id", userData.user.id)
      .single();
    if (profileError) throw new Error(profileError.message);

    if (profile.birth_date && profile.birth_date !== birthDate) {
      return NextResponse.json({ ok: false, error: "Doğum tarihi yalnızca bir kez kaydedilebilir. Değişiklik için destekle iletişime geç." }, { status: 400 });
    }

    const { error } = await supabase.from("profiles").update({ birth_date: birthDate }).eq("id", profile.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, birthDate });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Tarih kaydedilemedi." }, { status: 400 });
  }
}
