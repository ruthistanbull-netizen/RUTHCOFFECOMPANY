import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/auth";
import { gmailAuthUrl, gmailRedirectUri } from "@/lib/gmail";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { supabase, profile } = auth;
  const state = crypto.randomBytes(24).toString("hex");
  const redirectUri = gmailRedirectUri(request);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await supabase.from("email_oauth_states").insert({
    provider: "gmail",
    profile_id: profile.id,
    state,
    redirect_uri: redirectUri,
    expires_at: expiresAt,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, authUrl: gmailAuthUrl(state, redirectUri) });
}
