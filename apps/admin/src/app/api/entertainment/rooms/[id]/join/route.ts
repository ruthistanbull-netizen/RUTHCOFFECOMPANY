import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/entertainment/model";
import { check, clean, failure, hashToken, memberFields, newToken, readBody, reply, WatchError } from "@/lib/entertainment/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!isUuid(id)) throw new WatchError("Oda bulunamadı.", 404);
    const body = await readBody(request);
    const db = getSupabaseAdmin();
    const room = check(await db.from("watch_rooms").select("id,owner_id,invite_hash,closed_at,expires_at")
      .eq("id", id).maybeSingle());
    if (!room || room.closed_at || Date.parse(room.expires_at) <= Date.now()) throw new WatchError("Oda kapatılmış veya süresi dolmuş.", 410);
    const host = body.host === true;
    let invite: string | undefined;
    if (host) {
      const auth = await requireAdmin(request);
      if ("error" in auth) return auth.error;
      if (auth.user?.id !== room.owner_id) throw new WatchError("Bu odanın sahibi değilsin.", 403);
      // Reopening as owner rotates the invitation; already joined guests retain access.
      invite = newToken();
    } else {
      const supplied = clean(body.invite, 80);
      if (!/^[\w-]{43}$/.test(supplied) || hashToken(supplied) !== room.invite_hash) throw new WatchError("Davet bağlantısı geçersiz.", 403);
    }
    const token = newToken();
    const result = await db.from("watch_members").insert({ room_id: id, token_hash: hashToken(token),
      name: clean(body.name, 40) || (host ? "Oda sahibi" : "Misafir"), role: host ? "host" : "guest",
    }).select(memberFields).single();
    if (result.error?.code === "P0001") throw new WatchError("Oda dolu. En fazla 8 kişi katılabilir.", 409);
    const member = check(result);
    if (invite) check(await db.from("watch_rooms").update({ invite_hash: hashToken(invite) }).eq("id", id));
    return reply({ ok: true, session: { roomId: id, member, token, ...(invite ? { invite } : {}) } });
  } catch (error) { return failure(error); }
}
