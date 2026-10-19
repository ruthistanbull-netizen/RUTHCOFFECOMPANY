import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid, type WatchRoom, type WatchMember } from "./model";

export const roomFields = "id,title,source_url,source_kind,playing,position,playback_at,revision,sharing_member,expires_at,closed_at";
export const memberFields = "id,name,role,last_seen";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
export class WatchError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export function reply(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
export function failure(error: unknown) {
  if (error instanceof WatchError) return reply({ ok: false, error: error.message }, error.status);
  const code = (error as { code?: string })?.code;
  console.error("[entertainment] request failed", { code });
  return reply({ ok: false, error: ["42P01", "PGRST205"].includes(code || "")
    ? "İzleme odası veritabanı kurulumu gerekiyor. Eğlence SQL kurulumunu çalıştırın."
    : "İzleme odasına ulaşılamadı. Biraz sonra tekrar dene." }, 503);
}
export function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}
export async function readBody(request: Request) {
  const text = await request.text();
  if (text.length > 70_000) throw new WatchError("İstek çok büyük.", 413);
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new WatchError("Geçersiz istek."); }
}
export async function roomAccess(request: Request, id: string) {
  if (!isUuid(id)) throw new WatchError("Oda bulunamadı.", 404);
  const token = clean(request.headers.get("x-watch-token"), 80);
  if (!/^[\w-]{43}$/.test(token)) throw new WatchError("Bu odaya davet bağlantısıyla katıl.", 401);
  const db = getSupabaseAdmin();
  const [roomResult, memberResult] = await Promise.all([
    db.from("watch_rooms").select(roomFields).eq("id", id).maybeSingle(),
    db.from("watch_members").select(memberFields).eq("room_id", id).eq("token_hash", hashToken(token)).maybeSingle(),
  ]);
  const room = check(roomResult) as WatchRoom | null;
  const member = check(memberResult) as WatchMember | null;
  if (!room || !member) throw new WatchError("Odaya erişim bulunamadı. Davet bağlantısıyla tekrar katıl.", 401);
  if (room.closed_at || Date.parse(room.expires_at) <= Date.now()) throw new WatchError("Bu oda kapatılmış veya süresi dolmuş.", 410);
  return { db, room, member };
}
export function requireHost(member: WatchMember) {
  if (member.role !== "host") throw new WatchError("Bu işlemi yalnızca oda sahibi yapabilir.", 403);
}
export function iceServers(): RTCIceServer[] {
  const raw = process.env.WATCH_PARTY_ICE_SERVERS_JSON;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length && parsed.every((v) => v && typeof v === "object" && v.urls)) return parsed;
    } catch { /* Invalid optional deployment configuration uses STUN only. */ }
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}
