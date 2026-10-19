"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Notice, PageHeader, PageShell, LoadingState } from "@ruth-commerce/ui";
import { saveWatchSession, watchRequest } from "@/lib/entertainment/client";
import type { WatchRoom, WatchSession } from "@/lib/entertainment/model";
import styles from "./entertainment.module.css";

export default function EntertainmentHub() {
  const router = useRouter();
  const [rooms, setRooms] = useState<WatchRoom[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true); setError("");
    try { setRooms((await watchRequest<{ rooms: WatchRoom[] }>("/api/entertainment/rooms", { admin: true })).rooms); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  function enter(session: WatchSession) {
    saveWatchSession(session);
    router.push(`/eglence/oda/${session.roomId}${session.invite ? `#davet=${session.invite}` : ""}`);
  }
  async function create(event: FormEvent) {
    event.preventDefault(); if (pending) return;
    setPending(true); setError("");
    try {
      enter((await watchRequest<{ session: WatchSession }>("/api/entertainment/rooms", { admin: true, method: "POST", body: { url, title, name } })).session);
    } catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  async function reopen(id: string) {
    if (pending) return;
    setPending(true); setError("");
    try { enter((await watchRequest<{ session: WatchSession }>(`/api/entertainment/rooms/${id}/join`, { admin: true, method: "POST", body: { host: true, name } })).session); }
    catch (e) { setError((e as Error).message); }
    finally { setPending(false); }
  }
  return <PageShell className={styles.page} width="wide">
    <PageHeader title="Eğlence" description="Bir bağlantı, bir oda. Davet et ve birlikte izle." />
    {error ? <Notice tone="danger" title={error} action={<Button type="button" variant="secondary" onClick={() => void load()}>Tekrar dene</Button>} /> : null}
    <div className={styles.columns}>
      <Card className={styles.stack}>
        <h2 className="ruth-type-section-title">İzleme odası oluştur</h2>
        <form onSubmit={create} className={styles.stack}>
          <Input label="Site veya video bağlantısı" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={3000} required autoCapitalize="none" autoCorrect="off" inputMode="url" />
          <Input label="Oda adı" placeholder="Bu akşam ne izliyoruz?" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          <Input label="Adın" placeholder="Oda sahibi" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          <Button type="submit" loading={pending}>Oda oluştur</Button>
        </form>
      </Card>
      <Card className={styles.stack}>
        <h2 className="ruth-type-section-title">Nasıl çalışır?</h2>
        <ol className={styles.steps}><li>Siteyi veya video bağlantısını yapıştır.</li><li>Davet bağlantısını arkadaşınla paylaş. Panel hesabı gerekmez.</li><li>YouTube veya video dosyasında oynat, duraklat ve ileri sar; diğerleri seni takip eder.</li></ol>
        <Notice tone="info" title="Herhangi bir siteden izlemek için" description="Bilgisayardan siteyi açıp Sekmeyi paylaş seçeneğini kullan. Misafirler telefondan da izleyebilir. Tarayıcıda sekme sesi paylaşımını seç. Bazı korumalı yayınlar paylaşımı engelleyebilir." />
        <p className="ruth-type-caption">Odalar 24 saat açık kalır. Bir odaya en fazla 8 kişi katılabilir.</p>
      </Card>
    </div>
    <Card className={styles.stack}>
      <h2 className="ruth-type-section-title">Açık odaların</h2>
      {loading ? <LoadingState label="Odalar yükleniyor" /> : rooms.length ? rooms.map((room) => <div key={room.id} className={styles.roomRow}><div><strong>{room.title}</strong><p className={styles.url}>{room.source_url}</p></div><Button type="button" variant="secondary" disabled={pending} onClick={() => void reopen(room.id)}>Odaya dön</Button></div>) : <p>Henüz açık odan yok.</p>}
    </Card>
  </PageShell>;
}
