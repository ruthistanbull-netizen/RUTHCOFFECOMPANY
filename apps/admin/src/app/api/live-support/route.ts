import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (value: unknown, max = 3000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const res = (payload: Record<string, unknown>, status = 200) =>
  NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
const uuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const id = clean(url.searchParams.get("id"), 40);
  if (id) {
    if (!uuid(id)) return res({ ok: false, error: "Geçersiz görüşme." }, 400);
    const { data: thread, error } = await auth.supabase
      .from("rosta_live_support_threads")
      .select("id,name,email,status,created_at,updated_at")
      .eq("id", id).maybeSingle();
    if (error || !thread) return res({ ok: false, error: "Görüşme bulunamadı." }, 404);
    const { data: messages, error: messageError } = await auth.supabase
      .from("rosta_live_support_messages")
      .select("id,thread_id,sender,body,image_path,created_at")
      .eq("thread_id", id).order("created_at", { ascending: true }).limit(250);
    if (messageError) {
      console.error("[live-support/admin] messages read failed", { code: messageError.code, message: messageError.message });
      return res({ ok: false, error: "Mesajlar alınamadı." }, 503);
    }
    const signedMessages = await Promise.all((messages || []).map(async (item) => {
      if (!item.image_path) return { ...item, image_url: null, image_path: undefined };
      const { data: signed } = await auth.supabase.storage.from("rosta-live-support-private")
        .createSignedUrl(item.image_path, 10 * 60);
      return { ...item, image_url: signed?.signedUrl || null, image_path: undefined };
    }));
    return res({ ok: true, thread, messages: signedMessages });
  }
  const { data, error } = await auth.supabase
    .from("rosta_live_support_threads")
    .select("id,name,email,status,created_at,updated_at")
    .order("updated_at", { ascending: false }).limit(150);
  if (error) {
    console.error("[live-support/admin] thread list failed", { code: error.code, message: error.message });
    return res({ ok: false, error: "Destek listesi alınamadı." }, 503);
  }
  return res({ ok: true, threads: data || [] });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const id = clean(body.threadId, 40);
  const message = clean(body.message);
  if (!uuid(id) || !message) return res({ ok: false, error: "Görüşme ve yanıt gerekli." }, 400);
  const { data: thread } = await auth.supabase
    .from("rosta_live_support_threads")
    .select("id,status").eq("id", id).maybeSingle();
  if (!thread || thread.status !== "active") {
    return res({ ok: false, error: "Yanıt göndermek için önce görüşmeyi kabul et." }, 409);
  }
  const { error } = await auth.supabase.from("rosta_live_support_messages")
    .insert({ thread_id: id, sender: "admin", body: message });
  if (error) {
    console.error("[live-support/admin] reply insert failed", { code: error.code, message: error.message });
    return res({ ok: false, error: "Yanıt kaydedilemedi." }, 503);
  }
  await auth.supabase.from("rosta_live_support_threads")
    .update({ status: "active", updated_at: new Date().toISOString() }).eq("id", id);
  return res({ ok: true });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const id = clean(body.threadId, 40);
  const action = clean(body.action, 24);
  if (!uuid(id) || !["accept", "reject", "close"].includes(action)) {
    return res({ ok: false, error: "Geçersiz destek işlemi." }, 400);
  }
  const status = action === "accept" ? "active" : action === "reject" ? "rejected" : "closed";
  const { data: previous } = await auth.supabase.from("rosta_live_support_threads")
    .select("id,status").eq("id", id).maybeSingle();
  if (!previous || ["closed", "rejected"].includes(previous.status)) {
    return res({ ok: false, error: "Bu görüşme zaten sonlandırılmış." }, 409);
  }
  const { error } = await auth.supabase.from("rosta_live_support_threads")
    .update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error("[live-support/admin] status change failed", { code: error.code, message: error.message });
    return res({ ok: false, error: "İşlem gerçekleştirilemedi." }, 503);
  }
  const systemMessage = action === "reject"
    ? "Şu anda canlı destek hizmeti veremiyoruz. Sorununla ilgili detayları yazarsan seninle e-posta üzerinden iletişime geçeceğiz."
    : action === "close" ? "Canlı destek görüşmesi sonlandırıldı."
    : "Canlı destek görüşmen başladı.";
  await auth.supabase.from("rosta_live_support_messages")
    .insert({ thread_id: id, sender: "system", body: systemMessage });
  return res({ ok: true, status });
}
