import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const success = (value: Record<string, unknown>, status = 200) =>
  NextResponse.json({ ok: true, ...value }, { status, headers: noStore });
const failure = (error: string, status = 400) =>
  NextResponse.json({ ok: false, error }, { status, headers: noStore });

async function validatedThread(id: string, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[a-f0-9]{64}$/i.test(token)) return null;
  const db = getSupabaseAdmin();
  const { data } = await db.from("rosta_live_support_threads")
    .select("id,name,email,status,created_at,updated_at")
    .eq("id", id).eq("access_hash", hash(token)).maybeSingle();
  return data ?? null;
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 2_000_000) return failure("Fotoğraf veya mesaj çok büyük.", 413);
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 20);
  const db = getSupabaseAdmin();

  if (action === "start") {
    const name = clean(body.name, 120);
    const email = clean(body.email, 200).toLowerCase();
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return failure("Destek için ad soyad ve geçerli e-posta gereklidir.");
    }
    // Prevent anonymous flooding. Guests do not need an account, but each
    // conversation has an unguessable access key never exposed to other users.
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { count, error: countError } = await db.from("rosta_live_support_threads")
      .select("id", { count: "exact", head: true })
      .eq("email", email).gte("created_at", since);
    if (countError) return failure("Destek şu anda açılamıyor.", 503);
    if ((count || 0) >= 4) return failure("Çok fazla destek talebi. Lütfen daha sonra deneyin.", 429);

    const token = randomBytes(32).toString("hex");
    const { data, error } = await db.from("rosta_live_support_threads")
      .insert({ name, email, access_hash: hash(token), status: "pending" })
      .select("id,status,created_at").single();
    if (error || !data) return failure("Canlı destek hazırlanamadı.", 503);
    return success({ thread: data, accessToken: token }, 201);
  }
  if (action === "message") {
    const id = clean(body.threadId, 40);
    const token = clean(body.accessToken, 80);
    const text = clean(body.message, 3000);
    const encoded = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    if (!text && !encoded) return failure("Mesaj veya fotoğraf gerekli.");
    if (encoded.length > 1_950_000) return failure("Fotoğraf çok büyük.", 413);
    const thread = await validatedThread(id, token);
    if (!thread) return failure("Destek oturumu bulunamadı.", 403);
    if (thread.status === "pending") {
      return failure("Temsilcimizin görüşmeyi kabul etmesi bekleniyor.", 409);
    }
    if (thread.status === "rejected" || thread.status === "closed") {
      return failure("Bu destek görüşmesi sonlandırılmış. Yeni bir destek talebi açabilirsin.", 409);
    }
    let imagePath: string | null = null;
    if (encoded) {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return failure("Fotoğraf biçimi geçersiz.");
      const buffer = Buffer.from(encoded, "base64");
      if (buffer.length > 1_400_000 || buffer.length < 32 ||
          buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
        return failure("En fazla 1,4 MB JPEG fotoğraf gönderebilirsin.", 413);
      }
      imagePath = id + "/" + randomBytes(16).toString("hex") + ".jpg";
      const { error: storageError } = await db.storage.from("rosta-live-support-private")
        .upload(imagePath, buffer, { contentType: "image/jpeg", upsert: false });
      if (storageError) return failure("Fotoğraf yüklenemedi. Tekrar deneyin.", 503);
    }
    const { error } = await db.from("rosta_live_support_messages")
      .insert({ thread_id: id, sender: "customer", body: text || "Fotoğraf", image_path: imagePath });
    if (error) {
      if (imagePath) await db.storage.from("rosta-live-support-private").remove([imagePath]);
      return failure("Mesaj gönderilemedi.", 503);
    }
    await db.from("rosta_live_support_threads")
      .update({ updated_at: new Date().toISOString() }).eq("id", id);
    return success({ sent: true }, 201);
  }
  return failure("Geçersiz işlem.");
}

export async function GET(request: Request) {
  const u = new URL(request.url);
  const id = clean(u.searchParams.get("threadId"), 40);
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const thread = await validatedThread(id, token);
  if (!thread) return failure("Görüşme yetkisi bulunamadı.", 403);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("rosta_live_support_messages")
    .select("id,thread_id,sender,body,image_path,created_at")
    .eq("thread_id", thread.id)
    .order("created_at", { ascending: true }).limit(250);
  if (error) return failure("Mesajlar alınamadı.", 503);
  const messages = await Promise.all((data || []).map(async (item) => {
    if (!item.image_path) return { ...item, image_url: null, image_path: undefined };
    const { data: signed } = await db.storage.from("rosta-live-support-private")
      .createSignedUrl(item.image_path, 10 * 60);
    return { ...item, image_url: signed?.signedUrl || null, image_path: undefined };
  }));
  return success({ thread, messages });
}
