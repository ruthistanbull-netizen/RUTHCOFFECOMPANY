import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

function sameSecret(left: string, right: string) {
  try {
    const a = Buffer.from(left, "utf8");
    const b = Buffer.from(right, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function internalAdmin(request: Request) {
  const supplied = String(request.headers.get("x-rosta-internal-secret") || "").trim();
  if (!supplied) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("automation_cron_config")
    .select("secret")
    .eq("id", true)
    .maybeSingle();

  const expected = String(data?.secret || "").trim();
  if (error || !expected || !sameSecret(supplied, expected)) return null;

  return {
    supabase,
    user: {
      id: "00000000-0000-0000-0000-000000000000",
      email: "system@rosta.local",
      user_metadata: { panel_status: "active", system_worker: true },
    } as any,
    profile: {
      id: "00000000-0000-0000-0000-000000000000",
      email: "system@rosta.local",
      full_name: "ROSTA Platform Worker",
      role: "admin",
    },
    internalSecret: supplied,
    internal: true as const,
  };
}

export async function requireAdmin(request: Request) {
  const internal = await internalAdmin(request);
  if (internal) return internal;

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

  return {
    supabase,
    user: userData.user,
    profile,
    internal: false as const,
  };
}
