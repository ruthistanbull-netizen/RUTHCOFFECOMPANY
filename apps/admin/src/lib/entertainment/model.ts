export type Source = { url: string; kind: "youtube" | "video" | "website"; videoId?: string };
export type WatchRoom = {
  id: string; title: string; source_url: string; source_kind: Source["kind"];
  playing: boolean; position: number; playback_at: string; revision: number;
  sharing_member: string | null; expires_at: string; closed_at: string | null;
};
export type WatchMember = { id: string; name: string; role: "host" | "guest"; last_seen: string };
export type WatchEvent = {
  id: number; sender_id: string; recipient_id: string | null;
  kind: "chat" | "offer" | "answer" | "ice" | "ready"; body: Record<string, unknown>; created_at: string;
};
export type WatchSession = { roomId: string; member: WatchMember; token: string; invite?: string };
export type WatchSnapshot = {
  room: WatchRoom; members: WatchMember[]; events: WatchEvent[]; serverTime: number;
  iceServers: RTCIceServer[];
};
export const isUuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function parseSource(raw: string, panelOrigin?: string): Source {
  const input = raw.trim();
  if (!input || input.length > 3000) throw new Error("Geçerli bir site veya video bağlantısı gir.");
  let url: URL;
  try { url = new URL(input.includes("://") ? input : `https://${input}`); }
  catch { throw new Error("Bağlantı okunamadı. Site adresinin tamamını gir."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("HTTPS ile başlayan bir bağlantı kullan.");
  const host = url.hostname.toLowerCase();
  if (url.origin === panelOrigin || !host.includes(".") || /(^|\.)(localhost|local|internal|test)$/.test(host)
    || host.includes(":") || /^(127|10|0|169\.254|192\.168)\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) throw new Error("Herkese açık bir internet sitesi kullan.");
  // Google redirect links are unwrapped locally; the server never fetches arbitrary URLs.
  if (/^(www\.)?google\.[a-z.]+$/.test(host) && url.pathname === "/url") {
    const target = url.searchParams.get("q") || url.searchParams.get("url");
    if (target) return parseSource(target, panelOrigin);
  }
  const youtubeHost = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"].includes(host);
  const id = host === "youtu.be" ? url.pathname.split("/")[1]
    : youtubeHost ? (url.pathname === "/watch" ? url.searchParams.get("v") : /^\/(embed|shorts|live)\//.test(url.pathname) ? url.pathname.split("/")[2] : null) : null;
  if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return { url: `https://www.youtube.com/watch?v=${id}`, kind: "youtube", videoId: id };
  if (/\.(mp4|webm|ogg|ogv|m4v|mov)$/i.test(url.pathname)) return { url: url.href, kind: "video" };
  return { url: url.href, kind: "website" };
}

export function playbackPosition(room: Pick<WatchRoom, "position" | "playing" | "playback_at">, now: number) {
  return Math.max(0, Number(room.position) + (room.playing ? Math.max(0, now - Date.parse(room.playback_at)) / 1000 : 0));
}
