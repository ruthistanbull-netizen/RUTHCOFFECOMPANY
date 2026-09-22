import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { kickAdminPushWorker } from "@/lib/pushWorker";

export const runtime = "nodejs";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.supabase
    .from("admin_push_subscriptions")
    .select("id, endpoint, active, created_at, updated_at, last_success_at, last_error")
    .eq("admin_profile_id", auth.profile.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, subscriptions: data || [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const endpoint = clean(body.endpoint);
  const p256dh = clean(body.keys?.p256dh);
  const authKey = clean(body.keys?.auth);

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ ok: false, error: "Push aboneliği eksik." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await auth.supabase
    .from("admin_push_subscriptions")
    .upsert({
      admin_profile_id: auth.profile.id,
      endpoint,
      p256dh,
      auth_key: authKey,
      user_agent: request.headers.get("user-agent"),
      active: true,
      updated_at: now,
      last_error: null,
    }, { onConflict: "endpoint" })
    .select("id, endpoint, active, updated_at")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  await auth.supabase.from("admin_push_jobs").insert({
    kind: "test",
    dedupe_key: `push-enabled:${auth.profile.id}:${Date.now()}`,
    payload: {
      title: "ROSTA Panel bildirimleri açık",
      body: "Sipariş ve hatırlatıcı bildirimleri bu iPhone’a gönderilecek.",
    },
    target_url: "/notifications",
  });

  const worker = await kickAdminPushWorker();
  return NextResponse.json({ ok: true, subscription: data, worker });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const endpoint = clean(body.endpoint);
  if (!endpoint) return NextResponse.json({ ok: false, error: "Endpoint gerekli." }, { status: 400 });

  const { error } = await auth.supabase
    .from("admin_push_subscriptions")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("admin_profile_id", auth.profile.id)
    .eq("endpoint", endpoint);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
