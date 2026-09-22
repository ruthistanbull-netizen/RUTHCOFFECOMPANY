import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("admin_push_config")
    .select("vapid_public_key")
    .eq("id", true)
    .maybeSingle();

  if (error || !data?.vapid_public_key) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Bildirim altyapısı henüz hazır değil." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, vapidPublicKey: data.vapid_public_key });
}
