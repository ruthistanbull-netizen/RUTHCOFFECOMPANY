import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

function configuredAdminEmails() {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
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

  let { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,auth_user_id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    return { error: NextResponse.json({ ok: false, error: profileError.message }, { status: 500 }) };
  }

  const email = String(userData.user.email || "").trim().toLowerCase();
  const bootstrapAllowed = Boolean(email && configuredAdminEmails().includes(email));
  if ((!profile || String(profile.role || "").toLowerCase() !== "admin") && bootstrapAllowed) {
    const { data: provisioned, error: provisionError } = await supabase
      .from("profiles")
      .upsert({
        auth_user_id: userData.user.id,
        email,
        full_name: String(userData.user.user_metadata?.full_name || email.split("@")[0] || "ROSTA Admin"),
        role: "admin",
        updated_at: new Date().toISOString(),
      }, { onConflict: "auth_user_id" })
      .select("id,email,full_name,role,auth_user_id")
      .single();

    if (provisionError) {
      return { error: NextResponse.json({ ok: false, error: provisionError.message }, { status: 500 }) };
    }
    profile = provisioned;
  }

  if (!profile || String(profile.role || "").toLowerCase() !== "admin") {
    return { error: NextResponse.json({ ok: false, error: "Bu panele erişim yetkin yok." }, { status: 403 }) };
  }

  return { supabase, user: userData.user, profile };
}
