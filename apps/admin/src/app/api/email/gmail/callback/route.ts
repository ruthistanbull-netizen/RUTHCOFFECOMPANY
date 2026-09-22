import { NextResponse } from "next/server";
import { exchangeGmailCode, encryptRefreshToken, getGoogleEmail } from "@/lib/gmail";
import { ROSTA_PANEL_URL } from "@/lib/platform";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect(status: "connected" | "error", message?: string) {
  const url = new URL("/email", ROSTA_PANEL_URL);
  url.searchParams.set("gmail", status);
  if (message) url.searchParams.set("message", message.slice(0, 180));
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = String(url.searchParams.get("code") || "").trim();
  const state = String(url.searchParams.get("state") || "").trim();
  const oauthError = String(url.searchParams.get("error") || "").trim();
  if (oauthError) return redirect("error", oauthError);
  if (!code || !state) return redirect("error", "Google dönüş bilgisi eksik.");

  const supabase = getSupabaseAdmin();
  try {
    const { data: oauthState, error: stateError } = await supabase
      .from("email_oauth_states")
      .select("id,profile_id,redirect_uri,expires_at")
      .eq("provider", "gmail")
      .eq("state", state)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (stateError || !oauthState) throw new Error("Gmail bağlantı isteği geçersiz veya süresi dolmuş.");

    // State is one-time. Delete before talking to Google so replay is impossible.
    await supabase.from("email_oauth_states").delete().eq("id", oauthState.id);

    const tokens = await exchangeGmailCode(code, String(oauthState.redirect_uri));
    const email = await getGoogleEmail(tokens.access_token);

    const { data: existing } = await supabase
      .from("email_integrations")
      .select("id,refresh_token")
      .eq("provider", "gmail")
      .eq("profile_id", oauthState.profile_id)
      .maybeSingle();

    const refreshToken = tokens.refresh_token
      ? encryptRefreshToken(tokens.refresh_token)
      : String(existing?.refresh_token || "").trim();
    if (!refreshToken) throw new Error("Google refresh token vermedi. Gmail bağlantısını yeniden dene.");

    const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();
    const payload = {
      provider: "gmail",
      profile_id: oauthState.profile_id,
      email,
      sender_name: "ROSTA Coffee Co.",
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      status: "active",
      updated_at: new Date().toISOString(),
    };

    const { error: integrationError } = await supabase
      .from("email_integrations")
      .upsert(payload, { onConflict: "provider,profile_id" });
    if (integrationError) throw new Error(integrationError.message);

    return redirect("connected");
  } catch (error) {
    return redirect("error", error instanceof Error ? error.message : "Gmail bağlantısı tamamlanamadı.");
  }
}
