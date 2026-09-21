import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request) {
  return (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

async function authenticatedProfile(request: Request) {
  const token = bearerToken(request);
  if (!token) return { error: "Oturum gerekli." } as const;
  const supabase = getSupabaseAdmin();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return { error: "Oturum geçersiz." } as const;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, auth_user_id, email, marketing_email_consent, marketing_email_consent_at")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (profileError || !profile) return { error: profileError?.message || "Profil bulunamadı." } as const;
  return { supabase, user: userData.user, profile } as const;
}

export async function GET(request: Request) {
  const auth = await authenticatedProfile(request);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const { data: deletionRequest } = await auth.supabase
    .from("account_deletion_requests")
    .select("id,status,requested_at,completed_at")
    .eq("profile_id", auth.profile.id)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    marketingEmailConsent: Boolean(auth.profile.marketing_email_consent),
    marketingEmailConsentAt: auth.profile.marketing_email_consent_at || null,
    deletionRequest: deletionRequest || null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const auth = await authenticatedProfile(request);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.marketingEmailConsent !== "boolean") {
    return NextResponse.json({ ok: false, error: "Geçerli iletişim tercihi gerekli." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await auth.supabase
    .from("profiles")
    .update({
      marketing_email_consent: body.marketingEmailConsent,
      marketing_email_consent_at: now,
      consent_source: "account_privacy_center",
      updated_at: now,
    })
    .eq("id", auth.profile.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, marketingEmailConsent: body.marketingEmailConsent, updatedAt: now });
}

export async function POST(request: Request) {
  const auth = await authenticatedProfile(request);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (String(body.confirmation || "").trim().toLocaleUpperCase("tr-TR") !== "HESABIMI SİL") {
    return NextResponse.json({ ok: false, error: "Onay alanına HESABIMI SİL yazmalısın." }, { status: 400 });
  }

  const { data: existing } = await auth.supabase
    .from("account_deletion_requests")
    .select("id,status,requested_at")
    .eq("profile_id", auth.profile.id)
    .in("status", ["requested", "reviewing"])
    .limit(1)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, deletionRequest: existing, alreadyRequested: true });

  const { data, error } = await auth.supabase
    .from("account_deletion_requests")
    .insert({
      profile_id: auth.profile.id,
      auth_user_id: auth.user.id,
      email: auth.profile.email || auth.user.email || null,
      status: "requested",
    })
    .select("id,status,requested_at")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await auth.supabase
    .from("profiles")
    .update({
      marketing_email_consent: false,
      marketing_email_consent_at: new Date().toISOString(),
      consent_source: "account_deletion_request",
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.profile.id);

  return NextResponse.json({ ok: true, deletionRequest: data });
}
