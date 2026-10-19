import { isUuid, parseSource, playbackPosition } from "@/lib/entertainment/model";
import { check, clean, failure, iceServers, memberFields, readBody, reply, requireHost, roomAccess, roomFields, WatchError } from "@/lib/entertainment/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { db, room, member } = await roomAccess(request, id);
    const after = Number(new URL(request.url).searchParams.get("after") || 0);
    if (!Number.isSafeInteger(after) || after < 0) throw new WatchError("Geçersiz mesaj sırası.");
    const [members, events] = await Promise.all([
      db.from("watch_members").select(memberFields).eq("room_id", id).gt("last_seen", new Date(Date.now() - 45_000).toISOString()).order("joined_at"),
      db.from("watch_events").select("id,sender_id,recipient_id,kind,body,created_at").eq("room_id", id).gt("id", after)
        .or(`recipient_id.is.null,recipient_id.eq.${member.id}`).order("id", { ascending: true }).limit(100),
    ]);
    return reply({ ok: true, room, members: check(members), events: check(events), serverTime: Date.now(), iceServers: iceServers() });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { db, room, member } = await roomAccess(request, id);
    requireHost(member);
    const body = await readBody(request);
    if (body.revision !== room.revision) throw new WatchError("Oda güncellendi. Tekrar dene.", 409);
    const patch: Record<string, unknown> = { revision: room.revision + 1 };
    if (body.action === "source") {
      let source;
      try { source = parseSource(clean(body.url, 3001), new URL(request.url).origin); }
      catch (error) { throw new WatchError((error as Error).message); }
      Object.assign(patch, { source_url: source.url, source_kind: source.kind, position: 0, playing: false, playback_at: new Date().toISOString(), sharing_member: null });
    } else if (body.action === "playback") {
      if (!["youtube", "video"].includes(room.source_kind) || room.sharing_member) throw new WatchError("Bu kaynakta ortak video kontrolü yok.");
      if (typeof body.playing !== "boolean" || typeof body.position !== "number" || !Number.isFinite(body.position) || body.position < 0 || body.position > 604800) throw new WatchError("Geçersiz oynatma konumu.");
      Object.assign(patch, { position: body.position, playing: body.playing, playback_at: new Date().toISOString() });
    } else if (body.action === "share") {
      if (typeof body.active !== "boolean") throw new WatchError("Geçersiz paylaşım durumu.");
      if (!body.active && room.sharing_member && room.sharing_member !== member.id) throw new WatchError("Başka bir oturum paylaşım yapıyor.", 409);
      Object.assign(patch, { sharing_member: body.active ? member.id : null, playing: false, position: playbackPosition(room, Date.now()), playback_at: new Date().toISOString() });
    } else if (body.action === "close") Object.assign(patch, { closed_at: new Date().toISOString(), sharing_member: null, playing: false });
    else throw new WatchError("Geçersiz oda işlemi.");
    const updated = check(await db.from("watch_rooms").update(patch).eq("id", id).eq("revision", room.revision).is("closed_at", null).select(roomFields).maybeSingle());
    if (!updated) throw new WatchError("Oda güncellendi. Tekrar dene.", 409);
    return reply({ ok: true, room: updated });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { db, room, member } = await roomAccess(request, id);
    const body = await readBody(request);
    if (body.action === "heartbeat" || body.action === "leave") {
      check(await db.from("watch_members").update({ last_seen: new Date(body.action === "leave" ? 0 : Date.now()).toISOString() }).eq("id", member.id).eq("room_id", id));
      return reply({ ok: true });
    }
    const kind = clean(body.kind, 12);
    if (!["chat", "offer", "answer", "ice", "ready"].includes(kind)) throw new WatchError("Geçersiz mesaj.");
    const data = body.body && typeof body.body === "object" && !Array.isArray(body.body) ? body.body as Record<string, unknown> : {};
    let eventBody: Record<string, unknown>, recipient: string | null = null;
    if (kind === "chat") {
      const text = clean(data.text, 1000);
      if (!text) throw new WatchError("Mesaj boş olamaz.");
      eventBody = { text, name: member.name };
    } else {
      if (!isUuid(body.recipientId) || body.recipientId === member.id) throw new WatchError("Geçersiz alıcı.");
      recipient = body.recipientId;
      const target = check(await db.from("watch_members").select("id,role").eq("room_id", id).eq("id", recipient).maybeSingle());
      if (!target) throw new WatchError("Katılımcı bulunamadı.", 404);
      const hostSending = room.sharing_member === member.id;
      const guestToHost = member.role === "guest" && room.sharing_member === target.id;
      if (!(hostSending && target.role === "guest") && !guestToHost) throw new WatchError("Paylaşım izni yok.", 403);
      if ((kind === "offer" && !hostSending) || (kind === "answer" && !guestToHost)) throw new WatchError("Geçersiz paylaşım mesajı.", 403);
      if (kind === "ready") {
        if (!guestToHost) throw new WatchError("Geçersiz yeniden bağlanma isteği.", 403);
        eventBody = {};
      } else if (kind === "ice") {
        if (typeof data.candidate !== "string" || data.candidate.length > 4000) throw new WatchError("Geçersiz bağlantı adayı.");
        eventBody = { candidate: data.candidate, sdpMid: typeof data.sdpMid === "string" ? data.sdpMid.slice(0, 100) : null,
          sdpMLineIndex: Number.isInteger(data.sdpMLineIndex) ? data.sdpMLineIndex : null };
      } else {
        if (typeof data.sdp !== "string" || data.sdp.length > 60000) throw new WatchError("Geçersiz paylaşım teklifi.");
        eventBody = { type: kind, sdp: data.sdp };
      }
    }
    const recent = await db.from("watch_events").select("id", { count: "exact", head: true }).eq("sender_id", member.id).gt("created_at", new Date(Date.now() - 60_000).toISOString());
    check(recent);
    if ((recent.count || 0) >= 180) throw new WatchError("Biraz yavaşla ve tekrar dene.", 429);
    check(await db.from("watch_events").insert({ room_id: id, sender_id: member.id, recipient_id: recipient, kind, body: eventBody }));
    return reply({ ok: true });
  } catch (error) { return failure(error); }
}
