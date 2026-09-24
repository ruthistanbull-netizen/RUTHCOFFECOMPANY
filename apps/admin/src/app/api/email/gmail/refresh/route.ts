import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureGmailAccessToken, getGmailProfile } from "@/lib/gmail";
import { noStoreHeaders } from "@/lib/websiteRevalidate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data: integration, error } = await auth.supabase
    .from("email_integrations")
    .select("id, email, access_token, refresh_token, expires_at, sender_name, status")
    .eq("profile_id", auth.profile.id)
    .eq("provider", "gmail")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: noStoreHeaders() });
  }

  if (!integration || integration.status !== "active") {
    return NextResponse.json({ ok: true, connected: false }, { headers: noStoreHeaders() });
  }

  try {
    const accessToken = await ensureGmailAccessToken(auth.supabase, integration);
    const profile = await getGmailProfile(accessToken);
    const email = profile.emailAddress || integration.email || null;
    const updatedAt = new Date().toISOString();

    await auth.supabase
      .from("email_integrations")
      .update({ email, status: "active", updated_at: updatedAt })
      .eq("id", integration.id);

    return NextResponse.json(
      { ok: true, connected: true, email, refreshed_at: updatedAt },
      { headers: noStoreHeaders() },
    );
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Gmail bağlantısı yenilenemedi.";

    // Geçici Google/ağ hatası bağlantıyı kalıcı olarak kapatmasın. Mevcut aktif
    // durum korunur ve bir sonraki saatlik denemede otomatik olarak tekrar denenir.
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: noStoreHeaders() });
  }
}
