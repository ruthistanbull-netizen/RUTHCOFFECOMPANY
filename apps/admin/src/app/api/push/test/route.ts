import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { kickAdminPushWorker } from "@/lib/pushWorker";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;

  const { error } = await auth.supabase.from("admin_push_jobs").insert({
    kind: "test",
    dedupe_key: `manual-test:${auth.profile.id}:${crypto.randomUUID()}`,
    payload: {
      title: "ROSTA Panel test bildirimi",
      body: "Bildirimler doğru şekilde çalışıyor.",
    },
    target_url: "/notifications",
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const worker = await kickAdminPushWorker();
  if (!worker.ok) return NextResponse.json({ ok: false, error: worker.error }, { status: 502 });
  return NextResponse.json({ ok: true, worker });
}
