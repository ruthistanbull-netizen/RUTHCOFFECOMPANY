import { requireAdmin } from "@/lib/auth";
import { parseSource } from "@/lib/entertainment/model";
import { check, clean, failure, hashToken, memberFields, newToken, readBody, reply, roomFields, WatchError } from "@/lib/entertainment/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) return auth.error;
    if (!auth.user?.id) throw new WatchError("Yönetici oturumu gerekli.", 401);
    const rooms = check(await auth.supabase.from("watch_rooms").select(roomFields)
      .eq("owner_id", auth.user.id).is("closed_at", null).gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }).limit(20));
    return reply({ ok: true, rooms });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request);
    if ("error" in auth) return auth.error;
    if (!auth.user?.id) throw new WatchError("Yönetici oturumu gerekli.", 401);
    const body = await readBody(request);
    let source;
    try { source = parseSource(clean(body.url, 3001), new URL(request.url).origin); }
    catch (error) { throw new WatchError((error as Error).message); }
    // Expiry bounds storage and removes old room messages/candidates by cascade.
    check(await auth.supabase.from("watch_rooms").delete().lt("expires_at", new Date().toISOString()));
    const active = check(await auth.supabase.from("watch_rooms").select("id").eq("owner_id", auth.user.id).is("closed_at", null));
    if ((active || []).length >= 10) throw new WatchError("Yeni oda açmadan önce eski odalardan birini kapat.", 409);
    const invite = newToken(), token = newToken();
    const room = check(await auth.supabase.from("watch_rooms").insert({
      owner_id: auth.user.id, title: clean(body.title, 80) || "Birlikte izleyelim",
      source_url: source.url, source_kind: source.kind, invite_hash: hashToken(invite),
    }).select(roomFields).single());
    if (!room) throw new WatchError("Oda oluşturulamadı.", 503);
    const memberResult = await auth.supabase.from("watch_members").insert({ room_id: room.id,
      token_hash: hashToken(token), name: clean(body.name, 40) || "Oda sahibi", role: "host",
    }).select(memberFields).single();
    if (memberResult.error) { await auth.supabase.from("watch_rooms").delete().eq("id", room.id); throw memberResult.error; }
    return reply({ ok: true, room, session: { roomId: room.id, member: memberResult.data, token, invite } }, 201);
  } catch (error) { return failure(error); }
}
