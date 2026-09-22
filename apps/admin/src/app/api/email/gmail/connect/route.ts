import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { gmailAuthUrl, gmailRedirectUri } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const state = crypto.randomBytes(32).toString("hex");
    const redirectUri = gmailRedirectUri(request);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await auth.supabase.from("email_oauth_states").insert({
      provider: "gmail",
      profile_id: auth.profile.id,
      state,
      redirect_uri: redirectUri,
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      url: gmailAuthUrl(state, redirectUri),
      expiresAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Gmail bağlantısı başlatılamadı.",
    }, { status: 400 });
  }
}
