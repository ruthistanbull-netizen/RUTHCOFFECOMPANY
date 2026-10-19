"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button, ButtonLink, Card, CopyButton, Input, LoadingState, Notice, PageHeader } from "@ruth-commerce/ui";
import { clearWatchSession, readWatchSession, saveWatchSession, watchRequest, WatchApiError } from "@/lib/entertainment/client";
import { isUuid, playbackPosition, type WatchEvent, type WatchRoom, type WatchSession, type WatchSnapshot } from "@/lib/entertainment/model";
import SyncedPlayer, { type PlayerControls } from "./SyncedPlayer";
import { useScreenShare } from "./useScreenShare";
import styles from "./entertainment.module.css";

function SharedVideo({ stream, muted }: { stream: MediaStream; muted: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => setBlocked(true));
    return () => { video.srcObject = null; };
  }, [stream]);
  return <div className={styles.stack}><div className={styles.stage}><video ref={ref} autoPlay playsInline controls muted={muted} /></div>{blocked ? <Button type="button" onClick={() => void ref.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true))}>Paylaşımı izlemeye başla</Button> : null}</div>;
}

export default function WatchRoomView({ roomId }: { roomId: string }) {
  const [session, setSession] = useState<WatchSession | null>(null);
  const [snapshot, setSnapshot] = useState<WatchSnapshot | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [invite, setInvite] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("");
  const [pending, setPending] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [closing, setClosing] = useState(false);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [seek, setSeek] = useState("");
  const [messages, setMessages] = useState<WatchEvent[]>([]);
  const [clockOffset, setClockOffset] = useState(0);
  const player = useRef<PlayerControls>(null);
  const stage = useRef<HTMLDivElement>(null);
  const latest = useRef({ session, snapshot }); latest.current = { session, snapshot };
  const roomRef = useRef<WatchRoom | null>(null);
  const cursor = useRef(0), processed = useRef(0);
  const commands = useRef(Promise.resolve());
  const signalQueue = useRef(Promise.resolve());
  const playbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const host = session?.member.role === "host";
  const endpoint = `/api/entertainment/rooms/${roomId}`;

  useEffect(() => {
    const params = new URLSearchParams(location.hash.slice(1));
    const saved = readWatchSession(roomId);
    setSession(saved); setInvite(saved?.invite || params.get("davet") || ""); setInitialized(true);
    if (!isUuid(roomId)) { setTerminal(true); setError("Oda bağlantısı geçersiz."); }
  }, [roomId]);

  const accept = useCallback((data: WatchSnapshot) => {
    if (roomRef.current && data.room.revision < roomRef.current.revision) data = { ...data, room: roomRef.current };
    roomRef.current = data.room;
    setSnapshot(data);
    cursor.current = Math.max(cursor.current, ...data.events.map((event) => Number(event.id)));
  }, []);

  const command = useCallback((body: Record<string, unknown>) => {
    const work = commands.current.catch(() => {}).then(async () => {
      const active = latest.current.session;
      if (!active || !roomRef.current) throw new Error("Oda henüz hazır değil.");
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const currentRoom = roomRef.current;
          if (!currentRoom) throw new Error("Oda henüz hazır değil.");
          const result: { room: WatchRoom } = await watchRequest<{ room: WatchRoom }>(endpoint, { method: "PATCH", session: active, body: { ...body, revision: currentRoom.revision } });
          roomRef.current = result.room;
          setSnapshot((value) => value ? { ...value, room: result.room } : value);
          return;
        } catch (e) {
          if (!(e instanceof WatchApiError) || e.status !== 409 || attempt) throw e;
          const fresh = await watchRequest<WatchSnapshot>(`${endpoint}?after=${cursor.current}`, { session: active });
          accept(fresh);
        }
      }
    });
    commands.current = work;
    return work;
  }, [endpoint, accept]);
  const sendSignal = useCallback(async (recipientId: string, kind: "offer" | "answer" | "ice", body: Record<string, unknown>) => {
    const active = latest.current.session; if (!active) return;
    await watchRequest(endpoint, { session: active, method: "POST", body: { kind, body, recipientId } });
  }, [endpoint]);
  const setSharing = useCallback((active: boolean) => command({ action: "share", active }), [command]);
  const sharing = useScreenShare(terminal ? null : session, snapshot, sendSignal, setSharing, setError);

  useEffect(() => {
    if (!session || terminal) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>, heartbeatAt = 0;
    const controller = new AbortController();
    async function poll() {
      try {
        const start = Date.now();
        const data = await watchRequest<WatchSnapshot>(`${endpoint}?after=${cursor.current}`, { session: session!, signal: controller.signal });
        if (cancelled) return;
        setClockOffset(data.serverTime - (start + Date.now()) / 2);
        accept(data); setConnection("");
        if (Date.now() - heartbeatAt >= 15_000) {
          if (!heartbeatAt && session!.member.role === "guest" && data.room.sharing_member) {
            await watchRequest(endpoint, { session: session!, method: "POST", body: { kind: "ready", recipientId: data.room.sharing_member, body: {} }, signal: controller.signal });
          }
          await watchRequest(endpoint, { session: session!, method: "POST", body: { action: "heartbeat" }, signal: controller.signal });
          heartbeatAt = Date.now();
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof WatchApiError && [401, 403, 410].includes(e.status)) {
          clearWatchSession(roomId); setError(e.message); setTerminal(true); return;
        }
        setConnection("Bağlantı kesildi. Yeniden bağlanılıyor…");
      }
      if (!cancelled) timer = setTimeout(poll, document.hidden ? 5000 : 1200);
    }
    void poll();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [session, endpoint, roomId, terminal, accept]);

  useEffect(() => {
    if (!snapshot) return;
    const events = snapshot.events.filter((event) => Number(event.id) > processed.current);
    if (!events.length) return;
    processed.current = Math.max(...events.map((event) => Number(event.id)));
    setMessages((previous) => [...previous, ...events.filter((event) => event.kind === "chat")].slice(-100));
    signalQueue.current = signalQueue.current.then(async () => {
      for (const event of events) if (event.kind !== "chat") {
        // Ignore historical negotiation after a reload/rejoin or a stopped share.
        if (Date.now() - Date.parse(event.created_at) > 45_000) continue;
        await sharing.handleEvent(event);
      }
    }).catch((e) => setError(`Paylaşım bağlantısı: ${(e as Error).message}`));
  }, [snapshot, sharing.handleEvent]);
  useEffect(() => () => { if (playbackTimer.current) clearTimeout(playbackTimer.current); }, []);

  async function join(event: FormEvent) {
    event.preventDefault(); if (pending || !invite) return;
    setPending(true); setError("");
    try {
      const result = await watchRequest<{ session: WatchSession }>(`${endpoint}/join`, { method: "POST", body: { invite, name } });
      saveWatchSession(result.session); setSession(result.session);
    } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  async function run(action: () => Promise<void>) {
    if (pending) return;
    setPending(true); setError("");
    try { await action(); } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  function playback(position: number, playing: boolean) {
    if (!host) return;
    if (playbackTimer.current) clearTimeout(playbackTimer.current);
    playbackTimer.current = setTimeout(() => { void command({ action: "playback", position, playing }).catch((e) => setError((e as Error).message)); }, 180);
  }
  async function leave() {
    if (sharing.stream) await sharing.stop();
    await watchRequest(endpoint, { session: session!, method: "POST", body: { action: "leave" } }).catch(() => {});
    clearWatchSession(roomId); location.assign(host ? "/eglence" : `/eglence/oda/${roomId}${invite ? `#davet=${invite}` : ""}`);
  }
  function fullScreen() {
    if (!stage.current?.requestFullscreen) { setError("Tam ekran için videonun kendi tam ekran kontrolünü kullan."); return; }
    void stage.current.requestFullscreen().catch(() => setError("Tam ekran için videonun kendi tam ekran kontrolünü kullan."));
  }

  if (!initialized) return <main className={styles.roomRoot}><LoadingState label="İzleme odası hazırlanıyor" /></main>;
  if (terminal) return <main className={styles.roomRoot}><Card className={`${styles.stack} ${styles.join}`}><h1 className="ruth-type-page-title">Odaya erişilemiyor</h1><Notice tone="warning" title={error || "Oda kapatıldı."} />{host ? <ButtonLink href="/eglence">Eğlenceye dön</ButtonLink> : null}</Card></main>;
  if (!session) return <main className={styles.roomRoot}><Card className={`${styles.stack} ${styles.join}`}>
    <h1 className="ruth-type-page-title">Birlikte izleyelim</h1><p>Davet edildiğin odaya katıl. Panel hesabı gerekmez.</p>
    {error ? <Notice tone="danger" title={error} /> : null}
    {invite ? <form className={styles.stack} onSubmit={join}><Input label="Adın" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required /><Button type="submit" loading={pending}>Odaya katıl</Button></form> : <Notice tone="warning" title="Davet bağlantısı eksik" description="Oda sahibinden davet bağlantısının tamamını iste." />}
  </Card></main>;
  if (!snapshot) return <main className={styles.roomRoot}><LoadingState label="Odaya bağlanılıyor" />{connection ? <Notice tone="warning" title={connection} /> : null}</main>;
  const room = snapshot.room;
  const shareStream = sharing.stream || sharing.receiving;
  const shareHostOnline = snapshot.members.some((member) => member.id === room.sharing_member);
  const inviteUrl = invite ? `${location.origin}/eglence/oda/${roomId}#davet=${invite}` : "";
  return <main className={styles.roomRoot}><div className={styles.roomMain}>
    <PageHeader title={room.title} description={`${session.member.name} · ${host ? "Oda sahibi" : "Misafir"} · ${snapshot.members.length}/8 kişi`}
      actions={<div className={styles.actions}>{host ? <ButtonLink href="/eglence" variant="secondary">Eğlence</ButtonLink> : null}<Button type="button" variant="secondary" onClick={() => void run(leave)} disabled={pending}>Odadan ayrıl</Button></div>} />
    {error ? <Notice tone="warning" title={error} onDismiss={() => setError("")} /> : null}
    {connection ? <Notice tone="warning" title={connection} /> : null}
    {host && inviteUrl ? <Card density="compact"><div className={styles.invite}><Input label="Davet bağlantısı" value={inviteUrl} readOnly onFocus={(e) => e.target.select()} /><CopyButton value={inviteUrl} label="Davet bağlantısını kopyala" /></div></Card> : null}
    <div className={styles.roomGrid}><div className={styles.stack}>
      <div ref={stage} className={styles.stack}>
        {room.sharing_member ? shareStream ? <SharedVideo stream={shareStream} muted={Boolean(sharing.stream)} /> : <div className={styles.stage}><div className={styles.stageMessage}><p>{shareHostOnline ? "Sekme paylaşımına bağlanılıyor…" : "Paylaşan kişinin bağlantısı kesildi. Yeniden katılmasını bekliyoruz."}</p></div></div>
          : room.source_kind !== "website" ? <SyncedPlayer ref={player} room={room} host={Boolean(host)} clockOffset={clockOffset} onChange={playback} />
          : <div className={styles.stage}><iframe key={room.source_url} src={room.source_url} title="Ortak site önizlemesi" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" allow="fullscreen; autoplay; encrypted-media" referrerPolicy="no-referrer" allowFullScreen /></div>}
      </div>
      <div className={styles.actions}>
        <ButtonLink href={room.source_url} target="_blank" rel="noopener noreferrer" variant="secondary">Siteyi aç</ButtonLink>
        <Button type="button" variant="secondary" onClick={fullScreen}>Tam ekran</Button>
        {host ? <Button type="button" disabled={pending} onClick={() => void run(sharing.stream ? sharing.stop : sharing.start)}>{sharing.stream ? "Paylaşımı durdur" : "Sekmeyi paylaş"}</Button> : null}
      </div>
      {room.source_kind === "website" && !room.sharing_member ? <Notice tone="info" title="Bu görünüm yalnızca siteyi açar" description={host ? "Sitedeki gezinme ve oynatma diğer kişiye otomatik yansımaz. Birlikte izlemek için Siteyi aç, ardından Sekmeyi paylaş seçeneğiyle o sekmeyi ve sesini paylaş. Site burada görünmüyorsa gömmeye izin vermiyor olabilir." : "Birlikte izlemek için oda sahibinin sekme paylaşımını başlatmasını bekle. Bu site önizlemesindeki gezinme ve oynatma kişiseldir."} /> : null}
      {host && !room.sharing_member && room.source_kind !== "website" ? <Card density="compact" className={styles.stack}>
        <div className={styles.actions}><Button type="button" disabled={pending} onClick={() => void run(async () => { const playing = !room.playing; if (playing) player.current?.play(); else player.current?.pause(); await command({ action: "playback", position: player.current?.position() ?? playbackPosition(room, Date.now() + clockOffset), playing }); })}>{room.playing ? "Herkes için duraklat" : "Herkes için oynat"}</Button></div>
        <form className={styles.seek} onSubmit={(e) => { e.preventDefault(); void run(async () => { const position = Number(seek); if (!Number.isFinite(position) || position < 0 || position > 604800) throw new Error("Geçerli bir saniye gir."); player.current?.seek(position); await command({ action: "playback", position, playing: room.playing }); }); }}><Input label="Saniyeye git" type="number" min="0" max="604800" step="1" value={seek} onChange={(e) => setSeek(e.target.value)} required /><Button type="submit" variant="secondary" disabled={pending}>Herkesi bu ana getir</Button></form>
      </Card> : !host && !room.sharing_member && room.source_kind !== "website" ? <p className="ruth-type-caption">Oynatma, duraklatma ve ileri sarma oda sahibiyle eşitlenir.</p> : null}
      {host ? <Card className={styles.stack}>
        <form className={styles.sourceForm} onSubmit={(e) => { e.preventDefault(); void run(async () => { if (sharing.stream) await sharing.stop(); await command({ action: "source", url }); setUrl(""); }); }}><Input label="Başka bir bağlantı aç" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={3000} inputMode="url" autoCapitalize="none" required /><Button type="submit" disabled={pending}>Bağlantıyı değiştir</Button></form>
        {closing ? <Notice tone="warning" title="Oda kapatılsın mı?" description="Bu davet bağlantısı ve katılımcı oturumları kullanılamaz hale gelecek." action={<div className={styles.actions}><Button type="button" variant="secondary" onClick={() => setClosing(false)}>Vazgeç</Button><Button type="button" variant="danger" disabled={pending} onClick={() => void run(async () => { if (sharing.stream) await sharing.stop(); await command({ action: "close" }); setTerminal(true); setError("Oda kapatıldı."); })}>Odayı kapat</Button></div>} /> : <Button type="button" variant="ghost" onClick={() => setClosing(true)}>Odayı kapat</Button>}
      </Card> : null}
    </div><aside className={styles.stack}>
      <Card className={styles.stack}><h2 className="ruth-type-section-title">Odadakiler</h2><ul className={styles.members}>{snapshot.members.map((member) => <li key={member.id}>{member.name}{member.role === "host" ? " · Oda sahibi" : ""}</li>)}</ul></Card>
      <Card className={styles.stack}><h2 className="ruth-type-section-title">Sohbet</h2>
        <ol className={styles.chat} aria-label="Oda mesajları" tabIndex={0}>{messages.length ? messages.map((event) => <li key={event.id}><strong>{String(event.body.name)}</strong><p>{String(event.body.text)}</p></li>) : <li>Henüz mesaj yok.</li>}</ol>
        <form className={styles.stack} onSubmit={(e) => { e.preventDefault(); void run(async () => { await watchRequest(endpoint, { session, method: "POST", body: { kind: "chat", body: { text: message } } }); setMessage(""); }); }}><Input label="Mesajın" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} required /><Button type="submit" variant="secondary" disabled={pending || !message.trim()}>Gönder</Button></form>
      </Card>
    </aside></div>
  </div></main>;
}
