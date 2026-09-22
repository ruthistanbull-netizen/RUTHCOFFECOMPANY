import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

export async function requireAdmin(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ ok: false, error: "Oturum yok." }, { status: 401 }) };
  }

  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: NextResponse.json({ ok: false, error: "Oturum geçersiz." }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,auth_user_id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    return { error: NextResponse.json({ ok: false, error: profileError.message }, { status: 500 }) };
  }

  if (!profile || String(profile.role || "").toLowerCase() !== "admin") {
    return { error: NextResponse.json({ ok: false, error: "Bu panele erişim yetkin yok." }, { status: 403 }) };
  }

  return { supabase, user: userData.user, profile };
}
