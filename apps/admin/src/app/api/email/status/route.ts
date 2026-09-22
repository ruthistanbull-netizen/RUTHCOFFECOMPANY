import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("email_integrations")
    .select("id,provider,email,sender_name,status,expires_at,updated_at")
    .eq("profile_id", auth.profile.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const integrations = data || [];
  const activeIntegration = integrations.find((item:any) => item.provider === "gmail" && ["active","connected"].includes(String(item.status || ""))) || null;

  return NextResponse.json({
    ok: true,
    integrations,
    activeIntegration,
    integration: activeIntegration,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const provider = String(new URL(request.url).searchParams.get("provider") || "gmail");
  const { error } = await auth.supabase
    .from("email_integrations")
    .update({
      status: "disconnected",
      access_token: null,
      refresh_token: null,
      expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", provider)
    .eq("profile_id", auth.profile.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
