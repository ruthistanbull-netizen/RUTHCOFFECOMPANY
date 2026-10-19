"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button, Notice } from "@ruth-commerce/ui";
import { parseSource, playbackPosition, type WatchRoom } from "@/lib/entertainment/model";
import styles from "./entertainment.module.css";
export type PlayerControls = { position: () => number; play: () => void; pause: () => void; seek: (position: number) => void };
type YoutubePlayer = { getCurrentTime: () => number; getPlayerState: () => number; playVideo: () => void; pauseVideo: () => void; seekTo: (time: number, allowSeekAhead: boolean) => void; destroy: () => void };
type YoutubeAPI = { Player: new (element: HTMLElement, options: Record<string, unknown>) => YoutubePlayer };
type YoutubeWindow = Window & { YT?: YoutubeAPI; onYouTubeIframeAPIReady?: () => void };
let youtubePromise: Promise<YoutubeAPI> | null = null;
function youtubeAPI() {
  const w = window as YoutubeWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (!youtubePromise) youtubePromise = new Promise<YoutubeAPI>((resolve, reject) => {
    const old = w.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(() => { youtubePromise = null; reject(new Error("YouTube yüklenemedi. Sayfayı yenileyip tekrar dene.")); }, 12_000);
    w.onYouTubeIframeAPIReady = () => { old?.(); clearTimeout(timer); if (w.YT) resolve(w.YT); };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script"); script.src = "https://www.youtube.com/iframe_api"; script.async = true;
      script.onerror = () => { clearTimeout(timer); script.remove(); youtubePromise = null; reject(new Error("YouTube bağlantısı kurulamadı.")); };
      document.head.appendChild(script);
    }
  });
  return youtubePromise;
}

const SyncedPlayer = forwardRef<PlayerControls, { room: WatchRoom; host: boolean; clockOffset: number; onChange: (position: number, playing: boolean) => void }>(function SyncedPlayer({ room, host, clockOffset, onChange }, ref) {
  const video = useRef<HTMLVideoElement>(null), youtube = useRef<YoutubePlayer | null>(null), mount = useRef<HTMLDivElement>(null);
  const latest = useRef({ room, host, clockOffset, onChange });
  latest.current = { room, host, clockOffset, onChange };
  const suppressUntil = useRef(0), lastHostTime = useRef(0), ready = useRef(false);
  const [error, setError] = useState("");
  const [needsStart, setNeedsStart] = useState(false);
  const controls: PlayerControls = {
    position: () => youtube.current?.getCurrentTime() ?? video.current?.currentTime ?? 0,
    play: () => { suppressUntil.current = Date.now() + 900; if (youtube.current) youtube.current.playVideo(); else void video.current?.play().catch(() => setNeedsStart(true)); },
    pause: () => { suppressUntil.current = Date.now() + 900; youtube.current?.pauseVideo(); video.current?.pause(); },
    seek: (position) => { suppressUntil.current = Date.now() + 900; if (youtube.current) youtube.current.seekTo(position, true); else if (video.current) video.current.currentTime = position; },
  };
  useImperativeHandle(ref, () => controls);
  function publish() {
    const current = latest.current;
    if (!current.host || Date.now() < suppressUntil.current || !ready.current) return;
    const playing = youtube.current ? youtube.current.getPlayerState() === 1 : !video.current?.paused;
    current.onChange(controls.position(), playing);
  }
  function reconcile() {
    const current = latest.current;
    if (!ready.current) return;
    const target = playbackPosition(current.room, Date.now() + current.clockOffset);
    const actual = youtube.current?.getCurrentTime() ?? video.current?.currentTime ?? 0;
    const playing = youtube.current ? youtube.current.getPlayerState() === 1 : !video.current?.paused;
    const drift = Math.abs(actual - target) > (current.host ? 3 : 1.5);
    if (drift || playing !== current.room.playing) {
      suppressUntil.current = Date.now() + 900;
      if (drift) { if (youtube.current) youtube.current.seekTo(target, true); else if (video.current && video.current.readyState) video.current.currentTime = target; }
      if (current.room.playing && !playing) {
        if (youtube.current) youtube.current.playVideo();
        else void video.current?.play().catch(() => setNeedsStart(true));
      } else if (!current.room.playing && playing) { youtube.current?.pauseVideo(); video.current?.pause(); }
    }
  }
  useEffect(() => {
    let cancelled = false;
    ready.current = false; setError(""); setNeedsStart(false);
    if (room.source_kind === "youtube" && mount.current) {
      const target = document.createElement("div"); mount.current.replaceChildren(target);
      void youtubeAPI().then((api) => {
        if (cancelled) return;
        youtube.current = new api.Player(target, {
          videoId: parseSource(room.source_url).videoId,
          width: "100%", height: "100%",
          playerVars: { playsinline: 1, origin: window.location.origin },
          events: {
            onReady: () => { if (!cancelled) { ready.current = true; reconcile(); } },
            onStateChange: (event: { data: number }) => {
              if ([0, 1, 2].includes(event.data)) publish();
            },
            onAutoplayBlocked: () => setNeedsStart(true),
            onError: () => setError("Video oynatılamadı. Video sahibi gömmeyi engellemiş veya video erişime kapalı olabilir."),
          },
        });
      }).catch((e) => { if (!cancelled) setError((e as Error).message); });
    }
    const timer = window.setInterval(() => {
      if (!latest.current.host) reconcile();
      else if (ready.current && youtube.current) {
        const time = youtube.current.getCurrentTime();
        if (Math.abs(time - lastHostTime.current) > 2.5 && Date.now() > suppressUntil.current) publish();
        lastHostTime.current = time;
      }
    }, 600);
    return () => { cancelled = true; ready.current = false; clearInterval(timer); youtube.current?.destroy(); youtube.current = null; };
  }, [room.source_url, room.source_kind]); // A source owns exactly one native or YouTube player.
  useEffect(() => { reconcile(); }, [room.revision]);
  return <div className={styles.stack}>
    <div className={styles.stage}>
      {room.source_kind === "youtube" ? <div ref={mount} /> : <video ref={video} src={room.source_url} controls playsInline preload="metadata"
        onLoadedMetadata={() => { ready.current = true; reconcile(); }}
        onPlay={publish} onPause={publish} onSeeked={publish} onEnded={publish}
        onError={() => setError("Video yüklenemedi. Doğrudan oynatılabilen bir MP4/WebM bağlantısı kullan veya sekmeni paylaş.")} />}
    </div>
    {needsStart ? <Button type="button" onClick={() => { setNeedsStart(false); controls.play(); }}>İzlemeyi başlat</Button> : null}
    {error ? <Notice tone="warning" title={error} /> : null}
  </div>;
});
export default SyncedPlayer;
