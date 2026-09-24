import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getActiveEmailIntegration, verifyEmailIntegration } from "@/lib/mailDelivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function publicIntegration(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    email: row.email,
    sender_name: row.sender_name,
    status: row.status,
    expires_at: row.expires_at,
    updated_at: row.updated_at,
    shared: false,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("email_integrations")
    .select("id,provider,email,sender_name,status,expires_at,updated_at")
    .eq("profile_id", auth.profile.id)
    .eq("provider", "gmail")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const integrations = (data || []).map((row: any) => publicIntegration(row));
  const activeIntegration = integrations.find((item: any) =>
    item?.provider === "gmail" && ["active", "connected"].includes(String(item.status || ""))
  ) || null;

  return NextResponse.json({
    ok: true,
    integrations,
    activeIntegration,
    integration: activeIntegration || integrations[0] || null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  try {
    const integration = await getActiveEmailIntegration(auth.supabase, auth.profile.id);
    if (!integration) {
      return NextResponse.json({
        ok: false,
        code: "gmail_not_connected",
        error: "Önce Gmail hesabını bağla.",
      }, { status: 400 });
    }

    const verified = await verifyEmailIntegration(auth.supabase, integration);
    return NextResponse.json({
      ok: true,
      provider: "gmail",
      email: integration.email,
      gmail_email: verified.profile?.emailAddress || integration.email,
      ready: true,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      code: "gmail_not_ready",
      error: error instanceof Error ? error.message : "Gmail bağlantısı gönderime hazır değil.",
    }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const provider = clean(body.provider || "gmail").toLowerCase();
  const senderName = clean(body.sender_name) || "ROSTA Coffee Co.";

  if (provider !== "gmail") {
    return NextResponse.json({ ok: false, error: "Yalnız Gmail mail sağlayıcısı destekleniyor." }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("email_integrations")
    .update({ sender_name: senderName, updated_at: new Date().toISOString() })
    .eq("provider", "gmail")
    .eq("profile_id", auth.profile.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const provider = clean(new URL(request.url).searchParams.get("provider") || "gmail").toLowerCase();
  if (provider !== "gmail") {
    return NextResponse.json({ ok: false, error: "Yalnız Gmail mail sağlayıcısı destekleniyor." }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("email_integrations")
    .update({
      status: "disconnected",
      access_token: null,
      refresh_token: null,
      expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "gmail")
    .eq("profile_id", auth.profile.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
